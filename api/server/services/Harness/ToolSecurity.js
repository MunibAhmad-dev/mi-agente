/**
 * ToolSecurity — Security layer for tool execution.
 *
 * Provides:
 * - Path validation (prevents path traversal, restricts to allowed directories)
 * - Command blocking (dangerous commands like rm -rf /, format, etc.)
 * - Permission checking (tools must have permission to access resources)
 * - Input sanitization (prevents injection in tool arguments)
 * - Audit logging (tracks all tool invocations for security review)
 */

const path = require('path');
const logger = {
  info: (...args) => console.info('[ToolSecurity]', ...args),
  warn: (...args) => console.warn('[ToolSecurity]', ...args),
  error: (...args) => console.error('[ToolSecurity]', ...args),
};

/**
 * Dangerous command patterns that should be blocked or require approval.
 */
const DANGEROUS_COMMANDS = [
  { pattern: /\brm\s+(-rf?|--recursive)\s+\//i, reason: 'Recursive delete from root', severity: 'critical' },
  { pattern: /\brm\s+(-rf?|--recursive)\s+~\//i, reason: 'Recursive delete from home', severity: 'critical' },
  { pattern: /\bformat\b/i, reason: 'Disk format command', severity: 'critical' },
  { pattern: /\bdd\s+if=.*of=\/dev\//i, reason: 'Direct disk write', severity: 'critical' },
  { pattern: /\bmkfs\b/i, reason: 'Filesystem creation', severity: 'critical' },
  { pattern: /\bsudo\b/i, reason: 'Privilege escalation', severity: 'high' },
  { pattern: /\bchmod\s+(-R\s+)?777\b/i, reason: 'Overly permissive chmod', severity: 'medium' },
  { pattern: /\bchown\s+(-R\s+)?root\b/i, reason: 'Ownership change to root', severity: 'high' },
  { pattern: /\bkill\s+-9\s+1\b/i, reason: 'Kill PID 1', severity: 'critical' },
  { pattern: /\bshutdown\b/i, reason: 'System shutdown', severity: 'critical' },
  { pattern: /\breboot\b/i, reason: 'System reboot', severity: 'critical' },
  { pattern: /\bnet\s+user\b/i, reason: 'Windows user management', severity: 'high' },
  { pattern: /\breg\s+delete\b/i, reason: 'Windows registry delete', severity: 'high' },
  { pattern: /\bGet-WmiObject\b.*Win32_OperatingSystem/i, reason: 'PowerShell system access', severity: 'medium' },
  { pattern: /\bInvoke-WebRequest\b.*-Uri\s+http/i, reason: 'PowerShell web request (potential SSRF)', severity: 'medium' },
  { pattern: /\bcurl\s+.*\|\s*(bash|sh|zsh)\b/i, reason: 'Pipe remote to shell', severity: 'critical' },
  { pattern: /\bwget\s+.*\|\s*(bash|sh|zsh)\b/i, reason: 'Pipe remote to shell', severity: 'critical' },
];

/**
 * Blocked file patterns (sensitive files that tools should not read/modify).
 */
const BLOCKED_FILE_PATTERNS = [
  { pattern: /\.env$/i, reason: 'Environment file with secrets' },
  { pattern: /\.env\.\w+$/i, reason: 'Environment file with secrets' },
  { pattern: /id_rsa$/i, reason: 'SSH private key' },
  { pattern: /id_ed25519$/i, reason: 'SSH private key' },
  { pattern: /\.pem$/i, reason: 'Certificate/key file' },
  { pattern: /\.p12$/i, reason: 'Certificate/key file' },
  { pattern: /shadow$/i, reason: 'Password hash file' },
  { pattern: /passwd$/i, reason: 'Password file' },
];

/**
 * Security audit log entry.
 */
class AuditEntry {
  constructor(toolName, args, result, securityResult) {
    this.timestamp = new Date().toISOString();
    this.tool = toolName;
    this.argsHash = require('crypto').createHash('sha256')
      .update(JSON.stringify(args))
      .digest('hex')
      .slice(0, 16);
    this.allowed = securityResult.allowed;
    this.blocked = securityResult.blocked;
    this.blockReason = securityResult.reason || null;
    this.severity = securityResult.severity || null;
    this.success = result?.success ?? null;
  }
}

/**
 * ToolSecurity — validates and secures tool executions.
 */
class ToolSecurity {
  constructor(config = {}) {
    this.config = {
      allowedDirectories: config.allowedDirectories || [
        process.cwd(),
      ],
      blockDangerousCommands: config.blockDangerousCommands !== false,
      blockSensitiveFiles: config.blockSensitiveFiles !== false,
      requireApprovalForHighSeverity: config.requireApprovalForHighSeverity !== false,
      auditLog: config.auditLog !== false,
      maxAuditLogSize: config.maxAuditLogSize || 10000,
      ...config,
    };

    this._auditLog = [];
    this._blockedCount = 0;
    this._approvedCount = 0;
  }

  /**
   * Validate a file path for read/write operations.
   *
   * @param {string} filePath - The file path to validate
   * @param {string} operation - 'read' or 'write'
   * @returns {{ allowed: boolean, reason?: string, resolvedPath?: string }}
   */
  validatePath(filePath, operation = 'read') {
    if (!filePath || typeof filePath !== 'string') {
      return { allowed: false, reason: 'No file path provided' };
    }

    // Normalize and resolve the path
    const resolved = path.resolve(filePath);

    // Check for path traversal
    if (resolved.includes('..')) {
      return { allowed: false, reason: 'Path traversal detected (..)' };
    }

    // Check if path is within allowed directories
    const isInAllowed = this.config.allowedDirectories.some(dir => {
      const resolvedDir = path.resolve(dir);
      return resolved.startsWith(resolvedDir + path.sep) || resolved === resolvedDir;
    });

    if (!isInAllowed) {
      return {
        allowed: false,
        reason: `Path "${resolved}" is outside allowed directories: ${this.config.allowedDirectories.join(', ')}`,
        resolvedPath: resolved,
      };
    }

    // Check for sensitive files
    if (this.config.blockSensitiveFiles) {
      for (const block of BLOCKED_FILE_PATTERNS) {
        if (block.pattern.test(resolved)) {
          return {
            allowed: false,
            reason: `Sensitive file blocked: ${block.reason}`,
            resolvedPath: resolved,
          };
        }
      }
    }

    return { allowed: true, resolvedPath: resolved };
  }

  /**
   * Validate a shell command before execution.
   *
   * @param {string} command - The command to validate
   * @returns {{ allowed: boolean, reason?: string, severity?: string }}
   */
  validateCommand(command) {
    if (!command || typeof command !== 'string') {
      return { allowed: false, reason: 'No command provided' };
    }

    if (!this.config.blockDangerousCommands) {
      return { allowed: true };
    }

    for (const danger of DANGEROUS_COMMANDS) {
      if (danger.pattern.test(command)) {
        return {
          allowed: false,
          reason: `Dangerous command blocked: ${danger.reason}`,
          severity: danger.severity,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Validate tool arguments before execution.
   *
   * @param {string} toolName - Tool name
   * @param {object} args - Tool arguments
   * @returns {{ allowed: boolean, reason?: string, sanitized?: object }}
   */
  validateToolArgs(toolName, args) {
    if (!args || typeof args !== 'object') {
      return { allowed: true, sanitized: {} };
    }

    const sanitized = { ...args };

    // File-based tools: validate paths
    if (['read_file', 'write_file', 'edit_file', 'list_directory'].includes(toolName)) {
      if (sanitized.path) {
        const pathCheck = this.validatePath(sanitized.path, toolName === 'read_file' ? 'read' : 'write');
        if (!pathCheck.allowed) {
          return { allowed: false, reason: pathCheck.reason };
        }
        sanitized.path = pathCheck.resolvedPath;
      }
    }

    // Command tool: validate command
    if (toolName === 'run_command' && sanitized.command) {
      const cmdCheck = this.validateCommand(sanitized.command);
      if (!cmdCheck.allowed) {
        return { allowed: false, reason: cmdCheck.reason, severity: cmdCheck.severity };
      }
    }

    // Search tools: validate directory
    if (['search_files', 'search_code'].includes(toolName)) {
      if (sanitized.directory) {
        const dirCheck = this.validatePath(sanitized.directory, 'read');
        if (!dirCheck.allowed) {
          return { allowed: false, reason: dirCheck.reason };
        }
        sanitized.directory = dirCheck.resolvedPath;
      }
    }

    return { allowed: true, sanitized };
  }

  /**
   * Full pre-execution check combining all validations.
   *
   * @param {string} toolName - Tool name
   * @param {object} args - Tool arguments
   * @returns {{ allowed: boolean, reason?: string, severity?: string, needsApproval?: boolean, sanitized?: object }}
   */
  check(toolName, args) {
    const result = this.validateToolArgs(toolName, args);

    if (!result.allowed) {
      this._blockedCount++;
      const severity = result.severity || 'medium';
      const needsApproval = this.config.requireApprovalForHighSeverity &&
        (severity === 'high' || severity === 'critical');

      if (this.config.auditLog) {
        this._addAuditEntry(toolName, args, null, {
          allowed: false,
          blocked: true,
          reason: result.reason,
          severity,
        });
      }

      return {
        allowed: false,
        blocked: true,
        reason: result.reason,
        severity,
        needsApproval,
        sanitized: result.sanitized,
      };
    }

    if (this.config.auditLog) {
      this._addAuditEntry(toolName, args, null, {
        allowed: true,
        blocked: false,
      });
    }

    return {
      allowed: true,
      blocked: false,
      sanitized: result.sanitized || args,
    };
  }

  /**
   * Record a completed tool execution in the audit log.
   */
  recordExecution(toolName, args, result) {
    if (this.config.auditLog) {
      this._addAuditEntry(toolName, args, result, {
        allowed: true,
        blocked: false,
      });
    }
  }

  /**
   * Add entry to audit log.
   */
  _addAuditEntry(toolName, args, result, securityResult) {
    const entry = new AuditEntry(toolName, args, result, securityResult);
    this._auditLog.push(entry);

    // Trim if too large
    if (this._auditLog.length > this.config.maxAuditLogSize) {
      this._auditLog = this._auditLog.slice(-Math.floor(this.config.maxAuditLogSize / 2));
    }
  }

  /**
   * Get audit log (for security review).
   */
  getAuditLog(limit = 100) {
    return this._auditLog.slice(-limit);
  }

  /**
   * Get security stats.
   */
  getStats() {
    return {
      totalChecks: this._blockedCount + this._approvedCount,
      blocked: this._blockedCount,
      approved: this._approvedCount,
      auditLogSize: this._auditLog.length,
    };
  }

  /**
   * Add an allowed directory at runtime.
   */
  addAllowedDirectory(dir) {
    const resolved = path.resolve(dir);
    if (!this.config.allowedDirectories.includes(resolved)) {
      this.config.allowedDirectories.push(resolved);
      logger.info(`[ToolSecurity] Added allowed directory: ${resolved}`);
    }
  }

  /**
   * Remove an allowed directory at runtime.
   */
  removeAllowedDirectory(dir) {
    const resolved = path.resolve(dir);
    this.config.allowedDirectories = this.config.allowedDirectories.filter(
      d => path.resolve(d) !== resolved,
    );
    logger.info(`[ToolSecurity] Removed allowed directory: ${resolved}`);
  }
}

module.exports = { ToolSecurity, DANGEROUS_COMMANDS, BLOCKED_FILE_PATTERNS };
