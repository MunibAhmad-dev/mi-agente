"""Unit tests for memory service — model validation and data transformations."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from brain.core.types import MemoryCategory, MemoryState
from brain.memory.models import MemoryCreate, MemoryStats, MemorySpace


class TestMemoryModels:
    """Test memory Pydantic models."""

    def test_memory_create_valid(self):
        """Test valid memory creation."""
        m = MemoryCreate(content="Test content")
        assert m.content == "Test content"
        assert m.space == "default"
        assert m.category == "fact"
        assert m.importance == 0.5

    def test_memory_create_with_options(self):
        """Test memory creation with custom options."""
        m = MemoryCreate(
            content="Important decision",
            space="decisions",
            category="decision",
            importance=0.9,
            source_name="meeting.md",
        )
        assert m.space == "decisions"
        assert m.category == "decision"
        assert m.importance == 0.9
        assert m.source_name == "meeting.md"

    def test_memory_create_importance_bounds(self):
        """Test importance must be between 0 and 1."""
        MemoryCreate(content="ok", importance=0.0)
        MemoryCreate(content="ok", importance=1.0)

        with pytest.raises(ValidationError):
            MemoryCreate(content="bad", importance=-0.1)
        with pytest.raises(ValidationError):
            MemoryCreate(content="bad", importance=1.1)

    def test_memory_create_empty_content(self):
        """Test empty content is valid (caller decides)."""
        m = MemoryCreate(content="")
        assert m.content == ""


class TestMemoryStats:
    """Test memory statistics model."""

    def test_default_stats(self):
        """Test default stats values."""
        stats = MemoryStats()
        assert stats.total == 0
        assert stats.active == 0
        assert stats.forgotten == 0
        assert stats.by_state == {}
        assert stats.by_category == {}


class TestMemorySpace:
    """Test memory space model."""

    def test_space_creation(self):
        """Test space creation."""
        s = MemorySpace(
            id=1,
            name="test",
            description="Test space",
            color="#00ff00",
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        assert s.name == "test"
        assert s.color == "#00ff00"


class TestMemoryTypes:
    """Test memory type enums."""

    def test_memory_states(self):
        """Test all memory states exist."""
        states = [s.value for s in MemoryState]
        assert "candidate" in states
        assert "persistent" in states
        assert "forgotten" in states
        assert "archived" in states
        assert len(states) == 10

    def test_memory_categories(self):
        """Test all memory categories exist."""
        cats = [c.value for c in MemoryCategory]
        assert "decision" in cats
        assert "lesson" in cats
        assert "fact" in cats
        assert len(cats) == 7
