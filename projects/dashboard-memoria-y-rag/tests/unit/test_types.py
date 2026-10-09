"""Unit tests for core types and exceptions."""

from __future__ import annotations

import pytest

from brain.core.types import (
    MemoryState,
    EntityType,
    RelationshipType,
    DocumentStatus,
    MemoryCategory,
)
from brain.core.exceptions import (
    BrainError,
    DatabaseError,
    NotFoundError,
    AuthError,
    SearchError,
    EmbeddingError,
)


class TestTypes:
    """Test core type definitions."""

    def test_entity_types(self):
        """Test all entity types are defined."""
        assert EntityType.person.value == "Person"
        assert EntityType.technology.value == "Technology"
        assert len(EntityType) == 9

    def test_relationship_types(self):
        """Test relationship types."""
        assert RelationshipType.related_to.value == "related_to"
        assert RelationshipType.uses.value == "uses"
        assert len(RelationshipType) == 7

    def test_document_status(self):
        """Test document processing states."""
        assert DocumentStatus.queued.value == "queued"
        assert DocumentStatus.done.value == "done"
        assert len(DocumentStatus) == 4


class TestExceptions:
    """Test exception hierarchy."""

    def test_base_error(self):
        """Test base BrainError."""
        e = BrainError("test error")
        assert str(e) == "test error"
        assert e.message == "test error"
        assert e.detail is None

    def test_error_with_detail(self):
        """Test error with detail."""
        e = BrainError("error", detail="extra info")
        assert e.detail == "extra info"

    def test_exception_inheritance(self):
        """Test exception inheritance chain."""
        assert issubclass(DatabaseError, BrainError)
        assert issubclass(NotFoundError, BrainError)
        assert issubclass(AuthError, BrainError)
        assert issubclass(SearchError, BrainError)
        assert issubclass(EmbeddingError, SearchError)
        assert issubclass(EmbeddingError, BrainError)
