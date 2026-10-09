/**
 * LocalModelProvider — interfaz base para proveedores de modelos locales.
 *
 * FASE 14: abstracción para que el selector/dashboard no dependa de un
 * runtime concreto. Cada proveedor (Ollama hoy; LM Studio, llama.cpp, vLLM
 * después) implementa esta interfaz: detección, conexión, descubrimiento de
 * modelos, info por modelo, capacidades y manejo de errores de conexión.
 *
 * Reglas:
 *  - No inventar metadatos: si el runtime no expone un dato, se deja
 *    undefined/null y la UI lo muestra como "desconocido" o lo omite.
 *  - Un proveedor desconectado NUNCA lanza hacia arriba: devuelve
 *    { connected:false, error } y el registro lo reporta como tal.
 *  - Todas las URLs de endpoint se validan (SSRF-safe: solo http/https).
 */

const DEFAULT_TIMEOUT_MS = 5000;

class LocalModelProvider {
  /**
   * @param {object} opts
   * @param {string} opts.id            - id interno del proveedor (ej. 'ollama')
   * @param {string} opts.name          - nombre visible (ej. 'Ollama')
   * @param {string} opts.defaultEndpoint - endpoint por defecto
   * @param {boolean} [opts.enabled]    - activado/desactivado
   */
  constructor({ id, name, defaultEndpoint, enabled = true }) {
    this.id = id;
    this.name = name;
    this.defaultEndpoint = defaultEndpoint;
    this.enabled = enabled;
    this._endpointOverride = null;
    this.lastCheckedAt = null;
  }

  /** Endpoint efectivo: override del usuario o default. */
  get endpoint() {
    return this._endpointOverride || this.defaultEndpoint;
  }

  setEndpoint(endpoint) {
    const url = LocalModelProvider.validateEndpoint(endpoint);
    this._endpointOverride = url ? url.replace(/\/+$/, '') : null;
    return Boolean(url);
  }

  /**
   * Valida que un endpoint sea una URL http/https válida (seguridad SSRF
   * básica: bloquea esquemas no-HTTP, credenciales embebidas, fragmentos…).
   * @returns {string|null} URL normalizada o null si es inválida.
   */
  static validateEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return null;
    let url;
    try {
      url = new URL(endpoint.trim());
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (url.hash) return null;
    // Puertos fuera de rango → URL inválida
    if (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) return null;
    return url.toString();
  }

  /**
   * Fetch con timeout hacia el runtime local.
   * NUNCA lanza: devuelve { ok, status, data, error }.
   * `opts` acepta cualquier opción de fetch (method, headers, body) + timeoutMs.
   */
  async _fetch(path, opts = {}) {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOpts } = opts;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.endpoint}${path}`, {
        ...fetchOpts,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(fetchOpts.headers || {}) },
      });
      let data = null;
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return { ok: res.ok, status: res.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: null, error: error.message };
    } finally {
      clearTimeout(timer);
    }
  }

  /** ¿Está disponible (ping ligero)? Implementar en cada proveedor. */
  async isAvailable() {
    throw new Error('isAvailable() not implemented');
  }

  /** Descubre los modelos instalados. Implementar en cada proveedor. */
  async listModels() {
    throw new Error('listModels() not implemented');
  }

  /** Info detallada + capacidades de un modelo. Implementar por proveedor. */
  async getModelInfo(_modelId) {
    throw new Error('getModelInfo() not implemented');
  }

  /**
   * Estado agregado del proveedor: conexión + version + conteo de modelos.
   * Formato estable para la UI: { connected, version, modelCount, error, at }.
   */
  async getStatus() {
    const probe = await this.isAvailable();
    this.lastCheckedAt = new Date().toISOString();
    let modelCount = 0;
    if (probe.connected) {
      try {
        const models = await this.listModels();
        modelCount = models.length;
      } catch {
        /* el conteo es best-effort */
      }
    }
    return {
      connected: probe.connected,
      version: probe.version || null,
      modelCount,
      error: probe.error || null,
      at: this.lastCheckedAt,
    };
  }

  /** Normaliza un modelo del runtime al formato interno (implementar). */
  normalizeModel(_raw) {
    throw new Error('normalizeModel() not implemented');
  }
}

module.exports = { LocalModelProvider, DEFAULT_TIMEOUT_MS };
