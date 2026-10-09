import type { Router } from "express";
import type { CaioConfig } from "../../core/config/index.js";
import { GitHubDiscoveryProvider } from "../../discovery/github/provider.js";
import { HuggingFaceDiscoveryProvider } from "../../discovery/huggingface/provider.js";
import { CivitaiDiscoveryProvider } from "../../discovery/civitai/provider.js";

export function registerDiscoveryRoutes(api: Router, config: CaioConfig): void {
  const github = new GitHubDiscoveryProvider(config);
  const hf = new HuggingFaceDiscoveryProvider(config);
  const civitai = new CivitaiDiscoveryProvider(config);

  api.get("/discovery/github", async (req, res) => {
    try {
      const q = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;
      if (!q) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Query 'q' is required" } });
      const result = await github.search(q, { limit });
      res.json({ success: true, data: result, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "NETWORK_ERROR", message: err.message } });
    }
  });

  api.get("/discovery/huggingface", async (req, res) => {
    try {
      const q = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;
      if (!q) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Query 'q' is required" } });
      const result = await hf.searchModels(q, { limit });
      res.json({ success: true, data: result, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "NETWORK_ERROR", message: err.message } });
    }
  });

  api.get("/discovery/civitai", async (req, res) => {
    try {
      const q = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;
      if (!q) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Query 'q' is required" } });
      const result = await civitai.search(q, { limit });
      res.json({ success: true, data: result, timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "NETWORK_ERROR", message: err.message } });
    }
  });

  api.get("/discovery/all", async (req, res) => {
    try {
      const q = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;
      if (!q) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Query 'q' is required" } });
      const [gh, hfc, ci] = await Promise.allSettled([
        github.search(q, { limit }),
        hf.searchModels(q, { limit }),
        civitai.search(q, { limit }),
      ]);
      res.json({
        success: true,
        data: {
          github: gh.status === "fulfilled" ? gh.value : null,
          huggingface: hfc.status === "fulfilled" ? hfc.value : null,
          civitai: ci.status === "fulfilled" ? ci.value : null,
        },
        timestamp: new Date(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: "NETWORK_ERROR", message: err.message } });
    }
  });
}
