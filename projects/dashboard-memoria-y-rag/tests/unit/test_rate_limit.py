"""Unit tests for rate limiter."""

from __future__ import annotations

import time

import pytest

from brain.security.rate_limit import RateLimiter


class TestRateLimiter:
    """Test sliding window rate limiter."""

    def test_allows_within_limit(self):
        """Requests within limit should be allowed."""
        rl = RateLimiter(max_per_minute=5)
        for _ in range(5):
            assert rl.check("client1") is True

    def test_blocks_over_limit(self):
        """Requests over limit should be blocked."""
        rl = RateLimiter(max_per_minute=3)
        assert rl.check("client2") is True
        assert rl.check("client2") is True
        assert rl.check("client2") is True
        assert rl.check("client2") is False  # 4th request blocked

    def test_separate_clients(self):
        """Different clients have independent limits."""
        rl = RateLimiter(max_per_minute=2)
        assert rl.check("a") is True
        assert rl.check("a") is True
        assert rl.check("a") is False  # a is at limit
        assert rl.check("b") is True  # b is fresh

    def test_remaining(self):
        """Remaining count is accurate."""
        rl = RateLimiter(max_per_minute=10)
        assert rl.remaining("c") == 10
        rl.check("c")
        assert rl.remaining("c") == 9

    def test_reset(self):
        """Reset clears the client counter."""
        rl = RateLimiter(max_per_minute=2)
        rl.check("d")
        rl.check("d")
        assert rl.check("d") is False
        rl.reset("d")
        assert rl.check("d") is True
