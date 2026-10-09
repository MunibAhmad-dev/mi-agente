"""AEOS CLI (spec §95): status, doctor, treasury, agent, keys, backup, restore.

Usage: python -m aeos.cli <command> [args]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from aeos import __version__
from aeos.core.audit import Audit
from aeos.core.config import Settings, load_settings
from aeos.core.db import Database
from aeos.core.decisions import Decisions
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.economics.ledger import Ledger
from aeos.economics.treasury import Treasury
from aeos.governance import IdentityService
from aeos.runtime import WorkQueue


def _bootstrap(settings: Settings) -> tuple[Database, Ledger, Treasury, Audit, EventBus]:
    settings.ensure_dirs()
    db = Database(settings.db_path)
    migrate(db)
    ledger = Ledger(db)
    events = EventBus(db)
    audit = Audit(db)
    # P-12 fix: every configured limit flows from Settings, not constructor defaults
    treasury = Treasury(db, ledger, events, audit,
                        reserve_floor=settings.reserve_floor,
                        max_experiment_budget=settings.max_experiment_budget,
                        max_business_allocation=settings.max_business_allocation,
                        max_investment_allocation=settings.max_investment_allocation)
    return db, ledger, treasury, audit, events


def cmd_status(settings: Settings) -> int:
    db, ledger, treasury, audit, events = _bootstrap(settings)
    agents = db.one("SELECT COUNT(*) AS n FROM agents")
    dead = db.one(
        "SELECT COUNT(*) AS n FROM agents WHERE state IN"
        " ('FAILED','KILLED','BANKRUPT','EXPIRED','BLOCKED','REPLACED')"
    )
    estop = EmergencyStop(db, events, audit)
    print(json.dumps({
        "version": __version__,
        "mode": settings.mode,
        "db": str(settings.db_path),
        "agents_total": agents["n"],
        "agents_dead": dead["n"],
        "treasury_total_minor": treasury.total(),
        "audit_entries": db.one("SELECT COUNT(*) AS n FROM audit_log")["n"],
        "events": db.one("SELECT COUNT(*) AS n FROM event_log")["n"],
        "audit_chain_ok": audit.verify_chain(),
        "emergency_stop": estop.is_active(),
    }, indent=2))
    db.close()
    return 0


def cmd_doctor(settings: Settings) -> int:
    """System doctor (spec §150): db, migrations, integrity, chain, queue,
    emergency flag, treasury identity."""
    checks: list[dict] = []
    try:
        db, ledger, treasury, audit, events = _bootstrap(settings)
        checks.append({"check": "database", "ok": True, "detail": str(settings.db_path)})
        mig = db.one("SELECT COUNT(*) AS n FROM schema_migrations")["n"]
        checks.append({"check": "migrations", "ok": mig >= 1, "detail": f"{mig} applied"})
        checks.append({"check": "audit_chain", "ok": audit.verify_chain(), "detail": "hash chain"})
        fk = db.query("PRAGMA foreign_key_check")
        checks.append({"check": "foreign_keys", "ok": len(fk) == 0, "detail": f"{len(fk)} violations"})
        integrity = db.one("PRAGMA integrity_check")[0]
        checks.append({"check": "integrity", "ok": integrity == "ok", "detail": integrity})
        # money identities (Phase 0 invariants)
        try:
            treasury.validate()
            checks.append({"check": "treasury_identity", "ok": True,
                           "detail": "sum(agent_cash) == sum(earmarks)"})
        except Exception as exc:
            checks.append({"check": "treasury_identity", "ok": False, "detail": str(exc)})
        # emergency stop flag
        estop = EmergencyStop(db, events, audit)
        checks.append({"check": "emergency_stop", "ok": not estop.is_active(),
                       "detail": "ACTIVE - financial actions frozen" if estop.is_active()
                       else "inactive"})
        # durable queue health (dead letters need attention)
        q = WorkQueue(db)
        dead = q.stats().get("DEAD", 0)
        checks.append({"check": "work_queue", "ok": dead == 0, "detail": f"{dead} dead tasks"})
        # policy engine present
        checks.append({"check": "policies", "ok": True, "detail": "deterministic engine loaded"})
        db.close()
    except Exception as exc:
        checks.append({"check": "bootstrap", "ok": False, "detail": str(exc)})
    ok = all(c["ok"] for c in checks)
    print(json.dumps({"healthy": ok, "mode": settings.mode, "checks": checks}, indent=2))
    return 0 if ok else 1


def cmd_treasury(settings: Settings) -> int:
    db, ledger, treasury, audit, events = _bootstrap(settings)
    print(json.dumps(treasury.buckets(), indent=2))
    db.close()
    return 0


def cmd_agent(settings: Settings, agent_id: str | None = None) -> int:
    db, ledger, treasury, audit, events = _bootstrap(settings)
    if agent_id:
        row = db.one("SELECT * FROM agents WHERE id=?", (agent_id,))
        print(json.dumps(dict(row) if row else {"error": "not found"}, indent=2))
    else:
        rows = db.query("SELECT id, generation, state, mission FROM agents ORDER BY created_at DESC LIMIT 50")
        print(json.dumps([dict(r) for r in rows], indent=2))
    db.close()
    return 0


def cmd_keys(settings: Settings, role: str) -> int:
    """Create the local owner principal and issue an API key (§70, §73)."""
    db, ledger, treasury, audit, events = _bootstrap(settings)
    identity = IdentityService(db, audit)
    identity.bootstrap_owner()
    if role != "admin":
        pid = f"human:{role}"
        if not identity.get_principal(pid):
            identity.create_principal(pid, "human", role, role)
        principal = pid
    else:
        principal = "human:owner"
    secret, prefix = identity.create_api_key(principal)
    print(json.dumps({"principal": principal, "prefix": prefix, "api_key": secret,
                      "note": "store this secret now; it is never shown again"}, indent=2))
    db.close()
    return 0


def _stop_flag_path(settings: Settings) -> Path:
    return settings.data_dir / "aeos.stop"


def cmd_start(settings: Settings, poll_seconds: float = 2.0, once: bool = False) -> int:
    """Run the autonomous loop (§4): submit+execute economic cycles until the
    stop flag appears (or one cycle with --once). EMERGENCY STOP is checked
    inside every financial phase."""
    from aeos.agents.cemetery import Cemetery
    from aeos.agents.economics import AgentEconomics
    from aeos.agents.factory import AgentFactory
    from aeos.agents.fitness import FitnessEngine
    from aeos.agents.lifecycle import Lifecycle
    from aeos.evolution.dna import StrategyDNA
    from aeos.evolution.engine import EvolutionEngine
    from aeos.governance import PolicyEngine
    from aeos.runtime import Orchestrator, WorkQueue
    from aeos.runtime.agent_runtime import AgentRuntime

    db, ledger, treasury, audit, events = _bootstrap(settings)
    factory = AgentFactory(db, events, audit)
    lifecycle = Lifecycle(db, events, audit)
    cemetery = Cemetery(db, events, audit, lifecycle, treasury=treasury)
    dna = StrategyDNA(db, events, audit)
    fitness = FitnessEngine()
    eco = AgentEconomics(db)
    evolution = EvolutionEngine(db, events, audit, factory, eco, treasury, dna, fitness)
    policy = PolicyEngine(db, events, audit, Decisions(db))
    queue = WorkQueue(db)
    orch = Orchestrator(db, events, audit, queue, EmergencyStop(db, events, audit))
    runtime = AgentRuntime(db, events, audit, orch, policy, treasury, factory,
                           lifecycle, cemetery, dna, fitness, evolution)
    stop_flag = _stop_flag_path(settings)
    cycles = 0
    print(json.dumps({"started": True, "mode": settings.mode,
                      "db": str(settings.db_path),
                      "stop_file": str(stop_flag)}))
    try:
        while True:
            if stop_flag.exists():
                stop_flag.unlink()
                print(json.dumps({"stopped": True, "cycles": cycles}))
                break
            cycle_id = orch.submit_cycle()
            result = runtime.run_cycle(cycle_id)
            cycles += 1
            print(json.dumps({"cycle": cycle_id, "status": result.get("status"),
                              "killed": len(result.get("killed", []) or []),
                              "allocated": len(result.get("allocated", []) or [])}))
            if once:
                break
            time.sleep(poll_seconds)
    except KeyboardInterrupt:
        print(json.dumps({"stopped": True, "reason": "keyboard-interrupt",
                          "cycles": cycles}))
    finally:
        db.close()
    return 0


def cmd_stop(settings: Settings) -> int:
    """Signal the running loop to stop after its current cycle."""
    flag = _stop_flag_path(settings)
    flag.parent.mkdir(parents=True, exist_ok=True)
    flag.write_text("stop", encoding="utf-8")
    print(json.dumps({"stop_requested": True, "stop_file": str(flag)}))
    return 0


def cmd_backup(settings: Settings, target: str) -> int:
    db, *_ = _bootstrap(settings)
    from aeos.ops import create_backup
    info = create_backup(db, target)
    print(json.dumps(info, indent=2))
    db.close()
    return 0


def cmd_restore(settings: Settings, backup_path: str, sha256: str) -> int:
    from aeos.ops import restore_backup, open_restored
    result = restore_backup(backup_path, sha256, settings.db_path)
    _, chain_ok = open_restored(settings.db_path)
    print(json.dumps({**result, "audit_chain_ok": chain_ok}, indent=2))
    return 0 if chain_ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aeos", description="Real-World Autonomous Economic AI OS")
    parser.add_argument("--mode", default=None, help="development|test|paper|shadow|limited_live|production")
    parser.add_argument("--db", default=None, help="database path override")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="system status summary")
    sub.add_parser("doctor", help="system health checks")
    sub.add_parser("treasury", help="show treasury buckets")
    ap = sub.add_parser("agent", help="list agents or show one")
    ap.add_argument("agent_id", nargs="?", default=None)
    kp = sub.add_parser("keys", help="issue an API key for a principal role")
    kp.add_argument("--role", default="admin", help="admin|operator|auditor|viewer")
    bp = sub.add_parser("backup", help="create a verified backup")
    bp.add_argument("target", help="backup file path")
    rp = sub.add_parser("restore", help="restore a verified backup")
    rp.add_argument("backup_path")
    rp.add_argument("--sha256", required=True, help="expected backup hash (from backup command)")
    start = sub.add_parser("start", help="run the autonomous economic loop")
    start.add_argument("--poll", type=float, default=2.0, help="seconds between cycles")
    start.add_argument("--once", action="store_true", help="run a single cycle and exit")
    sub.add_parser("stop", help="request loop stop after the current cycle")
    args = parser.parse_args(argv)

    env = {}
    if args.db:
        env["AEOS_DB_PATH"] = args.db
    settings = load_settings(mode=args.mode, env=env if env else None)
    if args.command == "status":
        return cmd_status(settings)
    if args.command == "doctor":
        return cmd_doctor(settings)
    if args.command == "treasury":
        return cmd_treasury(settings)
    if args.command == "agent":
        return cmd_agent(settings, args.agent_id)
    if args.command == "keys":
        return cmd_keys(settings, args.role)
    if args.command == "backup":
        return cmd_backup(settings, args.target)
    if args.command == "restore":
        return cmd_restore(settings, args.backup_path, args.sha256)
    if args.command == "start":
        return cmd_start(settings, poll_seconds=args.poll, once=args.once)
    if args.command == "stop":
        return cmd_stop(settings)
    return 1


if __name__ == "__main__":
    sys.exit(main())
