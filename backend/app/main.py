from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .middleware.waf_middleware import WafBotControlMiddleware
from .routers import products, checkout, auth, monitoring

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="E-Commerce API protected by AWS WAF Bot Control (Targeted Tier) and JavaScript SDK Integration"
)

# 1. Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
    expose_headers=[
        "x-amzn-waf-action",
        "x-amzn-waf-rule",
        "x-amzn-waf-challenge",
        "x-amzn-waf-action-token"
    ]
)

# 2. Add AWS WAF Bot Control Enforcement Middleware
app.add_middleware(WafBotControlMiddleware)

# 3. Register Routers
app.include_router(products.router)
app.include_router(checkout.router)
app.include_router(auth.router)
app.include_router(monitoring.router)

@app.get("/health")
async def health_check():
    return {
        "status": "HEALTHY",
        "waf_bot_control": "ACTIVE",
        "simulation_mode": settings.SIMULATION_MODE,
        "token_domain": settings.AWS_WAF_TOKEN_DOMAIN
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
