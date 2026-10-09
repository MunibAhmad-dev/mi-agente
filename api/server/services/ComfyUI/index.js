/**
 * ComfyUI Service - Main entry point
 */

const ComfyUIService = require('./ComfyUIService');
const ComfyUIWebSocket = require('./ComfyUIWebSocket');
const WorkflowBuilder = require('./WorkflowBuilder');

// Singleton instance
let serviceInstance = null;

/**
 * Get or create ComfyUI service
 */
function getService(config = {}) {
  if (!serviceInstance) {
    serviceInstance = new ComfyUIService(config);
  }
  return serviceInstance;
}

/**
 * Initialize service
 */
async function initialize(config = {}) {
  const service = getService(config);
  await service.initialize();
  return service;
}

/**
 * Generate image
 */
async function generateImage(params) {
  const service = getService();
  return service.generateImage(params);
}

/**
 * Generate from sketch
 */
async function generateFromSketch(params) {
  const service = getService();
  return service.generateFromSketch(params);
}

/**
 * Generate video
 */
async function generateVideo(params) {
  const service = getService();
  return service.generateVideo(params);
}

/**
 * Get models
 */
async function getModels() {
  const service = getService();
  return service.getModels();
}

/**
 * Get LoRAs
 */
async function getLoRAs() {
  const service = getService();
  return service.getLoRAs();
}

/**
 * Health check
 */
async function healthCheck() {
  const service = getService();
  return service.healthCheck();
}

module.exports = {
  ComfyUIService,
  ComfyUIWebSocket,
  WorkflowBuilder,
  getService,
  initialize,
  generateImage,
  generateFromSketch,
  generateVideo,
  getModels,
  getLoRAs,
  healthCheck,
};
