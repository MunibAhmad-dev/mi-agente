"""Live HTTP smoke test — run against a real server process.

Usage:
    python scripts/smoke.py http://127.0.0.1:8901

Covers: health, auth, projects, assets, memory+search, asset graph, characters,
styles, models/router preview, providers, QA, and a real job WITH a QA policy
(plus a repair-loop convergence job) — all over HTTP, no test clients.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8901"
TOKEN = ""


def call(method: str, path: str, body: dict | None = None, raw: bytes | None = None):
    global TOKEN
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = resp.read()
        return json.loads(payload) if payload and payload[:1] in (b"{", b"[") else payload


def wait_terminal(job_id: str, timeout: float = 90) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = call("GET", f"/api/jobs/{job_id}")
        if job["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
            return job
        time.sleep(0.3)
    raise TimeoutError(f"job {job_id} did not finish")


def main() -> int:
    global TOKEN
    print("1. health:", call("GET", "/health")["status"])

    user = call("POST", "/api/auth/register", {"username": f"smoke{int(time.time())}", "password": "smoke-pass-123"})
    login = call("POST", "/api/auth/login", {"username": user["username"], "password": "smoke-pass-123"})
    TOKEN = login["token"]
    print("2. auth:", login["user"]["role"], "(first user = ADMIN)")

    project = call("POST", "/api/projects", {"name": "smoke-project", "description": "live smoke"})
    pid = project["id"]
    print("3. project:", project["name"])

    asset = call("POST", f"/api/projects/{pid}/assets?name=face.txt&kind=image", raw=b"face-reference")
    print("4. asset:", asset["name"], "v" + str(asset["version"]))

    call("POST", f"/api/projects/{pid}/memory", {"category": "world", "text": "The dragon Vorthex guards the obsidian gate."})
    hits = call("POST", f"/api/projects/{pid}/memory/search", {"query": "dragon", "mode": "keyword"})["results"]
    assert hits and "Vorthex" in hits[0]["text"]
    print("5. memory search: OK ->", hits[0]["text"][:40])

    style = call("POST", f"/api/projects/{pid}/styles", {"name": "noir", "palette": ["#101010"], "lighting": "low-key"})
    char = call("POST", f"/api/projects/{pid}/characters", {"name": "Vorthex", "lore": "Ancient."})
    consistency = call("GET", f"/api/characters/{char['id']}/consistency")
    assert not consistency["complete"] and "face" in consistency["missing"]
    call("POST", f"/api/characters/{char['id']}/slots", {"slot": "face", "asset_id": asset["id"]})
    after = call("GET", f"/api/characters/{char['id']}/consistency")
    assert "face" in after["present"]
    print("6. style + character slots:", style["name"], "-> consistency OK")

    derived = call("POST", f"/api/projects/{pid}/assets?name=derived.txt&kind=image", raw=b"derived-face")
    call("POST", f"/api/assets/{asset['id']}/relations", {"to_id": derived["id"], "relation": "derived_from"})
    impact = call("GET", f"/api/assets/{asset['id']}/impact")["impact"]
    assert impact and impact[0]["asset_id"] == derived["id"]
    print("7. asset graph impact: OK,", len(impact), "dependent(s)")

    preview = call("GET", "/api/models/router/preview?modality=video&mode=QUALITY")
    assert preview["selected"] is None and preview["reasons"]
    print("8. router preview: honest refusal,", len(preview["reasons"]), "reason(s) (GPU off)")

    call("POST", "/api/providers", {"name": "smoke-prov", "base_url": "", "keys": ["k1"]})
    health = call("POST", "/api/providers/smoke-prov/health")
    assert health["healthy"] is False
    print("9. provider health: honestly unhealthy (no base_url)")

    qa = call("POST", "/api/qa/run", {"kind": "text", "subject_kind": "asset", "subject_id": asset["id"], "params": {"min_length": 5}})
    assert qa["passed"] is True
    print("10. QA run on asset: passed, score", qa["score"])

    job = call("POST", "/api/jobs", {
        "name": "smoke-qa-job", "project_id": pid,
        "tasks": [{"id": "t", "kind": "core.write_text", "params": {"name": "out.txt", "content": "x" * 50},
                   "qa_policy": {"kind": "text", "params": {"min_length": 40}}}],
        "edges": [],
    })
    done = wait_terminal(job["id"])
    assert done["status"] == "COMPLETED", done
    reports = call("GET", f"/api/qa/reports?job_id={job['id']}")["reports"]
    assert reports and reports[-1]["passed"]
    print("11. job with QA policy: COMPLETED,", len(reports), "QA report(s)")

    repair = call("POST", "/api/jobs", {
        "name": "smoke-repair-job", "project_id": pid,
        "tasks": [{"id": "g", "kind": "core.grow_text", "params": {"name": "grown.txt", "content": "abcdefghij"},
                   "qa_policy": {"kind": "text", "params": {"min_length": 15}}}],
        "edges": [],
    })
    done = wait_terminal(repair["id"])
    assert done["status"] == "COMPLETED" and done["tasks"][0]["attempt"] >= 2, done
    print("12. repair loop over HTTP: converged on attempt", done["tasks"][0]["attempt"])

    adapters = call("GET", "/api/adapters")["adapters"]
    assert adapters["gpu"]["available"] is False
    print("13. adapters: gpu honestly disabled")

    print("\nSMOKE TEST PASSED — all flows real, zero fakes.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        print(f"SMOKE FAILED: HTTP {exc.code} {exc.url}: {exc.read().decode()[:400]}")
        raise SystemExit(1)
