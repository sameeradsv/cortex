from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth_utils import create_session, hash_password, verify_password, get_user_for_token
from app.auth_utils import _now_naive
from app.database import get_db
from app.limiter import limiter
from app.models import AuthSession, PasswordResetToken, User

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

class RequestResetRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    has_users = db.scalar(select(User.id).limit(1)) is not None
    return {"has_users": has_users}


@router.post("/register", response_model=AuthResponse, status_code=201)
@limiter.limit("3/minute")
def register(request: Request, data: RegisterRequest, db: Session = Depends(get_db)):
    if len(data.username.strip()) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    if len(data.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    username = data.username.strip().lower()
    if not re.fullmatch(r'[a-z0-9_.-]+', username):
        raise HTTPException(400, "Username may only contain letters, numbers, underscores, hyphens, and dots")
    if db.scalar(select(User.id).where(User.username == username)):
        raise HTTPException(409, "Username already taken")

    user = User(username=username, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    session = create_session(db, user)
    return AuthResponse(token=session.token, user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    username = data.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    session = create_session(db, user)
    return AuthResponse(token=session.token, user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(response: Response, user: User = Depends(_current_user)):
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


@router.delete("/account", status_code=204)
def delete_account(
    db: Session = Depends(get_db),
    user: User = Depends(_current_user),
):
    db.delete(user)
    db.commit()


@router.post("/request-reset", status_code=202)
@limiter.limit("3/hour")
def request_reset(request: Request, data: RequestResetRequest, db: Session = Depends(get_db)):
    username = data.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    # Return the same response whether or not the user exists to prevent enumeration.
    if not user:
        return {"message": "If that username exists a reset token has been issued."}
    now = _now_naive()
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    reset_token = PasswordResetToken(
        token=secrets.token_urlsafe(32),
        user_id=user.id,
        expires_at=now + timedelta(hours=1),
    )
    db.add(reset_token)
    db.commit()
    # TODO: email reset_token.token to the user. For now it is only accessible via the DB.
    return {"message": "If that username exists a reset token has been issued."}


@router.post("/reset-password", status_code=200)
@limiter.limit("5/minute")
def reset_password(request: Request, data: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(data.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    now = _now_naive()
    entry = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token == data.token,
            PasswordResetToken.expires_at > now,
        )
    )
    if not entry:
        raise HTTPException(400, "Reset token is invalid or has expired")
    user = db.get(User, entry.user_id)
    if not user:
        raise HTTPException(400, "Reset token is invalid or has expired")
    user.password_hash = hash_password(data.new_password)
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()
    return {"message": "Password updated. All existing sessions have been invalidated."}
