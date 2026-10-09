// ============================================================================
// Benchmark Engine
// ============================================================================
// Benchmarks runtime performance after installation.
// Saves results for future predictions.
// ============================================================================

import type { RuntimeAdapter, CaioDatabase, Workflow } from "../types/index.js";
import { newId } from "../types/index.js";

export interface BenchmarkResult {
  id: string;
  runtime: string;
  gpu?: string;
  vramMb?: number;
  model: string;
  resolution: string;
  steps: number;
  timeMs: number;
  qualityScore?: number;
  vramPeakMb?: number;
  timestamp: Date;
}

export class BenchmarkEngine {
  constructor(private db: CaioDatabase) {}

  /**
   * Run a benchmark with the given runtime.
   */
  async runBenchmark(
    adapter: RuntimeAdapter,
    opts: {
      model?: string;
      width?: number;
      height?: number;
      steps?: number;
    } = {}
  ): Promise<BenchmarkResult> {
    const width = opts.width || 512;
    const height = opts.height || 512;
    const steps = opts.steps || 20;
    const startTime = Date.now();

    // Create a minimal test workflow
    const workflow: Workflow = {
      id: "benchmark" as any,
      nodes: [
        { id: "1", type: "CheckpointLoaderSimple", inputs: { ckpt_name: opts.model || "model.safetensors" }, outputs: {} },
        { id: "2", type: "CLIPTextEncode", inputs: { text: "test" }, outputs: {} },
        { id: "3", type: "CLIPTextEncode", inputs: { text: "bad" }, outputs: {} },
        { id: "4", type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 }, outputs: {} },
        { id: "5", type: "KSampler", inputs: { steps, cfg: 7.0, sampler_name: "euler", scheduler: "normal", seed: 42 }, outputs: {} },
        { id: "6", type: "VAEDecode", inputs: {}, outputs: {} },
        { id: "7", type: "SaveImage", inputs: { filename_prefix: "benchmark" }, outputs: {} },
      ],
      links: [
        { fromNode: "1", fromOutput: "0", toNode: "5", toInput: "model" },
        { fromNode: "2", fromOutput: "0", toNode: "5", toInput: "positive" },
        { fromNode: "3", fromOutput: "0", toNode: "5", toInput: "negative" },
        { fromNode: "4", fromOutput: "0", toNode: "5", toInput: "latent_image" },
        { fromNode: "5", fromOutput: "0", toNode: "6", toInput: "samples" },
        { fromNode: "6", fromOutput: "0", toNode: "7", toInput: "images" },
      ],
      metadata: { tags: ["benchmark"], requiredNodes: [], requiredModels: [] },
      name: "Benchmark",
      version: "1.0.0",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const result = await adapter.execute({ workflow });
      const timeMs = Date.now() - startTime;

      const benchmark: BenchmarkResult = {
        id: newId(),
        runtime: adapter.id,
        model: opts.model || "default",
        resolution: `${width}x${height}`,
        steps,
        timeMs,
        vramPeakMb: result.resourceUsage.peakVramMb,
        timestamp: new Date(),
      };

      // Store result
      this.db.run(
        `INSERT INTO experiments (id, project_id, name, variables, status, quality_score, result)
         VALUES (?, NULL, 'benchmark', ?, 'completed', ?, ?)`,
        benchmark.id,
        JSON.stringify({ model: opts.model, width, height, steps }),
        result.success ? 50 : 0,
        JSON.stringify(benchmark)
      );

      return benchmark;
    } catch (err: any) {
      return {
        id: newId(),
        runtime: adapter.id,
        model: opts.model || "default",
        resolution: `${width}x${height}`,
        steps,
        timeMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get benchmark history.
   */
  getHistory(runtime?: string, limit: number = 10): BenchmarkResult[] {
    const sql = runtime
      ? "SELECT result FROM experiments WHERE name = 'benchmark' AND result LIKE ? ORDER BY created_at DESC LIMIT ?"
      : "SELECT result FROM experiments WHERE name = 'benchmark' ORDER BY created_at DESC LIMIT ?";
    const params = runtime ? [`%"runtime":"${runtime}"%`, limit] : [limit];
    const rows = this.db.all<{ result: string }>(sql, ...params);
    return rows.map((r) => JSON.parse(r.result)).filter(Boolean);
  }
}
