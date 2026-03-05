"""Authentication endpoints for GitHub OAuth."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..auth import (
    create_access_token,
    get_current_user,
    exchange_github_code,
    get_github_user_info,
    get_or_create_user_from_github,
)
from ..config import REQUIRE_AUTH, GITHUB_CLIENT_ID
from ..database import get_db
from ..models import User

log = logging.getLogger("face-lapse.auth")

router = APIRouter()


@router.get("/github")
async def github_oauth_start(request: Request):
    """Initiate GitHub OAuth flow."""
    if not REQUIRE_AUTH:
        raise HTTPException(status_code=400, detail="Authentication is disabled")
    
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")
    
    # Get the redirect URI from the request
    redirect_uri = str(request.base_url).rstrip("/") + "/api/auth/callback"
    
    # Build GitHub OAuth URL
    github_oauth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=user:email"
    )
    
    return {"auth_url": github_oauth_url}


@router.get("/callback")
async def github_oauth_callback(
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Handle GitHub OAuth callback."""
    if not REQUIRE_AUTH:
        raise HTTPException(status_code=400, detail="Authentication is disabled")
    
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    
    try:
        # Exchange code for access token
        redirect_uri = str(request.base_url).rstrip("/") + "/api/auth/callback"
        token_response = await exchange_github_code(code, redirect_uri)
        access_token = token_response.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get access token")
        
        # Get user info from GitHub
        github_user = await get_github_user_info(access_token)
        
        # Get or create user in database
        user = get_or_create_user_from_github(db, github_user, access_token)
        
        # Create JWT token
        jwt_token = create_access_token(user.id)
        
        # Redirect to frontend with token
        # Try to get frontend URL from Referer header or Origin
        referer = request.headers.get("Referer", "")
        origin = request.headers.get("Origin", "")
        frontend_url = ""
        
        if referer:
            # Extract base URL from referer (remove /api/auth/callback)
            frontend_url = referer.split("/api")[0].rstrip("/")
        elif origin:
            frontend_url = origin.rstrip("/")
        else:
            # Fallback: try to construct from request URL
            scheme = request.url.scheme
            host = request.headers.get("Host", "")
            if host:
                frontend_url = f"{scheme}://{host}".split("/api")[0].rstrip("/")
            else:
                frontend_url = "http://localhost:5173"  # Default fallback
        
        # For GitHub Pages, the callback might be at the root
        callback_path = "/auth/callback"
        return RedirectResponse(
            url=f"{frontend_url}{callback_path}?token={jwt_token}",
            status_code=302,
        )
    except Exception as e:
        log.error(f"OAuth callback error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Authentication failed: {str(e)}")


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Logout endpoint (client-side token removal)."""
    # JWT tokens are stateless, so logout is handled client-side
    # In a more secure setup, you might maintain a token blacklist
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return {
        "id": current_user.id,
        "github_username": current_user.github_username,
        "github_email": current_user.github_email,
        "github_avatar_url": current_user.github_avatar_url,
    }
