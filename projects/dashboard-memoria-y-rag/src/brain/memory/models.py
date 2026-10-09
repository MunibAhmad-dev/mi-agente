"""Memory domain models — Pydantic models for memory CRUD."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from brain.core.types import ID, MemoryCategory, MemoryState


class MemoryCreate(BaseModel):
    """Request to create a new memory (chunk)."""

    content: str
    space: str = "default"
    category: MemoryCategory = MemoryCategory.fact
    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)
    source_name: str | None = None
    source_type: str | None = None


class MemoryUpdate(BaseModel):
    """Request to update a memory."""

    content: str | None = None
    space: str | None = None
    category: MemoryCategory | None = None
    importance: float | None = Field(default=None, ge=0.0, le=1.0)
    state: MemoryState | None = None
    metadata: dict[str, Any] | None = None


class Memory(BaseModel):
    """Memory (chunk) model."""

    id: ID
    content: str
    space: str = "default"
    space_id: int = 1
    category: str = "fact"
    importance: float = 0.5
    state: str = "extracted"
    source_name: str | None = None
    source_type: str | None = None
    source_count: int = 1
    forgotten: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class MemorySearchResult(BaseModel):
    """A memory with search relevance score."""

    memory: Memory
    similarity: float = 0.0


class MemorySpaceCreate(BaseModel):
    """Request to create a memory space."""

    name: str
    description: str = ""
    color: str = "#6366f1"


class MemorySpace(BaseModel):
    """Memory space model."""

    id: int
    name: str
    description: str = ""
    color: str = "#6366f1"
    created_at: datetime
    updated_at: datetime


class MemoryStats(BaseModel):
    """Memory statistics."""

    total: int = 0
    active: int = 0
    forgotten: int = 0
    by_state: dict[str, int] = Field(default_factory=dict)
    by_category: dict[str, int] = Field(default_factory=dict)
    spaces: int = 0
