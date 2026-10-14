import asyncio
import time
import random
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, Response, HTTPException
from typing import Dict, Any
from ..services.waf_service import waf_service
from ..models.waf_event import AttackSimulationRequest, WafStats
from ..database import db_reset_inventory, db_get_recent_waf_events

router = APIRouter(tags=["monitoring"])

@router.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await waf_service.connect_ws(websocket)
    try:
        while True:
            # Keep connection open; receive heartbeats or ping
            data = await websocket.receive_text()
            if data == "PING":
                await websocket.send_text("PONG")
    except WebSocketDisconnect:
        waf_service.disconnect_ws(websocket)
    except Exception:
        waf_service.disconnect_ws(websocket)

@router.get("/api/monitoring/stats", response_model=WafStats)
async def get_stats(limit: int = 100):
    return waf_service.get_stats(limit=limit)

@router.get("/api/monitoring/events")
async def get_events(limit: int = 250):
    db_events = db_get_recent_waf_events(limit)
    if db_events:
        return {"events": db_events}
    return {"events": [e.model_dump() for e in reversed(waf_service.events[-limit:])]}

@router.post("/api/monitoring/clear")
async def clear_stats():
    waf_service.reset()
    db_reset_inventory()
    return {"status": "cleared"}

@router.post("/api/waf/acquire-token")
async def acquire_waf_token(request: Request):
    """
    Simulates the AWS WAF JavaScript SDK client telemetry handshake.
    The SDK collects browser telemetry (canvas, screen dimensions, WebGL, user interaction),
    sends it, and receives the signed x-amzn-waf-action-token.
    """
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    client_ip = request.client.host if request.client else "127.0.0.1"
    token = waf_service.generate_token(client_ip, body.get("telemetry", {}))
    return {
        "status": "success",
        "token": token,
        "token_domain": "waf.nexuscommerce.internal",
        "ttl_seconds": 900
    }

@router.post("/api/waf/solve-challenge")
async def solve_challenge(request: Request):
    """
    Endpoint called when a client receives a 405 Challenge and renders the
    AWS WAF CAPTCHA modal. Upon successful puzzle solve, this verifies and
    returns a refreshed valid token.
    """
    body = await request.json()
    solution = body.get("solution")
    # Verify puzzle solution
    if not solution or solution != "valid_human_verification":
        raise HTTPException(status_code=400, detail="CAPTCHA puzzle validation failed")

    client_ip = request.client.host if request.client else "127.0.0.1"
    refreshed_token = waf_service.generate_token(client_ip, {"challenge_solved": True, "ts": time.time()})
    return {
        "status": "CHALLENGE_SOLVED",
        "token": refreshed_token,
        "message": "AWS WAF Challenge successfully cleared. Request can proceed."
    }

@router.post("/api/monitoring/simulate-attack")
async def simulate_attack(sim_req: AttackSimulationRequest):
    """
    Runs background attack simulation tasks to demonstrate Bot Control in action!
    Types:
    - 'scraper': Rapid-fire catalog scraping without tokens (Triggers VolumetricScraper BLOCK)
    - 'scalper': Automated flash-sale checkout attempts with fake bots (Triggers TargetedScalper BLOCK/CHALLENGE)
    - 'credential_stuffing': Brute-force dictionary attack on login (Triggers CredentialStuffing BLOCK)
    - 'human_with_sdk': Legitimate human shopper acquiring WAF token via JS SDK (Triggers VerifiedHuman ALLOW)
    """
    async def run_simulation():
        async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
            count = sim_req.request_count
            
            if sim_req.attack_type == "scraper":
                user_agents = [
                    "Scrapy/2.11.0 (+https://scrapy.org)",
                    "Python-requests/2.31.0",
                    "curl/7.88.1",
                    "AhrefsBot/7.0 (PriceScraper; +http://ahrefs.com/robot/)"
                ]
                for i in range(count):
                    ua = random.choice(user_agents)
                    ip = f"198.51.100.{random.randint(10, 80)}"
                    await client.get(
                        f"/api/products?scrape_page={i+1}",
                        headers={
                            "User-Agent": ua,
                            "X-Forwarded-For": ip,
                            "x-simulated-bot-type": "scraper"
                        }
                    )
                    await asyncio.sleep(sim_req.delay_ms / 1000.0)

            elif sim_req.attack_type == "scalper":
                user_agents = [
                    "SniperBot/4.2 (RapidCheckoutEngine; Puppeteer)",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 HeadlessChrome/120.0.0.0",
                    "NikeBot-SupremeSniper/3.1"
                ]
                for i in range(count):
                    ua = random.choice(user_agents)
                    ip = f"203.0.113.{random.randint(10, 95)}"
                    await client.post(
                        "/api/checkout",
                        json={
                            "product_id": "prod-gpu-5090",
                            "quantity": 1,
                            "shipping_address": "Automated Drop Ship Warehouse",
                            "card_last_four": "9999"
                        },
                        headers={
                            "User-Agent": ua,
                            "X-Forwarded-For": ip,
                            "x-simulated-bot-type": "scalper"
                        }
                    )
                    await asyncio.sleep(sim_req.delay_ms / 1000.0)

            elif sim_req.attack_type == "credential_stuffing":
                usernames = ["admin", "root", "alex99", "shopper123", "target_vip", "buyer_pro", "customer1"]
                for i in range(count):
                    user = random.choice(usernames)
                    ip = f"192.0.2.{random.randint(5, 50)}"
                    await client.post(
                        "/api/auth/login",
                        json={"username": user, "password": f"Password{random.randint(100, 999)}!"},
                        headers={
                            "User-Agent": "python-requests/2.28.0 (CredentialStufferBot)",
                            "X-Forwarded-For": ip,
                            "x-simulated-bot-type": "credential_stuffing"
                        }
                    )
                    await asyncio.sleep(sim_req.delay_ms / 1000.0)

            elif sim_req.attack_type == "human_with_sdk":
                # First legitimate human gets token from SDK
                user_agents = [
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0"
                ]
                ip = f"172.56.{random.randint(1, 20)}.{random.randint(1, 100)}"
                token_res = await client.post(
                    "/api/waf/acquire-token",
                    json={"telemetry": {"mouseMoves": 45, "canvasFingerprint": "c9a2"}},
                    headers={"X-Forwarded-For": ip}
                )
                valid_token = token_res.json().get("token")
                ua = random.choice(user_agents)

                for i in range(count):
                    # Browse products with token
                    await client.get(
                        "/api/products",
                        headers={
                            "User-Agent": ua,
                            "X-Forwarded-For": ip,
                            "x-amzn-waf-action-token": valid_token
                        }
                    )
                    await asyncio.sleep(sim_req.delay_ms / 1000.0)

    # Spawn background task for attack simulation so response returns immediately
    asyncio.create_task(run_simulation())
    return {
        "status": "ATTACK_SIMULATION_LAUNCHED",
        "attack_type": sim_req.attack_type,
        "request_count": sim_req.request_count,
        "message": f"Launched {sim_req.attack_type} attack. Stream results live in the Monitoring Dashboard!"
    }
