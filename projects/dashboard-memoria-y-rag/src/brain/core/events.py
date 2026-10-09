"""Internal event bus for decoupled module communication."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Callable, Coroutine

EventPayload = dict[str, Any]
EventHandler = Callable[[EventPayload], Coroutine[Any, Any, None]]


class EventBus:
    """Simple in-process event bus for cross-module notifications."""

    def __init__(self) -> None:
        self._handlers: dict[str, list[EventHandler]] = defaultdict(list)

    def on(self, event_name: str, handler: EventHandler) -> None:
        """Register an event handler."""
        self._handlers[event_name].append(handler)

    def off(self, event_name: str, handler: EventHandler) -> None:
        """Unregister an event handler."""
        try:
            self._handlers[event_name].remove(handler)
        except ValueError:
            pass

    async def emit(self, event_name: str, payload: EventPayload | None = None) -> None:
        """Emit an event to all registered handlers."""
        handlers = self._handlers.get(event_name, [])
        payload = payload or {}
        for handler in handlers:
            try:
                await handler(payload)
            except Exception:
                # Log but don't let handler errors break the event flow
                pass

    def clear(self) -> None:
        """Remove all handlers."""
        self._handlers.clear()


# Global event bus instance
event_bus = EventBus()
