// ============================================================================
// ComfyUI Runtime Adapter
// ============================================================================
// Interfaces with ComfyUI as a SEPARATE PROCESS via its HTTP API.
// NO GPL code is copied into this codebase.
// ComfyUI is launched as a child process and communicates over HTTP.
// ============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import type {
  RuntimeAdapter,
  RuntimeInfo,
  RuntimeInstallConfig,
  RuntimeConfig,
  RuntimeStartConfig,
  RuntimeModel,
  RuntimeExtension,
  RuntimeExtensionInstallRequest,
  RuntimeSystemInfo,
  WorkflowExecutionRequest,
  ExecutionResult,
  ExecutionOutput,
  ExecutionStatus,
  LogEntry,
  SnapshotId,
  InstallResult,
  ResourceUsage,
  ExecutionId,
} from "../../core/types/index.js";
import { HealthStatus, ErrorCode, newId } from "../../core/types/index.js";
import { CaioDatabase } from "../../core/database/index.js";
import { EventBus } from "../../core/events/index.js";
import { classifyError } from "../../core/errors/index.js";
import fs from "node:fs";
import path from "node:path";

export class ComfyUIAdapter implements RuntimeAdapter {
  readonly id = "comfyui";
  readonly name = "ComfyUI";

  private process: ChildProcess | null = null;
  private port: number;
  private host: string;
  private installPath: string;
  private pythonPath: string;
  private db: CaioDatabase;
  private eventBus: EventBus;

  constructor(opts: {
    port?: number;
    host?: string;
    installPath?: string;
    pythonPath?: string;
    db: CaioDatabase;
    eventBus: EventBus;
  }) {
    this.port = opts.port || 8188;
    this.host = opts.host || "127.0.0.1";
    this.installPath = opts.installPath || "";
    this.pythonPath = opts.pythonPath || "python3";
    this.db = opts.db;
    this.eventBus = opts.eventBus;
  }

  private get apiBase(): string {
    return `http://${this.host}:${this.port}`;
  }

  private async apiFetch(path: string, opts?: RequestInit): Promise<any> {
    const res = await fetch(`${this.apiBase}${path}`, {
      signal: AbortSignal.timeout(30000),
      ...opts,
    });
    if (!res.ok) throw new Error(`ComfyUI API error ${res.status}`);
    return res.json();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async detect(): Promise<RuntimeInfo> {
    // Check if process is running
    let status: RuntimeInfo["status"] = "not_installed";
    let pid: number | undefined;
    let port: number | undefined;

    if (this.process && !this.process.killed) {
      status = "running";
      pid = this.process.pid;
      port = this.port;
    } else if (this.installPath && fs.existsSync(this.installPath)) {
      status = "installed";
    }

    // Try health check to confirm running
    try {
      const health = await this.healthCheck();
      if (health === "healthy") {
        status = "running";
        pid = this.process?.pid;
        port = this.port;
      }
    } catch {
      // Not running
    }

    return {
      id: this.id as any,
      name: this.name,
      version: await this.getVersion(),
      path: this.installPath,
      capabilities: {
        imageGeneration: true,
        videoGeneration: true,
        audioGeneration: false,
        musicGeneration: false,
        tts: false,
        stt: false,
        threeD: false,
        editing: true,
        upscaling: true,
        training: false,
        loraTraining: false,
        workflowGraph: true,
        localExecution: true,
        remoteExecution: false,
      },
      status,
      port,
      pid,
      apiEndpoint: status === "running" ? this.apiBase : undefined,
    };
  }

  async install(config: RuntimeInstallConfig): Promise<InstallResult> {
    const start = Date.now();
    const targetPath = config.path || path.join(process.cwd(), "runtimes", "comfyui");

    try {
      // Check if already installed
      if (fs.existsSync(path.join(targetPath, "main.py"))) {
        this.installPath = targetPath;
        return {
          success: true,
          path: targetPath,
          version: await this.getVersion(),
          duration: Date.now() - start,
          warnings: ["ComfyUI was already installed at this path"],
        };
      }

      // Clone ComfyUI repository
      // NOTE: We are cloning the REPOSITORY as a separate process.
      // We do NOT copy GPL code into our codebase.
      const { execSync } = await import("node:child_process");

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      execSync(
        `git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "${targetPath}"`,
        { stdio: "pipe", timeout: 120000 }
      );

      this.installPath = targetPath;

      // Install Python dependencies
      const python = config.pythonPath || this.pythonPath;
      try {
        execSync(`${python} -m pip install -r requirements.txt`, {
          cwd: targetPath,
          stdio: "pipe",
          timeout: 300000,
        });
      } catch (err) {
        return {
          success: false,
          duration: Date.now() - start,
          warnings: [],
          error: classifyError(err, "ComfyUI dependency installation"),
        };
      }

      return {
        success: true,
        path: targetPath,
        version: await this.getVersion(),
        duration: Date.now() - start,
        warnings: [],
      };
    } catch (err) {
      return {
        success: false,
        duration: Date.now() - start,
        warnings: [],
        error: classifyError(err, "ComfyUI installation"),
      };
    }
  }

  async configure(config: RuntimeConfig): Promise<void> {
    if (config.port) this.port = config.port;
    if (config.host) this.host = config.host;
  }

  async start(config?: RuntimeStartConfig): Promise<void> {
    if (!this.installPath || !fs.existsSync(path.join(this.installPath, "main.py"))) {
      throw new Error("ComfyUI not installed. Run install() first.");
    }

    const port = config?.port || this.port;
    const args = [
      path.join(this.installPath, "main.py"),
      "--port", String(port),
      "--listen", this.host,
      ...(config?.extraArgs || []),
    ];

    this.process = spawn(this.pythonPath, args, {
      cwd: this.installPath,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.on("error", (err) => {
      console.error("ComfyUI process error:", err);
      this.eventBus.emit({
        type: "runtime.failed" as any,
        runtimeId: this.id as any,
        data: { error: err.message },
      });
    });

    this.process.on("exit", () => {
      this.process = null;
    });

    this.port = port;

    // Wait for the API to become available
    await this.waitForReady(60000);
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      // Give it 10 seconds to shut down gracefully
      await new Promise((resolve) => setTimeout(resolve, 10000));
      if (this.process && !this.process.killed) {
        this.process.kill("SIGKILL");
      }
      this.process = null;
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start({ port: this.port });
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const res = await fetch(`${this.apiBase}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return HealthStatus.Healthy;
      return HealthStatus.Degraded;
    } catch {
      return HealthStatus.Unhealthy;
    }
  }

  async getSystemInfo(): Promise<RuntimeSystemInfo> {
    const stats = await this.apiFetch("/system_stats");
    return {
      runtimeVersion: stats.system?.comfyui_version || "unknown",
      pythonVersion: stats.system?.python_version || "unknown",
      cudaVersion: stats.system?.cuda_version,
      installedNodes: 0,
      installedModels: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Models
  // -------------------------------------------------------------------------

  async listModels(): Promise<RuntimeModel[]> {
    try {
      const data = await this.apiFetch("/object_info");
      const models: RuntimeModel[] = [];

      // Extract model info from node definitions
      for (const [nodeName, nodeInfo] of Object.entries(data)) {
        const info = nodeInfo as any;
        if (info.input?.required) {
          for (const [, paramDef] of Object.entries(info.input.required)) {
            const param = paramDef as any;
            if (Array.isArray(param) && param[0] === "COMBO") {
              // This is a model selection parameter
              const modelNames = param[1]?.[0] || [];
              for (const model of modelNames) {
                models.push({
                  name: model,
                  path: "",
                  sizeBytes: 0,
                  type: "checkpoint",
                  format: "safetensors",
                });
              }
            }
          }
        }
      }

      return models;
    } catch {
      return [];
    }
  }

  async installModel(): Promise<InstallResult> {
    // ComfyUI models are typically placed in the models/ directory
    // This requires manual download or HuggingFace integration
    return {
      success: false,
      duration: 0,
      warnings: ["Model installation via ComfyUI adapter requires model download support"],
      error: {
        code: ErrorCode.NotFound as any,
        message: "Model download not yet implemented for ComfyUI adapter",
        recoverable: false,
        timestamp: new Date(),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Extensions / Nodes
  // -------------------------------------------------------------------------

  async listExtensions(): Promise<RuntimeExtension[]> {
    // ComfyUI custom nodes are in custom_nodes/ directory
    const customNodesPath = path.join(this.installPath, "custom_nodes");
    if (!fs.existsSync(customNodesPath)) return [];

    const extensions: RuntimeExtension[] = [];
    const dirs = fs.readdirSync(customNodesPath, { withFileTypes: true });

    for (const dir of dirs) {
      if (dir.isDirectory() && !dir.name.startsWith(".")) {
        const nodePath = path.join(customNodesPath, dir.name);
        const hasInit = fs.existsSync(path.join(nodePath, "__init__.py"));
        if (hasInit) {
          extensions.push({
            id: dir.name,
            name: dir.name,
            version: "unknown",
            enabled: true,
          });
        }
      }
    }

    return extensions;
  }

  async installExtension(ext: RuntimeExtensionInstallRequest): Promise<InstallResult> {
    const customNodesPath = path.join(this.installPath, "custom_nodes");
    fs.mkdirSync(customNodesPath, { recursive: true });

    const targetPath = path.join(customNodesPath, ext.id);

    if (fs.existsSync(targetPath)) {
      return {
        success: true,
        path: targetPath,
        duration: 0,
        warnings: ["Extension already installed"],
      };
    }

    try {
      const { execSync } = await import("node:child_process");
      const source = ext.source || `https://github.com/${ext.id}.git`;
      execSync(`git clone --depth 1 "${source}" "${targetPath}"`, {
        stdio: "pipe",
        timeout: 60000,
      });

      return {
        success: true,
        path: targetPath,
        duration: 0,
        warnings: [],
      };
    } catch (err) {
      return {
        success: false,
        duration: 0,
        warnings: [],
        error: classifyError(err, "Extension installation"),
      };
    }
  }

  async removeExtension(id: string): Promise<void> {
    const targetPath = path.join(this.installPath, "custom_nodes", id);
    if (fs.existsSync(targetPath)) {
      const { execSync } = await import("node:child_process");
      execSync(`rm -rf "${targetPath}"`, { stdio: "pipe" });
    }
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  async execute(request: WorkflowExecutionRequest): Promise<ExecutionResult> {
    const execId = newId();
    const start = Date.now();

    try {
      // Convert our internal workflow to ComfyUI prompt format
      const prompt = this.workflowToPrompt(request.workflow);

      // Submit prompt
      const response = await fetch(`${this.apiBase}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, client_id: execId }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Failed to submit prompt: ${response.status}`);
      }

      const body = (await response.json()) as { prompt_id?: string };
      const promptId = body.prompt_id || execId;

      // Poll for completion
      const result = await this.pollExecution(promptId, 300000);

      return {
        id: execId as any,
        success: result.success,
        outputs: result.outputs,
        duration: Date.now() - start,
        error: result.error,
        resourceUsage: {
          cpuTimeMs: Date.now() - start,
          duration: Date.now() - start,
        },
      };
    } catch (err) {
      return {
        id: execId as any,
        success: false,
        outputs: [],
        duration: Date.now() - start,
        error: classifyError(err, "ComfyUI execution"),
        resourceUsage: { cpuTimeMs: Date.now() - start, duration: Date.now() - start },
      };
    }
  }

  async getExecutionStatus(id: ExecutionId): Promise<ExecutionStatus> {
    try {
      const history = await this.apiFetch(`/history/${id}`);
      const entry = history[id as string];
      if (entry) {
        return {
          id,
          state: entry.status?.completed ? "completed" : "running",
          startTime: new Date(),
        };
      }
      return { id, state: "pending", startTime: new Date() };
    } catch {
      return { id, state: "failed", startTime: new Date() };
    }
  }

  async getLogs(_id: ExecutionId): Promise<LogEntry[]> {
    // ComfyUI logs are in its stdout/stderr — capture from process
    return [];
  }

  async rollback(snapshotId: SnapshotId): Promise<void> {
    // Restore a snapshot of custom_nodes and configuration
    const snapshotRow = this.db.get<{ data: string }>(
      "SELECT data FROM snapshots WHERE id = ? AND entity_type = 'comfyui'",
      snapshotId
    );
    if (!snapshotRow) throw new Error(`Snapshot ${snapshotId} not found`);

    const snapshot = JSON.parse(snapshotRow.data);
    if (snapshot.custom_nodes) {
      // Restore custom nodes
      const { execSync } = await import("node:child_process");
      const customNodesPath = path.join(this.installPath, "custom_nodes");
      fs.rmSync(customNodesPath, { recursive: true, force: true });
      fs.mkdirSync(customNodesPath, { recursive: true });
      for (const node of snapshot.custom_nodes) {
        if (node.gitUrl) {
          execSync(`git clone --depth 1 "${node.gitUrl}" "${path.join(customNodesPath, node.name)}"`, {
            stdio: "pipe",
            timeout: 60000,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async getVersion(): Promise<string> {
    if (!this.installPath) return "not installed";
    try {
      const versionFile = path.join(this.installPath, "comfy", "version.py");
      if (fs.existsSync(versionFile)) {
        const content = fs.readFileSync(versionFile, "utf-8");
        const match = content.match(/__version__\s*=\s*["']([^"']+)/);
        if (match) return match[1]!;
      }
    } catch {
      // Ignore
    }
    return "unknown";
  }

  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${this.apiBase}/system_stats`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`ComfyUI did not become ready within ${timeoutMs / 1000}s`);
  }

  /**
   * Convert our internal Workflow to ComfyUI's prompt format.
   * This is the adapter boundary — we translate, not couple.
   */
  private workflowToPrompt(workflow: any): Record<string, any> {
    const prompt: Record<string, any> = {};

    for (const node of workflow.nodes || []) {
      prompt[node.id] = {
        class_type: node.type,
        inputs: node.inputs || {},
      };
    }

    // Add links
    for (const link of workflow.links || []) {
      const targetNode = prompt[link.toNode];
      if (targetNode) {
        targetNode.inputs[link.toInput] = [link.fromNode, link.fromOutput];
      }
    }

    return prompt;
  }

  private async pollExecution(
    promptId: string,
    timeoutMs: number
  ): Promise<{ success: boolean; outputs: ExecutionOutput[]; error?: any }> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const history = await this.apiFetch(`/history/${promptId}`);
        const entry = history[promptId];

        if (entry?.status?.completed) {
          const outputs: ExecutionOutput[] = [];
          for (const [nodeId, nodeOutput] of Object.entries(entry.outputs || {})) {
            const output = nodeOutput as any;
            for (const img of output.images || []) {
              outputs.push({
                type: "image",
                path: img.filename ? `${this.apiBase}/view?filename=${img.filename}&subfolder=${img.subfolder || ""}&type=${img.type || "output"}` : "",
                metadata: { filename: img.filename, subfolder: img.subfolder },
              });
            }
          }
          return { success: true, outputs };
        }

        if (entry?.status?.status_str === "error") {
          return {
            success: false,
            outputs: [],
            error: {
              code: "WORKFLOW_ERROR",
              message: "ComfyUI execution failed",
              details: entry.status,
              recoverable: true,
              timestamp: new Date(),
            },
          };
        }
      } catch {
        // Keep polling
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return {
      success: false,
      outputs: [],
      error: {
        code: "TIMEOUT",
        message: `Execution timed out after ${timeoutMs / 1000}s`,
        recoverable: true,
        timestamp: new Date(),
      },
    };
  }
}

