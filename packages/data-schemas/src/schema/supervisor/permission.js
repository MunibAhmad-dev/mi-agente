/**
 * Supervisor Permissions Schema
 * 
 * Almacena los permisos granulares por agente
 */

const supervisorPermissionSchema = {
  name: 'SupervisorPermission',
  bsonType: 'object',
  required: ['userId', 'agentId'],
  properties: {
    _id: {
      bsonType: 'objectId',
      description: 'ID único del documento',
    },
    userId: {
      bsonType: 'string',
      description: 'ID del usuario propietario',
    },
    agentId: {
      bsonType: 'string',
      description: 'ID del agente',
    },
    preset: {
      bsonType: 'string',
      enum: ['restricted', 'standard', 'full', 'custom'],
      description: 'Preset de permisos aplicado',
    },
    filePermissions: {
      bsonType: 'object',
      description: 'Permisos de archivos',
      properties: {
        readPaths: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Paths permitidos para lectura',
        },
        writePaths: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Paths permitidos para escritura',
        },
        denyPaths: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Paths denegados',
        },
      },
    },
    commandPermissions: {
      bsonType: 'object',
      description: 'Permisos de comandos',
      properties: {
        allowedCommands: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Patrones de comandos permitidos',
        },
        deniedCommands: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Patrones de comandos denegados',
        },
        requireApproval: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Comandos que requieren aprobación',
        },
        maxTimeout: {
          bsonType: 'number',
          description: 'Timeout máximo en ms',
        },
      },
    },
    networkPermissions: {
      bsonType: 'object',
      description: 'Permisos de red',
      properties: {
        allowedDomains: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Dominios permitidos',
        },
        deniedDomains: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Dominios denegados',
        },
        allowBrowser: {
          bsonType: 'bool',
          description: 'Permitir uso del navegador',
        },
      },
    },
    toolPermissions: {
      bsonType: 'object',
      description: 'Permisos de herramientas',
      properties: {
        allowedTools: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Herramientas permitidas',
        },
        deniedTools: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Herramientas denegadas',
        },
      },
    },
    infoPermissions: {
      bsonType: 'object',
      description: 'Permisos de información sensible',
      properties: {
        allowReadSecrets: {
          bsonType: 'bool',
          description: 'Permitir leer .env y secrets',
        },
        allowReadCredentials: {
          bsonType: 'bool',
          description: 'Permitir leer credenciales',
        },
      },
    },
    limits: {
      bsonType: 'object',
      description: 'Límites de recursos',
      properties: {
        maxConcurrentAgents: {
          bsonType: 'number',
          description: 'Máximo de agentes concurrentes',
        },
        maxSandboxTime: {
          bsonType: 'number',
          description: 'Tiempo máximo de sandbox en ms',
        },
        maxFileSize: {
          bsonType: 'number',
          description: 'Tamaño máximo de archivo en bytes',
        },
        maxMemoryUsage: {
          bsonType: 'number',
          description: 'Uso máximo de memoria en bytes',
        },
      },
    },
    createdAt: {
      bsonType: 'date',
      description: 'Fecha de creación',
    },
    updatedAt: {
      bsonType: 'date',
      description: 'Fecha de última actualización',
    },
  },
};

// Índices
const supervisorPermissionIndexes = [
  { fields: { userId: 1, agentId: 1 }, options: { unique: true, name: 'idx_user_agent' } },
  { fields: { userId: 1, updatedAt: -1 }, options: { name: 'idx_user_updated' } },
];

module.exports = {
  supervisorPermissionSchema,
  supervisorPermissionIndexes,
};
