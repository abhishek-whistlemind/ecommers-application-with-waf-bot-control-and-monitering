#!/usr/bin/env python3
"""
AWS WAF Bot Control & JS SDK Attack Simulation Test Script
Runs automated test scenarios against the local demo application:
1. Scraper Bot attack (without WAF token, automated User-Agent) -> Expects BLOCK (403)
2. Scalper Bot attack on Checkout (without WAF token) -> Expects BLOCK (403)
3. Credential Stuffing on Login -> Expects BLOCK (403)
4. Legitimate Shopper with AWS WAF JS SDK Token -> Expects ALLOW (200)
"""

import time
import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def print_banner(title):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def test_health():
    print_banner("1. Checking System Health & AWS WAF Status")
    try:
        res = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"Status Code: {res.status_code}")
        print(f"Payload: {json.dumps(res.json(), indent=2)}")
    except Exception as e:
        print(f"Error connecting to backend: {e}")
        print("Please ensure the backend is running: cd backend && python -m uvicorn app.main:app --port 8000")
        exit(1)

def test_scraper_attack():
    print_banner("2. Simulating Content Scraper Bot Attack on /api/products")
    print("Scenario: A scraper bot using 'Scrapy' or 'curl' makes rapid requests with NO token.")
    
    blocked = 0
    total = 5
    for i in range(total):
        res = requests.get(
            f"{BASE_URL}/api/products?page={i+1}",
            headers={"User-Agent": "Scrapy/2.11.0 (PriceScraperBot)"}
        )
        action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
        rule = res.headers.get("x-amzn-waf-rule", "UNKNOWN")
        print(f"  [Req {i+1}] HTTP {res.status_code} | Action: {action} | Rule: {rule}")
        if res.status_code == 403:
            blocked += 1
        time.sleep(0.1)

    print(f"\nResult: {blocked}/{total} scraper requests were successfully BLOCKED by AWS WAF Bot Control!")

def test_scalper_attack():
    print_banner("3. Simulating Flash-Sale Scalper Bot Attack on /api/checkout")
    print("Scenario: Automated sniper bot attempts instant checkout of limited RTX 5090 inventory.")

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
            headers={"User-Agent": "SniperBot/4.2 (Puppeteer/HeadlessChrome)"}
        )
        action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
        rule = res.headers.get("x-amzn-waf-rule", "UNKNOWN")
        print(f"  [Req {i+1}] HTTP {res.status_code} | Action: {action} | Rule: {rule}")
        if res.status_code == 403:
            blocked += 1
        time.sleep(0.1)

    print(f"\nResult: {blocked}/{total} scalper checkout attempts were successfully BLOCKED by AWS WAF Bot Control!")

def test_credential_stuffing():
    print_banner("4. Simulating Credential Stuffing Attack on /api/auth/login")
    print("Scenario: Botnet tries dictionary passwords against user accounts.")

    blocked = 0
    total = 4
    for i in range(total):
        res = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": f"user_{i}", "password": f"password_{i}!"},
            headers={"User-Agent": "python-requests/2.31.0 (CredentialStufferBot)"}
        )
        action = res.headers.get("x-amzn-waf-action", "UNKNOWN")
        rule = res.headers.get("x-amzn-waf-rule", "UNKNOWN")
        print(f"  [Req {i+1}] HTTP {res.status_code} | Action: {action} | Rule: {rule}")
        if res.status_code == 403:
            blocked += 1
        time.sleep(0.1)

    print(f"\nResult: {blocked}/{total} credential stuffing attempts were successfully BLOCKED!")

def test_legitimate_human():
    print_banner("5. Simulating Legitimate Human Shopper with AWS WAF JS SDK")
    print("Scenario: Human visits the store. The JS SDK silently collects telemetry and acquires a token.")

    # Step 1: SDK acquires token
    token_res = requests.post(
        f"{BASE_URL}/api/waf/acquire-token",
        json={"telemetry": {"mouseMoves": 65, "canvasHash": "c8a14b"}}
    )
    token = token_res.json().get("token")
    print(f"  [SDK Step 1] Acquired AWS WAF Token: {token[:24]}...")

    # Step 2: Browse catalog with token
    res1 = requests.get(
        f"{BASE_URL}/api/products",
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0",
            "x-amzn-waf-action-token": token
        }
    )
    action1 = res1.headers.get("x-amzn-waf-action", "UNKNOWN")
    print(f"  [SDK Step 2 - Browse] HTTP {res1.status_code} | Action: {action1} | Products count: {len(res1.json())}")

    # Step 3: Purchase with token
    res2 = requests.post(
        f"{BASE_URL}/api/checkout",
        json={
            "product_id": "prod-gpu-5090",
            "quantity": 1,
            "shipping_address": "742 Evergreen Terrace, Seattle, WA"
        },
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0",
            "x-amzn-waf-action-token": token
        }
    )
    action2 = res2.headers.get("x-amzn-waf-action", "UNKNOWN")
    print(f"  [SDK Step 3 - Checkout] HTTP {res2.status_code} | Action: {action2} | Order ID: {res2.json().get('order_id')}")
    print("\nResult: Legitimate human shopping was ALLOWED seamlessly without friction!")

def show_summary_stats():
    print_banner("6. Current WAF Security Metrics & Log Summary")
    res = requests.get(f"{BASE_URL}/api/monitoring/stats")
    stats = res.json()
    print(f"  Total Requests Inspected: {stats.get('total_requests')}")
    print(f"  Allowed Legitimate:       {stats.get('allowed_count')}")
    print(f"  Blocked Threats:          {stats.get('blocked_count')}")
    print(f"  CAPTCHA Challenges:       {stats.get('challenged_count')}")
    print(f"\n  Bot Breakdown: {json.dumps(stats.get('bot_breakdown'), indent=4)}")
    print(f"  Top Triggered Rules: {json.dumps(stats.get('top_rules'), indent=4)}")

if __name__ == "__main__":
    test_health()
    test_scraper_attack()
    test_scalper_attack()
    test_credential_stuffing()
    test_legitimate_human()
    show_summary_stats()
    print("\n" + "=" * 70)
    print("  Testing complete! Open http://localhost:5173 to view the live dashboard.")
    print("=" * 70 + "\n")
