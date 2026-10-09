/**
 * Supervisor Event Types
 *
 * Tipos de eventos específicos para el sistema de supervisión multi-agente y sandbox.
 * Extienden el EventBus base con eventos de dominio específicos.
 */

const SupervisorEventTypes = {
  // === SESIONES ===
  SUPERVISOR_SESSION_CREATED: 'supervisor.session.created',
  SUPERVISOR_SESSION_UPDATED: 'supervisor.session.updated',
  SUPERVISOR_SESSION_ENDED: 'supervisor.session.ended',
  SUPERVISOR_SESSION_PAUSED: 'supervisor.session.paused',
  SUPERVISOR_SESSION_RESUMED: 'supervisor.session.resumed',

  // === AGENTES ===
  SUPERVISOR_AGENT_ADDED: 'supervisor.agent.added',
  SUPERVISOR_AGENT_REMOVED: 'supervisor.agent.removed',
  SUPERVISOR_AGENT_STARTED: 'supervisor.agent.started',
  SUPERVISOR_AGENT_PAUSED: 'supervisor.agent.paused',
  SUPERVISOR_AGENT_RESUMED: 'supervisor.agent.resumed',
  SUPERVISOR_AGENT_STOPPED: 'supervisor.agent.stopped',
  SUPERVISOR_AGENT_STATUS_CHANGED: 'supervisor.agent.status_changed',

  // === TAREAS ===
  SUPERVISOR_TASK_CREATED: 'supervisor.task.created',
  SUPERVISOR_TASK_ASSIGNED: 'supervisor.task.assigned',
  SUPERVISOR_TASK_STARTED: 'supervisor.task.started',
  SUPERVISOR_TASK_PROGRESS: 'supervisor.task.progress',
  SUPERVISOR_TASK_COMPLETED: 'supervisor.task.completed',
  SUPERVISOR_TASK_FAILED: 'supervisor.task.failed',
  SUPERVISOR_TASK_CANCELLED: 'supervisor.task.cancelled',

  // === MENSAJES ===
  SUPERVISOR_MESSAGE_SENT: 'supervisor.message.sent',
  SUPERVISOR_MESSAGE_RECEIVED: 'supervisor.message.received',

  // === SANDBOX ===
  SANDBOX_CREATED: 'sandbox.created',
  SANDBOX_DESTROYED: 'sandbox.destroyed',
  SANDBOX_STATUS_CHANGED: 'sandbox.status_changed',

  // === SANDBOX - COMANDOS ===
  SANDBOX_COMMAND_EXECUTED: 'sandbox.command.executed',
  SANDBOX_COMMAND_OUTPUT: 'sandbox.command.output',
  SANDBOX_COMMAND_ERROR: 'sandbox.command.error',

  // === SANDBOX - ARCHIVOS ===
  SANDBOX_FILE_READ: 'sandbox.file.read',
  SANDBOX_FILE_WRITTEN: 'sandbox.file.written',
  SANDBOX_FILE_DELETED: 'sandbox.file.deleted',
  SANDBOX_FILE_MODIFIED: 'sandbox.file.modified',

  // === SANDBOX - STAGING ===
  SANDBOX_CHANGES_DETECTED: 'sandbox.changes.detected',
  SANDBOX_FILE_STAGED: 'sandbox.file.staged',
  SANDBOX_FILE_UNSTAGED: 'sandbox.file.unstaged',
  SANDBOX_FILE_PROMOTED: 'sandbox.file.promoted',
  SANDBOX_FILE_DISCARDED: 'sandbox.file.discarded',

  // === DIFF ===
  DIFF_GENERATED: 'diff.generated',
  DIFF_APPLIED: 'diff.applied',
  DIFF_REVERTED: 'diff.reverted',

  // === WORKFLOW ===
  WORKFLOW_PROMOTION_REQUESTED: 'workflow.promotion.requested',
  WORKFLOW_PROMOTION_APPROVED: 'workflow.promotion.approved',
  WORKFLOW_PROMOTION_REJECTED: 'workflow.promotion.rejected',

  // === BROWSER PREVIEW ===
  BROWSER_NAVIGATED: 'browser.navigated',
  BROWSER_ACTION_PERFORMED: 'browser.action.performed',
  BROWSER_SCREENSHOT_CAPTURED: 'browser.screenshot.captured',
};

// Categorías de eventos para filtrado
const SupervisorEventCategories = {
  SESSION: [
    SupervisorEventTypes.SUPERVISOR_SESSION_CREATED,
    SupervisorEventTypes.SUPERVISOR_SESSION_UPDATED,
    SupervisorEventTypes.SUPERVISOR_SESSION_ENDED,
    SupervisorEventTypes.SUPERVISOR_SESSION_PAUSED,
    SupervisorEventTypes.SUPERVISOR_SESSION_RESUMED,
  ],
  AGENT: [
    SupervisorEventTypes.SUPERVISOR_AGENT_ADDED,
    SupervisorEventTypes.SUPERVISOR_AGENT_REMOVED,
    SupervisorEventTypes.SUPERVISOR_AGENT_STARTED,
    SupervisorEventTypes.SUPERVISOR_AGENT_PAUSED,
    SupervisorEventTypes.SUPERVISOR_AGENT_RESUMED,
    SupervisorEventTypes.SUPERVISOR_AGENT_STOPPED,
    SupervisorEventTypes.SUPERVISOR_AGENT_STATUS_CHANGED,
  ],
  TASK: [
    SupervisorEventTypes.SUPERVISOR_TASK_CREATED,
    SupervisorEventTypes.SUPERVISOR_TASK_ASSIGNED,
    SupervisorEventTypes.SUPERVISOR_TASK_STARTED,
    SupervisorEventTypes.SUPERVISOR_TASK_PROGRESS,
    SupervisorEventTypes.SUPERVISOR_TASK_COMPLETED,
    SupervisorEventTypes.SUPERVISOR_TASK_FAILED,
    SupervisorEventTypes.SUPERVISOR_TASK_CANCELLED,
  ],
  SANDBOX: [
    SupervisorEventTypes.SANDBOX_CREATED,
    SupervisorEventTypes.SANDBOX_DESTROYED,
    SupervisorEventTypes.SANDBOX_STATUS_CHANGED,
  ],
  SANDBOX_COMMAND: [
    SupervisorEventTypes.SANDBOX_COMMAND_EXECUTED,
    SupervisorEventTypes.SANDBOX_COMMAND_OUTPUT,
    SupervisorEventTypes.SANDBOX_COMMAND_ERROR,
  ],
  SANDBOX_FILE: [
    SupervisorEventTypes.SANDBOX_FILE_READ,
    SupervisorEventTypes.SANDBOX_FILE_WRITTEN,
    SupervisorEventTypes.SANDBOX_FILE_DELETED,
    SupervisorEventTypes.SANDBOX_FILE_MODIFIED,
    SupervisorEventTypes.SANDBOX_CHANGES_DETECTED,
    SupervisorEventTypes.SANDBOX_FILE_STAGED,
    SupervisorEventTypes.SANDBOX_FILE_UNSTAGED,
    SupervisorEventTypes.SANDBOX_FILE_PROMOTED,
    SupervisorEventTypes.SANDBOX_FILE_DISCARDED,
  ],
  WORKFLOW: [
    SupervisorEventTypes.WORKFLOW_PROMOTION_REQUESTED,
    SupervisorEventTypes.WORKFLOW_PROMOTION_APPROVED,
    SupervisorEventTypes.WORKFLOW_PROMOTION_REJECTED,
  ],
};

/**
 * Helper para crear payload de sesión
 */
function createSessionPayload(session, userId) {
  return {
    sessionId: session.id || session.sessionId,
    name: session.name,
    description: session.description,
    agentCount: session.agents?.length || 0,
    taskCount: session.stats?.totalTasks || 0,
    status: session.status,
    userId,
  };
}

/**
 * Helper para crear payload de agente
 */
function createAgentPayload(agent, sessionId) {
  return {
    agentId: agent.id || agent.agentId,
    type: agent.type,
    name: agent.name,
    sessionId,
    status: agent.status,
    capabilities: agent.capabilities || [],
  };
}

/**
 * Helper para crear payload de tarea
 */
function createTaskPayload(task, sessionId, agentId) {
  return {
    taskId: task.id || task.taskId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    sessionId,
    agentId,
    status: task.status,
    result: task.result,
    error: task.error,
  };
}

/**
 * Helper para crear payload de sandbox
 */
function createSandboxPayload(sandbox, userId) {
  return {
    sandboxId: sandbox.id || sandbox.sandboxId,
    sessionId: sandbox.sessionId,
    workspacePath: sandbox.workspacePath,
    status: sandbox.status,
    userId,
  };
}

/**
 * Helper para crear payload de comando
 */
function createCommandPayload(sandboxId, command, result) {
  return {
    sandboxId,
    command,
    exitCode: result?.exitCode,
    stdout: result?.stdout,
    stderr: result?.stderr,
    duration: result?.duration,
  };
}

/**
 * Helper para crear payload de archivo
 */
function createFilePayload(sandboxId, filePath, operation, metadata = {}) {
  return {
    sandboxId,
    filePath,
    operation, // read, write, delete, modify
    ...metadata,
  };
}

module.exports = {
  SupervisorEventTypes,
  SupervisorEventCategories,
  createSessionPayload,
  createAgentPayload,
  createTaskPayload,
  createSandboxPayload,
  createCommandPayload,
  createFilePayload,
};
