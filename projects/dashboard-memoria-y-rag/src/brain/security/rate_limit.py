"""Sliding window rate limiter per client IP.

Adapted from Memory Vault's rate limiting system.
"""

from __future__ import annotations

import time
from collections import defaultdict

from brain.core.exceptions import RateLimitError
from brain.logging_config import get_logger

logger = get_logger("brain.security.rate_limit")


class RateLimiter:
    """In-memory sliding window rate limiter."""

    def __init__(self, max_per_minute: int = 120) -> None:
        self.max_per_minute = max_per_minute
        self._requests: dict[str, list[float]] = defaultdict(list)

    def check(self, client_ip: str) -> bool:
        """Check if the client is within rate limits. Returns True if allowed."""
        now = time.time()
        window_start = now - 60.0

        # Clean old requests
        self._requests[client_ip] = [
            t for t in self._requests[client_ip] if t > window_start
        ]

        if len(self._requests[client_ip]) >= self.max_per_minute:
            logger.warning(
                "rate_limit_exceeded",
                client_ip=client_ip,
                requests=len(self._requests[client_ip]),
                limit=self.max_per_minute,
            )
            return False

        self._requests[client_ip].append(now)
        return True

    def remaining(self, client_ip: str) -> int:
        """Get remaining requests in the current window."""
        now = time.time()
        window_start = now - 60.0
        recent = [t for t in self._requests.get(client_ip, []) if t > window_start]
        return max(0, self.max_per_minute - len(recent))

    def reset(self, client_ip: str) -> None:
        """Reset counter for a client."""
        self._requests.pop(client_ip, None)


# Global rate limiter instance
rate_limiter = RateLimiter()
