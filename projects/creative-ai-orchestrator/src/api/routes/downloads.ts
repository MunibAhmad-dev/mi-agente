// ============================================================================
// Downloads Route — HuggingFace model download with progress
// ============================================================================

import type { Router } from "express";
import type { CaioDatabase } from "../../core/database/index.js";
import type { CaioConfig } from "../../core/config/index.js";
import { HuggingFaceDownloader } from "../../discovery/huggingface/downloader.js";

export function registerDownloadRoutes(api: Router, db: CaioDatabase, config: CaioConfig): void {
  const downloader = new HuggingFaceDownloader(db, config.modelsDir, config.huggingfaceToken);

  // List model files on HuggingFace
  api.get("/downloads/files", async (req, res) => {
    try {
      const modelId = req.query.modelId as string;
      if (!modelId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "modelId required" } });

      const files = await downloader.listModelFiles(modelId);
      res.json({ success: true, data: { files, totalSize: files.reduce((s, f) => s + f.size, 0) }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "NETWORK_ERROR", message: err.message } });
    }
  });

  // Get model size estimate
  api.get("/downloads/size", async (req, res) => {
    try {
      const modelId = req.query.modelId as string;
      if (!modelId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "modelId required" } });

      const sizeBytes = await downloader.getModelSize(modelId);
      res.json({ success: true, data: { modelId, sizeBytes, sizeFormatted: `${(sizeBytes / 1024 / 1024).toFixed(1)} MB` }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "NETWORK_ERROR", message: err.message } });
    }
  });

  // Download a model file
  api.post("/downloads/start", async (req, res) => {
    try {
      const { modelId, fileName, targetDir } = req.body;
      if (!modelId || !fileName) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "modelId and fileName required" } });

      const result = await downloader.downloadModel(modelId, fileName, targetDir);
      res.json({ success: true, data: result, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "RESOURCE_ERROR", message: err.message } });
    }
  });

  // Check if model is downloaded
  api.get("/downloads/status", (req, res) => {
    const modelId = req.query.modelId as string;
    if (!modelId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "modelId required" } });

    const downloaded = downloader.isDownloaded(modelId);
    res.json({ success: true, data: { modelId, downloaded }, timestamp: new Date() });
  });
}
