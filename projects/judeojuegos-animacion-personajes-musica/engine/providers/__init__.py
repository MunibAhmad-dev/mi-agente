"""Provider manager (Master Prompt §55, §56).

Multiple remote providers with multiple keys each: health checks, priority
ordering, quota tracking, round-robin key rotation, and fallback. The quality
guard lives in the model router — a provider is never silently swapped for a
worse one; `pick()` raises with reasons when nothing acceptable is healthy.
"""

from __future__ import annotations

import base64
import hashlib
import itertools
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy import select

from engine.kernel.models import ProviderRecord
from engine.logging_conf import get_logger

logger = get_logger("providers")

_ENC_PREFIX = "enc:"


def _fernet(secret: str):
    from cryptography.fernet import Fernet

    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_key(plain: str, secret: str) -> str:
    return _ENC_PREFIX + _fernet(secret).encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_key(stored: str, secret: str) -> str:
    if not stored.startswith(_ENC_PREFIX):
        return stored  # legacy plaintext key — accepted with a warning at use time
    return _fernet(secret).decrypt(stored[len(_ENC_PREFIX):].encode("ascii")).decode("utf-8")

# transport(url) -> (status_code, body); injectable for tests.
Transport = Callable[[str], tuple[int, str]]


def default_transport(url: str) -> tuple[int, str]:
    with urllib.request.urlopen(url, timeout=3) as resp:
        return resp.status, resp.read(4096).decode("utf-8", "replace")


class ProviderUnavailable(Exception):
    def __init__(self, reasons: list[str]) -> None:
        self.reasons = reasons
        super().__init__("no provider available: " + "; ".join(reasons))


def _row_dict(row: ProviderRecord, include_keys: bool = False) -> dict[str, Any]:
    data = {
        "id": row.id, "name": row.name, "kind": row.kind, "base_url": row.base_url,
        "priority": row.priority, "quota_total": row.quota_total, "quota_used": row.quota_used,
        "healthy": row.healthy, "last_check": row.last_check.isoformat() if row.last_check else None,
        "active": row.active, "key_count": len(row.keys or []),
        "created_at": row.created_at.isoformat(),
    }
    if include_keys:
        data["keys"] = row.keys or []
    return data


class ProviderManager:
    def __init__(self, session_factory, transport: Transport | None = None, secret: str = "") -> None:
        self.Session = session_factory
        self.transport = transport or default_transport
        self.secret = secret  # empty secret disables at-rest encryption (logged)
        self._rotation: dict[str, itertools.count] = {}

    def add(
        self,
        name: str,
        *,
        kind: str = "openai_compat",
        base_url: str = "",
        keys: list[str] | None = None,
        priority: int = 0,
        quota_total: int = 0,
    ) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("provider name is required")
        with self.Session() as s:
            row = s.scalar(select(ProviderRecord).where(ProviderRecord.name == name))
            if row is None:
                row = ProviderRecord(name=name)
                s.add(row)
            row.kind = kind
            row.base_url = base_url
            if keys is not None:
                if self.secret:
                    row.keys = [encrypt_key(k, self.secret) for k in keys]
                else:
                    logger.warning("storing provider keys in PLAINTEXT — configure a secret to encrypt at rest")
                    row.keys = keys
            row.priority = priority
            row.quota_total = quota_total
            s.commit()
            return _row_dict(row)

    def list(self) -> list[dict]:
        with self.Session() as s:
            rows = s.scalars(select(ProviderRecord).order_by(ProviderRecord.priority.desc(), ProviderRecord.name)).all()
        return [_row_dict(r) for r in rows]

    def get(self, name: str) -> dict | None:
        with self.Session() as s:
            row = s.scalar(select(ProviderRecord).where(ProviderRecord.name == name))
            return _row_dict(row) if row else None

    def remove(self, name: str) -> bool:
        with self.Session() as s:
            row = s.scalar(select(ProviderRecord).where(ProviderRecord.name == name))
            if row is None:
                return False
            s.delete(row)
            s.commit()
            return True

    def health(self, name: str) -> dict:
        """Probe base_url; store the result. Transport errors mark unhealthy."""
        with self.Session() as s:
            row = s.scalar(select(ProviderRecord).where(ProviderRecord.name == name))
            if row is None:
                raise KeyError(name)
            if not row.base_url:
                row.healthy = False
                row.last_check = datetime.now(timezone.utc)
                s.commit()
                return {"name": name, "healthy": False, "detail": "no base_url configured"}
            try:
                status, _ = self.transport(row.base_url)
                # Strict: only a definitive 2xx counts as healthy (audit item —
                # a 401/403 is reachable but NOT healthy).
                row.healthy = 200 <= status < 300
                detail = f"HTTP {status}"
            except Exception as exc:  # noqa: BLE001 - any network failure = unhealthy
                row.healthy = False
                detail = f"unreachable: {exc}"
            row.last_check = datetime.now(timezone.utc)
            s.commit()
            return {"name": name, "healthy": bool(row.healthy), "detail": detail}

    def pick(self) -> dict[str, Any]:
        """Highest-priority healthy provider with quota left + a rotated key."""
        providers = self.list()
        reasons: list[str] = []
        for p in providers:
            if not p["active"]:
                reasons.append(f"{p['name']}: inactive")
                continue
            if p["healthy"] is not True:
                reasons.append(f"{p['name']}: unhealthy or never checked")
                continue
            if p["quota_total"] and p["quota_used"] >= p["quota_total"]:
                reasons.append(f"{p['name']}: quota exhausted ({p['quota_used']}/{p['quota_total']})")
                continue
            if not p["key_count"]:
                reasons.append(f"{p['name']}: no keys")
                continue
            counter = self._rotation.setdefault(p["name"], itertools.count())
            index = next(counter) % p["key_count"]
            stored_key = self._stored_key(p["name"])
            key = decrypt_key(stored_key, self.secret) if self.secret else stored_key
            if not self.secret and stored_key.startswith(_ENC_PREFIX):
                raise ProviderUnavailable([f"{p['name']}: encrypted key but no secret configured"])
            return {
                "provider": p["name"],
                "base_url": p["base_url"],
                "key_index": index,
                "key": key,
                "priority": p["priority"],
            }
        raise ProviderUnavailable(reasons)

    def _stored_key(self, name: str) -> str:
        with self.Session() as s:
            row = s.scalar(select(ProviderRecord).where(ProviderRecord.name == name))
            if row is None:
                raise KeyError(name)
            return (row.keys or [""])[0]

    def record_usage(self, name: str, amount: int = 1) -> dict:
        with self.Session() as s:
            row = s.scalar(select(ProviderRecord).where(ProviderRecord.name == name))
            if row is None:
                raise KeyError(name)
            row.quota_used += amount
            s.commit()
            return _row_dict(row)
