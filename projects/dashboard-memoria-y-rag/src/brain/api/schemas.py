"""Pydantic request/response schemas for the Brain API."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# === Health ===
class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    database: str = "connected"
    embedding_backend: str = "none"


# === Memory ===
class MemoryCreateRequest(BaseModel):
    content: str
    space: str = "default"
    category: str = "fact"
    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)
    source_name: str | None = None
    source_type: str | None = None


class MemoryResponse(BaseModel):
    id: Any
    content: str
    space: str = "default"
    category: str = "fact"
    importance: float = 0.5
    state: str = "extracted"
    source_name: Any | None = None
    source_type: Any | None = None
    source_count: int = 1
    forgotten: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: Any = None
    updated_at: Any = None

    model_config = {"extra": "ignore", "from_attributes": True}


class MemoryUpdateRequest(BaseModel):
    content: str | None = None
    category: str | None = None
    importance: float | None = Field(default=None, ge=0.0, le=1.0)
    state: str | None = None


class MemoryListResponse(BaseModel):
    memories: list[MemoryResponse]
    total: int


class MemoryStatsResponse(BaseModel):
    total: int
    active: int
    forgotten: int
    by_state: dict[str, int]
    by_category: dict[str, int]
    spaces: int


# === Space ===
class SpaceCreateRequest(BaseModel):
    name: str
    description: str = ""
    color: str = "#6366f1"


class SpaceResponse(BaseModel):
    id: int
    name: str
    description: str
    color: str
    chunk_count: int = 0
    created_at: str


# === Search ===
class SearchRequest(BaseModel):
    query: str
    space: str | None = None
    limit: int = Field(default=10, ge=1, le=50)


class SearchResultItem(BaseModel):
    chunk_id: str
    content: str
    similarity: float
    source_name: str | None = None
    source_type: str | None = None
    space: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    query: str
    latency_ms: float


# === Token ===
class TokenCreateRequest(BaseModel):
    name: str
    scopes: list[str] = Field(default=["read", "write"])
    expiry_days: int = Field(default=30, ge=1, le=365)


class TokenResponse(BaseModel):
    id: str
    token: str | None = None
    name: str
    scopes: list[str]
    expires_at: str
    last_used_at: str | None = None
    created_at: str


# === Error ===
class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
    request_id: str | None = None
