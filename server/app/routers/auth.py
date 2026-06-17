from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth_utils import create_session, hash_password, verify_password, get_user_for_token
from app.database import get_db
from app.models import AuthSession, User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserRead(BaseModel):
    id: int
    username: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    token: str
    user: UserRead


# ── helpers ───────────────────────────────────────────────────────────────────

def _current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    user = get_user_for_token(db, token)
    if not user:
        raise HTTPException(401, "Authentication required")
    return user


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    has_users = db.scalar(select(User.id).limit(1)) is not None
    return {"has_users": has_users, "sync_ready": has_users}


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if len(data.username.strip()) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    if len(data.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    username = data.username.strip().lower()
    if db.scalar(select(User.id).where(User.username == username)):
        raise HTTPException(409, "Username already taken")

    user = User(username=username, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    session = create_session(db, user)
    return AuthResponse(token=session.token, user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    username = data.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    session = create_session(db, user)
    return AuthResponse(token=session.token, user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(_current_user), response: Response = None):
    response.headers["Cache-Control"] = "private, max-age=30"
    return UserRead.model_validate(user)


@router.delete("/logout", status_code=204)
def logout(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    _user: User = Depends(_current_user),
):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        db.execute(delete(AuthSession).where(AuthSession.token == token))
        db.commit()
