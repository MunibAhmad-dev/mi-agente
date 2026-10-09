/**
 * Context Manager Service
 * =======================
 * Sistema de gestión de contexto para conversaciones con IA
 *
 * Responsabilidades:
 * - Mantener contexto de conversación
 * - Resumir conversaciones largas
 * - Manejar windowing de mensajes
 * - Extraer información relevante
 * - Gestionar límites de tokens
 *
 * @example
 * const contextManager = require('./ContextManagerService');
 *
 * // Crear contexto para una conversación
 * const ctx = contextManager.createContext(conversationId, {
 *   maxTokens: 8192,
 *   strategy: 'sliding',
 * });
 *
 * // Agregar mensaje
 * ctx.addMessage({ role: 'user', content: 'Hello' });
 */

const { logger } = require('@librechat/data-schemas');
const { getLogStores } = require('~/cache');

const CONTEXT_COLLECTION = 'context_manager';

const WINDOWING_STRATEGY = {
  SLIDING: 'sliding', // Ventana deslizante
  SUMMARIZE: 'summarize', // Resumir cuando se llena
  SEMANTIC: 'semantic', // Por relevancia semántica
};

const MESSAGE_PRIORITY = {
  SYSTEM: 3, // Siempre incluir
  USER: 2, // Alta prioridad
  ASSISTANT: 1, // Media prioridad
  TOOL: 0, // Baja prioridad (excepto últimos)
};

/**
 * Context Manager Service
 */
class ContextManagerService {
  constructor() {
    /** @type {Map<string, Context>} */
    this.contexts = new Map();

    /** @type {Redis|undefined} */
    this.cache = undefined;

    /** @type {Map<string, Function>} */
    this.summarizers = new Map();
  }

  /**
   * Inicializa el servicio
   */
  async initialize() {
    try {
      this.cache = getLogStores(CONTEXT_COLLECTION);
      logger.info('[ContextManagerService] Initialized');
    } catch (error) {
      logger.error('[ContextManagerService] Failed to initialize', error);
    }
  }

  /**
   * Crea un nuevo contexto
   * @param {string} conversationId - ID de conversación
   * @param {object} options - Opciones del contexto
   */
  createContext(conversationId, options = {}) {
    const {
      maxTokens = 8192,
      strategy = WINDOWING_STRATEGY.SLIDING,
      preserveSystem = true,
      preserveLastN = 2, // Últimos N mensajes siempre
      summarizer = null,
    } = options;

    const context = {
      id: conversationId,
      messages: [],
      maxTokens,
      strategy,
      preserveSystem,
      preserveLastN,
      totalTokens: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    this.contexts.set(conversationId, context);

    // Registrar summarizer si se proporciona
    if (summarizer) {
      this.summarizers.set(conversationId, summarizer);
    }

    logger.debug(`[ContextManagerService] Created context for: ${conversationId}`);

    return context;
  }

  /**
   * Obtiene un contexto existente
   * @param {string} conversationId - ID de conversación
   */
  getContext(conversationId) {
    return this.contexts.get(conversationId);
  }

  /**
   * Elimina un contexto
   * @param {string} conversationId - ID de conversación
   */
  deleteContext(conversationId) {
    this.contexts.delete(conversationId);
    this.summarizers.delete(conversationId);

    // Eliminar de Redis si está persiste
    if (this.cache) {
      this.cache.del(`context:${conversationId}`).catch(() => {});
    }

    logger.debug(`[ContextManagerService] Deleted context for: ${conversationId}`);
  }

  /**
   * Agrega un mensaje al contexto
   * @param {string} conversationId - ID de conversación
   * @param {object} message - Mensaje a agregar
   * @param {number} messageTokens - Tokens aproximados del mensaje
   */
  addMessage(conversationId, message, messageTokens = null) {
    let context = this.contexts.get(conversationId);

    if (!context) {
      context = this.createContext(conversationId);
    }

    const tokens = messageTokens ?? this.estimateTokens(message);

    // Agregar mensaje
    context.messages.push({
      ...message,
      _tokens: tokens,
      _addedAt: new Date(),
    });

    context.totalTokens += tokens;
    context.updatedAt = new Date();

    // Aplicar strategy si se excede el límite
    if (context.totalTokens > context.maxTokens) {
      this.applyWindowingStrategy(context);
    }

    return context;
  }

  /**
   * Aplica la estrategia de windowing
   * @param {object} context - Contexto
   */
  applyWindowingStrategy(context) {
    switch (context.strategy) {
      case WINDOWING_STRATEGY.SLIDING:
        this.applySlidingWindow(context);
        break;
      case WINDOWING_STRATEGY.SUMMARIZE:
        this.applySummarizeStrategy(context);
        break;
      case WINDOWING_STRATEGY.SEMANTIC:
        this.applySemanticStrategy(context);
        break;
      default:
        this.applySlidingWindow(context);
    }
  }

  /**
   * Estrategia: Sliding Window
   * Mantiene los últimos mensajes hasta caber en maxTokens
   */
  applySlidingWindow(context) {
    let totalTokens = 0;
    const preservedMessages = [];

    // Siempre preservar mensajes del sistema
    if (context.preserveSystem) {
      const systemMessages = context.messages.filter((m) => m.role === 'system');
      for (const msg of systemMessages) {
        totalTokens += msg._tokens;
        preservedMessages.push(msg);
      }
    }

    // Siempre preservar últimos N mensajes
    const lastN = context.messages.slice(-context.preserveLastN);
    for (const msg of lastN) {
      totalTokens += msg._tokens;
      preservedMessages.push(msg);
    }

    // Agregar mensajes del medio si hay espacio
    const middleMessages = context.messages.filter(
      (m) => m.role !== 'system' && !lastN.includes(m),
    );

    // Iterar desde el más reciente hacia atrás
    for (let i = middleMessages.length - 1; i >= 0; i--) {
      const msg = middleMessages[i];
      if (totalTokens + msg._tokens <= context.maxTokens * 0.9) {
        preservedMessages.unshift(msg);
        totalTokens += msg._tokens;
      } else {
        break;
      }
    }

    context.messages = preservedMessages;
    context.totalTokens = totalTokens;

    logger.debug(
      `[ContextManagerService] Applied sliding window: ${preservedMessages.length} messages, ${totalTokens} tokens`,
    );
  }

  /**
   * Estrategia: Summarize
   * Resume el contexto cuando se llena
   */
  async applySummarizeStrategy(context) {
    const summarizer = this.summarizers.get(context.id);

    if (summarizer && context.messages.length > 10) {
      try {
        // Obtener mensajes a resumir (excluyendo últimos y sistema)
        const messagesToSummarize = context.messages
          .filter((m) => m.role !== 'system')
          .slice(0, -context.preserveLastN);

        if (messagesToSummarize.length > 5) {
          // Crear resumen
          const summary = await summarizer(messagesToSummarize);

          // Reemplazar mensajes con resumen
          context.messages = [
            ...context.messages.filter((m) => m.role === 'system'),
            {
              role: 'system',
              content: `Previous conversation summary: ${summary}`,
              _tokens: this.estimateTokens({ content: summary }),
              _isSummary: true,
            },
            ...context.messages.slice(-context.preserveLastN),
          ];

          context.totalTokens = context.messages.reduce((sum, m) => sum + m._tokens, 0);

          logger.debug(
            `[ContextManagerService] Applied summarize strategy: ${messagesToSummarize.length} messages summarized`,
          );
          return;
        }
      } catch (error) {
        logger.error('[ContextManagerService] Summarization failed', error);
      }
    }

    // Fallback a sliding window
    this.applySlidingWindow(context);
  }

  /**
   * Estrategia: Semantic
   * Mantiene mensajes más relevantes según embedding
   */
  applySemanticStrategy(context) {
    // Por ahora, fallback a sliding window
    // La implementación completa requeriría embeddings
    this.applySlidingWindow(context);
  }

  /**
   * Obtiene los mensajes formateados para el LLM
   * @param {string} conversationId - ID de conversación
   */
  getMessages(conversationId) {
    const context = this.contexts.get(conversationId);
    if (!context) {
      return [];
    }

    return context.messages.map((m) => {
      const { _tokens, _addedAt, _isSummary, ...msg } = m;
      return msg;
    });
  }

  /**
   * Obtiene el contexto completo
   * @param {string} conversationId - ID de conversación
   */
  getFullContext(conversationId) {
    return this.contexts.get(conversationId);
  }

  /**
   * Actualiza el último mensaje
   * @param {string} conversationId - ID de conversación
   * @param {object} update - Actualización
   */
  updateLastMessage(conversationId, update) {
    const context = this.contexts.get(conversationId);
    if (!context || context.messages.length === 0) {
      return null;
    }

    const lastIndex = context.messages.length - 1;
    const lastMessage = context.messages[lastIndex];

    // Calcular diferencia de tokens
    const oldTokens = lastMessage._tokens;
    const newTokens = this.estimateTokens({ ...lastMessage, ...update });
    const tokenDiff = newTokens - oldTokens;

    context.messages[lastIndex] = {
      ...lastMessage,
      ...update,
      _tokens: newTokens,
    };

    context.totalTokens += tokenDiff;
    context.updatedAt = new Date();

    return context.messages[lastIndex];
  }

  /**
   * Serializa el contexto para persistencia
   * @param {string} conversationId - ID de conversación
   */
  async serialize(conversationId) {
    const context = this.contexts.get(conversationId);
    if (!context) {
      return null;
    }

    return JSON.stringify({
      ...context,
      messages: context.messages.map((m) => {
        const { _tokens, _addedAt, ...msg } = m;
        return msg;
      }),
    });
  }

  /**
   * Carga un contexto serializado
   * @param {string} conversationId - ID de conversación
   * @param {string} serialized - Contexto serializado
   */
  async deserialize(conversationId, serialized) {
    try {
      const data = JSON.parse(serialized);
      const context = {
        ...data,
        messages: data.messages.map((m) => ({
          ...m,
          _tokens: this.estimateTokens(m),
          _addedAt: new Date(),
        })),
        totalTokens: data.messages.reduce((sum, m) => sum + this.estimateTokens(m), 0),
      };

      this.contexts.set(conversationId, context);
      return context;
    } catch (error) {
      logger.error('[ContextManagerService] Failed to deserialize context', error);
      return null;
    }
  }

  /**
   * Persiste el contexto en Redis
   * @param {string} conversationId - ID de conversación
   */
  async persist(conversationId) {
    if (!this.cache) {
      return;
    }

    const serialized = await this.serialize(conversationId);
    if (serialized) {
      await this.cache.set(`context:${conversationId}`, serialized);
    }
  }

  /**
   * Carga el contexto desde Redis
   * @param {string} conversationId - ID de conversación
   */
  async load(conversationId) {
    if (!this.cache) {
      return null;
    }

    const serialized = await this.cache.get(`context:${conversationId}`);
    if (serialized) {
      return await this.deserialize(conversationId, serialized);
    }
    return null;
  }

  /**
   * Estima tokens de un mensaje (aproximado)
   * @param {object} message - Mensaje
   */
  estimateTokens(message) {
    const content =
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

    // Aproximación: ~4 caracteres por token en inglés, ~2 en español
    // Usamos 4 como aproximación segura
    return Math.ceil(content.length / 4) + 10; // +10 por overhead de role/etc
  }

  /**
   * Obtiene estadísticas del contexto
   * @param {string} conversationId - ID de conversación
   */
  getStats(conversationId) {
    const context = this.contexts.get(conversationId);
    if (!context) {
      return null;
    }

    const messagesByRole = {};
    for (const msg of context.messages) {
      messagesByRole[msg.role] = (messagesByRole[msg.role] || 0) + 1;
    }

    return {
      id: context.id,
      messageCount: context.messages.length,
      totalTokens: context.totalTokens,
      maxTokens: context.maxTokens,
      utilizationPercent: Math.round((context.totalTokens / context.maxTokens) * 100),
      strategy: context.strategy,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
      messagesByRole,
    };
  }

  /**
   * Lista contextos activos
   */
  listContexts() {
    return Array.from(this.contexts.keys());
  }

  /**
   * Limpia contextos inactivos
   * @param {number} maxAgeMs - Edad máxima en ms
   */
  cleanupInactiveContexts(maxAgeMs = 3600000) {
    // 1 hora por defecto
    const now = Date.now();
    const toDelete = [];

    for (const [id, context] of this.contexts) {
      const age = now - new Date(context.updatedAt).getTime();
      if (age > maxAgeMs) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.deleteContext(id);
    }

    if (toDelete.length > 0) {
      logger.info(`[ContextManagerService] Cleaned up ${toDelete.length} inactive contexts`);
    }

    return toDelete.length;
  }
}

// Singleton
let instance = null;

function getContextManagerService() {
  if (!instance) {
    instance = new ContextManagerService();
  }
  return instance;
}

module.exports = {
  ContextManagerService,
  getContextManagerService,
  WINDOWING_STRATEGY,
  MESSAGE_PRIORITY,
};
