/**
 * Chat Instrumenter Service
 *
 * Conecta el sistema de chat/agentes con el EventBus de supervisión.
 * Publica eventos cuando el agente:
 * - Piensa (estados de razonamiento)
 * - Usa herramientas
 * - Modifica archivos
 * - Ejecuta comandos
 * - Consulta documentos
 * - Termina tareas
 *
 * NO produce interfaz gráfica - solo instrumentación del backend.
 */

const { getEventBus } = require('./index');
const {
  SupervisorEventTypes,
  createAgentPayload,
  createTaskPayload,
  createSessionPayload,
} = require('./SupervisorEventTypes');

/**
 * Nombres de herramientas por categoría
 */
const TOOL_CATEGORIES = {
  // Archivos
  READ_FILE: ['read_file', 'ReadFile', 'read_file_tool', 'file_reader'],
  WRITE_FILE: ['create_file', 'edit_file', 'write_file', 'WriteFile', 'CreateFile', 'EditFile'],
  DELETE_FILE: ['delete_file', 'remove_file', 'DeleteFile', 'RemoveFile'],
  LIST_FILES: ['list_files', 'ls', 'ListFiles'],

  // Comandos/Terminal
  BASH: ['bash_tool', 'bash', 'run_command', 'BashTool', 'Bash', 'RunCommand'],
  EXEC: ['execute', 'exec', 'run_script', 'Execute', 'Exec', 'RunScript'],

  // Navegador
  BROWSER: ['browser_use', 'browser', 'navigate', 'BrowserUse', 'Browser', 'Navigate'],
  FETCH: ['fetch_url', 'fetch', 'FetchUrl', 'Fetch'],

  // Búsqueda/Documentos
  SEARCH: ['search', 'web_search', 'google_search', 'Search', 'WebSearch'],
  RAG: ['rag_search', 'vector_search', 'RagSearch', 'VectorSearch'],

  // Git
  GIT: ['git', 'git_tool', 'Git', 'GitTool'],
};

/**
 * Herramientas que modifican archivos
 */
const FILE_MODIFYING_TOOLS = [...TOOL_CATEGORIES.WRITE_FILE, ...TOOL_CATEGORIES.DELETE_FILE];

/**
 * Herramientas que leen archivos/documentos
 */
const FILE_READING_TOOLS = [
  ...TOOL_CATEGORIES.READ_FILE,
  ...TOOL_CATEGORIES.LIST_FILES,
  ...TOOL_CATEGORIES.SEARCH,
  ...TOOL_CATEGORIES.RAG,
];

/**
 * Herramientas que ejecutan comandos
 */
const COMMAND_TOOLS = [...TOOL_CATEGORIES.BASH, ...TOOL_CATEGORIES.EXEC];

/**
 * Herramientas de navegador
 */
const BROWSER_TOOLS = [...TOOL_CATEGORIES.BROWSER, ...TOOL_CATEGORIES.FETCH];

/**
 * Clasificar herramienta por categoría
 */
function classifyTool(toolName) {
  if (!toolName) return 'unknown';

  const lowerName = toolName.toLowerCase();

  if (FILE_MODIFYING_TOOLS.some((t) => lowerName.includes(t.toLowerCase()))) {
    return 'file_modify';
  }
  if (FILE_READING_TOOLS.some((t) => lowerName.includes(t.toLowerCase()))) {
    return 'file_read';
  }
  if (COMMAND_TOOLS.some((t) => lowerName.includes(t.toLowerCase()))) {
    return 'command';
  }
  if (BROWSER_TOOLS.some((t) => lowerName.includes(t.toLowerCase()))) {
    return 'browser';
  }
  if (lowerName.includes('git')) {
    return 'git';
  }

  return 'other';
}

/**
 * Extraer path de archivo de argumentos
 */
function extractFilePath(args, toolName) {
  if (!args) return null;

  // Común para herramientas de archivo
  const pathFields = ['path', 'file_path', 'filepath', 'file', 'target', 'destination'];
  for (const field of pathFields) {
    if (args[field] && typeof args[field] === 'string') {
      return args[field];
    }
  }

  // MCP format
  if (args.input && typeof args.input === 'object') {
    for (const field of pathFields) {
      if (args.input[field] && typeof args.input[field] === 'string') {
        return args.input[field];
      }
    }
  }

  return null;
}

/**
 * Extraer comando de argumentos
 */
function extractCommand(args) {
  if (!args) return null;

  // Común para bash/exec
  const cmdFields = ['command', 'cmd', 'script', 'code'];
  for (const field of cmdFields) {
    if (args[field] && typeof args[field] === 'string') {
      return args[field];
    }
  }

  return null;
}

/**
 * ChatInstrumenter - Servicio de instrumentación del chat
 */
class ChatInstrumenter {
  constructor() {
    this.eventBus = null;
    this.sessionMetadata = new Map(); // metadata por sessionId
    this.pendingTools = new Map(); // herramientas en ejecución
  }

  /**
   * Inicializar instrumenter con EventBus
   */
  initialize(eventBus = null) {
    if (eventBus) {
      this.eventBus = eventBus;
    } else {
      try {
        this.eventBus = getEventBus();
      } catch (err) {
        console.warn('[ChatInstrumenter] EventBus not available:', err.message);
      }
    }
    return this;
  }

  /**
   * Configurar metadata de sesión
   */
  setSessionMetadata(metadata) {
    const sessionId = metadata?.sessionId || metadata?.conversationId || 'default';
    this.sessionMetadata.set(sessionId, {
      sessionId,
      conversationId: metadata?.conversationId,
      userId: metadata?.userId,
      agentId: metadata?.agentId,
      model: metadata?.model,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Obtener metadata de sesión
   */
  getSessionMetadata(sessionId) {
    return this.sessionMetadata.get(sessionId || 'default');
  }

  /**
   * Publicar evento al EventBus
   */
  publish(eventType, payload, source = 'ChatInstrumenter', metadata = {}) {
    if (!this.eventBus) {
      console.debug('[ChatInstrumenter] EventBus not available, skipping:', eventType);
      return;
    }

    try {
      this.eventBus.publish(eventType, payload, source, metadata);
    } catch (err) {
      console.error('[ChatInstrumenter] Failed to publish event:', err.message);
    }
  }

  // =========================================================================
  // EVENTOS DE SESIÓN
  // =========================================================================

  /**
   * Sesión iniciada
   */
  sessionStarted(metadata = {}) {
    const sessionMeta = { ...this.getSessionMetadata(), ...metadata };
    this.publish(
      SupervisorEventTypes.SUPERVISOR_SESSION_CREATED,
      createSessionPayload(sessionMeta, sessionMeta.userId),
      'ChatInstrumenter',
      { sessionId: sessionMeta.sessionId },
    );
  }

  /**
   * Sesión terminada
   */
  sessionEnded(metadata = {}) {
    const sessionMeta = { ...this.getSessionMetadata(), ...metadata };
    this.publish(
      SupervisorEventTypes.SUPERVISOR_SESSION_ENDED,
      createSessionPayload(sessionMeta, sessionMeta.userId),
      'ChatInstrumenter',
      { sessionId: sessionMeta.sessionId },
    );
  }

  // =========================================================================
  // EVENTOS DE PENSAMIENTO (ESTADOS)
  // =========================================================================

  /**
   * Agente comenzó a pensar
   */
  agentThinking(metadata = {}) {
    const sessionMeta = this.getSessionMetadata();
    const agentId = metadata?.agentId || sessionMeta?.agentId;

    this.publish(
      'chat.agent.thinking',
      {
        agentId,
        sessionId: sessionMeta?.sessionId,
        conversationId: sessionMeta?.conversationId,
        reasoningType: metadata?.reasoningType || 'general',
      },
      'ChatInstrumenter',
    );
  }

  /**
   * Agente terminou de pensar
   */
  agentThoughtComplete(metadata = {}) {
    const sessionMeta = this.getSessionMetadata();
    const agentId = metadata?.agentId || sessionMeta?.agentId;

    this.publish(
      'chat.agent.thought_complete',
      {
        agentId,
        sessionId: sessionMeta?.sessionId,
        conversationId: sessionMeta?.conversationId,
        duration: metadata?.duration,
      },
      'ChatInstrumenter',
    );
  }

  // =========================================================================
  // EVENTOS DE HERRAMIENTAS
  // =========================================================================

  /**
   * Herramienta comenzó a ejecutarse
   */
  toolStarted(toolName, args = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();
    const toolCallId = metadata?.toolCallId || `tool_${Date.now()}`;
    const toolCategory = classifyTool(toolName);

    // Registrar herramienta pendiente
    this.pendingTools.set(toolCallId, {
      toolName,
      args,
      startTime: Date.now(),
      category: toolCategory,
    });

    const basePayload = {
      toolName,
      toolCallId,
      sessionId: sessionMeta?.sessionId,
      conversationId: sessionMeta?.conversationId,
      agentId: metadata?.agentId || sessionMeta?.agentId,
    };

    // Publicar según categoría
    switch (toolCategory) {
      case 'file_modify':
        this.publish(
          SupervisorEventTypes.SANDBOX_FILE_MODIFIED,
          {
            ...basePayload,
            filePath: extractFilePath(args, toolName),
            operation: toolName.toLowerCase().includes('delete') ? 'delete' : 'modify',
          },
          'ChatInstrumenter',
        );
        break;

      case 'file_read':
        this.publish(
          SupervisorEventTypes.SANDBOX_FILE_READ,
          {
            ...basePayload,
            filePath: extractFilePath(args, toolName),
          },
          'ChatInstrumenter',
        );
        break;

      case 'command':
        this.publish(
          SupervisorEventTypes.SANDBOX_COMMAND_EXECUTED,
          {
            ...basePayload,
            command: extractCommand(args),
          },
          'ChatInstrumenter',
        );
        break;

      case 'browser':
        this.publish(
          BROWSER_TOOLS.some((t) => toolName.toLowerCase().includes('navigate'))
            ? SupervisorEventTypes.BROWSER_NAVIGATED
            : SupervisorEventTypes.BROWSER_ACTION_PERFORMED,
          {
            ...basePayload,
            url: args?.url || args?.target,
          },
          'ChatInstrumenter',
        );
        break;

      default:
        this.publish('chat.tool.started', basePayload, 'ChatInstrumenter');
    }
  }

  /**
   * Herramienta completó exitosamente
   */
  toolEnded(toolName, result = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();
    const toolCallId = metadata?.toolCallId || `tool_${Date.now()}`;

    // Obtener info de herramienta pendiente
    const pending = this.pendingTools.get(toolCallId);
    const duration = pending ? Date.now() - pending.startTime : null;
    const toolCategory = pending?.category || classifyTool(toolName);

    // Limpiar herramienta pendiente
    this.pendingTools.delete(toolCallId);

    const basePayload = {
      toolName,
      toolCallId,
      sessionId: sessionMeta?.sessionId,
      conversationId: sessionMeta?.conversationId,
      agentId: metadata?.agentId || sessionMeta?.agentId,
      duration,
      exitCode: 0,
      output: result?.content || result?.output || '',
    };

    // Publicar según categoría
    switch (toolCategory) {
      case 'file_modify':
        this.publish(
          SupervisorEventTypes.SANDBOX_FILE_WRITTEN,
          {
            ...basePayload,
            filePath: extractFilePath(pending?.args || result, toolName),
            linesChanged: this.extractLinesChanged(result),
          },
          'ChatInstrumenter',
        );
        break;

      case 'file_read':
        this.publish(
          'chat.tool.file_read_complete',
          {
            ...basePayload,
            filePath: extractFilePath(pending?.args || result, toolName),
            bytesRead: result?.content?.length || 0,
          },
          'ChatInstrumenter',
        );
        break;

      case 'command':
        this.publish(
          SupervisorEventTypes.SANDBOX_COMMAND_OUTPUT,
          {
            ...basePayload,
            stdout: result?.stdout || result?.output || '',
            stderr: result?.stderr || '',
          },
          'ChatInstrumenter',
        );
        break;

      default:
        this.publish('chat.tool.ended', basePayload, 'ChatInstrumenter');
    }
  }

  /**
   * Herramienta falló
   */
  toolError(toolName, error = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();
    const toolCallId = metadata?.toolCallId || `tool_${Date.now()}`;
    const toolCategory = classifyTool(toolName);

    // Limpiar herramienta pendiente
    this.pendingTools.delete(toolCallId);

    const basePayload = {
      toolName,
      toolCallId,
      sessionId: sessionMeta?.sessionId,
      conversationId: sessionMeta?.conversationId,
      agentId: metadata?.agentId || sessionMeta?.agentId,
      error: error?.message || String(error),
      errorType: error?.type || 'UnknownError',
    };

    // Publicar según categoría
    switch (toolCategory) {
      case 'command':
        this.publish(
          SupervisorEventTypes.SANDBOX_COMMAND_ERROR,
          {
            ...basePayload,
            stderr: error?.stderr || error?.message,
          },
          'ChatInstrumenter',
        );
        break;

      default:
        this.publish('chat.tool.error', basePayload, 'ChatInstrumenter');
    }
  }

  /**
   * Extraer líneas cambiadas del resultado
   */
  extractLinesChanged(result) {
    const content = result?.content || '';
    if (typeof content === 'string') {
      return content.split('\n').length;
    }
    return 0;
  }

  // =========================================================================
  // EVENTOS DE TAREAS
  // =========================================================================

  /**
   * Tarea iniciada
   */
  taskStarted(taskData = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();

    this.publish(
      SupervisorEventTypes.SUPERVISOR_TASK_STARTED,
      createTaskPayload(
        {
          id: taskData.taskId || taskData.id,
          title: taskData.title || taskData.description || 'Untitled Task',
          description: taskData.description,
          priority: taskData.priority,
        },
        sessionMeta?.sessionId,
        metadata?.agentId || sessionMeta?.agentId,
      ),
      'ChatInstrumenter',
      { taskId: taskData.taskId || taskData.id },
    );
  }

  /**
   * Tarea completada
   */
  taskCompleted(taskData = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();

    this.publish(
      SupervisorEventTypes.SUPERVISOR_TASK_COMPLETED,
      createTaskPayload(
        {
          id: taskData.taskId || taskData.id,
          title: taskData.title,
          description: taskData.description,
          status: 'completed',
          result: taskData.result,
        },
        sessionMeta?.sessionId,
        metadata?.agentId || sessionMeta?.agentId,
      ),
      'ChatInstrumenter',
      { taskId: taskData.taskId || taskData.id },
    );
  }

  /**
   * Tarea fallida
   */
  taskFailed(taskData = {}, error = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();

    this.publish(
      SupervisorEventTypes.SUPERVISOR_TASK_FAILED,
      createTaskPayload(
        {
          id: taskData.taskId || taskData.id,
          title: taskData.title,
          description: taskData.description,
          status: 'failed',
          error: error?.message || String(error),
        },
        sessionMeta?.sessionId,
        metadata?.agentId || sessionMeta?.agentId,
      ),
      'ChatInstrumenter',
      { taskId: taskData.taskId || taskData.id },
    );
  }

  /**
   * Progreso de tarea
   */
  taskProgress(taskData = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();

    this.publish(
      SupervisorEventTypes.SUPERVISOR_TASK_PROGRESS,
      createTaskPayload(
        {
          id: taskData.taskId || taskData.id,
          title: taskData.title,
          progress: taskData.progress,
          currentStep: taskData.currentStep,
          totalSteps: taskData.totalSteps,
        },
        sessionMeta?.sessionId,
        metadata?.agentId || sessionMeta?.agentId,
      ),
      'ChatInstrumenter',
      { taskId: taskData.taskId || taskData.id },
    );
  }

  // =========================================================================
  // EVENTOS DE MENSAJES
  // =========================================================================

  /**
   * Mensaje recibido del usuario
   */
  messageReceived(messageData = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();

    this.publish(
      SupervisorEventTypes.SUPERVISOR_MESSAGE_RECEIVED,
      {
        sessionId: sessionMeta?.sessionId,
        conversationId: sessionMeta?.conversationId,
        messageId: messageData.messageId,
        contentLength: messageData.content?.length || 0,
        hasAttachments: !!messageData.attachments?.length,
      },
      'ChatInstrumenter',
    );
  }

  /**
   * Mensaje enviado por el agente
   */
  messageSent(messageData = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();

    this.publish(
      SupervisorEventTypes.SUPERVISOR_MESSAGE_SENT,
      {
        sessionId: sessionMeta?.sessionId,
        conversationId: sessionMeta?.conversationId,
        messageId: messageData.messageId,
        contentLength: messageData.content?.length || 0,
        hasToolCalls: !!messageData.toolCalls?.length,
        tokensUsed: metadata?.tokensUsed,
      },
      'ChatInstrumenter',
    );
  }

  // =========================================================================
  // EVENTOS DE RUN STEP (Etapas de ejecución)
  // =========================================================================

  /**
   * Run step iniciado
   */
  runStepStarted(stepData = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();

    this.publish(
      'chat.run_step.started',
      {
        sessionId: sessionMeta?.sessionId,
        conversationId: sessionMeta?.conversationId,
        stepId: stepData.stepId,
        stepType: stepData.stepType, // 'message_creation' | 'tool_calls'
        agentId: metadata?.agentId || sessionMeta?.agentId,
      },
      'ChatInstrumenter',
    );
  }

  /**
   * Run step completado
   */
  runStepCompleted(stepData = {}, metadata = {}) {
    const sessionMeta = this.getSessionMetadata();

    this.publish(
      'chat.run_step.completed',
      {
        sessionId: sessionMeta?.sessionId,
        conversationId: sessionMeta?.conversationId,
        stepId: stepData.stepId,
        stepType: stepData.stepType,
        agentId: metadata?.agentId || sessionMeta?.agentId,
        duration: metadata?.duration,
      },
      'ChatInstrumenter',
    );
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Crear wrapper de instrumentación para callbacks
   * Útil para integrar con sistemas de callbacks existentes
   */
  wrapCallback(callbackName, originalCallback) {
    const instrumenter = this;

    return async function (...args) {
      const metadata = args[args.length - 1] || {};

      try {
        // Llamar callback original
        const result = originalCallback.apply(this, args);

        // Si es promesa, encadenar
        if (result && typeof result.then === 'function') {
          return result
            .then((res) => {
              instrumenter.handleCallbackResult(callbackName, args, res, metadata);
              return res;
            })
            .catch((err) => {
              instrumenter.handleCallbackError(callbackName, args, err, metadata);
              throw err;
            });
        }

        // Sync callback
        instrumenter.handleCallbackResult(callbackName, args, result, metadata);
        return result;
      } catch (err) {
        instrumenter.handleCallbackError(callbackName, args, err, metadata);
        throw err;
      }
    };
  }

  /**
   * Manejar resultado de callback
   */
  handleCallbackResult(callbackName, args, result, metadata) {
    const sessionMeta = this.getSessionMetadata();

    switch (callbackName) {
      case 'toolEnd':
        this.toolEnded(args[0]?.name || args[0]?.tool_name, result || {}, metadata);
        break;

      case 'toolError':
        this.toolError(args[0]?.name || args[0]?.tool_name, result || {}, metadata);
        break;

      case 'messageEnd':
        this.messageSent({ messageId: args[0]?.id, content: args[0]?.content }, metadata);
        break;
    }
  }

  /**
   * Manejar error de callback
   */
  handleCallbackError(callbackName, args, error, metadata) {
    switch (callbackName) {
      case 'toolEnd':
      case 'toolError':
        this.toolError(
          args[0]?.name || args[0]?.tool_name,
          { message: error?.message || String(error) },
          metadata,
        );
        break;
    }
  }

  /**
   * Limpiar sesión
   */
  clearSession(sessionId) {
    if (sessionId) {
      this.sessionMetadata.delete(sessionId);
    } else {
      this.sessionMetadata.clear();
    }
    this.pendingTools.clear();
  }
}

// Singleton instance
const chatInstrumenter = new ChatInstrumenter();

module.exports = {
  ChatInstrumenter,
  chatInstrumenter,
  TOOL_CATEGORIES,
  FILE_MODIFYING_TOOLS,
  FILE_READING_TOOLS,
  COMMAND_TOOLS,
  BROWSER_TOOLS,
  classifyTool,
  extractFilePath,
  extractCommand,
};
