from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class WafEvent(BaseModel):
    id: str
    timestamp: str
    client_ip: str
    method: str
    path: str
    user_agent: str
    waf_action: str  # "ALLOW", "CHALLENGE", "BLOCK"
    rule_name: str
    bot_category: str  # "Legitimate Human", "Scraper", "Scalper", "Credential Stuffer", "Headless Bot", "Search Engine"
    token_status: str  # "VALID", "MISSING", "EXPIRED", "TAMPERED", "CHALLENGED"
    token_id: Optional[str] = None
    telemetry_score: float = 1.0  # 0.0 (Definitely Bot) to 1.0 (Human)
    status_code: int = 200
    details: str = ""

class WafStats(BaseModel):
    total_requests: int = 0
    allowed_count: int = 0
    blocked_count: int = 0
    challenged_count: int = 0
    human_count: int = 0
    bot_count: int = 0
    top_rules: Dict[str, int] = Field(default_factory=dict)
    bot_breakdown: Dict[str, int] = Field(default_factory=dict)
    recent_events: List[WafEvent] = Field(default_factory=list)

class AttackSimulationRequest(BaseModel):
    attack_type: str  # "scraper", "scalper", "credential_stuffing", "human_with_sdk", "headless_browser"
    request_count: int = 15
    concurrency: int = 3
    delay_ms: int = 150
    target_path: Optional[str] = None

class Product(BaseModel):
    id: str
    name: str
    description: str
    price: float
    category: str
    stock: int
    image_url: str
    is_flash_sale: bool = False
    rating: float = 4.8
    specs: List[str] = Field(default_factory=list)

class OrderRequest(BaseModel):
    product_id: str
    quantity: int = 1
    shipping_address: str
    card_last_four: str = "4242"

class AuthRequest(BaseModel):
    username: str
    password: str
