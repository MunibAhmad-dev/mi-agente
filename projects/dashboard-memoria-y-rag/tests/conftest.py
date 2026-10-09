"""Shared test fixtures and configuration."""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def sample_memory_data() -> dict:
    """Sample memory data for tests."""
    return {
        "content": "PostgreSQL is a powerful open-source relational database",
        "space": "default",
        "category": "fact",
        "importance": 0.7,
        "source_name": "test_document",
        "source_type": "paste",
    }


@pytest.fixture
def sample_space_data() -> dict:
    """Sample space data for tests."""
    return {
        "name": "test-space",
        "description": "A test memory space",
        "color": "#ff0000",
    }


@pytest.fixture
def sample_search_query() -> str:
    """Sample search query."""
    return "What is PostgreSQL?"
