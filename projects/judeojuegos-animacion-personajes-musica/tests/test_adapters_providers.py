"""Adapters + provider manager tests (Master Prompt §12, §55)."""

from __future__ import annotations

import pytest

from engine.adapters import adapter_names, probe, probe_all
from engine.kernel import Kernel
from engine.providers import ProviderManager, ProviderUnavailable


def test_probe_all_honest():
    probes = probe_all()
    assert set(adapter_names()) <= set(probes)
    gpu = probes["gpu"]
    assert gpu["available"] is False
    assert "DISABLED" in gpu["detail"] or "disabled" in gpu["detail"].lower()


def test_probe_unknown():
    with pytest.raises(ValueError):
        probe("warp-drive")


def test_probe_binaries_return_details():
    result = probe("blender")
    assert isinstance(result["available"], bool)
    assert result["detail"]


def test_provider_registration_and_health(kernel):
    kernel.providers.add("p1", base_url="", keys=["k1"], priority=3)
    health = kernel.providers.health("p1")
    assert health["healthy"] is False  # no base_url -> cannot be healthy
    listing = kernel.providers.list()
    assert listing[0]["name"] == "p1" and listing[0]["priority"] == 3


def test_provider_pick_rotation_and_quota(kernel):
    manager = ProviderManager(kernel.Session, transport=lambda url: (200, "ok"))
    manager.add("prov", base_url="http://unit.test", keys=["k1", "k2"], priority=1, quota_total=2)
    manager.health("prov")
    picks = [manager.pick()["key_index"] for _ in range(2)]
    assert picks == [0, 1]  # round-robin over keys
    manager.record_usage("prov", 2)  # quota now exhausted
    with pytest.raises(ProviderUnavailable):
        manager.pick()


def test_provider_fallback_priority_order(kernel):
    manager = ProviderManager(kernel.Session, transport=lambda url: (200, "ok"))
    manager.add("low", base_url="http://low.test", keys=["k"], priority=1)
    manager.add("high", base_url="http://high.test", keys=["k"], priority=9)
    for name in ("low", "high"):
        manager.health(name)
    assert manager.pick()["provider"] == "high"
    manager.remove("high")
    assert manager.pick()["provider"] == "low"


def test_provider_unreachable_is_unhealthy(kernel):
    def failing_transport(url: str):
        raise OSError("connection refused")

    manager = ProviderManager(kernel.Session, transport=failing_transport)
    manager.add("down", base_url="http://blackhole.test", keys=["k"])
    health = manager.health("down")
    assert health["healthy"] is False
    with pytest.raises(ProviderUnavailable):
        manager.pick()


def test_provider_removed(kernel):
    kernel.providers.add("gone", keys=["k"])
    assert kernel.providers.remove("gone") is True
    assert kernel.providers.remove("gone") is False
    assert kernel.providers.get("gone") is None


def test_isolated_manager_shares_registry(kernel):
    kernel.providers.add("shared", base_url="http://x.test", keys=["k"])
    manager = ProviderManager(kernel.Session, transport=lambda url: (200, "ok"))
    manager.health("shared")
    assert manager.pick()["provider"] == "shared"
