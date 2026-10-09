import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { CaioConfig } from "../../core/config/index.js";
import { Diagnostics } from "../../core/diagnostics/index.js";
import { PresetManager } from "../../core/presets/creative.js";
import { SafeMode } from "../../core/safe-mode/index.js";

export function registerSystemRoutes(api: Router, db: CaioDatabase, config: CaioConfig): void {
  const diagnostics = new Diagnostics();
  const presets = new PresetManager();

  // Diagnostics
  api.get("/system/diagnostics", async (_req, res) => {
    const report = await diagnostics.runFullDiagnostic({
      runtimePath: config.comfyuiPath,
      modelsDir: config.modelsDir,
      dataDir: config.dataDir,
    });
    res.json({ success: true, data: report, timestamp: new Date() });
  });

  // Presets
  api.get("/presets", (req, res) => {
    const category = req.query.category as string | undefined;
    const data = presets.listPresets(category);
    res.json({ success: true, data, timestamp: new Date() });
  });

  api.get("/presets/:id", (req, res) => {
    const preset = presets.getPreset(req.params.id);
    if (!preset) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Preset not found" } });
    res.json({ success: true, data: preset, timestamp: new Date() });
  });

  api.get("/presets/compatible/:vramMb", (req, res) => {
    const vram = parseInt(req.params.vramMb) || 8000;
    const data = presets.findCompatible(vram);
    res.json({ success: true, data, timestamp: new Date() });
  });

  // Safe Mode
  api.post("/system/safe-mode/enter", (req, res) => {
    if (!config.comfyuiPath) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "ComfyUI path not configured" } });
    }
    const result = SafeMode.enter(config.comfyuiPath);
    res.json({ success: true, data: result, timestamp: new Date() });
  });

  api.post("/system/safe-mode/exit", (_req, res) => {
    if (!config.comfyuiPath) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "ComfyUI path not configured" } });
    }
    const result = SafeMode.exit(config.comfyuiPath);
    res.json({ success: true, data: result, timestamp: new Date() });
  });

  api.get("/system/safe-mode/status", (_req, res) => {
    const active = config.comfyuiPath ? SafeMode.isActive(config.comfyuiPath) : false;
    res.json({ success: true, data: { active }, timestamp: new Date() });
  });

  // Config save (writes to .env file)
  api.post("/system/config", async (req, res) => {
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const envPath = path.join(config.dataDir, ".env");
      const updates = req.body;
      const lines: string[] = [];
      if (updates.openaiApiKey) lines.push(`OPENAI_API_KEY=${updates.openaiApiKey}`);
      if (updates.anthropicApiKey) lines.push(`ANTHROPIC_API_KEY=${updates.anthropicApiKey}`);
      if (updates.localLlmUrl) lines.push(`LOCAL_LLM_URL=${updates.localLlmUrl}`);
      if (updates.githubToken) lines.push(`GITHUB_TOKEN=${updates.githubToken}`);
      if (updates.huggingfaceToken) lines.push(`HUGGINGFACE_TOKEN=${updates.huggingfaceToken}`);
      if (updates.autonomyLevel) lines.push(`AUTONOMY_LEVEL=${updates.autonomyLevel}`);

      // Append to .env (don't overwrite existing)
      if (lines.length > 0) {
        fs.appendFileSync(envPath, "\n" + lines.join("\n") + "\n");
      }

      res.json({ success: true, data: { saved: lines.length, message: "Config saved. Restart server to apply." }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "RESOURCE_ERROR", message: err.message } });
    }
  });
}
