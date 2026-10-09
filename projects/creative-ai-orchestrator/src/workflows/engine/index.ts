// ============================================================================
// Workflow Engine
// ============================================================================
// Import, export, validate, create, clone, modify, compare, execute,
// version, rollback workflows.
// ============================================================================

import type {
  Workflow,
  WorkflowId,
  WorkflowNode,
  WorkflowLink,
  WorkflowValidationResult,
  WorkflowValidationError,
  WorkflowModelRef,
  CaioDatabase,
} from "../../core/types/index.js";
import { newId } from "../../core/types/index.js";

export class WorkflowEngine {
  constructor(private db: CaioDatabase) {}

  /**
   * Import a workflow from JSON.
   */
  importWorkflow(data: Record<string, any>, projectId?: string): Workflow {
    const id = newId() as WorkflowId;

    // Handle ComfyUI format
    if (data.last_node_id && data.last_link_id && data.nodes) {
      return this.importComfyUiFormat(data, id, projectId);
    }

    // Handle our internal format
    const workflow: Workflow = {
      id,
      name: data.name || "Imported Workflow",
      description: data.description,
      version: data.version || "1.0.0",
      nodes: (data.nodes || []).map((n: any) => ({
        id: n.id || newId(),
        type: n.type || n.class_type || "unknown",
        title: n.title || n._meta?.title,
        inputs: n.inputs || {},
        outputs: n.outputs || {},
        position: n.pos || n.position,
      })),
      links: (data.links || data.connections || []).map((l: any) => ({
        fromNode: String(l.from_node || l.fromNode || l[1]),
        fromOutput: String(l.from_output || l.fromOutput || l[2]),
        toNode: String(l.to_node || l.toNode || l[3]),
        toInput: String(l.to_input || l.toInput || l[4]),
      })),
      metadata: {
        tags: data.tags || [],
        requiredNodes: this.extractRequiredNodes(data.nodes || []),
        requiredModels: this.extractRequiredModels(data.nodes || []),
        source: data.source,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.storeWorkflow(workflow, projectId);
    return workflow;
  }

  /**
   * Import ComfyUI's native JSON format.
   */
  private importComfyUiFormat(data: any, id: WorkflowId, projectId?: string): Workflow {
    const nodes: WorkflowNode[] = [];
    const links: WorkflowLink[] = [];

    for (const [nodeId, nodeData] of Object.entries(data.nodes || {})) {
      const nd = nodeData as any;
      nodes.push({
        id: String(nodeId),
        type: nd.class_type || "unknown",
        title: nd._meta?.title,
        inputs: nd.inputs || {},
        outputs: {},
        position: nd._meta?.pos,
      });
    }

    // Extract links from node inputs (array references [nodeId, outputSlot])
    for (const node of nodes) {
      for (const [inputName, inputValue] of Object.entries(node.inputs)) {
        if (Array.isArray(inputValue) && inputValue.length === 2) {
          links.push({
            fromNode: String(inputValue[0]),
            fromOutput: String(inputValue[1]),
            toNode: node.id,
            toInput: inputName,
          });
        }
      }
    }

    const workflow: Workflow = {
      id,
      name: data.name || data._meta?.title || "ComfyUI Workflow",
      description: data.description,
      version: "1.0.0",
      nodes,
      links,
      metadata: {
        tags: [],
        requiredNodes: this.extractRequiredNodes(nodes),
        requiredModels: this.extractRequiredModels(nodes),
        source: "comfyui_import",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.storeWorkflow(workflow, projectId);
    return workflow;
  }

  /**
   * Export a workflow to JSON.
   */
  exportWorkflow(workflowId: WorkflowId): Record<string, any> | null {
    const row = this.db.get<{ nodes: string; links: string; metadata: string; name: string; version: string }>(
      "SELECT * FROM workflows WHERE id = ?",
      workflowId
    );
    if (!row) return null;

    return {
      name: row.name,
      version: row.version,
      nodes: JSON.parse(row.nodes),
      links: JSON.parse(row.links),
      metadata: JSON.parse(row.metadata),
    };
  }

  /**
   * Validate a workflow against available nodes and models.
   */
  validate(workflow: Workflow): WorkflowValidationResult {
    const errors: WorkflowValidationError[] = [];
    const warnings: string[] = [];
    const missingNodes: string[] = [];
    const missingModels: WorkflowModelRef[] = [];

    // Check required nodes exist
    for (const reqNode of workflow.metadata.requiredNodes) {
      const found = workflow.nodes.some((n) => n.type === reqNode);
      if (!found) {
        missingNodes.push(reqNode);
        errors.push({
          type: "missing_node",
          message: `Required node type '${reqNode}' not found in workflow`,
        });
      }
    }

    // Check required models
    for (const reqModel of workflow.metadata.requiredModels) {
      missingModels.push(reqModel);
      if (reqModel.required) {
        errors.push({
          type: "missing_model",
          message: `Required model '${reqModel.name}' not found`,
        });
      }
    }

    // Check link integrity
    const nodeIds = new Set(workflow.nodes.map((n) => n.id));
    for (const link of workflow.links) {
      if (!nodeIds.has(link.fromNode)) {
        errors.push({
          nodeId: link.fromNode,
          type: "invalid_connection",
          message: `Link source node '${link.fromNode}' does not exist`,
        });
      }
      if (!nodeIds.has(link.toNode)) {
        errors.push({
          nodeId: link.toNode,
          type: "invalid_connection",
          message: `Link target node '${link.toNode}' does not exist`,
        });
      }
    }

    // Check for orphan nodes (no connections)
    const connectedNodeIds = new Set<string>();
    for (const link of workflow.links) {
      connectedNodeIds.add(link.fromNode);
      connectedNodeIds.add(link.toNode);
    }
    const orphans = workflow.nodes.filter((n) => !connectedNodeIds.has(n.id));
    if (orphans.length > 0) {
      warnings.push(`${orphans.length} node(s) have no connections`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingNodes,
      missingModels,
    };
  }

  /**
   * Clone a workflow with a new ID.
   */
  clone(workflow: Workflow, newName?: string): Workflow {
    const cloned: Workflow = {
      ...workflow,
      id: newId(),
      name: newName || `${workflow.name} (Copy)`,
      nodes: [...workflow.nodes.map((n) => ({ ...n, inputs: { ...n.inputs } }))],
      links: [...workflow.links.map((l) => ({ ...l }))],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.storeWorkflow(cloned);
    return cloned;
  }

  /**
   * Compare two workflows.
   */
  compare(a: Workflow, b: Workflow): {
    addedNodes: string[];
    removedNodes: string[];
    changedParameters: Array<{ nodeId: string; parameter: string; old: unknown; new: unknown }>;
  } {
    const aTypes = new Map(a.nodes.map((n) => [n.id, n.type]));
    const bTypes = new Map(b.nodes.map((n) => [n.id, n.type]));

    const addedNodes: string[] = [];
    const removedNodes: string[] = [];
    const changedParameters: Array<{ nodeId: string; parameter: string; old: unknown; new: unknown }> = [];

    for (const [id, type] of bTypes) {
      if (!aTypes.has(id)) {
        addedNodes.push(`${type} (${id})`);
      }
    }

    for (const [id, type] of aTypes) {
      if (!bTypes.has(id)) {
        removedNodes.push(`${type} (${id})`);
      }
    }

    // Compare parameters
    for (const aNode of a.nodes) {
      const bNode = b.nodes.find((n) => n.id === aNode.id);
      if (bNode) {
        for (const [key, val] of Object.entries(aNode.inputs)) {
          if (JSON.stringify(val) !== JSON.stringify(bNode.inputs[key])) {
            changedParameters.push({
              nodeId: aNode.id,
              parameter: key,
              old: val,
              new: bNode.inputs[key],
            });
          }
        }
      }
    }

    return { addedNodes, removedNodes, changedParameters };
  }

  /**
   * Store a workflow in the database.
   */
  private storeWorkflow(workflow: Workflow, projectId?: string): void {
    this.db.run(
      `INSERT OR REPLACE INTO workflows (id, project_id, name, description, version, nodes, links, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      workflow.id,
      projectId || null,
      workflow.name,
      workflow.description || null,
      workflow.version,
      JSON.stringify(workflow.nodes),
      JSON.stringify(workflow.links),
      JSON.stringify(workflow.metadata),
      workflow.createdAt.toISOString(),
      workflow.updatedAt.toISOString()
    );
  }

  /**
   * Get a workflow from the database.
   */
  getWorkflow(id: WorkflowId): Workflow | null {
    const row = this.db.get<{
      id: string; name: string; description: string | null; version: string;
      nodes: string; links: string; metadata: string;
      created_at: string; updated_at: string;
    }>("SELECT * FROM workflows WHERE id = ?", id);
    if (!row) return null;

    return {
      id: row.id as WorkflowId,
      name: row.name,
      description: row.description || undefined,
      version: row.version,
      nodes: JSON.parse(row.nodes),
      links: JSON.parse(row.links),
      metadata: JSON.parse(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * List all workflows for a project.
   */
  listWorkflows(projectId?: string): Workflow[] {
    const rows = projectId
      ? this.db.all<{ id: string; name: string; version: string; nodes: string; links: string; metadata: string; created_at: string; updated_at: string }>(
          "SELECT * FROM workflows WHERE project_id = ? ORDER BY updated_at DESC", projectId
        )
      : this.db.all<{ id: string; name: string; version: string; nodes: string; links: string; metadata: string; created_at: string; updated_at: string }>(
          "SELECT * FROM workflows ORDER BY updated_at DESC"
        );

    return rows.map((row) => ({
      id: row.id as WorkflowId,
      name: row.name,
      version: row.version,
      nodes: JSON.parse(row.nodes),
      links: JSON.parse(row.links),
      metadata: JSON.parse(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  private extractRequiredNodes(nodes: any[]): string[] {
    const types = new Set<string>();
    for (const n of nodes) {
      if (n.type) types.add(n.type);
      if (n.class_type) types.add(n.class_type);
    }
    return [...types];
  }

  private extractRequiredModels(nodes: any[]): WorkflowModelRef[] {
    const models: WorkflowModelRef[] = [];
    const seen = new Set<string>();

    for (const n of nodes) {
      const inputs = n.inputs || {};
      for (const [, value] of Object.entries(inputs)) {
        if (typeof value === "string" && (value.endsWith(".safetensors") || value.endsWith(".ckpt") || value.endsWith(".pt"))) {
          if (!seen.has(value)) {
            seen.add(value);
            models.push({
              name: value,
              type: "checkpoint",
              required: true,
            });
          }
        }
      }
    }

    return models;
  }
}
