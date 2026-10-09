/**
 * StopConditions — decides when the agent loop should stop, based on what
 * actually happened (agent-harness pattern). Not just "no more tool calls"
 * but: doom loops, repeated failures, no progress, budget exhausted.
 */

const DEFAULTS = {
  maxToolCalls: 200,
  maxRepeatedFailures: 5,
  maxRepeatedSameTool: 10,
  maxTurnsWithoutProgress: 15,
};

/**
 * Observe a tool call/result and update session counters.
 * @param {object} session
 * @param {object} toolCall
 * @param {object} result
 */
function observe(session, toolCall, result) {
  if (!session || !toolCall) {
    return;
  }
  session._stop = session._stop || {
    consecutiveFailures: 0,
    lastTool: null,
    sameToolCount: 0,
    turnsWithoutProgress: 0,
  };
  const st = session._stop;
  const toolName = toolCall.name || toolCall.function?.name || 'unknown';
  const failed = !result || result.error || (result.code && result.code !== 0);

  if (failed) {
    st.consecutiveFailures += 1;
  } else {
    st.consecutiveFailures = 0;
    st.turnsWithoutProgress = 0;
  }

  if (toolName === st.lastTool) {
    st.sameToolCount += 1;
  } else {
    st.sameToolCount = 1;
    st.lastTool = toolName;
  }

  st.turnsWithoutProgress += 1;
}

/**
 * Mark that progress was made (resets the no-progress counter).
 * @param {object} session
 */
function markProgress(session) {
  if (!session._stop) {
    return;
  }
  session._stop.turnsWithoutProgress = 0;
}

/**
 * Evaluate whether the agent loop should stop.
 * @param {object} session
 * @param {object} opts override defaults
 * @returns {{stop:boolean, reason:string|null}}
 */
function evaluate(session, opts = {}) {
  if (!session) {
    return { stop: false, reason: null };
  }
  const cfg = { ...DEFAULTS, ...opts };
  const st = session._stop || { consecutiveFailures: 0, sameToolCount: 0, turnsWithoutProgress: 0 };

  if (session.toolCalls >= cfg.maxToolCalls) {
    return { stop: true, reason: `max_tool_calls (${cfg.maxToolCalls})` };
  }
  if (st.consecutiveFailures >= cfg.maxRepeatedFailures) {
    return { stop: true, reason: `repeated_failures (${st.consecutiveFailures})` };
  }
  if (st.sameToolCount >= cfg.maxRepeatedSameTool) {
    return { stop: true, reason: `doom_loop: same tool ${st.sameToolCount}x` };
  }
  if (st.turnsWithoutProgress >= cfg.maxTurnsWithoutProgress) {
    return { stop: true, reason: `no_progress (${cfg.maxTurnsWithoutProgress} turns)` };
  }
  return { stop: false, reason: null };
}

module.exports = { DEFAULTS, observe, markProgress, evaluate };
