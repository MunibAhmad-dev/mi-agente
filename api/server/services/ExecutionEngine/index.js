/**
 * Execution Engine - Index
 *
 * Punto de entrada para el motor de ejecución.
 * Conecta con IntegrationManager para ser el núcleo del backend.
 */

const {
  ExecutionEngine,
  Execution,
  Task,
  ExecutionStatus,
  TaskType,
  getExecutionEngine,
  createExecutionEngine,
} = require('./ExecutionEngine');

module.exports = {
  ExecutionEngine,
  Execution,
  Task,
  ExecutionStatus,
  TaskType,
  getExecutionEngine,
  createExecutionEngine,
};
