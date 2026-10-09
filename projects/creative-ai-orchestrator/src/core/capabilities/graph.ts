// ============================================================================
// Capability Graph
// ============================================================================
// Maps: goal → capability → model → node → workflow → hardware
// Used by the planner to determine what's needed for a task.
// ============================================================================

export interface CapabilityNode {
  id: string;
  type: "goal" | "capability" | "model" | "node" | "workflow" | "hardware";
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityEdge {
  from: string;
  to: string;
  weight: number;
  required: boolean;
}

// Pre-built capability graph for common creative AI tasks
const BUILTIN_CAPABILITIES: CapabilityNode[] = [
  // Goals
  { id: "goal_image_gen", type: "goal", name: "Image Generation", description: "Generate images from text/prompts" },
  { id: "goal_video_gen", type: "goal", name: "Video Generation", description: "Generate videos from images/text" },
  { id: "goal_upscale", type: "goal", name: "Upscaling", description: "Enhance image resolution" },
  { id: "goal_enhance", type: "goal", name: "Image Enhancement", description: "Improve image quality" },
  { id: "goal_restore", type: "goal", name: "Image Restoration", description: "Restore damaged/old images" },
  { id: "goal_animate", type: "goal", name: "Animation", description: "Animate still images" },
  { id: "goal_style", type: "goal", name: "Style Transfer", description: "Apply artistic styles" },

  // Capabilities
  { id: "cap_txt2img", type: "capability", name: "Text-to-Image" },
  { id: "cap_img2img", type: "capability", name: "Image-to-Image" },
  { id: "cap_img2vid", type: "capability", name: "Image-to-Video" },
  { id: "cap_upscale", type: "capability", name: "Upscaling" },
  { id: "cap_denoise", type: "capability", name: "Denoising" },
  { id: "cap_sharpen", type: "capability", name: "Sharpening" },
  { id: "cap_face_restore", type: "capability", name: "Face Restoration" },
  { id: "cap_inpaint", type: "capability", name: "Inpainting" },
  { id: "cap_controlnet", type: "capability", name: "ControlNet" },
  { id: "cap_lora", type: "capability", name: "LoRA Adaptation" },
  { id: "cap_frame_interp", type: "capability", name: "Frame Interpolation" },
  { id: "cap_temporal", type: "capability", name: "Temporal Consistency" },
  { id: "cap_sr", type: "capability", name: "Super Resolution" },

  // Model types
  { id: "model_checkpoint", type: "model", name: "Checkpoint Model" },
  { id: "model_lora", type: "model", name: "LoRA Model" },
  { id: "model_vae", type: "model", name: "VAE Model" },
  { id: "model_controlnet", type: "model", name: "ControlNet Model" },
  { id: "model_upscaler", type: "model", name: "Upscaler Model" },
  { id: "model_embedding", type: "model", name: "Embedding" },
  { id: "model_video", type: "model", name: "Video Model" },

  // Node types (ComfyUI)
  { id: "node_sampler", type: "node", name: "KSampler" },
  { id: "node_checkpoint", type: "node", name: "CheckpointLoader" },
  { id: "node_lora", type: "node", name: "LoraLoader" },
  { id: "node_vae", type: "node", name: "VAELoader" },
  { id: "node_controlnet", type: "node", name: "ControlNetLoader" },
  { id: "node_upscale", type: "node", name: "UpscaleModelLoader" },
  { id: "node_vae_decode", type: "node", name: "VAEDecode" },
  { id: "node_vae_encode", type: "node", name: "VAEEncode" },
  { id: "node_text_enc", type: "node", name: "CLIPTextEncode" },
  { id: "node_empty_latent", type: "node", name: "EmptyLatentImage" },
  { id: "node_save", type: "node", name: "SaveImage" },
  { id: "node_preview", type: "node", name: "PreviewImage" },
  { id: "node_load_image", type: "node", name: "LoadImage" },
];

const BUILTIN_EDGES: CapabilityEdge[] = [
  // Goal → Capability
  { from: "goal_image_gen", to: "cap_txt2img", weight: 1.0, required: true },
  { from: "goal_upscale", to: "cap_upscale", weight: 1.0, required: true },
  { from: "goal_upscale", to: "cap_sr", weight: 0.8, required: false },
  { from: "goal_enhance", to: "cap_denoise", weight: 0.9, required: false },
  { from: "goal_enhance", to: "cap_sharpen", weight: 0.9, required: false },
  { from: "goal_enhance", to: "cap_face_restore", weight: 0.7, required: false },
  { from: "goal_restore", to: "cap_denoise", weight: 1.0, required: true },
  { from: "goal_restore", to: "cap_sr", weight: 0.8, required: false },
  { from: "goal_animate", to: "cap_img2vid", weight: 1.0, required: true },
  { from: "goal_animate", to: "cap_frame_interp", weight: 0.7, required: false },
  { from: "goal_animate", to: "cap_temporal", weight: 0.7, required: false },
  { from: "goal_style", to: "cap_img2img", weight: 1.0, required: true },

  // Capability → Model
  { from: "cap_txt2img", to: "model_checkpoint", weight: 1.0, required: true },
  { from: "cap_txt2img", to: "model_vae", weight: 0.8, required: false },
  { from: "cap_lora", to: "model_lora", weight: 1.0, required: true },
  { from: "cap_controlnet", to: "model_controlnet", weight: 1.0, required: true },
  { from: "cap_upscale", to: "model_upscaler", weight: 1.0, required: true },
  { from: "cap_img2vid", to: "model_video", weight: 1.0, required: true },

  // Capability → Node
  { from: "cap_txt2img", to: "node_sampler", weight: 1.0, required: true },
  { from: "cap_txt2img", to: "node_checkpoint", weight: 1.0, required: true },
  { from: "cap_txt2img", to: "node_text_enc", weight: 1.0, required: true },
  { from: "cap_txt2img", to: "node_empty_latent", weight: 1.0, required: true },
  { from: "cap_txt2img", to: "node_vae_decode", weight: 1.0, required: true },
  { from: "cap_lora", to: "node_lora", weight: 1.0, required: true },
  { from: "cap_controlnet", to: "node_controlnet", weight: 1.0, required: true },
  { from: "cap_upscale", to: "node_upscale", weight: 1.0, required: true },
  { from: "cap_img2img", to: "node_sampler", weight: 1.0, required: true },
  { from: "cap_img2img", to: "node_vae_encode", weight: 1.0, required: true },
];

export class CapabilityGraph {
  private nodes: Map<string, CapabilityNode> = new Map();
  private edges: CapabilityEdge[] = [];

  constructor() {
    // Load built-in capabilities
    for (const node of BUILTIN_CAPABILITIES) {
      this.nodes.set(node.id, node);
    }
    this.edges.push(...BUILTIN_EDGES);
  }

  /**
   * Get capabilities needed for a goal.
   */
  getCapabilitiesForGoal(goalId: string): CapabilityNode[] {
    const capIds = this.edges
      .filter((e) => e.from === goalId && e.required)
      .map((e) => e.to);
    return capIds.map((id) => this.nodes.get(id)).filter(Boolean) as CapabilityNode[];
  }

  /**
   * Get models needed for a capability.
   */
  getModelsForCapability(capId: string): CapabilityNode[] {
    const modelIds = this.edges
      .filter((e) => e.from === capId)
      .filter((e) => this.nodes.get(e.to)?.type === "model")
      .map((e) => e.to);
    return modelIds.map((id) => this.nodes.get(id)).filter(Boolean) as CapabilityNode[];
  }

  /**
   * Get nodes needed for a capability.
   */
  getNodesForCapability(capId: string): CapabilityNode[] {
    const nodeIds = this.edges
      .filter((e) => e.from === capId)
      .filter((e) => this.nodes.get(e.to)?.type === "node")
      .map((e) => e.to);
    return nodeIds.map((id) => this.nodes.get(id)).filter(Boolean) as CapabilityNode[];
  }

  /**
   * Get all nodes in a path from goal to implementation.
   */
  getImplementationPath(goalId: string): {
    goals: CapabilityNode[];
    capabilities: CapabilityNode[];
    models: CapabilityNode[];
    nodes: CapabilityNode[];
  } {
    const goal = this.nodes.get(goalId);
    const capabilities = this.getCapabilitiesForGoal(goalId);
    const models: CapabilityNode[] = [];
    const nodes: CapabilityNode[] = [];

    for (const cap of capabilities) {
      models.push(...this.getModelsForCapability(cap.id));
      nodes.push(...this.getNodesForCapability(cap.id));
    }

    return {
      goals: goal ? [goal] : [],
      capabilities,
      models,
      nodes: [...new Map(nodes.map((n) => [n.id, n])).values()],
    };
  }

  /**
   * Add a custom node to the graph.
   */
  addNode(node: CapabilityNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Add a custom edge.
   */
  addEdge(edge: CapabilityEdge): void {
    this.edges.push(edge);
  }

  /**
   * Find goal ID by fuzzy name match.
   */
  findGoal(query: string): CapabilityNode | undefined {
    const lower = query.toLowerCase();
    for (const [, node] of this.nodes) {
      if (node.type === "goal") {
        if (node.name.toLowerCase().includes(lower) || lower.includes(node.name.toLowerCase())) {
          return node;
        }
      }
    }
    return undefined;
  }

  /**
   * List all goals.
   */
  listGoals(): CapabilityNode[] {
    return [...this.nodes.values()].filter((n) => n.type === "goal");
  }
}
