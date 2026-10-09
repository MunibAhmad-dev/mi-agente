// ============================================================================
// Pipeline Builder
// ============================================================================
// Chains capabilities into executable pipelines:
// Input → Preprocess → Generate → Enhance → Restore → Upscale → Postprocess → Output
// ============================================================================

import type { Workflow, WorkflowNode, WorkflowLink } from "../types/index.js";

export interface PipelineStage {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  optional: boolean;
  estimatedVramMb: number;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  totalEstimatedVramMb: number;
  description: string;
}

/**
 * Pre-built pipeline templates for common creative workflows.
 */
const PIPELINE_TEMPLATES: Record<string, PipelineStage[]> = {
  "enhance_image": [
    { id: "load", name: "Load Image", type: "LoadImage", parameters: {}, optional: false, estimatedVramMb: 0 },
    { id: "denoise", name: "Denoise", type: "ImageDenoise", parameters: { strength: 0.3 }, optional: true, estimatedVramMb: 500 },
    { id: "sharpen", name: "Sharpen", type: "ImageSharpen", parameters: { amount: 0.5 }, optional: true, estimatedVramMb: 500 },
    { id: "upscale", name: "Upscale", type: "UpscaleModelLoader", parameters: { scale: 2 }, optional: false, estimatedVramMb: 2000 },
    { id: "save", name: "Save Image", type: "SaveImage", parameters: {}, optional: false, estimatedVramMb: 0 },
  ],
  "txt2img_basic": [
    { id: "checkpoint", name: "Load Checkpoint", type: "CheckpointLoaderSimple", parameters: {}, optional: false, estimatedVramMb: 4000 },
    { id: "positive", name: "Positive Prompt", type: "CLIPTextEncode", parameters: {}, optional: false, estimatedVramMb: 0 },
    { id: "negative", name: "Negative Prompt", type: "CLIPTextEncode", parameters: {}, optional: false, estimatedVramMb: 0 },
    { id: "latent", name: "Empty Latent", type: "EmptyLatentImage", parameters: { width: 512, height: 512 }, optional: false, estimatedVramMb: 500 },
    { id: "sampler", name: "KSampler", type: "KSampler", parameters: { steps: 20, cfg: 7.0, sampler: "euler", scheduler: "normal" }, optional: false, estimatedVramMb: 4000 },
    { id: "vae_decode", name: "VAE Decode", type: "VAEDecode", parameters: {}, optional: false, estimatedVramMb: 500 },
    { id: "save", name: "Save Image", type: "SaveImage", parameters: {}, optional: false, estimatedVramMb: 0 },
  ],
  "txt2img_with_lora": [
    { id: "checkpoint", name: "Load Checkpoint", type: "CheckpointLoaderSimple", parameters: {}, optional: false, estimatedVramMb: 4000 },
    { id: "lora", name: "Load LoRA", type: "LoraLoader", parameters: { strength_model: 1.0, strength_clip: 1.0 }, optional: false, estimatedVramMb: 500 },
    { id: "positive", name: "Positive Prompt", type: "CLIPTextEncode", parameters: {}, optional: false, estimatedVramMb: 0 },
    { id: "negative", name: "Negative Prompt", type: "CLIPTextEncode", parameters: {}, optional: false, estimatedVramMb: 0 },
    { id: "latent", name: "Empty Latent", type: "EmptyLatentImage", parameters: { width: 512, height: 512 }, optional: false, estimatedVramMb: 500 },
    { id: "sampler", name: "KSampler", type: "KSampler", parameters: { steps: 20, cfg: 7.0, sampler: "euler", scheduler: "normal" }, optional: false, estimatedVramMb: 4000 },
    { id: "vae_decode", name: "VAE Decode", type: "VAEDecode", parameters: {}, optional: false, estimatedVramMb: 500 },
    { id: "upscale", name: "Upscale 2x", type: "ImageUpscaleWithModel", parameters: {}, optional: true, estimatedVramMb: 2000 },
    { id: "save", name: "Save Image", type: "SaveImage", parameters: {}, optional: false, estimatedVramMb: 0 },
  ],
  "face_enhance": [
    { id: "load", name: "Load Image", type: "LoadImage", parameters: {}, optional: false, estimatedVramMb: 0 },
    { id: "face_restore", name: "Face Restore", type: "FaceRestoreModelLoader", parameters: {}, optional: false, estimatedVramMb: 1000 },
    { id: "sharpen", name: "Sharpen", type: "ImageSharpen", parameters: { amount: 0.3 }, optional: true, estimatedVramMb: 500 },
    { id: "save", name: "Save Image", type: "SaveImage", parameters: {}, optional: false, estimatedVramMb: 0 },
  ],
  "product_photography": [
    { id: "load", name: "Load Image", type: "LoadImage", parameters: {}, optional: false, estimatedVramMb: 0 },
    { id: "checkpoint", name: "Load Checkpoint", type: "CheckpointLoaderSimple", parameters: {}, optional: false, estimatedVramMb: 4000 },
    { id: "positive", name: "Product Prompt", type: "CLIPTextEncode", parameters: { text: "professional product photography, studio lighting, white background, high detail" }, optional: false, estimatedVramMb: 0 },
    { id: "negative", name: "Negative", type: "CLIPTextEncode", parameters: { text: "blurry, low quality, dark, shadow, artifacts" }, optional: false, estimatedVramMb: 0 },
    { id: "sampler", name: "Img2Img", type: "KSampler", parameters: { steps: 25, cfg: 7.5, denoise: 0.4 }, optional: false, estimatedVramMb: 4000 },
    { id: "vae_decode", name: "VAE Decode", type: "VAEDecode", parameters: {}, optional: false, estimatedVramMb: 500 },
    { id: "upscale", name: "Upscale", type: "UpscaleModelLoader", parameters: { scale: 2 }, optional: true, estimatedVramMb: 2000 },
    { id: "save", name: "Save Image", type: "SaveImage", parameters: {}, optional: false, estimatedVramMb: 0 },
  ],
};

export class PipelineBuilder {
  /**
   * Get available pipeline templates.
   */
  listTemplates(): string[] {
    return Object.keys(PIPELINE_TEMPLATES);
  }

  /**
   * Build a pipeline from a template.
   */
  buildFromTemplate(
    templateName: string,
    options?: {
      lowVram?: boolean;
      includeOptional?: boolean;
      customParameters?: Record<string, Record<string, unknown>>;
    }
  ): Pipeline | null {
    const stages = PIPELINE_TEMPLATES[templateName];
    if (!stages) return null;

    let filtered = stages;
    if (options?.includeOptional === false) {
      filtered = stages.filter((s) => !s.optional);
    }

    // Estimate VRAM
    let totalVram = 0;
    for (const stage of filtered) {
      totalVram += stage.estimatedVramMb;
    }

    // Apply custom parameters
    if (options?.customParameters) {
      for (const stage of filtered) {
        const custom = options.customParameters[stage.id];
        if (custom) {
          stage.parameters = { ...stage.parameters, ...custom };
        }
      }
    }

    return {
      id: `pipeline_${templateName}_${Date.now()}`,
      name: templateName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      stages: filtered,
      totalEstimatedVramMb: totalVram,
      description: `Pipeline: ${templateName} with ${filtered.length} stages`,
    };
  }

  /**
   * Convert a pipeline to a ComfyUI-compatible workflow.
   */
  toWorkflow(pipeline: Pipeline): Workflow {
    const nodes: WorkflowNode[] = [];
    const links: WorkflowLink[] = [];

    let nodeId = 1;
    for (const stage of pipeline.stages) {
      nodes.push({
        id: String(nodeId),
        type: stage.type,
        title: stage.name,
        inputs: { ...stage.parameters },
        outputs: {},
      });
      nodeId++;
    }

    // Auto-link sequential stages
    for (let i = 0; i < nodes.length - 1; i++) {
      links.push({
        fromNode: nodes[i]!.id,
        fromOutput: "0",
        toNode: nodes[i + 1]!.id,
        toInput: "0",
      });
    }

    return {
      id: `wf_${pipeline.id}` as any,
      name: pipeline.name,
      version: "1.0.0",
      nodes,
      links,
      metadata: {
        tags: ["pipeline", "auto-generated"],
        requiredNodes: pipeline.stages.map((s) => s.type),
        requiredModels: [],
        estimatedVramMb: pipeline.totalEstimatedVramMb,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Adapt pipeline to hardware constraints.
   */
  adaptToHardware(pipeline: Pipeline, availableVramMb: number): Pipeline {
    if (pipeline.totalEstimatedVramMb <= availableVramMb) return pipeline;

    // Remove optional stages that don't fit
    const adapted: PipelineStage[] = [];
    let vram = 0;

    for (const stage of pipeline.stages) {
      if (!stage.optional || vram + stage.estimatedVramMb <= availableVramMb) {
        adapted.push(stage);
        vram += stage.estimatedVramMb;
      }
    }

    return {
      ...pipeline,
      stages: adapted,
      totalEstimatedVramMb: vram,
    };
  }
}
