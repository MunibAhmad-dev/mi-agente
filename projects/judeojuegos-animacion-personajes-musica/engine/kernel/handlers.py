"""Task handler registry.

Handlers are the smallest real units of work. M0 ships four *core* handlers
used to prove the kernel: storage writes, dependency-based composition,
transient failure, and process crash. Media handlers (image, 3D, ...) are
adapters added in later phases through the same contract.

Handler signature:
    Handler(params, ctx, inputs) -> list[ArtifactOut]

    inputs: list of (dependency_task_id, [ArtifactOut]) in dependency order.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from engine.kernel.errors import UCEError
from engine.kernel.storage import AssetStore


@dataclass
class ArtifactOut:
    name: str
    kind: str
    data: bytes


@dataclass
class HandlerContext:
    task_id: str
    job_id: str
    workdir: Path
    store: AssetStore


Handler = Callable[[dict[str, Any], HandlerContext, list[tuple[str, list[ArtifactOut]]]], list[ArtifactOut]]

HANDLERS: dict[str, Handler] = {}


def register(kind: str) -> Callable[[Handler], Handler]:
    def decorator(fn: Handler) -> Handler:
        HANDLERS[kind] = fn
        return fn

    return decorator


@register("core.write_text")
def write_text(params: dict[str, Any], ctx: HandlerContext, inputs: list[tuple[str, list[ArtifactOut]]]) -> list[ArtifactOut]:
    name = params["name"]
    content = params["content"]
    return [ArtifactOut(name=name, kind="text", data=content.encode("utf-8"))]


@register("core.concat_text")
def concat_text(params: dict[str, Any], ctx: HandlerContext, inputs: list[tuple[str, list[ArtifactOut]]]) -> list[ArtifactOut]:
    """Concatenates dependency artifacts in edge order (deterministic)."""
    parts: list[str] = []
    for _dep_id, artifacts in inputs:
        for artifact in artifacts:
            parts.append(artifact.data.decode("utf-8"))
    return [ArtifactOut(name=params.get("name", "concat.txt"), kind="text", data="".join(parts).encode("utf-8"))]


@register("core.fail_once")
def fail_once(params: dict[str, Any], ctx: HandlerContext, inputs: list[tuple[str, list[ArtifactOut]]]) -> list[ArtifactOut]:
    """Fails the first attempt with a transient error, succeeds on retry."""
    marker = ctx.workdir / "fail_once.marker"
    if not marker.exists():
        marker.write_text("failed", encoding="utf-8")
        raise UCEError(
            "simulated transient failure",
            code="SIMULATED_TRANSIENT",
            cause="fail_once handler marker not present",
            task_kind="core.fail_once",
            resource="cpu",
            suggested_fix="retry the task (transient by design)",
        )
    return [ArtifactOut(name=params["name"], kind="text", data=params["content"].encode("utf-8"))]


@register("core.fail_twice")
def fail_twice(params: dict[str, Any], ctx: HandlerContext, inputs: list[tuple[str, list[ArtifactOut]]]) -> list[ArtifactOut]:
    """Fails the first two attempts, succeeds on the third (retry-budget test)."""
    marker = ctx.workdir / "fail_twice.marker"
    failures = int(marker.read_text(encoding="utf-8")) if marker.exists() else 0
    if failures < 2:
        marker.write_text(str(failures + 1), encoding="utf-8")
        raise UCEError(
            "simulated repeated failure",
            code="SIMULATED_REPEATED",
            task_kind="core.fail_twice",
            resource="cpu",
            suggested_fix="raise the retry budget or fix the underlying cause",
        )
    return [ArtifactOut(name=params["name"], kind="text", data=params["content"].encode("utf-8"))]


@register("core.grow_text")
def grow_text(params: dict[str, Any], ctx: HandlerContext, inputs: list[tuple[str, list[ArtifactOut]]]) -> list[ArtifactOut]:
    """Grows its output on every attempt — proves the automatic repair loop can
    actually converge: attempt 1 fails QA (too short), attempt 2 passes."""
    marker = ctx.workdir / "grow_text.marker"
    attempt = int(marker.read_text(encoding="utf-8")) if marker.exists() else 0
    marker.write_text(str(attempt + 1), encoding="utf-8")
    base = params.get("content", "x")
    content = base * (attempt + 1)
    return [ArtifactOut(name=params["name"], kind="text", data=content.encode("utf-8"))]


@register("core.sleep")
def sleep_handler(params: dict[str, Any], ctx: HandlerContext, inputs: list[tuple[str, list[ArtifactOut]]]) -> list[ArtifactOut]:
    """Sleeps for params['seconds'] then writes text — exercises the worker
    wall-clock budget (WORKER_TIMEOUT) and future cancellation semantics."""
    import time as _time

    _time.sleep(float(params.get("seconds", 0)))
    return [ArtifactOut(name=params["name"], kind="text", data=params.get("content", "slept").encode("utf-8"))]


@register("core.crash_once")
def crash_once(params: dict[str, Any], ctx: HandlerContext, inputs: list[tuple[str, list[ArtifactOut]]]) -> list[ArtifactOut]:
    """Hard-crashes the worker process on the first attempt (no DB update).

    Used to prove crash recovery: the kernel must detect the dead worker,
    record a WORKER_DIED error, and produce identical artifacts after resume.
    """
    marker = ctx.workdir / "crash_once.marker"
    if not marker.exists():
        marker.write_text("crashed", encoding="utf-8")
        os._exit(7)  # simulate an unrecoverable worker crash
    return [ArtifactOut(name=params["name"], kind="text", data=params["content"].encode("utf-8"))]