/**
 * SecurityAuditorStrategy — Specialized sub-agent for security auditing.
 *
 * Performs comprehensive security analysis combining automated scanning
 * (SecurityScanner) with LLM reasoning for deep vulnerability analysis.
 */

const path = require('path');
const SecurityScanner = require(path.join(__dirname, '..', 'SecurityScanner'));

const STRATEGY = {
  name: 'security_auditor',
  role: 'You are a security auditing specialist. Identify vulnerabilities, assess risk, and provide remediation guidance.',
  tools: ['read_file', 'grep_search', 'glob_search', 'web_search'],
  temperature: 0.1,
  systemPrompt:
    'You are an expert security auditor. For each code review:\n' +
    '1. Review automated scanner findings (secrets, SAST, dependencies)\n' +
    '2. Analyze authentication/authorization logic\n' +
    '3. Check input validation and sanitization\n' +
    '4. Assess injection risks (SQL, command, XSS)\n' +
    '5. Evaluate crypto usage and TLS configuration\n' +
    '6. Rate each finding: critical/high/medium/low with CVSS-like score\n' +
    'Format: { severity, category, location, description, remediation, cvss }',
};

/**
 * Run automated scans and build audit context.
 * @param {string} code
 * @param {object} [opts]
 * @returns {Promise<{findings: Array, prompt: string}>}
 */
async function runAudit(code, opts = {}) {
  const scan = await SecurityScanner.scanContent(code, {
    scanSecrets: true,
    scanSAST: true,
    scanDeps: opts.fileName === 'package.json',
    fileName: opts.fileName,
  });
  const prompt = `${STRATEGY.systemPrompt}\n\nCode to audit:\n\`\`\`\n${code}\n\`\`\`\n\nAutomated scan results:\n${JSON.stringify(scan.findings, null, 2)}`;
  return { findings: scan.findings, prompt };
}

/**
 * Parse LLM audit output.
 * @param {string} llmOutput
 * @returns {Array<{severity: string, category: string, location: string, remediation: string}>}
 */
function parseAuditOutput(llmOutput) {
  const findings = [];
  const lines = llmOutput.split('\n');
  for (const line of lines) {
    const match = line.match(
      /^\s*[-*]\s*(\w+)\s*[-—]\s*(\w+)\s*@\s*(.+?)\s*:\s*(.+?)(?:\s*→\s*Fix:\s*(.+))?$/i,
    );
    if (match) {
      findings.push({
        severity: match[1].toLowerCase(),
        category: match[2],
        location: match[3],
        description: match[4],
        remediation: match[5] || '',
      });
    }
  }
  return findings;
}

module.exports = {
  STRATEGY,
  runAudit,
  parseAuditOutput,
};
