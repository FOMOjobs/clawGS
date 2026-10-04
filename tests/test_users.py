import pytest
from app.core.security import create_access_token
from app.models.user import User
from app.db.session import SessionLocal

def test_users_rbac(client):
    # Setup users via client login which creates admin
    login_resp = client.post("/api/login", json={"username": "admin", "password": "admin"})
    assert login_resp.status_code == 200
    admin_token = login_resp.json()["access_token"]
    
    # We need a standard user in db
    # We can create one manually directly in test client by some means or via db session
    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    std_user = User(username="standard_test", role="AIOwner")
    db.add(std_user)
    db.commit()
    std_id = std_user.id
    db.close()
    
    std_token = create_access_token({"sub": "standard_test"})
    
    # 2. Get users as admin
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    resp = client.get("/api/users", headers=headers_admin)
    assert resp.status_code == 200
    assert len(resp.json()) >= 2
    
    # 4. Try to access /api/users as standard user (should fail)
    headers_std = {"Authorization": f"Bearer {std_token}"}
    resp_std = client.get("/api/users", headers=headers_std)
    assert resp_std.status_code == 403
    
    # 5. Admin sets standard user to admin
    resp_put = client.put(f"/api/users/{std_id}/role", headers=headers_admin, json={"role": "admin"})
    assert resp_put.status_code == 200
    
    # 6. Try to access /api/users as the newly minted admin
    resp_std_new = client.get("/api/users", headers=headers_std)
    assert resp_std_new.status_code == 200
    
    # 7. Admin sets standard user back to AIOwner
    resp_put2 = client.put(f"/api/users/{std_id}/role", headers=headers_admin, json={"role": "AIOwner"})
    assert resp_put2.status_code == 200
