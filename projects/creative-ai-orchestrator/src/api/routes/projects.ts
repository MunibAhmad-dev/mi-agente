import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { EventBus } from "../../core/events/index.js";
import type { ProjectId } from "../../core/types/index.js";
import { ProjectManager } from "../../projects/manager/index.js";

export function registerProjectRoutes(api: Router, db: CaioDatabase, eventBus: EventBus): void {
  const manager = new ProjectManager(db, process.cwd() + "/data/projects");

  api.get("/projects", (_req, res) => {
    res.json({ success: true, data: manager.list(), timestamp: new Date() });
  });

  api.get("/projects/:id", (req, res) => {
    const project = manager.get(req.params.id as ProjectId);
    if (!project) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Project not found" } });
    res.json({ success: true, data: project, timestamp: new Date() });
  });

  api.post("/projects", (req, res) => {
    const { name, description, config } = req.body;
    if (!name) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Name is required" } });
    const project = manager.create(name, description, config);
    eventBus.emit({ type: "project.created" as any, projectId: project.id, data: { name } });
    res.status(201).json({ success: true, data: project, timestamp: new Date() });
  });

  api.delete("/projects/:id", (req, res) => {
    manager.delete(req.params.id as ProjectId);
    res.json({ success: true, timestamp: new Date() });
  });

  api.get("/projects/:id/export", (req, res) => {
    const data = manager.exportProject(req.params.id as ProjectId);
    if (!data) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Project not found" } });
    res.json({ success: true, data, timestamp: new Date() });
  });

  api.post("/projects/import", (req, res) => {
    const project = manager.importProject(req.body);
    eventBus.emit({ type: "project.imported" as any, projectId: project.id, data: {} });
    res.status(201).json({ success: true, data: project, timestamp: new Date() });
  });
}
