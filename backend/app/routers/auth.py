from fastapi import APIRouter, HTTPException, Request
from ..models.waf_event import AuthRequest
import uuid

router = APIRouter(prefix="/api/auth", tags=["auth"])

VALID_USERS = {
    "demo_customer": "SecretPass123!",
    "alex99": "Shopping2026!",
    "admin": "SuperSecureWafAdmin99!"
}

@router.post("/login")
async def login(auth: AuthRequest, request: Request):
    """
    Protected authentication endpoint.
    Vulnerable to automated credential stuffing if not shielded by AWS WAF Bot Control.
    """
    expected_pw = VALID_USERS.get(auth.username)
    if not expected_pw or expected_pw != auth.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {
        "status": "AUTHENTICATED",
        "user": auth.username,
        "session_token": f"sess_{uuid.uuid4().hex[:16]}",
        "role": "customer"
    }

@router.post("/register")
async def register(auth: AuthRequest, request: Request):
    if auth.username in VALID_USERS:
        raise HTTPException(status_code=400, detail="Username already exists")

    VALID_USERS[auth.username] = auth.password
    return {
        "status": "CREATED",
        "user": auth.username,
        "message": "Account created successfully"
    }
