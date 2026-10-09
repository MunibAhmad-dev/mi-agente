import hashlib

from tests.conftest import register_login


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def test_asset_versions_and_rollback(client):
    admin = register_login(client, "root")
    pid = client.post("/api/projects", json={"name": "Assets"}, headers=admin).json()["id"]

    v1 = client.post(f"/api/projects/{pid}/assets?name=data.bin&kind=file", content=b"version-one", headers=admin)
    assert v1.status_code == 201, v1.text
    asset = v1.json()
    assert asset["version"] == 1
    assert asset["sha256"] == _sha(b"version-one")

    content = client.get(f"/api/assets/{asset['id']}/content", headers=admin)
    assert content.content == b"version-one"

    v2 = client.post(f"/api/assets/{asset['id']}/versions?note=second", content=b"version-two", headers=admin)
    assert v2.status_code == 201
    assert v2.json()["version"] == 2
    assert v2.json()["sha256"] == _sha(b"version-two")

    versions = client.get(f"/api/assets/{asset['id']}/versions", headers=admin).json()["versions"]
    assert [v["version"] for v in versions] == [1, 2]

    rolled = client.post(f"/api/assets/{asset['id']}/rollback", json={"version": 1}, headers=admin)
    assert rolled.json()["sha256"] == _sha(b"version-one")
    assert rolled.json()["version"] == 1
    assert client.get(f"/api/assets/{asset['id']}/content", headers=admin).content == b"version-one"

    # Unknown version → 422; unknown asset → 404.
    assert client.post(f"/api/assets/{asset['id']}/rollback", json={"version": 99}, headers=admin).status_code == 422
    assert client.get("/api/assets/nope", headers=admin).status_code == 404


def test_asset_ownership_isolation(client):
    admin = register_login(client, "root")
    user = register_login(client, "peon")
    pid = client.post("/api/projects", json={"name": "Assets"}, headers=admin).json()["id"]
    asset = client.post(f"/api/projects/{pid}/assets?name=x.bin", content=b"secret", headers=admin).json()

    assert client.get(f"/api/assets/{asset['id']}", headers=user).status_code == 403
    assert client.get(f"/api/assets/{asset['id']}/content", headers=user).status_code == 403
    assert client.post(f"/api/assets/{asset['id']}/versions", content=b"x", headers=user).status_code == 403
    assert client.get(f"/api/projects/{pid}/assets", headers=user).status_code == 403


def test_asset_listing(client):
    admin = register_login(client, "root")
    pid = client.post("/api/projects", json={"name": "Assets"}, headers=admin).json()["id"]
    client.post(f"/api/projects/{pid}/assets?name=a.txt", content=b"a", headers=admin)
    client.post(f"/api/projects/{pid}/assets?name=b.txt", content=b"b", headers=admin)
    assets = client.get(f"/api/projects/{pid}/assets", headers=admin).json()["assets"]
    assert {a["name"] for a in assets} == {"a.txt", "b.txt"}