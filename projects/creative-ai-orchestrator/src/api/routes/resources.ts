// ============================================================================
// Resource Estimation Routes
// ============================================================================

import type { Router } from "express";
import { ResourceEstimator } from "../../core/resources/estimator.js";
import { detectHardware } from "../../core/hardware/detector.js";
import type { Workflow } from "../../core/types/index.js";

export function registerResourceRoutes(api: Router): void {
  const estimator = new ResourceEstimator();

  // Estimate resources for a workflow
  api.post("/resources/estimate", async (req, res) => {
    try {
      const { workflow, modelNames } = req.body;
      if (!workflow) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "workflow required" } });

      const hw = await detectHardware();
      const estimate = estimator.estimate(workflow as Workflow, hw, modelNames);
      res.json({ success: true, data: estimate, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });

  // Check if workflow fits in VRAM budget
  api.post("/resources/check", (req, res) => {
    try {
      const { workflow, budgetMb } = req.body;
      if (!workflow) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "workflow required" } });

      const fits = estimator.fitsBudget(workflow as Workflow, budgetMb || 8000);
      res.json({ success: true, data: { fits, budgetMb: budgetMb || 8000 }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });

  // Suggest adaptations to fit hardware
  api.post("/resources/suggest", (req, res) => {
    try {
      const { workflow, availableVramMb } = req.body;
      if (!workflow) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "workflow required" } });

      const suggestions = estimator.suggestAdaptations(workflow as Workflow, availableVramMb || 8000);
      res.json({ success: true, data: { suggestions }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });
}
