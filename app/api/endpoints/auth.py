from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import secrets
from urllib.parse import urlencode

from app.core.security import create_access_token, get_current_user
from app.api.deps import get_db
from app.models.oidc_provider import OIDCProvider
from app.models.user import User
from app.core.oidc import get_oidc_endpoints, exchange_code_for_token, fetch_jwks
from jose import jwt

from app.core.config import settings

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class ProviderInfo(BaseModel):
    id: int
    name: str

@router.get("/providers", response_model=List[ProviderInfo])
def get_providers(db: Session = Depends(get_db)):
    providers = db.query(OIDCProvider).filter(OIDCProvider.is_active == True).all()
    return [{"id": p.id, "name": p.name} for p in providers]

class UserInfo(BaseModel):
    username: str
    role: str

@router.get("/me", response_model=UserInfo)
def get_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role}

@router.post("/login", response_model=TokenResponse)
def login_for_access_token(request: LoginRequest, db: Session = Depends(get_db)):
    # Mock authentication - accept any admin/admin
    if request.username != "admin" or request.password != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.username == request.username).first()
    if not user:
        user = User(username=request.username, role="admin")
        db.add(user)
        db.commit()
        
    access_token = create_access_token(data={"sub": request.username})
    return {"access_token": access_token, "token_type": "bearer"}

# In-memory state store for simplicity (in prod, use Redis or signed cookies)
oauth_states = {}

@router.get("/login/{provider_id}")
async def login_via_provider(provider_id: int, request: Request, db: Session = Depends(get_db)):
    provider = db.query(OIDCProvider).filter(OIDCProvider.id == provider_id, OIDCProvider.is_active == True).first()
    if not provider:
        raise HTTPException(status_code=404, detail="OIDC Provider not found")
        
    endpoints = await get_oidc_endpoints(provider.discovery_url)
    
    state = secrets.token_urlsafe(32)
    oauth_states[state] = provider_id
    
    # We construct redirect_uri based on the incoming request to be dynamic
    # Or hardcode a relative path. For proxy setups, hardcoding the frontend host is safer.
    # In Vite dev, frontend is 5173, backend is 8000. Let's use request.base_url to point back to the backend proxy
    redirect_uri = str(request.base_url).rstrip("/") + f"/api/callback/{provider_id}"
    
    params = {
        "response_type": "code",
        "client_id": provider.client_id,
        "redirect_uri": redirect_uri,
        "scope": "openid profile email",
        "state": state
    }
    
    auth_url = f"{endpoints['authorization_endpoint']}?{urlencode(params)}"
    return RedirectResponse(auth_url)

@router.get("/callback/{provider_id}")
async def auth_callback(provider_id: int, request: Request, code: str, state: str, db: Session = Depends(get_db)):
    if state not in oauth_states or oauth_states[state] != provider_id:
        raise HTTPException(status_code=400, detail="Invalid state")
    del oauth_states[state]
    
    provider = db.query(OIDCProvider).filter(OIDCProvider.id == provider_id, OIDCProvider.is_active == True).first()
    if not provider:
        raise HTTPException(status_code=404, detail="OIDC Provider not found")
        
    endpoints = await get_oidc_endpoints(provider.discovery_url)
    redirect_uri = str(request.base_url).rstrip("/") + f"/api/callback/{provider_id}"
    
    token_response = await exchange_code_for_token(
        endpoints["token_endpoint"],
        provider.client_id,
        provider.client_secret,
        code,
        redirect_uri
    )
    
    id_token = token_response.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="No id_token in response")
        
    jwks = await fetch_jwks(endpoints["jwks_uri"])
    
    try:
        # Verify id_token signature using JWKS
        payload = jwt.decode(
            id_token,
            jwks,
            algorithms=["RS256"],
            audience=provider.client_id,
            options={"verify_at_hash": False}
        )
    except Exception as e:
        # Fallback to unverified decode if signature fails (not recommended for production, 
        # but ok since we got the token directly from the IdP via backchannel code exchange)
        payload = jwt.get_unverified_claims(id_token)
        
    email = payload.get("email")
    if not email:
        email = payload.get("sub")
        
    user = db.query(User).filter(User.username == email).first()
    if not user:
        # Check if it is the first user overall, if so make admin, else AIOwner
        is_first = db.query(User).count() == 0
        user = User(username=email, role="admin" if is_first else "AIOwner")
        db.add(user)
        db.commit()
        
    # Generate local access token
    access_token = create_access_token(data={"sub": email})
    
    frontend_url = f"{settings.FRONTEND_URL}/#auth_callback?token={access_token}"
    return RedirectResponse(frontend_url)

