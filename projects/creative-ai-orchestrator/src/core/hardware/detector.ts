// ============================================================================
// Hardware Detection
// ============================================================================
// Detects GPU, VRAM, RAM, CPU, disk, CUDA, ROCm, drivers.
// Used to make intelligent decisions about models and workflows.
// ============================================================================

import os from "node:os";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { type HardwareProfile, type GpuInfo } from "../types/index.js";
import { CaioDatabase } from "../database/index.js";

function execSafe(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function detectGpus(): GpuInfo[] {
  const gpus: GpuInfo[] = [];

  // Try nvidia-smi (NVIDIA)
  const nvidiaSmi = execSafe("nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader,nounits 2>/dev/null");
  if (nvidiaSmi) {
    for (const line of nvidiaSmi.split("\n")) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        gpus.push({
          name: parts[0],
          vendor: "nvidia",
          vramMb: parseInt(parts[1], 10) || 0,
          driverVersion: parts[2] || undefined,
          architecture: parts[3] || undefined,
          cudaVersion: detectCudaVersion(),
        });
      }
    }
    return gpus;
  }

  // Try rocm-smi (AMD)
  const rocmSmi = execSafe("rocm-smi --showmeminfo vram --csv 2>/dev/null");
  if (rocmSmi) {
    gpus.push({
      name: "AMD GPU (ROCm detected)",
      vendor: "amd",
      vramMb: 0,
      rocmVersion: detectRocmVersion(),
    });
    return gpus;
  }

  // Try lspci (generic)
  const lspci = execSafe("lspci 2>/dev/null | grep -i 'vga\\|3d\\|display'");
  if (lspci) {
    const vendor = lspci.toLowerCase();
    if (vendor.includes("nvidia")) {
      gpus.push({ name: lspci, vendor: "nvidia", vramMb: 0 });
    } else if (vendor.includes("amd") || vendor.includes("ati")) {
      gpus.push({ name: lspci, vendor: "amd", vramMb: 0 });
    } else if (vendor.includes("intel")) {
      gpus.push({ name: lspci, vendor: "intel", vramMb: 0 });
    }
    return gpus;
  }

  // Windows: wmic
  if (os.platform() === "win32") {
    const wmic = execSafe('wmic path win32_videocontroller get name,adapterram /format:csv 2>nul');
    if (wmic) {
      for (const line of wmic.split("\n").slice(1)) {
        const parts = line.split(",").map((s) => s.trim());
        if (parts.length >= 3 && parts[1] && parts[2]) {
          gpus.push({
            name: parts[2],
            vendor: parts[2].toLowerCase().includes("nvidia") ? "nvidia" :
                    parts[2].toLowerCase().includes("amd") ? "amd" : "intel",
            vramMb: parseInt(parts[1], 10) / (1024 * 1024) || 0,
          });
        }
      }
    }
  }

  // Apple Silicon - unified memory
  if (os.platform() === "darwin") {
    const sysctl = execSafe("sysctl -n hw.memsize 2>/dev/null");
    if (sysctl) {
      const totalBytes = parseInt(sysctl, 10);
      gpus.push({
        name: "Apple GPU (Unified Memory)",
        vendor: "apple",
        vramMb: Math.round(totalBytes / (1024 * 1024)),
      });
    }
  }

  return gpus;
}

function detectCudaVersion(): string | undefined {
  const ver = execSafe("nvcc --version 2>/dev/null | grep release | awk '{print $6}' | cut -c2-");
  return ver || undefined;
}

function detectRocmVersion(): string | undefined {
  const ver = execSafe("rocm-smi --version 2>/dev/null | head -1");
  return ver || undefined;
}

function detectPythonVersion(): string | undefined {
  const ver = execSafe("python3 --version 2>/dev/null") || execSafe("python --version 2>/dev/null");
  return ver || undefined;
}

function detectDiskSpace(): { totalMb: number; freeMb: number } {
  try {
    const stats = fs.statfsSync(".");
    return {
      totalMb: Math.round((stats.blocks * stats.bsize) / (1024 * 1024)),
      freeMb: Math.round((stats.bfree * stats.bsize) / (1024 * 1024)),
    };
  } catch {
    return { totalMb: 0, freeMb: 0 };
  }
}

export function detectHardware(): HardwareProfile {
  const disk = detectDiskSpace();

  const profile: HardwareProfile = {
    os: os.platform(),
    osVersion: os.release(),
    arch: os.arch(),
    cpu: {
      model: os.cpus()[0]?.model || "Unknown",
      cores: os.cpus().length,
      threads: os.cpus().length, // Rough estimate; some CPUs have HT
    },
    ramMb: Math.round(os.totalmem() / (1024 * 1024)),
    gpus: detectGpus(),
    cudaAvailable: !!detectCudaVersion(),
    rocmAvailable: !!detectRocmVersion(),
    pythonVersion: detectPythonVersion(),
    totalDiskMb: disk.totalMb,
    freeDiskMb: disk.freeMb,
    detectedAt: new Date(),
  };

  return profile;
}

/**
 * Detect hardware and persist to database.
 */
export function detectAndStore(db: CaioDatabase): HardwareProfile {
  const profile = detectHardware();
  db.run(
    "INSERT INTO hardware_snapshots (profile, detected_at) VALUES (?, ?)",
    JSON.stringify(profile),
    profile.detectedAt.toISOString()
  );
  return profile;
}

/**
 * Get the last stored hardware profile.
 */
export function getLastHardwareProfile(db: CaioDatabase): HardwareProfile | null {
  const row = db.get<{ profile: string; detected_at: string }>(
    "SELECT profile, detected_at FROM hardware_snapshots ORDER BY id DESC LIMIT 1"
  );
  if (!row) return null;
  return JSON.parse(row.profile) as HardwareProfile;
}

/**
 * Get total available VRAM across all GPUs.
 */
export function getTotalVramMb(profile: HardwareProfile): number {
  return profile.gpus.reduce((sum, gpu) => sum + gpu.vramMb, 0);
}
