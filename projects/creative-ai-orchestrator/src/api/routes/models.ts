import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { ModelId } from "../../core/types/index.js";
import { ModelManager } from "../../models/manager/index.js";

export function registerModelRoutes(api: Router, db: CaioDatabase): void {
  const manager = new ModelManager(db, process.cwd() + "/data/models");

  api.get("/models", (req, res) => {
    const type = req.query.type as string | undefined;
    const models = manager.listModels(type as any);
    res.json({ success: true, data: models, timestamp: new Date() });
  });

  api.get("/models/installed", (req, res) => {
    const type = req.query.type as string | undefined;
    const models = manager.listInstalled(type as any);
    res.json({ success: true, data: models, timestamp: new Date() });
  });

  api.get("/models/search", (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Query parameter 'q' is required" } });
    const models = manager.search(q);
    res.json({ success: true, data: models, timestamp: new Date() });
  });

  api.get("/models/disk-usage", (_req, res) => {
    res.json({ success: true, data: manager.getDiskUsage(), timestamp: new Date() });
  });

  api.post("/models", (req, res) => {
    const model = manager.register(req.body);
    res.status(201).json({ success: true, data: model, timestamp: new Date() });
  });

  api.get("/models/:id", (req, res) => {
    const model = manager.getModel(req.params.id as ModelId);
    if (!model) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Model not found" } });
    res.json({ success: true, data: model, timestamp: new Date() });
  });

  api.delete("/models/:id", (req, res) => {
    manager.deleteModel(req.params.id as ModelId);
    res.json({ success: true, timestamp: new Date() });
  });
}
