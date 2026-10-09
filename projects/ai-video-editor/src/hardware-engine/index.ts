/**
 * AI Creative OS - Hardware Engine
 * Detects CPU, GPU, VRAM, RAM, Disk, CUDA, ROCm, drivers, OS.
 * Creates HardwareProfile for capability-based provider selection.
 */

import type {
  HardwareProfile, CPUInfo, GPUInfo, DiskInfo, Score, Bytes,
} from "../types/index.js";
import { Logger, execCommand, getPlatform } from "../core/index.js";

const GB = 1024 * 1024 * 1024;

export class HardwareEngine {
  private logger = new Logger("HardwareEngine");
  private profile: HardwareProfile | null = null;

  /**
   * Full hardware detection and profiling.
   */
  async detect(): Promise<HardwareProfile> {
    this.logger.info("Detecting hardware...");

    const os = getPlatform();
    const cpu = await this.detectCPU();
    const gpus = await this.detectGPUs();
    const { totalRAM, availableRAM } = await this.detectRAM();
    const diskSpace = await this.detectDisk();
    const cudaAvailable = await this.detectCUDA();
    const rocmAvailable = false; // ROCm detection is Linux-only

    const profile: HardwareProfile = {
      os: process.platform,
      osVersion: process.version,
      platform: os,
      arch: process.arch,
      cpu,
      gpus,
      totalRAM,
      availableRAM,
      diskSpace,
      cudaAvailable,
      rocmAvailable,
      computeScore: this.calculateComputeScore(cpu, gpus),
      memoryScore: this.calculateMemoryScore(totalRAM, gpus),
      videoScore: this.calculateVideoScore(gpus),
      aiScore: this.calculateAIScore(gpus, totalRAM),
      recommendedModels: this.getRecommendedModels(gpus, totalRAM),
      recommendedWorkflows: this.getRecommendedWorkflows(gpus, totalRAM),
    };

    this.profile = profile;
    this.logger.info("Hardware detection complete", {
      cpu: cpu.model,
      gpus: gpus.map((g) => g.name).join(", ") || "none",
      ram: `${Math.round(totalRAM / GB)}GB`,
      vram: gpus.length > 0 ? `${Math.round(gpus[0].vram / GB)}GB` : "none",
    });

    return profile;
  }

  getProfile(): HardwareProfile | null {
    return this.profile;
  }

  // ─── CPU Detection ──────────────────────────────────────────────────

  private async detectCPU(): Promise<CPUInfo> {
    const os = getPlatform();
    let model = "Unknown CPU";
    let cores = 1;
    let threads = 1;
    let speed = 0;

    if (os === "windows") {
      const result = execCommand("wmic cpu get Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed /format:csv");
      if (result.exitCode === 0) {
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        if (lines.length >= 2) {
          const parts = lines[1].split(",");
          model = parts[1]?.trim() || model;
          cores = parseInt(parts[2]) || cores;
          threads = parseInt(parts[3]) || threads;
          speed = (parseInt(parts[4]) || 0) / 1000;
        }
      }
    } else if (os === "linux") {
      const result = execCommand("cat /proc/cpuinfo 2>/dev/null");
      if (result.exitCode === 0) {
        const nameMatch = result.stdout.match(/model name\s*:\s*(.+)/);
        if (nameMatch) model = nameMatch[1].trim();
        cores = (result.stdout.match(/processor/g) || []).length || 1;
        threads = cores;
        const mhzMatch = result.stdout.match(/cpu MHz\s*:\s*([\d.]+)/);
        if (mhzMatch) speed = parseFloat(mhzMatch[1]) / 1000;
      }
    } else if (os === "macos") {
      const result = execCommand("sysctl -n machdep.cpu.brand_string 2>/dev/null && sysctl -n hw.ncpu 2>/dev/null");
      if (result.exitCode === 0) {
        const lines = result.stdout.trim().split("\n");
        model = lines[0] || model;
        cores = parseInt(lines[1]) || cores;
        threads = cores;
      }
    }

    return { model, cores, threads, speed, architecture: process.arch };
  }

  // ─── GPU Detection ──────────────────────────────────────────────────

  private async detectGPUs(): Promise<GPUInfo[]> {
    const gpus: GPUInfo[] = [];

    // Try NVIDIA first
    const nvResult = execCommand('nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader,nounits 2>/dev/null');
    if (nvResult.exitCode === 0 && nvResult.stdout.trim()) {
      const lines = nvResult.stdout.trim().split("\n");
      for (const line of lines) {
        const parts = line.split(",").map((s) => s.trim());
        gpus.push({
          name: parts[0] || "NVIDIA GPU",
          vendor: "nvidia",
          vram: (parseFloat(parts[1]) || 0) * GB,
          driverVersion: parts[2],
          computeCapability: parts[3],
        });
      }
    }

    // Try Windows WMI for other GPUs
    if (gpus.length === 0) {
      const os = getPlatform();
      if (os === "windows") {
        const result = execCommand("wmic path win32_VideoController get Name,AdapterRAM,DriverVersion /format:csv");
        if (result.exitCode === 0) {
          const lines = result.stdout.trim().split("\n").filter(Boolean).slice(1);
          for (const line of lines) {
            const parts = line.split(",");
            if (parts.length >= 4) {
              gpus.push({
                name: parts[1]?.trim() || "Unknown GPU",
                vendor: this.inferGPUVendor(parts[1] || ""),
                vram: parseInt(parts[2]) || 0,
                driverVersion: parts[3]?.trim(),
              });
            }
          }
        }
      } else if (os === "linux") {
        const result = execCommand("lspci | grep -i vga 2>/dev/null");
        if (result.exitCode === 0 && result.stdout) {
          gpus.push({
            name: result.stdout.trim(),
            vendor: this.inferGPUVendor(result.stdout),
            vram: 0,
          });
        }
      }
    }

    if (gpus.length === 0) {
      gpus.push({
        name: "No GPU detected",
        vendor: "unknown",
        vram: 0,
      });
    }

    return gpus;
  }

  private inferGPUVendor(name: string): "nvidia" | "amd" | "intel" | "apple" | "unknown" {
    const lower = name.toLowerCase();
    if (lower.includes("nvidia") || lower.includes("geforce") || lower.includes("rtx") || lower.includes("gtx") || lower.includes("quadro")) return "nvidia";
    if (lower.includes("amd") || lower.includes("radeon") || lower.includes("rx ") || lower.includes("rxm")) return "amd";
    if (lower.includes("intel") || lower.includes("uhd") || lower.includes("iris")) return "intel";
    if (lower.includes("apple") || lower.includes("m1") || lower.includes("m2") || lower.includes("m3") || lower.includes("m4")) return "apple";
    return "unknown";
  }

  // ─── RAM Detection ──────────────────────────────────────────────────

  private async detectRAM(): Promise<{ totalRAM: Bytes; availableRAM: Bytes }> {
    const os = getPlatform();

    if (os === "windows") {
      const result = execCommand("wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /format:csv");
      if (result.exitCode === 0) {
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        if (lines.length >= 2) {
          const parts = lines[1].split(",");
          return {
            totalRAM: (parseInt(parts[1]) || 0) * 1024,
            availableRAM: (parseInt(parts[2]) || 0) * 1024,
          };
        }
      }
    }

    // Fallback for Linux/macOS
    const totalResult = execCommand("sysctl -n hw.memsize 2>/dev/null || free -b 2>/dev/null | grep Mem | awk '{print $2}'");
    const totalRAM = parseInt(totalResult.stdout) || 4 * GB;

    return { totalRAM, availableRAM: Math.round(totalRAM * 0.7) };
  }

  // ─── Disk Detection ─────────────────────────────────────────────────

  private async detectDisk(): Promise<DiskInfo> {
    const os = getPlatform();
    if (os === "windows") {
      const result = execCommand('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:csv');
      if (result.exitCode === 0) {
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        if (lines.length >= 2) {
          const parts = lines[1].split(",");
          return {
            total: parseInt(parts[2]) || 0,
            available: parseInt(parts[1]) || 0,
            used: (parseInt(parts[2]) || 0) - (parseInt(parts[1]) || 0),
          };
        }
      }
    }
    return { total: 500 * GB, available: 200 * GB, used: 300 * GB };
  }

  // ─── CUDA Detection ─────────────────────────────────────────────────

  private async detectCUDA(): Promise<boolean> {
    const result = execCommand("nvidia-smi 2>/dev/null | head -1");
    return result.exitCode === 0 && result.stdout.includes("NVIDIA");
  }

  // ─── Scoring ────────────────────────────────────────────────────────

  private calculateComputeScore(cpu: CPUInfo, gpus: GPUInfo[]): Score {
    let score = Math.min(cpu.cores * 5, 40);
    if (cpu.speed > 3.0) score += 10;
    if (cpu.speed > 4.0) score += 5;
    if (gpus[0]?.vendor === "nvidia") score += 20;
    return Math.min(score, 100) as Score;
  }

  private calculateMemoryScore(totalRAM: Bytes, gpus: GPUInfo[]): Score {
    const ramGB = totalRAM / GB;
    const vramGB = gpus[0]?.vram ? gpus[0].vram / GB : 0;
    let score = Math.min(ramGB / 32 * 50, 50);
    score += Math.min(vramGB / 24 * 50, 50);
    return Math.min(Math.round(score), 100) as Score;
  }

  private calculateVideoScore(gpus: GPUInfo[]): Score {
    const vramGB = gpus[0]?.vram ? gpus[0].vram / GB : 0;
    if (vramGB >= 24) return 95;
    if (vramGB >= 16) return 85;
    if (vramGB >= 12) return 75;
    if (vramGB >= 8) return 60;
    if (vramGB >= 4) return 40;
    if (vramGB > 0) return 25;
    return 10;
  }

  private calculateAIScore(gpus: GPUInfo[], totalRAM: Bytes): Score {
    const vramGB = gpus[0]?.vram ? gpus[0].vram / GB : 0;
    const ramGB = totalRAM / GB;
    const hasNvidia = gpus[0]?.vendor === "nvidia";

    let score = 0;
    if (hasNvidia) score += 20;
    score += Math.min(vramGB / 24 * 50, 50);
    score += Math.min(ramGB / 64 * 30, 30);
    return Math.min(Math.round(score), 100) as Score;
  }

  // ─── Recommendations ────────────────────────────────────────────────

  private getRecommendedModels(gpus: GPUInfo[], totalRAM: Bytes): string[] {
    const vramGB = gpus[0]?.vram ? gpus[0].vram / GB : 0;
    const models: string[] = [];

    if (vramGB >= 24) {
      models.push("wan_2.2_full", "flux_full", "sd_xl", "stable_diffusion_xl");
    } else if (vramGB >= 16) {
      models.push("wan_2.2_q8", "flux_fp8", "sd_xl_quantized");
    } else if (vramGB >= 12) {
      models.push("wan_2.2_q6", "flux_q8", "sd_base");
    } else if (vramGB >= 8) {
      models.push("wan_2.2_q4", "flux_q4", "sd_base_quantized");
    } else if (vramGB >= 4) {
      models.push("wan_2.2_q2", "flux_q2");
    }

    return models;
  }

  private getRecommendedWorkflows(gpus: GPUInfo[], totalRAM: Bytes): string[] {
    const vramGB = gpus[0]?.vram ? gpus[0].vram / GB : 0;
    const workflows: string[] = [];

    if (vramGB >= 16) workflows.push("full_pipeline", "long_form", "animation");
    else if (vramGB >= 8) workflows.push("short_form", "moderate_pipeline");
    else workflows.push("minimal", "cpu_fallback");

    return workflows;
  }
}
