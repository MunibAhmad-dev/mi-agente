/**
 * ContentSanitizer — Sanitizes social content for security
 * =========================================================
 * Prevents XSS, prompt injection, and malicious content injection.
 */

const { createLogger } = require('../logger');

const logger = createLogger('ContentSanitizer');

// Dangerous patterns that could be prompt injection
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(a|an|the)/i,
  /system\s*:\s*/i,
  /assistant\s*:\s*/i,
  /Human\s*:\s*/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /\{\{system\}\}/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /pretend\s+(you|that|to)/i,
  /act\s+as\s+(if|a|an)/i,
];

// HTML/script injection patterns
const XSS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
  /<object\b[^>]*>[\s\S]*?<\/object>/gi,
  /<embed\b[^>]*>/gi,
  /data\s*:\s*text\/html/gi,
];

// Sensitive data patterns
const SENSITIVE_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Emails
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b\d{16}\b/g, // Credit card numbers
  /\b(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*\S+/gi, // API keys
];

class ContentSanitizer {
  /**
   * Sanitize text content from social sources.
   * @param {string} text
   * @param {object} options
   * @returns {object} { sanitized, threats, originalLength }
   */
  sanitize(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return { sanitized: '', threats: [], originalLength: 0 };
    }

    const originalLength = text.length;
    let sanitized = text;
    const threats = [];

    // 1. Strip HTML tags
    sanitized = this._stripHtml(sanitized);

    // 2. Detect prompt injection
    const injections = this._detectInjection(sanitized);
    if (injections.length > 0) {
      threats.push(...injections);
      sanitized = this._neutralizeInjection(sanitized);
    }

    // 3. Detect XSS
    const xss = this._detectXss(text); // Check original before stripping
    if (xss.length > 0) {
      threats.push(...xss);
    }

    // 4. Mask sensitive data
    if (options.maskSensitive !== false) {
      sanitized = this._maskSensitive(sanitized);
    }

    // 5. Truncate if needed
    const maxLen = options.maxLength || 10000;
    if (sanitized.length > maxLen) {
      sanitized = sanitized.slice(0, maxLen) + '...';
    }

    // 6. Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    if (threats.length > 0) {
      logger.warn('Content threats detected', { threats: threats.length, types: threats.map((t) => t.type) });
    }

    return { sanitized, threats, originalLength };
  }

  /**
   * Check if text is safe (no threats).
   */
  isSafe(text) {
    const { threats } = this.sanitize(text);
    return threats.length === 0;
  }

  /**
   * Sanitize a batch of content items.
   */
  sanitizeBatch(items) {
    return items.map((item) => {
      if (typeof item === 'string') return this.sanitize(item);
      return {
        title: item.title ? this.sanitize(item.title) : null,
        body: item.body ? this.sanitize(item.body) : null,
      };
    });
  }

  // ─── INTERNAL ────────────────────────────────────────────────

  _stripHtml(text) {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  }

  _detectInjection(text) {
    const threats = [];
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        threats.push({
          type: 'prompt_injection',
          severity: 'high',
          pattern: pattern.source,
          message: 'Potential prompt injection detected',
        });
      }
    }
    return threats;
  }

  _detectXss(text) {
    const threats = [];
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(text)) {
        threats.push({
          type: 'xss',
          severity: 'high',
          pattern: pattern.source,
          message: 'Potential XSS injection detected',
        });
      }
    }
    return threats;
  }

  _neutralizeInjection(text) {
    // Replace suspicious patterns with [NEUTRALIZED]
    let neutralized = text;
    for (const pattern of INJECTION_PATTERNS) {
      neutralized = neutralized.replace(pattern, '[NEUTRALIZED]');
    }
    return neutralized;
  }

  _maskSensitive(text) {
    let masked = text;
    for (const pattern of SENSITIVE_PATTERNS) {
      masked = masked.replace(pattern, '[REDACTED]');
    }
    return masked;
  }
}

module.exports = ContentSanitizer;
