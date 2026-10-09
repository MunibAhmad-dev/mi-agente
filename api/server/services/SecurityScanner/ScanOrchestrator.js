/**
 * ScanOrchestrator — Coordinates security scans before/after agent actions.
 *
 * Integrates the three scanners (Secrets, SAST, Dependency) and provides
 * a single entry point for the AgentFirewall's PreToolUse hook:
 *   1. SecretsScanner (Gitleaks, MIT) — hardcoded secrets
 *   2. SASTScanner (ast-grep, MIT) — dangerous code patterns
 *   3. DependencyScanner (OSV-Scanner, Apache) — vulnerable dependencies
 *
 * Returns a unified verdict: { safe, blockers, warnings, findings }
 */

const SecretsScanner = require('./SecretsScanner');
const SASTScanner = require('./SASTScanner');
const DependencyScanner = require('./DependencyScanner');

/**
 * Scan a code content string with all scanners.
 * @param {string} content
 * @param {object} [opts]
 * @param {string} [opts.fileName]
 * @param {boolean} [opts.scanSecrets=true]
 * @param {boolean} [opts.scanSAST=true]
 * @param {boolean} [opts.scanDeps=false] - only for manifest files
 * @returns {Promise<{safe: boolean, blockers: Array, warnings: Array, findings: Array}>}
 */
async function scanContent(content, opts = {}) {
  if (!content || typeof content !== 'string') {
    return { safe: true, blockers: [], warnings: [], findings: [] };
  }
  const tasks = [];
  if (opts.scanSecrets !== false) {
    tasks.push(
      SecretsScanner.scanContent(content).then((r) => ({ scanner: 'secrets', results: r })),
    );
  }
  if (opts.scanSAST !== false) {
    tasks.push(SASTScanner.scanContent(content).then((r) => ({ scanner: 'sast', results: r })));
  }
  if (opts.scanDeps === true && opts.fileName) {
    tasks.push(
      DependencyScanner.scanContent(content, opts.fileName).then((r) => ({
        scanner: 'deps',
        results: r,
      })),
    );
  }
  const scanResults = await Promise.allSettled(tasks);
  const findings = [];
  for (const result of scanResults) {
    if (result.status === 'fulfilled' && Array.isArray(result.value.results)) {
      for (const f of result.value.results) {
        findings.push({ ...f, scanner: result.value.scanner });
      }
    }
  }
  const blockers = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const warnings = findings.filter((f) => f.severity === 'medium' || f.severity === 'low');
  return {
    safe: blockers.length === 0,
    blockers,
    warnings,
    findings,
  };
}

/**
 * Pre-execution security check for the AgentFirewall.
 * Returns { allowed: boolean, reason: string, findings: Array }.
 * @param {string} content - code about to be executed/written
 * @param {object} [opts]
 * @returns {Promise<{allowed: boolean, reason: string, findings: Array}>}
 */
async function preExecutionCheck(content, opts = {}) {
  const result = await scanContent(content, opts);
  if (!result.safe) {
    const types = result.blockers.map((b) => `${b.scanner}:${b.type}`).join(', ');
    return {
      allowed: false,
      reason: `Security scan blocked execution: ${types}`,
      findings: result.findings,
    };
  }
  if (result.warnings.length > 0) {
    return {
      allowed: true,
      reason: `Security warnings: ${result.warnings.length} finding(s)`,
      findings: result.findings,
    };
  }
  return { allowed: true, reason: 'No security issues found', findings: [] };
}

/**
 * Scan a directory with all scanners.
 * @param {string} dirPath
 * @returns {Promise<{safe: boolean, blockers: Array, warnings: Array, findings: Array}>}
 */
async function scanDirectory(dirPath) {
  const tasks = [
    SecretsScanner.scanDirectory(dirPath).then((r) => ({ scanner: 'secrets', results: r })),
    SASTScanner.scanDirectory(dirPath).then((r) => ({ scanner: 'sast', results: r })),
    DependencyScanner.scanDirectory(dirPath).then((r) => ({ scanner: 'deps', results: r })),
  ];
  const scanResults = await Promise.allSettled(tasks);
  const findings = [];
  for (const result of scanResults) {
    if (result.status === 'fulfilled' && Array.isArray(result.value.results)) {
      for (const f of result.value.results) {
        findings.push({ ...f, scanner: result.value.scanner });
      }
    }
  }
  const blockers = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const warnings = findings.filter((f) => f.severity === 'medium' || f.severity === 'low');
  return {
    safe: blockers.length === 0,
    blockers,
    warnings,
    findings,
  };
}

/**
 * Get scanner availability status.
 * @returns {{secrets: boolean, sast: boolean, deps: boolean}}
 */
function getScannerStatus() {
  return {
    secrets: SecretsScanner.isAvailable(),
    sast: SASTScanner.isAvailable(),
    deps: DependencyScanner.isBinaryAvailable(),
  };
}

module.exports = {
  scanContent,
  preExecutionCheck,
  scanDirectory,
  getScannerStatus,
  SecretsScanner,
  SASTScanner,
  DependencyScanner,
};
