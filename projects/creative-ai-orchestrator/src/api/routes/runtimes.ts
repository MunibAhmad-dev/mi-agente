import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { EventBus } from "../../core/events/index.js";

export function registerRuntimeRoutes(api: Router, db: CaioDatabase, _eventBus: EventBus): void {
  api.get("/runtimes", (_req, res) => {
    const runtimes = db.all("SELECT * FROM runtimes");
    res.json({ success: true, data: runtimes, timestamp: new Date() });
  });

  api.get("/runtimes/:id/health", async (req, res) => {
    const runtime = db.get("SELECT * FROM runtimes WHERE id = ?", req.params.id);
    if (!runtime) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Runtime not found" } });
    res.json({ success: true, data: { status: "healthy" }, timestamp: new Date() });
  });
}
