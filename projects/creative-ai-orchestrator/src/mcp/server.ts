// ============================================================================
// MCP Server for Creative AI Orchestrator
// ============================================================================
// Exposes CAIO capabilities as MCP tools usable by Claude Code, Cursor,
// and other MCP-compatible AI agents.
//
// Transport: stdio (for Claude Desktop / Claude Code integration)
//            + HTTP (for web-based agents)
//
// Usage:
//   node dist/mcp/server.js          — stdio mode
//   node dist/mcp/server.js --http   — HTTP mode on port 3100
//
// Claude Desktop config:
//   {
//     "mcpServers": {
//       "caio": {
//         "command": "node",
//         "args": ["dist/mcp/server.js"]
//       }
//     }
//   }
// ============================================================================

import { createInterface, type Interface } from "node:readline";
import { detectHardware } from "../core/hardware/detector.js";
import { type HardwareProfile } from "../core/types/index.js";
import {
  analyzeImageGo,
  compareImagesGo,
  isGoBinaryAvailable,
} from "../vision/go-processor.js";
import { GitHubDiscoveryProvider } from "../discovery/github/provider.js";
import { HuggingFaceDiscoveryProvider } from "../discovery/huggingface/provider.js";
import { CivitaiDiscoveryProvider } from "../discovery/civitai/provider.js";
import { loadConfig } from "../core/config/index.js";

// ============================================================================
// Tool Definitions
// ============================================================================

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: MCPTool[] = [
  {
    name: "caio_hw_detect",
    description: "Detect system hardware: GPU, VRAM, RAM, CPU, CUDA, disk space. Returns a HardwareProfile.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "caio_search_github",
    description: "Search GitHub for repositories matching a query. Returns repos with name, url, license, stars, language.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g. 'comfyui upscale workflow')" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "caio_inspect_repository",
    description: "Inspect a GitHub repository: README, license, dependencies, activity, releases.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "caio_search_huggingface",
    description: "Search Hugging Face for models, datasets, LoRA, VAE, etc.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g. 'flux lora portrait')" },
        type: { type: "string", description: "Filter: model, dataset, space" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "caio_search_civitai",
    description: "Search Civitai for checkpoints, LoRA, embeddings, workflows.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        type: { type: "string", description: "Filter: checkpoint, lora, embedding, workflow" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "caio_analyze_image",
    description: "Analyze an image: dimensions, sharpness, brightness, histogram, format. Uses Go binary for speed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to image file" },
      },
      required: ["path"],
    },
  },
  {
    name: "caio_compare_images",
    description: "Compare two images: MSE, SSIM, PSNR similarity metrics.",
    inputSchema: {
      type: "object",
      properties: {
        img1: { type: "string", description: "Path to first image" },
        img2: { type: "string", description: "Path to second image" },
      },
      required: ["img1", "img2"],
    },
  },
  {
    name: "caio_create_workflow",
    description: "Create a ComfyUI workflow from a description. Returns the workflow JSON.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What the workflow should do (e.g. 'txt2img with flux, 1024x1024, 20 steps')" },
        hardware: { type: "object", description: "Hardware profile from caio_hw_detect" },
      },
      required: ["description"],
    },
  },
  {
    name: "caio_execute_workflow",
    description: "Execute a ComfyUI workflow on a running ComfyUI instance.",
    inputSchema: {
      type: "object",
      properties: {
        workflow: { type: "object", description: "ComfyUI workflow JSON" },
        host: { type: "string", description: "ComfyUI host (default: http://127.0.0.1:8188)" },
      },
      required: ["workflow"],
    },
  },
  {
    name: "caio_get_system_status",
    description: "Get full system status: hardware, runtime health, disk, memory usage.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ============================================================================
// Tool Execution
// ============================================================================

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "caio_hw_detect": {
      const hw = await detectHardware();
      return { hardware: hw, goBinary: isGoBinaryAvailable() };
    }

    case "caio_search_github": {
      const config = loadConfig();
      const provider = new GitHubDiscoveryProvider(config);
      return provider.search(args.query as string, { limit: (args.limit as number) || 10 });
    }

    case "caio_inspect_repository": {
      const config = loadConfig();
      const provider = new GitHubDiscoveryProvider(config);
      return provider.inspect(args.owner as string, args.repo as string);
    }

    case "caio_search_huggingface": {
      const config = loadConfig();
      const provider = new HuggingFaceDiscoveryProvider(config);
      return provider.searchModels(args.query as string, { pipelineTag: args.type as string, limit: (args.limit as number) || 10 });
    }

    case "caio_search_civitai": {
      const config = loadConfig();
      const provider = new CivitaiDiscoveryProvider(config);
      return provider.search(args.query as string, { type: args.type as string, limit: (args.limit as number) || 10 });
    }

    case "caio_analyze_image": {
      if (!isGoBinaryAvailable()) {
        return { error: "Go binary not available — build with: cd cmd/caiotool && go build" };
      }
      return await analyzeImageGo(args.path as string);
    }

    case "caio_compare_images": {
      if (!isGoBinaryAvailable()) {
        return { error: "Go binary not available" };
      }
      return await compareImagesGo(args.img1 as string, args.img2 as string);
    }

    case "caio_create_workflow": {
      // Basic workflow template generation
      return createWorkflowFromDescription(args.description as string, args.hardware as HardwareProfile | undefined);
    }

    case "caio_execute_workflow": {
      const host = (args.host as string) || "http://127.0.0.1:8188";
      const response = await fetch(`${host}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: args.workflow }),
      });
      if (!response.ok) {
        return { error: `ComfyUI returned ${response.status}: ${await response.text()}` };
      }
      return await response.json();
    }

    case "caio_get_system_status": {
      const hw = await detectHardware();
      const goAvail = isGoBinaryAvailable();
      return {
        hardware: hw,
        goBinaryAvailable: goAvail,
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function createWorkflowFromDescription(description: string, hw?: HardwareProfile) {
  const lower = description.toLowerCase();
  const workflow: Record<string, unknown> = {};

  // Determine resolution based on VRAM
  let width = 512, height = 512, steps = 20;
  const vramMb = hw?.gpus?.[0]?.vramMb || 0;
  if (vramMb >= 12000) { width = 1024; height = 1024; steps = 30; }
  else if (vramMb >= 8000) { width = 768; height = 768; steps = 25; }
  else if (vramMb >= 4000) { width = 512; height = 512; steps = 20; }
  else { width = 384; height = 384; steps = 15; }

  // Override from description
  const resMatch = description.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/);
  if (resMatch && resMatch[1] && resMatch[2]) { width = parseInt(resMatch[1]); height = parseInt(resMatch[2]); }
  const stepMatch = description.match(/(\d+)\s*steps?/);
  if (stepMatch && stepMatch[1]) { steps = parseInt(stepMatch[1]); }

  workflow["1"] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: lower.includes("flux") ? "flux1-dev.safetensors" : "sd_xl_base_1.0.safetensors" } };
  workflow["2"] = { class_type: "CLIPTextEncode", inputs: { text: description } };
  workflow["3"] = { class_type: "CLIPTextEncode", inputs: { text: "blurry, low quality, artifacts" } };
  workflow["4"] = { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } };
  workflow["5"] = { class_type: "KSampler", inputs: { seed: Math.floor(Math.random() * 999999999), steps, cfg: lower.includes("flux") ? 1.0 : 7.0, sampler_name: lower.includes("flux") ? "euler" : "euler", scheduler: "normal", denoise: 1.0 } };
  workflow["6"] = { class_type: "VAEDecode", inputs: {} };
  workflow["7"] = { class_type: "SaveImage", inputs: { filename_prefix: "caio_output" } };

  // Connect nodes
  const w5 = workflow["5"] as { inputs: Record<string, unknown> };
  w5.inputs.model = ["1", 0];
  w5.inputs.positive = ["2", 0];
  w5.inputs.negative = ["3", 0];
  w5.inputs.latent_image = ["4", 0];
  const w6 = workflow["6"] as { inputs: Record<string, unknown> };
  w6.inputs.samples = ["5", 0];
  w6.inputs.vae = ["1", 2];
  const w7 = workflow["7"] as { inputs: Record<string, unknown> };
  w7.inputs.images = ["6", 0];

  return { workflow, resolution: { width, height }, steps, description };
}

// ============================================================================
// MCP Protocol Handler (JSON-RPC over stdio)
// ============================================================================

async function handleJSONRPC(line: string): Promise<string | null> {
  let msg: { jsonrpc: string; id?: number | string; method?: string; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }

  if (msg.jsonrpc !== "2.0") return null;

  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "caio-mcp", version: "0.1.0" },
        },
      });

    case "notifications/initialized":
      return null; // no response needed

    case "tools/list":
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      });

    case "tools/call": {
      const toolName = (params as Record<string, unknown>)?.name as string;
      const toolArgs = ((params as Record<string, unknown>)?.arguments as Record<string, unknown>) || {};
      try {
        const result = await executeTool(toolName, toolArgs);
        return JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err: any) {
        return JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          },
        });
      }
    }

    default:
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}

// ============================================================================
// Main: stdio mode or HTTP mode
// ============================================================================

async function main() {
  const isHttp = process.argv.includes("--http");

  if (isHttp) {
    // HTTP mode
    const http = await import("node:http");
    const port = parseInt(process.env.MCP_PORT || "3100");

    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/mcp") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const response = await handleJSONRPC(body);
        if (response) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(response);
        } else {
          res.writeHead(204);
          res.end();
        }
      } else if (req.method === "GET" && req.url === "/tools") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(TOOLS, null, 2));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(port, () => {
      console.error(`CAIO MCP HTTP server on http://127.0.0.1:${port}`);
      console.error(`Tools endpoint: http://127.0.0.1:${port}/tools`);
      console.error(`MCP endpoint: http://127.0.0.1:${port}/mcp`);
    });
  } else {
    // Stdio mode (for Claude Desktop / Claude Code)
    const rl: Interface = createInterface({ input: process.stdin });

    process.stderr.write("CAIO MCP server started (stdio mode)\n");
    process.stderr.write(`Tools available: ${TOOLS.map((t) => t.name).join(", ")}\n`);

    rl.on("line", async (line: string) => {
      const response = await handleJSONRPC(line.trim());
      if (response) {
        process.stdout.write(response + "\n");
      }
    });

    rl.on("close", () => process.exit(0));
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
