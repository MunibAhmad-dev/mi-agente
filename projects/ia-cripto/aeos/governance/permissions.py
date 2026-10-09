"""Identity, permissions and authorization (spec §70, §167d).

The free-text `authorization` string is replaced by a real principal +
permission check: every capital-moving or agent-mutating call must present an
AuthorizationContext issued by the IdentityService, which verifies an API key
(or a trusted bootstrap identity) and the principal's permissions.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid

from aeos.core.audit import Audit
from aeos.core.db import Database

# §70 permission catalog
PERMISSIONS = (
    "ALLOCATE_CAPITAL", "SETTLE_PROFIT", "WITHDRAW_CAPITAL",
    "SPAWN_AGENT", "MODIFY_AGENT", "KILL_AGENT",
    "EXECUTE_TRADE", "VIEW_TREASURY", "VIEW_AUDIT",
    "MANAGE_KEYS", "MANAGE_POLICIES", "EMERGENCY_STOP", "APPROVE_ACTIONS",
)

ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "admin": PERMISSIONS,
    "operator": (
        "ALLOCATE_CAPITAL", "SETTLE_PROFIT", "SPAWN_AGENT", "MODIFY_AGENT",
        "KILL_AGENT", "VIEW_TREASURY", "VIEW_AUDIT", "EXECUTE_TRADE",
    ),
    "agent": ("SETTLE_PROFIT", "VIEW_TREASURY"),
    "auditor": ("VIEW_TREASURY", "VIEW_AUDIT"),
    "viewer": ("VIEW_TREASURY",),
}


class PermissionDenied(Exception):
    """Raised when a principal lacks the required permission (§146)."""


class AuthorizationContext:
    """Immutable proof of who is acting and with which permissions."""

    __slots__ = ("principal_id", "kind", "role", "permissions")

    def __init__(self, principal_id: str, kind: str, role: str, permissions: frozenset[str]):
        self.principal_id = principal_id
        self.kind = kind
        self.role = role
        self.permissions = permissions

    def require(self, permission: str) -> None:
        if permission not in self.permissions:
            raise PermissionDenied(
                f"principal {self.principal_id!r} ({self.role}) lacks {permission}"
            )

    def as_dict(self) -> dict:
        return {"principal_id": self.principal_id, "kind": self.kind, "role": self.role}

    def __repr__(self) -> str:  # pragma: no cover
        return f"Authz({self.principal_id},{self.role})"


class IdentityService:
    def __init__(self, db: Database, audit: Audit):
        self.db = db
        self.audit = audit

    # ---- principals ----------------------------------------------------
    def create_principal(self, principal_id: str, kind: str, role: str,
                         display_name: str = "") -> None:
        if kind not in ("human", "service", "agent"):
            raise ValueError(f"invalid principal kind {kind!r}")
        if role not in ROLE_PERMISSIONS:
            raise ValueError(f"invalid role {role!r}; expected one of {tuple(ROLE_PERMISSIONS)}")
        self.db.execute(
            "INSERT INTO principals (id, kind, display_name, role) VALUES (?, ?, ?, ?)",
            (principal_id, kind, display_name, role),
        )
        self.audit.record("identity", "create_principal", principal_id, {"kind": kind, "role": role})

    def get_principal(self, principal_id: str) -> dict | None:
        row = self.db.one("SELECT * FROM principals WHERE id=?", (principal_id,))
        return dict(row) if row else None

    def context_for(self, principal_id: str) -> AuthorizationContext:
        p = self.get_principal(principal_id)
        if not p:
            raise PermissionDenied(f"unknown principal {principal_id!r}")
        if p["disabled"]:
            raise PermissionDenied(f"principal {principal_id!r} is disabled")
        return AuthorizationContext(
            principal_id, p["kind"], p["role"],
            frozenset(ROLE_PERMISSIONS.get(p["role"], ())),
        )

    # ---- API keys --------------------------------------------------------
    def create_api_key(self, principal_id: str) -> tuple[str, str]:
        """Returns (full_key, prefix). Only the hash of the secret is stored.

        The full key embeds its prefix: '<prefix>.<secret>' so authentication
        can locate the row from the key itself without a full-table scan.
        """
        if not self.get_principal(principal_id):
            raise PermissionDenied(f"unknown principal {principal_id!r}")
        prefix = "ak_" + secrets.token_hex(2)
        secret = prefix + "." + secrets.token_urlsafe(24)
        key_hash = hashlib.sha256(secret.encode()).hexdigest()
        self.db.execute(
            "INSERT INTO api_keys (prefix, principal_id, key_hash) VALUES (?, ?, ?)",
            (prefix, principal_id, key_hash),
        )
        self.audit.record("identity", "create_api_key", principal_id, {"prefix": prefix})
        return secret, prefix

    def authenticate(self, key: str) -> AuthorizationContext:
        """Authenticate a full API key ('<prefix>.<secret>') and return its context."""
        if not key or len(key) < 12 or "." not in key:
            raise PermissionDenied("invalid api key")
        prefix = key.split(".", 1)[0]
        row = self.db.one(
            "SELECT k.principal_id, k.key_hash, k.revoked_at, p.kind, p.role, p.disabled"
            " FROM api_keys k JOIN principals p ON p.id = k.principal_id"
            " WHERE k.prefix=?",
            (prefix,),
        )
        if not row or row["revoked_at"] is not None or row["disabled"]:
            raise PermissionDenied("invalid or revoked api key")
        if not secrets.compare_digest(hashlib.sha256(key.encode()).hexdigest(), row["key_hash"]):
            raise PermissionDenied("invalid api key")
        self.db.execute(
            "UPDATE api_keys SET last_used_at=datetime('now') WHERE prefix=?", (prefix,)
        )
        return AuthorizationContext(
            row["principal_id"], row["kind"], row["role"],
            frozenset(ROLE_PERMISSIONS.get(row["role"], ())),
        )

    def revoke_api_key(self, prefix: str, ctx: AuthorizationContext) -> None:
        ctx.require("MANAGE_KEYS")
        self.db.execute(
            "UPDATE api_keys SET revoked_at=datetime('now') WHERE prefix=?", (prefix,)
        )
        self.audit.record("identity", "revoke_api_key", prefix, {"by": ctx.principal_id})

    def bootstrap_owner(self) -> AuthorizationContext:
        """Idempotent local-mode owner: used for CLI bootstrap before keys exist."""
        if not self.get_principal("human:owner"):
            self.create_principal("human:owner", "human", "admin", "Local owner")
        return self.context_for("human:owner")
