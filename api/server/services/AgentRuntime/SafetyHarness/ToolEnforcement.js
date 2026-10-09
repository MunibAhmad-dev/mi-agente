/**
 * ToolEnforcement — enforces tool output shape so tools always return a
 * predictable structure (agent-harness "Tool Output Protocol"). One tool
 * output can have multiple renderings: structured JSON for the UI, a compact
 * text rendering for the model, and attached reminders.
 */

function computeCode(result) {
  if (typeof result.code === 'number') {
    return result.code;
  }
  if (result.error) {
    return 1;
  }
  return 0;
}

/**
 * Normalize a tool result into a predictable shape.
 * @param {object} toolCall
 * @param {object|string} result raw result
 * @returns {object} normalized { content, stdout, stderr, code, error, files, continue }
 */
function normalize(toolCall, result) {
  const toolName = toolCall?.name || toolCall?.function?.name || 'unknown';

  if (typeof result === 'string') {
    return {
      toolName,
      content: result,
      stdout: result,
      stderr: '',
      code: 0,
      error: null,
      files: [],
      continue: true,
    };
  }
  if (!result) {
    return {
      toolName,
      content: '',
      stdout: '',
      stderr: '',
      code: 1,
      error: 'null result',
      files: [],
      continue: false,
    };
  }

  return {
    toolName,
    content: result.content || result.stdout || result.output || '',
    stdout: result.stdout || result.content || '',
    stderr: result.stderr || '',
    code: computeCode(result),
    error: result.error || (result.code && result.code !== 0 ? `exit ${result.code}` : null),
    files: result.files || result.modifiedFiles || [],
    continue: result.continue !== false,
  };
}

/**
 * Render a tool result for the LLM: compact text, not full JSON (RTK pattern:
 * strip ANSI, dedup, truncate). This keeps tokens lean.
 * @param {object} normalized
 * @param {number} maxChars
 * @returns {string}
 */
function renderForModel(normalized, maxChars = 8000) {
  if (!normalized) {
    return '';
  }
  let text = normalized.content || normalized.stdout || '';
  // eslint-disable-next-line no-control-regex
  text = text.replace(/\x1b\[[0-9;]*m/g, ''); // strip ANSI
  text = text.replace(/^(.+)$\n\1$/gm, '$1'); // dedup consecutive identical lines
  text = text.replace(/\n{3,}/g, '\n\n'); // collapse whitespace
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + '\n...[output truncated]';
  }
  if (normalized.error) {
    text = `[ERROR] ${normalized.error}\n${text}`;
  }
  return text;
}

/**
 * Render a tool result for the UI: full structured JSON.
 * @param {object} normalized
 * @returns {object}
 */
function renderForUI(normalized) {
  return normalized;
}

module.exports = { normalize, renderForModel, renderForUI };
