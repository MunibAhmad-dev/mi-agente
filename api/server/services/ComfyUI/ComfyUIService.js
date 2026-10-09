/**
 * ComfyUI Service
 * Main service for interacting with ComfyUI (MIT-licensed, open-source).
 * Uses REST API (no /api/ prefix — ComfyUI serves at root).
 */

const ComfyUIWebSocket = require('./ComfyUIWebSocket');
const WorkflowBuilder = require('./WorkflowBuilder');
const logger = require('../../../utils/logger');

const DEFAULT_REST = process.env.COMFYUI_URL || 'http://comfyui:8188';
const DEFAULT_WS = DEFAULT_REST.replace(/^http/, 'ws');

class ComfyUIService {
  constructor(config = {}) {
    this.config = {
      comfyUIUrl: config.comfyUIUrl || DEFAULT_WS,
      comfyUIRest: config.comfyUIRest || DEFAULT_REST,
      timeout: config.timeout || 600000, // 10 minutes (video can be slow)
      ...config,
    };

    this.ws = new ComfyUIWebSocket(this.config.comfyUIUrl);
    this.workflowBuilder = new WorkflowBuilder();
    this.isConnected = false;
    this.queue = [];
    this.history = [];
  }

  /**
   * Initialize connection
   */
  async initialize() {
    try {
      await this.ws.connect();
      this.isConnected = true;
      logger.info('[ComfyUI Service] Initialized');

      // Set up event handlers
      this.ws.on('progress', (data) => this.emit('progress', data));
      this.ws.on('complete', (data) => this.emit('complete', data));
      this.ws.on('error', (data) => this.emit('error', data));

      return true;
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to initialize:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Generate image from text prompt.
   * Uses REST submit + poll (same pattern as generateVideo).
   */
  async generateImage({
    prompt,
    negativePrompt,
    model,
    loras = [],
    steps = 20,
    cfg = 7,
    seed,
    width = 512,
    height = 512,
  }) {
    const workflow = this.workflowBuilder.buildTextToImage({
      prompt,
      negativePrompt,
      model,
      loras,
      steps,
      cfg,
      seed,
      width,
      height,
    });

    const promptId = await this._submitWorkflow(workflow, 'generate');
    const images = await this._pollHistory(promptId, 'generate', this.config.timeout);

    return { promptId, images };
  }

  /**
   * Generate image from sketch (image-to-image).
   * Uses REST submit + poll (same pattern as generateVideo).
   */
  async generateFromSketch({ sketch, prompt, model, strength = 0.7 }) {
    const workflow = this.workflowBuilder.buildImageToImage({
      inputImage: sketch,
      prompt,
      model,
      strength,
    });

    const promptId = await this._submitWorkflow(workflow, 'sketch');
    const images = await this._pollHistory(promptId, 'sketch', this.config.timeout);

    return { promptId, images };
  }

  /**
   * Generate video from text prompt via ComfyUI (SVD/AnimateDiff).
   * Uses the same REST poll pattern as generateImage.
   */
  async generateVideo({
    prompt,
    negativePrompt = '',
    model = 'animatediff',
    frames = 16,
    steps = 20,
    cfg = 7,
    seed,
    width = 512,
    height = 512,
  }) {
    const workflow = this.workflowBuilder.buildTextToVideo({
      prompt,
      negativePrompt,
      model,
      frames,
      steps,
      cfg,
      seed,
      width,
      height,
    });

    const promptId = await this._submitWorkflow(workflow, 'video-gen');
    const videos = await this._pollHistory(promptId, 'video-gen', 600000);

    return { promptId, videos };
  }

  /**
   * Submit a workflow to ComfyUI and return the prompt_id.
   */
  async _submitWorkflow(workflow, clientId) {
    const response = await fetch(`${this.config.comfyUIRest}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ComfyUI /prompt ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data.prompt_id) {
      throw new Error('ComfyUI no devolvió prompt_id');
    }
    return data.prompt_id;
  }

  /**
   * Poll /history/:promptId until outputs are available or timeout.
   * Returns array of { filename, subfolder, type }.
   */
  async _pollHistory(promptId, clientId, timeoutMs) {
    const startedAt = Date.now();
    const pollInterval = 5000;
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollInterval));
      try {
        const response = await fetch(`${this.config.comfyUIRest}/history/${promptId}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const history = await response.json();
        const entry = history[promptId];
        if (!entry) {
          continue;
        }
        if (entry.status?.error) {
          throw new Error(
            `ComfyUI execution failed: ${JSON.stringify(entry.status.error).slice(0, 300)}`,
          );
        }
        const outputs = entry.outputs ?? {};
        const files = [];
        for (const out of Object.values(outputs)) {
          const gifs = out.gifs ?? [];
          const images = out.images ?? [];
          for (const f of [...gifs, ...images]) {
            files.push(f);
          }
        }
        if (files.length > 0) {
          return files;
        }
      } catch (err) {
        if (err?.message?.includes('execution failed')) {
          throw err;
        }
      }
    }
    throw new Error(`ComfyUI no terminó en ${timeoutMs / 1000}s`);
  }

  /**
   * Get available models
   */
  async getModels() {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/object_info/CheckpointLoaderSimple`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const nodeInfo = data?.CheckpointLoaderSimple;
      return nodeInfo?.input?.required?.ckpt_name?.[0] ?? [];
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to get models:', error.message);
      return [];
    }
  }

  /**
   * Get available LoRAs
   */
  async getLoRAs() {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/object_info/LoraLoader`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const nodeInfo = data?.LoraLoader;
      return nodeInfo?.input?.required?.lora_name?.[0] ?? [];
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to get LoRAs:', error.message);
      return [];
    }
  }

  /**
   * Get available samplers
   */
  async getSamplers() {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/object_info/KSampler`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const nodeInfo = data?.KSampler;
      return nodeInfo?.input?.required?.sampler_name?.[0] ?? [];
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to get samplers:', error.message);
      return [];
    }
  }

  /**
   * Get history
   */
  async getHistory(promptId) {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/history/${promptId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data[promptId];
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to get history:', error.message);
      return null;
    }
  }

  /**
   * Get queue status
   */
  async getQueue() {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/queue`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to get queue:', error.message);
      return { queue_running: [], queue_pending: [] };
    }
  }

  /**
   * Clear queue
   */
  async clearQueue() {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/queue`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return true;
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to clear queue:', error.message);
      return false;
    }
  }

  /**
   * Check if ComfyUI is running
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/system_stats`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get node info
   */
  async getNodeInfo(nodeId) {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/object_info/${nodeId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to get node info:', error.message);
      return null;
    }
  }

  /**
   * Get object info (all node types)
   */
  async getObjectInfo() {
    try {
      const response = await fetch(`${this.config.comfyUIRest}/object_info`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('[ComfyUI Service] Failed to get object info:', error.message);
      return {};
    }
  }

  /**
   * Close connection
   */
  close() {
    this.ws.close();
    this.isConnected = false;
  }
}

// Mixin EventEmitter
const { EventEmitter } = require('events');
Object.setPrototypeOf(ComfyUIService.prototype, EventEmitter.prototype);
EventEmitter.call(ComfyUIService.prototype);

module.exports = ComfyUIService;
