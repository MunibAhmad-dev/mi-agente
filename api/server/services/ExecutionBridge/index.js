/**
 * Execution Bridge - Puente entre flujo antiguo y nuevo
 *
 * Este módulo permite que el sistema cambie entre:
 * - FLUJO_ANTIGUO: chatV1.js → AssistantService → OpenAI SDK
 * - FLUJO_NUEVO: chatV1.js → IntegrationManager → RuntimeRegistry → Runtimes
 *
 * Para activar el flujo nuevo, establecer:
 * ENABLE_ENTERPRISE_ARCHITECTURE=true
 */

const crypto = require('crypto');

// Lazy loading
let integrationManager = null;
let assistantService = null;

/**
 * Determinar qué flujo usar
 */
function shouldUseNewArchitecture() {
  return process.env.ENABLE_ENTERPRISE_ARCHITECTURE === 'true';
}

/**
 * Inicializar IntegrationManager
 */
async function getIntegrationManager() {
  if (!integrationManager) {
    try {
      const { getIntegrationManager: getIM } = require('~/server/services/IntegrationManager');
      integrationManager = getIM();
      await integrationManager.initialize();
    } catch (error) {
      console.error('[ExecutionBridge] Failed to load IntegrationManager:', error);
      throw error;
    }
  }
  return integrationManager;
}

/**
 * Inicializar AssistantService (flujo antiguo)
 */
function getAssistantService() {
  if (!assistantService) {
    assistantService = require('~/server/services/AssistantService');
  }
  return assistantService;
}

/**
 * Procesar solicitud usando el flujo seleccionado
 */
async function execute(params) {
  if (shouldUseNewArchitecture()) {
    return executeWithNewArchitecture(params);
  }
  return executeWithOldArchitecture(params);
}

/**
 * Procesar con la nueva arquitectura
 */
async function executeWithNewArchitecture(params) {
  const manager = await getIntegrationManager();
  const { text, messages, userId, conversationId, ...rest } = params;

  const result = await manager.processRequest({
    type: 'chat',
    intent: text,
    messages: messages || [],
    context: {
      userId,
      conversationId,
    },
  });

  if (!result.success) {
    throw new Error(result.errors?.[0]?.message || 'Execution failed');
  }

  return result.response;
}

/**
 * Procesar con la arquitectura antigua (AssistantService)
 */
async function executeWithOldArchitecture(params) {
  const service = getAssistantService();
  const { openai, thread_id, run_id, in_progress, ...rest } = params;

  // AssistantService espera parámetros diferentes
  return service.runAssistant({
    openai,
    thread_id,
    run_id,
    in_progress,
  });
}

/**
 * Obtener estado del sistema de ejecución
 */
async function getExecutionStatus() {
  if (shouldUseNewArchitecture()) {
    try {
      const manager = await getIntegrationManager();
      return {
        architecture: 'enterprise',
        enabled: true,
        status: manager.getStatus(),
      };
    } catch (error) {
      return {
        architecture: 'enterprise',
        enabled: true,
        status: 'error',
        error: error.message,
      };
    }
  }

  return {
    architecture: 'legacy',
    enabled: false,
  };
}

module.exports = {
  execute,
  executeWithNewArchitecture,
  executeWithOldArchitecture,
  getIntegrationManager,
  getAssistantService,
  shouldUseNewArchitecture,
  getExecutionStatus,
};
