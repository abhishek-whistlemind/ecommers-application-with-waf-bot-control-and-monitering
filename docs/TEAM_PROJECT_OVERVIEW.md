# NexusCommerce: Team Architecture & Integration Guide
**AWS WAF Bot Control (Targeted Tier) & JavaScript Application Integration SDK**

---

## 1. Executive Summary & Project Purpose

### 1.1 What is NexusCommerce?
**NexusCommerce** is an enterprise-grade reference implementation and demonstration platform that showcases how to protect modern web applications against sophisticated bot traffic using **AWS WAF Bot Control (Targeted Tier)** and the **AWS WAF JavaScript Application Integration SDK**.

It combines:
1. **A Real-World E-Commerce Storefront**: Flash-sale product catalog (RTX 5090 GPUs, limited sneakers), shopping cart, customer authentication, and checkout workflow.
2. **AWS WAF Client-Side JavaScript SDK Integration**: Invisible browser telemetry collection, dynamic cryptographic token acquisition (`x-amzn-waf-action-token`), automatic request decoration, and 405 Challenge/CAPTCHA interception.
3. **AWS WAF Bot Control Backend & Enforcement Middleware**: Server-side token validation, behavioral rule evaluation, rate tracking, and enforcement (`ALLOW`, `CHALLENGE`, `CAPTCHA`, `BLOCK`).
4. **Real-Time Security Operations Center (SOC) Dashboard**: Live WebSocket streaming of inspected traffic, threat KPIs, rule match breakdown, and an interactive attack simulation engine.
5. **Production Infrastructure as Code (IaC)**: Turnkey AWS CloudFormation template for deploying AWS WAFv2 with Targeted Bot Control and Account Takeover Prevention (ATP).

---

### 1.2 The Problem: Why Traditional WAFs Fail Against Modern Bots

Traditional Layer-7 firewalls and basic rate limiters rely on static indicators:
- **IP Reputation & Rate Limits**: Easily circumvented by residential proxy networks rotating tens of thousands of clean IP addresses.
- **User-Agent Filtering**: Trivial for scrapers and automated scripts to spoof (`Mozilla/5.0...`).
- **Standard CAPTCHAs**: Frustrate all users universally and can be solved by automated CAPTCHA-solving farms.

**Modern threat vectors targeting e-commerce:**
- **Volumetric Scraping**: Competitors extracting real-time pricing and inventory.
- **Targeted Scalping & Snipe Bots**: Automated scripts buying out limited flash-sale stock within milliseconds of release, locking out human buyers.
- **Credential Stuffing & Account Takeover (ATO)**: Automated credential tests against user sign-in endpoints using leaked username/password combos.

---

### 1.3 The Solution: AWS WAF Targeted Bot Control & JS SDK

AWS WAF Targeted Tier introduces **client-side passive telemetry and dynamic challenge tokens**:
1. The **AWS WAF JavaScript SDK** runs in the user's browser, passively collecting device entropy (canvas fingerprinting, WebGL context, screen characteristics, mouse trajectory jitter, keystroke entropy).
2. The SDK contacts the AWS WAF Token Domain to exchange this telemetry for a cryptographically signed, short-lived **WAF Action Token** (`x-amzn-waf-action-token`).
3. Outgoing API calls include this token.
4. AWS WAF inspects the token:
   - **Legitimate Human**: Request is permitted with zero user friction (`ALLOW 200`).
   - **Missing Token / Suspicious Telemetry**: WAF issues a silent challenge or interactive CAPTCHA puzzle (`CHALLENGE 405`).
   - **Known Headless Tool / High-Velocity Scalper**: Immediately blocked at the edge (`BLOCK 403`).

---

## 2. High-Level Architecture & Integration

```
+──────────────────────────────────────────────────────────────────────────────────────────+
|                                    CLIENT BROWSER                                        |
|                                                                                          |
|  [ Storefront UI ] ────► [ AwsWafIntegration.fetch() Wrapper ]                           |
|         │                                │                                               |
|         │ (User interactions)            ▼                                               |
|         ▼                       Attached Headers:                                        |
|  [ Passive Telemetry ]  ──►  x-amzn-waf-action-token: waf_tok_...                        |
|  - Canvas / WebGL Hash                   │                                               |
|  - Mouse / Keystroke jitter              │                                               |
|  - Screen entropy                        ▼                                               |
+──────────────────────────────────────────┼───────────────────────────────────────────────+
                                           │ HTTP Requests
                                           ▼
+──────────────────────────────────────────────────────────────────────────────────────────+
|                    AWS WAF / ENFORCEMENT LAYER (Middleware / Edge)                       |
|                                                                                          |
|  Inspects: Token Presence, Signature Integrity, TTL (900s), Rate Burst, User-Agent       |
|                                                                                          |
|  [ Decision Matrix ]                                                                     |
|     ├── Valid Token + Human Entropy ───────────────► ALLOW (200 OK) ───► FastAPI Handlers|
|     ├── Missing Token on Sensitive Mutation (/checkout)► CHALLENGE/CAPTCHA (405 Status)  |
|     └── Headless Bot / High-burst Scraper / ATO ───► BLOCK (403 Forbidden)               |
+──────────────────────────────────────────┬───────────────────────────────────────────────+
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ Internal Event Audit                │ Live WebSocket
                        ▼                                     ▼
+──────────────────────────────────────+    +──────────────────────────────────────────────+
|          FASTAPI BACKEND             |    |          SECURITY SOC DASHBOARD              |
|                                      |    |                                              |
|  - /api/products   (Catalog)         |    |  - Real-Time Traffic Feed (ALLOW/BLOCK/CHAL) |
|  - /api/checkout   (Protected Buy)   |    |  - Threat KPIs (% Blocked, Active Bots)      |
|  - /api/auth       (ATP Protection)  |    |  - Rule Breakdown & Category Distribution    |
|  - SQLite DB       (nexus_commerce)  |    |  - Attack Simulation Controller              |
+──────────────────────────────────────+    +──────────────────────────────────────────────+
```

---

## 3. Subsystem Breakdown & How Things Work

### 3.1 Frontend (`/frontend`)
- **Technology**: React 18, TypeScript, Vite, TailwindCSS, Lucide Icons.
- **Entry Point**: `frontend/src/main.tsx` and `frontend/index.html`.
- **Key Modules**:
  1. `frontend/src/services/wafIntegration.ts`:
     - Emulates or attaches to the official `window.AwsWafIntegration` SDK.
     - Collects browser entropy: Canvas 2D hash, WebGL vendor/renderer strings, screen depth, mouse movement counts, keystroke counts.
     - Implements `AwsWafIntegration.fetch()`: A transparent wrapper around native `window.fetch` that automatically injects `x-amzn-waf-action-token` into every outgoing HTTP request.
     - **Challenge Interceptor**: Intercepts HTTP `405 Challenge` responses from the backend. When triggered, it presents the `WafCaptchaModal` to the user, collects proof-of-work, acquires a fresh token, and automatically replays the original request.
  2. `frontend/src/components/WafCaptchaModal.tsx`:
     - Renders the interactive proof-of-work CAPTCHA challenge slider.
     - Once completed, informs `wafIntegration.ts` to proceed.
  3. `frontend/src/components/WafTelemetryModal.tsx`:
     - Visual inspector allowing developers to see the exact telemetry payload collected by the SDK, current token string, expiration countdown, and client fingerprint.
  4. `frontend/src/pages/MonitoringDashboard.tsx`:
     - Full SOC interface connected via WebSockets (`/ws/telemetry`).
     - Live request logs with color-coded status badges (`ALLOW`, `BLOCK`, `CAPTCHA`, `CHALLENGE`).
     - Metric cards: Total Requests, Mitigation Ratio, Detected Bots, Human Traffic.
     - Rule execution analytics and interactive **Threat Attack Simulator**.

---

### 3.2 Backend (`/backend`)
- **Technology**: Python 3.10+, FastAPI, Starlette, Uvicorn, SQLite.
- **Entry Point**: `backend/app/main.py`.
- **Key Modules**:
  1. `backend/app/middleware/waf_middleware.py`:
     - Intercepts all incoming HTTP traffic before reaching endpoint handlers.
     - Extracts Client IP (respecting `x-forwarded-for`), User-Agent, and `x-amzn-waf-action-token`.
     - Passes request details to `waf_service.evaluate_request(...)`.
     - Returns formatted responses:
       - `403 Forbidden` if action is `BLOCK`.
       - `405 Method Not Allowed` with `x-amzn-waf-challenge: true` if action is `CHALLENGE` or `CAPTCHA`.
       - Proceeds to API handler if action is `ALLOW`.
     - Asynchronously broadcasts every evaluation event to connected SOC WebSocket clients and logs them to the terminal.
  2. `backend/app/services/waf_service.py`:
     - Contains the core evaluation logic mirroring AWS WAF Managed Rule Sets.
     - **Token Verification**: Checks HMAC-SHA256 signature, ensures 15-minute TTL has not expired, and verifies client IP binding.
     - **Rate Tracking**: Tracks per-IP request frequency within a 5-second sliding window.
     - **Rule Logic Evaluated**:
       - `AWSManagedRulesBotControlRuleSet-VolumetricScraper`: Blocks high-frequency burst scraping on catalog endpoints without tokens.
       - `AWSManagedRulesBotControlRuleSet-TargetedScalper`: Blocks automated fast-checkout scripts on `/api/checkout`.
       - `AWSManagedRulesBotControlRuleSet-CheckoutChallenge`: Challenges checkout requests lacking valid telemetry tokens.
       - `AWSManagedRulesATPRuleSet-CredentialStuffing`: Blocks repeated failed authentication attempts and automated tools.
       - `AWSManagedRulesATPRuleSet-LoginCaptchaChallenge`: Requires interactive CAPTCHA for unverified login attempts.
       - `SignalNonBrowserUserAgent`: Blocks non-browser agents (cURL, Scrapy, Python-requests, Puppeteer, Selenium).
       - `AWSManagedRulesBotControlRuleSet-VerifiedHuman`: Allows requests bearing valid, non-expired tokens.
  3. `backend/app/routers/`:
     - `products.py`: Returns flash-sale and regular e-commerce inventory.
     - `checkout.py`: Handles high-value order placement, verifies stock.
     - `auth.py`: User authentication and registration.
     - `monitoring.py`: REST endpoints for SOC stats, event history, reset, and the `/api/monitoring/simulate-attack` endpoint.
  4. `backend/app/database.py`:
     - SQLite database (`nexus_commerce.db`) providing persistence for WAF event history, catalog items, and mock orders.

---

### 3.3 Infrastructure as Code (`/infrastructure`)
- `infrastructure/aws-waf-bot-control.yaml`:
  - Production-ready AWS CloudFormation template.
  - Provisions an `AWS::WAFv2::WebACL` associated with CloudFront or an Application Load Balancer (ALB).
  - Configures:
    - `TokenDomains`: Domain names allowed to issue and consume tokens.
    - `AWSManagedRulesBotControlRuleSet` with `InspectionLevel: TARGETED`.
    - `AWSManagedRulesATPRuleSet` with request inspection configured for `/api/auth/login`.
    - IP Rate Limiting rule (`RateLimitGeneralScrapers`) capping unverified burst rates at 300 requests / 5 minutes.

---

### 3.4 Attack Simulation Engine (`/scripts` & In-App UI)
NexusCommerce includes built-in automated attack scripts to demonstrate WAF responses:
- **`scripts/test_attacks.py`**: Multi-scenario CLI attack runner using multi-threading to fire scrapers, scalpers, and credential stuffers.
- **In-App SOC Simulator**: Lets any team member or stakeholder click one button in the UI to trigger realistic attacks and observe the live defense telemetry in real time.

---

## 4. End-to-End Request & Token Lifecycles

### Flow 1: Legitimate Human Request (Zero Friction)
1. User loads the website.
2. The AWS WAF JS SDK initializes and passively collects telemetry (mouse movement, canvas render, screen resolution).
3. SDK requests a signed token from the token endpoint (`waf_tok_...`).
4. User clicks "Buy Now" on the RTX 5090 GPU.
5. `AwsWafIntegration.fetch()` intercepts the call and adds `x-amzn-waf-action-token` to the request headers.
6. Backend WAF Middleware validates the cryptographic signature and timestamp (< 15 mins).
7. WAF Decision: **ALLOW (200)** under `AWSManagedRulesBotControlRuleSet-VerifiedHuman`.
8. Order is processed successfully. Event appears in green on the SOC Dashboard.

---

### Flow 2: Checkout Challenge Flow (Silent Challenge / CAPTCHA)
1. User (or script) attempts to call `POST /api/checkout` directly without a valid token (e.g. token expired, cleared, or bypassed).
2. Backend WAF Middleware inspects request, detects missing token on a protected high-value endpoint.
3. WAF Decision: **CHALLENGE (405)** under `AWSManagedRulesBotControlRuleSet-CheckoutChallenge` with header `x-amzn-waf-challenge: true`.
4. `AwsWafIntegration.fetch()` detects the 405 status code.
5. The frontend pauses the request and pops up the **AWS WAF CAPTCHA Modal**.
6. User solves the interactive puzzle.
7. Telemetry is verified, a valid token is issued, and `AwsWafIntegration.fetch()` automatically retries the checkout request.
8. The retried request succeeds seamlessly with a 200 OK.

---

### Flow 3: Malicious Automated Bot Attack (Blocked at Perimeter)
1. An automated bot script (e.g. Scrapy or headless cURL) targets `/api/products` or `/api/checkout`.
2. The bot sends requests at high speed with no JS execution environment, no valid token, or an automated `User-Agent`.
3. Backend WAF Middleware matches `SignalNonBrowserUserAgent`, `VolumetricScraper`, or `TargetedScalper`.
4. WAF Decision: **BLOCK (403 Forbidden)**.
5. The request is rejected immediately without executing backend business logic or touching product databases.
6. The blocked request appears in red on the SOC Dashboard with the exact matching rule name.

---

## 5. AWS WAF Bot Control Monitoring SOC (Deep Dive)

The **Security Operations Center (SOC) Dashboard** (`frontend/src/pages/MonitoringDashboard.tsx`) is the central intelligence and visualization hub of the platform. In standard production environments, AWS WAF logs sent to CloudWatch or Amazon S3 experience ingestion latency (typically 1 to 5 minutes). NexusCommerce bridges this gap by streaming real-time, sub-second telemetry directly from the WAF evaluation engine to the SOC dashboard over WebSockets.

```
+─────────────────────────────────────────────────────────────────────────────+
|                         WAF SOC MONITORING DASHBOARD                        |
+─────────────────────────────────────────────────────────────────────────────+
| [ Total Requests: 142 ] [ Blocked: 44 (31%) ] [ Allowed: 88 ] [ Bots: 54 ]  |
+─────────────────────────────────────────────────────────────────────────────+
| 🚀 THREAT SIMULATOR: [🕷️ Scraper] [👟 Scalper] [🔓 Auth Stuffer] [👤 Human]  |
+─────────────────────────────────────────────────────────────────────────────+
| FILTERS: [ All (142) ] [ Allowed (88) ] [ Blocked (44) ] [ Challenged (10) ]|
+─────────────────────────────────────────────────────────────────────────────+
| LIVE REQUEST LOGS STREAM (WebSockets ws://.../ws/telemetry)                 |
|  • 08:31:02 | 403 BLOCK     | POST /api/checkout | Scalper Snipe Bot        |
|  • 08:31:01 | 405 CHALLENGE | POST /api/checkout | Unverified Client Token  |
|  • 08:31:00 | 200 ALLOW     | GET  /api/products | Legitimate Human (0.98)  |
|  • 08:30:58 | 403 BLOCK     | GET  /api/products | Volumetric Scraper Bot   |
+─────────────────────────────────────────────────────────────────────────────+
| TOP MATCHED RULES                            BOT CATEGORY DISTRIBUTION      |
|  1. BotControl-VolumetricScraper (24)         - Scraper: 44%                 |
|  2. BotControl-TargetedScalper   (15)         - Scalper: 28%                 |
|  3. ATP-CredentialStuffing        (5)         - Credential Stuffer: 10%      |
|  4. BotControl-VerifiedHuman     (88)         - Headless Tool: 18%           |
+─────────────────────────────────────────────────────────────────────────────+
```

### 5.1 Real-Time SOC Capabilities & Metrics

1. **Executive KPI Cards**:
   - **Total Inspected Requests**: Aggregate volume of all HTTP requests evaluated by WAF.
   - **Mitigation Rate**: Percentage and raw count of requests blocked at the perimeter before reaching backend handlers.
   - **Challenged Requests**: Number of requests served with `405 Challenge` or `CAPTCHA`.
   - **Human vs. Bot Distribution**: Real-time ratio of legitimate browser users vs. automated actors.
   - **Live WebSocket Pulse**: Real-time status indicator showing active connection to the telemetry engine with automated reconnect handling.

2. **Interactive Threat Attack Simulator**:
   Built directly into the SOC UI, allowing security analysts and stakeholders to test and observe defenses with a single click:
   - 🕷️ **Scraper Bot**: Dispatches a multi-threaded burst of 15 catalog queries using automated user-agents (`curl`, `Scrapy`, `python-requests`) lacking telemetry tokens.
     - *Expected Outcome*: **100% BLOCKED (403)** under `AWSManagedRulesBotControlRuleSet-VolumetricScraper`.
   - 👟 **Scalper Snipe Bot**: Fires 10 concurrent flash-sale checkout attempts using headless automation.
     - *Expected Outcome*: **100% BLOCKED (403)** under `AWSManagedRulesBotControlRuleSet-TargetedScalper`.
   - 🔓 **Auth Stuffer**: Executes automated brute-force login attempts using dictionary credentials.
     - *Expected Outcome*: **BLOCKED (403)** under `AWSManagedRulesATPRuleSet-CredentialStuffing`.
   - 👤 **Human + SDK**: Emulates legitimate human browsing where the client SDK acquires and passes a valid token.
     - *Expected Outcome*: **100% ALLOWED (200)** under `AWSManagedRulesBotControlRuleSet-VerifiedHuman`.

3. **Live Request Stream & Inspection Log**:
   - Displays incoming requests chronologically as they happen.
   - Color-coded action badges:
     - <span style="color:#22c55e">**ALLOW (200)**</span>: Human verified with token.
     - <span style="color:#ef4444">**BLOCK (403)**</span>: Bot or malicious tool rejected.
     - <span style="color:#eab308">**CHALLENGE (405)**</span>: Sensitive route without token, silent challenge issued.
     - <span style="color:#f97316">**CAPTCHA (405)**</span>: Interactive puzzle challenge required.
   - Filter bar: Quickly filter logs by `ALL`, `ALLOW`, `BLOCK`, or `CHALLENGE`.

4. **Event Drilldown & Telemetry Modal**:
   Clicking on any log row opens a detailed forensic inspection drawer displaying:
   - Full UTC Timestamp and Client IP (with `x-forwarded-for` resolution).
   - HTTP Method, Request Path, and Client `User-Agent`.
   - Matching AWS WAF Rule Name and Bot Category classification.
   - Token Status (`VALID`, `MISSING`, `EXPIRED`, `TAMPERED`, `CHALLENGED`).
   - Client Behavioral Telemetry Score ($0.00$ to $1.00$, where higher indicates stronger human confidence).
   - Plain-text mitigation rationale generated by the rule engine.

5. **Rule Execution & Bot Breakdown Analytics**:
   - **Top Matched Rules**: Ranked list of WAF rules triggered across all inspected traffic.
   - **Bot Category Breakdown**: Visual proportion of Scrapers, Scalpers, Credential Stuffers, Headless Bots, and Verified Humans.

6. **State Persistence & Management**:
   - Telemetry events are stored in SQLite (`nexus_commerce.db`), allowing historical inspection across server restarts.
   - One-click **"Reload"** fetches the latest 250 events from SQLite.
   - One-click **"Clear Logs"** resets the telemetry database and counter statistics for clean demonstration runs.

---

## 6. Repository Directory Structure

```
ecommers-application-with-waf-bot-control-and-monitering/
│
├── README.md                      # Project quickstart & overview
├── docs/                          # In-depth architectural & SDK documentation
│   ├── AWS_WAF_JS_SDK_DEEP_DIVE.md# Detailed theoretical & technical guide on AWS WAF JS SDK
│   └── TEAM_PROJECT_OVERVIEW.md   # This document
│
├── frontend/                      # React + TypeScript + Vite Single-Page Application
│   ├── index.html                 # App shell loading AWS WAF JS SDK script tag
│   ├── .env                       # Environment configuration (API base, WAF API key)
│   ├── package.json               # Dependencies & build scripts
│   └── src/
│       ├── App.tsx                # Main application layout, routing & navigation
│       ├── types.ts               # Shared TypeScript data models
│       ├── services/
│       │   ├── api.ts             # REST client for backend APIs
│       │   ├── config.ts          # Endpoint & environment resolvers
│       │   └── wafIntegration.ts  # AWS WAF JS SDK integration, fetch wrapper & telemetry
│       ├── components/
│       │   ├── Navbar.tsx         # Top bar with token status indicator & modal triggers
│       │   ├── ProductCatalog.tsx # Storefront product listings with flash sales
│       │   ├── CartDrawer.tsx     # Slide-out shopping cart
│       │   ├── CheckoutModal.tsx  # Checkout form submitting through WAF fetch
│       │   ├── AuthModal.tsx      # Sign-in / Register modal protected by ATP
│       │   ├── WafCaptchaModal.tsx# AWS WAF interactive CAPTCHA puzzle challenge modal
│       │   └── WafTelemetryModal.tsx# Developer inspector displaying active WAF telemetry
│       └── pages/
│           └── MonitoringDashboard.tsx # Real-time Security Operations Center (SOC)
│
├── backend/                       # Python FastAPI Backend & WAF Middleware
│   ├── requirements.txt           # Python dependencies (fastapi, uvicorn, pydantic)
│   ├── nexus_commerce.db          # SQLite database storing products, orders & WAF logs
│   └── app/
│       ├── main.py                # FastAPI initialization, middleware registration, CORS
│       ├── config.py              # Application settings (secret keys, rate limits)
│       ├── database.py            # SQLite schema initialization and CRUD queries
│       ├── middleware/
│       │   └── waf_middleware.py  # Starlette HTTP middleware intercepting and evaluating traffic
│       ├── models/
│       │   ├── product.py         # Product & Cart schemas
│       │   └── waf_event.py       # WAF Telemetry Event, Action, and Stats schemas
│       ├── services/
│       │   └── waf_service.py     # Rule engine, token generator/verifier, WebSocket hub
│       └── routers/
│           ├── products.py        # Product catalog routes
│           ├── checkout.py        # Order placement routes
│           ├── auth.py            # Authentication routes protected by ATP
│           └── monitoring.py      # SOC metrics, history, and attack simulation trigger
│
├── infrastructure/                # CloudFormation / AWS Deployment
│   └── aws-waf-bot-control.yaml   # AWS WAFv2 WebACL CloudFormation template
│
└── scripts/                       # CLI automation and verification utilities
    ├── test_attacks.py            # Multi-threaded bot attack test script
    ├── view_db.py                 # SQLite inspector to review stored WAF logs
    └── restore_db.py              # Database reset / seed utility
```

---

## 7. Key Integration Interfaces & Protocols

### 7.1 HTTP Headers Contract

| Header Name | Sent By | Description / Values |
|---|---|---|
| `x-amzn-waf-action-token` | Client (SDK) | Signed telemetry token (`waf_tok_<payload>_<sig>`) |
| `x-amzn-waf-action` | WAF / Middleware | Outcome of WAF evaluation: `allow`, `block`, `captcha`, `challenge` |
| `x-amzn-waf-rule` | WAF / Middleware | Specific rule matched (e.g. `AWSManagedRulesBotControlRuleSet-TargetedScalper`) |
| `x-amzn-waf-challenge` | WAF / Middleware | Boolean string (`true`) signaling frontend that a challenge must be completed |
| `x-amzn-waf-challenge-type` | WAF / Middleware | Type of challenge required: `captcha` (interactive) or `silent` |

### 7.2 WebSocket Protocol (`ws://<backend>/ws/telemetry`)
- Upon connection, the server sends a full snapshot message:
  ```json
  {
    "type": "SNAPSHOT",
    "data": { "total_requests": 142, "allowed_count": 98, "blocked_count": 34, "challenged_count": 10, "recent_events": [...] }
  }
  ```
- On every inspected request, the server broadcasts an incremental update:
  ```json
  {
    "type": "NEW_EVENT",
    "event": {
      "id": "e8a1b2c3",
      "timestamp": "2026-10-14 08:00:00",
      "client_ip": "192.168.1.50",
      "method": "POST",
      "path": "/api/checkout",
      "waf_action": "BLOCK",
      "rule_name": "AWSManagedRulesBotControlRuleSet-TargetedScalper",
      "bot_category": "Scalper",
      "token_status": "MISSING",
      "telemetry_score": 0.08,
      "status_code": 403,
      "details": "Blocked automated inventory scalper attempting sub-second checkout."
    },
    "stats": { ... }
  }
  ```

---

## 8. How to Run, Test, and Demonstrate

### 8.1 Local Development Setup

#### Step 1: Start Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Health: `http://localhost:8000/health`
- Swagger UI Docs: `http://localhost:8000/docs`
- WebSocket Feed: `ws://localhost:8000/ws/telemetry`

#### Step 2: Start Frontend
```bash
cd frontend
npm install
npm run dev
```
- Web Application: `http://localhost:5173`

---

### 8.2 Running Attack Demos for Team or Stakeholders

#### Method A: Using the In-App SOC Dashboard (Recommended for Presentations)
1. Open `http://localhost:5173` and click the **"WAF SOC & Monitoring"** tab in the navigation bar.
2. In the **Interactive Threat Simulator** section, click any of the 4 scenario buttons:
   - **Launch Scraper Attack**: Fires rapid catalog queries using non-browser User-Agents. Watch them get **BLOCKED (403)** in red on the live feed.
   - **Launch Scalper Snipe**: Fires rapid checkout requests without valid tokens. Watch them get **BLOCKED (403)** under `TargetedScalper`.
   - **Launch Auth Stuffer**: Simulates automated brute-force login attempts. Watch them get **BLOCKED (403)** under `CredentialStuffing`.
   - **Simulate Legitimate Human Traffic**: Demonstrates human browsing with valid tokens acquiring **ALLOW (200)** status.

#### Method B: Testing the CAPTCHA Challenge Flow Manually
1. Go to the Storefront (`http://localhost:5173`).
2. Click the **Key icon** in the top navigation bar to drop/clear your current token.
3. Click **"Buy Now"** on any product.
4. Because the sensitive checkout endpoint was called without a token, the backend issues a **405 Challenge**.
5. The **AWS WAF CAPTCHA Modal** will pop up on screen.
6. Complete the verification slider.
7. The client SDK acquires a fresh token and automatically resumes and completes your checkout!

#### Method C: CLI Attack Script
```bash
cd scripts
python3 test_attacks.py
```

---

## 9. Production Deployment to AWS

To connect this application to live AWS infrastructure:
1. **Deploy the CloudFormation Stack**:
   ```bash
   aws cloudformation deploy \
     --template-file infrastructure/aws-waf-bot-control.yaml \
     --stack-name production-nexus-waf \
     --parameter-overrides TokenDomain=yourdomain.com
   ```
2. **Retrieve the AWS WAF JavaScript SDK Snippet**:
   In AWS WAF Console under your WebACL, go to **Application Integration** and copy your integration script tag.
3. **Configure Frontend**:
   Include the script tag in `frontend/index.html` and configure `VITE_AWS_WAF_API_KEY` in `frontend/.env`.
4. **Deploy Assets**:
   - Host `frontend/` on **Amazon S3 + CloudFront CDN**.
   - Host `backend/` on **AWS ECS (Fargate) or AWS App Runner** behind an **Application Load Balancer (ALB)** associated with the WebACL.

---

## 10. Summary: Value Delivered by this Project

| Area | Traditional Implementation | NexusCommerce + AWS WAF Implementation |
|---|---|---|
| **Bot Detection** | IP blacklists & basic User-Agent strings (easily bypassed) | Client telemetry (Canvas, WebGL, entropy) + Signed dynamic tokens |
| **User Experience** | Annoying CAPTCHAs for everyone | Completely invisible for legitimate humans; CAPTCHA only when suspicious |
| **Scalper Defense** | Cart reservations and manual bans | Sub-second edge blocking of headless bots on flash-sale checkouts |
| **Account Protection**| Static login rate limits | AWS WAF Account Takeover Prevention (ATP) inspecting credentials & origins |
| **Visibility** | Silent backend server logs | Real-time WebSocket SOC dashboard with attack simulation and KPI tracking |

