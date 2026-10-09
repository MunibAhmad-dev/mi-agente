/**
 * CodeReviewerStrategy — Specialized sub-agent for code review.
 *
 * Analyzes code changes and provides structured feedback:
 *   - Bug detection
 *   - Style/convention issues
 *   - Security concerns
 *   - Performance suggestions
 *
 * Integrates with SecurityScanner for automated security checks.
 */

const path = require('path');
const SecurityScanner = require(path.join(__dirname, '..', 'SecurityScanner'));

const STRATEGY = {
  name: 'code_reviewer',
  role: 'You are a senior code reviewer. Analyze code for bugs, security issues, style violations, and performance problems. Provide specific, actionable feedback with line references.',
  tools: ['read_file', 'grep_search', 'glob_search', 'web_search'],
  temperature: 0.2,
  systemPrompt:
    'You are an expert code reviewer. For each code change:\n' +
    '1. Identify bugs (logic errors, edge cases, null/undefined)\n' +
    '2. Check security (use security scan results)\n' +
    '3. Verify style conventions\n' +
    '4. Suggest performance improvements\n' +
    'Format: { severity, line, issue, suggestion }',
};

/**
 * Build a review prompt for the LLM.
 * @param {string} code
 * @param {object} [context]
 * @returns {Promise<string>}
 */
async function buildReviewPrompt(code, _context = {}) {
  let securityInfo = '';
  try {
    const scan = await SecurityScanner.preExecutionCheck(code);
    securityInfo =
      scan.findings.length > 0
        ? `\n\nSecurity scan results:\n${JSON.stringify(scan.findings, null, 2)}`
        : '\n\nSecurity scan: no issues found.';
  } catch {
    securityInfo = '\n\nSecurity scan: unavailable.';
  }
  return `${STRATEGY.systemPrompt}\n\nCode to review:\n\`\`\`\n${code}\n\`\`\`${securityInfo}`;
}

/**
 * Parse LLM review output into structured findings.
 * @param {string} llmOutput
 * @returns {Array<{severity: string, line: number, issue: string, suggestion: string}>}
 */
function parseReviewOutput(llmOutput) {
  const findings = [];
  const lines = llmOutput.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s*(\w+):\s*(?:L?(\d+))?\s*[-—]?\s*(.+?)(?:\s*→\s*(.+))?$/i);
    if (match) {
      findings.push({
        severity: match[1].toLowerCase(),
        line: parseInt(match[2], 10) || 0,
        issue: match[3] || '',
        suggestion: match[4] || '',
      });
    }
  }
  return findings;
}

module.exports = {
  STRATEGY,
  buildReviewPrompt,
  parseReviewOutput,
};
