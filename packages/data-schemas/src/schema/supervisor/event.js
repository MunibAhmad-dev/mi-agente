/**
 * Supervisor Events Schema
 * 
 * Almacena todos los eventos de actividad de los agentes
 */

const supervisorEventSchema = {
  name: 'SupervisorEvent',
  bsonType: 'object',
  required: ['sessionId', 'agentId', 'userId', 'type', 'timestamp'],
  properties: {
    _id: {
      bsonType: 'objectId',
      description: 'ID único del evento',
    },
    sessionId: {
      bsonType: 'string',
      description: 'ID de la sesión del agente',
    },
    agentId: {
      bsonType: 'string',
      description: 'ID del agente que generó el evento',
    },
    userId: {
      bsonType: 'string',
      description: 'ID del usuario propietario',
    },
    conversationId: {
      bsonType: 'string',
      description: 'ID de conversación asociada (opcional)',
    },
    type: {
      bsonType: 'string',
      enum: [
        'agent:start',
        'agent:thinking',
        'agent:tool_start',
        'agent:tool_end',
        'agent:tool_error',
        'agent:file_read',
        'agent:file_write',
        'agent:file_delete',
        'agent:command_execute',
        'agent:command_output',
        'agent:browser_navigate',
        'agent:browser_action',
        'agent:subagent_start',
        'agent:subagent_end',
        'agent:pause',
        'agent:resume',
        'agent:complete',
        'agent:error',
      ],
      description: 'Tipo de evento',
    },
    data: {
      bsonType: 'object',
      description: 'Datos específicos del evento',
      properties: {
        tool: {
          bsonType: 'string',
          description: 'Herramienta ejecutada',
        },
        action: {
          bsonType: 'string',
          description: 'Acción realizada',
        },
        target: {
          bsonType: 'string',
          description: 'Objetivo (path, URL, etc.)',
        },
        content: {
          bsonType: 'string',
          description: 'Contenido relevante',
        },
        status: {
          bsonType: 'string',
          enum: ['pending', 'running', 'done', 'error'],
          description: 'Estado del evento',
        },
        duration: {
          bsonType: 'number',
          description: 'Duración en ms',
        },
        error: {
          bsonType: 'string',
          description: 'Mensaje de error',
        },
        lines: {
          bsonType: 'number',
          description: 'Líneas leídas/escritas',
        },
        exitCode: {
          bsonType: 'number',
          description: 'Código de salida de comando',
        },
      },
    },
    metadata: {
      bsonType: 'object',
      description: 'Metadatos adicionales',
      properties: {
        model: {
          bsonType: 'string',
          description: 'Modelo utilizado',
        },
        provider: {
          bsonType: 'string',
          description: 'Proveedor del modelo',
        },
        tools: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Herramientas disponibles',
        },
        parentEventId: {
          bsonType: 'string',
          description: 'Evento padre (para sub-agentes)',
        },
      },
    },
    timestamp: {
      bsonType: 'date',
      description: 'Timestamp del evento',
    },
    createdAt: {
      bsonType: 'date',
      description: 'Fecha de creación del documento',
    },
  },
};

// Índices para el schema
const supervisorEventIndexes = [
  { fields: { sessionId: 1, timestamp: 1 }, options: { name: 'idx_session_timestamp' } },
  { fields: { agentId: 1, timestamp: -1 }, options: { name: 'idx_agent_timestamp' } },
  { fields: { userId: 1, timestamp: -1 }, options: { name: 'idx_user_timestamp' } },
  { fields: { type: 1, timestamp: -1 }, options: { name: 'idx_type_timestamp' } },
];

module.exports = {
  supervisorEventSchema,
  supervisorEventIndexes,
};
