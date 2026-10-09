"""Model registry + router tests (Master Prompt §10, §56)."""

from __future__ import annotations

import pytest

from engine.models import ModelUnavailable


def test_seed_defaults_present_and_unavailable(kernel):
    models = kernel.model_registry.list()
    assert len(models) >= 8
    by_name = {m["name"]: m for m in models}
    # All seeded candidates are honestly unavailable (GPU off, no weights).
    assert all(m["availability"] == "unavailable" for m in models)
    assert "wan2.2-14b" in by_name and "qwen-image" in by_name


def test_router_refuses_unavailable_with_reasons(kernel):
    preview = kernel.router.preview("video")
    assert preview["selected"] is None
    assert preview["reasons"], "refusal must come with reasons"
    with pytest.raises(ModelUnavailable):
        kernel.router.select("video")


def test_router_selects_available_cpu_model(kernel):
    kernel.model_registry.register(
        "test-llm", "llm", quality=0.9, speed=0.5, cpu_ok=True, availability="available"
    )
    picked = kernel.router.select("llm", "BALANCED")
    assert picked["name"] == "test-llm"


def test_mode_weights_change_the_winner(kernel):
    kernel.model_registry.register("slow-quality", "llm", quality=0.9, speed=0.2, cpu_ok=True, availability="available")
    kernel.model_registry.register("fast-loose", "llm", quality=0.5, speed=0.95, cpu_ok=True, availability="available")
    assert kernel.router.select("llm", "MAX_QUALITY")["name"] == "slow-quality"
    assert kernel.router.select("llm", "FAST")["name"] == "fast-loose"


def test_quality_guard_blocks_below_floor(kernel):
    kernel.model_registry.register("good", "llm", quality=0.8, speed=0.5, cpu_ok=True, availability="available")
    kernel.model_registry.register("bad", "llm", quality=0.1, speed=0.99, cpu_ok=True, availability="available")
    guarded = kernel.router.preview("llm", "FAST")
    assert guarded["selected"] == "good"
    rejected = {c["name"] for c in guarded["candidates"] if not c["eligible"]}
    assert "bad" in rejected
    # Explicit override (never silent): allow below the floor.
    overridden = kernel.router.preview("llm", "FAST", allow_below_floor=True)
    assert overridden["selected"] == "bad"


def test_vram_gate(kernel):
    kernel.model_registry.register(
        "gpu-model", "image", quality=0.9, speed=0.5, vram_gb=24.0, cpu_ok=False, availability="available"
    )
    preview = kernel.router.preview("image", vram_available_gb=0.0)
    assert preview["selected"] is None
    reasons = " ".join(preview["reasons"])
    assert "VRAM" in reasons


def test_set_availability(kernel):
    kernel.model_registry.register("flip", "llm", quality=0.8, speed=0.5, cpu_ok=True)
    with pytest.raises(ModelUnavailable):
        kernel.router.select("llm")  # unavailable -> refused with reasons
    kernel.model_registry.set_availability("flip", True, "installed by test")
    assert kernel.router.select("llm")["name"] == "flip"


def test_register_validation(kernel):
    with pytest.raises(ValueError):
        kernel.model_registry.register("bad-modality", "hologram")
    with pytest.raises(ValueError):
        kernel.model_registry.register("bad-quality", "llm", quality=7.0)
