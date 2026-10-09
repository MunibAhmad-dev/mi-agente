/**
 * Supervisor Sessions Schema
 * 
 * Almacena las sesiones completas de agentes para replay
 */

const supervisorSessionSchema = {
  name: 'SupervisorSession',
  bsonType: 'object',
  required: ['sessionId', 'userId', 'agentId', 'startedAt', 'status'],
  properties: {
    _id: {
      bsonType: 'objectId',
      description: 'ID único del documento',
    },
    sessionId: {
      bsonType: 'string',
      description: 'ID único de la sesión',
    },
    userId: {
      bsonType: 'string',
      description: 'ID del usuario propietario',
    },
    agentId: {
      bsonType: 'string',
      description: 'ID del agente',
    },
    agentType: {
      bsonType: 'string',
      description: 'Tipo de agente (programmer, security, etc.)',
    },
    conversationId: {
      bsonType: 'string',
      description: 'ID de conversación asociada',
    },
    task: {
      bsonType: 'string',
      description: 'Descripción de la tarea',
    },
    status: {
      bsonType: 'string',
      enum: ['active', 'paused', 'completed', 'cancelled', 'error'],
      description: 'Estado de la sesión',
    },
    outcome: {
      bsonType: 'string',
      enum: ['success', 'error', 'cancelled', 'pending'],
      description: 'Resultado final',
    },
    metadata: {
      bsonType: 'object',
      description: 'Metadatos de la sesión',
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
        sandboxId: {
          bsonType: 'string',
          description: 'ID del sandbox (si existe)',
        },
      },
    },
    stats: {
      bsonType: 'object',
      description: 'Estadísticas de la sesión',
      properties: {
        totalEvents: {
          bsonType: 'number',
          description: 'Total de eventos',
        },
        toolsUsed: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Herramientas utilizadas',
        },
        filesModified: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Archivos modificados',
        },
        commandsExecuted: {
          bsonType: 'number',
          description: 'Comandos ejecutados',
        },
        errors: {
          bsonType: 'number',
          description: 'Número de errores',
        },
      },
    },
    startedAt: {
      bsonType: 'date',
      description: 'Fecha de inicio',
    },
    endedAt: {
      bsonType: 'date',
      description: 'Fecha de finalización',
    },
    duration: {
      bsonType: 'number',
      description: 'Duración total en ms',
    },
    createdAt: {
      bsonType: 'date',
      description: 'Fecha de creación del documento',
    },
    updatedAt: {
      bsonType: 'date',
      description: 'Fecha de última actualización',
    },
  },
};

// Índices
const supervisorSessionIndexes = [
  { fields: { sessionId: 1 }, options: { unique: true, name: 'idx_sessionId' } },
  { fields: { userId: 1, startedAt: -1 }, options: { name: 'idx_user_started' } },
  { fields: { agentId: 1, status: 1 }, options: { name: 'idx_agent_status' } },
  { fields: { status: 1, startedAt: -1 }, options: { name: 'idx_status_started' } },
];

module.exports = {
  supervisorSessionSchema,
  supervisorSessionIndexes,
};
