/**
 * LLM Gateway - Main entry point
 * Intelligent routing and fallback for 12+ LLM providers
 */

const LLMGateway = require('./LLMGateway');

// Singleton instance
let gatewayInstance = null;

/**
 * Get or create LLM Gateway instance
 */
function getGateway(config = {}) {
  if (!gatewayInstance) {
    gatewayInstance = new LLMGateway(config);
  }
  return gatewayInstance;
}

/**
 * Complete chat with automatic provider selection
 */
async function complete({ messages, model, provider, temperature, maxTokens, stream, userId }) {
  const gateway = getGateway();
  return gateway.complete({ messages, model, provider, temperature, maxTokens, stream, userId });
}

/**
 * Get available models
 */
function getAvailableModels() {
  const gateway = getGateway();
  return gateway.getAvailableModels();
}

/**
 * Get gateway statistics
 */
function getStats() {
  const gateway = getGateway();
  return gateway.getStats();
}

/**
 * Health check all providers
 */
async function healthCheck() {
  const gateway = getGateway();
  return gateway.healthCheck();
}

module.exports = {
  LLMGateway,
  getGateway,
  complete,
  getAvailableModels,
  getStats,
  healthCheck,
};
