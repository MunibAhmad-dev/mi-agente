import type { Router } from "express";
import { GoHardwareDetector } from "../../core/hardware/go-detector.js";
import {
  analyzeImageGo,
  resizeImageGo,
  sharpenImageGo,
  denoiseImageGo,
  compareImagesGo,
  isGoBinaryAvailable,
} from "../../vision/go-processor.js";
import { GoFileWatcher, watchForDuration } from "../../core/watcher/go-watcher.js";

const watchers = new Map<string, GoFileWatcher>();

export function registerGoToolRoutes(api: Router, dataDir: string): void {
  const detector = new GoHardwareDetector(dataDir);

  // --- Hardware + Hash + Bench (existing) ---

  api.get("/go/status", (_req, res) => {
    res.json({ available: isGoBinaryAvailable(), platform: process.platform });
  });

  api.get("/go/hw", async (_req, res) => {
    if (!detector.isAvailable()) {
      res.json({ success: false, error: { code: "NOT_FOUND", message: "caiotool binary not found" }, timestamp: new Date() });
      return;
    }
    const hw = await detector.detect();
    res.json({ success: true, data: hw, timestamp: new Date() });
  });

  api.post("/go/hash", async (req, res) => {
    if (!detector.isAvailable()) {
      res.json({ success: false, error: { code: "NOT_FOUND", message: "caiotool binary not found" }, timestamp: new Date() });
      return;
    }
    const { path: filePath } = req.body;
    if (!filePath) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "path required" } }); return; }
    const result = await detector.hashFile(filePath);
    if (!result) { res.status(500).json({ success: false, error: { code: "RESOURCE_ERROR", message: "Hash failed" } }); return; }
    res.json({ success: true, data: result, timestamp: new Date() });
  });

  api.get("/go/bench", async (_req, res) => {
    if (!detector.isAvailable()) {
      res.json({ success: false, error: { code: "NOT_FOUND", message: "caiotool binary not found" }, timestamp: new Date() });
      return;
    }
    const result = await detector.benchmark();
    res.json({ success: true, data: result, timestamp: new Date() });
  });

  // --- Image Processing (new) ---

  api.post("/go/img/analyze", async (req, res) => {
    try {
      const { path: imgPath } = req.body;
      if (!imgPath) { res.status(400).json({ error: "path is required" }); return; }
      const info = await analyzeImageGo(imgPath);
      res.json(info);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  api.post("/go/img/resize", async (req, res) => {
    try {
      const { input, output, width, height } = req.body;
      if (!input || !output || !width || !height) { res.status(400).json({ error: "input, output, width, height required" }); return; }
      res.json(await resizeImageGo(input, output, width, height));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  api.post("/go/img/sharpen", async (req, res) => {
    try {
      const { input, output } = req.body;
      if (!input || !output) { res.status(400).json({ error: "input, output required" }); return; }
      res.json(await sharpenImageGo(input, output));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  api.post("/go/img/denoise", async (req, res) => {
    try {
      const { input, output } = req.body;
      if (!input || !output) { res.status(400).json({ error: "input, output required" }); return; }
      res.json(await denoiseImageGo(input, output));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  api.post("/go/img/compare", async (req, res) => {
    try {
      const { img1, img2 } = req.body;
      if (!img1 || !img2) { res.status(400).json({ error: "img1, img2 required" }); return; }
      res.json(await compareImagesGo(img1, img2));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // --- File Watching (new) ---

  api.post("/go/watch/start", async (req, res) => {
    try {
      const { dir, extensions, id } = req.body;
      if (!dir) { res.status(400).json({ error: "dir is required" }); return; }
      const watchId = id || `watch_${Date.now()}`;
      const existing = watchers.get(watchId);
      if (existing) existing.stop();
      const watcher = new GoFileWatcher(dir, { extensions });
      watcher.start();
      watchers.set(watchId, watcher);
      watcher.on("exit", () => watchers.delete(watchId));
      res.json({ id: watchId, dir, running: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  api.post("/go/watch/stop", (req, res) => {
    const { id } = req.body;
    if (!id) { res.status(400).json({ error: "id is required" }); return; }
    const watcher = watchers.get(id);
    if (!watcher) { res.status(404).json({ error: "watcher not found" }); return; }
    watcher.stop();
    watchers.delete(id);
    res.json({ id, stopped: true });
  });

  api.post("/go/watch/snapshot", async (req, res) => {
    try {
      const { dir, durationMs, extensions } = req.body;
      if (!dir) { res.status(400).json({ error: "dir is required" }); return; }
      const events = await watchForDuration(dir, durationMs || 5000, { extensions });
      res.json({ dir, durationMs: durationMs || 5000, events });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
}
