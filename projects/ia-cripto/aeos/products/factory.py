"""Product factory + deployment engine (spec §34-35, §74).

The build pipeline is ordered and gated: BUILD → TEST → LICENSE AUDIT →
SANDBOX → DEPLOY → HEALTH CHECK, with automatic ROLLBACK on failed health.
Each stage records its result; a failed stage stops the pipeline (never
'deploy anyway'). Deployment goes through a configurable IHostingProvider - no
provider configured means the pipeline stops at SANDBOX_OK and says so.
"""
from __future__ import annotations

import json
import subprocess
import uuid
from typing import Protocol

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus


class IHostingProvider(Protocol):
    """Hosting adapter contract (§35, §167e). Implement per provider."""

    def deploy(self, product: dict, artifact_dir: str) -> str:  # returns url
        ...

    def health(self, url: str) -> bool:
        ...

    def rollback(self, product: dict) -> str:
        ...


class PipelineError(Exception):
    pass


class SandboxViolated(PipelineError):
    pass


class ProductFactory:
    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 hosting: IHostingProvider | None = None,
                 license_allowlist: tuple[str, ...] = ("MIT", "Apache-2.0", "BSD-2-Clause",
                                                       "BSD-3-Clause", "ISC", "0BSD")):
        self.db = db
        self.events = events
        self.audit = audit
        self.hosting = hosting
        self.license_allowlist = license_allowlist

    # ---- products --------------------------------------------------------
    def create(self, name: str, kind: str = "landing", agent_id: str | None = None,
               opportunity_id: str | None = None, config: dict | None = None) -> str:
        pid = "prd_" + uuid.uuid4().hex[:12]
        self.db.execute(
            "INSERT INTO products (id, agent_id, opportunity_id, name, kind, config_json)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (pid, agent_id, opportunity_id, name, kind,
             json.dumps(config or {}, default=str)),
        )
        self.events.publish("DeploymentCreated",
                            {"product_id": pid, "stage": "created"})
        self.audit.record("products", "create", pid, {"name": name, "kind": kind})
        return pid

    def get(self, product_id: str) -> dict:
        row = self.db.one("SELECT * FROM products WHERE id=?", (product_id,))
        if not row:
            raise KeyError(f"unknown product {product_id!r}")
        return dict(row)

    # ---- §74 pipeline ------------------------------------------------------
    def run_pipeline(self, product_id: str, artifact_dir: str,
                     test_cmd: list[str] | None = None) -> dict:
        """Execute the gated build pipeline. Returns stage log + final status."""
        product = self.get(product_id)
        log: list[dict] = []

        def stage(name: str, ok: bool, detail: str) -> None:
            log.append({"stage": name, "ok": ok, "detail": detail})
            self.audit.record("pipeline", name, product_id, {"ok": ok, "detail": detail[:200]})
            if not ok:
                raise PipelineError(f"stage {name} failed: {detail}")

        stage("BUILD", True, f"artifact at {artifact_dir}")
        # TEST: run the product's own test command in a subprocess if provided
        if test_cmd:
            proc = subprocess.run(test_cmd, capture_output=True, text=True, timeout=300)
            stage("TEST", proc.returncode == 0, (proc.stderr or proc.stdout)[-500:])
        else:
            stage("TEST", True, "no test command configured (skipped, recorded)")
        # LICENSE AUDIT: declared third-party licenses in config must be allowlisted
        licenses: list[str] = json.loads(product["config_json"]).get("licenses", [])
        bad = [l for l in licenses if l not in self.license_allowlist]
        stage("LICENSE_AUDIT", not bad,
              "all licenses allowlisted" if not bad else f"non-allowlisted: {bad}")
        # SANDBOX: import-and-run smoke inside a restricted subprocess
        import os
        import sys
        sandbox = subprocess.run(
            [sys.executable, "-c",
             "import importlib.util, pathlib, sys;"
             " p = pathlib.Path(sys.argv[1]) / 'entrypoint.py';"
             " spec = importlib.util.spec_from_file_location('entrypoint', p) if p.exists() else None;"
             " (spec and spec.loader.exec_module(importlib.util.module_from_spec(spec)))",
             artifact_dir],
            capture_output=True, text=True, timeout=60,
            env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                 "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")},
            cwd=artifact_dir,
        )
        stage("SANDBOX", sandbox.returncode == 0,
              (sandbox.stderr or "sandbox import ok")[-500:])

        # DEPLOY (requires a hosting provider; honesty over faking, §2)
        if self.hosting is None:
            self.db.execute("UPDATE products SET status='SANDBOX_OK' WHERE id=?", (product_id,))
            self.events.publish("DeploymentCreated", {"product_id": product_id,
                                                      "stage": "SANDBOX_OK"})
            return {"product_id": product_id, "status": "SANDBOX_OK",
                    "note": "no hosting provider configured; pipeline stopped honestly",
                    "stages": log}
        url = self.hosting.deploy(product, artifact_dir)
        did = "dep_" + uuid.uuid4().hex[:12]
        self.db.execute(
            "INSERT INTO deployments (id, product_id, provider, url, version, status,"
            " deployed_at) VALUES (?, ?, ?, ?, 1, 'DEPLOYING', datetime('now'))",
            (did, product_id, type(self.hosting).__name__, url),
        )
        healthy = self.hosting.health(url)
        if healthy:
            self.db.execute(
                "UPDATE deployments SET status='LIVE', health_ok=1 WHERE id=?", (did,))
            self.db.execute("UPDATE products SET status='DEPLOYED' WHERE id=?", (product_id,))
            self.events.publish("DeploymentSucceeded", {"product_id": product_id, "url": url})
            stage("DEPLOY", True, url)
            stage("HEALTH", True, "health check passed")
            return {"product_id": product_id, "deployment_id": did, "url": url,
                    "stages": log}
        # health failure is an expected outcome: rollback happens automatically
        # and is REPORTED (not raised) so the caller sees the full picture (§67).
        rb_url = self.hosting.rollback(product)
        self.db.execute(
            "UPDATE deployments SET status='ROLLED_BACK' WHERE id=?", (did,))
        self.db.execute("UPDATE products SET status='FAILED' WHERE id=?", (product_id,))
        self.events.publish("DeploymentFailed", {"product_id": product_id, "url": url})
        log.append({"stage": "DEPLOY", "ok": True, "detail": url})
        log.append({"stage": "HEALTH", "ok": False,
                    "detail": f"health failed; rolled back to {rb_url}"})
        self.audit.record("pipeline", "rolled_back", product_id, {"url": url, "rb": rb_url})
        return {"product_id": product_id, "deployment_id": did, "url": url,
                "status": "ROLLED_BACK", "stages": log}
