import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { ProjectId } from "../../core/types/index.js";
import { ExperimentEngine } from "../../experiments/engine/index.js";

export function registerExperimentRoutes(api: Router, db: CaioDatabase): void {
  const engine = new ExperimentEngine(db);

  api.get("/experiments/:projectId", (req, res) => {
    const experiments = engine.getHistory(req.params.projectId as ProjectId);
    res.json({ success: true, data: experiments, timestamp: new Date() });
  });

  api.get("/experiments/:projectId/best", (req, res) => {
    const best = engine.getBest(req.params.projectId as ProjectId);
    res.json({ success: true, data: best, timestamp: new Date() });
  });

  api.post("/experiments/:projectId/create", (req, res) => {
    const { name, variables } = req.body;
    if (!name || !variables) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name and variables required" } });
    }
    const experiment = engine.create(req.params.projectId as ProjectId, name, variables);
    res.status(201).json({ success: true, data: experiment, timestamp: new Date() });
  });

  api.post("/experiments/:projectId/grid", (req, res) => {
    const { name, search } = req.body;
    if (!name || !search) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name and search config required" } });
    }
    const experiments = engine.generateGrid(req.params.projectId as ProjectId, name, search);
    res.status(201).json({ success: true, data: experiments, timestamp: new Date() });
  });

  api.get("/experiments/:projectId/stop-check", (req, res) => {
    const result = engine.shouldStop(req.params.projectId as ProjectId);
    res.json({ success: true, data: result, timestamp: new Date() });
  });
}
