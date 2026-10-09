/**
 * ComfyUI Model Data
 * ==================
 * Modelos y LoRAs disponibles para ComfyUI
 */

import type { ComfyUIModel, LoRA } from './types';

export const COMFYUI_MODELS: ComfyUIModel[] = [
  // SDXL Models
  {
    id: 'sdxl-base-1.0',
    name: 'SDXL Base 1.0',
    category: 'sdxl',
    baseModel: 'sdxl',
    description: 'Stable Diffusion XL Base 1.0',
  },
  {
    id: 'sdxl-refiner-1.0',
    name: 'SDXL Refiner 1.0',
    category: 'sdxl',
    baseModel: 'sdxl',
    description: 'Stable Diffusion XL Refiner',
  },
  // SD 1.5 Models
  {
    id: 'sd-15-v1-5',
    name: 'SD 1.5 v1-5',
    category: 'sd15',
    baseModel: 'sd15',
    description: 'Stable Diffusion 1.5 v1-5 pruned',
  },
  {
    id: 'realistic-vision-v51',
    name: 'Realistic Vision V5.1',
    category: 'sd15',
    baseModel: 'sd15',
    description: 'Photorealistic model',
  },
  // SDXL Turbo
  {
    id: 'sdxl-turbo',
    name: 'SDXL Turbo',
    category: 'sdxl_turbo',
    baseModel: 'sdxl',
    description: 'Fast SDXL model (1-4 steps)',
  },
  {
    id: 'pix2pix-turbo',
    name: 'Pix2Pix Turbo',
    category: 'sdxl_turbo',
    baseModel: 'sdxl',
    description: 'Fast image-to-image',
  },
  // Video Models
  {
    id: 'svd',
    name: 'Stable Video Diffusion',
    category: 'video',
    baseModel: 'svd',
    description: 'Image to video generation',
  },
  {
    id: 'svd-xt',
    name: 'SVD-XT (25 frames)',
    category: 'video',
    baseModel: 'svd',
    description: 'Extended video generation',
  },
  {
    id: 'animatediff',
    name: 'AnimateDiff',
    category: 'video',
    baseModel: 'sd15',
    description: 'Animation from SD models',
  },
  // ControlNet Models
  {
    id: 'controlnet-canny',
    name: 'ControlNet Canny',
    category: 'controlnet',
    baseModel: 'any',
    description: 'Edge detection control',
  },
  {
    id: 'controlnet-depth',
    name: 'ControlNet Depth',
    category: 'controlnet',
    baseModel: 'any',
    description: 'Depth map control',
  },
  {
    id: 'controlnet-pose',
    name: 'ControlNet Pose',
    category: 'controlnet',
    baseModel: 'any',
    description: 'Pose detection control',
  },
];

export const LORAS: LoRA[] = [
  // Style LoRAs
  {
    id: 'lora-anime',
    name: 'Anime Style',
    type: 'style',
  },
  {
    id: 'lora-realistic',
    name: 'Realistic Style',
    type: 'style',
  },
  {
    id: 'lora-cyberpunk',
    name: 'Cyberpunk Style',
    type: 'style',
  },
  {
    id: 'lora-impressionist',
    name: 'Impressionist Style',
    type: 'style',
  },
  {
    id: 'lora-watercolor',
    name: 'Watercolor Style',
    type: 'style',
  },
  {
    id: 'lora-oil-painting',
    name: 'Oil Painting Style',
    type: 'style',
  },
  // Character LoRAs
  {
    id: 'lora-anime-character',
    name: 'Anime Character',
    type: 'character',
  },
  {
    id: 'lora-portrait',
    name: 'Portrait Style',
    type: 'character',
  },
  // Concept LoRAs
  {
    id: 'lora-logo',
    name: 'Logo Design',
    type: 'concept',
  },
  {
    id: 'lora-architecture',
    name: 'Architecture',
    type: 'concept',
  },
  {
    id: 'lora-product',
    name: 'Product Photography',
    type: 'concept',
  },
  {
    id: 'lora-ui-design',
    name: 'UI Design',
    type: 'concept',
  },
];

export const MODEL_CATEGORIES = [
  { id: 'sdxl', label: 'SDXL', description: 'Stable Diffusion XL' },
  { id: 'sd15', label: 'SD 1.5', description: 'Stable Diffusion 1.5' },
  { id: 'sdxl_turbo', label: 'SDXL Turbo', description: 'Fast SDXL' },
  { id: 'video', label: 'Video', description: 'Video generation' },
  { id: 'controlnet', label: 'ControlNet', description: 'Control models' },
] as const;

export const ASPECT_RATIOS = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '16:9', width: 1344, height: 768 },
  { label: '9:16', width: 768, height: 1344 },
  { label: '4:3', width: 1152, height: 896 },
  { label: '3:4', width: 896, height: 1152 },
  { label: '21:9', width: 1536, height: 640 },
] as const;

export const DEFAULT_PARAMS = {
  mode: 'text2img' as const,
  steps: 30,
  cfgScale: 7,
  width: 1024,
  height: 1024,
  batchSize: 1,
  negativePrompt: 'blurry, ugly, distorted, low quality',
};
