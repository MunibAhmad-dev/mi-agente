import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { CaioConfig } from "../../core/config/index.js";
import { VisionEngine } from "../../vision/engine/index.js";
import { ResourceEstimator } from "../../core/resources/estimator.js";
import { WorkflowMonitor } from "../../workflows/monitor.js";
import { VectorSearch } from "../../memory/vector-search.js";
import { getEventBus } from "../../core/events/index.js";

export function registerVisionV2Routes(api: Router, db: CaioDatabase, config: CaioConfig): void {
  const vision = new VisionEngine(db);
  const estimator = new ResourceEstimator();
  const monitor = new WorkflowMonitor(getEventBus());
  const vectorSearch = new VectorSearch(db, config.dataDir);

  // Visual diff — structured comparison
  api.post("/vision/diff", async (req, res) => {
    try {
      const { original, modified } = req.body;
      if (!original || !modified) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "original and modified paths required" } });
      }
      const diff = await vision.compareImages(original, modified);
      const report = await vision.generateDiffReport(original, modified);
      res.json({ success: true, data: { diff, report }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });

  // Resource estimation
  api.post("/resources/estimate", (req, res) => {
    try {
      const { workflow, modelNames } = req.body;
      if (!workflow) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "workflow required" } });
      }
      const estimate = estimator.estimate(workflow, undefined, modelNames);
      res.json({ success: true, data: estimate, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "RESOURCE_ERROR", message: err.message } });
    }
  });

  api.post("/resources/check-fit", (req, res) => {
    try {
      const { workflow, vramMb } = req.body;
      if (!workflow || !vramMb) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "workflow and vramMb required" } });
      }
      const fits = estimator.fitsBudget(workflow, vramMb);
      const suggestions = estimator.suggestAdaptations(workflow, vramMb);
      res.json({ success: true, data: { fits, suggestions }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "RESOURCE_ERROR", message: err.message } });
    }
  });

  // Execution monitoring
  api.get("/monitor/active", (_req, res) => {
    const active = monitor.getActive();
    res.json({ success: true, data: active, timestamp: new Date() });
  });

  api.get("/monitor/:executionId", (req, res) => {
    const progress = monitor.getProgress(req.params.executionId);
    if (!progress) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Execution not found" } });
    res.json({ success: true, data: progress, timestamp: new Date() });
  });

  api.post("/monitor/:executionId/cancel", (req, res) => {
    monitor.cancel(req.params.executionId);
    res.json({ success: true, timestamp: new Date() });
  });

  // Vector search (semantic memory)
  api.post("/memory/vector-search", async (req, res) => {
    try {
      const { query, projectId, limit } = req.body;
      if (!query) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "query required" } });
      const results = await vectorSearch.hybridSearch(query, projectId, limit || 10);
      res.json({ success: true, data: results, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "RESOURCE_ERROR", message: err.message } });
    }
  });

  api.get("/memory/vector-status", (_req, res) => {
    res.json({
      success: true,
      data: {
        available: vectorSearch.isAvailable(),
        indexSize: vectorSearch.getIndexSize(),
        error: vectorSearch.getLoadError(),
      },
      timestamp: new Date(),
    });
  });
}
