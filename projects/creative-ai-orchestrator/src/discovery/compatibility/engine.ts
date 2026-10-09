// ============================================================================
// Compatibility Engine
// ============================================================================
// Analyzes OS, CPU, GPU, VRAM, RAM, storage, Python, CUDA, ROCm, drivers,
// ComfyUI version, node versions, model requirements, dependencies.
// ============================================================================

import type {
  HardwareProfile,
  CompatibilityCheck,
  CompatibilityIssue,
  CompatibilityLevel,
  DiscoveredResource,
} from "../../core/types/index.js";

export class CompatibilityEngine {
  /**
   * Check full compatibility of a resource against hardware.
   */
  checkCompatibility(
    resource: DiscoveredResource,
    hw: HardwareProfile
  ): CompatibilityCheck {
    const issues: CompatibilityIssue[] = [];

    const os = this.checkOs(hw, issues);
    const cpu = this.checkCpu(hw, issues);
    const gpu = this.checkGpu(hw, resource, issues);
    const vram = this.checkVram(hw, resource, issues);
    const ram = this.checkRam(hw, resource, issues);
    const storage = this.checkStorage(hw, resource, issues);
    const python = this.checkPython(hw, resource, issues);
    const cuda = this.checkCuda(hw, resource, issues);

    // Overall: worst of the critical checks
    const levels = [os, cpu, gpu, vram, ram, storage, python, cuda];
    const overall = this.worstLevel(levels);

    return {
      os,
      cpu,
      gpu,
      vram,
      ram,
      storage,
      python,
      cuda,
      overall,
      issues,
      recommendation: this.generateRecommendation(overall, issues),
    };
  }

  private checkOs(hw: HardwareProfile, issues: CompatibilityIssue[]): CompatibilityLevel {
    // Most AI tools support Linux, Windows, macOS
    const supported = ["linux", "win32", "darwin"];
    if (supported.includes(hw.os)) return "green";
    issues.push({ component: "os", available: hw.os, level: "red", fix: "Unsupported OS" });
    return "red";
  }

  private checkCpu(hw: HardwareProfile, _issues: CompatibilityIssue[]): CompatibilityLevel {
    if (hw.cpu.cores >= 4) return "green";
    if (hw.cpu.cores >= 2) return "yellow";
    return "red";
  }

  private checkGpu(hw: HardwareProfile, resource: DiscoveredResource, issues: CompatibilityIssue[]): CompatibilityLevel {
    if (hw.gpus.length === 0) {
      const meta = resource.metadata;
      if (meta?.cpuOnly) return "green";
      issues.push({ component: "gpu", available: "None", level: "yellow", fix: "No GPU detected. CPU-only mode may be very slow." });
      return "yellow";
    }

    const primaryGpu = hw.gpus[0]!;
    if (primaryGpu.vendor === "nvidia") return "green";
    if (primaryGpu.vendor === "amd" && hw.rocmAvailable) return "green";
    if (primaryGpu.vendor === "apple") return "green";
    if (primaryGpu.vendor === "amd" && !hw.rocmAvailable) {
      issues.push({ component: "gpu", available: `${primaryGpu.name} (no ROCm)`, level: "yellow", fix: "AMD GPU without ROCm. Some features may be unavailable." });
      return "yellow";
    }
    return "yellow";
  }

  private checkVram(hw: HardwareProfile, resource: DiscoveredResource, issues: CompatibilityIssue[]): CompatibilityLevel {
    const totalVram = hw.gpus.reduce((s, g) => s + g.vramMb, 0);
    const meta = resource.metadata;
    const required = Number(meta?.vramEstimateMb || meta?.vram_required || 0);

    if (required === 0) return "green"; // Unknown requirement

    if (totalVram >= required * 1.5) return "green";
    if (totalVram >= required) return "green";
    if (totalVram >= required * 0.75) {
      issues.push({
        component: "vram",
        required: `${required} MB`,
        available: `${totalVram} MB`,
        level: "yellow",
        fix: "Reduce resolution or enable offloading.",
      });
      return "yellow";
    }

    issues.push({
      component: "vram",
      required: `${required} MB`,
      available: `${totalVram} MB`,
      level: "red",
      fix: "Insufficient VRAM. Use a smaller model or lower resolution.",
    });
    return "red";
  }

  private checkRam(hw: HardwareProfile, resource: DiscoveredResource, issues: CompatibilityIssue[]): CompatibilityLevel {
    const meta = resource.metadata;
    const required = Number(meta?.ramEstimateMb || 0);

    if (required === 0) return "green";
    if (hw.ramMb >= required * 1.3) return "green";
    if (hw.ramMb >= required) return "green";
    if (hw.ramMb >= required * 0.8) {
      issues.push({ component: "ram", required: `${required} MB`, available: `${hw.ramMb} MB`, level: "yellow" });
      return "yellow";
    }
    issues.push({ component: "ram", required: `${required} MB`, available: `${hw.ramMb} MB`, level: "red" });
    return "red";
  }

  private checkStorage(hw: HardwareProfile, resource: DiscoveredResource, issues: CompatibilityIssue[]): CompatibilityLevel {
    const meta = resource.metadata;
    const required = Number(meta?.diskRequirementMb || 0);

    if (required === 0) return "green";
    if (hw.freeDiskMb >= required * 1.5) return "green";
    if (hw.freeDiskMb >= required) return "yellow";
    issues.push({ component: "storage", required: `${required} MB`, available: `${hw.freeDiskMb} MB free`, level: "red" });
    return "red";
  }

  private checkPython(hw: HardwareProfile, resource: DiscoveredResource, issues: CompatibilityIssue[]): CompatibilityLevel {
    if (!hw.pythonVersion) {
      issues.push({ component: "python", available: "Not found", level: "yellow", fix: "Install Python 3.10+." });
      return "yellow";
    }
    // Check Python 3.10+
    const match = hw.pythonVersion.match(/(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1]!);
      const minor = parseInt(match[2]!);
      if (major > 3 || (major === 3 && minor >= 10)) return "green";
      issues.push({ component: "python", required: "3.10+", available: hw.pythonVersion, level: "yellow", fix: "Upgrade Python to 3.10 or later." });
      return "yellow";
    }
    return "yellow";
  }

  private checkCuda(hw: HardwareProfile, resource: DiscoveredResource, issues: CompatibilityIssue[]): CompatibilityLevel {
    const meta = resource.metadata;
    const needsCuda = meta?.needsCuda !== false && hw.gpus.some((g) => g.vendor === "nvidia");

    if (!needsCuda) return "green";
    if (hw.cudaAvailable) return "green";

    issues.push({
      component: "cuda",
      available: "Not found",
      level: "yellow",
      fix: "Install CUDA toolkit for NVIDIA GPU acceleration.",
    });
    return "yellow";
  }

  private worstLevel(levels: CompatibilityLevel[]): CompatibilityLevel {
    if (levels.includes("red")) return "red";
    if (levels.includes("yellow")) return "yellow";
    return "green";
  }

  private generateRecommendation(overall: CompatibilityLevel, issues: CompatibilityIssue[]): string | undefined {
    if (overall === "green") return undefined;

    const fixes = issues.filter((i) => i.fix).map((i) => i.fix);
    if (fixes.length > 0) {
      return fixes.join("; ");
    }
    return overall === "red" ? "This resource may not be compatible with your hardware." : undefined;
  }
}
