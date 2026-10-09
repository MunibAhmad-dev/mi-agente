from tests.conftest import register_login


def _project(client, headers, name="My Game", description="A demo"):
    resp = client.post("/api/projects", json={"name": name, "description": description}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_project_crud(client):
    admin = register_login(client, "root")
    project = _project(client, admin, name="My Game")
    pid = project["id"]
    assert project["status"] == "ACTIVE"
    assert project["asset_count"] == 0

    listed = client.get("/api/projects", headers=admin).json()["projects"]
    assert len(listed) == 1

    patched = client.patch(f"/api/projects/{pid}", json={"name": "Renamed"}, headers=admin)
    assert patched.json()["name"] == "Renamed"

    archived = client.post(f"/api/projects/{pid}/archive", headers=admin)
    assert archived.json()["status"] == "ARCHIVED"

    assert client.get("/api/projects/nope", headers=admin).status_code == 404


def test_project_ownership_isolation(client):
    admin = register_login(client, "root")
    user = register_login(client, "peon")

    project = _project(client, admin)
    pid = project["id"]

    # A normal user does not see or touch the admin's project.
    assert client.get("/api/projects", headers=user).json()["projects"] == []
    assert client.get(f"/api/projects/{pid}", headers=user).status_code == 403
    assert client.patch(f"/api/projects/{pid}", json={"name": "hijack"}, headers=user).status_code == 403
    assert client.post(f"/api/projects/{pid}/archive", headers=user).status_code == 403

    # Admin sees everything.
    assert len(client.get("/api/projects", headers=admin).json()["projects"]) == 1


def test_project_name_validation(client):
    admin = register_login(client, "root")
    resp = client.post("/api/projects", json={"name": "   "}, headers=admin)
    assert resp.status_code == 422