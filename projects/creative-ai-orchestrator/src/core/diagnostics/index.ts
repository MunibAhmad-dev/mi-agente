// ============================================================================
// Diagnostics
// ============================================================================
// Self-diagnostic system: checks GPU, drivers, CUDA, Python, dependencies,
// runtime, API, models, nodes, disk, permissions.
// ============================================================================

import fs from "node:fs";
import { execSync } from "node:child_process";
import type { HardwareProfile, ComponentHealth } from "../types/index.js";
import { HealthStatus } from "../types/index.js";
import { detectHardware } from "../hardware/detector.js";

export interface DiagnosticReport {
  overall: HealthStatus;
  components: ComponentHealth[];
  recommendations: string[];
  timestamp: Date;
}

export class Diagnostics {
  /**
   * Run full system diagnostics.
   */
  async runFullDiagnostic(opts?: {
    runtimePath?: string;
    modelsDir?: string;
    dataDir?: string;
  }): Promise<DiagnosticReport> {
    const components: ComponentHealth[] = [];
    const recommendations: string[] = [];

    // GPU Check
    const hw = detectHardware();
    components.push(this.checkGpu(hw));
    components.push(this.checkCuda(hw));
    components.push(this.checkRam(hw));
    components.push(this.checkDisk(hw));

    // Python Check
    components.push(this.checkPython());

    // Runtime Check
    if (opts?.runtimePath) {
      components.push(this.checkRuntime(opts.runtimePath));
    }

    // Models Directory
    if (opts?.modelsDir) {
      components.push(this.checkModelsDir(opts.modelsDir));
    }

    // Data Directory
    if (opts?.dataDir) {
      components.push(this.checkDataDir(opts.dataDir));
    }

    // Generate recommendations
    for (const c of components) {
      if (c.status === HealthStatus.Unhealthy) {
        recommendations.push(`${c.name}: ${c.message || "Needs attention"}`);
      } else if (c.status === HealthStatus.Degraded) {
        recommendations.push(`${c.name}: ${c.message || "Could be improved"}`);
      }
    }

    const overallStatus = components.some((c) => c.status === HealthStatus.Unhealthy)
      ? HealthStatus.Unhealthy
      : components.some((c) => c.status === HealthStatus.Degraded)
        ? HealthStatus.Degraded
        : HealthStatus.Healthy;

    return {
      overall: overallStatus as HealthStatus,
      components,
      recommendations,
      timestamp: new Date(),
    };
  }

  private checkGpu(hw: HardwareProfile): ComponentHealth {
    if (hw.gpus.length > 0) {
      const gpu = hw.gpus[0]!;
      return {
        name: "GPU",
        status: gpu.vramMb > 0 ? HealthStatus.Healthy : HealthStatus.Degraded,
        message: `${gpu.name} (${gpu.vramMb}MB VRAM)`,
        lastChecked: new Date(),
      };
    }
    return {
      name: "GPU",
      status: HealthStatus.Degraded,
      message: "No GPU detected — CPU-only mode",
      lastChecked: new Date(),
    };
  }

  private checkCuda(hw: HardwareProfile): ComponentHealth {
    const hasNvidia = hw.gpus.some((g) => g.vendor === "nvidia");
    if (!hasNvidia) {
      return { name: "CUDA", status: HealthStatus.Healthy, message: "Not needed (no NVIDIA GPU)", lastChecked: new Date() };
    }
    if (hw.cudaAvailable) {
      return { name: "CUDA", status: HealthStatus.Healthy, message: `CUDA available`, lastChecked: new Date() };
    }
    return {
      name: "CUDA",
      status: HealthStatus.Unhealthy,
      message: "NVIDIA GPU detected but CUDA not found. Install CUDA toolkit.",
      lastChecked: new Date(),
    };
  }

  private checkRam(hw: HardwareProfile): ComponentHealth {
    if (hw.ramMb >= 16000) return { name: "RAM", status: HealthStatus.Healthy, message: `${(hw.ramMb / 1024).toFixed(1)} GB`, lastChecked: new Date() };
    if (hw.ramMb >= 8000) return { name: "RAM", status: HealthStatus.Degraded, message: `${(hw.ramMb / 1024).toFixed(1)} GB — may be tight for large models`, lastChecked: new Date() };
    return { name: "RAM", status: HealthStatus.Unhealthy, message: `${(hw.ramMb / 1024).toFixed(1)} GB — insufficient for most AI workloads`, lastChecked: new Date() };
  }

  private checkDisk(hw: HardwareProfile): ComponentHealth {
    if (hw.freeDiskMb >= 50000) return { name: "Disk", status: HealthStatus.Healthy, message: `${(hw.freeDiskMb / 1024).toFixed(0)} GB free`, lastChecked: new Date() };
    if (hw.freeDiskMb >= 20000) return { name: "Disk", status: HealthStatus.Degraded, message: `${(hw.freeDiskMb / 1024).toFixed(0)} GB free — may run out during downloads`, lastChecked: new Date() };
    return { name: "Disk", status: HealthStatus.Unhealthy, message: `${(hw.freeDiskMb / 1024).toFixed(0)} GB free — critical`, lastChecked: new Date() };
  }

  private checkPython(): ComponentHealth {
    try {
      const ver = execSync("python3 --version 2>/dev/null || python --version 2>/dev/null", { encoding: "utf-8", timeout: 5000 }).trim();
      const match = ver.match(/(\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1]!);
        const minor = parseInt(match[2]!);
        if (major > 3 || (major === 3 && minor >= 10)) {
          return { name: "Python", status: HealthStatus.Healthy, message: ver, lastChecked: new Date() };
        }
        return { name: "Python", status: HealthStatus.Degraded, message: `${ver} — recommend 3.10+`, lastChecked: new Date() };
      }
    } catch { /* not found */ }
    return { name: "Python", status: HealthStatus.Unhealthy, message: "Not found. Install Python 3.10+.", lastChecked: new Date() };
  }

  private checkRuntime(runtimePath: string): ComponentHealth {
    if (fs.existsSync(runtimePath)) {
      return { name: "Runtime", status: HealthStatus.Healthy, message: `Installed at ${runtimePath}`, lastChecked: new Date() };
    }
    return { name: "Runtime", status: HealthStatus.Unhealthy, message: `Not found at ${runtimePath}`, lastChecked: new Date() };
  }

  private checkModelsDir(modelsDir: string): ComponentHealth {
    if (!fs.existsSync(modelsDir)) {
      return { name: "Models", status: HealthStatus.Degraded, message: "Models directory doesn't exist yet", lastChecked: new Date() };
    }
    const files = fs.readdirSync(modelsDir).length;
    return { name: "Models", status: files > 0 ? HealthStatus.Healthy : HealthStatus.Degraded, message: `${files} items`, lastChecked: new Date() };
  }

  private checkDataDir(dataDir: string): ComponentHealth {
    if (fs.existsSync(dataDir)) {
      return { name: "DataDir", status: HealthStatus.Healthy, message: dataDir, lastChecked: new Date() };
    }
    return { name: "DataDir", status: HealthStatus.Degraded, message: "Data directory doesn't exist", lastChecked: new Date() };
  }
}
