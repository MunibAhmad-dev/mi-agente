"""Unit tests for configuration module."""

from __future__ import annotations

import os

import pytest

from brain.config import (
    Settings,
    DatabaseSettings,
    EmbeddingSettings,
    LLMSettings,
    get_settings,
)


class TestSettings:
    """Test configuration loading."""

    def test_default_database_url(self):
        """Test default database URL."""
        s = DatabaseSettings()
        assert "postgresql://" in s.url
        assert s.pool_min == 2
        assert s.pool_max == 10

    def test_default_embedding(self):
        """Test default embedding settings."""
        s = EmbeddingSettings()
        assert s.model == "all-MiniLM-L6-v2"
        assert s.device == "cpu"
        assert s.dimension == 384
        assert s.batch_size == 32

    def test_default_llm(self):
        """Test default LLM settings."""
        s = LLMSettings()
        assert s.provider == "ollama"
        assert s.temperature == 0.7
        assert s.max_tokens == 4096

    def test_settings_singleton(self):
        """Test get_settings returns same instance."""
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2

    def test_settings_database_url_property(self):
        """Test database_url property."""
        s = get_settings()
        assert "postgresql://" in s.database_url
