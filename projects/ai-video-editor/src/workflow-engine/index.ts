/**
 * AI Creative OS - Workflow Engine
 * Composes dynamic workflows and executes them.
 */

import type {
  WorkflowDefinition, WorkflowNode, WorkflowEdge,
  UniqueId, TaskStatus, Score,
} from "../types/index.js";
import { Logger, EventBus, generateId } from "../core/index.js";

export class WorkflowComposer {
  private logger = new Logger("WorkflowComposer");
  private eventBus: EventBus;
  private definitions = new Map<UniqueId, WorkflowDefinition>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  register(definition: WorkflowDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  get(id: UniqueId): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  getAll(): WorkflowDefinition[] {
    return [...this.definitions.values()];
  }

  /**
   * Compose a workflow from required capabilities.
   * Dynamically selects nodes based on available providers.
   */
  compose(
    requiredCapabilities: UniqueId[],
    availableProviders: { id: UniqueId; capabilities: UniqueId[]; score: Score }[],
  ): WorkflowDefinition {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];

    // Simple sequential composition
    let prevNodeId: UniqueId | null = null;

    for (const capId of requiredCapabilities) {
      // Find best provider for this capability
      const bestProvider = availableProviders
        .filter((p) => p.capabilities.includes(capId))
        .sort((a, b) => b.score - a.score)[0];

      if (!bestProvider) {
        this.logger.warn(`No provider available for capability: ${capId}`);
        continue;
      }

      const node: WorkflowNode = {
        id: generateId(),
        type: capId,
        name: `Node: ${capId}`,
        provider: bestProvider.id,
        config: {},
        inputs: prevNodeId ? [prevNodeId] : [],
        outputs: [],
      };

      nodes.push(node);

      if (prevNodeId) {
        edges.push({ from: prevNodeId, fromPort: "output", to: node.id, toPort: "input" });
      }

      prevNodeId = node.id;
    }

    // Connect output ports
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].outputs.push(nodes[i + 1].id);
    }

    return {
      id: generateId(),
      name: "Dynamic Workflow",
      version: "1.0.0",
      nodes,
      edges,
      provider: nodes[0]?.provider ?? "none",
      models: [],
      inputs: nodes[0] ? [{ name: "input", type: "any", required: true }] : [],
      outputs: nodes.length > 0 ? [{ name: "output", type: "any" }] : [],
      hardware: {},
      license: {
        softwareLicense: "unknown" as any,
        softwareLicenseScope: "unknown" as any,
        commercialUse: true,
        redistribution: false,
        modification: false,
      },
      dependencies: [],
      quality: 75,
      speed: 75,
      status: "integrated" as any,
    };
  }

  /**
   * Validate a workflow definition.
   */
  validate(workflow: WorkflowDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(workflow.nodes.map((n) => n.id));

    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.from)) errors.push(`Edge references unknown node: ${edge.from}`);
      if (!nodeIds.has(edge.to)) errors.push(`Edge references unknown node: ${edge.to}`);
    }

    return { valid: errors.length === 0, errors };
  }
}

export class WorkflowExecutor {
  private logger = new Logger("WorkflowExecutor");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Execute a workflow. This is the basic sequential executor.
   * Parallel execution is handled by the Production Graph.
   */
  async execute(workflow: WorkflowDefinition): Promise<{
    success: boolean;
    outputs: Record<UniqueId, unknown>;
    errors: string[];
  }> {
    const outputs: Record<UniqueId, unknown> = {};
    const errors: string[] = [];

    this.logger.info(`Executing workflow: ${workflow.name}`);

    // Execute nodes in order (topological)
    const visited = new Set<UniqueId>();

    for (const node of workflow.nodes) {
      if (visited.has(node.id)) continue;

      this.logger.debug(`Executing node: ${node.name} (${node.provider})`);
      try {
        // In a real implementation, this would call the provider adapter
        outputs[node.id] = { status: "completed", provider: node.provider };
        visited.add(node.id);
        await this.eventBus.emit("WORKFLOW_NODE_COMPLETED", "WorkflowExecutor", {
          nodeId: node.id,
          provider: node.provider,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Node ${node.name} failed: ${msg}`);
        this.logger.error(`Node failed: ${node.name}`, err);
      }
    }

    const success = errors.length === 0;
    await this.eventBus.emit(
      success ? "WORKFLOW_COMPLETED" : "WORKFLOW_FAILED",
      "WorkflowExecutor",
      { workflowId: workflow.id, success },
    );

    return { success, outputs, errors };
  }

  /**
   * Simulate workflow execution without actually running it.
   */
  simulate(workflow: WorkflowDefinition): {
    valid: boolean;
    estimatedTime: number;
    vramRequired: number;
    ramRequired: number;
    risks: string[];
  } {
    return {
      valid: true,
      estimatedTime: workflow.nodes.length * 15000,
      vramRequired: 8 * 1024 * 1024 * 1024,
      ramRequired: 8 * 1024 * 1024 * 1024,
      risks: [],
    };
  }
}
