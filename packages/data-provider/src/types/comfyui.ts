/**
 * ComfyUI Types
 * =============
 * Tipos para el cliente ComfyUI
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
  inputImage?: string; // Base64 for img2img/inpaint
}

export interface ComfyUIGeneration {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  prompt?: string;
  progress?: number;
  outputUrls?: string[];
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ComfyUIQueueResponse {
  queueRunning: number;
  queuePending: number;
}

export interface ComfyUIHistoryResponse {
  [promptId: string]: {
    status: {
      exec_time: number;
      status_str: string;
      completed: boolean;
      error?: string;
    };
    outputs: Record<string, unknown>;
  };
}

export interface ComfyUIModelsResponse {
  models: ComfyUIModel[];
  lastUpdated: string;
}

export interface ComfyUILoRAsResponse {
  loras: LoRA[];
  lastUpdated: string;
}

export interface ComfyUISystemStatsResponse {
  devices: {
    name: string;
    type: string;
   VRAM: {
      used: number;
      total: number;
      free: number;
    };
  }[];
}
