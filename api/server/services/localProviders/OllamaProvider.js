/**
 * OllamaProvider — integración con Ollama (runtime local de modelos GGUF).
 *
 * API nativa usada (sin dependencias externas, solo fetch):
 *   GET /api/version          → { version }                    (health check)
 *   GET /api/tags             → { models: [{ name, size, modified_at,
 *                                           details: { parameter_size,
 *                                                      quantization_level,
 *                                                      family, families, format } }] }
 *   POST /api/show { model }  → { model_info, parameters, template,
 *                                 capabilities, license, system }  (info + capacidades)
 *
 * El formato interno de cada modelo incluye TODOS los metadatos que Ollama
 * expone (nunca se inventan): tamaño, parámetros, cuantización, familia,
 * arquitectura, formato, contexto (cuando /api/show lo reporta), capacidades
 * y modalidad (vision) cuando Ollama las reporta.
 */

const { LocalModelProvider } = require('./LocalModelProvider');

const OLLAMA_DEFAULT_ENDPOINT = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

class OllamaProvider extends LocalModelProvider {
  constructor(opts = {}) {
    super({
      id: 'ollama',
      name: 'Ollama',
      defaultEndpoint: OLLAMA_DEFAULT_ENDPOINT,
      enabled: true,
      ...opts,
    });
  }

  async isAvailable() {
    const res = await this._fetch('/api/version');
    if (res.ok && res.data && res.data.version) {
      return { connected: true, version: res.data.version };
    }
    return {
      connected: false,
      version: null,
      error: res.error ? `no responde (${res.error})` : `HTTP ${res.status || 'sin conexión'}`,
    };
  }

  /**
   * Convierte un tag crudo de /api/tags al formato interno.
   * Solo usa datos reales que Ollama reporta; los que falten quedan null.
   */
  normalizeModel(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const details = raw.details || {};
    const architecture = details.family || null;
    let families = [];
    if (Array.isArray(details.families)) {
      families = details.families;
    } else if (architecture) {
      families = [architecture];
    }

    return {
      id: raw.name,
      name: raw.name,
      provider: this.id,
      // Para el selector se usa siempre `provider:model` para evitar
      // colisiones entre proveedores con modelos de nombre similar.
      qualifiedId: `${this.id}:${raw.name}`,
      sizeBytes: Number.isFinite(raw.size) ? raw.size : null,
      sizeHuman: humanSize(raw.size),
      parameters: details.parameter_size || null,
      quantization: details.quantization_level || null,
      architecture,
      families,
      format: details.format || null,
      contextLength: null, // solo de /api/show (getModelInfo)
      capabilities: [], // solo de /api/show (getModelInfo)
      vision: null, // solo de /api/show (getModelInfo)
      modifiedAt: raw.modified_at || null,
      details,
    };
  }

  async listModels() {
    const res = await this._fetch('/api/tags');
    if (!res.ok) {
      const err = res.error
        ? new Error(`no responde (${res.error})`)
        : new Error(`HTTP ${res.status || 'sin conexión'}`);
      err.status = res.status;
      throw err;
    }
    const models = Array.isArray(res.data && res.data.models) ? res.data.models : [];
    return models.map((m) => this.normalizeModel(m)).filter(Boolean);
  }

  /**
   * Info detallada de un modelo vía POST /api/show. Enriquece el modelo base
   * con contexto, capacidades y modalidad — SOLO si Ollama lo reporta.
   */
  async getModelInfo(modelId) {
    const res = await this._fetch('/api/show', {
      timeoutMs: 15000,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId }),
    });
    if (!res.ok || !res.data) {
      return null;
    }
    const show = res.data;
    const info = show.model_info || {};

    let contextLength = null;
    for (const key of Object.keys(info)) {
      const norm = key.toLowerCase();
      if (norm.endsWith('.context_length') && typeof info[key] === 'number') {
        contextLength = info[key];
        break;
      }
    }

    // Capacidades: Ollama reporta en /api/show un array `capabilities`
    // (p. ej. ['completion','tools','vision','embed']). Si no lo reporta,
    // NO se asumen capacidades (se deja [] = desconocido).
    const rawCaps = Array.isArray(show.capabilities)
      ? show.capabilities.map((c) => String(c).toLowerCase())
      : [];
    const capabilities = rawCaps.filter((c) =>
      ['completion', 'tools', 'vision', 'embed', 'reasoning', 'edit', 'insert'].includes(c),
    );
    const vision = rawCaps.includes('vision');
    const hasTools = rawCaps.includes('tools');

    return {
      model_info: info,
      capabilities,
      vision: rawCaps.length > 0 ? vision : null,
      hasTools: rawCaps.length > 0 ? hasTools : null,
      parameters: show.parameters || null,
      template: show.template || null,
      license: show.license || null,
      system: show.system || null,
      contextLength,
    };
  }

  /** Lista completa para la UI: base + enriquecimiento best-effort. */
  async listModelsDetailed() {
    const models = await this.listModels();
    const enriched = await Promise.all(
      models.map(async (model) => {
        try {
          const info = await this.getModelInfo(model.id);
          if (info) {
            model.contextLength = info.contextLength;
            model.capabilities = info.capabilities;
            model.vision = info.vision;
            model.hasTools = info.hasTools;
            // FASE 28: licencia real reportada por Ollama (/api/show) para
            // mostrarla en la pestaña Instalados (nunca se inventa).
            model.license = info.license || null;
            model.show = {
              parameters: info.parameters,
              template: info.template,
              license: info.license,
              system: info.system,
              model_info: info.model_info,
            };
          }
        } catch {
          /* enriquecimiento best-effort: el modelo base ya es válido */
        }
        return model;
      }),
    );
    return enriched;
  }
}

module.exports = { OllamaProvider, OLLAMA_DEFAULT_ENDPOINT };
