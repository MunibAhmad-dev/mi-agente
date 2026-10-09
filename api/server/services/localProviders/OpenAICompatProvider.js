/**
 * OpenAICompatProvider — proveedor local OpenAI-compatible.
 *
 * Cubre los runtimes locales que exponen la API de OpenAI (/v1/models,
 * /v1/chat/completions) sin metadatos adicionales:
 *
 *   - llama.cpp     (servidor HTTP, default :8080/v1)
 *   - lms CLI       (LM Studio headless, default :1234/v1)
 *   - mlx-engine    (motor MLX de LM Studio, mismo servidor :1234/v1)
 *   - lmstudio-js   (SDK JS → mismo servidor :1234/v1)
 *   - lmstudio-python (SDK Python → mismo servidor :1234/v1)
 *
 * FASE 17: el selector/dashboard trata a TODOS los proveedores locales por
 * igual (juntos, no separados). Este adapter NO asume LM Studio Desktop/GUI:
 * solo los componentes headless (CLI, SDKs, motores) que exponen el endpoint
 * OpenAI-compatible.
 *
 * Honestidad de datos: /v1/models solo devuelve { id, object, created,
 * owned_by } — no hay tamaño/parámetros/cuantización. Esos campos quedan en
 * null y la UI los omite ("desconocido"), nunca se inventan.
 */

const { LocalModelProvider } = require('./LocalModelProvider');

class OpenAICompatProvider extends LocalModelProvider {
  constructor(opts = {}) {
    super({
      enabled: true,
      // kind: 'server' | 'sdk' | 'engine' — solo informativo para la UI
      kind: 'server',
      ...opts,
    });
  }

  /** Ping ligero: GET /v1/models. */
  async isAvailable() {
    const res = await this._fetch('/v1/models', { timeoutMs: 3000 });
    if (res.ok && res.data) {
      const count = Array.isArray(res.data.data) ? res.data.data.length : 0;
      return { connected: true, version: null, note: `${count} modelos` };
    }
    return {
      connected: false,
      version: null,
      error: res.error ? `no responde (${res.error})` : `HTTP ${res.status || 'sin conexión'}`,
    };
  }

  /** Normaliza un modelo de /v1/models (sin metadatos extra). */
  normalizeModel(raw) {
    if (!raw || typeof raw !== 'object' || !raw.id) return null;
    return {
      id: raw.id,
      name: raw.id,
      provider: this.id,
      qualifiedId: `${this.id}:${raw.id}`,
      sizeBytes: null,
      sizeHuman: null,
      parameters: null,
      quantization: null,
      architecture: null,
      families: [],
      format: null,
      contextLength: null,
      capabilities: [],
      vision: null,
      modifiedAt: null,
      details: { owned_by: raw.owned_by || null },
    };
  }

  async listModels() {
    const res = await this._fetch('/v1/models');
    if (!res.ok) {
      const err = res.error
        ? new Error(`no responde (${res.error})`)
        : new Error(`HTTP ${res.status || 'sin conexión'}`);
      err.status = res.status;
      throw err;
    }
    const models = Array.isArray(res.data && res.data.data) ? res.data.data : [];
    return models.map((m) => this.normalizeModel(m)).filter(Boolean);
  }

  /** Sin info adicional disponible vía /v1/models. */
  async getModelInfo() {
    return null;
  }

  async listModelsDetailed() {
    return this.listModels();
  }
}

module.exports = { OpenAICompatProvider };
