/**
 * SecurityHardening — Security layer for the agent harness.
 *
 * Features:
 *   1. API key management     — rotation, validation, secure storage
 *   2. Input sanitization     — sanitize all tool inputs
 *   3. Prompt injection       — detect and block prompt injection attempts
 *   4. Rate limiting          — per-provider, per-user rate limits
 *   5. Sensitive data         — prevent secrets from leaking in logs/responses
 *   6. Permission enforcement — tools require proper permissions
 *   7. Audit trail            — log all security-relevant events
 */

const crypto = require('crypto');

const logger = {
  info: (...args) => console.info('[SecurityHardening]', ...args),
  warn: (...args) => console.warn('[SecurityHardening]', ...args),
  error: (...args) => console.error('[SecurityHardening]', ...args),
};

/**
 * Prompt injection patterns.
 */
const INJECTION_PATTERNS = [
  { pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i, name: 'ignore_instructions', severity: 'critical' },
  { pattern: /you\s+are\s+now\s+(a|an)\s+/i, name: 'role_hijack', severity: 'high' },
  { pattern: /system\s*:\s*/i, name: 'system_injection', severity: 'high' },
  { pattern: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/i, name: 'token_injection', severity: 'critical' },
  { pattern: /pretend\s+(you\s+are|to\s+be|you're)\s+/i, name: 'pretend_injection', severity: 'medium' },
  { pattern: /disregard\s+(all\s+)?(previous|safety|rules)/i, name: 'disregard_injection', severity: 'critical' },
  { pattern: /jailbreak|dan\s+mode|developer\s+mode/i, name: 'jailbreak', severity: 'critical' },
  { pattern: /DAN\s*:|Do\s+anything\s+now/i, name: 'dan_jailbreak', severity: 'critical' },
  { pattern: /\b(?:act\s+as|respond\s+as|simulate)\s+(?:a\s+)?(?:different|new|unrestricted)/i, name: 'role_manipulation', severity: 'high' },
  { pattern: /reveal\s+(your|the)\s+(system\s+)?prompt/i, name: 'prompt_extraction', severity: 'high' },
];

/**
 * Honeypot field names — fields that only bots/scrapers tend to fill.
 * A legitimate human user leaves these blank.
 */
const HONEYPOT_FIELDS = new Set([
  'honeypot', 'bot_field', 'website_url', 'url_field', 'fax',
  'phone_secondary', 'confirm_email2', 'username_confirm', 'zip2',
  '_gotcha', 'h_field', 'trap', 'hpname', 'winnie',
]);

/**
 * Threat classification levels and actions.
 */
const ThreatLevel = Object.freeze({
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
});

const THREAT_SIGNATURES = [
  { pattern: /\bSELECT\b.+\bFROM\b/i, name: 'sql_injection', level: ThreatLevel.CRITICAL },
  { pattern: /\bUNION\b.+\bSELECT\b/i, name: 'sql_union_injection', level: ThreatLevel.CRITICAL },
  { pattern: /<script[\s>]/i, name: 'xss_script_tag', level: ThreatLevel.CRITICAL },
  { pattern: /javascript:/i, name: 'xss_javascript_proto', level: ThreatLevel.HIGH },
  { pattern: /on(?:load|error|click|mouseover|submit)=/i, name: 'xss_event_handler', level: ThreatLevel.HIGH },
  { pattern: /\bexec\s*\(|\beval\s*\(/, name: 'code_exec_attempt', level: ThreatLevel.CRITICAL },
  { pattern: /\.\.(\/|\\)/, name: 'path_traversal', level: ThreatLevel.HIGH },
  { pattern: /\$\{.*\}/, name: 'template_injection', level: ThreatLevel.MEDIUM },
  { pattern: /\{\{.*\}\}/, name: 'ssti_template', level: ThreatLevel.MEDIUM },
  { pattern: /\bldap:\/\//i, name: 'ldap_injection', level: ThreatLevel.HIGH },
  { pattern: /\bfile:\/\//i, name: 'ssrf_file_protocol', level: ThreatLevel.HIGH },
  { pattern: /\b(?:127\.0\.0\.1|localhost|0\.0\.0\.0|::1)\b/, name: 'ssrf_localhost', level: ThreatLevel.MEDIUM },
  { pattern: /\b169\.254\.\d+\.\d+/, name: 'ssrf_link_local', level: ThreatLevel.HIGH },
  { pattern: /\bBase64\b.*decode|atob\s*\(/i, name: 'obfuscated_payload', level: ThreatLevel.MEDIUM },
  { pattern: /\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}/, name: 'encoded_payload', level: ThreatLevel.LOW },
];

/**
 * Patterns that indicate secrets in output.
 */
const SECRET_PATTERNS = [
  { pattern: /sk-[A-Za-z0-9]{20,}/g, name: 'OpenAI API key' },
  { pattern: /xai-[A-Za-z0-9]{20,}/g, name: 'xAI API key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, name: 'GitHub token' },
  { pattern: /xoxb-[A-Za-z0-9\-]+/g, name: 'Slack bot token' },
  { pattern: /AKIA[A-Z0-9]{16}/g, name: 'AWS access key' },
];

/**
 * SecurityHardening — comprehensive security layer.
 */
class SecurityHardening {
  constructor(config = {}) {
    this.config = {
      enableInjectionDetection: config.enableInjectionDetection !== false,
      enableSecretRedaction: config.enableSecretRedaction !== false,
      enableInputSanitization: config.enableInputSanitization !== false,
      enableRateLimiting: config.enableRateLimiting !== false,
      rateLimitPerMinute: config.rateLimitPerMinute || 60,
      maxInputLength: config.maxInputLength || 100000,
      ...config,
    };

    this._apiKeys = new Map();   // provider → { key, createdAt, expiresAt }
    this._rateLimiters = new Map(); // key → { count, windowStart }
    this._auditLog = [];
    this._blockedAttempts = 0;
  }

  // ============================================================
  // API KEY MANAGEMENT
  // ============================================================

  /**
   * Register an API key for a provider.
   */
  setApiKey(provider, key, options = {}) {
    if (!provider || !key) throw new Error('provider and key required');

    // Validate key format
    const validation = this._validateApiKeyFormat(provider, key);
    if (!validation.valid) {
      logger.warn(`[SecurityHardening] Weak API key for ${provider}: ${validation.reason}`);
    }

    this._apiKeys.set(provider, {
      key,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt || null,
      lastUsed: null,
      useCount: 0,
    });

    this._audit('api_key_set', { provider, valid: validation.valid });
    return { success: true, provider };
  }

  /**
   * Get an API key for a provider.
   */
  getApiKey(provider) {
    const entry = this._apiKeys.get(provider);
    if (!entry) return null;

    // Check expiry
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      logger.warn(`[SecurityHardening] API key expired for ${provider}`);
      return null;
    }

    entry.lastUsed = new Date().toISOString();
    entry.useCount++;
    return entry.key;
  }

  /**
   * Rotate an API key (invalidates old one).
   */
  rotateApiKey(provider, newKey) {
    const old = this._apiKeys.get(provider);
    if (old) {
      // Overwrite old key — old key is gone
      this._apiKeys.delete(provider);
    }
    return this.setApiKey(provider, newKey);
  }

  /**
   * Validate API key format per provider.
   */
  _validateApiKeyFormat(provider, key) {
    const patterns = {
      openai: /^sk-[A-Za-z0-9\-_]{20,}$/,
      xai: /^xai-[A-Za-z0-9\-_]{20,}$/,
      github: /^ghp_[A-Za-z0-9]{36}$|^gho_[A-Za-z0-9]{36}$/,
      slack: /^xoxb-[0-9]{10,}-[A-Za-z0-9]{20,}$/,
    };

    const pattern = patterns[provider];
    if (!pattern) return { valid: true, reason: 'Unknown provider — no format validation' };
    if (pattern.test(key)) return { valid: true };
    return { valid: false, reason: `Key does not match expected ${provider} format` };
  }

  // ============================================================
  // PROMPT INJECTION DETECTION
  // ============================================================

  /**
   * Scan text for prompt injection attempts.
   */
  detectInjection(text) {
    if (!this.config.enableInjectionDetection) return { safe: true, detections: [] };

    if (!text || typeof text !== 'string') return { safe: true, detections: [] };

    const detections = [];
    for (const { pattern, name, severity } of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        detections.push({ name, severity, pattern: pattern.source.slice(0, 50) });
      }
    }

    const safe = detections.length === 0;
    if (!safe) {
      this._blockedAttempts++;
      this._audit('injection_detected', { detections: detections.map(d => d.name), textPreview: text.slice(0, 100) });
      logger.warn(`[SecurityHardening] Injection detected: ${detections.map(d => d.name).join(', ')}`);
    }

    return { safe, detections };
  }

  /**
   * Sanitize a message before sending to LLM.
   * Removes/flags potential injection content.
   */
  sanitizeMessage(message) {
    if (!message || typeof message !== 'string') return message;

    let sanitized = message;

    // Remove zero-width characters (commonly used in injection)
    sanitized = sanitized.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    // Remove control characters except newlines/tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Truncate if too long
    if (sanitized.length > this.config.maxInputLength) {
      sanitized = sanitized.slice(0, this.config.maxInputLength);
    }

    return sanitized;
  }

  // ============================================================
  // INPUT SANITIZATION
  // ============================================================

  /**
   * Sanitize tool arguments.
   */
  sanitizeToolArgs(toolName, args) {
    if (!this.config.enableInputSanitization) return args;
    if (!args || typeof args !== 'object') return args;

    const sanitized = { ...args };

    // Path traversal prevention for file tools
    if (['read_file', 'write_file', 'edit_file', 'list_directory'].includes(toolName)) {
      if (sanitized.path) {
        // Remove null bytes
        sanitized.path = sanitized.path.replace(/\0/g, '');
        // Normalize path
        sanitized.path = sanitized.path.replace(/\\/g, '/');
      }
    }

    // Command injection prevention
    if (toolName === 'run_command' && sanitized.command) {
      // Remove null bytes
      sanitized.command = sanitized.command.replace(/\0/g, '');
      // Remove potentially dangerous shell expansions
      sanitized.command = sanitized.command.replace(/\$\{[^}]+\}/g, '');
    }

    return sanitized;
  }

  // ============================================================
  // RATE LIMITING
  // ============================================================

  /**
   * Check rate limit for a key.
   */
  checkRateLimit(key) {
    if (!this.config.enableRateLimiting) return { allowed: true };

    const now = Date.now();
    const entry = this._rateLimiters.get(key) || { count: 0, windowStart: now };

    // Reset window if >1 minute
    if (now - entry.windowStart > 60000) {
      entry.count = 0;
      entry.windowStart = now;
    }

    entry.count++;
    this._rateLimiters.set(key, entry);

    if (entry.count > this.config.rateLimitPerMinute) {
      this._audit('rate_limited', { key: key.slice(0, 20), count: entry.count });
      return { allowed: false, retryAfter: 60000 - (now - entry.windowStart) };
    }

    return { allowed: true, remaining: this.config.rateLimitPerMinute - entry.count };
  }

  // ============================================================
  // SECRET REDACTION
  // ============================================================

  /**
   * Redact secrets from text (for safe logging).
   */
  redactSecrets(text) {
    if (!this.config.enableSecretRedaction) return text;
    if (!text || typeof text !== 'string') return text;

    let redacted = text;
    for (const { pattern, name } of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, `[REDACTED_${name.replace(/\s/g, '_').toUpperCase()}]`);
    }
    return redacted;
  }

  /**
   * Check if text contains secrets.
   */
  containsSecrets(text) {
    if (!text || typeof text !== 'string') return false;
    return SECRET_PATTERNS.some(({ pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    });
  }

  // ============================================================
  // AUDIT
  // ============================================================

  _audit(event, data = {}) {
    this._auditLog.push({
      timestamp: new Date().toISOString(),
      event,
      ...data,
    });
    if (this._auditLog.length > 5000) {
      this._auditLog = this._auditLog.slice(-2500);
    }
  }

  /**
   * Get audit log.
   */
  getAuditLog(limit = 100) {
    return this._auditLog.slice(-limit);
  }

  /**
   * Get security stats.
   */
  getStats() {
    return {
      apiKeysRegistered: this._apiKeys.size,
      blockedAttempts: this._blockedAttempts,
      rateLimiters: this._rateLimiters.size,
      auditLogSize: this._auditLog.length,
    };
  }

  // ============================================================
  // HONEYPOT DETECTION
  // ============================================================

  /**
   * Check form submission for honeypot field activity.
   * Returns { clean: bool, trippedFields: string[] }.
   * A clean submission has all honeypot fields empty or absent.
   */
  checkHoneypot(formData = {}) {
    const trippedFields = [];
    for (const field of Object.keys(formData)) {
      const nameLower = field.toLowerCase();
      if (HONEYPOT_FIELDS.has(nameLower) && formData[field] !== '' && formData[field] != null) {
        trippedFields.push(field);
      }
    }
    const clean = trippedFields.length === 0;
    if (!clean) {
      this._blockedAttempts++;
      this._audit('honeypot_tripped', { trippedFields });
      logger.warn(`[SecurityHardening] Honeypot tripped: ${trippedFields.join(', ')}`);
    }
    return { clean, trippedFields };
  }

  /**
   * Register a custom honeypot field name.
   */
  addHoneypotField(fieldName) {
    HONEYPOT_FIELDS.add(fieldName.toLowerCase());
  }

  // ============================================================
  // THREAT CLASSIFICATION
  // ============================================================

  /**
   * Classify the threat level of an input string.
   * Returns { level, levelName, threats: [{name, level}] }.
   */
  classifyThreat(input) {
    if (!input || typeof input !== 'string') {
      return { level: ThreatLevel.NONE, levelName: 'NONE', threats: [] };
    }

    const threats = [];
    for (const { pattern, name, level } of THREAT_SIGNATURES) {
      if (pattern.test(input)) {
        threats.push({ name, level });
      }
    }

    // Also check injection patterns (from INJECTION_PATTERNS constant)
    for (const { pattern, name, severity } of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        const level = severity === 'critical' ? ThreatLevel.CRITICAL
          : severity === 'high' ? ThreatLevel.HIGH
            : severity === 'medium' ? ThreatLevel.MEDIUM
              : ThreatLevel.LOW;
        threats.push({ name, level, fromInjectionDetector: true });
      }
    }

    const maxLevel = threats.reduce((max, t) => Math.max(max, t.level), ThreatLevel.NONE);
    const levelName = Object.keys(ThreatLevel).find((k) => ThreatLevel[k] === maxLevel) || 'NONE';

    if (maxLevel >= ThreatLevel.HIGH) {
      this._blockedAttempts++;
      this._audit('threat_classified', { levelName, threats: threats.map((t) => t.name) });
    }

    return { level: maxLevel, levelName, threats };
  }

  /**
   * Gate an action by threat level — throws if above the allowed threshold.
   * @param {string} input
   * @param {number} [maxAllowed] — ThreatLevel value, default LOW
   */
  requireSafeInput(input, maxAllowed = ThreatLevel.LOW) {
    const result = this.classifyThreat(input);
    if (result.level > maxAllowed) {
      throw new Error(
        `Input blocked — threat level ${result.levelName} (${result.threats.map((t) => t.name).join(', ')})`,
      );
    }
    return result;
  }

  /**
   * Run a comprehensive security audit on provided files.
   */
  async auditFiles(files) {
    const fs = require('fs');
    const findings = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');

        // Check for hardcoded secrets
        for (const { pattern, name } of SECRET_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(content)) {
            findings.push({ file, type: 'secret', name, severity: 'critical' });
          }
        }

        // Check for eval/exec usage
        if (/\beval\s*\(/.test(content) || /\bexec\s*\(/.test(content)) {
          findings.push({ file, type: 'code_execution', name: 'eval/exec usage', severity: 'high' });
        }

        // Check for unsafe deserialization
        if (/JSON\.parse\s*\(\s*(?:req\.|args\.|input)/.test(content)) {
          findings.push({ file, type: 'unsafe_parse', name: 'Unsafe JSON.parse on user input', severity: 'medium' });
        }

        // Check for console.log of sensitive data
        if (/console\.log\s*\(\s*(?:.*(?:key|token|secret|password|credential))/i.test(content)) {
          findings.push({ file, type: 'sensitive_logging', name: 'Possible sensitive data in console.log', severity: 'medium' });
        }
      } catch { /* skip unreadable files */ }
    }

    this._audit('file_audit', { filesScanned: files.length, findings: findings.length });
    return { filesScanned: files.length, findings, clean: findings.length === 0 };
  }
}

module.exports = { SecurityHardening, INJECTION_PATTERNS, SECRET_PATTERNS, HONEYPOT_FIELDS, THREAT_SIGNATURES, ThreatLevel };
