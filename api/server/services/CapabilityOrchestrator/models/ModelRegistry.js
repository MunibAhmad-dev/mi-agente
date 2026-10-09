/**
 * ModelRegistry — registro de modelos con índice invertido por capacidad.
 *
 * API:
 *   registerModel(modelInfo)
 *   findByCapabilities(required, options)
 *   getModel(modelId)
 *   getAllModels()
 *
 * Each registered model is identified by `provider:model` as its modelId.
 * findByCapabilities returns candidates sorted by matchScore (caller sorts).
 */

class ModelRegistry {
  constructor({ logger = console } = {}) {
    this._logger = logger;
    /** @type {Map<string, object>} modelId → model record */
    this._models = new Map();
    /** @type {Map<string, Set<string>>} capability → Set of modelIds */
    this._capabilityIndex = new Map();
  }

  /**
   * @param {object} info
   * @param {string} info.provider
   * @param {string} info.model
   * @param {string} [info.name]
   * @param {string} [info.description]
   * @param {{ capabilities: string[] }} info.capabilities
   * @param {{ avgLatency?: number }} [info.metrics]
   * @param {{ input: number, output: number }} [info.costPer1K]
   * @param {{ maxContext?: number, maxTokens?: number }} [info.limits]
   * @param {string} [info.status]
   * @param {{ isHealthy?: boolean, lastCheck?: Date }} [info.healthCheck]
   */
  registerModel(info) {
    const modelId = `${info.provider}:${info.model}`;
    const record = {
      modelId,
      provider: info.provider,
      model: info,
      name: info.name || info.model,
      description: info.description || '',
      capabilities: (info.capabilities && info.capabilities.capabilities) || [],
      estimatedLatency: (info.metrics && info.metrics.avgLatency) || 0,
      costPer1K: info.costPer1K || { input: 0, output: 0 },
      limits: info.limits || {},
      status: info.status || 'active',
      isHealthy: info.healthCheck ? (info.healthCheck.isHealthy !== false) : true,
    };

    this._models.set(modelId, record);

    for (const cap of record.capabilities) {
      if (!this._capabilityIndex.has(cap)) {
        this._capabilityIndex.set(cap, new Set());
      }
      this._capabilityIndex.get(cap).add(modelId);
    }
  }

  /**
   * Find models matching the given capabilities.
   *
   * @param {string[]} required
   * @param {{ matchAll?: boolean, activeOnly?: boolean, healthyOnly?: boolean, exclude?: string[] }} opts
   * @returns {Array<object>} candidates with matchScore, matchedCapabilities, missingCapabilities
   */
  findByCapabilities(required = [], opts = {}) {
    const { matchAll = false, activeOnly = true, healthyOnly = true, exclude = [] } = opts;
    const excludeSet = new Set(exclude || []);

    const candidates = [];

    for (const [modelId, record] of this._models) {
      if (excludeSet.has(modelId)) continue;
      if (activeOnly && record.status !== 'active') continue;
      if (healthyOnly && !record.isHealthy) continue;

      const modelCaps = new Set(record.capabilities);
      const matched = required.filter((c) => modelCaps.has(c));
      const missing = required.filter((c) => !modelCaps.has(c));

      if (matchAll && missing.length > 0) continue;
      if (required.length > 0 && matched.length === 0) continue;

      const matchScore = required.length > 0 ? matched.length / required.length : 1;

      candidates.push({
        modelId,
        provider: record.provider,
        model: record.model,
        name: record.name,
        matchScore,
        matchedCapabilities: matched,
        missingCapabilities: missing,
        estimatedLatency: record.estimatedLatency,
        status: record.status,
        isHealthy: record.isHealthy,
      });
    }

    return candidates;
  }

  getModel(modelId) {
    return this._models.get(modelId) || null;
  }

  getAllModels() {
    return Array.from(this._models.values());
  }

  get size() {
    return this._models.size;
  }
}

module.exports = { ModelRegistry };
