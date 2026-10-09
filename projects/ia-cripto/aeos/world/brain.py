"""World Brain (spec §24-29): INGEST → NORMALIZE → DEDUP → EXTRACT →
ENTITY RESOLUTION → SOURCE TRUST → TEMPORALIZE → STORE → SIGNAL.

Everything stored carries provenance (source, url, times, content hash, §75).
Historical observations are never overwritten - corrections create new rows
with valid_from/valid_until (§26). Sources with no data produce an honest
NO_REAL_DATA_AVAILABLE condition (§139) - never filler content.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import dataclass

from aeos.core.db import Database
from aeos.core.events import EventBus


class NoRealDataAvailable(Exception):
    """Raised when a caller asks for world state but no real data exists (§139)."""


_WORD_RE = re.compile(r"[a-z0-9]{3,}")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def content_hash(source: str, external_id: str | None, title: str, body: str) -> str:
    basis = f"{source}|{external_id or ''}|{_normalize(title)}|{_normalize(body)[:500]}"
    return hashlib.sha256(basis.encode()).hexdigest()


@dataclass(frozen=True)
class Observation:
    source: str
    title: str
    body: str
    kind: str
    observed_at: str
    source_url: str = ""
    external_id: str | None = None
    meta: dict | None = None


class WorldBrain:
    def __init__(self, db: Database, events: EventBus):
        self.db = db
        self.events = events

    # ---- INGEST ----------------------------------------------------------
    def ingest(self, obs: Observation) -> dict:
        """Ingest one real-world observation. Duplicates (same content hash)
        are acknowledged, not re-stored. Returns {id, duplicate}."""
        h = content_hash(obs.source, obs.external_id, obs.title, obs.body)
        existing = self.db.one(
            "SELECT id FROM world_observations WHERE content_hash=?", (h,)
        )
        if existing:
            return {"id": existing["id"], "duplicate": True}
        cur = self.db.execute(
            """INSERT INTO world_observations (source, source_url, external_id, content_hash,
                   title, body, kind, observed_at, meta_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (obs.source, obs.source_url, obs.external_id, h, obs.title, obs.body,
             obs.kind, obs.observed_at, json.dumps(obs.meta or {}, default=str)),
        )
        oid = int(cur.lastrowid)
        self._extract_entities(oid, obs)
        self.events.publish("SignalCreated", {"observation_id": oid, "source": obs.source,
                                              "kind": obs.kind})
        return {"id": oid, "duplicate": False}

    # ---- EXTRACT + ENTITY RESOLUTION (§27) --------------------------------
    def _extract_entities(self, observation_id: int, obs: Observation) -> None:
        """Exact + fuzzy entity resolution (§27): known canonical names and
        aliases match exactly; fuzzy matching uses difflib similarity >= 0.87
        against multi-word names so 'Prodcut X' still links to 'Product X'
        while common words never do."""
        from difflib import SequenceMatcher
        text = _normalize(f"{obs.title} {obs.body}")
        words = set(_WORD_RE.findall(text))
        entities = self.db.query("SELECT * FROM world_entities")
        matched: list[int] = []
        for e in entities:
            names = [e["canonical_name"].lower()] + [n.lower() for n in json.loads(e["aliases_json"])]
            hit = False
            for name in names:
                if not name:
                    continue
                if name in text:
                    hit = True
                    break
                # fuzzy: only for multi-char names, against word windows
                tokens = name.split()
                if len(tokens) >= 2 or len(name) >= 5:
                    for w in words:
                        ratio = SequenceMatcher(None, name, w).ratio()
                        if ratio >= 0.87:
                            hit = True
                            break
                if hit:
                    break
            if hit:
                matched.append(e["id"])
        for eid in matched:
            self.db.execute(
                "INSERT OR IGNORE INTO observation_entities (observation_id, entity_id)"
                " VALUES (?, ?)", (observation_id, eid))

    def register_entity(self, canonical_name: str, aliases: list[str] | None = None,
                        entity_type: str = "topic", confidence: float = 0.8) -> int:
        cur = self.db.execute(
            "INSERT INTO world_entities (canonical_name, aliases_json, entity_type, confidence)"
            " VALUES (?, ?, ?, ?)",
            (canonical_name, json.dumps(aliases or []), entity_type, confidence),
        )
        return int(cur.lastrowid)

    # ---- SOURCE TRUST (§28) ------------------------------------------------
    def source_trust(self, source: str) -> dict:
        self.db.execute("INSERT OR IGNORE INTO source_trust (source) VALUES (?)", (source,))
        return dict(self.db.one("SELECT * FROM source_trust WHERE source=?", (source,)))

    def update_source_trust(self, source: str, *, confirmed: bool | None = None,
                            contradicted: bool | None = None) -> None:
        """Adjust reliability from observed outcomes (cross-confirmation)."""
        st = self.source_trust(source)
        if confirmed:
            self.db.execute(
                "UPDATE source_trust SET reliability=MIN(1.0, reliability+0.05),"
                " confirmations=confirmations+1, updated_at=datetime('now') WHERE source=?",
                (source,))
        if contradicted:
            self.db.execute(
                "UPDATE source_trust SET reliability=MAX(0.0, reliability-0.10),"
                " contradictions=contradictions+1, updated_at=datetime('now') WHERE source=?",
                (source,))

    # ---- SIGNALS (§29) -------------------------------------------------------
    def signals(self, kind: str | None = None, window_hours: int = 168) -> dict:
        """Volume/velocity/novelty/source_diversity over a time window.
        Raises NoRealDataAvailable when the store is empty (§139)."""
        where = "WHERE observed_at >= datetime('now', ?)"
        params: tuple = (f"-{int(window_hours)} hours",)
        if kind:
            where += " AND kind=?"
            params = (*params, kind)
        row = self.db.one(
            f"SELECT COUNT(*) AS volume, COUNT(DISTINCT source) AS sources,"
            f" COUNT(DISTINCT content_hash) AS unique_content,"
            f" MIN(observed_at) AS first_seen"
            f" FROM world_observations {where}", params)
        if not row or row["volume"] == 0:
            raise NoRealDataAvailable(
                f"no real observations in the last {window_hours}h"
                + (f" for kind={kind}" if kind else ""))
        volume = row["volume"]
        velocity = volume / max(1, window_hours)
        novelty = row["unique_content"] / volume  # dedup ratio => novelty
        diversity = row["sources"] / volume
        return {
            "volume": volume,
            "velocity_per_hour": round(velocity, 4),
            "novelty": round(novelty, 4),
            "source_diversity": round(diversity, 4),
            "window_hours": window_hours,
            "kind": kind,
        }

    # ---- temporal queries (§26) ------------------------------------------------
    def observations_as_of(self, as_of: str, limit: int = 100) -> list[dict]:
        """Historical replay (§25): what the world looked like at as_of (event
        time). Belief-time validity lives in valid_from/valid_until; replay
        uses observed_at so corrections dated later never leak into the past."""
        return [dict(r) for r in self.db.query(
            "SELECT * FROM world_observations WHERE observed_at <= ?"
            " AND (valid_until IS NULL OR valid_until > ?)"
            " ORDER BY observed_at DESC LIMIT ?",
            (as_of, as_of, limit),
        )]

    def recent(self, limit: int = 50) -> list[dict]:
        return [dict(r) for r in self.db.query(
            "SELECT * FROM world_observations ORDER BY id DESC LIMIT ?", (limit,))]
