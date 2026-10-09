'use strict';

/**
 * ExternalSecurityTools — Face 11.
 * Adapter layer for external security scanning tools:
 * Semgrep, Trivy, Gitleaks, Grype, OWASP ZAP.
 * Each tool runs as a subprocess and returns structured findings.
 */

const { spawn } = require('child_process');
const path = require('path');

function runCommand(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || 120000;
    const proc = spawn(cmd, args, { cwd: opts.cwd || process.cwd(), shell: true });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`Timeout: ${cmd}`)); }, timeout);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function parseJsonSafe(str) {
  try { return JSON.parse(str); } catch { return null; }
}

const TOOLS = {
  /**
   * Semgrep — static analysis for code vulnerabilities.
   */
  semgrep: {
    name: 'semgrep',
    check: async () => {
      try { await runCommand('semgrep', ['--version'], { timeout: 5000 }); return true; } catch { return false; }
    },
    scan: async (targetPath, config = 'auto') => {
      const { code, stdout, stderr } = await runCommand('semgrep', [
        'scan', '--json', '--config', config, targetPath,
      ], { timeout: 120000 });
      const parsed = parseJsonSafe(stdout);
      if (!parsed) return { tool: 'semgrep', error: stderr || 'Parse failed', findings: [], raw: stdout };
      const findings = (parsed.results || []).map((r) => ({
        rule_id: r.check_id,
        severity: r.extra?.severity || 'unknown',
        message: r.extra?.message || '',
        file: r.path,
        line: r.start?.line,
        code: r.extra?.lines,
      }));
      return { tool: 'semgrep', findings, total: findings.length, exit_code: code };
    },
  },

  /**
   * Trivy — container and filesystem vulnerability scanning.
   */
  trivy: {
    name: 'trivy',
    check: async () => {
      try { await runCommand('trivy', ['--version'], { timeout: 5000 }); return true; } catch { return false; }
    },
    scan: async (target, type = 'fs') => {
      const { code, stdout, stderr } = await runCommand('trivy', [
        type, '--format', 'json', '--quiet', target,
      ], { timeout: 180000 });
      const parsed = parseJsonSafe(stdout);
      if (!parsed) return { tool: 'trivy', error: stderr || 'Parse failed', findings: [], raw: stdout };
      const findings = [];
      for (const result of parsed.Results || []) {
        for (const v of result.Vulnerabilities || []) {
          findings.push({ cve: v.VulnerabilityID, package: v.PkgName, severity: v.Severity, title: v.Title, fixed_version: v.FixedVersion });
        }
      }
      return { tool: 'trivy', findings, total: findings.length, exit_code: code };
    },
  },

  /**
   * Gitleaks — secret and credential scanning in git repos.
   */
  gitleaks: {
    name: 'gitleaks',
    check: async () => {
      try { await runCommand('gitleaks', ['version'], { timeout: 5000 }); return true; } catch { return false; }
    },
    scan: async (repoPath) => {
      const { code, stdout, stderr } = await runCommand('gitleaks', [
        'detect', '--source', repoPath, '--report-format', 'json', '--report-path', '/dev/stdout', '--no-git',
      ], { timeout: 60000 });
      const parsed = parseJsonSafe(stdout) || [];
      const findings = (Array.isArray(parsed) ? parsed : [parsed]).map((r) => ({
        rule_id: r.RuleID,
        secret_type: r.Description,
        file: r.File,
        line: r.StartLine,
        commit: r.Commit,
        match: r.Match ? r.Match.substring(0, 20) + '...' : null,
      }));
      return { tool: 'gitleaks', findings, total: findings.length, exit_code: code };
    },
  },

  /**
   * Grype — vulnerability scanner for container images and filesystems.
   */
  grype: {
    name: 'grype',
    check: async () => {
      try { await runCommand('grype', ['version'], { timeout: 5000 }); return true; } catch { return false; }
    },
    scan: async (target) => {
      const { code, stdout, stderr } = await runCommand('grype', [
        target, '-o', 'json',
      ], { timeout: 120000 });
      const parsed = parseJsonSafe(stdout);
      if (!parsed) return { tool: 'grype', error: stderr || 'Parse failed', findings: [], raw: stdout };
      const findings = (parsed.matches || []).map((m) => ({
        cve: m.vulnerability?.id,
        package: m.artifact?.name,
        severity: m.vulnerability?.severity,
        fixed_in: m.vulnerability?.fix?.versions?.join(', '),
        description: m.vulnerability?.description?.substring(0, 200),
      }));
      return { tool: 'grype', findings, total: findings.length, exit_code: code };
    },
  },

  /**
   * OWASP ZAP — web application security scanning.
   */
  zap: {
    name: 'zap',
    check: async () => {
      try { await runCommand('zap.sh', ['-version'], { timeout: 10000 }); return true; } catch { return false; }
    },
    scan: async (targetUrl) => {
      const { code, stdout, stderr } = await runCommand('zap-cli', [
        'quick-scan', '--self-contained', '--start-options', '-config api.disablekey=true',
        '--output-format', 'json', targetUrl,
      ], { timeout: 300000 });
      const parsed = parseJsonSafe(stdout);
      if (!parsed) return { tool: 'zap', error: stderr || 'Parse failed', findings: [], raw: stdout };
      const findings = (parsed.alerts || []).map((a) => ({
        alert: a.alert,
        risk: a.riskdesc,
        url: a.url,
        description: a.desc?.substring(0, 200),
        solution: a.solution?.substring(0, 200),
      }));
      return { tool: 'zap', findings, total: findings.length, exit_code: code };
    },
  },
};

/**
 * Check which tools are available on the system.
 */
async function checkAvailability() {
  const results = {};
  await Promise.all(
    Object.entries(TOOLS).map(async ([name, tool]) => {
      results[name] = await tool.check();
    }),
  );
  return results;
}

/**
 * Run a specific tool scan.
 * @param {string} toolName - 'semgrep' | 'trivy' | 'gitleaks' | 'grype' | 'zap'
 * @param {string} target - Path or URL to scan
 * @param {object} opts - Tool-specific options
 */
async function scan(toolName, target, opts = {}) {
  const tool = TOOLS[toolName];
  if (!tool) return { error: `Unknown tool: ${toolName}` };
  const available = await tool.check();
  if (!available) return { tool: toolName, error: `${toolName} is not installed or not in PATH`, findings: [] };
  return tool.scan(target, opts.config || opts.type || opts.targetUrl || target);
}

/**
 * Run all available tools on a target.
 */
async function scanAll(target, opts = {}) {
  const availability = await checkAvailability();
  const available = Object.entries(availability).filter(([, v]) => v).map(([k]) => k);
  const results = await Promise.allSettled(
    available.map((name) => scan(name, target, opts)),
  );
  return Object.fromEntries(
    results.map((r, i) => [available[i], r.status === 'fulfilled' ? r.value : { error: r.reason?.message }]),
  );
}

module.exports = { scan, scanAll, checkAvailability, TOOLS };
