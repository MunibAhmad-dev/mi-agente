"""AEOS HTTP API (spec §94): stdlib-only REST surface over the real core.

Every request is authenticated with an API key (Phase 1 identity) and mapped
to a permission. No `Authorization: anything` passthrough: an unknown or
revoked key gets 401. Read endpoints require VIEW_*; mutating endpoints
require the corresponding §70 permission and are audited.

Run: python -m aeos.api.server --port 8400
"""
from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from aeos import __version__
from aeos.core.audit import Audit
from aeos.core.config import load_settings
from aeos.core.db import Database
from aeos.core.decisions import Decisions
from aeos.core.emergency import EmergencyStop
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.economics.ledger import Ledger
from aeos.economics.treasury import Treasury
from aeos.governance import IdentityService, PermissionDenied
from aeos.runtime import WorkQueue

# endpoint -> (method, permission)
ROUTES: dict[tuple[str, str], str] = {
    ("/api/v1/status", "GET"): "VIEW_TREASURY",
    ("/api/v1/treasury", "GET"): "VIEW_TREASURY",
    ("/api/v1/agents", "GET"): "VIEW_TREASURY",
    ("/api/v1/audit", "GET"): "VIEW_AUDIT",
    ("/api/v1/approvals", "GET"): "VIEW_AUDIT",
    ("/api/v1/queue", "GET"): "VIEW_AUDIT",
    ("/api/v1/predictions", "GET"): "VIEW_AUDIT",
    ("/api/v1/opportunities", "GET"): "VIEW_TREASURY",
    ("/api/v1/emergency-stop", "GET"): "VIEW_TREASURY",
    ("/api/v1/emergency-stop", "DELETE"): "EMERGENCY_STOP",
    ("/api/v1/emergency-stop", "POST"): "EMERGENCY_STOP",
}


class AeosApi:
    """Core wiring shared by all requests (one per process, thread-safe use)."""

    def __init__(self, settings):
        settings.ensure_dirs()
        self.settings = settings
        self.db = Database(settings.db_path)
        migrate(self.db)
        self.ledger = Ledger(self.db)
        self.events = EventBus(self.db)
        self.audit = Audit(self.db)
        self.treasury = Treasury(self.db, self.ledger, self.events, self.audit,
                                 reserve_floor=settings.reserve_floor,
                                 max_experiment_budget=settings.max_experiment_budget,
                                 max_business_allocation=settings.max_business_allocation,
                                 max_investment_allocation=settings.max_investment_allocation)
        self.identity = IdentityService(self.db, self.audit)
        self.estop = EmergencyStop(self.db, self.events, self.audit)
        self.queue = WorkQueue(self.db)

    def handle(self, method: str, path: str, api_key: str | None,
               query: dict, body: dict) -> tuple[int, dict]:
        route = ROUTES.get((path, method))
        if route is None:
            return 404, {"error": "not found"}
        if not api_key:
            return 401, {"error": "missing api key"}
        try:
            ctx = self.identity.authenticate(api_key)
        except PermissionDenied:
            # unknown, malformed or revoked key: unauthenticated (401)
            self.audit.record("api", "auth_failed", path, {})
            return 401, {"error": "invalid api key"}
        try:
            ctx.require(route)
        except PermissionDenied as exc:
            # authenticated but not allowed: forbidden (403)
            self.audit.record("api", "denied", path, {"error": str(exc)})
            return 403, {"error": str(exc)}
        self.audit.record("api", "access", path, {"principal": ctx.principal_id})

        if path == "/api/v1/status":
            agents = self.db.one("SELECT COUNT(*) AS n FROM agents")["n"]
            return 200, {
                "mode": self.settings.mode, "version": __version__,
                "agents": agents, "treasury_total_minor": self.treasury.total(),
                "audit_chain_ok": self.audit.verify_chain(),
                "emergency_stop": self.estop.is_active(),
            }
        if path == "/api/v1/treasury":
            return 200, {"buckets": self.treasury.buckets(), "total_minor": self.treasury.total()}
        if path == "/api/v1/agents":
            state = query.get("state")
            rows = self.db.query(
                "SELECT id, generation, state, mission FROM agents"
                + (" WHERE state=?" if state else "") + " ORDER BY created_at DESC LIMIT 100",
                (state,) if state else ())
            return 200, {"agents": [dict(r) for r in rows]}
        if path == "/api/v1/audit":
            return 200, {"entries": self.audit.entries(limit=int(query.get("limit", 50)))}
        if path == "/api/v1/approvals":
            from aeos.governance import ApprovalService
            svc = ApprovalService(self.db, self.events, self.audit)
            return 200, {"pending": svc.pending()}
        if path == "/api/v1/queue":
            return 200, {"stats": self.queue.stats(), "dead": self.queue.dead_letters(10)}
        if path == "/api/v1/predictions":
            rows = self.db.query(
                "SELECT id, claim, probability, resolved_at, brier FROM predictions"
                " ORDER BY created_at DESC LIMIT 50")
            return 200, {"predictions": [dict(r) for r in rows]}
        if path == "/api/v1/opportunities":
            rows = self.db.query(
                "SELECT id, market, problem, expected_value, confidence, status"
                " FROM opportunities ORDER BY detected_at DESC LIMIT 50")
            return 200, {"opportunities": [dict(r) for r in rows]}
        if path == "/api/v1/emergency-stop":
            if method == "GET":
                return 200, {"active": self.estop.is_active()}
            if method == "POST":
                self.estop.set(body.get("reason", "set via api"))
                return 200, {"active": True}
            if method == "DELETE":
                self.estop.release(ctx)
                return 200, {"active": False}
        return 404, {"error": "unrouted"}


    # ---- dashboard (token-gated) -----------------------------------------
    def dashboard_html(self, token: str | None) -> tuple[int, str, str]:
        """Return (status, content_type, html). The page embeds the operator's
        API key as the data-token; without a valid key it renders but every
        fetch 401s - same permissions as the raw API."""
        if token:
            try:
                ctx = self.identity.authenticate(token)
                if "VIEW_TREASURY" not in ctx.permissions:
                    return 403, "text/html", "<h1>403 - insufficient role</h1>"
            except PermissionDenied:
                return 401, "text/html", "<h1>401 - invalid key</h1>"
        ok = self.audit.verify_chain()
        estop = self.estop.is_active()
        agents = self.db.query(
            "SELECT id, generation, state, mission FROM agents"
            " ORDER BY created_at DESC LIMIT 20")
        buckets = self.treasury.buckets()
        bucket_rows = "".join(
            f"<tr><td>{b}</td><td>{v['balance']/100:,.2f}</td>"
            f"<td>{v['allocated']/100:,.2f}</td></tr>"
            for b, v in sorted(buckets.items()))
        agent_rows = "".join(
            f"<tr><td><code>{a['id']}</code></td><td>{a['generation']}</td>"
            f"<td>{a['state']}</td><td>{a['mission'][:60]}</td></tr>"
            for a in agents)
        dead = self.queue.stats().get("DEAD", 0)
        return 200, "text/html", f"""<!doctype html>
<html><head><meta charset="utf-8"><title>AEOS Dashboard</title>
<style>
 body {{ font-family: -apple-system, 'Segoe UI', sans-serif; margin: 2rem;
        background: #0f1420; color: #dfe6f3; }}
 h1 {{ font-size: 1.3rem; }} h2 {{ font-size: 1.05rem; margin-top: 1.6rem; }}
 .badges span {{ display: inline-block; padding: .25rem .7rem; margin-right: .5rem;
   border-radius: 999px; font-size: .85rem; }}
 .ok {{ background: #12351f; color: #7fe0a2; }}
 .bad {{ background: #3b1519; color: #ff9aa5; }}
 table {{ border-collapse: collapse; width: 100%; font-size: .9rem; }}
 th, td {{ text-align: left; padding: .35rem .6rem; border-bottom: 1px solid #232c40; }}
 code {{ color: #9fb4d8; }}
</style></head><body>
<h1>AEOS — Autonomous Economic OS</h1>
<div class="badges">
 <span class="{'bad' if estop else 'ok'}">{'EMERGENCY STOP ACTIVE' if estop else 'running'}</span>
 <span class="{'ok' if ok else 'bad'}">audit chain {'verified' if ok else 'BROKEN'}</span>
 <span class="{'bad' if dead else 'ok'}">{dead} dead tasks</span>
 <span class="ok">mode: {self.settings.mode}</span>
</div>
<h2>Treasury</h2>
<table><tr><th>Bucket</th><th>Balance</th><th>Allocated</th></tr>{bucket_rows}</table>
<h2>Recent agents</h2>
<table><tr><th>Agent</th><th>Gen</th><th>State</th><th>Mission</th></tr>{agent_rows}</table>
<p style="margin-top:2rem;font-size:.8rem;color:#6b7a99">
  Read-only view. Mutations go through the authenticated API with per-endpoint permissions.</p>
</body></html>"""


def make_handler(api: AeosApi) -> type:
    class Handler(BaseHTTPRequestHandler):
        def _reply(self, code: int, payload: dict) -> None:
            data = json.dumps(payload, indent=2).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _reply_html(self, code: int, html: str) -> None:
            data = html.encode()
            self.send_response(code)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _route(self, method: str) -> None:
            from urllib.parse import parse_qs, urlparse
            parsed = urlparse(self.path)
            query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            length = int(self.headers.get("Content-Length") or 0)
            body = {}
            if length:
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                except json.JSONDecodeError:
                    self._reply(400, {"error": "invalid json body"})
                    return
            api_key = self.headers.get("X-Api-Key")
            if parsed.path == "/dashboard" and method == "GET":
                try:
                    code, ctype, html = api.dashboard_html(api_key)
                    self._reply_html(code, html)
                except Exception as exc:  # noqa: BLE001
                    self._reply_html(500, f"<h1>500</h1><pre>{exc}</pre>")
                return
            try:
                code, payload = api.handle(method, parsed.path, api_key, query, body)
            except Exception as exc:  # noqa: BLE001 - surfaced, never silent
                code, payload = 500, {"error": str(exc)}
            self._reply(code, payload)

        def do_GET(self):  # noqa: N802
            self._route("GET")

        def do_POST(self):  # noqa: N802
            self._route("POST")

        def do_DELETE(self):  # noqa: N802
            self._route("DELETE")

        def log_message(self, fmt, *args):  # quiet by default
            pass

    return Handler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aeos-api")
    parser.add_argument("--port", type=int, default=8400)
    parser.add_argument("--mode", default=None)
    parser.add_argument("--db", default=None)
    args = parser.parse_args(argv)
    env = {"AEOS_DB_PATH": args.db} if args.db else None
    settings = load_settings(mode=args.mode, env=env)
    api = AeosApi(settings)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(api))
    print(f"aeos api listening on http://127.0.0.1:{args.port} (mode={settings.mode})")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
