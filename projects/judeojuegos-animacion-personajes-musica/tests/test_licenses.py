"""Licensing firewall tests (Master Prompt §4)."""

from __future__ import annotations

import pytest

from engine.licenses import LicenseBlocked
from engine.models import ModelRegistry


def test_registry_seeded(kernel):
    entries = kernel.licenses.list()
    assert len(entries) >= 15
    names = {e["name"] for e in entries}
    assert {"wan2.2", "ace-step", "qwen-image", "flux.1-schnell", "flux.1-dev", "blender", "godot"} <= names


def test_flux_dev_is_blocked(kernel):
    entry = kernel.licenses.get("flux.1-dev")
    assert entry["verdict"] == "BLOCKED"
    assert entry["commercial_use"] is False
    assert "non-commercial" in entry["restrictions"].lower()


def test_gate_blocks_and_overrides(kernel):
    with pytest.raises(LicenseBlocked):
        kernel.licenses.gate("flux.1-dev")
    assert kernel.licenses.gate("flux.1-dev", override_reason="explicit user authorization") == "BLOCKED"
    assert kernel.licenses.gate("wan2.2") == "APPROVED"


def test_unknown_component_is_not_trusted(kernel):
    with pytest.raises(LicenseBlocked):
        kernel.licenses.gate("totally-unknown-model")


def test_register_validates_verdict(kernel):
    with pytest.raises(ValueError):
        kernel.licenses.register({"name": "x", "verdict": "SURE_FINE"})
    entry = kernel.licenses.register({"name": "custom-model", "verdict": "RESTRICTED"})
    assert entry["verdict"] == "RESTRICTED"


def test_model_registration_refuses_blocked_license(kernel):
    registry = ModelRegistry(kernel.Session, kernel.licenses)
    with pytest.raises(LicenseBlocked):
        registry.register(
            "my-flux-dev", "image", quality=0.9, speed=0.5, license_name="flux.1-dev"
        )
    # Explicit override is recorded, never silent.
    row = registry.register(
        "my-flux-dev",
        "image",
        quality=0.9,
        speed=0.5,
        license_name="flux.1-dev",
        license_override_reason="authorized for research build only",
    )
    assert row["active"] is True
