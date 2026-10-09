/**
 * ConversationState — treats conversation history as a queryable event stream
 * rather than a flat list of messages (agent-harness pattern). This lets the
 * harness query "what files were modified?" or "what errors occurred?" without
 * scanning every message.
 */

const crypto = require('crypto');

const EVENT_TYPES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  COMPACTION: 'compaction',
  SYSTEM: 'system',
  ERROR: 'error',
};

/**
 * Create a new conversation state.
 * @returns {object}
 */
function create() {
  return {
    events: [],
    droppedCount: 0,
    index: {
      byType: new Map(),
      byTool: new Map(),
      byFile: new Map(),
    },
  };
}

/**
 * Append an event to the state and update indexes.
 * @param {object} state
 * @param {object} event { type, content, toolName, files, ... }
 */
function append(state, event) {
  if (!state || !event) {
    return;
  }
  const e = {
    id: event.id || crypto.randomUUID(),
    timestamp: event.timestamp || new Date().toISOString(),
    ...event,
  };
  state.events.push(e);
  indexEvent(state, e);
}

/**
 * Append a tool result event.
 * @param {object} state
 * @param {object} toolCall
 * @param {object} result
 */
function appendToolResult(state, toolCall, result) {
  const toolName = toolCall?.name || toolCall?.function?.name || 'unknown';
  const files = result.files || result.modifiedFiles || [];
  append(state, {
    type: EVENT_TYPES.TOOL_RESULT,
    toolName,
    content: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 2000),
    files,
    error: result.error || null,
    code: result.code,
  });
}

/**
 * Index an event for fast querying.
 * @param {object} state
 * @param {object} event
 */
function indexEvent(state, event) {
  const byType = state.index.byType.get(event.type) || [];
  byType.push(event.id);
  state.index.byType.set(event.type, byType);

  if (event.toolName) {
    const byTool = state.index.byTool.get(event.toolName) || [];
    byTool.push(event.id);
    state.index.byTool.set(event.toolName, byTool);
  }
  if (event.files) {
    for (const f of event.files) {
      const byFile = state.index.byFile.get(f) || [];
      byFile.push(event.id);
      state.index.byFile.set(f, byFile);
    }
  }
}

/**
 * Query events by type.
 * @param {object} state
 * @param {string} type
 * @returns {object[]}
 */
function byType(state, type) {
  const ids = state?.index?.byType?.get(type) || [];
  const idSet = new Set(ids);
  return state.events.filter((e) => idSet.has(e.id));
}

/**
 * Query events that touched a specific file.
 * @param {object} state
 * @param {string} filePath
 * @returns {object[]}
 */
function byFile(state, filePath) {
  const ids = state?.index?.byFile?.get(filePath) || [];
  const idSet = new Set(ids);
  return state.events.filter((e) => idSet.has(e.id));
}

/**
 * Get all errors that occurred.
 * @param {object} state
 * @returns {object[]}
 */
function errors(state) {
  return state.events.filter((e) => e.error || e.type === EVENT_TYPES.ERROR);
}

/**
 * Get the last N events.
 * @param {object} state
 * @param {number} n
 * @returns {object[]}
 */
function last(state, n = 5) {
  return state.events.slice(-n);
}

/**
 * Convert the event stream back to a flat message array for LLM input.
 * @param {object} state
 * @returns {object[]}
 */
function toMessages(state) {
  return state.events.map((e) => ({
    role: e.type === EVENT_TYPES.USER ? 'user' : 'assistant',
    content: e.content || '',
  }));
}

module.exports = {
  EVENT_TYPES,
  create,
  append,
  appendToolResult,
  byType,
  byFile,
  errors,
  last,
  toMessages,
};
