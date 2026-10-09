import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import { newId } from "../../core/types/index.js";

export function registerSnapshotRoutes(api: Router, db: CaioDatabase): void {
  api.get("/snapshots/:entityType/:entityId", (req, res) => {
    const rows = db.all<{ id: string; label: string; data: string; created_at: string }>(
      "SELECT * FROM snapshots WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC",
      req.params.entityType,
      req.params.entityId
    );
    res.json({
      success: true,
      data: rows.map((r) => ({ id: r.id, label: r.label, data: JSON.parse(r.data), createdAt: r.created_at })),
      timestamp: new Date(),
    });
  });

  api.get("/snapshots/:id", (req, res) => {
    const row = db.get<{ id: string; entity_type: string; entity_id: string; label: string; data: string; created_at: string }>(
      "SELECT * FROM snapshots WHERE id = ?",
      req.params.id
    );
    if (!row) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Snapshot not found" } });
    res.json({
      success: true,
      data: { id: row.id, entityType: row.entity_type, entityId: row.entity_id, label: row.label, data: JSON.parse(row.data), createdAt: row.created_at },
      timestamp: new Date(),
    });
  });

  api.post("/snapshots", (req, res) => {
    const { entityType, entityId, label, data } = req.body;
    if (!entityType || !entityId || !label) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "entityType, entityId, label required" } });
    }
    const id = req.body.id || newId();
    db.run(
      "INSERT INTO snapshots (id, entity_type, entity_id, label, data) VALUES (?, ?, ?, ?, ?)",
      id, entityType, entityId, label, JSON.stringify(data || {})
    );
    res.status(201).json({ success: true, data: { id, entityType, entityId, label }, timestamp: new Date() });
  });

  api.delete("/snapshots/:id", (req, res) => {
    db.run("DELETE FROM snapshots WHERE id = ?", req.params.id);
    res.json({ success: true, timestamp: new Date() });
  });
}
