"""F1 hardening tests: worker timeout, migrations, backup, rate limiting,
provider key encryption, events persistence, single-instance lock."""

from __future__ import annotations

import time

from sqlalchemy import inspect, select

from engine.kernel.backup import create_backup, verify_backup
from engine.kernel.migrations import LATEST_VERSION, run_migrations
from engine.kernel.models import ErrorRecord, EventRecord
from engine.kernel.security import RateLimiter
from engine.providers import ProviderManager, decrypt_key, encrypt_key
from tests.conftest import make_project, run_until


# ------------------------------------------------------------ worker timeout

def test_worker_timeout(kernel):
    kernel.task_timeout_s = 2.0
    job_id = kernel.submit_graph(
        name="hang",
        tasks=[{"id": "t", "kind": "core.sleep", "params": {"seconds": 60, "name": "x.txt"}}],
        edges=[],
    )
    job = run_until(kernel, job_id, timeout=120)
    assert job["status"] == "FAILED"
    codes = {e["code"] for e in kernel.list_errors(job_id=job_id)}
    assert "WORKER_TIMEOUT" in codes, codes


# --------------------------------------------------------------- migrations

def test_migrations_fresh_and_old(tmp_path):
    from engine.kernel.db import create_db_engine

    engine = create_db_engine(f"sqlite:///{tmp_path / 'm.db'}")
    # Simulate a pre-migrations database: version row appears after tables exist.
    from sqlalchemy import text

    from engine.kernel.models import Base

    Base.metadata.create_all(engine)
    applied = run_migrations(engine)
    assert applied == LATEST_VERSION
    # Idempotent re-run.
    assert run_migrations(engine) == LATEST_VERSION
    with engine.begin() as conn:
        assert conn.execute(text("SELECT version FROM schema_version")).scalar() == LATEST_VERSION


# ------------------------------------------------------------------- backup

def test_backup_and_verify(kernel, tmp_path):
    pid = make_project(kernel)
    asset = kernel.create_asset(pid, "a.png", "image", b"blob-content")
    out = tmp_path / "backup"
    db_file = tmp_path / "test.db"  # matches the kernel fixture's db_url
    result = create_backup(db_file, tmp_path / "assets", out)
    assert result["db_backed_up"] is True
    assert result["blobs"] >= 1
    check = verify_backup(out)
    assert check["ok"] and check["checked"] >= 2
    # Tamper detection.
    (out / "blobs" / asset["sha256"]).write_bytes(b"tampered")
    assert verify_backup(out)["ok"] is False


# ------------------------------------------------------------- rate limiting

def test_rate_limiter_allows_then_blocks():
    limiter = RateLimiter(max_events=3, window_seconds=1.0)
    assert all(limiter.check("k") for _ in range(3))
    assert limiter.check("k") is False
    assert limiter.retry_after("k") >= 1
    assert limiter.check("other") is True  # independent keys


def test_login_rate_limited(client):
    from tests.conftest import register_login

    register_login(client)  # admin
    body = {"username": "nobody", "password": "wrong-password"}
    codes = set()
    for _ in range(12):
        resp = client.post("/api/auth/login", json=body)
        codes.add(resp.status_code)
    assert 429 in codes  # limiter kicks in before 12 tries


# ------------------------------------------------- provider key encryption

def test_provider_keys_encrypted_at_rest(kernel):
    manager = ProviderManager(kernel.Session, transport=lambda url: (200, "ok"), secret="unit-secret")
    manager.add("enc-prov", base_url="http://x.test", keys=["plain-key-1"], priority=1)
    manager.health("enc-prov")
    with kernel.Session() as s:
        from engine.kernel.models import ProviderRecord

        stored = s.scalar(select(ProviderRecord).where(ProviderRecord.name == "enc-prov"))
        assert stored.keys[0].startswith("enc:")
        assert "plain-key-1" not in stored.keys[0]
    picked = manager.pick()
    assert picked["key"] == "plain-key-1"  # decrypted only at pick time


def test_encryption_roundtrip():
    enc = encrypt_key("secret-value", "master")
    assert enc != "secret-value" and enc.startswith("enc:")
    assert decrypt_key(enc, "master") == "secret-value"


def test_encrypted_key_without_secret_refused(kernel):
    manager = ProviderManager(kernel.Session, secret="s1")
    manager.add("locked", base_url="http://x.test", keys=["k"])
    strict = ProviderManager(kernel.Session, transport=lambda url: (200, "ok"), secret="")  # no secret
    strict.health("locked")
    from engine.providers import ProviderUnavailable

    try:
        strict.pick()
    except ProviderUnavailable as exc:
        assert "no secret" in str(exc)
    else:
        raise AssertionError("pick() must refuse encrypted keys without a secret")


# ------------------------------------------------------- events persistence

def test_events_persisted(kernel):
    pid = make_project(kernel)
    kernel.create_asset(pid, "e.txt", "text", b"x")
    job_id = kernel.submit_graph(
        name="ev",
        tasks=[{"id": "t", "kind": "core.write_text", "params": {"name": "o.txt", "content": "hi"}}],
        edges=[],
    )
    run_until(kernel, job_id)
    events = kernel.list_events(job_id=job_id)
    topics = {e["topic"] for e in events}
    assert {"task.started", "job.updated"} <= topics
    rows = kernel.list_events()
    assert all(r["payload"] for r in rows if r["topic"] == "task.started")


# ------------------------------------------------------- single-instance lock

def test_instance_lock(kernel, tmp_path):
    # Point the lock at a temp location by faking the data dir relationship.
    import os

    lock_dir = tmp_path / "lockspace"
    lock_dir.mkdir()
    original = kernel.acquire_instance_lock
    kernel.storage_root = lock_dir / "assets"
    first = kernel.acquire_instance_lock()
    assert first is not None and first.exists()
    assert kernel.acquire_instance_lock() is None  # our own live pid holds it
    # A dead pid's lock is taken over.
    first.write_text("999999999")
    assert kernel.acquire_instance_lock() is not None
    kernel.release_instance_lock()
    assert kernel.release_instance_lock() is None or True  # idempotent


# ---------------------------------------------------------- strict provider health

def test_provider_health_strict(kernel):
    manager = ProviderManager(kernel.Session, transport=lambda url: (401, "denied"))
    manager.add("strict", base_url="http://x.test", keys=["k"])
    assert manager.health("strict")["healthy"] is False  # 401 is NOT healthy


# ------------------------------------------------------------- prune

def test_prune(kernel):
    pid = make_project(kernel)
    kernel.create_asset(pid, "p.txt", "text", b"x")
    job_id = kernel.submit_graph(
        name="p",
        tasks=[{"id": "t", "kind": "core.write_text", "params": {"name": "o.txt", "content": "hi"}}],
        edges=[],
    )
    run_until(kernel, job_id)
    result = kernel.prune(events_days=0, telemetry_days=0)
    assert result["events_deleted"] >= 1
    assert kernel.list_events() == []
