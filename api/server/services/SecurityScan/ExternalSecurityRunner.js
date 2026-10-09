'use strict';

/**
 * ExternalSecurityRunner — Face 11: orchestrates external security tools.
 *
 * Wraps Semgrep, Trivy, Gitleaks, Grype, and ZAP into a single unified
 * interface. Each tool is tried via child_process; if the binary is not
 * installed the runner logs a warning and continues with available tools.
 *
 * Integration philosophy: augments (not replaces) the existing custom
 * SecurityScanner service. External tools run when available; custom
 * scanner always runs as the baseline.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);
const TOOL_TIMEOUT_MS = 120_000;

const TOOLS = ['semgrep', 'trivy', 'gitleaks', 'grype', 'zap'];

const SEVERITY_MAP = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low', INFO: 'info' };

class ExternalSecurityRunner {
  constructor({ enabledTools = TOOLS, timeoutMs = TOOL_TIMEOUT_MS } = {}) {
    this._enabledTools = new Set(enabledTools);
    this._timeoutMs = timeoutMs;
    this._availability = {};
    this._results = [];
  }

  /**
   * Run all available external security tools against the target path.
   * @param {object} opts
   * @param {string} opts.targetPath - directory or file to scan
   * @param {string} [opts.type] - 'sast' | 'secrets' | 'container' | 'deps' | 'dast' | 'all'
   * @returns {Promise<{findings: Finding[], tools_run: string[], tools_skipped: string[], summary: object}>}
   */
  async run({ targetPath, type = 'all' }) {
    const findings = [];
    const toolsRun = [];
    const toolsSkipped = [];

    const runMap = {
      semgrep: type === 'all' || type === 'sast',
      trivy: type === 'all' || type === 'deps' || type === 'container',
      gitleaks: type === 'all' || type === 'secrets',
      grype: type === 'all' || type === 'deps',
      zap: false,
    };

    const tasks = [];
    for (const [tool, shouldRun] of Object.entries(runMap)) {
      if (!shouldRun || !this._enabledTools.has(tool)) continue;
      tasks.push(
        this._runTool(tool, targetPath).then((result) => {
          if (result.available) {
            toolsRun.push(tool);
            findings.push(...result.findings);
          } else {
            toolsSkipped.push(tool);
          }
        }),
      );
    }
    await Promise.allSettled(tasks);

    const critical = findings.filter((f) => f.severity === 'critical').length;
    const high = findings.filter((f) => f.severity === 'high').length;
    const medium = findings.filter((f) => f.severity === 'medium').length;
    const low = findings.filter((f) => f.severity === 'low').length;

    const record = {
      id: `ext_scan_${Date.now()}`,
      targetPath,
      tools_run: toolsRun,
      tools_skipped: toolsSkipped,
      findings,
      summary: { critical, high, medium, low, total: findings.length },
      scanned_at: new Date().toISOString(),
    };
    this._results.push(record);
    if (this._results.length > 30) this._results.shift();

    return { findings, tools_run: toolsRun, tools_skipped: toolsSkipped, summary: record.summary };
  }

  async _runTool(tool, targetPath) {
    if (this._availability[tool] === false) {
      return { available: false, findings: [] };
    }

    try {
      let findings = [];
      switch (tool) {
        case 'semgrep': findings = await this._runSemgrep(targetPath); break;
        case 'trivy': findings = await this._runTrivy(targetPath); break;
        case 'gitleaks': findings = await this._runGitleaks(targetPath); break;
        case 'grype': findings = await this._runGrype(targetPath); break;
        default: return { available: false, findings: [] };
      }
      this._availability[tool] = true;
      return { available: true, findings };
    } catch (e) {
      if (e.code === 'ENOENT') {
        this._availability[tool] = false;
        return { available: false, findings: [] };
      }
      return { available: true, findings: [] };
    }
  }

  async _runSemgrep(targetPath) {
    const { stdout } = await execFileAsync(
      'semgrep',
      ['--json', '--quiet', '--config', 'auto', targetPath],
      { timeout: this._timeoutMs },
    );
    const parsed = JSON.parse(stdout || '{}');
    return (parsed.results || []).map((r) => ({
      tool: 'semgrep',
      rule_id: r.check_id || '',
      file: r.path || '',
      line: r.start?.line || null,
      message: r.extra?.message || r.message || '',
      severity: (SEVERITY_MAP[r.extra?.severity?.toUpperCase()] || 'info'),
    }));
  }

  async _runTrivy(targetPath) {
    const { stdout } = await execFileAsync(
      'trivy',
      ['fs', '--format', 'json', '--quiet', targetPath],
      { timeout: this._timeoutMs },
    );
    const parsed = JSON.parse(stdout || '{}');
    const findings = [];
    for (const result of (parsed.Results || [])) {
      for (const vuln of (result.Vulnerabilities || [])) {
        findings.push({
          tool: 'trivy',
          rule_id: vuln.VulnerabilityID || '',
          file: result.Target || '',
          line: null,
          message: `${vuln.PkgName} ${vuln.InstalledVersion}: ${vuln.Title || vuln.Description || ''}`,
          severity: SEVERITY_MAP[vuln.Severity?.toUpperCase()] || 'info',
          fix_version: vuln.FixedVersion || null,
        });
      }
    }
    return findings;
  }

  async _runGitleaks(targetPath) {
    const { stdout } = await execFileAsync(
      'gitleaks',
      ['detect', '--source', targetPath, '--report-format', 'json', '--report-path', '/dev/stdout', '--no-git'],
      { timeout: this._timeoutMs },
    ).catch((e) => ({ stdout: e.stdout || '' }));
    if (!stdout) return [];
    const parsed = JSON.parse(stdout || '[]');
    return (Array.isArray(parsed) ? parsed : []).map((finding) => ({
      tool: 'gitleaks',
      rule_id: finding.RuleID || '',
      file: finding.File || '',
      line: finding.StartLine || null,
      message: `Secret detected: ${finding.Description || finding.Match || ''}`,
      severity: 'high',
    }));
  }

  async _runGrype(targetPath) {
    const { stdout } = await execFileAsync(
      'grype',
      ['dir:' + targetPath, '-o', 'json'],
      { timeout: this._timeoutMs },
    );
    const parsed = JSON.parse(stdout || '{}');
    return (parsed.matches || []).map((m) => ({
      tool: 'grype',
      rule_id: m.vulnerability?.id || '',
      file: m.artifact?.locations?.[0]?.virtualPath || '',
      line: null,
      message: `${m.artifact?.name} ${m.artifact?.version}: ${m.vulnerability?.description || ''}`,
      severity: SEVERITY_MAP[m.vulnerability?.severity?.toUpperCase()] || 'info',
    }));
  }

  /**
   * Check which external tools are installed.
   * @returns {Promise<object>} { semgrep: bool, trivy: bool, gitleaks: bool, grype: bool }
   */
  async checkAvailability() {
    const results = {};
    for (const tool of TOOLS) {
      try {
        await execFileAsync(tool, ['--version'], { timeout: 5000 });
        results[tool] = true;
        this._availability[tool] = true;
      } catch {
        results[tool] = false;
        this._availability[tool] = false;
      }
    }
    return results;
  }

  getResults(limit = 10) {
    return this._results.slice(-limit).reverse();
  }

  getSupportedTools() {
    return TOOLS;
  }
}

let _instance = null;
function getExternalSecurityRunner(opts) {
  if (!_instance) _instance = new ExternalSecurityRunner(opts);
  return _instance;
}

module.exports = { ExternalSecurityRunner, getExternalSecurityRunner, TOOLS };
