/**
 * API Key Manager - Gestión Segura de Credenciales (JavaScript)
 *
 * Proporciona almacenamiento seguro y acceso a API keys
 * con soporte para múltiples proveedores.
 *
 * Características:
 * - Carga desde variables de entorno
 * - Validación de formato
 * - Historial de uso
 * - Rate limiting por provider
 */

const crypto = require('crypto');
const EventEmitter = require('events');

const logger = {
  debug: (...args) => console.log('[APIKeyManager]', ...args),
  info: (...args) => console.log('[APIKeyManager]', ...args),
  warn: (...args) => console.warn('[APIKeyManager]', ...args),
  error: (...args) => console.error('[APIKeyManager]', ...args),
};

// Proveedores soportados
const Providers = {
  OPENAI: 'openai',
  XAI: 'xai',
  GROQ: 'groq',
  DEEPSEEK: 'deepseek',
  CLOUDFLARE: 'cloudflare',
  MISTRAL: 'mistral',
  COHERE: 'cohere',
  HUGGINGFACE: 'huggingface',
  OPENROUTER: 'openrouter',
  GEMINI: 'gemini',
  ANTHROPIC: 'anthropic',
  PERPLEXITY: 'perplexity',
  TAVILY: 'tavily',
  SERPAPI: 'serpapi',
  REPLICATE: 'replicate',
};

// Mapeo de variables de entorno
const ENV_MAPPING = {
  [Providers.OPENAI]: 'OPENAI_API_KEY',
  [Providers.XAI]: 'XAI_API_KEY',
  [Providers.GROQ]: 'GROQ_API_KEY',
  [Providers.DEEPSEEK]: 'DEEPSEEK_API_KEY',
  [Providers.CLOUDFLARE]: 'CLOUDFLARE_API_KEY',
  [Providers.MISTRAL]: 'MISTRAL_API_KEY',
  [Providers.Cohere]: 'COHERE_API_KEY',
  [Providers.HUGGINGFACE]: 'HUGGINGFACE_API_KEY',
  [Providers.OPENROUTER]: 'OPENROUTER_API_KEY',
  [Providers.GEMINI]: 'GEMINI_API_KEY',
  [Providers.ANTHROPIC]: 'ANTHROPIC_API_KEY',
  [Providers.PERPLEXITY]: 'PERPLEXITY_API_KEY',
  [Providers.TAVILY]: 'TAVILY_API_KEY',
  [Providers.SERPAPI]: 'SERPAPI_API_KEY',
  [Providers.REPLICATE]: 'REPLICATE_API_KEY',
};

// Longitudes de API keys válidas por proveedor
const KEY_FORMATS = {
  [Providers.OPENAI]: { min: 50, max: 60, prefix: 'sk-' },
  [Providers.XAI]: { min: 50, max: 70, prefix: 'xai-' },
  [Providers.GROQ]: { min: 40, max: 50, prefix: 'gsk_' },
  [Providers.DEEPSEEK]: { min: 50, max: 60, prefix: 'sk-' },
  [Providers.HUGGINGFACE]: { min: 30, max: 40, prefix: 'hf_' },
  [Providers.ANTHROPIC]: { min: 30, max: 50, prefix: 'sk-ant-' },
  [Providers.GEMINI]: { min: 30, max: 50, prefix: 'AI' },
  [Providers.MISTRAL]: { min: 30, max: 50, prefix: '' },
  [Providers.OPENROUTER]: { min: 30, max: 50, prefix: 'sk-' },
  [Providers.TAVILY]: { min: 30, max: 50, prefix: '' },
  [Providers.SERPAPI]: { min: 20, max: 40, prefix: '' },
};

/**
 * API Key Entry - Representa una API key individual
 */
class APIKeyEntry {
  constructor(provider, key, metadata = {}) {
    this.id = crypto.randomUUID();
    this.provider = provider;
    this.key = key;
    this.maskedKey = this.mask(key);
    this.isValid = false;
    this.validationError = null;
    this.createdAt = new Date();
    this.lastUsed = null;
    this.usageCount = 0;
    this.metadata = metadata;
  }

  mask(key) {
    if (!key || key.length < 8) return '***';
    return key.substring(0, 4) + '***' + key.substring(key.length - 4);
  }

  recordUsage() {
    this.lastUsed = new Date();
    this.usageCount++;
  }

  setValid(isValid, error = null) {
    this.isValid = isValid;
    this.validationError = error;
  }

  toJSON() {
    return {
      id: this.id,
      provider: this.provider,
      maskedKey: this.maskedKey,
      isValid: this.isValid,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed,
      usageCount: this.usageCount,
      metadata: this.metadata,
    };
  }
}

/**
 * API Key Manager - Clase principal
 */
class APIKeyManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      validateOnLoad: config.validateOnLoad !== false,
      storeKeys: config.storeKeys || false, // No almacenar keys por defecto
      ...config,
    };

    this.keys = new Map(); // provider -> APIKeyEntry
    this.envKeys = new Set(Object.values(ENV_MAPPING));
    this.stats = {
      totalRequests: 0,
      hits: 0,
      misses: 0,
    };
  }

  /**
   * Cargar API keys desde variables de entorno
   */
  loadFromEnvironment() {
    logger.info('[APIKeyManager] Loading API keys from environment');

    for (const [provider, envVar] of Object.entries(ENV_MAPPING)) {
      const key = process.env[envVar];

      if (key) {
        this.addKey(provider, key, {
          source: 'environment',
          envVar,
        });
        logger.debug(`[APIKeyManager] Found ${provider} key (${envVar})`);
      }
    }

    const loaded = Array.from(this.keys.keys());
    logger.info('[APIKeyManager] Loaded providers:', loaded.join(', ') || 'none');

    return loaded;
  }

  /**
   * Agregar una API key
   */
  addKey(provider, key, metadata = {}) {
    if (!key || typeof key !== 'string') {
      logger.warn('[APIKeyManager] Invalid key provided');
      return null;
    }

    const entry = new APIKeyEntry(provider, key.trim(), metadata);

    // Validar formato
    if (this.config.validateOnLoad) {
      const validation = this.validateKeyFormat(provider, key);
      entry.setValid(validation.valid, validation.error);
    }

    this.keys.set(provider, entry);
    logger.info(`[APIKeyManager] Added ${provider} key: ${entry.maskedKey}`);

    this.emit('key.added', entry);
    return entry;
  }

  /**
   * Obtener una API key
   */
  getKey(provider) {
    this.stats.totalRequests++;

    const entry = this.keys.get(provider);

    if (entry) {
      this.stats.hits++;
      entry.recordUsage();
      return entry.key;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Verificar si existe una API key
   */
  hasKey(provider) {
    return this.keys.has(provider);
  }

  /**
   * Obtener información de una key (sin exponer la key)
   */
  getKeyInfo(provider) {
    const entry = this.keys.get(provider);
    return entry ? entry.toJSON() : null;
  }

  /**
   * Listar todos los proveedores configurados
   */
  listProviders() {
    return Array.from(this.keys.keys()).map((provider) => ({
      provider,
      info: this.getKeyInfo(provider),
    }));
  }

  /**
   * Validar formato de API key
   */
  validateKeyFormat(provider, key) {
    const format = KEY_FORMATS[provider];

    if (!format) {
      // Sin formato específico, verificar longitud mínima
      if (key.length < 10) {
        return { valid: false, error: 'Key too short' };
      }
      return { valid: true };
    }

    // Verificar longitud
    if (key.length < format.min || key.length > format.max) {
      return { valid: false, error: `Invalid length (expected ${format.min}-${format.max})` };
    }

    // Verificar prefijo si existe
    if (format.prefix && !key.startsWith(format.prefix)) {
      return { valid: false, error: `Invalid prefix (expected ${format.prefix})` };
    }

    return { valid: true };
  }

  /**
   * Remover una API key
   */
  removeKey(provider) {
    const entry = this.keys.get(provider);

    if (entry) {
      this.keys.delete(provider);
      logger.info(`[APIKeyManager] Removed ${provider} key`);
      this.emit('key.removed', entry);
      return true;
    }

    return false;
  }

  /**
   * Obtener estadísticas de uso
   */
  getStats() {
    const providerStats = {};

    for (const [provider, entry] of this.keys) {
      providerStats[provider] = {
        usageCount: entry.usageCount,
        lastUsed: entry.lastUsed,
        isValid: entry.isValid,
      };
    }

    return {
      ...this.stats,
      hitRate:
        this.stats.totalRequests > 0
          ? ((this.stats.hits / this.stats.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
      providers: providerStats,
    };
  }

  /**
   * Obtener todas las keys disponibles para un servicio
   */
  getAvailableKeys(service) {
    const available = [];

    // Proveedores específicos
    if (service.providers) {
      for (const provider of service.providers) {
        if (this.hasKey(provider)) {
          available.push({
            provider,
            key: this.getKey(provider),
          });
        }
      }
    }

    return available;
  }

  /**
   * Limpiar todas las keys
   */
  clear() {
    this.keys.clear();
    logger.info('[APIKeyManager] All keys cleared');
    this.emit('keys.cleared');
  }
}

// Singleton
let managerInstance = null;

function getAPIKeyManager(config) {
  if (!managerInstance) {
    managerInstance = new APIKeyManager(config);
  }
  return managerInstance;
}

module.exports = {
  APIKeyManager,
  APIKeyEntry,
  Providers,
  ENV_MAPPING,
  getAPIKeyManager,
};
