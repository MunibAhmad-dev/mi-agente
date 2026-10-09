/**
 * DataClassifier — Phase I: data classification labels
 *
 * Assigns classification levels to artifacts and memory entries,
 * and enforces routing rules (LOCAL-ONLY never sent to cloud).
 */

'use strict';

const Classification = Object.freeze({
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  PRIVATE: 'PRIVATE',
  SECRET: 'SECRET',
  LOCAL_ONLY: 'LOCAL-ONLY',
});

// Ordered by sensitivity (higher index = more sensitive)
const SENSITIVITY_ORDER = [
  Classification.PUBLIC,
  Classification.INTERNAL,
  Classification.PRIVATE,
  Classification.SECRET,
  Classification.LOCAL_ONLY,
];

// Cloud providers that must never receive LOCAL-ONLY data
const CLOUD_PROVIDERS = new Set([
  'openai', 'anthropic', 'gemini', 'mistral', 'cohere',
  'groq', 'deepseek', 'xai', 'openrouter', 'perplexity',
  'huggingface', 'replicate', 'cloudflare',
]);

// Patterns that bump classification up to SECRET
const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /private[_-]?key/i,
  /jwt/i,
  /bearer/i,
];

// Patterns for LOCAL-ONLY (PII, internal paths, local filesystem)
const LOCAL_ONLY_PATTERNS = [
  /\b[A-Z]:\\/, // Windows drive paths
  /\/home\/\w+/, // Unix home paths
  /\.env\b/i,
  /\bssn\b/i,
  /\bpassport\b/i,
  /\bcpf\b/i, // Brazilian CPF
  /\bcurp\b/i, // Mexican CURP
];

class DataClassifier {
  /**
   * Classify a text artifact or memory value.
   * @param {string|object} content
   * @param {object} [hints] - { provider, source, explicit }
   * @returns {{ level: string, reason: string }}
   */
  classify(content, hints = {}) {
    if (hints.explicit && SENSITIVITY_ORDER.includes(hints.explicit)) {
      return { level: hints.explicit, reason: 'explicit label from caller' };
    }

    const text = typeof content === 'string' ? content : JSON.stringify(content);

    for (const pat of LOCAL_ONLY_PATTERNS) {
      if (pat.test(text)) {
        return { level: Classification.LOCAL_ONLY, reason: `matched local-only pattern: ${pat}` };
      }
    }

    for (const pat of SECRET_PATTERNS) {
      if (pat.test(text)) {
        return { level: Classification.SECRET, reason: `matched secret pattern: ${pat}` };
      }
    }

    if (hints.source === 'project_memory' || hints.source === 'rag') {
      return { level: Classification.PRIVATE, reason: 'internal project memory' };
    }

    if (hints.source === 'user_session') {
      return { level: Classification.INTERNAL, reason: 'user session data' };
    }

    return { level: Classification.PUBLIC, reason: 'no sensitive patterns detected' };
  }

  /**
   * Returns true if content at `level` may be sent to `provider`.
   * LOCAL-ONLY and SECRET never go to cloud providers.
   */
  enforce(level, provider) {
    const normalized = (provider || '').toLowerCase();
    if (
      (level === Classification.LOCAL_ONLY || level === Classification.SECRET) &&
      CLOUD_PROVIDERS.has(normalized)
    ) {
      return {
        allowed: false,
        reason: `${level} data must not be sent to cloud provider "${provider}"`,
      };
    }
    return { allowed: true, reason: 'ok' };
  }

  /**
   * Merge two classifications, returning the more sensitive one.
   */
  merge(levelA, levelB) {
    const ia = SENSITIVITY_ORDER.indexOf(levelA);
    const ib = SENSITIVITY_ORDER.indexOf(levelB);
    return ia >= ib ? levelA : levelB;
  }

  /** Returns the ordered sensitivity list for inspection. */
  get levels() {
    return SENSITIVITY_ORDER;
  }
}

module.exports = { DataClassifier, Classification };
