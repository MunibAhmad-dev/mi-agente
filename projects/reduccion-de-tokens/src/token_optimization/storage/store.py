"""Shadow Context Store (spec §14) on SQLite + FTS5.

Stores the ORIGINAL of every item before any compression, with provenance
(spec §45), tenant/task ids, TTL and secure purge (spec §46). Also provides
the FTS5 retrieval index used by TargetedRecovery (spec §15).
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from dataclasses import dataclass
from typing import Optional

from ..core.ir import ContextItem

_SCHEMA = """
CREATE TABLE IF NOT EXISTS context_items (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL,
    role TEXT NOT NULL,
    source TEXT NOT NULL,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    trust REAL NOT NULL DEFAULT 0.5,
    sensitivity TEXT NOT NULL DEFAULT 'internal',
    timestamp REAL NOT NULL,
    expires_at REAL,
    token_count INTEGER,
    compression_state TEXT NOT NULL DEFAULT 'raw',
    provenance TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_items_hash ON context_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_items_task ON context_items(task_id);
CREATE INDEX IF NOT EXISTS idx_items_expires ON context_items(expires_at);

CREATE TABLE IF NOT EXISTS context_edges (
    src_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    dst_id TEXT NOT NULL,
    created_at REAL NOT NULL,
    PRIMARY KEY (src_id, relation, dst_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS context_fts USING fts5(
    item_id UNINDEXED, role UNINDEXED, content_type UNINDEXED, content
);
"""


@dataclass
class StoredItem:
    id: str
    content_hash: str
    content: str
    content_type: str
    role: str
    source: str
    task_id: str
    agent_id: str
    tenant_id: str
    trust: float
    sensitivity: str
    timestamp: float
    expires_at: float | None
    token_count: int | None
    compression_state: str
    provenance: dict


class ShadowContextStore:
    """Durable store for originals. `put` returns the retrieval pointer."""

    def __init__(self, db_path: str = ":memory:", default_ttl_seconds: float = 7 * 24 * 3600) -> None:
        self.db_path = db_path
        if db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(db_path)) or ".", exist_ok=True)
        self.default_ttl = default_ttl_seconds
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    # -- write -------------------------------------------------------------
    def put(self, item: ContextItem, tenant_id: str = "default",
            sensitivity: str = "internal", ttl_seconds: float | None = None) -> str:
        from ..observability import GLOBAL_METRICS, M_STORE_PUTS

        pointer = f"shadow://{item.id}"
        now = time.time()
        self._conn.execute(
            "INSERT OR REPLACE INTO context_items"
            " (id, content_hash, content, content_type, role, source, task_id, agent_id,"
            "  tenant_id, trust, sensitivity, timestamp, expires_at, token_count,"
            "  compression_state, provenance)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                item.id, item.hash, item.content, item.content_type.value, item.role.value,
                item.source, item.task_id, item.agent_id, tenant_id, item.trust, sensitivity,
                item.timestamp, now + (ttl_seconds if ttl_seconds is not None else self.default_ttl),
                item.token_count, item.compression_state,
                json.dumps({"source": item.source, "role": item.role.value, "origin": None}),
            ),
        )
        self._conn.execute(
            "INSERT INTO context_fts (item_id, role, content_type, content) VALUES (?,?,?,?)",
            (item.id, item.role.value, item.content_type.value, item.content),
        )
        self._conn.commit()
        GLOBAL_METRICS.inc(M_STORE_PUTS)
        return pointer

    def put_raw(self, content: str, content_type: str = "text", role: str = "external",
                task_id: str = "default", agent_id: str = "default",
                tenant_id: str = "default") -> str:
        item = ContextItem(
            content=content, content_type=content_type, role=role, task_id=task_id, agent_id=agent_id
        )
        return self.put(item, tenant_id=tenant_id)

    # -- read --------------------------------------------------------------
    def get(self, item_id: str) -> Optional[StoredItem]:
        row = self._conn.execute(
            "SELECT id, content_hash, content, content_type, role, source, task_id, agent_id,"
            " tenant_id, trust, sensitivity, timestamp, expires_at, token_count, compression_state,"
            " provenance FROM context_items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            return None
        return StoredItem(
            row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9],
            row[10], row[11], row[12], row[13], row[14], json.loads(row[15] or "{}"),
        )

    def get_by_pointer(self, pointer: str) -> Optional[StoredItem]:
        return self.get(pointer.removeprefix("shadow://"))

    def exists(self, content_hash: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM context_items WHERE content_hash = ? LIMIT 1", (content_hash,)
        ).fetchone()
        return row is not None

    def search(self, query: str, k: int = 8, task_id: str | None = None) -> list[StoredItem]:
        """FTS5 (BM25) keyword retrieval over originals."""
        safe = query.replace('"', '""')
        sql = (
            "SELECT ci.id FROM context_fts f JOIN context_items ci ON ci.id = f.item_id "
            "WHERE context_fts MATCH ? "
        )
        params: list = [safe]
        if task_id:
            sql += "AND ci.task_id = ? "
            params.append(task_id)
        sql += "ORDER BY bm25(context_fts) LIMIT ?"
        params.append(k)
        try:
            rows = self._conn.execute(sql, params).fetchall()
        except sqlite3.OperationalError:
            return []
        return [self.get(r[0]) for r in rows if self.get(r[0]) is not None]

    # -- graph -------------------------------------------------------------
    def add_edge(self, src_id: str, relation: str, dst_id: str) -> None:
        self._conn.execute(
            "INSERT OR IGNORE INTO context_edges VALUES (?,?,?,?)",
            (src_id, relation, dst_id, time.time()),
        )
        self._conn.commit()

    def edges_from(self, src_id: str) -> list[tuple[str, str]]:
        return [
            (r[0], r[1])
            for r in self._conn.execute(
                "SELECT relation, dst_id FROM context_edges WHERE src_id = ?", (src_id,)
            ).fetchall()
        ]

    # -- governance (spec §46) ---------------------------------------------
    def stats(self) -> dict:
        row = self._conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(token_count), 0), COALESCE(SUM(LENGTH(content)), 0) FROM context_items"
        ).fetchone()
        return {"items": row[0], "tokens": row[1], "bytes": row[2]}

    def purge_expired(self) -> int:
        cur = self._conn.execute("DELETE FROM context_items WHERE expires_at IS NOT NULL AND expires_at < ?", (time.time(),))
        deleted = cur.rowcount
        self._conn.execute(
            "DELETE FROM context_fts WHERE item_id NOT IN (SELECT id FROM context_items)"
        )
        self._conn.commit()
        if deleted:
            self._conn.execute("VACUUM")
            self._conn.commit()
        return deleted

    def delete_task(self, task_id: str, vacuum: bool = True) -> int:
        cur = self._conn.execute("DELETE FROM context_items WHERE task_id = ?", (task_id,))
        deleted = cur.rowcount
        self._conn.execute(
            "DELETE FROM context_fts WHERE item_id NOT IN (SELECT id FROM context_items)"
        )
        self._conn.commit()
        if vacuum and deleted:
            self._conn.execute("VACUUM")
            self._conn.commit()
        return deleted

    def close(self) -> None:
        self._conn.close()
