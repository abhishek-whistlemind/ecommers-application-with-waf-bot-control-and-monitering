import os
from pydantic import BaseModel

class Settings(BaseModel):
    APP_NAME: str = "NexusCommerce - AWS WAF Protected Store"
    VERSION: str = "1.0.0"
    SECRET_KEY: str = os.getenv("WAF_SECRET_KEY", "aws-waf-demo-secret-token-key-2026")
    
    # AWS WAF integration settings
    AWS_WAF_TOKEN_DOMAIN: str = os.getenv("AWS_WAF_TOKEN_DOMAIN", "token.awswaf.example.com")
    AWS_WAF_INTEGRATION_URL: str = os.getenv("AWS_WAF_INTEGRATION_URL", "https://token.awswaf.example.com/integration/waf.js")
    
    # Security & Bot detection controls
    SIMULATION_MODE: bool = True  # If true, runs realistic WAF bot evaluation & token verification locally
    RATE_LIMIT_SCRAPER_BURST: int = 8  # More than 8 requests in 5 seconds without token triggers Bot Control
    RATE_LIMIT_AUTH_BURST: int = 4     # More than 4 rapid login attempts triggers credential stuffing block

settings = Settings()
