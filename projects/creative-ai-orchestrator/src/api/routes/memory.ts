// ============================================================================
// Memory & Vector Search Routes
// ============================================================================

import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { ProjectId } from "../../core/types/index.js";
import { VectorSearch } from "../../memory/vector-search.js";

export function registerMemoryRoutes(api: Router, db: CaioDatabase): void {
  const vectorSearch = new VectorSearch(db);

  // Index a memory entry for vector search
  api.post("/memory/index", async (req, res) => {
    try {
      const { entryId, content, projectId, type, category, metadata } = req.body;
      if (!content) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "content required" } });

      // Create memory entry and index it
      db.run(
        `INSERT OR REPLACE INTO memory (id, project_id, type, category, content, metadata, relevance, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        entryId || `mem-${Date.now()}`,
        projectId || null,
        type || "note",
        category || "general",
        content,
        JSON.stringify(metadata || {}),
        0.5,
      );

      const entry = {
        id: entryId || `mem-${Date.now()}`,
        projectId,
        type: type || "note",
        category: category || "general",
        content,
        metadata: metadata || {},
        relevance: 0.5,
        createdAt: new Date(),
      };

      await vectorSearch.indexEntry(entry);
      res.json({ success: true, data: { indexed: true, id: entry.id }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VISION_ERROR", message: err.message } });
    }
  });

  // Semantic search
  api.get("/memory/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const projectId = req.query.projectId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      if (!query) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "q required" } });

      const results = await vectorSearch.hybridSearch(query, projectId as ProjectId | undefined, limit);
      res.json({ success: true, data: { results, count: results.length }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VISION_ERROR", message: err.message } });
    }
  });

  // Vector search stats
  api.get("/memory/stats", (_req, res) => {
    res.json({
      success: true,
      data: {
        modelAvailable: vectorSearch.isAvailable(),
        indexSize: vectorSearch.getIndexSize(),
        error: vectorSearch.getLoadError(),
      },
      timestamp: new Date(),
    });
  });
}
