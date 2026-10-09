/**
 * Supervisor Schemas Index
 * 
 * Exporta todos los schemas de supervisión
 */

const { supervisorEventSchema, supervisorEventIndexes } = require('./event');
const { supervisorSessionSchema, supervisorSessionIndexes } = require('./session');
const { supervisorPermissionSchema, supervisorPermissionIndexes } = require('./permission');

module.exports = {
  supervisorEventSchema,
  supervisorEventIndexes,
  supervisorSessionSchema,
  supervisorSessionIndexes,
  supervisorPermissionSchema,
  supervisorPermissionIndexes,
};
