"""Shared type definitions used across the Brain."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# === Identifiers ===
ID = str  # UUID string
Timestamp = datetime


# === Enums ===
class MemoryState(str, Enum):
    """Memory lifecycle states."""

    candidate = "candidate"
    temporary = "temporary"
    extracted = "extracted"
    inferred = "inferred"
    verified = "verified"
    persistent = "persistent"
    conflicting = "conflicting"
    outdated = "outdated"
    forgotten = "forgotten"
    archived = "archived"


class EntityType(str, Enum):
    """Knowledge graph entity types."""

    person = "Person"
    project = "Project"
    tool = "Tool"
    concept = "Concept"
    event = "Event"
    location = "Location"
    organization = "Organization"
    technology = "Technology"
    other = "Other"


class RelationshipType(str, Enum):
    """Knowledge graph relationship types."""

    related_to = "related_to"
    works_on = "works_on"
    uses = "uses"
    depends_on = "depends_on"
    part_of = "part_of"
    created_by = "created_by"
    mentions = "mentions"


class DocumentStatus(str, Enum):
    """Document processing states."""

    queued = "queued"
    processing = "processing"
    done = "done"
    error = "error"


class MemoryCategory(str, Enum):
    """Memory classification categories."""

    decision = "decision"
    lesson = "lesson"
    preference = "preference"
    pattern = "pattern"
    fact = "fact"
    question = "question"
    conversation = "conversation"


# === Base Models ===
class TimeStampMixin(BaseModel):
    """Mixin that adds created_at and updated_at timestamps."""

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UUIDModel(BaseModel):
    """Base model with UUID primary key."""

    id: ID = Field(default_factory=lambda: str(uuid.uuid4()))
