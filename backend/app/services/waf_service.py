import time
from datetime import datetime
import uuid
import hmac
import hashlib
import json
import asyncio
from typing import List, Dict, Any, Set
from fastapi import WebSocket
from ..config import settings
from ..models.waf_event import WafEvent, WafStats


class WafService:
    def __init__(self):
        self.events: List[WafEvent] = []
        self.max_events = 250
        self.active_websockets: Set[WebSocket] = set()
        
        # IP request rate tracker: ip -> list of timestamps
        self.ip_request_history: Dict[str, List[float]] = {}
        # Failed login tracker: ip -> count
        self.ip_auth_failures: Dict[str, int] = {}
        
        # Aggregated counters
        self.total_requests = 0
        self.allowed_count = 0
        self.blocked_count = 0
        self.challenged_count = 0
        self.human_count = 0
        self.bot_count = 0
        self.rule_counts: Dict[str, int] = {}
        self.bot_category_counts: Dict[str, int] = {}

    async def connect_ws(self, websocket: WebSocket):
        await websocket.accept()
        self.active_websockets.add(websocket)
        # Send initial snapshot immediately
        snapshot = self.get_stats().model_dump()
        await websocket.send_json({"type": "SNAPSHOT", "data": snapshot})

    def disconnect_ws(self, websocket: WebSocket):
        self.active_websockets.discard(websocket)

    async def broadcast_event(self, event: WafEvent):
        self.events.append(event)
        if len(self.events) > self.max_events:
            self.events.pop(0)

        # Update stats
        self.total_requests += 1
        if event.waf_action == "ALLOW":
            self.allowed_count += 1
        elif event.waf_action == "BLOCK":
            self.blocked_count += 1
        elif event.waf_action == "CHALLENGE":
            self.challenged_count += 1

        if event.bot_category == "Legitimate Human":
            self.human_count += 1
        else:
            self.bot_count += 1

        self.rule_counts[event.rule_name] = self.rule_counts.get(event.rule_name, 0) + 1
        self.bot_category_counts[event.bot_category] = self.bot_category_counts.get(event.bot_category, 0) + 1

        # Broadcast via WebSockets
        payload = {
            "type": "NEW_EVENT",
            "event": event.model_dump(),
            "stats": self.get_summary_stats()
        }
        dead_connections = set()
        for ws in self.active_websockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead_connections.add(ws)
        self.active_websockets.difference_update(dead_connections)

    def get_summary_stats(self) -> Dict[str, Any]:
        return {
            "total_requests": self.total_requests,
            "allowed_count": self.allowed_count,
            "blocked_count": self.blocked_count,
            "challenged_count": self.challenged_count,
            "human_count": self.human_count,
            "bot_count": self.bot_count,
            "top_rules": dict(sorted(self.rule_counts.items(), key=lambda item: item[1], reverse=True)[:6]),
            "bot_breakdown": self.bot_category_counts
        }

    def get_stats(self) -> WafStats:
        return WafStats(
            total_requests=self.total_requests,
            allowed_count=self.allowed_count,
            blocked_count=self.blocked_count,
            challenged_count=self.challenged_count,
            human_count=self.human_count,
            bot_count=self.bot_count,
            top_rules=dict(sorted(self.rule_counts.items(), key=lambda item: item[1], reverse=True)[:8]),
            bot_breakdown=self.bot_category_counts,
            recent_events=list(reversed(self.events[-30:]))
        )

    def generate_token(self, client_ip: str, client_telemetry: Dict[str, Any] = None) -> str:
        """
        Creates a signed AWS WAF token simulating x-amzn-waf-action-token
        Format: waf_<uuid>.<timestamp>.<hmac_signature>
        """
        now = int(time.time())
        token_id = str(uuid.uuid4())[:8]
        telemetry_hash = hashlib.md5(json.dumps(client_telemetry or {}, sort_keys=True).encode()).hexdigest()[:6]
        payload = f"{token_id}:{now}:{client_ip}:{telemetry_hash}"
        signature = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:12]
        return f"waf_tok_{payload}_{signature}"

    def verify_token(self, token: str, client_ip: str) -> tuple[bool, str, str]:
        """
        Verifies token validity, expiration, and tampering.
        Returns: (is_valid, token_status, reason)
        """
        if not token:
            return False, "MISSING", "No AWS WAF action token provided"

        if not token.startswith("waf_tok_"):
            # Check if it might be an external AWS real token or invalid format
            return False, "TAMPERED", "Invalid token signature format"

        try:
            parts = token.replace("waf_tok_", "").split("_")
            if len(parts) != 2:
                return False, "TAMPERED", "Malformed token structure"

            payload, sig = parts[0], parts[1]
            token_id, ts_str, orig_ip, _ = payload.split(":")
            timestamp = int(ts_str)

            # Check expiration (15 minutes)
            if time.time() - timestamp > 900:
                return False, "EXPIRED", "Token expired (TTL 900s exceeded)"

            # Verify signature
            expected_sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:12]
            if not hmac.compare_digest(sig, expected_sig):
                return False, "TAMPERED", "Cryptographic signature verification failed"

            return True, "VALID", "Token valid and verified"
        except Exception as e:
            return False, "TAMPERED", f"Corrupt token: {str(e)}"

    def evaluate_request(
        self,
        method: str,
        path: str,
        client_ip: str,
        user_agent: str,
        token: str = None,
        custom_headers: Dict[str, str] = None
    ) -> WafEvent:
        """
        Core AWS WAF Bot Control Rule Evaluation Logic
        Implements AWSManagedRulesBotControlRuleSet rules:
        - Common Bot Evaluation (User-agent, automation signals)
        - Targeted Bot Evaluation (Token presence, freshness, challenge state)
        - Endpoint-specific protection (Scraping on /products, Scalping on /checkout, Stuffing on /auth)
        """
        now_ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        event_id = str(uuid.uuid4())[:8]
        ua_lower = (user_agent or "").lower()
        headers = custom_headers or {}

        # Track IP request frequency
        now = time.time()
        req_times = self.ip_request_history.get(client_ip, [])
        # Keep requests within last 5 seconds
        req_times = [t for t in req_times if now - t < 5.0]
        req_times.append(now)
        self.ip_request_history[client_ip] = req_times
        req_burst = len(req_times)

        # 1. Inspect User-Agent for known automation tools (SignalNonBrowserUserAgent)
        known_bad_agents = ["python", "curl", "wget", "scrapy", "httpclient", "postman", "aiohttp", "headless", "puppeteer", "selenium"]
        is_automated_agent = any(k in ua_lower for k in known_bad_agents)

        # 2. Check for explicit bot simulator headers or parameters
        sim_category = headers.get("x-simulated-bot-type")

        # 3. Verify AWS WAF Token
        is_token_valid, token_status, token_reason = self.verify_token(token, client_ip)

        # EVALUATION DECISION TREE:

        # Scenario A: Explicit Scraper Bot or rapid burst scraping on /api/products
        if sim_category == "scraper" or (is_automated_agent and "/products" in path) or (req_burst > settings.RATE_LIMIT_SCRAPER_BURST and not is_token_valid and "/products" in path):
            return WafEvent(
                id=event_id,
                timestamp=now_ts,
                client_ip=client_ip,
                method=method,
                path=path,
                user_agent=user_agent,
                waf_action="BLOCK",
                rule_name="AWSManagedRulesBotControlRuleSet-VolumetricScraper",
                bot_category="Scraper",
                token_status=token_status,
                token_id=token[:12] if token else None,
                telemetry_score=0.12,
                status_code=403,
                details=f"Blocked content scraping attempt. Burst: {req_burst} req/5s without valid telemetry token."
            )

        # Scenario B: High-value Scalper / Sneaker Bot on /api/checkout
        if sim_category == "scalper" or ("/checkout" in path and not is_token_valid and is_automated_agent):
            return WafEvent(
                id=event_id,
                timestamp=now_ts,
                client_ip=client_ip,
                method=method,
                path=path,
                user_agent=user_agent,
                waf_action="BLOCK",
                rule_name="AWSManagedRulesBotControlRuleSet-TargetedScalper",
                bot_category="Scalper",
                token_status=token_status,
                token_id=token[:12] if token else None,
                telemetry_score=0.08,
                status_code=403,
                details="Blocked automated inventory scalper attempting sub-second checkout."
            )

        # Scenario C: Suspicious Checkout without token (Needs CAPTCHA Challenge!)
        if "/checkout" in path and not is_token_valid:
            return WafEvent(
                id=event_id,
                timestamp=now_ts,
                client_ip=client_ip,
                method=method,
                path=path,
                user_agent=user_agent,
                waf_action="CHALLENGE",
                rule_name="AWSManagedRulesBotControlRuleSet-CheckoutChallenge",
                bot_category="Scalper",
                token_status="CHALLENGED",
                token_id=None,
                telemetry_score=0.45,
                status_code=405,  # AWS WAF standard challenge status
                details="Sensitive checkout endpoint invoked without verified token. Issuing AWS WAF CAPTCHA Challenge."
            )

        # Scenario D: Credential Stuffing on /api/auth
        if sim_category == "credential_stuffing" or ("/auth" in path and not is_token_valid and (is_automated_agent or req_burst > 3)):
            return WafEvent(
                id=event_id,
                timestamp=now_ts,
                client_ip=client_ip,
                method=method,
                path=path,
                user_agent=user_agent,
                waf_action="BLOCK",
                rule_name="AWSManagedRulesATPRuleSet-CredentialStuffing",
                bot_category="Credential Stuffer",
                token_status=token_status,
                token_id=token[:12] if token else None,
                telemetry_score=0.05,
                status_code=403,
                details="Blocked repeated credential stuffing attempt against authentication."
            )

        # Scenario E: Known Headless User-Agent without valid token
        if is_automated_agent and not is_token_valid:
            return WafEvent(
                id=event_id,
                timestamp=now_ts,
                client_ip=client_ip,
                method=method,
                path=path,
                user_agent=user_agent,
                waf_action="BLOCK",
                rule_name="SignalNonBrowserUserAgent",
                bot_category="Headless Bot",
                token_status=token_status,
                token_id=None,
                telemetry_score=0.15,
                status_code=403,
                details=f"Automated client signature detected in User-Agent ({user_agent[:35]})."
            )

        # Scenario F: Missing token on critical POST/PUT mutations -> Challenge
        if method in ["POST", "PUT", "DELETE"] and not is_token_valid and not path.startswith("/api/monitoring"):
            return WafEvent(
                id=event_id,
                timestamp=now_ts,
                client_ip=client_ip,
                method=method,
                path=path,
                user_agent=user_agent,
                waf_action="CHALLENGE",
                rule_name="AWSManagedRulesBotControlRuleSet-TokenMissing",
                bot_category="Automated Headless",
                token_status="MISSING",
                token_id=None,
                telemetry_score=0.40,
                status_code=405,
                details="Action requires AWS WAF token. Client SDK must acquire challenge token."
            )

        # Scenario G: Legitimate Human with Verified Token OR Standard Read Traffic
        return WafEvent(
            id=event_id,
            timestamp=now_ts,
            client_ip=client_ip,
            method=method,
            path=path,
            user_agent=user_agent,
            waf_action="ALLOW",
            rule_name="AWSManagedRulesBotControlRuleSet-VerifiedHuman" if is_token_valid else "DefaultAllowEvaluation",
            bot_category="Legitimate Human",
            token_status=token_status if is_token_valid else "UNPROTECTED_ALLOW",
            token_id=token[:14] if token else None,
            telemetry_score=0.98 if is_token_valid else 0.85,
            status_code=200,
            details="Request verified with AWS WAF token and legitimate browser telemetry." if is_token_valid else "Permitted standard read traffic."
        )

    def reset(self):
        self.events.clear()
        self.total_requests = 0
        self.allowed_count = 0
        self.blocked_count = 0
        self.challenged_count = 0
        self.human_count = 0
        self.bot_count = 0
        self.rule_counts.clear()
        self.bot_category_counts.clear()
        self.ip_request_history.clear()
        self.ip_auth_failures.clear()

waf_service = WafService()
