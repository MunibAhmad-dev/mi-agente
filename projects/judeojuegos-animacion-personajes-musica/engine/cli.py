"""Command-line interface: `python -m engine <command>`.

Commands:
  init          create the database and storage directories
  doctor        system health report (OS, Python, DB, storage; GPU disabled by decision)
  serve         run the HTTP server
  submit        submit a task graph (JSON file, or --demo)
  jobs          list / show / resume / cancel jobs
  artifacts     list artifacts / cat an artifact's content
  errors        list recorded errors (Master Prompt §71)
  telemetry     list observability rows (Master Prompt §70)
  users         create / list users (first user becomes ADMIN)
  projects      create / list projects
  assets        upload / list / versions / rollback assets
  licenses      list / check the licensing firewall registry
  models        list models / preview a routing decision
  memory        add / search project memory (keyword or semantic)
  graph         link assets / inspect dependency impact
  characters    create characters / check slot consistency
  qa            run CPU QA checks (text/image/audio/model3d) on a file
  adapters      probe external engine availability (ffmpeg, blender, gpu, ...)
  audit         verification loop: checks the whole feature matrix with live evidence

All commands are CPU-only; no GPU integration (user decision 2026-09-07).
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import platform
import shutil
import sys
from pathlib import Path

from engine import __version__
from engine.config import Settings
from engine.kernel import Kernel
from engine.kernel.taskgraph import GraphError
from engine.logging_conf import get_logger, setup_logging

logger = get_logger("cli")


def _kernel(settings: Settings | None = None) -> Kernel:
    settings = settings or Settings()
    return Kernel(db_url=settings.db_url, storage_root=settings.storage_path, max_attempts=settings.max_attempts)


def _print(obj) -> None:
    print(json.dumps(obj, indent=2, ensure_ascii=False))


# ------------------------------------------------------------------- commands


def cmd_init(settings: Settings, _args) -> int:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    kernel = _kernel(settings)
    print(f"database:  {settings.db_url}")
    print(f"storage:   {settings.storage_path}")
    print(f"secret:    {settings.secret_path}")
    print("OK — kernel initialized (CPU-only).")
    return 0


def cmd_doctor(settings: Settings, _args) -> int:
    problems: list[str] = []
    print(f"UCE kernel {__version__} — doctor report")
    print(f"  OS            : {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"  Python        : {platform.python_version()} ({sys.executable})")
    print(f"  GPU           : DISABLED (CPU-only by user decision 2026-09-07)")
    print(f"  Node          : {shutil.which('node') or 'not found'}")
    print(f"  git           : {shutil.which('git') or 'not found'}")

    db_path = Path(settings.db_url.replace("sqlite:///", "", 1))
    if db_path.exists():
        print(f"  database      : {db_path} ({db_path.stat().st_size} bytes)")
    else:
        print(f"  database      : {db_path} (not created yet — run `engine init`)")
        problems.append("database not initialized")

    storage = settings.storage_path
    try:
        storage.mkdir(parents=True, exist_ok=True)
        probe = storage / ".doctor-probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        print(f"  storage       : {storage} (writable)")
    except OSError as exc:
        print(f"  storage       : {storage} (NOT writable: {exc})")
        problems.append("storage not writable")

    if problems:
        print(f"\n{len(problems)} problem(s) found:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("\nAll checks passed.")
    return 0


def cmd_serve(settings: Settings, args) -> int:
    import uvicorn

    from engine.kernel.api import create_app
    from engine.kernel.security import get_or_create_secret

    secret = get_or_create_secret(settings.secret_path)
    kernel = _kernel(settings)
    kernel.secret = secret
    lock = kernel.acquire_instance_lock()
    if lock is None:
        print("another kernel instance is already running on this data dir", file=sys.stderr)
        return 1
    try:
        app = create_app(kernel, poll_interval=settings.poll_interval, secret=secret)
        uvicorn.run(app, host=args.host or settings.host, port=args.port or settings.port, log_level=settings.log_level.lower())
    finally:
        kernel.release_instance_lock()
    return 0


def cmd_backup(settings: Settings, args) -> int:
    from engine.kernel.backup import create_backup, verify_backup

    db_path = Path(settings.db_url.replace("sqlite:///", "", 1))
    if not db_path.exists():
        print(f"database not found: {db_path}", file=sys.stderr)
        return 1
    result = create_backup(db_path, settings.storage_path, Path(args.out))
    print(f"backup written: {result['out_dir']} ({result['blobs']} blobs)")
    check = verify_backup(Path(args.out))  # always verify — an unverified backup is a failed backup
    if check["ok"]:
        print(f"verified: {check['checked']} entries OK")
    else:
        print(f"VERIFICATION FAILED: {check['problems']}", file=sys.stderr)
        return 1
    return 0


def cmd_prune(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    result = kernel.prune(events_days=args.events_days, telemetry_days=args.telemetry_days)
    _print(result)
    return 0


def _demo_spec() -> dict:
    return {
        "name": "demo-concat",
        "tasks": [
            {"id": "a", "kind": "core.write_text", "params": {"name": "a.txt", "content": "hello"}},
            {"id": "b", "kind": "core.write_text", "params": {"name": "b.txt", "content": "world"}},
            {"id": "c", "kind": "core.concat_text", "params": {"name": "out.txt"}},
        ],
        "edges": [{"task": "c", "depends_on": "a"}, {"task": "c", "depends_on": "b"}],
    }


def cmd_submit(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.demo:
        spec = _demo_spec()
    elif args.file:
        spec = json.loads(Path(args.file).read_text(encoding="utf-8"))
    else:
        print("provide --file graph.json or --demo", file=sys.stderr)
        return 2
    try:
        job_id = kernel.submit_graph(
            name=spec["name"],
            tasks=spec["tasks"],
            edges=spec.get("edges", []),
            priority=spec.get("priority", 0),
            project_id=spec.get("project_id"),
        )
    except (GraphError, KeyError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"job submitted: {job_id}")
    if args.await_run:
        status = kernel.process_job(job_id, timeout=args.timeout)
        print(f"final status: {status}")
    return 0


def cmd_jobs(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "list":
        _print(kernel.list_jobs(status=args.status, project_id=args.project))
    elif args.action == "show":
        try:
            _print(kernel.get_job(args.id))
        except KeyError:
            print(f"job not found: {args.id}", file=sys.stderr)
            return 1
    elif args.action == "resume":
        try:
            kernel.resume_job(args.id)
        except KeyError:
            print(f"job not found: {args.id}", file=sys.stderr)
            return 1
        print(f"job resumed: {args.id}")
    elif args.action == "cancel":
        try:
            kernel.cancel_job(args.id)
        except KeyError:
            print(f"job not found: {args.id}", file=sys.stderr)
            return 1
        print(f"job cancelled: {args.id}")
    return 0


def cmd_artifacts(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "list":
        _print(kernel.list_artifacts(job_id=args.job))
    elif args.action == "cat":
        try:
            sys.stdout.buffer.write(kernel.artifact_content(args.id))
        except KeyError:
            print(f"artifact not found: {args.id}", file=sys.stderr)
            return 1
        if not sys.stdout.buffer.closed:
            sys.stdout.buffer.write(b"\n")
    return 0


def cmd_errors(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    _print(kernel.list_errors(job_id=args.job))
    return 0


def cmd_telemetry(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    _print(kernel.list_telemetry(job_id=args.job))
    return 0


def cmd_users(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "create":
        password = args.password or getpass.getpass("password: ")
        try:
            user = kernel.create_user(args.username, password, role="ADMIN" if args.admin else "USER")
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        _print(user)
    elif args.action == "list":
        _print({"users": kernel.list_users()})
    return 0


def cmd_projects(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "create":
        users = kernel.list_users()
        if not users:
            print("no users exist — create one first: python -m engine users create <name>", file=sys.stderr)
            return 1
        owner = users[0]["id"]
        try:
            project = kernel.create_project(args.name, owner_id=owner, description=args.description or "")
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        _print(project)
    elif args.action == "list":
        _print({"projects": kernel.list_projects()})
    return 0


def cmd_assets(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "upload":
        if not (args.project and args.name and args.file):
            print("upload requires --project, --name, and --file", file=sys.stderr)
            return 2
        data = Path(args.file).read_bytes()
        try:
            asset = kernel.create_asset(args.project, name=args.name, kind=args.kind or "file", data=data, note=args.note or "")
        except KeyError:
            print(f"project not found: {args.project}", file=sys.stderr)
            return 1
        _print(asset)
    elif args.action == "list":
        if not args.project:
            print("list requires --project", file=sys.stderr)
            return 2
        _print({"assets": kernel.list_assets(args.project)})
    elif args.action == "versions":
        if not args.asset:
            print("versions requires --asset", file=sys.stderr)
            return 2
        try:
            _print({"versions": kernel.asset_versions(args.asset)})
        except KeyError:
            print(f"asset not found: {args.asset}", file=sys.stderr)
            return 1
    elif args.action == "rollback":
        if not (args.asset and args.version):
            print("rollback requires --asset and --version", file=sys.stderr)
            return 2
        try:
            _print(kernel.rollback_asset(args.asset, args.version))
        except KeyError:
            print(f"asset not found: {args.asset}", file=sys.stderr)
            return 1
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    return 0


def cmd_licenses(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "list":
        _print({"licenses": kernel.licenses.list()})
    elif args.action == "check":
        entry = kernel.licenses.get(args.name)
        if entry is None:
            print(f"no registry entry for {args.name!r} — research its license first", file=sys.stderr)
            return 1
        _print(entry)
    return 0


def cmd_models(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "list":
        _print({"models": kernel.model_registry.list(modality=args.modality)})
    elif args.action == "route":
        from engine.resources import detect

        snapshot = detect(kernel.enable_gpu, storage_root=kernel.storage_root)
        _print(kernel.router.preview(
            args.modality, args.mode, vram_available_gb=snapshot.gpu_vram_available_gb
        ))
    return 0


def cmd_memory(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "add":
        try:
            _print(kernel.memory.add(args.project, args.category, args.text, key=args.key or ""))
        except (ValueError, KeyError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    elif args.action == "search":
        try:
            _print({"results": kernel.memory.search(args.project, args.query, mode=args.mode)})
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    return 0


def cmd_graph(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "link":
        try:
            _print(kernel.graph.link(args.source, args.target, args.relation))
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    elif args.action == "impact":
        _print({"asset_id": args.asset, "impact": kernel.graph.impact(args.asset)})
    return 0


def cmd_characters(settings: Settings, args) -> int:
    kernel = _kernel(settings)
    if args.action == "create":
        projects = kernel.list_projects()
        pid = args.project or (projects[0]["id"] if projects else None)
        if not pid:
            print("no projects exist — create one first", file=sys.stderr)
            return 1
        try:
            _print(kernel.characters.create(pid, args.name, personality=args.personality or ""))
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    elif args.action == "check":
        try:
            _print(kernel.characters.consistency(args.id))
        except KeyError:
            print(f"character not found: {args.id}", file=sys.stderr)
            return 1
    return 0


def cmd_qa(settings: Settings, args) -> int:
    from engine.qa import run_checks

    data = Path(args.file).read_bytes()
    try:
        _print(run_checks(args.kind, data, {}))
    except Exception as exc:  # noqa: BLE001 - QA must fail with a message, never fake
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


def cmd_adapters(settings: Settings, _args) -> int:
    from engine.adapters import probe_all

    _print({"adapters": probe_all()})
    return 0


def cmd_audit(settings: Settings, _args) -> int:
    from engine.audit import main as audit_main

    return audit_main()


# ------------------------------------------------------------------ argparse


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="engine", description="Universal Creative Engine — CLI (CPU-only)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="create database and storage directories")
    sub.add_parser("doctor", help="system health report")

    p_serve = sub.add_parser("serve", help="run the HTTP server")
    p_serve.add_argument("--host")
    p_serve.add_argument("--port", type=int)

    p_submit = sub.add_parser("submit", help="submit a task graph")
    p_submit.add_argument("--file", help="path to a graph JSON file")
    p_submit.add_argument("--demo", action="store_true", help="submit the built-in demo graph")
    p_submit.add_argument("--await", dest="await_run", action="store_true", help="wait for completion")
    p_submit.add_argument("--timeout", type=float, default=60.0)

    p_jobs = sub.add_parser("jobs", help="manage jobs")
    p_jobs.add_argument("action", choices=["list", "show", "resume", "cancel"])
    p_jobs.add_argument("id", nargs="?", help="job id (show/resume/cancel)")
    p_jobs.add_argument("--status")
    p_jobs.add_argument("--project")

    p_art = sub.add_parser("artifacts", help="list or read artifacts")
    p_art.add_argument("action", choices=["list", "cat"])
    p_art.add_argument("id", nargs="?", help="artifact id (cat)")
    p_art.add_argument("--job")

    p_err = sub.add_parser("errors", help="list recorded errors")
    p_err.add_argument("--job")

    p_tel = sub.add_parser("telemetry", help="list observability rows")
    p_tel.add_argument("--job")

    p_users = sub.add_parser("users", help="manage users")
    p_users.add_argument("action", choices=["create", "list"])
    p_users.add_argument("username", nargs="?", help="username (create)")
    p_users.add_argument("--password", help="password (create; prompted if omitted)")
    p_users.add_argument("--admin", action="store_true", help="create as ADMIN")

    p_proj = sub.add_parser("projects", help="manage projects")
    p_proj.add_argument("action", choices=["create", "list"])
    p_proj.add_argument("name", nargs="?", help="project name (create)")
    p_proj.add_argument("--description")

    p_assets = sub.add_parser("assets", help="manage assets")
    p_assets.add_argument("action", choices=["upload", "list", "versions", "rollback"])
    p_assets.add_argument("--project", help="project id (upload/list)")
    p_assets.add_argument("--name", help="asset name (upload)")
    p_assets.add_argument("--kind", default="file", help="asset kind (upload)")
    p_assets.add_argument("--file", help="file path (upload)")
    p_assets.add_argument("--asset", help="asset id (versions/rollback)")
    p_assets.add_argument("--version", type=int, help="version number (rollback)")
    p_assets.add_argument("--note")

    p_lic = sub.add_parser("licenses", help="licensing firewall registry")
    p_lic.add_argument("action", choices=["list", "check"])
    p_lic.add_argument("name", nargs="?")

    p_models = sub.add_parser("models", help="model registry + router")
    p_models.add_argument("action", choices=["list", "route"])
    p_models.add_argument("--modality", default="llm")
    p_models.add_argument("--mode", default="BALANCED", choices=["FAST", "BALANCED", "QUALITY", "MAX_QUALITY"])

    p_mem = sub.add_parser("memory", help="project memory + search")
    p_mem.add_argument("action", choices=["add", "search"])
    p_mem.add_argument("--project", required=True)
    p_mem.add_argument("--category", default="project")
    p_mem.add_argument("--key", default="")
    p_mem.add_argument("--text", default="")
    p_mem.add_argument("--query", default="")
    p_mem.add_argument("--mode", default="keyword", choices=["keyword", "semantic", "both"])

    p_graph = sub.add_parser("graph", help="asset graph relations")
    p_graph.add_argument("action", choices=["link", "impact"])
    p_graph.add_argument("--source")
    p_graph.add_argument("--target")
    p_graph.add_argument("--relation", default="derived_from")
    p_graph.add_argument("--asset")

    p_chars = sub.add_parser("characters", help="persistent characters")
    p_chars.add_argument("action", choices=["create", "check"])
    p_chars.add_argument("name", nargs="?")
    p_chars.add_argument("--id", dest="id")
    p_chars.add_argument("--project")
    p_chars.add_argument("--personality")

    p_qa = sub.add_parser("qa", help="run CPU QA checks on a file")
    p_qa.add_argument("--kind", required=True, choices=["text", "image", "audio", "model3d"])
    p_qa.add_argument("--file", required=True)

    sub.add_parser("adapters", help="probe external engine availability")
    sub.add_parser("audit", help="verification loop with live evidence")

    p_backup = sub.add_parser("backup", help="consistent DB + blob backup (verified)")
    p_backup.add_argument("--out", required=True, help="output directory")

    p_prune = sub.add_parser("prune", help="retention for events/telemetry tables")
    p_prune.add_argument("--events-days", type=int, default=30)
    p_prune.add_argument("--telemetry-days", type=int, default=30)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    setup_logging(os.environ.get("UCE_LOG_LEVEL", "INFO"))
    settings = Settings()
    handlers = {
        "init": cmd_init,
        "doctor": cmd_doctor,
        "serve": cmd_serve,
        "submit": cmd_submit,
        "jobs": cmd_jobs,
        "artifacts": cmd_artifacts,
        "errors": cmd_errors,
        "telemetry": cmd_telemetry,
        "users": cmd_users,
        "projects": cmd_projects,
        "assets": cmd_assets,
        "licenses": cmd_licenses,
        "models": cmd_models,
        "memory": cmd_memory,
        "graph": cmd_graph,
        "characters": cmd_characters,
        "qa": cmd_qa,
        "adapters": cmd_adapters,
        "audit": cmd_audit,
        "backup": cmd_backup,
        "prune": cmd_prune,
    }
    try:
        return handlers[args.command](settings, args)
    except KeyboardInterrupt:
        return 130
    except Exception as exc:  # noqa: BLE001 - CLI must never crash without a message
        logger.exception("command %s failed", args.command, exc_info=exc)
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())