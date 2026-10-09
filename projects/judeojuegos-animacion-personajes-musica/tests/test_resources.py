"""Resource manager tests (Master Prompt §11)."""

from __future__ import annotations

import pytest

from engine.kernel import Kernel
from engine.resources import QuotaExceeded, detect
from tests.conftest import make_project


def test_snapshot_fields_are_sane(tmp_path):
    snap = detect(gpu_enabled=False, storage_root=tmp_path).to_dict()
    assert snap["cpu_cores"] >= 1
    assert snap["ram_total_mb"] > 0
    assert snap["disk_total_gb"] > 0
    assert snap["gpu_enabled"] is False
    assert snap["gpu_vram_total_gb"] == 0.0
    assert snap["gpu_vram_available_gb"] == 0.0


def test_snapshot_honest_notes_without_psutil(tmp_path):
    snap = detect(gpu_enabled=False, storage_root=tmp_path)
    if snap.cpu_percent is None:
        assert any("psutil" in n for n in snap.notes)


def test_quota_enforced(tmp_path):
    kernel = Kernel(
        db_url=f"sqlite:///{tmp_path / 'q.db'}",
        storage_root=tmp_path / "assets",
        project_quota_bytes=64,
    )
    pid = make_project(kernel)
    kernel.create_asset(pid, "small.bin", "file", b"x" * 10)
    with pytest.raises(QuotaExceeded):
        kernel.create_asset(pid, "big.bin", "file", b"y" * 1024)


def test_quota_unlimited_by_default(kernel):
    pid = make_project(kernel)
    kernel.create_asset(pid, "big.bin", "file", b"y" * (1024 * 1024))  # 1 MiB fine
