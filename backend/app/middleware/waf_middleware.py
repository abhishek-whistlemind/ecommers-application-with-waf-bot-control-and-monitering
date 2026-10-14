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
            "x-simulated-bot-type": request.headers.get("x-simulated-bot-type", ""),
            "x-force-waf-action": request.headers.get("x-force-waf-action", "")
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

        # Print detailed inspection log to server terminal
        print("\n" + "─" * 72, flush=True)
        print(f"🛡️  [AWS WAF Bot Control] {method} {path} | Client IP: {client_ip}", flush=True)
        print(f"    Token Status: {event.token_status} (Present: {'YES' if token else 'NO'})", flush=True)
        print(f"    Action: {event.waf_action} | Rule: {event.rule_name} | Bot Category: {event.bot_category}", flush=True)

        # Broadcast event asynchronously to monitoring dashboard
        asyncio.create_task(waf_service.broadcast_event(event))

        # 4. Handle WAF Actions
        if event.waf_action == "BLOCK":
            print(f"    ⛔ BLOCK (403): {event.details}", flush=True)
            print("─" * 72 + "\n", flush=True)
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
                    "x-amzn-waf-action": "block",
                    "x-amzn-waf-rule": event.rule_name
                }
            )

        if event.waf_action == "CAPTCHA":
            print(f"    🧩 CAPTCHA CHALLENGE (405): Issuing AWS WAF CAPTCHA puzzle request", flush=True)
            print("─" * 72 + "\n", flush=True)
            return JSONResponse(
                status_code=405,
                content={
                    "error": "AWS WAF CAPTCHA Required",
                    "action": "CAPTCHA",
                    "challenge_type": "AWS_WAF_CAPTCHA",
                    "rule": event.rule_name,
                    "category": event.bot_category,
                    "token_status": event.token_status,
                    "reason": event.details
                },
                headers={
                    "x-amzn-waf-action": "captcha",
                    "x-amzn-waf-challenge": "true",
                    "x-amzn-waf-challenge-type": "captcha",
                    "x-amzn-waf-rule": event.rule_name
                }
            )

        if event.waf_action == "CHALLENGE":
            print(f"    ⚠️  SILENT CHALLENGE (405): Issuing AWS WAF background browser challenge", flush=True)
            print("─" * 72 + "\n", flush=True)
            return JSONResponse(
                status_code=405,  # AWS WAF Challenge code
                content={
                    "error": "AWS WAF Challenge Required",
                    "action": "CHALLENGE",
                    "challenge_type": "AWS_WAF_CHALLENGE",
                    "rule": event.rule_name,
                    "category": event.bot_category,
                    "token_status": event.token_status,
                    "reason": event.details
                },
                headers={
                    "x-amzn-waf-action": "challenge",
                    "x-amzn-waf-challenge": "true",
                    "x-amzn-waf-challenge-type": "silent",
                    "x-amzn-waf-rule": event.rule_name
                }
            )

        # ALLOW: Proceed with actual API handler
        print(f"    ✅ ALLOW (200): Request verified and allowed through to application", flush=True)
        print("─" * 72 + "\n", flush=True)
        response = await call_next(request)
        response.headers["x-amzn-waf-action"] = "allow"
        response.headers["x-amzn-waf-rule"] = event.rule_name
        return response
