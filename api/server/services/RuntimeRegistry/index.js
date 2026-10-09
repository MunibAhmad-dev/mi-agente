/**
 * Runtime Registry - Registro Centralizado de Runtimes (JavaScript)
 *
 * Responsabilidades:
 * - Registrar todos los runtimes del sistema
 * - Proveer acceso unificado a runtimes
 * - Health checks de runtimes
 * - Selección de runtime por capacidad
 *
 * FLUJO:
 * IntegrationManager → RuntimeRegistry → Runtimes específicos
 */

// Dependencias
const { getEventBus, EventType } = require('../EventBus');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const logger = {
  debug: (...args) => console.log('[RuntimeRegistry]', ...args),
  info: (...args) => console.log('[RuntimeRegistry]', ...args),
  warn: (...args) => console.warn('[RuntimeRegistry]', ...args),
  error: (...args) => console.error('[RuntimeRegistry]', ...args),
};

// Capacidades disponibles
const Capability = {
  // LLM
  LLM_CHAT: 'llm.chat',
  LLM_VISION: 'llm.vision',
  LLM_REASONING: 'llm.reasoning',
  LLM_FUNCTION_CALLING: 'llm.function_calling',
  LLM_STREAMING: 'llm.streaming',
  LLM_LONG_CONTEXT: 'llm.long_context',

  // Code
  CODE_EXECUTION: 'code.execution',
  CODE_FILESYSTEM: 'code.filesystem',
  CODE_TERMINAL: 'code.terminal',
  CODE_GIT: 'code.git',

  // Media
  IMAGE_GENERATION: 'media.image_generation',
  IMAGE_EDITING: 'media.image_editing',
  VIDEO_GENERATION: 'media.video_generation',
  AUDIO_TTS: 'media.tts',
  AUDIO_STT: 'media.stt',

  // Search
  WEB_SEARCH: 'search.web',
  DOCUMENT_SEARCH: 'search.document',

  // Storage
  FILE_STORAGE: 'storage.file',
  DATABASE: 'storage.database',

  // Browser
  BROWSER_AUTOMATION: 'browser.automation',

  // RAG
  RAG_RETRIEVAL: 'rag.retrieval',
  RAG_EMBEDDING: 'rag.embedding',
};

/**
 * Runtime Registry
 */
class RuntimeRegistry {
  constructor() {
    this.eventBus = getEventBus();
    this.runtimes = new Map();
    this.initialized = false;

    logger.info('[RuntimeRegistry] Initialized');
  }

  /**
   * Registrar un runtime
   */
  register(runtime) {
    if (!runtime || !runtime.name) {
      throw new Error('Runtime must have a name');
    }

    this.runtimes.set(runtime.name, {
      ...runtime,
      registeredAt: Date.now(),
      status: 'registered',
    });

    this.eventBus.publish(
      EventType.RUNTIME_REGISTERED,
      {
        name: runtime.name,
        capabilities: runtime.capabilities,
      },
      'RuntimeRegistry',
    );

    logger.info(`[RuntimeRegistry] Registered runtime: ${runtime.name}`);
  }

  /**
   * Desregistrar un runtime
   */
  unregister(name) {
    const runtime = this.runtimes.get(name);
    if (runtime) {
      this.runtimes.delete(name);
      logger.info(`[RuntimeRegistry] Unregistered runtime: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Obtener un runtime por nombre
   */
  get(name) {
    return this.runtimes.get(name);
  }

  /**
   * Listar todos los runtimes
   */
  list() {
    return Array.from(this.runtimes.values());
  }

  /**
   * Buscar runtimes por capacidad
   */
  findByCapability(capability) {
    return this.list().filter(
      (runtime) => runtime.capabilities && runtime.capabilities.includes(capability),
    );
  }

  /**
   * Verificar si un runtime existe
   */
  has(name) {
    return this.runtimes.has(name);
  }

  /**
   * Obtener runtime para una tarea específica
   */
  findForTask(requiredCapabilities) {
    if (!Array.isArray(requiredCapabilities)) {
      requiredCapabilities = [requiredCapabilities];
    }

    const candidates = this.list()
      .filter((runtime) => runtime.status !== 'disabled')
      .map((runtime) => {
        const matchedCapabilities = requiredCapabilities.filter(
          (cap) => runtime.capabilities && runtime.capabilities.includes(cap),
        );
        return {
          runtime,
          matchScore: matchedCapabilities.length / requiredCapabilities.length,
          matchedCapabilities,
        };
      })
      .filter((candidate) => candidate.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);

    if (candidates.length > 0) {
      return candidates[0].runtime;
    }

    return null;
  }

  /**
   * Inicializar todos los runtimes registrados
   */
  async initializeAll() {
    if (this.initialized) {
      return;
    }

    logger.info('[RuntimeRegistry] Initializing all runtimes...');

    for (const [name, runtime] of this.runtimes) {
      try {
        if (typeof runtime.initialize === 'function') {
          await runtime.initialize();
          runtime.status = 'initialized';
          logger.info(`[RuntimeRegistry] Initialized: ${name}`);
        }
      } catch (error) {
        runtime.status = 'error';
        runtime.error = error.message;
        logger.error(`[RuntimeRegistry] Failed to initialize ${name}:`, error);
      }
    }

    this.initialized = true;
    logger.info(`[RuntimeRegistry] All runtimes initialized. Total: ${this.runtimes.size}`);
  }

  /**
   * Apagar todos los runtimes
   */
  async shutdownAll() {
    logger.info('[RuntimeRegistry] Shutting down all runtimes...');

    for (const [name, runtime] of this.runtimes) {
      try {
        if (typeof runtime.shutdown === 'function') {
          await runtime.shutdown();
          runtime.status = 'shutdown';
          logger.info(`[RuntimeRegistry] Shutdown: ${name}`);
        }
      } catch (error) {
        logger.error(`[RuntimeRegistry] Error shutting down ${name}:`, error);
      }
    }

    this.runtimes.clear();
    this.initialized = false;
  }

  /**
   * Health check de todos los runtimes
   */
  async healthCheck() {
    const results = new Map();

    for (const [name, runtime] of this.runtimes) {
      try {
        if (typeof runtime.healthCheck === 'function') {
          results.set(name, await runtime.healthCheck());
        } else {
          results.set(name, runtime.status === 'initialized');
        }
      } catch (error) {
        results.set(name, false);
      }
    }

    return results;
  }

  /**
   * Obtener estado consolidado
   */
  getStatus() {
    const runtimes = this.list();
    const healthy = runtimes.filter((r) => r.status === 'initialized').length;
    const unhealthy = runtimes.length - healthy;

    return {
      initialized: this.initialized,
      total: runtimes.length,
      healthy,
      unhealthy,
      runtimes: runtimes.map((r) => ({
        name: r.name,
        status: r.status,
        capabilities: r.capabilities,
      })),
    };
  }
}

// Singleton
let registryInstance = null;

function getRuntimeRegistry() {
  if (!registryInstance) {
    registryInstance = new RuntimeRegistry();
  }
  return registryInstance;
}

function createRuntimeRegistry() {
  registryInstance = new RuntimeRegistry();
  return registryInstance;
}

module.exports = {
  RuntimeRegistry,
  getRuntimeRegistry,
  createRuntimeRegistry,
  Capability,
};
