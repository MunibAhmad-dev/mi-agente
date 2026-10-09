/**
 * DebuggerStrategy — Specialized sub-agent for debugging.
 *
 * Analyzes errors, stack traces, and failing tests to identify root causes
 * and propose fixes. Uses a systematic approach:
 *   1. Parse error/stack trace
 *   2. Identify relevant code locations
 *   3. Hypothesize root causes
 *   4. Propose minimal fixes
 */

const STRATEGY = {
  name: 'debugger',
  role: 'You are a debugging specialist. Analyze errors and stack traces to identify root causes and propose minimal, targeted fixes.',
  tools: ['read_file', 'grep_search', 'glob_search', 'execute_command', 'apply_patch'],
  temperature: 0.1,
  systemPrompt:
    'You are an expert debugger. Follow this process:\n' +
    '1. Parse the error message and stack trace\n' +
    '2. Identify the exact file and line causing the error\n' +
    '3. Read the surrounding code for context\n' +
    '4. Form 2-3 root cause hypotheses\n' +
    '5. Propose the minimal fix that addresses the root cause (not symptoms)\n' +
    'Format: { rootCause, hypothesis, fix, files }',
};

/**
 * Parse an error stack trace to extract key info.
 * @param {string} errorText
 * @returns {{message: string, files: Array<{file: string, line: number, fn: string}>, type: string}}
 */
function parseStackTrace(errorText) {
  const message = errorText.split('\n')[0] || '';
  const files = [];
  const lines = errorText.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*at\s+(\S+)\s+\((.+):(\d+):\d+\)/);
    if (match) {
      files.push({ fn: match[1], file: match[2], line: parseInt(match[3], 10) });
    } else {
      const match2 = line.match(/^\s*at\s+(.+):(\d+):\d+/);
      if (match2) {
        files.push({ fn: '<anonymous>', file: match2[1], line: parseInt(match2[2], 10) });
      }
    }
  }
  const typeMatch = message.match(/^(\w+Error|Error|Exception):\s*(.*)/);
  return {
    message: message,
    type: typeMatch ? typeMatch[1] : 'Error',
    detail: typeMatch ? typeMatch[2] : message,
    files,
  };
}

/**
 * Build a debugging prompt for the LLM.
 * @param {string} errorText
 * @param {string} [codeContext]
 * @returns {string}
 */
function buildDebugPrompt(errorText, codeContext = '') {
  const parsed = parseStackTrace(errorText);
  let prompt = `${STRATEGY.systemPrompt}\n\nError:\n${errorText}`;
  if (codeContext) {
    prompt += `\n\nRelevant code:\n\`\`\`\n${codeContext}\n\`\`\``;
  }
  prompt += `\n\nParsed stack:\n${JSON.stringify(parsed, null, 2)}`;
  return prompt;
}

module.exports = {
  STRATEGY,
  parseStackTrace,
  buildDebugPrompt,
};
