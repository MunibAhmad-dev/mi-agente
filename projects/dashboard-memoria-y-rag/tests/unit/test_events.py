"""Unit tests for the internal event bus."""

from __future__ import annotations

import asyncio

import pytest

from brain.core.events import EventBus


@pytest.fixture
def bus():
    """Fresh event bus for each test."""
    return EventBus()


class TestEventBus:
    """Test event bus operations."""

    @pytest.mark.asyncio
    async def test_emit_no_handlers(self, bus):
        """Emit with no handlers should not raise."""
        await bus.emit("test_event", {"key": "value"})

    @pytest.mark.asyncio
    async def test_on_and_emit(self, bus):
        """Register handler and emit event."""
        received = []

        async def handler(payload):
            received.append(payload)

        bus.on("test_event", handler)
        await bus.emit("test_event", {"key": "value"})

        assert len(received) == 1
        assert received[0]["key"] == "value"

    @pytest.mark.asyncio
    async def test_multiple_handlers(self, bus):
        """Multiple handlers for same event."""
        results = {"a": 0, "b": 0}

        async def handler_a(payload):
            results["a"] += 1

        async def handler_b(payload):
            results["b"] += 1

        bus.on("test_event", handler_a)
        bus.on("test_event", handler_b)
        await bus.emit("test_event")

        assert results["a"] == 1
        assert results["b"] == 1

    @pytest.mark.asyncio
    async def test_off(self, bus):
        """Unregister handler."""
        received = []

        async def handler(payload):
            received.append(payload)

        bus.on("test_event", handler)
        bus.off("test_event", handler)
        await bus.emit("test_event")

        assert len(received) == 0

    @pytest.mark.asyncio
    async def test_clear(self, bus):
        """Clear all handlers."""
        received = []

        async def handler(payload):
            received.append(payload)

        bus.on("a", handler)
        bus.on("b", handler)
        bus.clear()
        await bus.emit("a")
        await bus.emit("b")

        assert len(received) == 0
