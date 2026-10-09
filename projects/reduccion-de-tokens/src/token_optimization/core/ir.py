"""ContextIR: the fundamental unit of the system (spec §54)."""
from __future__ import annotations

import hashlib
import time
import uuid
from enum import Enum

from pydantic import BaseModel, Field


def stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:16]


class Role(str, Enum):
    SYSTEM = "system"
    DEVELOPER = "developer"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    EXTERNAL = "external"


class ContentType(str, Enum):
    TEXT = "text"
    JSON = "json"
    LOGS = "logs"
    CODE = "code"
    MARKDOWN = "markdown"
    SEARCH_RESULTS = "search_results"
    RAG_CHUNK = "rag_chunk"
    TABLE = "table"
    AGENT_TRAJECTORY = "agent_trajectory"
    UNKNOWN = "unknown"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Provenance(BaseModel):
    source: str = "unknown"
    role: Role = Role.EXTERNAL
    trust: float = 0.5
    origin: str | None = None


class ContextItem(BaseModel):
    """Immutable context atom with provenance and hash (spec §54)."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    content: str
    content_type: ContentType = ContentType.TEXT
    role: Role = Role.USER
    source: str = "unknown"
    task_id: str = "default"
    agent_id: str = "default"
    timestamp: float = Field(default_factory=time.time)
    importance: float = 0.5
    risk: RiskLevel = RiskLevel.LOW
    trust: float = 0.5
    token_count: int | None = None
    compression_state: str = "raw"
    retrieval_pointer: str | None = None
    hash: str = ""
    dependencies: list[str] = Field(default_factory=list)

    def model_post_init(self, __context) -> None:
        if not self.hash:
            object.__setattr__(
                self, "hash", stable_hash(f"{self.role.value}|{self.source}|{self.content}")
            )

    def clone_with(self, **changes) -> "ContextItem":
        data = self.model_dump()
        data.update(changes)
        data["hash"] = ""
        return ContextItem(**data)


class ScoredItem(BaseModel):
    item: ContextItem
    value: float = 0.0
    reason: str = ""
