/**
 * ComfyUI WebSocket Client
 * Handles real-time communication with ComfyUI server
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../../../utils/logger');

class ComfyUIWebSocket extends EventEmitter {
  constructor(comfyUIUrl = null) {
    super();
    this.comfyUIUrl = comfyUIUrl || 'ws://comfyui:8188';
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.pingInterval = null;
    this.subscriptions = new Map();
  }

  /**
   * Connect to ComfyUI WebSocket
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        logger.info(`[ComfyUI WS] Connecting to ${this.comfyUIUrl}`);

        this.ws = new WebSocket(this.comfyUIUrl);

        this.ws.on('open', () => {
          logger.info('[ComfyUI WS] Connected');
          this.reconnectAttempts = 0;
          this.startPing();
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (e) {
            logger.error('[ComfyUI WS] Failed to parse message:', e);
          }
        });

        this.ws.on('close', () => {
          logger.warn('[ComfyUI WS] Disconnected');
          this.stopPing();
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          logger.error('[ComfyUI WS] Error:', error.message);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'status':
        this.handleStatus(data);
        break;

      case 'progress':
        this.handleProgress(data);
        break;

      case 'executing':
        this.handleExecuting(data);
        break;

      case 'executed':
        this.handleExecuted(data);
        break;

      case 'execution_error':
        this.handleError(data);
        break;

      case 'execution_start':
        this.handleExecutionStart(data);
        break;

      case 'execution_cached':
        this.handleExecutionCached(data);
        break;

      case 'received_images':
        this.handleReceivedImages(data);
        break;

      default:
        logger.debug(`[ComfyUI WS] Unknown message type: ${type}`);
    }
  }

  /**
   * Handle status messages
   */
  handleStatus(data) {
    const { status, sid } = data;
    logger.info(`[ComfyUI WS] Status: ${status?.exec_info?.queue_remaining || 0} in queue`);
    this.emit('status', data);
  }

  /**
   * Handle progress updates
   */
  handleProgress(data) {
    const { node, prompt_id, progress, max_progress, node_name } = data;

    // Calculate percentage
    const percentage = max_progress > 0 ? progress / max_progress : 0;

    // Emit progress event
    this.emit('progress', {
      node,
      promptId: prompt_id,
      progress: percentage,
      current: progress,
      max: max_progress,
      nodeName: node_name,
    });

    // Notify subscriber
    for (const [, sub] of this.subscriptions) {
      if (sub.promptId === prompt_id && sub.onProgress) {
        sub.onProgress({ node, progress: percentage, nodeName: node_name });
      }
    }
  }

  /**
   * Handle node execution
   */
  handleExecuting(data) {
    const { node, prompt_id } = data;

    if (node === null) {
      // Execution complete
      this.handleExecutionComplete(prompt_id);
    } else {
      logger.debug(`[ComfyUI WS] Executing node: ${node}`);
      this.emit('executing', { node, promptId: prompt_id });
    }
  }

  /**
   * Handle executed node
   */
  handleExecuted(data) {
    const { node, prompt_id, output } = data;
    logger.debug(`[ComfyUI WS] Node executed: ${node}`);
    this.emit('executed', { node, promptId: prompt_id, output });
  }

  /**
   * Handle execution errors
   */
  handleError(data) {
    const { prompt_id, node, exception } = data;
    logger.error(`[ComfyUI WS] Execution error: ${exception.message}`);

    // Notify subscriber
    for (const [clientId, sub] of this.subscriptions) {
      if (sub.promptId === prompt_id && sub.onError) {
        sub.onError(exception);
      }
    }

    this.emit('error', { promptId: prompt_id, node, exception });
  }

  /**
   * Handle execution start
   */
  handleExecutionStart(data) {
    const { prompt_id } = data;
    logger.info(`[ComfyUI WS] Execution started: ${prompt_id}`);
    this.emit('executionStart', { promptId: prompt_id });
  }

  /**
   * Handle cached execution
   */
  handleExecutionCached(data) {
    const { nodes, prompt_id } = data;
    logger.debug(`[ComfyUI WS] Cached: ${nodes.join(', ')}`);
    this.emit('cached', { nodes, promptId: prompt_id });
  }

  /**
   * Handle received images
   */
  handleReceivedImages(data) {
    const { prompt_id, images } = data;
    logger.debug(`[ComfyUI WS] Received ${images?.length || 0} images`);

    // Store images in the matching subscription so handleExecutionComplete can return them
    for (const [, sub] of this.subscriptions) {
      if (sub.promptId === prompt_id) {
        sub.images = images || [];
      }
    }

    this.emit('images', { promptId: prompt_id, images });
  }

  /**
   * Handle execution complete
   */
  handleExecutionComplete(promptId) {
    logger.info(`[ComfyUI WS] Execution complete: ${promptId}`);

    for (const [clientId, sub] of this.subscriptions) {
      if (sub.promptId === promptId) {
        clearTimeout(sub.timeout);
        if (sub.onComplete) {
          sub.onComplete(sub.images || []);
        }
        this.subscriptions.delete(clientId);
      }
    }

    this.emit('complete', { promptId });
  }

  /**
   * Submit a prompt to ComfyUI via REST + track via WebSocket subscription.
   * Uses REST POST /prompt (ComfyUI API) and subscribes to WS events for
   * progress/completion. The subscription's onComplete/onError callbacks
   * resolve/reject the returned promise.
   */
  async submitPrompt(workflow, clientId = 'default') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    // Build REST URL from WS URL (ws:// → http://, wss:// → https://)
    const restUrl = this.comfyUIUrl.replace(/^ws/, 'http');

    return new Promise((resolve, reject) => {
      // Set up subscription with completion callbacks
      this.subscriptions.set(clientId, {
        promptId: null, // will be set after REST response
        images: [],
        onProgress: null,
        onComplete: resolve,
        onError: reject,
        timeout: null,
      });

      // Set timeout (10 minutes)
      const timeout = setTimeout(() => {
        if (this.subscriptions.has(clientId)) {
          this.subscriptions.delete(clientId);
          reject(new Error('ComfyUI prompt timeout'));
        }
      }, 600000);

      this.subscriptions.get(clientId).timeout = timeout;

      // Submit prompt via REST API (global fetch available in Node 18+)
      const promptData = JSON.stringify({
        prompt: workflow,
        client_id: clientId,
      });

      global
        .fetch(`${restUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: promptData,
        })
        .then(async (res) => {
          const data = await res.json();
          const promptId = data.prompt_id;
          if (!promptId) {
            clearTimeout(timeout);
            this.subscriptions.delete(clientId);
            reject(new Error('ComfyUI no devolvió prompt_id'));
            return;
          }
          this.subscriptions.get(clientId).promptId = promptId;
          logger.info(`[ComfyUI WS] Submitted prompt ${promptId} via REST`);
        })
        .catch((err) => {
          clearTimeout(timeout);
          this.subscriptions.delete(clientId);
          reject(new Error(`ComfyUI REST /prompt failed: ${err.message}`));
        });
    });
  }

  /**
   * Wait for prompt completion
   */
  async waitForCompletion(promptId, clientId) {
    return new Promise((resolve, reject) => {
      const subscription = this.subscriptions.get(clientId);
      if (subscription) {
        subscription.onComplete = resolve;
        subscription.onError = reject;
      } else {
        reject(new Error('No subscription found'));
      }
    });
  }

  /**
   * Check connection status
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[ComfyUI WS] Max reconnection attempts reached');
      this.emit('disconnected');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`[ComfyUI WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(() => {
        // Will retry automatically
      });
    }, delay);
  }

  /**
   * Start ping interval
   */
  startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Generate unique prompt ID
   */
  generatePromptId() {
    return `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close connection
   */
  close() {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}

module.exports = ComfyUIWebSocket;
