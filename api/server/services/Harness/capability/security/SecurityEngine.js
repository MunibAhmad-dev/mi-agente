'use strict';

/**
 * SecurityEngine - Scans capabilities for security threats.
 * Analyzes: code, dependencies, permissions, network access, 
 * filesystem access, subprocess usage, secrets, obfuscation.
 */
class SecurityEngine {
  constructor(config = {}) {
    this.config = config;
    this.stats = { scanned: 0, safe: 0, suspicious: 0, dangerous: 0 };

    // Known dangerous patterns
    this.dangerousPatterns = [
      { pattern: /\beval\s*\(/gi, risk: 'code_execution', severity: 'high' },
      { pattern: /\bexec\s*\(/gi, risk: 'code_execution', severity: 'high' },
      { pattern: /\bspawn\s*\(/gi, risk: 'subprocess', severity: 'medium' },
      { pattern: /\bchild_process\b/gi, risk: 'subprocess', severity: 'medium' },
      { pattern: /\bfetch\s*\(\s*['"]https?:\/\//gi, risk: 'network', severity: 'low' },
      { pattern: /\bhttps?:\/\/[^\s'"]+/gi, risk: 'network', severity: 'low' },
      { pattern: /\bprocess\.env\b/gi, risk: 'env_access', severity: 'medium' },
      { pattern: /\bfs\.(read|write|unlink|rmdir|chmod)\b/gi, risk: 'filesystem', severity: 'medium' },
      { pattern: /\brequire\s*\(\s*['"]child_process/gi, risk: 'subprocess', severity: 'high' },
      { pattern: /\bsudo\b/gi, risk: 'privilege_escalation', severity: 'critical' },
      { pattern: /\bcurl\b.*\|\s*(bash|sh)/gi, risk: 'remote_code', severity: 'critical' },
      { pattern: /\bwget\b.*\|\s*(bash|sh)/gi, risk: 'remote_code', severity: 'critical' },
      { pattern: /\b(atob|btoa|Buffer\.from)\b/gi, risk: 'obfuscation', severity: 'medium' },
      { pattern: /\\x[0-9a-f]{2}/gi, risk: 'obfuscation', severity: 'medium' },
      { pattern: /\b(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]+/gi, risk: 'hardcoded_secrets', severity: 'high' },
    ];

    // Suspicious but not dangerous patterns
    this.suspiciousPatterns = [
      { pattern: /\brequire\s*\(\s*['"]https?\b/gi, risk: 'dynamic_require', severity: 'low' },
      { pattern: /\bnew\s+Function\s*\(/gi, risk: 'dynamic_code', severity: 'medium' },
      { pattern: /\bWebSocket\b/gi, risk: 'websocket', severity: 'low' },
      { pattern: /\bXMLHttpRequest\b/gi, risk: 'network', severity: 'low' },
    ];
  }

  /**
   * Scan a capability for security issues.
   */
  scan(capability, fileContents = {}) {
    this.stats.scanned++;

    const findings = [];
    const permissions = {
      filesystem: false,
      network: false,
      subprocess: false,
      credentials: false,
      envVars: false,
    };

    // Scan all file contents
    for (const [filename, content] of Object.entries(fileContents)) {
      if (!content || typeof content !== 'string') continue;

      // Check dangerous patterns
      for (const { pattern, risk, severity } of this.dangerousPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          findings.push({
            file: filename,
            risk,
            severity,
            count: matches.length,
            examples: matches.slice(0, 3),
          });

          // Update permissions
          if (risk === 'filesystem') permissions.filesystem = true;
          if (risk === 'network') permissions.network = true;
          if (risk === 'subprocess' || risk === 'code_execution') permissions.subprocess = true;
          if (risk === 'hardcoded_secrets' || risk === 'env_access') permissions.credentials = true;
          if (risk === 'env_access') permissions.envVars = true;
        }
      }

      // Check suspicious patterns
      for (const { pattern, risk, severity } of this.suspiciousPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          findings.push({
            file: filename,
            risk,
            severity,
            count: matches.length,
            examples: matches.slice(0, 3),
          });
        }
      }
    }

    // Calculate security score
    const score = this._calculateScore(findings);
    const level = this._getLevel(score);

    const result = {
      level,
      score,
      scanDate: new Date().toISOString(),
      findings,
      permissions,
      risks: [...new Set(findings.map(f => f.risk))],
    };

    if (level === 'safe' || level === 'verified') this.stats.safe++;
    else if (level === 'suspicious') this.stats.suspicious++;
    else this.stats.dangerous++;

    return result;
  }

  _calculateScore(findings) {
    let score = 100;

    for (const f of findings) {
      switch (f.severity) {
        case 'critical': score -= 25; break;
        case 'high': score -= 15; break;
        case 'medium': score -= 8; break;
        case 'low': score -= 3; break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  _getLevel(score) {
    if (score >= 90) return 'safe';
    if (score >= 75) return 'verified';
    if (score >= 50) return 'unknown';
    if (score >= 25) return 'suspicious';
    return 'dangerous';
  }

  /**
   * Scan a manifest/package.json for dependency risks.
   */
  scanDependencies(deps) {
    const risks = [];
    const knownRisky = ['eval', 'exec', 'child_process', 'node-pty', 'electron'];

    for (const [name] of Object.entries(deps || {})) {
      if (knownRisky.some(r => name.toLowerCase().includes(r))) {
        risks.push({ package: name, risk: 'known_risky_dependency' });
      }
    }

    return risks;
  }

  getStats() { return { ...this.stats }; }
}

module.exports = { SecurityEngine };
