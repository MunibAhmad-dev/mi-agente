import time

from tests.conftest import register_login


def demo_spec() -> dict:
    return {
        "name": "api-demo",
        "tasks": [
            {"id": "t1", "kind": "core.write_text", "params": {"name": "a.txt", "content": "hello"}},
            {"id": "t2", "kind": "core.write_text", "params": {"name": "b.txt", "content": "world"}},
            {"id": "t3", "kind": "core.concat_text", "params": {"name": "out.txt"}},
        ],
        "edges": [
            {"task": "t3", "depends_on": "t1"},
            {"task": "t3", "depends_on": "t2"},
        ],
    }


def wait_for(client, job_id: str, headers: dict, timeout: float = 60.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/jobs/{job_id}", headers=headers).json()
        if job["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
            return job
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish: {job['status']}")


def test_api_lifecycle(client):
    headers = register_login(client, "alice")
    health = client.get("/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "ok"
    assert body["version"]
    assert body["gpu"] is False  # CPU-only by decision

    created = client.post("/api/jobs", json=demo_spec(), headers=headers)
    assert created.status_code == 201
    job_id = created.json()["id"]

    job = wait_for(client, job_id, headers)
    assert job["status"] == "COMPLETED"
    assert [t["status"] for t in job["tasks"]] == ["COMPLETED"] * 3

    artifacts = client.get(f"/api/artifacts?job_id={job_id}", headers=headers).json()["artifacts"]
    assert len(artifacts) == 3
    out = next(a for a in artifacts if a["name"] == "out.txt")
    content = client.get(f"/api/artifacts/{out['id']}/content", headers=headers)
    assert content.status_code == 200
    assert content.content == b"helloworld"
    assert content.headers["X-Content-Sha256"] == out["sha256"]

    assert client.get(f"/api/errors?job_id={job_id}", headers=headers).json()["errors"] == []
    telemetry = client.get(f"/api/telemetry?job_id={job_id}", headers=headers).json()["telemetry"]
    assert len(telemetry) == 3
    assert all(r["result"] == "COMPLETED" for r in telemetry)

    assert client.get("/api/jobs/nope", headers=headers).status_code == 404
    assert client.post("/api/jobs/nope/resume", headers=headers).status_code == 404


def test_api_requires_auth(client):
    assert client.get("/api/jobs").status_code == 401
    assert client.get("/api/projects").status_code == 401
    assert client.post("/api/jobs", json=demo_spec()).status_code == 401
    assert client.get("/api/assets/x").status_code == 401
    # health stays public
    assert client.get("/health").status_code == 200


def test_api_rejects_invalid_graphs(client):
    headers = register_login(client, "bob")
    bad = client.post(
        "/api/jobs",
        json={"name": "bad", "tasks": [{"id": "a", "kind": "x"}], "edges": [{"task": "a", "depends_on": "a"}]},
        headers=headers,
    )
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "INVALID_GRAPH"
    unknown = client.post(
        "/api/jobs",
        json={"name": "bad", "tasks": [{"id": "a", "kind": "x"}], "edges": [{"task": "a", "depends_on": "ghost"}]},
        headers=headers,
    )
    assert unknown.status_code == 422
    dup = client.post(
        "/api/jobs",
        json={"name": "bad", "tasks": [{"id": "a", "kind": "x"}, {"id": "a", "kind": "y"}]},
        headers=headers,
    )
    assert dup.status_code == 422


def test_unknown_task_kind_is_recorded_not_hidden(client):
    headers = register_login(client, "carol")
    job_id = client.post(
        "/api/jobs",
        json={"name": "bad-kind", "tasks": [{"id": "a", "kind": "core.does_not_exist"}]},
        headers=headers,
    ).json()["id"]
    job = wait_for(client, job_id, headers)
    assert job["status"] == "FAILED"
    errors = client.get(f"/api/errors?job_id={job_id}", headers=headers).json()["errors"]
    assert any(e["code"] == "UNKNOWN_TASK_KIND" and e["suggested_fix"] for e in errors)