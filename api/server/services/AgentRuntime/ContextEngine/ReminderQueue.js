/**
 * ReminderQueue — manages short, single-purpose reminders that get injected
 * at the right moment (agent-harness pattern). Prevents instruction fade-out
 * in long sessions by re-injecting critical guidance right before the model
 * needs it.
 *
 * Queue management:
 *   - Prioritization: safety reminders first, then normal, then low.
 *   - Batching: group related reminders to avoid flooding.
 *   - Deduplication: don't repeat the same reminder twice.
 */

const PRIORITIES = {
  SAFETY: 0,
  NORMAL: 1,
  LOW: 2,
};

/**
 * Create a new reminder queue.
 * @returns {object}
 */
function create() {
  return {
    pending: [],
    injectedHashes: new Set(),
  };
}

/**
 * Enqueue a reminder.
 * @param {object} queue
 * @param {object} reminder { text, priority, point, dedupKey }
 */
function enqueue(queue, reminder) {
  if (!queue || !reminder || !reminder.text) {
    return;
  }
  const dedupKey = reminder.dedupKey || reminder.text;
  if (queue.injectedHashes.has(dedupKey)) {
    return;
  }
  queue.pending.push({
    text: reminder.text,
    priority: reminder.priority != null ? reminder.priority : PRIORITIES.NORMAL,
    point: reminder.point || 'before_model_call',
    dedupKey,
  });
}

/**
 * Enqueue a safety reminder (highest priority).
 * @param {object} queue
 * @param {string} text
 */
function enqueueSafety(queue, text) {
  enqueue(queue, { text, priority: PRIORITIES.SAFETY, point: 'before_model_call' });
}

/**
 * Enqueue reminders derived from a tool result. If a tool returned an error,
 * enqueue a reminder to verify before proceeding.
 * @param {object} queue
 * @param {object} toolCall
 * @param {object} result
 */
function enqueueFromToolResult(queue, toolCall, result) {
  if (!queue || !result) {
    return;
  }
  if (result.error || (result.code && result.code !== 0 && !result.continue)) {
    enqueueSafety(queue, 'A previous tool call failed. Review the error before retrying.');
  }
}

/**
 * Flush (drain) reminders queued for a specific injection point. Sorts by
 * priority (safety first), applies deduplication, and marks them as injected.
 * @param {object} queue
 * @param {string} point
 * @returns {object[]} drained reminders, sorted by priority
 */
function flush(queue, point) {
  if (!queue || queue.pending.length === 0) {
    return [];
  }
  const matched = queue.pending.filter((r) => r.point === point);
  queue.pending = queue.pending.filter((r) => r.point !== point);
  matched.sort((a, b) => a.priority - b.priority);
  for (const r of matched) {
    queue.injectedHashes.add(r.dedupKey);
  }
  return matched;
}

/**
 * Peek at pending reminders without draining.
 * @param {object} queue
 * @param {string} point
 * @returns {object[]}
 */
function peek(queue, point) {
  if (!queue) {
    return [];
  }
  return queue.pending.filter((r) => r.point === point).sort((a, b) => a.priority - b.priority);
}

module.exports = {
  PRIORITIES,
  create,
  enqueue,
  enqueueSafety,
  enqueueFromToolResult,
  flush,
  peek,
};
