"""Adapter availability (Master Prompt §12/§13 infrastructure).

Every external engine the platform coordinates is *probed*, never assumed:
binaries via PATH, HTTP services via a real request, GPU via the config flag.
Results feed the dashboard, the model registry, and the router. A missing
adapter is a loud, reasoned "unavailable" — never a silent fake.
"""

from __future__ import annotations

import os
import shutil
import urllib.error
import urllib.request
from typing import Any


def _which_probe(binary: str) -> dict[str, Any]:
    path = shutil.which(binary)
    return {
        "available": path is not None,
        "detail": path or "binary not found on PATH",
    }


def _url_probe(env_var: str) -> dict[str, Any]:
    base = os.environ.get(env_var, "").strip()
    if not base:
        return {"available": False, "detail": f"{env_var} not configured"}
    try:
        with urllib.request.urlopen(base, timeout=2) as resp:
            return {"available": True, "detail": f"HTTP {resp.status} at {base}"}
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {"available": False, "detail": f"{base} unreachable: {exc}"}


def probe(name: str) -> dict[str, Any]:
    if name in ("ffmpeg", "ffprobe", "blender", "godot", "renpy"):
        return _which_probe({"renpy": "renpy", "godot": "godot"}.get(name, name))
    if name == "comfyui":
        return _url_probe("UCE_COMFYUI_URL")
    if name == "llama_cpp":
        return _url_probe("UCE_LLAMACPP_URL")
    if name == "gpu":
        try:
            from engine.config import Settings

            enabled = Settings().enable_gpu
        except Exception:  # noqa: BLE001 - config must not break probing
            enabled = False
        return {
            "available": enabled,
            "detail": "DISABLED by user decision (2026-09-07): CPU-only until UCE_ENABLE_GPU=true"
            if not enabled
            else "enabled — GPU adapters to be connected in the GPU phase",
        }
    raise ValueError(f"unknown adapter: {name}")


def adapter_names() -> list[str]:
    return ["ffmpeg", "ffprobe", "blender", "godot", "renpy", "comfyui", "llama_cpp", "gpu"]


def probe_all() -> dict[str, dict[str, Any]]:
    return {name: probe(name) for name in adapter_names()}
