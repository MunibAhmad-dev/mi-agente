"""Project memory + search (Master Prompt §53, §54).

Nine fixed categories (§53): project, character, world, visual, asset, voice,
music, conversation, technical. Search is real and CPU-only:

- keyword: BM25-lite ranking over tokens (k1=1.5, b=0.75).
- semantic: deterministic feature-hashing embedding (256 dims, MD5-hashed token
  n-grams, L2-normalized) + cosine similarity. It is a lexical-embedding —
  honest about what it is; CLIP/sentence-transformer embeddings plug into the
  same interface once model weights are installed.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Any

from sqlalchemy import select

from engine.kernel.models import MemoryEntry
from engine.logging_conf import get_logger

logger = get_logger("memory")

CATEGORIES = (
    "project", "character", "world", "visual", "asset",
    "voice", "music", "conversation", "technical",
)

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_EMBED_DIM = 256
_K1 = 1.5
_B = 0.75


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def embed(text: str) -> list[float]:
    """Deterministic feature-hashing embedding of token bigrams+unigrams."""
    vec = [0.0] * _EMBED_DIM
    toks = tokenize(text)
    grams = toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]
    for gram in grams:
        digest = hashlib.md5(gram.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "little") % _EMBED_DIM
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _bm25_scores(query_tokens: list[str], docs: list[list[str]]) -> list[float]:
    n = len(docs) or 1
    avgdl = sum(len(d) for d in docs) / n or 1.0
    df: dict[str, int] = {}
    for doc in docs:
        for term in set(doc):
            df[term] = df.get(term, 0) + 1
    scores = []
    for doc in docs:
        score = 0.0
        dl = len(doc) or 1
        tf: dict[str, int] = {}
        for term in doc:
            tf[term] = tf.get(term, 0) + 1
        for term in query_tokens:
            if term not in tf:
                continue
            idf = math.log(1 + (n - df.get(term, 0) + 0.5) / (df.get(term, 0) + 0.5))
            score += idf * (tf[term] * (_K1 + 1)) / (tf[term] + _K1 * (1 - _B + _B * dl / avgdl))
        scores.append(score)
    return scores


class MemoryStore:
    def __init__(self, session_factory) -> None:
        self.Session = session_factory

    def add(self, project_id: str, category: str, text: str, key: str = "", meta: dict | None = None) -> dict:
        if category not in CATEGORIES:
            raise ValueError(f"category must be one of {CATEGORIES}")
        text = (text or "").strip()
        if not text:
            raise ValueError("memory text is required")
        with self.Session() as s:
            row = MemoryEntry(project_id=project_id, category=category, key=key.strip(), text=text, meta=meta or {})
            s.add(row)
            s.commit()
            return {
                "id": row.id, "project_id": row.project_id, "category": row.category,
                "key": row.key, "text": row.text, "meta": row.meta, "created_at": row.created_at.isoformat(),
            }

    def list(self, project_id: str, category: str | None = None) -> list[dict]:
        with self.Session() as s:
            q = select(MemoryEntry).where(MemoryEntry.project_id == project_id).order_by(MemoryEntry.created_at)
            if category:
                q = q.where(MemoryEntry.category == category)
            rows = s.scalars(q).all()
        return [
            {"id": r.id, "project_id": r.project_id, "category": r.category, "key": r.key,
             "text": r.text, "meta": r.meta, "created_at": r.created_at.isoformat()}
            for r in rows
        ]

    def search(
        self, project_id: str, query: str, mode: str = "keyword", category: str | None = None, limit: int = 10
    ) -> list[dict[str, Any]]:
        """mode: keyword | semantic | both. Returns ranked entries with scores."""
        if mode not in ("keyword", "semantic", "both"):
            raise ValueError("mode must be keyword, semantic, or both")
        entries = self.list(project_id, category=category)
        if not entries or not query.strip():
            return []
        results: dict[str, dict[str, Any]] = {}

        def push(entry: dict, score: float, source: str) -> None:
            slot = results.setdefault(entry["id"], {"entry": entry, "scores": {}})
            slot["scores"][source] = max(slot["scores"].get(source, 0.0), round(score, 4))

        if mode in ("keyword", "both"):
            q_tokens = tokenize(query)
            docs = [tokenize(f"{e['key']} {e['text']}") for e in entries]
            for entry, score in zip(entries, _bm25_scores(q_tokens, docs)):
                if score > 0:
                    push(entry, score, "keyword")
        if mode in ("semantic", "both"):
            q_vec = embed(query)
            for entry in entries:
                score = cosine(q_vec, embed(f"{entry['key']} {entry['text']}"))
                if score > 0.05:
                    push(entry, score, "semantic")
        ranked = []
        for slot in results.values():
            primary = "keyword" if "keyword" in slot["scores"] else "semantic"
            ranked.append({**slot["entry"], "score": slot["scores"][primary], "matched_by": sorted(slot["scores"])})
        ranked.sort(key=lambda r: -r["score"])
        return ranked[: max(1, limit)]
