import httpx
from jose import jwt
from fastapi import HTTPException

async def get_oidc_endpoints(discovery_url: str):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(discovery_url)
            resp.raise_for_status()
            data = resp.json()
            return {
                "authorization_endpoint": data["authorization_endpoint"],
                "token_endpoint": data["token_endpoint"],
                "jwks_uri": data["jwks_uri"],
                "userinfo_endpoint": data.get("userinfo_endpoint")
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch OIDC discovery document: {e}")

async def fetch_jwks(jwks_uri: str):
    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_uri)
        resp.raise_for_status()
        return resp.json()

async def exchange_code_for_token(token_endpoint: str, client_id: str, client_secret: str, code: str, redirect_uri: str):
    async with httpx.AsyncClient() as client:
        data = {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
        resp = await client.post(token_endpoint, data=data, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {resp.text}")
        return resp.json()
