"""Authentication module with GitHub OAuth and JWT tokens."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .config import (
    REQUIRE_AUTH,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    JWT_SECRET_KEY,
    JWT_ALGORITHM,
    JWT_EXPIRATION_HOURS,
)
from .database import get_db
from .models import User

log = logging.getLogger("face-lapse.auth")

security = HTTPBearer(auto_error=False)

# Default user for local development (when REQUIRE_AUTH=False)
DEFAULT_USER_ID = 1


def get_default_user(db: Session) -> User:
    """Get or create the default user for local development."""
    user = db.query(User).filter(User.id == DEFAULT_USER_ID).first()
    if not user:
        user = User(
            id=DEFAULT_USER_ID,
            github_id=0,
            github_username="local_dev",
            github_email="local@dev.local",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def create_access_token(user_id: int) -> str:
    """Create a JWT access token for a user."""
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode = {"sub": str(user_id), "exp": expire}
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[int]:
    """Decode a JWT token and return the user ID."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        return int(user_id)
    except JWTError:
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Get the current authenticated user.
    
    If REQUIRE_AUTH=False, returns the default user.
    If REQUIRE_AUTH=True, validates JWT token and returns the user.
    """
    if not REQUIRE_AUTH:
        # Local development mode - return default user
        return get_default_user(db)
    
    # Production mode - require authentication
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    user_id = decode_access_token(token)
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


async def get_github_user_info(access_token: str) -> dict:
    """Fetch user information from GitHub API."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"token {access_token}"},
        )
        response.raise_for_status()
        return response.json()


async def exchange_github_code(code: str, redirect_uri: str) -> dict:
    """Exchange GitHub OAuth code for access token."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json()


def get_or_create_user_from_github(db: Session, github_data: dict, access_token: str) -> User:
    """Get or create a user from GitHub OAuth data."""
    github_id = github_data.get("id")
    
    # Look for existing user by GitHub ID
    user = db.query(User).filter(User.github_id == github_id).first()
    
    if user:
        # Update user info
        user.github_username = github_data.get("login")
        user.github_email = github_data.get("email")
        user.github_avatar_url = github_data.get("avatar_url")
        user.access_token = access_token  # In production, encrypt this
        user.updated_at = datetime.now(timezone.utc)
    else:
        # Create new user
        user = User(
            github_id=github_id,
            github_username=github_data.get("login"),
            github_email=github_data.get("email"),
            github_avatar_url=github_data.get("avatar_url"),
            access_token=access_token,  # In production, encrypt this
        )
        db.add(user)
    
    db.commit()
    db.refresh(user)
    return user
