/**
 * LLM Runtime - Runtime Funcional para LLMs (JavaScript)
 *
 * Este runtime conecta con el LLMGateway real para ejecutar
 * solicitudes de chat usando proveedores reales.
 *
 * FLUJO:
 * ExecutionEngine → LLMRuntime.execute() → LLMGateway.complete() → Providers
 */

const { getEventBus, EventType } = require('../EventBus');
const { Capability } = require('../RuntimeRegistry');

// Lazy load para evitar circular dependency
let llmGateway = null;
let llmGatewayConfig = null;

const logger = {
  debug: (...args) => console.log('[LLMRuntime]', ...args),
  info: (...args) => console.log('[LLMRuntime]', ...args),
  warn: (...args) => console.warn('[LLMRuntime]', ...args),
  error: (...args) => console.error('[LLMRuntime]', ...args),
};

/**
 * Obtener instancia de LLMGateway.
 * (D8) Sin fallback mock: si el LLMGateway real no carga, lanza el error
 * (no fabrica respuestas). La regla de la auditoría: o funciona de verdad
 * o falla con honestidad.
 */
function getLLMGateway() {
  if (!llmGateway) {
    try {
      const LLMGatewayClass = require('../../LLMGateway/LLMGateway');
      llmGateway = new LLMGatewayClass(llmGatewayConfig);
      logger.info('[LLMRuntime] Connected to real LLMGateway (vía opencode-bridge)');
    } catch (error) {
      logger.error('[LLMRuntime] No se pudo cargar el LLMGateway real:', error.message);
      throw new Error(`LLMRuntime: LLMGateway no disponible — ${error.message}`);
    }
  }
  return llmGateway;
}

/**
 * Configurar LLMGateway
 */
function configureLLMGateway(config) {
  llmGatewayConfig = config;
  // Reset para que se recree con la nueva config
  llmGateway = null;
}

/**
 * LLM Runtime - Clase principal
 */
class LLMRuntime {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.name = 'LLMRuntime';
    this.capabilities = [
      Capability.LLM_CHAT,
      Capability.LLM_VISION,
      Capability.LLM_REASONING,
      Capability.CODE_EXECUTION,
    ];
    this.status = 'initializing';
    this.config = {
      // (D8) El LLM real del proyecto es mi-opencode vía el bridge.
      defaultProvider: config.defaultProvider || 'mi-opencode',
      defaultModel: config.defaultModel || 'mi-opencode-agent',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 4096,
      timeout: config.timeout || 180000,
      ...config,
    };
  }

  /**
   * Inicializar el runtime
   */
  async initialize() {
    try {
      const gateway = getLLMGateway();

      // Test de conexión si es gateway real
      if (gateway && typeof gateway.complete === 'function') {
        this.status = 'ready';
        logger.info('[LLMRuntime] Initialized with provider:', this.config.defaultProvider);

        this.eventBus.publish(
          'runtime.ready',
          {
            runtime: this.name,
            capabilities: this.capabilities,
          },
          'LLMRuntime',
        );

        return true;
      }
    } catch (error) {
      this.status = 'error';
      logger.error('[LLMRuntime] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Ejecutar una tarea de chat
   */
  async execute(task) {
    const startTime = Date.now();
    const { intent, messages, provider, model, capabilities } = task;

    logger.debug('[LLMRuntime] Executing task:', {
      intent: intent?.substring(0, 50),
      provider,
      model,
    });

    this.eventBus.publish(
      EventType.EXECUTION_STARTED,
      {
        runtime: this.name,
        intent,
        provider,
        model,
      },
      'LLMRuntime',
    );

    try {
      // Preparar mensajes
      const chatMessages = this.prepareMessages(intent, messages);

      // Ejecutar en LLMGateway
      const gateway = getLLMGateway();
      const result = await Promise.race([
        gateway.complete({
          messages: chatMessages,
          model: model || this.config.defaultModel,
          provider: provider || this.config.defaultProvider,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), this.config.timeout),
        ),
      ]);

      const duration = Date.now() - startTime;

      this.eventBus.publish(
        EventType.EXECUTION_COMPLETED,
        {
          runtime: this.name,
          duration,
          model: result.model,
          tokens: result.usage?.totalTokens,
        },
        'LLMRuntime',
      );

      return {
        text: result.content,
        raw: result,
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        finishReason: result.finishReason,
        latency: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.eventBus.publish(
        EventType.EXECUTION_FAILED,
        {
          runtime: this.name,
          error: error.message,
          duration,
        },
        'LLMRuntime',
      );

      logger.error('[LLMRuntime] Execution failed:', error.message);
      throw error;
    }
  }

  /**
   * Preparar mensajes para el chat
   */
  prepareMessages(intent, messages) {
    const chatMessages = [];

    // Agregar mensajes anteriores si existen
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        if (typeof msg === 'string') {
          chatMessages.push({ role: 'user', content: msg });
        } else if (msg.role && msg.content) {
          chatMessages.push(msg);
        }
      }
    }

    // Agregar el intent actual
    if (intent) {
      // Si el último mensaje es del usuario, agregar como nuevo
      chatMessages.push({ role: 'user', content: intent });
    }

    return chatMessages;
  }

  /**
   * Verificar salud del runtime
   */
  async healthCheck() {
    try {
      const gateway = getLLMGateway();

      // Test simple
      if (gateway && typeof gateway.complete === 'function') {
        // Solo verificar que el gateway existe
        return this.status === 'ready';
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener capacidades del runtime
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Apagar el runtime
   */
  async shutdown() {
    this.status = 'shutdown';
    logger.info('[LLMRuntime] Shutdown complete');
  }
}

// Singleton
let runtimeInstance = null;

function getLLMRuntime(config) {
  if (!runtimeInstance) {
    runtimeInstance = new LLMRuntime(config);
  }
  return runtimeInstance;
}

function createLLMRuntime(config) {
  runtimeInstance = new LLMRuntime(config);
  return runtimeInstance;
}

module.exports = {
  LLMRuntime,
  getLLMRuntime,
  createLLMRuntime,
  configureLLMGateway,
};
