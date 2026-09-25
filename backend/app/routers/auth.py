from fastapi import APIRouter, HTTPException, Request
from ..models.waf_event import AuthRequest
from ..database import db_get_user, db_create_user
import uuid

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login")
async def login(auth: AuthRequest, request: Request):
    """
    Protected authentication endpoint backed by SQLite.
    Vulnerable to automated credential stuffing if not shielded by AWS WAF Bot Control.
    """
    user_record = db_get_user(auth.username)
    if not user_record or user_record["password"] != auth.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {
        "status": "AUTHENTICATED",
        "user": auth.username,
        "session_token": f"sess_{uuid.uuid4().hex[:16]}",
        "role": user_record.get("role", "customer")
    }

@router.post("/register")
async def register(auth: AuthRequest, request: Request):
    existing = db_get_user(auth.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    db_create_user(auth.username, auth.password)
    return {
        "status": "CREATED",
        "user": auth.username,
        "message": "Account created successfully in SQLite database"
    }
