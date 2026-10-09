"""Resource manager (Master Prompt §11) — CPU-only edition.

Detects the real envelope of the machine (CPU, RAM, disk, GPU state) using the
standard library where possible (psutil optional). The model router consumes
the VRAM field; the kernel consumes the quota check. GPU is reported as
disabled with zero VRAM — the honest state under the CPU-only decision.
"""

from __future__ import annotations

import ctypes
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ResourceSnapshot:
    cpu_cores: int
    ram_total_mb: int
    ram_available_mb: int
    disk_total_gb: float
    disk_free_gb: float
    gpu_enabled: bool
    gpu_vram_total_gb: float
    gpu_vram_available_gb: float
    cpu_percent: float | None = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "cpu_cores": self.cpu_cores,
            "cpu_percent": self.cpu_percent,
            "ram_total_mb": self.ram_total_mb,
            "ram_available_mb": self.ram_available_mb,
            "disk_total_gb": round(self.disk_total_gb, 2),
            "disk_free_gb": round(self.disk_free_gb, 2),
            "gpu_enabled": self.gpu_enabled,
            "gpu_vram_total_gb": self.gpu_vram_total_gb,
            "gpu_vram_available_gb": self.gpu_vram_available_gb,
            "notes": self.notes,
        }


def _ram_windows() -> tuple[int, int]:
    """(total_mb, available_mb) via GlobalMemoryStatusEx."""
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    stat = MEMORYSTATUSEX()
    stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):  # type: ignore[attr-defined]
        return int(stat.ullTotalPhys // (1024 * 1024)), int(stat.ullAvailPhys // (1024 * 1024))
    return 0, 0


def _ram_linux() -> tuple[int, int]:
    total = available = 0
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            key, _, rest = line.partition(":")
            value_kb = int(rest.strip().split()[0]) if rest.strip() else 0
            if key == "MemTotal":
                total = value_kb // 1024
            elif key == "MemAvailable":
                available = value_kb // 1024
    except OSError:
        pass
    return total, available


def detect(gpu_enabled: bool = False, storage_root: Path | None = None) -> ResourceSnapshot:
    notes: list[str] = []
    cores = os_cpu = 0
    try:
        import multiprocessing

        cores = multiprocessing.cpu_count()
    except Exception:  # noqa: BLE001
        cores = 1
    os_cpu = cores

    cpu_percent: float | None = None
    try:
        import psutil  # type: ignore[import-not-found]

        cpu_percent = float(psutil.cpu_percent(interval=None))
        vm = psutil.virtual_memory()
        ram_total, ram_avail = int(vm.total // (1024 * 1024)), int(vm.available // (1024 * 1024))
    except ImportError:
        if sys.platform.startswith("win"):
            ram_total, ram_avail = _ram_windows()
        else:
            ram_total, ram_avail = _ram_linux()
        notes.append("psutil not installed: CPU% unavailable, RAM via OS fallback")

    disk_total = disk_free = 0.0
    probe_dir = Path(storage_root) if storage_root else Path(".")
    try:
        probe_dir.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(probe_dir)
        disk_total = usage.total / (1024**3)
        disk_free = usage.free / (1024**3)
    except OSError as exc:  # pragma: no cover - platform edge
        notes.append(f"disk probe failed: {exc}")

    return ResourceSnapshot(
        cpu_cores=os_cpu,
        cpu_percent=cpu_percent,
        ram_total_mb=ram_total,
        ram_available_mb=ram_avail,
        disk_total_gb=disk_total,
        disk_free_gb=disk_free,
        gpu_enabled=gpu_enabled,
        gpu_vram_total_gb=0.0 if not gpu_enabled else -1.0,  # -1: enabled but unprobed (future)
        gpu_vram_available_gb=0.0 if not gpu_enabled else -1.0,
        notes=notes,
    )


class QuotaExceeded(Exception):
    def __init__(self, used: int, limit: int) -> None:
        self.used = used
        self.limit = limit
        super().__init__(f"storage quota exceeded: {used} bytes used of {limit} allowed")
