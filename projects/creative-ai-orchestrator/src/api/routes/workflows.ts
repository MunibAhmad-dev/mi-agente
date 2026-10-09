import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { EventBus } from "../../core/events/index.js";
import type { WorkflowId } from "../../core/types/index.js";
import { WorkflowEngine } from "../../workflows/engine/index.js";

export function registerWorkflowRoutes(api: Router, db: CaioDatabase, _eventBus: EventBus): void {
  const engine = new WorkflowEngine(db);

  api.get("/workflows", (req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const workflows = engine.listWorkflows(projectId);
    res.json({ success: true, data: workflows, timestamp: new Date() });
  });

  api.get("/workflows/:id", (req, res) => {
    const workflow = engine.getWorkflow(req.params.id as WorkflowId);
    if (!workflow) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Workflow not found" } });
    res.json({ success: true, data: workflow, timestamp: new Date() });
  });

  api.post("/workflows/import", (req, res) => {
    const workflow = engine.importWorkflow(req.body, req.body.projectId);
    res.status(201).json({ success: true, data: workflow, timestamp: new Date() });
  });

  api.get("/workflows/:id/export", (req, res) => {
    const data = engine.exportWorkflow(req.params.id as WorkflowId);
    if (!data) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Workflow not found" } });
    res.json({ success: true, data, timestamp: new Date() });
  });

  api.post("/workflows/:id/validate", (req, res) => {
    const workflow = engine.getWorkflow(req.params.id as WorkflowId);
    if (!workflow) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Workflow not found" } });
    const result = engine.validate(workflow);
    res.json({ success: true, data: result, timestamp: new Date() });
  });

  api.post("/workflows/:id/clone", (req, res) => {
    const workflow = engine.getWorkflow(req.params.id as WorkflowId);
    if (!workflow) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Workflow not found" } });
    const cloned = engine.clone(workflow, req.body.name);
    res.status(201).json({ success: true, data: cloned, timestamp: new Date() });
  });
}
