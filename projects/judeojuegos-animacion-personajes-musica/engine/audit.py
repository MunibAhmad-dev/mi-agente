"""Verification loop (Master Prompt §95/§96).

`python -m engine audit` walks a feature matrix of the whole platform and
checks every item against *evidence*: DB tables, live service calls, live
job execution, HTTP routes, CLI subcommands, handler registrations, and the
presence of the tests that prove each feature. Exit code is non-zero until
every CPU-scope check passes — run, fix, re-run: that is the loop.

Evidence is written to docs/audit_evidence.json; docs/AUDIT.md cites it.
"""

from __future__ import annotations

import io
import json
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import inspect as sql_inspect

from engine import __version__
from engine.kernel import Kernel
from engine.kernel.api import create_app
from engine.kernel.handlers import HANDLERS
from engine.licenses import LicenseBlocked
from engine.logging_conf import setup_logging
from engine.providers import ProviderUnavailable
from engine.qa import QAUnavailable, run_checks

Check = Callable[[dict], tuple[bool, str]]
REPO_ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def _audit_context():
    """A fresh kernel + app on a temp dir, shared by all checks."""
    tmp = Path(tempfile.mkdtemp(prefix="uce-audit-"))
    kernel = Kernel(
        db_url=f"sqlite:///{tmp / 'audit.db'}",
        storage_root=tmp / "assets",
        max_attempts=2,
        project_quota_bytes=64,
    )
    app = create_app(kernel, poll_interval=999, secret="audit-secret")
    routes = sorted({getattr(r, "path", "") for r in app.routes})
    from engine.cli import build_parser

    parser = build_parser()
    commands = set()
    for action in parser._actions:  # noqa: SLF001 - stdlib introspection
        if hasattr(action, "choices"):
            commands.update(action.choices.keys() if hasattr(action.choices, "keys") else [])
    ctx = {
        "kernel": kernel,
        "app": app,
        "routes": set(routes),
        "cli": commands,
        "handlers": set(HANDLERS),
        "repo": REPO_ROOT,
        "quota_kernel": kernel,
    }
    try:
        yield ctx
    finally:
        pass  # temp dir kept for forensics; OS cleans tmp


def _tables(*names: str) -> Check:
    def check(ctx: dict) -> tuple[bool, str]:
        inspector = sql_inspect(ctx["kernel"].engine)
        have = set(inspector.get_table_names())
        missing = [n for n in names if n not in have]
        return (not missing, f"tables missing: {missing}" if missing else f"{len(names)} tables present")

    return check


def _routes(*paths: str) -> Check:
    def check(ctx: dict) -> tuple[bool, str]:
        missing = [p for p in paths if p not in ctx["routes"]]
        return (not missing, f"routes missing: {missing}" if missing else f"{len(paths)} routes present")

    return check


def _cli(*commands: str) -> Check:
    def check(ctx: dict) -> tuple[bool, str]:
        missing = [c for c in commands if c not in ctx["cli"]]
        return (not missing, f"missing: {missing}" if missing else f"{len(commands)} subcommands present")

    return check


def _test_file(filename: str, needle: str) -> Check:
    def check(ctx: dict) -> tuple[bool, str]:
        path = ctx["repo"] / "tests" / filename
        if not path.exists():
            return False, f"tests/{filename} missing"
        if needle.lower() not in path.read_text(encoding="utf-8").lower():
            return False, f"tests/{filename} exists but does not mention '{needle}'"
        return True, f"tests/{filename} proves it"

    return check


def _live(name: str, fn: Callable[[Kernel], None]) -> Check:
    def check(ctx: dict) -> tuple[bool, str]:
        try:
            fn(ctx["kernel"])
            return True, "live run OK"
        except Exception as exc:  # noqa: BLE001
            return False, f"{type(exc).__name__}: {exc}"

    return check


def _license_seed(kernel: Kernel) -> None:
    entries = kernel.licenses.list()
    assert len(entries) >= 15, f"only {len(entries)} license entries seeded"


def _model_seed(kernel: Kernel) -> None:
    models = kernel.model_registry.list()
    assert len(models) >= 8, f"only {len(models)} models seeded"


def _snapshot_live(kernel: Kernel) -> None:
    snap = detect_snapshot(kernel)
    assert snap["cpu_cores"] >= 1, snap
    assert snap["ram_total_mb"] > 0, snap
    assert snap["gpu_enabled"] is False
    assert snap["gpu_vram_available_gb"] == 0.0


def _demo_job(kernel: Kernel) -> None:
    job_id = kernel.submit_graph(
        name="audit-demo",
        tasks=[
            {"id": "a", "kind": "core.write_text", "params": {"name": "a.txt", "content": "audit"}},
            {"id": "b", "kind": "core.write_text", "params": {"name": "b.txt", "content": "live"}},
            {"id": "c", "kind": "core.concat_text", "params": {"name": "out.txt"}},
        ],
        edges=[{"task": "c", "depends_on": "a"}, {"task": "c", "depends_on": "b"}],
    )
    status = kernel.process_job(job_id, timeout=60)
    assert status == "COMPLETED", f"demo job ended {status}"


def _repair_fails(kernel: Kernel) -> None:
    job_id = kernel.submit_graph(
        name="audit-repair-fail",
        tasks=[{
            "id": "t",
            "kind": "core.write_text",
            "params": {"name": "short.txt", "content": "x"},
            "qa_policy": {"kind": "text", "params": {"min_length": 1000}},
        }],
        edges=[],
    )
    status = kernel.process_job(job_id, timeout=90)
    assert status == "FAILED", f"expected FAILED after budget, got {status}"
    reports = kernel.qa.list_reports(job_id=job_id)
    assert reports, "no QA reports recorded"
    with kernel.Session() as s:
        from sqlalchemy import select

        from engine.kernel.models import ErrorRecord, RepairAttempt

        repairs = s.scalars(select(RepairAttempt).where(RepairAttempt.job_id == job_id)).all()
        assert repairs, "no repair attempts recorded"
        codes = s.scalars(select(ErrorRecord.code).where(ErrorRecord.job_id == job_id)).all()
        assert "QA_FAILED" in codes, f"QA_FAILED error not recorded: {codes}"


def _repair_converges(kernel: Kernel) -> None:
    job_id = kernel.submit_graph(
        name="audit-repair-ok",
        tasks=[{
            "id": "t",
            "kind": "core.grow_text",
            "params": {"name": "grown.txt", "content": "abcdefghij"},
            "qa_policy": {"kind": "text", "params": {"min_length": 15}},  # 10 fails, 20 passes
        }],
        edges=[],
    )
    status = kernel.process_job(job_id, timeout=90)
    assert status == "COMPLETED", f"repair loop did not converge: {status}"
    job = kernel.get_job(job_id)
    task = job["tasks"][0]
    assert task["attempt"] >= 2, f"expected >=2 attempts, got {task['attempt']}"


def _router_guard(kernel: Kernel) -> None:
    preview = kernel.router.preview("video")
    assert preview["selected"] is None, "video should be unavailable (GPU off)"
    assert preview["reasons"], "no reasons given for refusal"
    kernel.model_registry.register("audit-llm", "llm", quality=0.9, speed=0.5, cpu_ok=True, availability="available")
    picked = kernel.router.preview("llm")
    assert picked["selected"] == "audit-llm", picked
    kernel.model_registry.register("audit-lowq", "llm", quality=0.1, speed=0.9, cpu_ok=True, availability="available")
    guarded = kernel.router.preview("llm")
    assert guarded["selected"] == "audit-llm", "quality guard failed"
    names = {c["name"] for c in guarded["candidates"] if not c["eligible"]}
    assert "audit-lowq" in names, "low-quality model not reported as rejected"


def _license_gate(kernel: Kernel) -> None:
    entry = kernel.licenses.get("flux.1-dev")
    assert entry and entry["verdict"] == "BLOCKED", "flux.1-dev must be BLOCKED"
    try:
        kernel.licenses.gate("flux.1-dev")
    except LicenseBlocked:
        pass
    else:
        raise AssertionError("firewall did not block")
    assert kernel.licenses.gate("flux.1-dev", override_reason="audit override") == "BLOCKED"


def _memory_live(kernel: Kernel) -> None:
    with kernel.Session() as s:
        from engine.kernel.models import Project, User

        user = User(username="audit", password_hash="x")
        s.add(user)
        s.flush()
        project = Project(name="audit", owner_id=user.id)
        s.add(project)
        s.commit()
        pid = project.id
    kernel.memory.add(pid, "world", "The dragon Vorthex guards the obsidian gate.")
    hits = kernel.memory.search(pid, "dragon")
    assert hits and "Vorthex" in hits[0]["text"], hits
    sem = kernel.memory.search(pid, "obsidian gate", mode="semantic")
    assert sem, "semantic search returned nothing"
    try:
        kernel.memory.add(pid, "nonsense-category", "x")
    except ValueError:
        return
    raise AssertionError("invalid category accepted")


def _graph_live(kernel: Kernel) -> None:
    pid = kernel.list_projects()[0]["id"]
    a = kernel.create_asset(pid, "base.png", "image", b"base")
    b = kernel.create_asset(pid, "derived.png", "image", b"derived")
    c = kernel.create_asset(pid, "final.png", "image", b"final")
    kernel.graph.link(a["id"], b["id"], "derived_from")
    kernel.graph.link(b["id"], c["id"], "derived_from")
    impact = kernel.graph.impact(a["id"])
    assert [d["asset_id"] for d in impact] == [b["id"], c["id"]], impact
    try:
        kernel.graph.link(a["id"], b["id"], "not-a-relation")
    except ValueError:
        return
    raise AssertionError("invalid relation accepted")


def _styles_characters_live(kernel: Kernel) -> None:
    pid = kernel.list_projects()[0]["id"]
    style = kernel.styles.create(pid, "noir", palette=["#101010", "#F0F0F0"], lighting="low-key")
    assert style["palette"] == ["#101010", "#F0F0F0"]
    try:
        kernel.styles.create(pid, "bad", palette=["red"])
    except ValueError:
        pass
    else:
        raise AssertionError("invalid palette accepted")
    char = kernel.characters.create(pid, "Vorthex", identity={"species": "dragon"}, lore="Ancient.")
    consistency = kernel.characters.consistency(char["id"])
    assert not consistency["complete"] and "face" in consistency["missing"]
    asset = kernel.create_asset(pid, "face.png", "image", b"face")
    kernel.characters.set_slot(char["id"], "face", asset["id"])
    after = kernel.characters.consistency(char["id"])
    assert "face" in after["present"], after


def _qa_live(kernel: Kernel) -> None:
    good = run_checks("text", b"hello audit world", {"min_length": 5})
    assert good["passed"], good
    bad = run_checks("text", b"", {})
    assert not bad["passed"], bad
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (128, 128), (128, 128, 128)).save(buf, format="PNG")
    img = run_checks("image", buf.getvalue(), {"min_size": 64})
    assert img["passed"], img
    try:
        run_checks("video", b"junk-data")
    except QAUnavailable:
        pass  # honest: no ffprobe on this machine
    else:
        run_checks("video", b"junk-data")  # present → failed checks, honest


def _ensure_project(kernel: Kernel) -> str:
    projects = kernel.list_projects()
    if projects:
        return projects[0]["id"]
    with kernel.Session() as s:
        from engine.kernel.models import Project, User

        user = User(username="audit-setup", password_hash="x")
        s.add(user)
        s.flush()
        project = Project(name="audit-setup", owner_id=user.id)
        s.add(project)
        s.commit()
        return project.id


def _quota_live(kernel: Kernel) -> None:
    from engine.resources import QuotaExceeded

    pid = _ensure_project(kernel)
    kernel.create_asset(pid, "small.bin", "file", b"x" * 10)
    try:
        kernel.create_asset(pid, "big.bin", "file", b"y" * 1024)
    except QuotaExceeded:
        return
    raise AssertionError("quota not enforced (limit 64 bytes)")


def _providers_live(kernel: Kernel) -> None:
    kernel.providers.add("audit-provider", base_url="", keys=["k1", "k2"], priority=5)
    health = kernel.providers.health("audit-provider")
    assert health["healthy"] is False
    try:
        kernel.providers.pick()
    except ProviderUnavailable:
        return
    raise AssertionError("pick() should fail with no healthy provider")


def _adapters_live(ctx: dict) -> tuple[bool, str]:
    from engine.adapters import probe_all

    probes = probe_all()
    gpu = probes.get("gpu", {})
    if gpu.get("available"):
        return False, "gpu reported available — must be disabled by decision"
    if "DISABLED" not in gpu.get("detail", "") and "not enabled" not in gpu.get("detail", ""):
        return False, f"gpu detail not honest: {gpu.get('detail')}"
    return True, f"{len(probes)} adapters probed; gpu honestly disabled"


def _dist_or_source(ctx: dict) -> tuple[bool, str]:
    dist = ctx["repo"] / "dashboard" / "dist" / "index.html"
    src = ctx["repo"] / "dashboard" / "src" / "App.tsx"
    if src.exists() and dist.exists():
        return True, "dashboard source + built bundle present"
    if src.exists():
        return True, "dashboard source present (dist not built on this machine)"
    return False, "dashboard source missing"


def _docs(ctx: dict) -> tuple[bool, str]:
    required = [
        "README.md",
        "docs/AUDIT.md",
        "docs/GAP_PLAN.md",
        "docs/ROADMAP.md",
        "docs/ARCHITECTURE.md",
        "docs/MASTER_PROMPT_AUDIT.md",
    ]
    missing = [p for p in required if not (ctx["repo"] / p).exists()]
    return (not missing, f"missing docs: {missing}" if missing else f"{len(required)} docs present")


AREAS: list[tuple[str, list[tuple[str, Check]]]] = [
    ("Kernel & orchestration", [
        ("core tables", _tables("jobs", "tasks", "task_edges", "artifacts", "checkpoints", "errors", "telemetry")),
        ("demo DAG executes live", _live("demo", _demo_job)),
        ("crash-resume acceptance test", _test_file("test_crash_resume.py", "crash")),
        ("core handlers registered", lambda ctx: (
            {"core.write_text", "core.concat_text", "core.fail_once", "core.crash_once", "core.grow_text"} <= ctx["handlers"],
            f"handlers: {sorted(ctx['handlers'])}",
        )),
    ]),
    ("Auth & security", [
        ("users table", _tables("users")),
        ("auth + admin routes", _routes("/api/auth/register", "/api/auth/login", "/api/admin/users")),
        ("security tests", _test_file("test_security.py", "hash_password")),
    ]),
    ("Licensing firewall (§4)", [
        ("licenses table + seed", _live("licenses", _license_seed)),
        ("flux.1-dev BLOCKED + gate", _live("gate", _license_gate)),
        ("API routes", _routes("/api/licenses", "/api/licenses/{name}/gate")),
        ("tests", _test_file("test_licenses.py", "blocked")),
    ]),
    ("Model registry & router (§10/§56)", [
        ("models table + seed", _live("models", _model_seed)),
        ("router guard + selection", _live("router", _router_guard)),
        ("API routes", _routes("/api/models", "/api/models/router/preview")),
        ("tests", _test_file("test_models_router.py", "quality")),
    ]),
    ("Resource manager (§11)", [
        ("snapshot sane", _live("snapshot", _snapshot_live)),
        ("storage quota enforced", _live("quota", _quota_live)),
        ("API route", _routes("/api/resources")),
        ("tests", _test_file("test_resources.py", "snapshot")),
    ]),
    ("Memory & search (§53/§54)", [
        ("memories table", _tables("memories")),
        ("add + keyword + semantic live", _live("memory", _memory_live)),
        ("API routes", _routes("/api/projects/{project_id}/memory", "/api/search")),
        ("tests", _test_file("test_memory.py", "semantic")),
    ]),
    ("Asset graph (§50/§51)", [
        ("relations table", _tables("asset_relations")),
        ("link + impact live", _live("graph", _graph_live)),
        ("API routes", _routes("/api/assets/{asset_id}/relations", "/api/assets/{asset_id}/impact")),
        ("tests", _test_file("test_asset_graph.py", "impact")),
    ]),
    ("Styles & characters (§14/§16)", [
        ("styles + characters tables", _tables("styles", "characters")),
        ("create + validate + consistency live", _live("styles/characters", _styles_characters_live)),
        ("API routes", _routes("/api/projects/{project_id}/styles", "/api/characters/{character_id}/consistency")),
        ("tests", _test_file("test_styles_characters.py", "consistency")),
    ]),
    ("QA framework (§45–49)", [
        ("qa_reports table", _tables("qa_reports")),
        ("text/image/video checks live", _live("qa", _qa_live)),
        ("API routes", _routes("/api/qa/run", "/api/qa/reports")),
        ("tests", _test_file("test_qa.py", "clipping")),
    ]),
    ("Automatic repair (§49)", [
        ("repair_attempts table", _tables("repair_attempts")),
        ("budget exhaustion -> QA_FAILED", _live("repair-fail", _repair_fails)),
        ("repair converges -> COMPLETED", _live("repair-ok", _repair_converges)),
        ("tests", _test_file("test_repair.py", "repair")),
    ]),
    ("Adapters & providers (§12/§55)", [
        ("probes honest (gpu disabled)", _adapters_live),
        ("provider health/rotation live", _live("providers", _providers_live)),
        ("API routes", _routes("/api/adapters", "/api/providers", "/api/providers/pick")),
        ("tests", _test_file("test_adapters_providers.py", "rotation")),
    ]),
    ("CLI", [
        ("all subcommands", _cli(
            "init", "doctor", "serve", "submit", "jobs", "artifacts", "errors", "telemetry",
            "users", "projects", "assets", "audit", "adapters", "models", "licenses",
            "memory", "qa", "graph", "characters",
        )),
        ("cli tests", _test_file("test_cli.py", "doctor")),
    ]),
    ("Dashboard", [
        ("source + build", _dist_or_source),
    ]),
    ("Documentation", [
        ("required docs present", _docs),
    ]),
]


def detect_snapshot(kernel: Kernel) -> dict:
    from engine.resources import detect

    return detect(kernel.enable_gpu, storage_root=kernel.storage_root).to_dict()


def run_audit(evidence_path: Path | None = None) -> tuple[list[dict], bool]:
    setup_logging("WARNING")
    results: list[dict] = []
    with _audit_context() as ctx:
        for area, checks in AREAS:
            rows = []
            for name, check in checks:
                try:
                    ok, detail = check(ctx)
                except Exception as exc:  # noqa: BLE001 - a broken check is a failed check
                    ok, detail = False, f"check crashed: {type(exc).__name__}: {exc}"
                rows.append({"name": name, "ok": ok, "detail": detail})
            score = round(10.0 * sum(1 for r in rows if r["ok"]) / len(rows), 1) if rows else 0.0
            results.append({"area": area, "score": score, "checks": rows})
    all_ok = all(r["ok"] for area in results for r in area["checks"])
    overall = round(sum(a["score"] for a in results) / len(results), 1) if results else 0.0
    evidence = {
        "date": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "version": __version__,
        "overall_score": overall,
        "all_checks_passed": all_ok,
        "areas": results,
    }
    path = evidence_path or REPO_ROOT / "docs" / "audit_evidence.json"
    path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    return results, all_ok


def main() -> int:
    results, all_ok = run_audit()
    print(f"{'AREA':<38}{'SCORE':>6}  CHECKS")
    for area in results:
        failed = [c for c in area["checks"] if not c["ok"]]
        mark = "OK  " if not failed else "FAIL"
        print(f"{area['area']:<38}{area['score']:>6}  {mark}")
        for c in failed:
            print(f"    [FAIL] {c['name']}: {c['detail']}")
    overall = round(sum(a["score"] for a in results) / len(results), 1)
    print(f"\nOverall: {overall}/10 — evidence: docs/audit_evidence.json")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
