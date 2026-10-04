import pytest
from app.core.security import create_access_token

def test_get_models(client):
    token = create_access_token({"sub": "admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.get("/api/models", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_add_and_set_default_model(client):
    token = create_access_token({"sub": "admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    # Add model
    r_add = client.post("/api/models", headers=headers, json={"name": "gpt-3.5-turbo", "provider": "openai", "is_default": False})
    assert r_add.status_code == 200
    model_data = r_add.json()
    assert model_data["name"] == "gpt-3.5-turbo"
    
    # Set default
    model_id = model_data["id"]
    r_default = client.post(f"/api/models/{model_id}/set_default", headers=headers)
    assert r_default.status_code == 200
    assert "message" in r_default.json()


def test_get_api_keys(client):
    token = create_access_token({"sub": "admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.get("/api/api_keys", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_create_provider_key(client):
    token = create_access_token({"sub": "admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    r2 = client.post("/api/provider_keys", headers=headers, json={"provider_name": "openai", "api_key": "sk-dummy-openai-key"})
    assert r2.status_code == 200
    # The API key in response might be masked, but checking status is fine
    assert "id" in r2.json()

from unittest.mock import AsyncMock, patch

def test_oidc_provider(client):
    token = create_access_token({"sub": "admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    provider_data = {
        "name": "Okta",
        "client_id": "test-id-okta",
        "client_secret": "test-secret-okta",
        "discovery_url": "https://dev-123.okta.com/.well-known/openid-configuration"
    }
    r2 = client.post("/api/oidc_providers", headers=headers, json=provider_data)
    assert r2.status_code == 200
    prov_id = r2.json()["id"]
    
    with patch("app.api.endpoints.auth.get_oidc_endpoints", new_callable=AsyncMock) as mock_get_endpoints:
        mock_get_endpoints.return_value = {
            "authorization_endpoint": "https://dev-123.okta.com/oauth2/v1/authorize",
            "token_endpoint": "https://dev-123.okta.com/oauth2/v1/token",
            "jwks_uri": "https://dev-123.okta.com/oauth2/v1/keys"
        }
        # Test redirect
        r3 = client.get(f"/api/login/{prov_id}", follow_redirects=False)
        assert r3.status_code in (302, 303, 307)
        assert "location" in r3.headers


