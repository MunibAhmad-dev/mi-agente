"""Knowledge domain models — entities, relationships, mentions."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class EntityCreate(BaseModel):
    """Request to create an entity."""
    name: str
    type: str = "Concept"
    space: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class Entity(BaseModel):
    """Entity model."""
    id: str
    name: str
    type: str
    space: str | None = None
    space_id: int | None = None
    mention_count: int = 1
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class EntityMention(BaseModel):
    """Entity mention in a chunk."""
    id: str
    entity_id: str
    chunk_id: str
    start_offset: int
    end_offset: int
    context: str = ""


class RelationshipCreate(BaseModel):
    """Request to create a relationship."""
    source_entity_id: str
    target_entity_id: str
    type: str = "related_to"
    strength: float = 1.0
    chunk_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Relationship(BaseModel):
    """Relationship model."""
    id: str
    source_entity_id: str
    target_entity_id: str
    source_name: str = ""
    target_name: str = ""
    type: str
    strength: float = 1.0
    chunk_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class GraphVisualization(BaseModel):
    """Graph visualization data for frontend."""
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    stats: dict[str, Any]


class ProvenanceChain(BaseModel):
    """Full provenance chain from answer to source."""
    chunk_id: str
    content: str
    similarity: float
    document_id: str | None = None
    document_filename: str | None = None
    source_id: str | None = None
    source_name: str | None = None
    source_type: str | None = None
    entities: list[dict[str, Any]] = Field(default_factory=list)
