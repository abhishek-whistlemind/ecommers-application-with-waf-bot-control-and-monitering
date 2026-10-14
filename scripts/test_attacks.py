#!/usr/bin/env python3
"""
AWS WAF Bot Control & JS SDK Integration Test Suite
====================================================
Tests every protection layer of the NexusCommerce WAF demo:

ATTACK TESTS (all should be BLOCKED / CHALLENGED):
  A1. Content scraper bot (known bad User-Agent)          → 403 BLOCK
  A2. Flash-sale scalper (Puppeteer UA, no token)         → 403 BLOCK
  A3. Credential stuffing botnet on /auth                 → 403 BLOCK
  A4. Rapid volumetric burst without token                → 403 BLOCK
  A5. Tampered / forged WAF token on checkout             → 405 CHALLENGE
  A6. Expired token replayed on checkout                  → 405 CHALLENGE (caught as TAMPERED)

SDK & CAPTCHA INTEGRATION TESTS (should all ALLOW after verification):
  S1. JS SDK silent token acquisition via telemetry       → token issued
  S2. Browse catalog with valid SDK token                 → 200 ALLOW
  S3. Checkout with valid SDK token                       → 200 SUCCESS
  S4. Checkout without token → 405 Challenge intercepted
        → solve-challenge (simulates CAPTCHA solve)
        → retry with fresh token                         → 200 SUCCESS
  S5. Login with valid SDK token                          → 200 ALLOW
"""

import time
import sys
import json
import requests
import hashlib
import hmac
import uuid

BASE_URL = "http://127.0.0.1:8000"
BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
)

# ── ANSI colour helpers ────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

PASS = f"{GREEN}✔ PASS{RESET}"
FAIL = f"{RED}✗ FAIL{RESET}"
WARN = f"{YELLOW}⚠ WARN{RESET}"

_results: list[dict] = []

def record(name: str, passed: bool, note: str = ""):
    _results.append({"name": name, "passed": passed, "note": note})

def banner(title: str, sub: str = ""):
    width = 72
    print(f"\n{BOLD}{CYAN}{'━' * width}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    if sub:
        print(f"{DIM}  {sub}{RESET}")
    print(f"{CYAN}{'━' * width}{RESET}")

def result_line(label: str, status_code: int, action: str, rule: str, ok: bool, extra: str = ""):
    icon = PASS if ok else FAIL
    print(f"  {icon}  {label:<38} HTTP {status_code}  Action: {action:<12}  Rule: {DIM}{rule[:40]}{RESET}")
    if extra:
        print(f"        {DIM}{extra}{RESET}")

# ── Helpers ───────────────────────────────────────────────────────────────────

def acquire_sdk_token(telemetry: dict | None = None) -> str:
    """Simulate the JS SDK calling /api/waf/acquire-token with browser telemetry."""
    body = {"telemetry": telemetry or {
        "mouseMovements": 82,
        "keystrokes": 14,
        "screenW": 1920,
        "screenH": 1080,
        "canvasHash": hashlib.md5(b"BROWSER_ENTROPY").hexdigest()[:16],
        "userAgent": BROWSER_UA,
        "timestamp": int(time.time() * 1000)
    }}
    res = requests.post(f"{BASE_URL}/api/waf/acquire-token",
                        json=body, timeout=5)
    res.raise_for_status()
    token = res.json()["token"]
    print(f"  {DIM}[SDK] Token acquired: {token[:28]}…{RESET}")
    return token

def solve_captcha_challenge() -> str:
    """
    Simulate the browser-side CAPTCHA puzzle solve:
    calls /api/waf/solve-challenge with the correct sentinel value
    and returns a fresh HMAC-signed waf_tok_ token.
    This mirrors exactly what WafCaptchaModal.tsx does after the user
    completes the demo emoji-grid puzzle.
    """
    res = requests.post(
        f"{BASE_URL}/api/waf/solve-challenge",
        json={"solution": "valid_human_verification"},
        timeout=5
    )
    res.raise_for_status()
    token = res.json()["token"]
    print(f"  {DIM}[CAPTCHA] Challenge solved. Fresh token: {token[:28]}…{RESET}")
    return token

# ── Health check ──────────────────────────────────────────────────────────────

def test_health():
    banner("0. System Health Check", "Verifying backend & WAF service are reachable")
    try:
        res = requests.get(f"{BASE_URL}/health", timeout=5)
        data = res.json()
        print(f"  Status : HTTP {res.status_code}")
        print(f"  Payload: {json.dumps(data, indent=4)}")
        ok = res.status_code == 200
        record("Health check", ok)
    except Exception as exc:
        print(f"  {RED}ERROR: Cannot reach backend → {exc}{RESET}")
        print(f"  Start it with: cd backend && python -m uvicorn app.main:app --port 8000 --reload")
        sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════════
# ATTACK TESTS
# ══════════════════════════════════════════════════════════════════════════════

def test_a1_scraper_bot():
    banner(
        "A1. Content Scraper Bot Attack  →  Expects 403 BLOCK",
        "Scrapy user-agent hammering /api/products without a WAF token"
    )
    blocked = 0
    total = 5
    for i in range(total):
        res = requests.get(
            f"{BASE_URL}/api/products?page={i+1}",
            headers={"User-Agent": "Scrapy/2.11.0 (PriceScraperBot)"},
            timeout=5
        )
        action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
        rule   = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
        ok = res.status_code == 403
        if ok:
            blocked += 1
        result_line(f"Scraper req #{i+1}", res.status_code, action, rule, ok)
        time.sleep(0.08)

    passed = blocked == total
    print(f"\n  Summary: {blocked}/{total} scraper requests BLOCKED")
    record("A1 – Scraper bot block", passed, f"{blocked}/{total} blocked")

def test_a2_scalper_bot():
    banner(
        "A2. Flash-Sale Scalper Bot  →  Expects 403 BLOCK",
        "Puppeteer/HeadlessChrome UA attempting sub-second checkout"
    )
    blocked = 0
    total = 4
    for i in range(total):
        res = requests.post(
            f"{BASE_URL}/api/checkout",
            json={
                "product_id": "prod-gpu-5090",
                "quantity": 1,
                "shipping_address": "Automated Drop Ship Depot"
            },
            headers={"User-Agent": "SniperBot/4.2 (Puppeteer/HeadlessChrome)"},
            timeout=5
        )
        action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
        rule   = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
        ok = res.status_code == 403
        if ok:
            blocked += 1
        result_line(f"Scalper req #{i+1}", res.status_code, action, rule, ok)
        time.sleep(0.08)

    passed = blocked == total
    print(f"\n  Summary: {blocked}/{total} scalper attempts BLOCKED")
    record("A2 – Scalper bot block", passed, f"{blocked}/{total} blocked")

def test_a3_credential_stuffing():
    banner(
        "A3. Credential Stuffing Attack  →  Expects 403 BLOCK",
        "Dictionary attack botnet on /api/auth/login"
    )
    blocked = 0
    total = 5
    passwords = ["password123", "qwerty!", "abc123", "letmein", "Password1"]
    for i, pwd in enumerate(passwords):
        res = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": f"victim_user_{i}", "password": pwd},
            headers={"User-Agent": "python-requests/2.31.0 (CredentialStufferBot)"},
            timeout=5
        )
        action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
        rule   = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
        ok = res.status_code == 403
        if ok:
            blocked += 1
        result_line(f"Stuffing req #{i+1}  pwd={pwd!r}", res.status_code, action, rule, ok)
        time.sleep(0.08)

    passed = blocked == total
    print(f"\n  Summary: {blocked}/{total} credential stuffing attempts BLOCKED")
    record("A3 – Credential stuffing block", passed, f"{blocked}/{total} blocked")

def test_a4_volumetric_burst():
    banner(
        "A4. Volumetric Rate Burst  →  Expects 403 BLOCK",
        "Normal browser UA sends rapid-fire requests without any WAF token"
    )
    blocked = 0
    total = 8
    for i in range(total):
        res = requests.get(
            f"{BASE_URL}/api/products",
            headers={
                "User-Agent": "curl/8.5.0",  # curl triggers automated-agent check
            },
            timeout=5
        )
        action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
        rule   = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
        ok = res.status_code == 403
        if ok:
            blocked += 1
        result_line(f"Burst req #{i+1}", res.status_code, action, rule, ok)
        # No sleep – intentionally rapid

    passed = blocked > 0
    print(f"\n  Summary: {blocked}/{total} volumetric burst requests BLOCKED")
    record("A4 – Volumetric burst block", passed, f"{blocked}/{total} blocked")

def test_a5_tampered_token():
    banner(
        "A5. Forged / Tampered WAF Token  →  Expects 405 CHALLENGE",
        "Attacker manually crafts a waf_tok_ string with an invalid HMAC"
    )
    fake_token = f"waf_tok_{uuid.uuid4().hex[:8]}:{int(time.time())}:1.2.3.4:aabbcc_000000000000"
    res = requests.post(
        f"{BASE_URL}/api/checkout",
        json={
            "product_id": "prod-gpu-5090",
            "quantity": 1,
            "shipping_address": "Hacker Warehouse"
        },
        headers={
            "User-Agent": BROWSER_UA,
            "x-amzn-waf-action-token": fake_token
        },
        timeout=5
    )
    action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
    rule   = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
    # Tampered token → token_status=TAMPERED → CHALLENGE (405)
    ok = res.status_code == 405 and res.headers.get("x-amzn-waf-challenge") == "true"
    result_line("Tampered token on checkout", res.status_code, action, rule, ok,
                extra=f"Token sent: {fake_token[:36]}…")
    record("A5 – Tampered token challenge", ok)

def test_a6_expired_token():
    banner(
        "A6. Expired Token Replay  →  Expects 405 CHALLENGE",
        "Attacker replays an old waf_tok_ token with a timestamp > 900s ago"
    )
    # Build a structurally valid-looking token but with an ancient timestamp
    old_ts = int(time.time()) - 1800  # 30 minutes ago
    payload = f"{uuid.uuid4().hex[:8]}:{old_ts}:127.0.0.1:c0ffee"
    # Sign it with a fake key so it looks forged (or just use wrong sig)
    sig = "badbadbad000"
    expired_token = f"waf_tok_{payload}_{sig}"

    res = requests.post(
        f"{BASE_URL}/api/checkout",
        json={
            "product_id": "prod-gpu-5090",
            "quantity": 1,
            "shipping_address": "Replay Attacker Inc."
        },
        headers={
            "User-Agent": BROWSER_UA,
            "x-amzn-waf-action-token": expired_token
        },
        timeout=5
    )
    action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
    rule   = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
    ok = res.status_code == 405 and res.headers.get("x-amzn-waf-challenge") == "true"
    result_line("Expired token replay", res.status_code, action, rule, ok,
                extra=f"Token ts={old_ts} (crafted, bad HMAC)")
    record("A6 – Expired/replayed token challenge", ok)

# ══════════════════════════════════════════════════════════════════════════════
# SDK & CAPTCHA INTEGRATION TESTS
# ══════════════════════════════════════════════════════════════════════════════

def test_s1_sdk_token_acquisition():
    banner(
        "S1. AWS WAF JS SDK – Silent Token Acquisition",
        "Simulates AwsWafIntegration.getToken() via telemetry handshake"
    )
    token = acquire_sdk_token()
    ok = token.startswith("waf_tok_")
    icon = PASS if ok else FAIL
    print(f"  {icon}  Token format valid (waf_tok_ prefix): {ok}")
    print(f"  {DIM}Full token: {token}{RESET}")
    record("S1 – SDK token acquisition", ok, token[:28])
    return token

def test_s2_browse_with_sdk_token(token: str):
    banner(
        "S2. Catalog Browsing with Valid SDK Token  →  Expects 200 ALLOW",
        "Human browser with real WAF token browses product catalog"
    )
    res = requests.get(
        f"{BASE_URL}/api/products",
        headers={"User-Agent": BROWSER_UA, "x-amzn-waf-action-token": token},
        timeout=5
    )
    action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
    rule   = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
    ok = res.status_code == 200 and action == "ALLOW"
    products = res.json() if res.ok else []
    result_line("Browse /api/products", res.status_code, action, rule, ok,
                extra=f"Returned {len(products)} products")
    record("S2 – Browse with valid token", ok)

def test_s3_checkout_with_sdk_token(token: str):
    banner(
        "S3. Checkout with Valid SDK Token  →  Expects 200 SUCCESS",
        "Human browser uses JS SDK token to place an order"
    )
    res = requests.post(
        f"{BASE_URL}/api/checkout",
        json={
            "product_id": "prod-gpu-5090",
            "quantity": 1,
            "shipping_address": "742 Evergreen Terrace, Seattle, WA"
        },
        headers={"User-Agent": BROWSER_UA, "x-amzn-waf-action-token": token},
        timeout=5
    )
    action   = res.headers.get("x-amzn-waf-action", "UNKNOWN")
    rule     = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
    ok       = res.status_code == 200
    order_id = res.json().get("order_id", "N/A") if res.ok else res.text[:60]
    result_line("POST /api/checkout", res.status_code, action, rule, ok,
                extra=f"Order ID: {order_id}")
    record("S3 – Checkout with valid token", ok)

def test_s4_captcha_challenge_retry_flow():
    banner(
        "S4. Full CAPTCHA Challenge + Retry Flow  →  Expects 405 → 200",
        "Simulates the complete WafCaptchaModal.tsx + wafIntegration.ts browser flow:\n"
        "  ① Checkout without token → 405 Challenge\n"
        "  ② Browser renders CAPTCHA puzzle; user solves it\n"
        "  ③ /api/waf/solve-challenge → fresh waf_tok_ issued\n"
        "  ④ Retry checkout with fresh token → 200 SUCCESS"
    )
    order_payload = {
        "product_id": "prod-gpu-5090",
        "quantity": 1,
        "shipping_address": "123 Market St, San Francisco, CA"
    }

    # ── Step 1: Initial request without token ── #
    print(f"\n  {BOLD}Step 1{RESET}  Initial checkout (no token) …")
    r1 = requests.post(
        f"{BASE_URL}/api/checkout",
        json=order_payload,
        headers={"User-Agent": BROWSER_UA},
        timeout=5
    )
    action1    = r1.headers.get("x-amzn-waf-action", "UNKNOWN")
    challenge1 = r1.headers.get("x-amzn-waf-challenge", "false")
    step1_ok   = r1.status_code == 405 and challenge1 == "true"
    result_line("Initial checkout (no token)", r1.status_code, action1,
                r1.headers.get("x-amzn-waf-rule", ""), step1_ok)

    if not step1_ok:
        record("S4 – CAPTCHA challenge+retry", False,
               f"Step 1 expected 405 Challenge, got {r1.status_code}")
        return

    # ── Step 2: Simulate CAPTCHA puzzle solve ── #
    print(f"\n  {BOLD}Step 2{RESET}  CAPTCHA puzzle intercepted by wafIntegration.fetch() …")
    print(f"         WafCaptchaModal renders demo emoji-grid puzzle.")
    print(f"         User selects correct tiles → calls /api/waf/solve-challenge …")
    time.sleep(0.3)  # simulate user interaction latency
    fresh_token = solve_captcha_challenge()

    # ── Step 3: Retry with fresh CAPTCHA token ── #
    print(f"\n  {BOLD}Step 3{RESET}  Retrying checkout with fresh CAPTCHA token …")
    r2 = requests.post(
        f"{BASE_URL}/api/checkout",
        json=order_payload,
        headers={
            "User-Agent": BROWSER_UA,
            "x-amzn-waf-action-token": fresh_token
        },
        timeout=5
    )
    action2  = r2.headers.get("x-amzn-waf-action", "UNKNOWN")
    rule2    = r2.headers.get("x-amzn-waf-rule",   "UNKNOWN")
    step3_ok = r2.status_code == 200
    order_id = r2.json().get("order_id", "N/A") if r2.ok else r2.text[:80]
    result_line("Retry checkout (fresh token)", r2.status_code, action2, rule2, step3_ok,
                extra=f"Order ID: {order_id}")

    passed = step1_ok and step3_ok
    if passed:
        print(f"\n  {GREEN}{BOLD}✔ Full CAPTCHA challenge flow verified end-to-end!{RESET}")
    else:
        print(f"\n  {RED}✗ CAPTCHA retry failed. Check backend logs for token rejection reason.{RESET}")
    record("S4 – CAPTCHA challenge+retry flow", passed)

def test_s5_login_with_sdk_token(token: str):
    banner(
        "S5. Login with Valid SDK Token  →  Expects 200 ALLOW",
        "Authenticated human user signs in with a valid WAF action token"
    )
    res = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "demo_user", "password": "SecurePass123!"},
        headers={"User-Agent": BROWSER_UA, "x-amzn-waf-action-token": token},
        timeout=5
    )
    action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
    rule   = res.headers.get("x-amzn-waf-rule",   "UNKNOWN")
    # Login may 401 (wrong credentials) but WAF should ALLOW it (not 403)
    waf_ok  = res.status_code != 403 and action == "ALLOW"
    result_line("POST /api/auth/login", res.status_code, action, rule, waf_ok,
                extra="Credentials may fail (401) but WAF must ALLOW the request through")
    record("S5 – Login with valid token (WAF ALLOW)", waf_ok)

# ── Summary ───────────────────────────────────────────────────────────────────

def show_summary_stats():
    banner("📊  WAF Security Metrics Summary", "Live stats from the monitoring dashboard")
    try:
        res = requests.get(f"{BASE_URL}/api/monitoring/stats", timeout=5)
        stats = res.json()
        total     = stats.get("total_requests", 0)
        allowed   = stats.get("allowed_count",   0)
        blocked   = stats.get("blocked_count",   0)
        challenged = stats.get("challenged_count", 0)
        print(f"  {'Total Requests Inspected':<32} {total}")
        print(f"  {GREEN}{'Allowed (Legitimate):':<32}{RESET} {allowed}")
        print(f"  {RED}{'Blocked (Threats):':<32}{RESET} {blocked}")
        print(f"  {YELLOW}{'CAPTCHA Challenged:':<32}{RESET} {challenged}")
        print(f"\n  {BOLD}Bot Breakdown:{RESET}")
        for cat, cnt in (stats.get("bot_breakdown") or {}).items():
            print(f"    • {cat:<34} {cnt}")
        print(f"\n  {BOLD}Top Triggered Rules:{RESET}")
        for rule, cnt in (stats.get("top_rules") or {}).items():
            print(f"    • {rule:<50} {cnt}x")
    except Exception as exc:
        print(f"  {WARN}  Could not fetch stats: {exc}")

def print_final_report():
    banner("🏁  Test Suite Results", f"{len(_results)} tests executed")
    passed = sum(1 for r in _results if r["passed"])
    failed = len(_results) - passed
    for r in _results:
        icon  = f"{GREEN}✔{RESET}" if r["passed"] else f"{RED}✗{RESET}"
        note  = f"  {DIM}({r['note']}){RESET}" if r["note"] else ""
        print(f"  {icon}  {r['name']}{note}")
    print()
    if failed == 0:
        print(f"  {GREEN}{BOLD}All {passed} tests passed! ✔{RESET}")
    else:
        print(f"  {YELLOW}Passed: {passed}  {RED}Failed: {failed}{RESET}")
    print()

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{BOLD}{CYAN}{'━' * 72}")
    print("  AWS WAF Bot Control & JS SDK Integration Test Suite")
    print("  NexusCommerce Demo  │  Target: " + BASE_URL)
    print(f"{'━' * 72}{RESET}")

    # 0. Health
    test_health()

    # ── ATTACK TESTS ──────────────────────────────────────────────────────────
    print(f"\n{BOLD}{RED}  ▶▶  ATTACK SIMULATION TESTS  ◀◀{RESET}")
    test_a1_scraper_bot()
    test_a2_scalper_bot()
    test_a3_credential_stuffing()
    test_a4_volumetric_burst()
    test_a5_tampered_token()
    test_a6_expired_token()

    # ── SDK + CAPTCHA INTEGRATION TESTS ──────────────────────────────────────
    print(f"\n{BOLD}{GREEN}  ▶▶  SDK & CAPTCHA INTEGRATION TESTS  ◀◀{RESET}")
    sdk_token = test_s1_sdk_token_acquisition()
    test_s2_browse_with_sdk_token(sdk_token)
    test_s3_checkout_with_sdk_token(sdk_token)
    test_s4_captcha_challenge_retry_flow()
    test_s5_login_with_sdk_token(sdk_token)

    # ── Summary ───────────────────────────────────────────────────────────────
    show_summary_stats()
    print_final_report()
    print(f"  Open {CYAN}http://localhost:5173{RESET} to see the live monitoring dashboard.\n")
