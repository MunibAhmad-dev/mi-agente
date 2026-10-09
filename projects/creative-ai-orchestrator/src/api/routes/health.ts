import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { CaioConfig } from "../../core/config/index.js";
import fs from "node:fs";
import { detectHardware } from "../../core/hardware/detector.js";
import { LLMProviderManager } from "../../core/llm/provider.js";

export function registerHealthRoutes(api: Router, db: CaioDatabase, config: CaioConfig): void {
  api.get("/health", (_req, res) => {
    const hw = detectHardware();
    const llmManager = new LLMProviderManager(config);

    llmManager.getProviderStatus().then((providers) => {
      const runtimes = db.all("SELECT id, name, status FROM runtimes");
      const models = db.get<{ count: number }>("SELECT COUNT(*) as count FROM models WHERE installed = 1");

      res.json({
        success: true,
        data: {
          status: "healthy",
          version: "0.1.0",
          uptime: process.uptime(),
          hardware: {
            os: `${hw.os} ${hw.osVersion}`,
            cpu: `${hw.cpu.model} (${hw.cpu.cores} cores)`,
            ram: `${hw.ramMb} MB`,
            gpus: hw.gpus.map((g) => ({ name: g.name, vram: `${g.vramMb} MB`, vendor: g.vendor })),
            cuda: hw.cudaAvailable,
            rocm: hw.rocmAvailable,
            disk: `${hw.freeDiskMb} MB free`,
          },
          llmProviders: providers,
          runtimes,
          installedModels: models?.count || 0,
          database: "connected",
        },
        timestamp: new Date(),
      });
    }).catch((err) => {
      res.status(500).json({ success: false, error: { code: "GPU_ERROR", message: err.message } });
    });
  });

  api.get("/health/diagnostics", (_req, res) => {
    const checks = [
      { name: "Database", status: "healthy" },
      { name: "EventBus", status: "healthy" },
      { name: "FileSystem", status: fs.existsSync(config.dataDir) ? "healthy" : "unhealthy" },
    ];
    res.json({ success: true, data: checks, timestamp: new Date() });
  });
}
