# NexusCommerce: E-Commerce Platform with AWS WAF Bot Control & JS SDK

A full-stack, enterprise-grade e-commerce application built with **Python (FastAPI)** and **React (Vite + TypeScript)**, designed to showcase and demonstrate the **AWS WAF JavaScript Application Integration SDK** and **AWS WAF Bot Control (Targeted Tier)** with real-time threat monitoring and attack simulation.

---

## 🛡️ Architecture & How the AWS WAF JS SDK Protects

AWS WAF Bot Control Targeted Tier protects modern web applications against automated scrapers, scalpers, inventory hoarders, and credential stuffers using client telemetry and dynamic challenge tokens.

```
[ Browser Client ]
   │
   ├── 1. Injects AWS WAF JS SDK (<script src="https://<token-domain>/<key>/waf.js">)
   ├── 2. SDK gathers passive telemetry (screen dimensions, mouse entropy, canvas fingerprint)
   ├── 3. SDK acquires signed x-amzn-waf-action-token
   └── 4. Calls wrapped via AwsWafIntegration.fetch()
          │
          ▼
[ AWS WAF WebACL (AWSManagedRulesBotControlRuleSet - Targeted) ]
   ├── Valid Human with Token     ──► ALLOW (200 OK)
   ├── Missing / Suspicious Token ──► CHALLENGE (405 WAF CAPTCHA Puzzle)
   └── Known Bot / Rapid Scraper  ──► BLOCK (403 Forbidden)
          │
          ▼
[ FastAPI Backend & Live Monitoring SOC ]
   └── Streams live WAF telemetry events & metrics via WebSockets
```

### Key Components

1. **Python FastAPI Backend (`/backend`)**:
   - `WafBotControlMiddleware`: Evaluates all incoming HTTP requests against AWS WAF Bot Control rules.
   - Verifies `x-amzn-waf-action-token` cryptographic signatures, TTL, and telemetry score.
   - Issues standard AWS WAF responses:
     - `ALLOW (200)` for verified humans.
     - `CHALLENGE (405)` with `x-amzn-waf-challenge: true` for missing tokens on protected actions.
     - `BLOCK (403)` for scrapers, scalpers, and credential stuffers.
   - Telemetry Hub: Broadcasts real-time events to the SOC dashboard over WebSockets (`/ws/telemetry`).
   - Attack Simulator: Built-in engine (`/api/monitoring/simulate-attack`) to trigger realistic multi-threaded bot attacks.

2. **React + TypeScript Frontend (`/frontend`)**:
   - Storefront with flash-sale items (RTX 5090 GPU, limited sneaker drops) that bots frequently target.
   - Native integration with `AwsWafIntegration` (`getToken`, `hasToken`, `fetch`, `renderCaptcha`).
   - `WafCaptchaModal`: Interactive proof-of-work CAPTCHA puzzle automatically invoked when receiving a 405 Challenge, silently retrying requests upon completion.
   - WAF Security Operations Center (SOC) Dashboard:
     - Live request stream with colored action badges.
     - Real-time Threat Mitigation KPI cards.
     - Breakdown of bot categories and triggered AWS WAF rules.
     - Interactive Attack Simulator control panel.

3. **Infrastructure as Code (`/infrastructure`)**:
   - `aws-waf-bot-control.yaml`: Ready-to-deploy CloudFormation template configuring AWS WAFv2 WebACL with `AWSManagedRulesBotControlRuleSet` (Targeted), `AWSManagedRulesATPRuleSet`, and Token Domains.

---

## 🚀 Quickstart & Running Locally

### 1. Start Python Backend

```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will be running at: `http://localhost:8000`
- API Health: `http://localhost:8000/health`
- Swagger Docs: `http://localhost:8000/docs`
- WebSocket Telemetry: `ws://localhost:8000/ws/telemetry`

### 2. Start React Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be running at: `http://localhost:5173`

---

## 🧪 Simulating Attacks & Observing Protection

### 1. In the Web UI (Interactive SOC Dashboard)
1. Open `http://localhost:5173` and click the **"WAF SOC & Monitoring"** tab in the top navigation.
2. In the **Interactive Threat Simulator** section, choose an attack vector:
   - 🕷️ **Scraper Bot**: Launches 15 high-frequency catalog scraping requests using automated user-agents (`curl`, `Scrapy`, `python-requests`) without WAF tokens. Observe: **All 15 requests BLOCKED (403)** under `AWSManagedRulesBotControlRuleSet-VolumetricScraper`.
   - 👟 **Scalper Snipe Bot**: Fires 10 rapid flash-sale checkout attempts using headless automation. Observe: **All 10 requests BLOCKED (403)** under `AWSManagedRulesBotControlRuleSet-TargetedScalper`.
   - 🔓 **Auth Stuffer**: Fires 12 brute-force login attempts against customer accounts. Observe: **BLOCKED (403)** under `AWSManagedRulesATPRuleSet-CredentialStuffing`.
   - 👤 **Human + SDK**: Demonstrates legitimate human browsing where the AWS WAF JavaScript SDK acquires a valid token. Observe: **All requests ALLOWED (200)** under `AWSManagedRulesBotControlRuleSet-VerifiedHuman`.

### 2. Testing the CAPTCHA Challenge Flow Manually
1. In the Storefront, click the **key icon** in the top navigation bar to drop/invalidate your current token.
2. Click **"Buy Now"** or proceed through checkout.
3. Because the sensitive checkout endpoint was called without a verified token, AWS WAF returns a **405 Challenge**.
4. The **AWS WAF CAPTCHA Modal** will pop up on your screen.
5. Slide the verification bar to complete the human proof-of-work puzzle.
6. The client SDK acquires a fresh token and automatically resumes your checkout!

---

## 📊 Live Monitoring & Logs

Every request inspected by AWS WAF logs the following fields:
- `timestamp`: UTC event timestamp
- `client_ip`: Originating IP address
- `method` & `path`: Requested endpoint (e.g. `POST /api/checkout`)
- `user_agent`: Client user-agent string
- `waf_action`: `ALLOW`, `CHALLENGE`, or `BLOCK`
- `rule_name`: AWS WAF rule that matched (e.g. `AWSManagedRulesBotControlRuleSet-TargetedScalper`)
- `bot_category`: Scraper, Scalper, Credential Stuffer, Headless Bot, or Legitimate Human
- `token_status`: `VALID`, `MISSING`, `EXPIRED`, or `CHALLENGED`
- `telemetry_score`: Client behavior entropy score (0.0 to 1.0)
- `details`: Plain-text rationale for the mitigation action

---

## ☁️ Deploying to AWS

To connect this application to live AWS WAF:
1. Deploy the CloudFormation stack:
   ```bash
   aws cloudformation deploy \
     --template-file infrastructure/aws-waf-bot-control.yaml \
     --stack-name production-nexus-waf \
     --parameter-overrides TokenDomain=yourdomain.com
   ```
2. In the AWS WAF Console, navigate to **Application Integration** under your Web ACL and copy the JavaScript script tag:
   ```html
   <script type="text/javascript" src="https://<token-domain>/<key>/waf.js" defer></script>
   ```
3. Paste the script tag into `frontend/index.html`.
4. Deploy the frontend to AWS S3/CloudFront and the backend to AWS ECS/App Runner behind your Application Load Balancer (ALB).
