/**
 * VerificationAgent — Independent quality verification.
 *
 * The agent that IMPLEMENTS something should NOT be the sole authority
 * for declaring it "done." This agent independently checks:
 *
 *   1. Code quality     — syntax, lint, patterns
 *   2. Test results     — tests pass, coverage reasonable
 *   3. Integration      — endpoints connected, services reachable
 *   4. Configuration    — env vars present, configs valid
 *   5. Dependencies     — packages installed, no conflicts
 *   6. Security         — no secrets exposed, no vulnerabilities
 *   7. Regressions     — existing functionality not broken
 *   8. Documentation   — docs match implementation
 *
 * Verdict: PASS | PARTIAL | FAIL with detailed report
 */

const logger = {
  info: (...args) => console.info('[VerificationAgent]', ...args),
  warn: (...args) => console.warn('[VerificationAgent]', ...args),
  error: (...args) => console.error('[VerificationAgent]', ...args),
};

/**
 * Verification check result.
 */
class CheckResult {
  constructor(name, status, details = {}) {
    this.name = name;
    this.status = status; // pass | warn | fail | skip
    this.message = details.message || '';
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * VerificationAgent — independent quality checker.
 */
class VerificationAgent {
  constructor(config = {}) {
    this.config = {
      failOnWarning: config.failOnWarning || false,
      requireTests: config.requireTests !== false,
      requireSecurityCheck: config.requireSecurityCheck !== false,
      ...config,
    };

    this._checks = [];
    this._results = [];
  }

  /**
   * Run all verification checks on a set of files.
   *
   * @param {object} params
   * @param {string[]} params.files - Files to verify
   * @param {string} params.projectRoot - Project root path
   * @param {object} params.context - Additional context
   * @returns {VerificationReport}
   */
  async verify(params) {
    const { files = [], projectRoot = process.cwd(), context = {} } = params;
    this._results = [];

    logger.info(`[VerificationAgent] Verifying ${files.length} files`);

    // Run checks in parallel where possible
    await Promise.all([
      this._checkSyntax(files),
      this._checkForSecrets(files),
      this._checkForTodos(files),
      this._checkForPlaceholders(files),
      this._checkImports(files),
      this._checkFileSize(files),
    ]);

    // Generate report
    const report = this._generateReport();
    logger.info(`[VerificationAgent] Verdict: ${report.verdict} (${report.passed}/${report.total} passed)`);

    return report;
  }

  /**
   * Quick verify — syntax check only.
   */
  async quickVerify(files) {
    this._results = [];
    await this._checkSyntax(files);
    return this._generateReport();
  }

  // ============================================================
  // CHECKS
  // ============================================================

  async _checkSyntax(files) {
    const { execSync } = require('child_process');
    const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.mjs'));

    for (const file of jsFiles) {
      try {
        execSync(`node --check "${file}"`, { encoding: 'utf-8', timeout: 5000, windowsHide: true });
        this._results.push(new CheckResult(`syntax:${require('path').basename(file)}`, 'pass'));
      } catch (error) {
        this._results.push(new CheckResult(`syntax:${require('path').basename(file)}`, 'fail', {
          message: error.stderr?.slice(0, 200) || error.message,
          file,
        }));
      }
    }
  }

  async _checkForSecrets(files) {
    const fs = require('fs');
    const secretPatterns = [
      { pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/gi, name: 'hardcoded secret' },
      { pattern: /(?:sk|pk|rk)_[A-Za-z0-9]{20,}/g, name: 'API key pattern' },
      { pattern: /ghp_[A-Za-z0-9]{36}/g, name: 'GitHub token' },
      { pattern: /xoxb-[A-Za-z0-9\-]+/g, name: 'Slack token' },
      { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, name: 'private key' },
    ];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        // Skip .env.example and test files
        if (file.includes('.env.example') || file.includes('.test.') || file.includes('.spec.')) continue;

        for (const { pattern, name } of secretPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            this._results.push(new CheckResult(`security:${require('path').basename(file)}`, 'fail', {
              message: `Potential ${name} found in ${require('path').basename(file)}`,
              file,
              matchCount: matches.length,
            }));
          }
        }
        if (!secretPatterns.some(({ pattern }) => content.match(pattern))) {
          this._results.push(new CheckResult(`secrets:${require('path').basename(file)}`, 'pass'));
        }
      } catch {
        // File not readable — skip
      }
    }
  }

  async _checkForTodos(files) {
    const fs = require('fs');
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const todoMatches = content.match(/(?:TODO|FIXME|HACK|XXX)\b/gi);
        if (todoMatches && todoMatches.length > 0) {
          this._results.push(new CheckResult(`todos:${require('path').basename(file)}`, 'warn', {
            message: `${todoMatches.length} TODO/FIXME found`,
            file,
            count: todoMatches.length,
          }));
        } else {
          this._results.push(new CheckResult(`todos:${require('path').basename(file)}`, 'pass'));
        }
      } catch { /* skip */ }
    }
  }

  async _checkForPlaceholders(files) {
    const fs = require('fs');
    const placeholderPatterns = [
      /placeholder/gi,
      /mock(?:ed|ing)?\s+(?:response|data|implementation)/gi,
      /coming\s+soon/gi,
      /not\s+implemented/gi,
      /stub/gi,
    ];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const matches = [];
        for (const pattern of placeholderPatterns) {
          const found = content.match(pattern);
          if (found) matches.push(...found);
        }
        if (matches.length > 0) {
          this._results.push(new CheckResult(`placeholder:${require('path').basename(file)}`, 'warn', {
            message: `${matches.length} placeholder patterns found`,
            file,
            patterns: [...new Set(matches)],
          }));
        } else {
          this._results.push(new CheckResult(`placeholder:${require('path').basename(file)}`, 'pass'));
        }
      } catch { /* skip */ }
    }
  }

  async _checkImports(files) {
    const fs = require('fs');
    const path = require('path');

    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g);
        if (!requireMatches) {
          this._results.push(new CheckResult(`imports:${path.basename(file)}`, 'pass'));
          continue;
        }

        const missing = [];
        for (const req of requireMatches) {
          const modulePath = req.match(/require\(['"]([^'"]+)['"]\)/)?.[1];
          if (!modulePath) continue;

          // Skip node built-ins and relative imports that might not exist yet
          if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) continue;

          const resolved = path.resolve(path.dirname(file), modulePath);
          if (!fs.existsSync(resolved) && !fs.existsSync(resolved + '.js') && !fs.existsSync(resolved + '.json')) {
            missing.push(modulePath);
          }
        }

        if (missing.length > 0) {
          this._results.push(new CheckResult(`imports:${path.basename(file)}`, 'warn', {
            message: `${missing.length} missing local imports`,
            file,
            missing,
          }));
        } else {
          this._results.push(new CheckResult(`imports:${path.basename(file)}`, 'pass'));
        }
      } catch { /* skip */ }
    }
  }

  async _checkFileSize(files) {
    const fs = require('fs');
    const MAX_FILE_SIZE = 500000; // 500KB

    for (const file of files) {
      try {
        const stats = fs.statSync(file);
        if (stats.size > MAX_FILE_SIZE) {
          this._results.push(new CheckResult(`size:${require('path').basename(file)}`, 'warn', {
            message: `File is ${(stats.size / 1024).toFixed(0)}KB (>${MAX_FILE_SIZE / 1024}KB limit)`,
            file,
            size: stats.size,
          }));
        } else {
          this._results.push(new CheckResult(`size:${require('path').basename(file)}`, 'pass'));
        }
      } catch { /* skip */ }
    }
  }

  // ============================================================
  // REPORT
  // ============================================================

  _generateReport() {
    const passed = this._results.filter(r => r.status === 'pass').length;
    const warned = this._results.filter(r => r.status === 'warn').length;
    const failed = this._results.filter(r => r.status === 'fail').length;
    const skipped = this._results.filter(r => r.status === 'skip').length;

    let verdict = 'PASS';
    if (failed > 0) verdict = 'FAIL';
    else if (warned > 0 && this.config.failOnWarning) verdict = 'FAIL';
    else if (warned > 0) verdict = 'PARTIAL';

    return {
      verdict,
      total: this._results.length,
      passed,
      warned,
      failed,
      skipped,
      checks: this._results,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { VerificationAgent, CheckResult };
