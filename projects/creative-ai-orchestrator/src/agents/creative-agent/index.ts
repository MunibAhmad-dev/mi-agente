// ============================================================================
// Creative Agent
// ============================================================================
// The main AI agent that receives user intent and orchestrates the full
// creative pipeline: understand → plan → discover → build → execute →
// evaluate → improve → learn.
// ============================================================================

import path from "node:path";
import type {
  ProjectId,
  HardwareProfile,
  LLMProvider,
  DiscoveredResource,
  CaioError,
} from "../../core/types/index.js";
import { EventType, AutonomyLevel, OperationMode, ErrorCode } from "../../core/types/index.js";
import { EventBus } from "../../core/events/index.js";
import { MemorySystem } from "../../memory/index.js";
import { GitHubDiscoveryProvider } from "../../discovery/github/provider.js";
import { HuggingFaceDiscoveryProvider } from "../../discovery/huggingface/provider.js";
import { CivitaiDiscoveryProvider } from "../../discovery/civitai/provider.js";
import { LicenseEngine } from "../../discovery/license/engine.js";
import { CompatibilityEngine } from "../../discovery/compatibility/engine.js";
import { calculateResourceScore, rankResources } from "../../discovery/ranking/index.js";
import { CaioDatabase } from "../../core/database/index.js";
import type { CaioConfig } from "../../core/types/index.js";

// ---------------------------------------------------------------------------
// Agent Step
// ---------------------------------------------------------------------------

export interface AgentStep {
  id: string;
  type: "understand" | "plan" | "discover" | "select" | "install" | "build" | "execute" | "observe" | "evaluate" | "improve" | "learn";
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: CaioError;
  startTime?: Date;
  endTime?: Date;
}

export interface AgentPlan {
  goal: string;
  requiredCapabilities: string[];
  steps: AgentStep[];
  estimatedResources: { vramMb?: number; ramMb?: number; storageMb?: number };
  mode: OperationMode;
}

export interface AgentExecutionResult {
  success: boolean;
  plan: AgentPlan;
  completedSteps: AgentStep[];
  outputs: Array<{ type: string; path: string; metadata?: Record<string, unknown> }>;
  qualityScore?: number;
  improvements: string[];
  errors: CaioError[];
}

// ---------------------------------------------------------------------------
// Creative Agent
// ---------------------------------------------------------------------------

export class CreativeAgent {
  private github: GitHubDiscoveryProvider;
  private huggingface: HuggingFaceDiscoveryProvider;
  private civitai: CivitaiDiscoveryProvider;
  private licenseEngine: LicenseEngine;
  private compatibilityEngine: CompatibilityEngine;
  private maxSteps = 30;
  private maxRetries = 3;

  constructor(
    private db: CaioDatabase,
    private config: CaioConfig,
    private eventBus: EventBus,
    private memory: MemorySystem,
    private getHardware: () => HardwareProfile,
    private llm: { complete: (req: any, task?: any) => Promise<any> }
  ) {
    this.github = new GitHubDiscoveryProvider(config);
    this.huggingface = new HuggingFaceDiscoveryProvider(config);
    this.civitai = new CivitaiDiscoveryProvider(config);
    this.licenseEngine = new LicenseEngine();
    this.compatibilityEngine = new CompatibilityEngine();
  }

  /**
   * Process a high-level user intent.
   */
  async processIntent(
    intent: string,
    projectId?: ProjectId,
    options?: {
      mode?: OperationMode;
      autonomyLevel?: AutonomyLevel;
    }
  ): Promise<AgentExecutionResult> {
    const plan = await this.understandAndPlan(intent, projectId, options);

    const completedSteps: AgentStep[] = [];
    const outputs: AgentExecutionResult["outputs"] = [];
    const improvements: string[] = [];
    const errors: CaioError[] = [];

    for (const step of plan.steps) {
      if (completedSteps.length >= this.maxSteps) {
        break;
      }

      step.startTime = new Date();
      step.status = "running";

      await this.eventBus.emit({
        type: EventType.AgentStepStarted,
        projectId,
        data: { stepType: step.type, stepId: step.id },
      });

      try {
        const result = await this.executeStep(step, plan, projectId);

        step.status = "completed";
        step.output = result;
        step.endTime = new Date();

        await this.eventBus.emit({
          type: EventType.AgentStepCompleted,
          projectId,
          data: { stepType: step.type, stepId: step.id, duration: step.endTime.getTime() - step.startTime.getTime() },
        });

        // Collect outputs
        if (result?.outputs) {
          outputs.push(...result.outputs);
        }
        if (result?.improvement) {
          improvements.push(result.improvement);
        }
      } catch (err) {
        step.status = "failed";
        step.error = {
          code: ErrorCode.ResourceError,
          message: err instanceof Error ? err.message : String(err),
          recoverable: true,
          timestamp: new Date(),
        };
        step.endTime = new Date();
        if (step.error) errors.push(step.error);

        await this.eventBus.emit({
          type: EventType.AgentStepFailed,
          projectId,
          data: { stepType: step.type, stepId: step.id, error: step.error?.message },
        });

        // If critical step fails, stop
        if (step.error && !step.error.recoverable) break;
      }

      completedSteps.push(step);
    }

    // Store learning
    await this.storeLearning(projectId, plan, completedSteps);

    return {
      success: errors.length === 0 || outputs.length > 0,
      plan,
      completedSteps,
      outputs,
      improvements,
      errors,
    };
  }

  /**
   * Understand intent and create a plan using LLM.
   */
  private async understandAndPlan(
    intent: string,
    projectId?: ProjectId,
    options?: { mode?: OperationMode; autonomyLevel?: AutonomyLevel }
  ): Promise<AgentPlan> {
    const hw = this.getHardware();
    const mode = (options?.mode || OperationMode.Balanced) as OperationMode;

    // Use LLM to parse intent into structured requirements
    const systemPrompt = `You are a creative AI planning assistant. Analyze the user's intent and produce a JSON plan.
Available hardware: ${JSON.stringify({ gpu: hw.gpus.map((g) => g.name + ' (' + g.vramMb + 'MB VRAM)'), ram: hw.ramMb + 'MB', os: hw.os })}
Mode: ${mode}

Respond ONLY with valid JSON matching this structure:
{
  "goal": "concise goal description",
  "requiredCapabilities": ["capability1", "capability2"],
  "steps": [
    {"type": "discover", "description": "...", "query": "..."},
    {"type": "select", "description": "..."},
    {"type": "build", "description": "..."},
    {"type": "execute", "description": "..."}
  ],
  "estimatedResources": {"vramMb": 0, "ramMb": 0}
}

Available step types: understand, plan, discover, select, install, build, execute, observe, evaluate, improve, learn`;

    const response = await this.llm.complete(
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: intent },
        ],
        maxTokens: 2000,
        temperature: 0.3,
      },
      "complex"
    );

    let planData: any;
    try {
      // Extract JSON from response
      const content = response.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        planData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON in LLM response");
      }
    } catch {
      // Fallback: create a basic plan
      planData = {
        goal: intent,
        requiredCapabilities: ["image_generation"],
        steps: [
          { type: "discover", description: "Search for solutions", query: intent },
          { type: "select", description: "Select best option" },
          { type: "build", description: "Build workflow" },
          { type: "execute", description: "Execute workflow" },
          { type: "evaluate", description: "Evaluate result" },
        ],
        estimatedResources: {},
      };
    }

    return {
      goal: planData.goal || intent,
      requiredCapabilities: planData.requiredCapabilities || [],
      steps: (planData.steps || []).map((s: any, i: number) => ({
        id: `step-${i}`,
        type: s.type || "discover",
        status: "pending" as const,
        input: s,
      })),
      estimatedResources: planData.estimatedResources || {},
      mode,
    };
  }

  /**
   * Execute a single agent step.
   */
  private async executeStep(
    step: AgentStep,
    plan: AgentPlan,
    projectId?: ProjectId
  ): Promise<any> {
    switch (step.type) {
      case "discover":
        return this.executeDiscover(step, plan, projectId);
      case "select":
        return this.executeSelect(step, plan);
      case "install":
        return this.executeInstall(step, plan);
      case "build":
        return this.executeBuild(step, plan);
      case "execute":
        return this.executeRun(step, plan, projectId);
      case "evaluate":
        return this.executeEvaluate(step, plan);
      case "observe":
        return this.executeObserve(step, plan);
      default:
        return { message: `Step type '${step.type}' acknowledged` };
    }
  }

  private async executeDiscover(step: AgentStep, plan: AgentPlan, projectId?: ProjectId): Promise<any> {
    const query = (step.input as any).query || plan.goal;
    const hw = this.getHardware();

    // Search across multiple providers in parallel
    const [githubResults, hfResults, civitaiResults] = await Promise.allSettled([
      this.github.search(query, { limit: 10 }),
      this.huggingface.searchModels(query, { limit: 10 }),
      this.civitai.search(query, { limit: 10 }),
    ]);

    const allResources: DiscoveredResource[] = [];
    if (githubResults.status === "fulfilled") allResources.push(...githubResults.value.results);
    if (hfResults.status === "fulfilled") allResources.push(...hfResults.value.results);
    if (civitaiResults.status === "fulfilled") allResources.push(...civitaiResults.value.results);

    // Rank results
    const ranked = rankResources(allResources, hw);

    // Check licenses and compatibility for top results
    for (const item of ranked.slice(0, 10)) {
      const compat = this.compatibilityEngine.checkCompatibility(item.resource, hw);
      item.score.compatibility = compat.overall === "green" ? 95 : compat.overall === "yellow" ? 60 : 20;
    }

    return {
      resources: ranked.slice(0, 10),
      totalFound: allResources.length,
      improvement: `Discovered ${allResources.length} potential resources across ${[githubResults, hfResults, civitaiResults].filter((r) => r.status === "fulfilled").length} providers`,
    };
  }

  private async executeSelect(step: AgentStep, plan: AgentPlan): Promise<any> {
    const prevStep = this.findStepOutput(plan, step, "discover");
    const resources = prevStep?.resources || [];
    if (resources.length === 0) return { selected: false, message: "No resources to select from" };

    // Use LLM to select the best option
    const resourceList = resources.slice(0, 5).map((r: any, i: number) =>
      `${i + 1}. ${r.resource?.name || r.name || 'Unknown'} (${r.resource?.source || r.source}) - Score: ${r.score?.overall || r.overallScore || 0}`
    ).join("\n");

    const response = await this.llm.complete(
      {
        messages: [
          { role: "system", content: `You are a resource selection assistant. Select the best option from the list. Respond with just the number (1-${Math.min(5, resources.length)}).` },
          { role: "user", content: `Goal: ${plan.goal}\n\nOptions:\n${resourceList}` },
        ],
        maxTokens: 100,
        temperature: 0.1,
      },
      "simple"
    );

    const selection = parseInt(response.content.trim()) || 1;
    const selected = resources[Math.min(selection - 1, resources.length - 1)];
    return { selected: true, resource: selected, message: `Selected: ${selected?.resource?.name || selected?.name}` };
  }

  private async executeInstall(step: AgentStep, plan: AgentPlan): Promise<any> {
    const selectedResource = this.findPreviousOutput(step, plan, "select");
    const resource = selectedResource?.resource;
    if (!resource) return { installed: false, message: "No resource selected to install" };

    // Check if it's a GitHub repo — clone it
    if (resource.url?.includes("github.com")) {
      const { execSync } = await import("node:child_process");
      try {
        const cloneDir = path.join(this.config.dataDir, "installed", resource.name || "project");
        execSync(`git clone --depth 1 "${resource.url}" "${cloneDir}"`, { timeout: 120000, stdio: "pipe" });
        return { installed: true, path: cloneDir, message: `Cloned ${resource.name}` };
      } catch (err: any) {
        return { installed: false, error: err.message };
      }
    }

    // For models — just register them
    return { installed: true, message: `Registered ${resource.name} for download` };
  }

  private async executeBuild(step: AgentStep, plan: AgentPlan): Promise<any> {
    // Use plan's resources if available
    const requiredCaps = plan.requiredCapabilities || [];
    const hasImageGen = requiredCaps.some((c: string) => c.includes("image") || c.includes("img"));

    // Build a workflow based on the capabilities needed
    const nodes: any[] = [];
    const links: any[] = [];
    let nodeId = 1;

    if (hasImageGen) {
      nodes.push(
        { id: String(nodeId), type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors" }, position: [0, 0] },
        { id: String(nodeId + 1), type: "CLIPTextEncode", inputs: { text: plan.goal }, position: [300, 0] },
        { id: String(nodeId + 2), type: "CLIPTextEncode", inputs: { text: "low quality, blurry" }, position: [300, 200] },
        { id: String(nodeId + 3), type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 }, position: [300, 400] },
        { id: String(nodeId + 4), type: "KSampler", inputs: { steps: 20, cfg: 7, sampler_name: "euler", scheduler: "normal", seed: Math.floor(Math.random() * 999999) }, position: [600, 0] },
        { id: String(nodeId + 5), type: "VAEDecode", inputs: {}, position: [900, 0] },
        { id: String(nodeId + 6), type: "SaveImage", inputs: { filename_prefix: "caio_output" }, position: [1200, 0] }
      );
      links.push(
        { fromNode: String(nodeId), fromOutput: 0, toNode: String(nodeId + 4), toInput: "model" },
        { fromNode: String(nodeId + 1), fromOutput: 0, toNode: String(nodeId + 4), toInput: "positive" },
        { fromNode: String(nodeId + 2), fromOutput: 0, toNode: String(nodeId + 4), toInput: "negative" },
        { fromNode: String(nodeId + 3), fromOutput: 0, toNode: String(nodeId + 4), toInput: "latent_image" },
        { fromNode: String(nodeId + 4), fromOutput: 0, toNode: String(nodeId + 5), toInput: "samples" },
        { fromNode: String(nodeId), fromOutput: 1, toNode: String(nodeId + 5), toInput: "vae" },
        { fromNode: String(nodeId + 5), fromOutput: 0, toNode: String(nodeId + 6), toInput: "images" }
      );
    }

    return { built: true, workflow: { nodes, links }, message: `Built workflow with ${nodes.length} nodes` };
  }

  private async executeRun(step: AgentStep, plan: AgentPlan, projectId?: ProjectId): Promise<any> {
    const buildOutput = this.findPreviousOutput(step, plan, "build");
    if (!buildOutput?.workflow) return { executed: false, outputs: [], error: "No workflow built" };

    // Try to execute via ComfyUI if available
    const comfyUrl = "http://127.0.0.1:8188";
    try {
      const res = await fetch(`${comfyUrl}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildOutput.workflow }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as any;
        return { executed: true, promptId: data.prompt_id, outputs: [] };
      }
    } catch {
      // ComfyUI not running — that's expected
    }

    // Store the workflow for later execution
    return { executed: false, outputs: [], message: "ComfyUI not running. Workflow saved for later execution.", workflow: buildOutput.workflow };
  }

  private async executeEvaluate(step: AgentStep, plan: AgentPlan): Promise<any> {
    const runOutput = this.findPreviousOutput(step, plan, "execute");
    if (!runOutput?.outputs || runOutput.outputs.length === 0) {
      return { evaluated: true, score: 0, message: "No outputs to evaluate" };
    }

    // Use LLM to evaluate the plan's success
    const response = await this.llm.complete(
      {
        messages: [
          { role: "system", content: "You are an evaluation assistant. Rate the execution success 0-100 based on the outputs and goals. Respond with just the number." },
          { role: "user", content: `Goal: ${plan.goal}\nOutputs: ${JSON.stringify(runOutput.outputs)}\nCompleted steps: ${plan.steps.filter(s => s.status === 'completed').length}/${plan.steps.length}` },
        ],
        maxTokens: 100,
        temperature: 0.1,
      },
      "simple"
    );

    const score = parseInt(response.content.trim()) || 50;
    return { evaluated: true, score, message: `Quality score: ${score}/100` };
  }

  private async executeObserve(step: AgentStep, plan: AgentPlan): Promise<any> {
    const evalOutput = this.findPreviousOutput(step, plan, "evaluate");
    const score = evalOutput?.score || 0;
    const issues: string[] = [];

    if (score < 50) issues.push("Low quality score — consider retrying with different parameters");
    if (score < 70) issues.push("Below target — suggest improving prompts or model selection");
    if (score >= 90) issues.push("Excellent quality — consider saving as template");

    return { observed: true, score, issues, suggestion: score < 70 ? "improve" : "complete" };
  }

  /**
   * Find a previous step's output by step type.
   */
  private findStepOutput(plan: AgentPlan, currentStep: AgentStep, stepType: string): any {
    const idx = plan.steps.findIndex(s => s.id === currentStep.id);
    for (let i = idx - 1; i >= 0; i--) {
      const s = plan.steps[i];
      if (s && s.type === stepType && s.output) return s.output;
    }
    return null;
  }

  /**
   * Find output from any previous step (used by steps that need earlier outputs).
   */
  private findPreviousOutput(currentStep: AgentStep, plan: AgentPlan, stepType: string): any {
    const idx = plan.steps.findIndex(s => s.id === currentStep.id);
    for (let i = idx - 1; i >= 0; i--) {
      const s = plan.steps[i];
      if (s && s.type === stepType && s.output) return s.output;
    }
    return null;
  }

  private async storeLearning(projectId: ProjectId | undefined, plan: AgentPlan, steps: AgentStep[]): Promise<void> {
    const success = steps.every((s) => s.status === "completed");
    this.memory.store({
      projectId,
      type: "long_term",
      category: "agent_execution",
      content: `Plan: ${plan.goal} | Steps: ${steps.length} | Success: ${success}`,
      metadata: { planGoal: plan.goal, stepCount: steps.length, success },
      relevance: success ? 0.8 : 0.3,
    });
  }
}
