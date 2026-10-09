// ============================================================================
// MCP API Routes
// ============================================================================
// Exposes MCP tools via the main HTTP server for web-based AI agents.
// ============================================================================

import { Router } from "express";
import { detectHardware } from "../../core/hardware/detector.js";
import { GitHubDiscoveryProvider } from "../../discovery/github/provider.js";
import { HuggingFaceDiscoveryProvider } from "../../discovery/huggingface/provider.js";
import { CivitaiDiscoveryProvider } from "../../discovery/civitai/provider.js";
import { loadConfig } from "../../core/config/index.js";
import {
  analyzeImageGo,
  compareImagesGo,
  isGoBinaryAvailable,
} from "../../vision/go-processor.js";

export const mcpRoutes = Router();

/**
 * GET /api/mcp/tools — List all MCP tools
 */
mcpRoutes.get("/tools", (_req, res) => {
  res.json({
    tools: [
      { name: "caio_hw_detect", description: "Detect GPU, VRAM, RAM, CPU, CUDA" },
      { name: "caio_search_github", description: "Search GitHub for repos" },
      { name: "caio_search_huggingface", description: "Search HuggingFace for models" },
      { name: "caio_search_civitai", description: "Search Civitai for checkpoints/LoRA" },
      { name: "caio_analyze_image", description: "Analyze image quality" },
      { name: "caio_compare_images", description: "Compare two images" },
      { name: "caio_create_workflow", description: "Create workflow from description" },
      { name: "caio_get_system_status", description: "Full system status" },
    ],
  });
});

/**
 * POST /api/mcp/call — Execute an MCP tool
 * Body: { tool: string, arguments: Record<string, unknown> }
 */
mcpRoutes.post("/call", async (req, res) => {
  const { tool, arguments: args } = req.body;
  if (!tool) {
    res.status(400).json({ error: "tool is required" });
    return;
  }

  try {
    let result: unknown;

    switch (tool) {
      case "caio_hw_detect":
        result = await detectHardware();
        break;
      case "caio_search_github": {
        const cfg = loadConfig();
        const gh = new GitHubDiscoveryProvider(cfg);
        result = await gh.search(args.query, { limit: args.limit || 10 });
        break;
      }
      case "caio_search_huggingface": {
        const cfg2 = loadConfig();
        const hf = new HuggingFaceDiscoveryProvider(cfg2);
        result = await hf.searchModels(args.query, { pipelineTag: args.type as string, limit: (args.limit as number) || 10 });
        break;
      }
      case "caio_search_civitai": {
        const cfg3 = loadConfig();
        const ci = new CivitaiDiscoveryProvider(cfg3);
        result = await ci.search(args.query, { type: args.type, limit: args.limit || 10 });
        break;
      }
      case "caio_analyze_image":
        if (!isGoBinaryAvailable()) { res.status(503).json({ error: "Go binary not available" }); return; }
        result = await analyzeImageGo(args.path);
        break;
      case "caio_compare_images":
        if (!isGoBinaryAvailable()) { res.status(503).json({ error: "Go binary not available" }); return; }
        result = await compareImagesGo(args.img1, args.img2);
        break;
      case "caio_get_system_status":
        const hw = await detectHardware();
        result = { hardware: hw, goBinary: isGoBinaryAvailable(), platform: process.platform, nodeVersion: process.version };
        break;
      default:
        res.status(400).json({ error: `Unknown tool: ${tool}` });
        return;
    }

    res.json({ tool, result });
  } catch (err: any) {
    res.status(500).json({ tool, error: err.message });
  }
});
