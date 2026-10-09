import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { CaioConfig } from "../../core/config/index.js";
import { ForkImprove } from "../../projects/fork.js";
import { ProjectImporter } from "../../projects/import.js";
import { AdaptiveWorkflow } from "../../workflows/adaptive.js";
import { AgentFeedbackLoop } from "../../memory/agent-feedback.js";
import { DependencyIsolation } from "../../projects/dep-isolation.js";
import { ResultSearch } from "../../projects/result-search.js";
import { AutoDocs } from "../../projects/auto-docs.js";
import { ProjectExporter } from "../../projects/export.js";

export function registerProjectsV2Routes(api: Router, db: CaioDatabase, config: CaioConfig): void {
  const forkImprove = new ForkImprove(db);
  const importer = new ProjectImporter(db);
  const feedbackLoop = new AgentFeedbackLoop(db);
  const depIsolation = new DependencyIsolation(config.dataDir);
  const resultSearch = new ResultSearch(db);
  const autoDocs = new AutoDocs(db);
  const exporter = new ProjectExporter(db);

  // Adaptive workflow profiles
  api.get("/adaptive/profiles", (_req, res) => {
    res.json({ success: true, data: AdaptiveWorkflow.listProfiles(), timestamp: new Date() });
  });

  api.get("/adaptive/select/:vramMb", (req, res) => {
    const vram = parseInt(req.params.vramMb) || 8000;
    const profile = AdaptiveWorkflow.selectProfile(vram);
    res.json({ success: true, data: profile, timestamp: new Date() });
  });

  // Feedback
  api.post("/feedback", (req, res) => {
    const { projectId, signal } = req.body;
    if (!signal) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "signal required" } });
    feedbackLoop.record(projectId, signal);
    res.json({ success: true, timestamp: new Date() });
  });

  api.get("/feedback/patterns/:projectId", (req, res) => {
    const patterns = feedbackLoop.getPatterns(req.params.projectId as any);
    res.json({ success: true, data: patterns, timestamp: new Date() });
  });

  api.get("/feedback/recommendations/:projectId", (req, res) => {
    const recs = feedbackLoop.getRecommendations(req.params.projectId as any);
    res.json({ success: true, data: recs, timestamp: new Date() });
  });

  // Dependency isolation
  api.post("/projects/:id/isolate", (req, res) => {
    const env = depIsolation.createEnvironment(req.params.id);
    res.json({ success: true, data: env, timestamp: new Date() });
  });

  api.get("/projects/:id/isolation-status", (req, res) => {
    const exists = depIsolation.environmentExists(req.params.id);
    res.json({ success: true, data: { isolated: exists }, timestamp: new Date() });
  });

  // Result search
  api.get("/results/search", (req, res) => {
    const { projectId, minQuality, maxQuality, limit, offset } = req.query;
    const results = resultSearch.search({
      projectId: projectId as any,
      minQuality: minQuality ? parseInt(minQuality as string) : undefined,
      maxQuality: maxQuality ? parseInt(maxQuality as string) : undefined,
      limit: limit ? parseInt(limit as string) : 20,
      offset: offset ? parseInt(offset as string) : 0,
    });
    res.json({ success: true, data: results, timestamp: new Date() });
  });

  api.get("/results/best", (req, res) => {
    const { projectId, limit } = req.query;
    const results = resultSearch.getBest(projectId as any, limit ? parseInt(limit as string) : 10);
    res.json({ success: true, data: results, timestamp: new Date() });
  });

  // Auto-documentation
  api.get("/projects/:id/docs", (req, res) => {
    const readme = autoDocs.generateREADME(req.params.id as any);
    res.json({ success: true, data: { readme }, timestamp: new Date() });
  });

  // Export (license-aware)
  api.get("/projects/:id/export-manifest", (req, res) => {
    const manifest = exporter.exportProject(req.params.id as any);
    if (!manifest) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Project not found" } });
    res.json({ success: true, data: manifest, timestamp: new Date() });
  });

  // Import (license-aware)
  api.post("/projects/import-v2", async (req, res) => {
    const result = await importer.importFromJSON(req.body);
    res.json({ success: result.success, data: result, timestamp: new Date() });
  });
}
