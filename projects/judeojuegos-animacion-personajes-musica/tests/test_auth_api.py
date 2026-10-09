from tests.conftest import register_login


def test_first_user_is_admin_second_is_user(client):
    admin = register_login(client, "root")
    me = client.get("/api/auth/me", headers=admin).json()
    assert me["role"] == "ADMIN"

    user_headers = register_login(client, "peon")
    me = client.get("/api/auth/me", headers=user_headers).json()
    assert me["role"] == "USER"


def test_login_failures(client):
    register_login(client, "alice")
    assert client.post("/api/auth/login", json={"username": "alice", "password": "wrongpass"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "ghost", "password": "whatever"}).status_code == 401


def test_duplicate_username_rejected(client):
    register_login(client, "alice")
    resp = client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
    assert resp.status_code == 409


def test_token_required(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_admin_only_endpoints(client):
    admin = register_login(client, "root")
    user = register_login(client, "peon")

    users = client.get("/api/admin/users", headers=admin).json()["users"]
    assert len(users) == 2

    assert client.get("/api/admin/users", headers=user).status_code == 403
    assert client.post("/api/admin/users", json={"username": "newbie", "password": "password123"}, headers=user).status_code == 403

    created = client.post(
        "/api/admin/users", json={"username": "newbie", "password": "password123", "role": "ADMIN"}, headers=admin
    )
    assert created.status_code == 201
    assert created.json()["role"] == "ADMIN"