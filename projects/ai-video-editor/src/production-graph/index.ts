/**
 * AI Creative OS - Production Graph & Planner
 * 
 * The Production Graph is a Directed Acyclic Graph (DAG) that represents
 * the complete production workflow. Independent branches execute in parallel.
 */

import type {
  ProductionNode, ProductionEdge, ProductionGraph,
  CreativeSpecification, UniqueId, TaskStatus, Duration,
  CapabilityDomain,
} from "../types/index.js";
import { Logger, EventBus, generateId, timestamp } from "../core/index.js";

// ─── Production Graph Engine ─────────────────────────────────────────────────

export class ProductionGraphEngine {
  private logger = new Logger("ProductionGraph");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Create a new production graph.
   */
  create(name: string): ProductionGraph {
    return {
      id: generateId(),
      name,
      nodes: [],
      edges: [],
      status: "queued",
    };
  }

  /**
   * Add a node to the graph.
   */
  addNode(graph: ProductionGraph, node: Omit<ProductionNode, "status" | "retries" | "maxRetries">): ProductionNode {
    const fullNode: ProductionNode = {
      ...node,
      status: "queued",
      retries: 0,
      maxRetries: 3,
    };
    graph.nodes.push(fullNode);
    return fullNode;
  }

  /**
   * Add an edge (dependency) between nodes.
   */
  addEdge(graph: ProductionGraph, from: UniqueId, to: UniqueId, type: ProductionEdge["type"] = "dependency"): void {
    // Validate no circular dependency
    if (this.wouldCreateCycle(graph, from, to)) {
      this.logger.error(`Cycle detected: ${from} -> ${to}`);
      return;
    }
    graph.edges.push({ from, to, type });
  }

  /**
   * Validate the graph (no cycles, all edges reference valid nodes).
   */
  validate(graph: ProductionGraph): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.from)) errors.push(`Edge references non-existent node: ${edge.from}`);
      if (!nodeIds.has(edge.to)) errors.push(`Edge references non-existent node: ${edge.to}`);
    }

    if (this.hasCycle(graph)) {
      errors.push("Graph contains a cycle");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get execution order using topological sort.
   */
  getExecutionOrder(graph: ProductionGraph): UniqueId[][] {
    const levels: UniqueId[][] = [];
    const inDegree = new Map<UniqueId, number>();
    const adjacency = new Map<UniqueId, UniqueId[]>();

    for (const node of graph.nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of graph.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
      adjacency.get(edge.from)?.push(edge.to);
    }

    // BFS topological sort
    let queue = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);

    while (queue.length > 0) {
      levels.push([...queue]);
      const nextQueue: UniqueId[] = [];
      for (const nodeId of queue) {
        for (const neighbor of adjacency.get(nodeId) ?? []) {
          const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) nextQueue.push(neighbor);
        }
      }
      queue = nextQueue;
    }

    return levels;
  }

  /**
   * Get nodes that are ready to execute (all dependencies satisfied).
   */
  getReadyNodes(graph: ProductionGraph): ProductionNode[] {
    const completed = new Set(
      graph.nodes.filter((n) => n.status === "completed").map((n) => n.id),
    );

    return graph.nodes.filter((node) => {
      if (node.status !== "queued" && node.status !== "failed") return false;

      const deps = graph.edges.filter((e) => e.to === node.id);
      return deps.every((d) => completed.has(d.from));
    });
  }

  /**
   * Mark a node as completed.
   */
  completeNode(graph: ProductionGraph, nodeId: UniqueId): void {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.status = "completed";
      node.completedAt = Date.now();
    }
  }

  /**
   * Mark a node as failed.
   */
  failNode(graph: ProductionGraph, nodeId: UniqueId, error: string): void {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.status = "failed";
      node.error = error;
    }
  }

  /**
   * Calculate total estimated duration.
   */
  estimateDuration(graph: ProductionGraph): Duration {
    const levels = this.getExecutionOrder(graph);
    let total = 0;
    for (const level of levels) {
      const levelDuration = level.reduce((max, nodeId) => {
        const node = graph.nodes.find((n) => n.id === nodeId);
        return Math.max(max, node?.estimatedDuration ?? 5000);
      }, 0);
      total += levelDuration;
    }
    return total;
  }

  /**
   * Get execution progress.
   */
  getProgress(graph: ProductionGraph): { total: number; completed: number; failed: number; percentage: number } {
    const total = graph.nodes.length;
    const completed = graph.nodes.filter((n) => n.status === "completed").length;
    const failed = graph.nodes.filter((n) => n.status === "failed").length;
    return { total, completed, failed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }

  private wouldCreateCycle(graph: ProductionGraph, from: UniqueId, to: UniqueId): boolean {
    const visited = new Set<UniqueId>();
    const queue = [to];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === from) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of graph.edges) {
        if (edge.from === current) queue.push(edge.to);
      }
    }
    return false;
  }

  private hasCycle(graph: ProductionGraph): boolean {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<UniqueId, number>();
    for (const node of graph.nodes) color.set(node.id, WHITE);

    const dfs = (nodeId: UniqueId): boolean => {
      color.set(nodeId, GRAY);
      for (const edge of graph.edges) {
        if (edge.from === nodeId) {
          const neighborColor = color.get(edge.to) ?? WHITE;
          if (neighborColor === GRAY) return true;
          if (neighborColor === WHITE && dfs(edge.to)) return true;
        }
      }
      color.set(nodeId, BLACK);
      return false;
    };

    for (const node of graph.nodes) {
      if (color.get(node.id) === WHITE && dfs(node.id)) return true;
    }
    return false;
  }
}

// ─── Production Planner ──────────────────────────────────────────────────────

export interface ProductionPlan {
  graph: ProductionGraph;
  estimatedDuration: Duration;
  estimatedVRAM: number;
  estimatedRAM: number;
  parallelizableGroups: UniqueId[][];
  warnings: string[];
}

export class ProductionPlanner {
  private graphEngine: ProductionGraphEngine;
  private logger = new Logger("ProductionPlanner");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.graphEngine = new ProductionGraphEngine(eventBus);
  }

  /**
   * Create a production plan from a CreativeSpecification.
   */
  async plan(spec: CreativeSpecification): Promise<ProductionPlan> {
    this.logger.info("Creating production plan...");
    const graph = this.graphEngine.create(`Production: ${spec.style} ${spec.platform}`);

    // Phase 1: Script & Story
    const scriptNode = this.graphEngine.addNode(graph, {
      id: generateId(), type: "script", name: "Script Generation",
      capability: "cap.script", inputs: [], outputs: ["script"],
      config: { duration: spec.duration, style: spec.style },
      estimatedDuration: 10000,
    });

    const storyboardNode = this.graphEngine.addNode(graph, {
      id: generateId(), type: "storyboard", name: "Storyboard Generation",
      capability: "cap.storyboard", inputs: ["script"], outputs: ["storyboard"],
      config: { scenes: spec.storyStructure.scenes.length },
      estimatedDuration: 15000,
    });
    this.graphEngine.addEdge(graph, scriptNode.id, storyboardNode.id);

    // Phase 2: Asset Generation (parallel)
    const assetNodes: UniqueId[] = [];

    if (spec.visualStyle.references?.length) {
      const charNode = this.graphEngine.addNode(graph, {
        id: generateId(), type: "character_design", name: "Character Design",
        capability: "cap.img_gen", inputs: ["script"], outputs: ["characters"],
        config: {}, estimatedDuration: 30000,
      });
      this.graphEngine.addEdge(graph, scriptNode.id, charNode.id);
      assetNodes.push(charNode.id);
    }

    const bgNode = this.graphEngine.addNode(graph, {
      id: generateId(), type: "background", name: "Background Generation",
      capability: "cap.img_gen", inputs: ["storyboard"], outputs: ["backgrounds"],
      config: { count: spec.storyStructure.scenes.length },
      estimatedDuration: 25000,
    });
    this.graphEngine.addEdge(graph, storyboardNode.id, bgNode.id);
    assetNodes.push(bgNode.id);

    // Phase 3: Animation (depends on assets)
    const animNode = this.graphEngine.addNode(graph, {
      id: generateId(), type: "animation", name: "Video Generation",
      capability: "cap.t2v", inputs: ["characters", "backgrounds"], outputs: ["raw_clips"],
      config: { fps: spec.fps, resolution: spec.resolution },
      estimatedDuration: 120000,
    });
    for (const assetId of assetNodes) {
      this.graphEngine.addEdge(graph, assetId, animNode.id);
    }

    // Phase 4: Audio (parallel with animation in some cases)
    const audioNodes: UniqueId[] = [];
    if (spec.audio.music !== "none") {
      const musicNode = this.graphEngine.addNode(graph, {
        id: generateId(), type: "music", name: "Music Generation",
        capability: "cap.audio_editing", inputs: ["script"], outputs: ["music"],
        config: { duration: spec.duration, mood: spec.style },
        estimatedDuration: 20000,
      });
      audioNodes.push(musicNode.id);
    }

    if (spec.audio.voiceover) {
      const voiceNode = this.graphEngine.addNode(graph, {
        id: generateId(), type: "voiceover", name: "Voice Generation",
        capability: "cap.tts", inputs: ["script"], outputs: ["voice"],
        config: {}, estimatedDuration: 15000,
      });
      audioNodes.push(voiceNode.id);
    }

    // Phase 5: Editing
    const editNode = this.graphEngine.addNode(graph, {
      id: generateId(), type: "editing", name: "Timeline Editing",
      capability: "cap.timeline_editing", inputs: ["raw_clips"], outputs: ["edited_timeline"],
      config: { pacing: spec.pacing, transitions: spec.animation.transitions },
      estimatedDuration: 30000,
    });
    this.graphEngine.addEdge(graph, animNode.id, editNode.id);

    // Phase 6: Compositing
    const compNode = this.graphEngine.addNode(graph, {
      id: generateId(), type: "compositing", name: "Compositing",
      capability: "cap.compositing", inputs: ["edited_timeline"], outputs: ["composited"],
      config: { effects: spec.effects },
      estimatedDuration: 20000,
    });
    this.graphEngine.addEdge(graph, editNode.id, compNode.id);

    // Phase 7: Color
    const colorNode = this.graphEngine.addNode(graph, {
      id: generateId(), type: "color", name: "Color Grading",
      capability: "cap.color_grading", inputs: ["composited"], outputs: ["colored"],
      config: spec.color as unknown as Record<string, unknown>,
      estimatedDuration: 15000,
    });
    this.graphEngine.addEdge(graph, compNode.id, colorNode.id);

    // Phase 8: Captions
    if (spec.captions.enabled) {
      const captionNode = this.graphEngine.addNode(graph, {
        id: generateId(), type: "captions", name: "Caption Generation",
        capability: "cap.subtitles", inputs: ["colored", "voice"], outputs: ["captioned"],
        config: spec.captions as unknown as Record<string, unknown>,
        estimatedDuration: 10000,
      });
      this.graphEngine.addEdge(graph, colorNode.id, captionNode.id);
      if (audioNodes.length > 0) {
        for (const audioId of audioNodes) {
          this.graphEngine.addEdge(graph, audioId, captionNode.id);
        }
      }

      // Phase 9: Render
      const renderNode = this.graphEngine.addNode(graph, {
        id: generateId(), type: "render", name: "Final Render",
        capability: "cap.render", inputs: ["captioned"], outputs: ["final"],
        config: { format: "mp4", quality: spec.qualityTarget },
        estimatedDuration: 45000,
      });
      this.graphEngine.addEdge(graph, captionNode.id, renderNode.id);
    } else {
      const renderNode = this.graphEngine.addNode(graph, {
        id: generateId(), type: "render", name: "Final Render",
        capability: "cap.render", inputs: ["colored"], outputs: ["final"],
        config: { format: "mp4", quality: spec.qualityTarget },
        estimatedDuration: 45000,
      });
      this.graphEngine.addEdge(graph, colorNode.id, renderNode.id);
    }

    // Validate
    const validation = this.graphEngine.validate(graph);
    if (!validation.valid) {
      this.logger.warn("Graph validation warnings:", validation.errors);
    }

    const parallelGroups = this.graphEngine.getExecutionOrder(graph);
    const estimatedDuration = this.graphEngine.estimateDuration(graph);

    return {
      graph,
      estimatedDuration,
      estimatedVRAM: 8 * 1024 * 1024 * 1024, // Default estimate
      estimatedRAM: 8 * 1024 * 1024 * 1024,
      parallelizableGroups: parallelGroups,
      warnings: validation.errors,
    };
  }
}
