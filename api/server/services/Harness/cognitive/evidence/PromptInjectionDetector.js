'use strict';

/**
 * PromptInjectionDetector - Detects prompt injection in documents and inputs.
 *
 * Patterns:
 * - "Ignore previous instructions"
 * - "You are now..."
 * - "System: ..."
 * - Hidden instructions in documents
 * - SQL/code injection in queries
 */
class PromptInjectionDetector {
  constructor(config = {}) {
    this.patterns = [
      // English
      /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)/i,
      /you\s+are\s+now\s+(a|an|the)/i,
      /system\s*:\s*/i,
      /act\s+as\s+if/i,
      /pretend\s+you\s+are/i,
      /disregard\s+(all\s+)?(previous|prior)/i,
      /override\s+(previous|system|all)/i,
      /new\s+instructions?\s*:/i,
      // Spanish
      /ignora\s+(todas\s+las\s+)?(instrucciones|reglas)\s+(anteriores|previas)/i,
      /eres\s+ahora\s+(un|una|el|la)/i,
      /actúa\s+como\s+si/i,
      /pretende\s+que\s+eres/i,
      // Code injection
      /<script>/i,
      /javascript\s*:/i,
      /onerror\s*=/i,
      /onload\s*=/i,
      // SQL injection
      /'\s*or\s+'1'\s*=\s*'1/i,
      /;\s*drop\s+table/i,
      /union\s+select/i,
    ];

    this.detections = [];
  }

  /**
   * Check text for prompt injection.
   */
  detect(text) {
    const findings = [];

    for (let i = 0; i < this.patterns.length; i++) {
      const match = text.match(this.patterns[i]);
      if (match) {
        findings.push({
          pattern: i,
          match: match[0],
          severity: this._getSeverity(i),
          position: text.indexOf(match[0]),
        });
      }
    }

    if (findings.length > 0) {
      this.detections.push({
        text: text.substring(0, 200),
        findings,
        timestamp: Date.now(),
      });
    }

    return {
      safe: findings.length === 0,
      findings,
      recommendation: findings.length > 0 ? 'BLOCK' : 'ALLOW',
    };
  }

  /**
   * Sanitize text by removing injection attempts.
   */
  sanitize(text) {
    let clean = text;
    for (const pattern of this.patterns) {
      clean = clean.replace(pattern, '[BLOCKED]');
    }
    return clean;
  }

  getStats() {
    return {
      patterns: this.patterns.length,
      detections: this.detections.length,
      recentDetections: this.detections.slice(-10),
    };
  }

  _getSeverity(patternIndex) {
    if (patternIndex < 5) return 'high'; // Instruction override
    if (patternIndex < 10) return 'high'; // Spanish instruction override
    if (patternIndex < 14) return 'medium'; // XSS
    return 'high'; // SQL injection
  }
}

module.exports = { PromptInjectionDetector };
