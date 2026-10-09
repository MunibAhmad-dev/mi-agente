/**
 * InjectionPoints — defines exactly where and when context gets injected into
 * the conversation (agent-harness pattern). Every conversation has the same
 * shape: system message, user message, tool call, tool response. We inject
 * short, single-purpose reminders at the right moment so the model gets the
 * guidance exactly when it needs it, preventing instruction fade-out in long
 * sessions (OPENDEV behavioral decay finding).
 */

/**
 * Injection points in the conversation lifecycle.
 */
const POINTS = {
  SYSTEM_MESSAGE: 'system_message',
  USER_MESSAGE: 'user_message',
  BEFORE_MODEL_CALL: 'before_model_call',
  TOOL_CALL: 'tool_call',
  TOOL_RESPONSE: 'tool_response',
  AFTER_MODEL_RESPONSE: 'after_model_response',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
};

/**
 * Inject reminders queued for the "before model call" point. Returns the list
 * of injected reminders so the caller can append them to the message.
 * @param {object} session
 * @param {object} msg
 * @returns {object[]} injected reminders
 */
function beforeModelCall(session, _msg) {
  if (!session || !session.reminders) {
    return [];
  }
  const ReminderQueue = require('./ReminderQueue');
  const reminders = ReminderQueue.flush(session.reminders, POINTS.BEFORE_MODEL_CALL);
  return reminders;
}

/**
 * Inject reminders at the tool response point. Called after a tool runs.
 * @param {object} session
 * @param {object} _toolCall
 * @param {object} _result
 * @returns {object[]}
 */
function toolResponse(session, _toolCall, _result) {
  if (!session || !session.reminders) {
    return [];
  }
  const ReminderQueue = require('./ReminderQueue');
  return ReminderQueue.flush(session.reminders, POINTS.TOOL_RESPONSE);
}

/**
 * Inject reminders at session start.
 * @param {object} session
 * @returns {object[]}
 */
function sessionStart(session) {
  if (!session || !session.reminders) {
    return [];
  }
  const ReminderQueue = require('./ReminderQueue');
  return ReminderQueue.flush(session.reminders, POINTS.SESSION_START);
}

/**
 * Inject reminders at session end.
 * @param {object} session
 * @returns {object[]}
 */
function sessionEnd(session) {
  if (!session || !session.reminders) {
    return [];
  }
  const ReminderQueue = require('./ReminderQueue');
  return ReminderQueue.flush(session.reminders, POINTS.SESSION_END);
}

module.exports = {
  POINTS,
  beforeModelCall,
  toolResponse,
  sessionStart,
  sessionEnd,
};
