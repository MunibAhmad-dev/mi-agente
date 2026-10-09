import type { Router } from "express";
import { VisionEngine } from "../../vision/engine/index.js";
import { VideoAnalyzer } from "../../vision/video/analyzer.js";

export function registerVisionRoutes(api: Router): void {
  const vision = new VisionEngine();
  const videoAnalyzer = new VideoAnalyzer();

  api.post("/vision/analyze", async (req, res) => {
    try {
      const { path: imagePath } = req.body;
      if (!imagePath) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Image path is required" } });
      const analysis = await vision.analyzeImage(imagePath);
      res.json({ success: true, data: analysis, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });

  api.post("/vision/compare", async (req, res) => {
    try {
      const { original, modified } = req.body;
      if (!original || !modified) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Both original and modified paths required" } });
      const result = await vision.compareImages(original, modified);
      res.json({ success: true, data: result, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });

  api.post("/vision/suggestions", async (req, res) => {
    try {
      const { path: imagePath } = req.body;
      if (!imagePath) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Image path is required" } });
      const analysis = await vision.analyzeImage(imagePath);
      const suggestions = vision.suggestImprovements(analysis);
      res.json({ success: true, data: { analysis, suggestions }, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });

  // Video analysis
  api.post("/vision/video/analyze", async (req, res) => {
    try {
      const { path: videoPath } = req.body;
      if (!videoPath) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Video path is required" } });
      const metadata = VideoAnalyzer.analyze(videoPath);
      res.json({ success: true, data: metadata, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });

  api.post("/vision/video/quality", async (req, res) => {
    try {
      const { path: videoPath } = req.body;
      if (!videoPath) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Video path is required" } });
      const metadata = VideoAnalyzer.analyze(videoPath);
      if (!metadata) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Could not analyze video (ffprobe available?)" } });
      res.json({ success: true, data: metadata, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "VALIDATION_ERROR", message: err.message } });
    }
  });
}
