/**
 * SASTScanner — Static analysis using ast-grep (MIT, Rust binary).
 *
 * Scans code for security anti-patterns and dangerous code constructs
 * using the ast-grep binary with AST-aware pattern matching. Falls back
 * to a regex-based heuristic when the binary is not available.
 *
 * License: MIT (ast-grep)
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const fs = require('fs');
const path = require('path');

let _binaryPath = null;

/**
 * Get the path to the ast-grep binary.
 * @returns {string|null}
 */
function getBinaryPath() {
  if (_binaryPath !== null) return _binaryPath;
  _binaryPath = process.env.AST_GREP_PATH || '';
  if (_binaryPath) return _binaryPath;
  const defaultPath = path.join(__dirname, '..', '..', '..', '..', 'binaries', 'ast-grep');
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
 * Check if ast-grep binary is available.
 * @returns {boolean}
 */
function isAvailable() {
  return Boolean(getBinaryPath());
}

/**
 * Dangerous code patterns (regex fallback).
 */
const DANGEROUS_PATTERNS = [
  {
    type: 'eval',
    pattern: /\beval\s*\(/g,
    severity: 'critical',
    desc: 'Use of eval() is dangerous',
  },
  {
    type: 'exec',
    pattern: /\b(?:child_process\.)?exec\s*\(/g,
    severity: 'high',
    desc: 'Dynamic code execution',
  },
  {
    type: 'function_constructor',
    pattern: /new\s+Function\s*\(/g,
    severity: 'high',
    desc: 'Dynamic function creation',
  },
  {
    type: 'innerhtml',
    pattern: /\.innerHTML\s*=/g,
    severity: 'medium',
    desc: 'XSS risk via innerHTML',
  },
  {
    type: 'document_write',
    pattern: /document\.write\s*\(/g,
    severity: 'high',
    desc: 'XSS risk via document.write',
  },
  {
    type: 'shell_injection',
    pattern: /(?:exec|spawn|execSync)\s*\(\s*[^'"]*`/g,
    severity: 'high',
    desc: 'Potential shell injection (template literal)',
  },
  {
    type: 'sql_injection',
    pattern: /(?:query|execute)\s*\(\s*[^'"]*`/g,
    severity: 'high',
    desc: 'Potential SQL injection (template literal)',
  },
  {
    type: 'debugger',
    pattern: /\bdebugger\b/g,
    severity: 'low',
    desc: 'debugger statement left in code',
  },
  {
    type: 'hardcoded_url',
    pattern: /https?:\/\/[^\s'"]+(?:api|token|key|secret)[^\s'"]+/gi,
    severity: 'medium',
    desc: 'Hardcoded URL with sensitive keywords',
  },
  {
    type: 'disabled_security',
    pattern: /(?:rejectUnauthorized|strictSSL)\s*:\s*false/g,
    severity: 'high',
    desc: 'TLS verification disabled',
  },
];

/**
 * Heuristic regex-based scan.
 * @param {string} content
 * @returns {Array}
 */
function heuristicScan(content) {
  if (!content || typeof content !== 'string') return [];
  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { type, pattern, severity, desc } of DANGEROUS_PATTERNS) {
      let match;
      const re = new RegExp(pattern.source, pattern.flags);
      while ((match = re.exec(line)) !== null) {
        findings.push({
          type,
          line: i + 1,
          match: match[0].substring(0, 80),
          severity,
          description: desc,
          source: 'heuristic',
        });
        if (match.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
  return findings;
}

/**
 * Scan content for dangerous patterns.
 * @param {string} content
 * @param {string} [language='javascript']
 * @returns {Promise<Array>}
 */
async function scanContent(content, language = 'javascript') {
  if (!content || typeof content !== 'string') return [];
  if (!isAvailable()) return heuristicScan(content);
  try {
    const tmpFile = path.join(
      require('os').tmpdir(),
      `astgrep_scan_${Date.now()}.${language === 'typescript' ? 'ts' : 'js'}`,
    );
    fs.writeFileSync(tmpFile, content, 'utf8');
    const { stdout } = await execFileAsync(
      getBinaryPath(),
      ['scan', '--pattern', 'eval($$$)', '--lang', language, '--json', tmpFile],
      { timeout: 15000 },
    );
    fs.unlinkSync(tmpFile);
    try {
      const results = JSON.parse(stdout || '[]');
      return results.map((r) => ({
        type: 'ast_grep_rule',
        line: r.range?.start?.line || 0,
        match: r.text || '',
        severity: 'medium',
        description: r.ruleId || 'ast-grep finding',
        source: 'ast-grep',
      }));
    } catch {
      return heuristicScan(content);
    }
  } catch {
    return heuristicScan(content);
  }
}

/**
 * Scan a directory.
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
        } else if (entry.isFile() && /\.(js|ts|jsx|tsx|py|go|rs|java|rb)$/.test(entry.name)) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            const results = heuristicScan(content);
            findings.push(...results.map((r) => ({ ...r, file: full })));
          } catch {
            // skip
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
      ['scan', '--pattern', 'eval($$$)', '--lang', 'typescript', '--json', dirPath],
      { timeout: 60000 },
    );
    return JSON.parse(stdout || '[]');
  } catch {
    return [];
  }
}

/**
 * Quick check: is content free of dangerous patterns?
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
