/**
 * SecretsScanner — Secret detection using Gitleaks (MIT, Go binary).
 *
 * Scans code, files, and directories for hardcoded secrets (API keys,
 * tokens, passwords, certificates) using the Gitleaks binary. Falls back
 * to a regex-based heuristic when the binary is not available.
 *
 * License: MIT (Gitleaks)
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const fs = require('fs');
const path = require('path');

let _binaryPath = null;

/**
 * Get the path to the gitleaks binary.
 * @returns {string|null}
 */
function getBinaryPath() {
  if (_binaryPath !== null) return _binaryPath;
  _binaryPath = process.env.GITLEAKS_PATH || '';
  if (_binaryPath) return _binaryPath;
  // Check default location
  const defaultPath = path.join(__dirname, '..', '..', '..', '..', 'binaries', 'gitleaks');
  try {
    if (fs.existsSync(defaultPath)) {
      _binaryPath = defaultPath;
    } else {
      _binaryPath = '';
    }
  } catch {
    _binaryPath = '';
  }
  return _binaryPath;
}

/**
 * Check if gitleaks binary is available.
 * @returns {boolean}
 */
function isAvailable() {
  return Boolean(getBinaryPath());
}

/**
 * Regex-based heuristic fallback for secret detection.
 * @param {string} content
 * @returns {Array<{type: string, line: number, match: string, severity: string}>}
 */
function heuristicScan(content) {
  if (!content || typeof content !== 'string') return [];
  const patterns = [
    { type: 'aws_access_key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
    {
      type: 'aws_secret',
      regex: /aws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]{40}['"]/gi,
      severity: 'critical',
    },
    { type: 'github_token', regex: /ghp_[A-Za-z0-9]{36}/g, severity: 'critical' },
    { type: 'github_token_oauth', regex: /gho_[A-Za-z0-9]{36}/g, severity: 'critical' },
    { type: 'github_app_token', regex: /(ghu|ghs)_[A-Za-z0-9]{36}/g, severity: 'critical' },
    { type: 'github_refresh_token', regex: /ghr_[A-Za-z0-9]{76}/g, severity: 'critical' },
    { type: 'google_api_key', regex: /AIza[0-9A-Za-z\-_]{35}/g, severity: 'high' },
    { type: 'openai_key', regex: /sk-[A-Za-z0-9]{48}/g, severity: 'critical' },
    { type: 'slack_token', regex: /xox[baprs]-[A-Za-z0-9-]+/g, severity: 'high' },
    { type: 'stripe_key', regex: /sk_live_[A-Za-z0-9]{24,}/g, severity: 'critical' },
    {
      type: 'private_key',
      regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
      severity: 'critical',
    },
    {
      type: 'generic_password',
      regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      severity: 'medium',
    },
    {
      type: 'generic_secret',
      regex: /(?:secret|api_key|apikey|access_token)\s*[:=]\s*['"][^'"]{16,}['"]/gi,
      severity: 'medium',
    },
  ];

  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { type, regex, severity } of patterns) {
      let match;
      const re = new RegExp(regex.source, regex.flags);
      while ((match = re.exec(line)) !== null) {
        findings.push({
          type,
          line: i + 1,
          match: match[0].substring(0, 80),
          severity,
          source: 'heuristic',
        });
        if (match.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
  return findings;
}

/**
 * Scan a string of content for secrets.
 * @param {string} content
 * @returns {Promise<Array>}
 */
async function scanContent(content) {
  if (!content || typeof content !== 'string') return [];
  if (!isAvailable()) return heuristicScan(content);
  try {
    const tmpFile = path.join(require('os').tmpdir(), `gitleaks_scan_${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, content, 'utf8');
    const { stdout } = await execFileAsync(
      getBinaryPath(),
      [
        'detect',
        '--source',
        tmpFile,
        '--no-banner',
        '--report-format',
        'json',
        '--log-level',
        'error',
      ],
      { timeout: 15000 },
    );
    fs.unlinkSync(tmpFile);
    try {
      const results = JSON.parse(stdout || '[]');
      return results.map((r) => ({
        type: r.RuleID || 'unknown',
        line: r.StartLine || 0,
        match: (r.Secret || r.Match || '').substring(0, 80),
        severity:
          r.RuleID && /token|key|secret|password|credential/i.test(r.RuleID) ? 'high' : 'medium',
        source: 'gitleaks',
        file: r.File || '',
      }));
    } catch {
      return heuristicScan(content);
    }
  } catch (error) {
    if (error.stderr && /no leaks found/i.test(error.stderr)) return [];
    return heuristicScan(content);
  }
}

/**
 * Scan a directory for secrets.
 * @param {string} dirPath
 * @returns {Promise<Array>}
 */
async function scanDirectory(dirPath) {
  if (!isAvailable()) {
    const findings = [];
    const walk = (dir) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (/node_modules|\.git|dist|build|coverage/.test(entry.name)) continue;
          walk(full);
        } else if (entry.isFile()) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            const results = heuristicScan(content);
            findings.push(...results.map((r) => ({ ...r, file: full })));
          } catch {
            // skip binary/unreadable
          }
        }
      }
    };
    walk(dirPath);
    return findings;
  }
  try {
    const { stdout } = await execFileAsync(
      getBinaryPath(),
      [
        'detect',
        '--source',
        dirPath,
        '--no-banner',
        '--report-format',
        'json',
        '--log-level',
        'error',
      ],
      { timeout: 60000 },
    );
    const results = JSON.parse(stdout || '[]');
    return results.map((r) => ({
      type: r.RuleID || 'unknown',
      line: r.StartLine || 0,
      match: (r.Secret || r.Match || '').substring(0, 80),
      severity:
        r.RuleID && /token|key|secret|password|credential/i.test(r.RuleID) ? 'high' : 'medium',
      source: 'gitleaks',
      file: r.File || '',
    }));
  } catch (error) {
    if (error.stderr && /no leaks found/i.test(error.stderr)) return [];
    return [];
  }
}

/**
 * Quick check: does content contain any secrets?
 * @param {string} content
 * @returns {Promise<{safe: boolean, findings: Array}>}
 */
async function isSafe(content) {
  const findings = await scanContent(content);
  return { safe: findings.length === 0, findings };
}

module.exports = {
  isAvailable,
  getBinaryPath,
  scanContent,
  scanDirectory,
  isSafe,
  heuristicScan,
};
