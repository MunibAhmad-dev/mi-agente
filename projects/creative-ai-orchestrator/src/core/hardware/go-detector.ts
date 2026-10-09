// ============================================================================
// Go Hardware Detector — Uses caiotool binary for fast hardware detection
// ============================================================================

import { execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import type { HardwareProfile, GpuInfo } from "../types/index.js";

export class GoHardwareDetector {
  private binaryPath: string;

  constructor(dataDir?: string) {
    // Look for caiotool binary
    const candidates = [
      path.join(process.cwd(), "dist", "caiotool.exe"),
      path.join(process.cwd(), "dist", "caiotool"),
      path.join(dataDir || process.cwd(), "caiotool.exe"),
      path.join(dataDir || process.cwd(), "caiotool"),
    ];

    this.binaryPath = candidates.find((p) => fs.existsSync(p)) || "";
  }

  isAvailable(): boolean {
    return this.binaryPath !== "" && fs.existsSync(this.binaryPath);
  }

  /**
   * Detect hardware using the Go binary (fast, ~100ms).
   */
  async detect(): Promise<HardwareProfile | null> {
    if (!this.isAvailable()) return null;

    return new Promise((resolve) => {
      execFile(this.binaryPath, ["hw", "detect"], { timeout: 10000 }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        try {
          const data = JSON.parse(stdout);
          resolve({
            os: data.os,
            osVersion: data.arch,
            arch: data.arch,
            cpu: {
              model: data.cpuModel || `${data.cpuCount} cores`,
              cores: data.cpuCount,
              threads: data.cpuCount,
            },
            ramMb: data.ramMb || 0,
            gpus: (data.gpus || []).map((g: any): GpuInfo => ({
              name: g.name,
              vendor: data.cuda ? "nvidia" : "unknown",
              vramMb: g.vramMb,
              driverVersion: g.driver || "",
              cudaVersion: data.cudaVersion || undefined,
            })),
            cudaAvailable: data.cuda || false,
            rocmAvailable: data.rocm || false,
            pythonVersion: data.python || "",
            totalDiskMb: (data.freeDiskMb || 0) + 100000,
            freeDiskMb: data.freeDiskMb || 0,
            detectedAt: new Date(),
          });
        } catch {
          resolve(null);
        }
      });
    });
  }

  /**
   * Hash a file using the Go binary (fast, ~10ms for typical files).
   */
  async hashFile(filePath: string): Promise<{ hash: string; size: number; timeMs: number } | null> {
    if (!this.isAvailable()) return null;

    return new Promise((resolve) => {
      execFile(this.binaryPath, ["hash", filePath], { timeout: 30000 }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        try {
          const data = JSON.parse(stdout);
          resolve({ hash: data.hash, size: data.size, timeMs: data.timeMs });
        } catch {
          resolve(null);
        }
      });
    });
  }

  /**
   * Run benchmark using the Go binary.
   */
  async benchmark(): Promise<any> {
    if (!this.isAvailable()) return null;

    return new Promise((resolve) => {
      execFile(this.binaryPath, ["bench"], { timeout: 30000 }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve(null);
        }
      });
    });
  }
}
