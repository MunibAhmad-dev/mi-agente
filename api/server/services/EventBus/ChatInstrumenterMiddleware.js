/**
 * Chat Instrumenter Middleware
 *
 * Middleware para conectar el ChatInstrumenter con el sistema de callbacks del chat.
 * Provee funciones para wrappear callbacks existentes y agregar instrumentación.
 *
 * USO:
 * const { instrumentMiddleware } = require('./ChatInstrumenterMiddleware');
 *
 * // En el controller antes de crear callbacks:
 * const callbacks = instrumentMiddleware.wrapCallbacks(originalCallbacks, {
 *   sessionId: req.body.conversationId,
 *   userId: req.user.id,
 *   conversationId: req.body.conversationId,
 *   agentId: req.body.agentId,
 *   model: req.body.model,
 * });
 */

const {
  chatInstrumenter,
  classifyTool,
  extractFilePath,
  extractCommand,
} = require('./ChatInstrumenter');

/**
 * Tipos de eventos GraphEvents del sistema
 */
const GraphEvents = {
  ON_RUN_STEP: 'on_run_step',
  ON_RUN_STEP_DELTA: 'on_run_step_delta',
  ON_RUN_STEP_COMPLETED: 'on_run_step_completed',
  ON_MESSAGE_DELTA: 'on_message_delta',
  ON_REASONING_DELTA: 'on_reasoning_delta',
  ON_TOOL_EXECUTE: 'on_tool_execute',
  ON_TOOL_END: 'on_tool_end',
  CHAT_MODEL_END: 'on_chat_model_end',
  ON_AGENT_UPDATE: 'on_agent_update',
  ON_SUBAGENT_UPDATE: 'on_subagent_update',
};

/**
 * Middleware de instrumentación
 */
const instrumentMiddleware = {
  /**
   * Inicializar el instrumento con metadata de sesión
   */
  initialize(metadata) {
    chatInstrumenter.initialize();
    chatInstrumenter.setSessionMetadata(metadata);
    chatInstrumenter.sessionStarted(metadata);
    return chatInstrumenter;
  },

  /**
   * Finalizar sesión de instrumentación
   */
  finalize(metadata = {}) {
    chatInstrumenter.sessionEnded(metadata);
    const sessionId = metadata?.sessionId || metadata?.conversationId;
    if (sessionId) {
      chatInstrumenter.clearSession(sessionId);
    }
  },

  /**
   * Wrapper para callbacks de toolEndCallback
   * Conecta con el sistema de eventos cuando una herramienta termina
   */
  wrapToolEndCallback(originalCallback) {
    return async function instrumentedToolEndCallback(data, metadata) {
      // Ejecutar callback original
      if (originalCallback) {
        await originalCallback(data, metadata);
      }

      // Instrumentar
      const toolName = data?.output?.name || data?.name;
      if (toolName) {
        const result = {
          content: data?.output?.content,
          output: data?.output,
        };
        chatInstrumenter.toolEnded(toolName, result, {
          toolCallId: data?.output?.tool_call_id,
          ...metadata,
        });
      }
    };
  },

  /**
   * Wrapper para el handler de ON_TOOL_EXECUTE
   * Instrumenta cuando una herramienta comienza a ejecutarse
   */
  wrapToolExecuteHandler(originalHandler) {
    return {
      handle: async function instrumentedToolExecuteHandle(event, data, metadata, graph) {
        // Instrumentar inicio de herramientas
        if (data?.toolCalls && Array.isArray(data.toolCalls)) {
          for (const toolCall of data.toolCalls) {
            chatInstrumenter.toolStarted(toolCall.name, toolCall.args || toolCall, {
              toolCallId: toolCall.id,
              agentId: data.agentId,
              ...metadata,
            });
          }
        }

        // Ejecutar handler original con callback instrumentado
        const instrumentedOnResult = (result) => {
          if (result?.toolCallId) {
            const toolCall = data?.toolCalls?.find((tc) => tc.id === result.toolCallId);
            if (result.status === 'error') {
              chatInstrumenter.toolError(toolCall?.name || 'unknown', result, {
                toolCallId: result.toolCallId,
                agentId: data.agentId,
                ...metadata,
              });
            } else {
              chatInstrumenter.toolEnded(toolCall?.name || 'unknown', result, {
                toolCallId: result.toolCallId,
                agentId: data.agentId,
                ...metadata,
              });
            }
          }
        };

        // Llamar handler original con callback instrumentado
        const originalData = { ...data, onResult: instrumentedOnResult };
        await originalHandler.handle(event, originalData, metadata, graph);
      },
    };
  },

  /**
   * Wrapper para ON_RUN_STEP
   */
  wrapRunStepHandler(originalHandler) {
    return {
      handle: async function instrumentedRunStepHandle(event, data, metadata, graph) {
        const stepType = data?.stepDetails?.type;
        const stepId = data?.id;

        // Notificar inicio de step
        if (stepType) {
          chatInstrumenter.publish(
            'chat.run_step.started',
            {
              stepId,
              stepType,
              agentId: metadata?.agentId,
            },
            'ChatInstrumenter',
          );
        }

        // Ejecutar handler original
        await originalHandler.handle(event, data, metadata, graph);
      },
    };
  },

  /**
   * Wrapper para ON_RUN_STEP_COMPLETED
   */
  wrapRunStepCompletedHandler(originalHandler) {
    return {
      handle: async function instrumentedRunStepCompletedHandle(event, data, metadata, graph) {
        const stepType = data?.stepDetails?.type;
        const stepId = data?.id;
        const startTime = metadata?.startTime || Date.now();
        const duration = Date.now() - startTime;

        // Ejecutar handler original
        await originalHandler.handle(event, data, metadata, graph);

        // Notificar fin de step
        if (stepType) {
          chatInstrumenter.publish(
            'chat.run_step.completed',
            {
              stepId,
              stepType,
              duration,
              agentId: metadata?.agentId,
            },
            'ChatInstrumenter',
          );

          // Si es un tool_call step, ya fue instrumentado por toolExecuteHandler
        }
      },
    };
  },

  /**
   * Wrapper para ON_REASONING_DELTA
   */
  wrapReasoningHandler(originalHandler) {
    let reasoningActive = false;
    let reasoningStartTime = null;

    return {
      handle: async function instrumentedReasoningHandle(event, data, metadata, graph) {
        // Detectar inicio de razonamiento
        if (!reasoningActive && data?.content) {
          reasoningActive = true;
          reasoningStartTime = Date.now();
          chatInstrumenter.agentThinking({
            reasoningType: 'reasoning_delta',
            ...metadata,
          });
        }

        // Ejecutar handler original
        await originalHandler.handle(event, data, metadata, graph);

        // Detectar fin de razonamiento (content vacío o evento de texto)
        if (reasoningActive && (!data?.content || data.content.length === 0)) {
          const duration = Date.now() - reasoningStartTime;
          chatInstrumenter.agentThoughtComplete({
            reasoningType: 'reasoning_delta',
            duration,
            ...metadata,
          });
          reasoningActive = false;
        }
      },
    };
  },

  /**
   * Wrapper para ON_MESSAGE_DELTA
   */
  wrapMessageHandler(originalHandler) {
    let messageContent = '';

    return {
      handle: async function instrumentedMessageHandle(event, data, metadata, graph) {
        // Acumular contenido
        if (data?.content && Array.isArray(data.content)) {
          for (const part of data.content) {
            if (part?.text) {
              messageContent += part.text;
            }
          }
        }

        // Ejecutar handler original
        await originalHandler.handle(event, data, metadata, graph);

        // Si no hay más contenido delta, se completó el mensaje
        if (!data?.content || data.content.length === 0) {
          if (messageContent.length > 0) {
            chatInstrumenter.publish(
              'chat.message.delta_complete',
              {
                contentLength: messageContent.length,
                agentId: metadata?.agentId,
              },
              'ChatInstrumenter',
            );
          }
          messageContent = '';
        }
      },
    };
  },

  /**
   * Wrapper para ON_AGENT_UPDATE
   */
  wrapAgentUpdateHandler(originalHandler) {
    return {
      handle: async function instrumentedAgentUpdateHandle(event, data, metadata, graph) {
        // Instrumentar actualización de estado del agente
        if (data?.status) {
          chatInstrumenter.publish(
            'chat.agent.status_changed',
            {
              agentId: data.agentId || metadata?.agentId,
              status: data.status,
              action: data.action,
              ...metadata,
            },
            'ChatInstrumenter',
          );
        }

        // Ejecutar handler original
        await originalHandler.handle(event, data, metadata, graph);
      },
    };
  },

  /**
   * Wrapper para CHAT_MODEL_END
   */
  wrapModelEndHandler(originalHandler) {
    return {
      handle: async function instrumentedModelEndHandle(event, data, metadata, graph) {
        // Instrumentar fin de modelo
        chatInstrumenter.publish(
          'chat.model.end',
          {
            agentId: metadata?.agentId,
            conversationId: metadata?.thread_id,
            usage: data?.output?.usage_metadata,
          },
          'ChatInstrumenter',
        );

        // Ejecutar handler original
        if (originalHandler?.handle) {
          await originalHandler.handle(event, data, metadata, graph);
        }
      },
    };
  },

  /**
   * Envolver todos los callbacks con instrumentación
   * @param {Object} handlers - Objeto con los handlers originales
   * @param {Object} metadata - Metadata de la sesión
   * @returns {Object} Handlers envueltos con instrumentación
   */
  wrapAllHandlers(handlers, metadata = {}) {
    this.initialize(metadata);

    const instrumentedHandlers = {};

    // Wrapear cada handler según su tipo
    if (handlers[GraphEvents.ON_TOOL_EXECUTE]) {
      instrumentedHandlers[GraphEvents.ON_TOOL_EXECUTE] = this.wrapToolExecuteHandler(
        handlers[GraphEvents.ON_TOOL_EXECUTE],
      );
    }

    if (handlers[GraphEvents.ON_TOOL_END]) {
      instrumentedHandlers[GraphEvents.ON_TOOL_END] = this.wrapToolEndHandler(
        handlers[GraphEvents.ON_TOOL_END],
      );
    }

    if (handlers[GraphEvents.ON_RUN_STEP]) {
      instrumentedHandlers[GraphEvents.ON_RUN_STEP] = this.wrapRunStepHandler(
        handlers[GraphEvents.ON_RUN_STEP],
      );
    }

    if (handlers[GraphEvents.ON_RUN_STEP_COMPLETED]) {
      instrumentedHandlers[GraphEvents.ON_RUN_STEP_COMPLETED] = this.wrapRunStepCompletedHandler(
        handlers[GraphEvents.ON_RUN_STEP_COMPLETED],
      );
    }

    if (handlers[GraphEvents.ON_REASONING_DELTA]) {
      instrumentedHandlers[GraphEvents.ON_REASONING_DELTA] = this.wrapReasoningHandler(
        handlers[GraphEvents.ON_REASONING_DELTA],
      );
    }

    if (handlers[GraphEvents.ON_MESSAGE_DELTA]) {
      instrumentedHandlers[GraphEvents.ON_MESSAGE_DELTA] = this.wrapMessageHandler(
        handlers[GraphEvents.ON_MESSAGE_DELTA],
      );
    }

    if (handlers[GraphEvents.ON_AGENT_UPDATE]) {
      instrumentedHandlers[GraphEvents.ON_AGENT_UPDATE] = this.wrapAgentUpdateHandler(
        handlers[GraphEvents.ON_AGENT_UPDATE],
      );
    }

    if (handlers[GraphEvents.CHAT_MODEL_END]) {
      instrumentedHandlers[GraphEvents.CHAT_MODEL_END] = this.wrapModelEndHandler(
        handlers[GraphEvents.CHAT_MODEL_END],
      );
    }

    // Copiar handlers no modificados
    for (const [key, handler] of Object.entries(handlers)) {
      if (!instrumentedHandlers[key]) {
        instrumentedHandlers[key] = handler;
      }
    }

    return instrumentedHandlers;
  },

  /**
   * Wrapear toolEnd callback (función, no handler)
   */
  wrapToolEndHandler(originalHandler) {
    return this.wrapToolEndCallback(originalHandler);
  },
};

module.exports = {
  instrumentMiddleware,
  GraphEvents,
};
