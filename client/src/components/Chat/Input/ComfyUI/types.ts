/**
 * ComfyUI System Types
 * ====================
 * Tipos para el sistema de ventanas de ComfyUI
 */

export type GenerationMode = 'text2img' | 'img2img' | 'inpaint' | 'video';

export type ModelCategory = 'sdxl' | 'sd15' | 'sdxl_turbo' | 'video' | 'controlnet';

export interface ComfyUIModel {
  id: string;
  name: string;
  category: ModelCategory;
  baseModel: string;
  description?: string;
}

export interface LoRA {
  id: string;
  name: string;
  type: 'style' | 'character' | 'concept';
  strength?: number;
  model?: string;
}

export interface ComfyUIParams {
  mode: GenerationMode;
  model?: string;
  loras: LoRA[];
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfgScale: number;
  seed?: number;
  width: number;
  height: number;
  batchSize: number;
}

export interface ComfyUIWorkflow {
  id: string;
  name: string;
  description: string;
  nodes: ComfyUINode[];
  connections: ComfyUIConnection[];
}

export interface ComfyUINode {
  id: string;
  type: string;
  inputs: Record<string, unknown>;
  widgets?: Record<string, unknown>;
}

export interface ComfyUIConnection {
  from: { nodeId: string; slot: number };
  to: { nodeId: string; slot: number };
}

export interface ComfyUIGeneration {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  prompt?: string;
  progress?: number;
  outputUrl?: string;
  error?: string;
  createdAt: Date;
}

export interface TGenerationItem {
  id: string;
  type: 'image' | 'video';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  prompt: string;
  model: string;
  createdAt: string;
}
