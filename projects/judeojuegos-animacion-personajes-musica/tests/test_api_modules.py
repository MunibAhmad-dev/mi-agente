"""Extended API surface tests."""

from __future__ import annotations

from tests.conftest import make_project, register_login


def test_resources_and_adapters(client):
    headers = register_login(client)
    resources = client.get("/api/resources", headers=headers).json()
    assert resources["cpu_cores"] >= 1
    assert resources["gpu_enabled"] is False
    adapters = client.get("/api/adapters", headers=headers).json()["adapters"]
    assert adapters["gpu"]["available"] is False


def test_licenses_endpoints(client):
    headers = register_login(client)
    assert len(client.get("/api/licenses", headers=headers).json()["licenses"]) >= 15
    blocked = client.get("/api/licenses/flux.1-dev", headers=headers).json()
    assert blocked["verdict"] == "BLOCKED"
    # Gate refuses without override (structured 422), passes with one.
    refused = client.post("/api/licenses/flux.1-dev/gate", json={}, headers=headers)
    assert refused.status_code == 422
    allowed = client.post(
        "/api/licenses/flux.1-dev/gate", json={"override_reason": "audit"}, headers=headers
    )
    assert allowed.status_code == 200 and allowed.json()["verdict"] == "BLOCKED"
    # Only admins may add entries (second user is a normal USER).
    user_headers = register_login(client)
    denied = client.post(
        "/api/licenses", json={"name": "nope", "verdict": "APPROVED"}, headers=user_headers
    )
    assert denied.status_code == 403


def test_models_and_router_preview(client):
    headers = register_login(client)
    models = client.get("/api/models", headers=headers).json()["models"]
    assert len(models) >= 8
    preview = client.get(
        "/api/models/router/preview", params={"modality": "video", "mode": "QUALITY"}, headers=headers
    ).json()
    assert preview["selected"] is None and preview["reasons"]
    preview_llm = client.get(
        "/api/models/router/preview", params={"modality": "llm"}, headers=headers
    ).json()
    assert "candidates" in preview_llm


def test_memory_endpoints(client):
    headers = register_login(client)
    pid = make_project(client.app.state.kernel)
    resp = client.post(
        f"/api/projects/{pid}/memory",
        json={"category": "world", "text": "The dragon Vorthex guards the gate.", "key": "vorthex"},
        headers=headers,
    )
    assert resp.status_code == 201
    bad = client.post(
        f"/api/projects/{pid}/memory", json={"category": "nope", "text": "x"}, headers=headers
    )
    assert bad.status_code == 422
    search = client.post(
        f"/api/projects/{pid}/memory/search",
        json={"query": "dragon", "mode": "keyword"},
        headers=headers,
    ).json()
    assert search["results"] and "Vorthex" in search["results"][0]["text"]
    unified = client.get(
        "/api/search", params={"project_id": pid, "q": "dragon"}, headers=headers
    ).json()
    assert "memory" in unified and "assets" in unified


def test_graph_endpoints(client):
    headers = register_login(client)
    kernel = client.app.state.kernel
    pid = make_project(kernel)
    a = kernel.create_asset(pid, "a.png", "image", b"a")
    b = kernel.create_asset(pid, "b.png", "image", b"b")
    linked = client.post(
        f"/api/assets/{a['id']}/relations", json={"to_id": b["id"], "relation": "derived_from"}, headers=headers
    )
    assert linked.status_code == 201
    impact = client.get(f"/api/assets/{a['id']}/impact", headers=headers).json()
    assert impact["impact"][0]["asset_id"] == b["id"]
    bad = client.post(
        f"/api/assets/{a['id']}/relations", json={"to_id": b["id"], "relation": "magic"}, headers=headers
    )
    assert bad.status_code == 422


def test_styles_and_characters_endpoints(client):
    headers = register_login(client)
    kernel = client.app.state.kernel
    pid = make_project(kernel)
    style = client.post(
        f"/api/projects/{pid}/styles",
        json={"name": "noir", "palette": ["#101010"], "lighting": "low-key"},
        headers=headers,
    )
    assert style.status_code == 201
    assert client.post(
        f"/api/projects/{pid}/styles", json={"name": "bad", "palette": ["red"]}, headers=headers
    ).status_code == 422

    char = client.post(
        f"/api/projects/{pid}/characters", json={"name": "Vorthex", "lore": "Dragon."}, headers=headers
    ).json()
    consistency = client.get(f"/api/characters/{char['id']}/consistency", headers=headers).json()
    assert consistency["complete"] is False and "face" in consistency["missing"]
    face = kernel.create_asset(pid, "face.png", "image", b"f")
    slotted = client.post(
        f"/api/characters/{char['id']}/slots", json={"slot": "face", "asset_id": face["id"]}, headers=headers
    )
    assert slotted.status_code == 200
    after = client.get(f"/api/characters/{char['id']}/consistency", headers=headers).json()
    assert "face" in after["present"]


def test_qa_endpoints(client):
    headers = register_login(client)
    kernel = client.app.state.kernel
    pid = make_project(kernel)
    asset = kernel.create_asset(pid, "note.txt", "text", b"well-formed long enough text")
    ok = client.post(
        "/api/qa/run",
        json={"kind": "text", "subject_kind": "asset", "subject_id": asset["id"], "params": {"min_length": 5}},
        headers=headers,
    )
    assert ok.status_code == 200 and ok.json()["passed"] is True
    reports = client.get("/api/qa/reports", headers=headers).json()["reports"]
    assert reports and reports[0]["subject_id"] == asset["id"]
    # video QA without ffprobe must fail honestly, never fake a pass
    video = client.post(
        "/api/qa/run",
        json={"kind": "video", "subject_kind": "asset", "subject_id": asset["id"]},
        headers=headers,
    )
    assert video.status_code == 422
    bad_kind = client.post(
        "/api/qa/run", json={"kind": "vibes", "subject_kind": "asset", "subject_id": asset["id"]}, headers=headers
    )
    assert bad_kind.status_code == 422


def test_providers_endpoints(client):
    headers = register_login(client)
    added = client.post(
        "/api/providers",
        json={"name": "prov", "base_url": "", "keys": ["k1"], "priority": 2},
        headers=headers,
    )
    assert added.status_code == 201
    health = client.post("/api/providers/prov/health", headers=headers)
    assert health.status_code == 200 and health.json()["healthy"] is False
    pick = client.post("/api/providers/pick", headers=headers)
    assert pick.status_code == 409  # honest: nothing healthy
    user_headers = register_login(client)
    denied = client.post("/api/providers", json={"name": "u"}, headers=user_headers)
    assert denied.status_code == 403  # admin only
