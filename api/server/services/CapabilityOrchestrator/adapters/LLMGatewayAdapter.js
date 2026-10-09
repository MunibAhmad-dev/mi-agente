/**
 * LLMGatewayAdapter - Adaptador para integración con LLMGateway existente
 *
 * Permite que CapabilityOrchestrator use el LLMGateway
 * como executor de modelos.
 */

class LLMGatewayAdapter {
  constructor(llmGateway) {
    this._gateway = llmGateway;
  }

  /**
   * Ejecutar en un modelo específico
   */
  async execute({ modelId, messages, parameters = {} }) {
    // Parsear modelId: "provider/model-name"
    const { provider, model } = this._parseModelId(modelId);

    return this._gateway.complete({
      provider,
      model,
      messages,
      temperature: parameters.temperature,
      maxTokens: parameters.maxTokens,
      topP: parameters.topP,
      topK: parameters.topK,
      stream: parameters.stream,
    });
  }

  /**
   * Ejecutar con streaming
   */
  async executeStream({ modelId, messages, parameters = {} }) {
    const { provider, model } = this._parseModelId(modelId);

    return this._gateway.complete({
      provider,
      model,
      messages,
      temperature: parameters.temperature,
      maxTokens: parameters.maxTokens,
      stream: true,
    });
  }

  /**
   * Listar modelos disponibles en el gateway
   */
  async listModels() {
    if (!this._gateway.providers) {
      return [];
    }

    const models = [];

    for (const [provider, data] of Object.entries(this._gateway.providers)) {
      for (const model of data.models || []) {
        models.push({
          id: model,
          provider,
          model,
          modelId: `${provider}/${model}`,
          capabilities: data.capabilities || [],
          health: data.health,
          tier: data.tier,
        });
      }
    }

    return models;
  }

  /**
   * Verificar salud de un modelo
   */
  async healthCheck(modelId) {
    const { provider } = this._parseModelId(modelId);

    if (!this._gateway.providers) {
      return { healthy: false, error: 'Gateway not initialized' };
    }

    const providerData = this._gateway.providers[provider];

    if (!providerData) {
      return { healthy: false, error: `Provider ${provider} not found` };
    }

    return {
      healthy: providerData.health === 'healthy',
      status: providerData.health,
      lastCheck: providerData.lastHealthCheck,
    };
  }

  /**
   * Obtener estadísticas del gateway
   */
  getStats() {
    if (!this._gateway.stats) {
      return {};
    }

    return this._gateway.stats;
  }

  /**
   * Obtener proveedor de un modelo
   */
  getProviderForModel(modelId) {
    const { provider } = this._parseModelId(modelId);
    return this._gateway.providers?.[provider] || null;
  }

  /**
   * Verificar si un modelo está disponible
   */
  isModelAvailable(modelId) {
    const { provider } = this._parseModelId(modelId);
    const providerData = this._gateway.providers?.[provider];

    return providerData?.health === 'healthy';
  }

  /**
   * Obtener fallback chain para un modelo
   */
  getFallbackChain(modelId) {
    const { provider } = this._parseModelId(modelId);

    if (typeof this._gateway.getFallbackChain === 'function') {
      return this._gateway.getFallbackChain(provider);
    }

    // Fallback manual basado en estado de salud
    const available = Object.entries(this._gateway.providers || {})
      .filter(([name, data]) => data.health === 'healthy')
      .map(([name]) => name);

    return available;
  }

  /**
   * Parsear modelId
   */
  _parseModelId(modelId) {
    // Formato: "provider/model-name"
    // O puede ser solo "model-name" si el provider se infiere

    const parts = modelId.split('/');

    if (parts.length >= 2) {
      return {
        provider: parts[0],
        model: parts.slice(1).join('/'),
      };
    }

    // Buscar el modelo en todos los providers
    for (const [provider, data] of Object.entries(this._gateway.providers || {})) {
      if (data.models?.includes(modelId)) {
        return { provider, model: modelId };
      }
    }

    // Default
    return { provider: 'unknown', model: modelId };
  }

  /**
   * Sincronizar modelos del gateway con el registry
   */
  async syncWithRegistry(modelRegistry) {
    const models = await this.listModels();

    for (const model of models) {
      await modelRegistry.registerModel({
        provider: model.provider,
        model: model.model,
        name: model.model,
        capabilities: {
          capabilities: model.capabilities || ['chat'],
        },
        status: model.health === 'healthy' ? 'active' : 'degraded',
        healthCheck: {
          lastCheck: new Date(),
          isHealthy: model.health === 'healthy',
        },
      });
    }

    return models.length;
  }
}

/**
 * Factory para crear adapter desde gateway existente
 */
function createLLMGatewayAdapter(llmGateway) {
  return new LLMGatewayAdapter(llmGateway);
}

module.exports = { LLMGatewayAdapter, createLLMGatewayAdapter };
