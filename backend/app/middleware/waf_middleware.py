from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from ..services.waf_service import waf_service
import asyncio

class WafBotControlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        # 1. Bypass CORS preflight and monitoring/internal endpoints
        if method == "OPTIONS":
            return await call_next(request)

        bypass_prefixes = [
            "/health",
            "/ws",
            "/api/monitoring",
            "/api/waf/acquire-token",
            "/api/waf/solve-challenge",
            "/docs",
            "/openapi.json",
            "/redoc"
        ]
        if any(path.startswith(prefix) for prefix in bypass_prefixes):
            return await call_next(request)

        # 2. Extract Client IP, User-Agent, and AWS WAF action token
        client_ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "127.0.0.1")
        if "," in client_ip:
            client_ip = client_ip.split(",")[0].strip()

        user_agent = request.headers.get("user-agent", "Unknown")
        token = request.headers.get("x-amzn-waf-action-token") or request.cookies.get("aws-waf-token")

        custom_headers = {
            "x-simulated-bot-type": request.headers.get("x-simulated-bot-type", "")
        }

        # 3. Evaluate AWS WAF Bot Control rules
        event = waf_service.evaluate_request(
            method=method,
            path=path,
            client_ip=client_ip,
            user_agent=user_agent,
            token=token,
            custom_headers=custom_headers
        )

        # Broadcast event asynchronously to monitoring dashboard
        asyncio.create_task(waf_service.broadcast_event(event))

        # 4. Handle WAF Actions
        if event.waf_action == "BLOCK":
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Request Blocked by AWS WAF Bot Control",
                    "action": "BLOCK",
                    "rule": event.rule_name,
                    "category": event.bot_category,
                    "token_status": event.token_status,
                    "reason": event.details
                },
                headers={
                    "x-amzn-waf-action": "BLOCK",
                    "x-amzn-waf-rule": event.rule_name
                }
            )

        if event.waf_action == "CHALLENGE":
            return JSONResponse(
                status_code=405,  # AWS WAF Challenge code
                content={
                    "error": "AWS WAF Challenge Required",
                    "action": "CHALLENGE",
                    "rule": event.rule_name,
                    "category": event.bot_category,
                    "challenge_type": "AWS_WAF_CAPTCHA",
                    "token_status": event.token_status,
                    "reason": event.details
                },
                headers={
                    "x-amzn-waf-action": "CHALLENGE",
                    "x-amzn-waf-challenge": "true",
                    "x-amzn-waf-rule": event.rule_name
                }
            )

        # ALLOW: Proceed with actual API handler
        response = await call_next(request)
        response.headers["x-amzn-waf-action"] = "ALLOW"
        response.headers["x-amzn-waf-rule"] = event.rule_name
        return response
