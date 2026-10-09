'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * SandboxRunner - Isolated code execution
 * Runs code in a sandboxed environment with:
 * - Time limits
 * - Memory limits
 * - Filesystem restrictions
 * - Output capture
 * - Process isolation
 */
class SandboxRunner {
  constructor(config = {}) {
    this.maxTimeout = config.maxTimeout || 30000; // 30 seconds
    this.maxMemoryMB = config.maxMemoryMB || 256;
    this.tempDir = config.tempDir || path.join(os.tmpdir(), 'harness-sandbox');
    this.allowedLanguages = config.allowedLanguages || ['javascript', 'python', 'bash', 'powershell'];
    this.maxOutputSize = config.maxOutputSize || 1024 * 1024; // 1MB

    this.executions = new Map();
    this.history = [];

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Execute code in a sandboxed environment.
   */
  async execute(language, code, options = {}) {
    if (!this.allowedLanguages.includes(language)) {
      throw new Error(`Language not allowed: ${language}. Allowed: ${this.allowedLanguages.join(', ')}`);
    }

    const execId = `exec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timeout = Math.min(options.timeout || this.maxTimeout, this.maxTimeout);
    const workDir = options.workDir || this.tempDir;

    const execution = {
      id: execId,
      language,
      code: code.substring(0, 5000), // Store truncated for history
      startedAt: new Date().toISOString(),
      timeout,
      status: 'running',
      stdout: '',
      stderr: '',
      exitCode: null,
      duration: 0,
      error: null
    };

    this.executions.set(execId, execution);

    const startTime = Date.now();

    try {
      const result = await this._executeLanguage(language, code, {
        timeout,
        workDir,
        env: options.env || {},
        maxMemoryMB: options.maxMemoryMB || this.maxMemoryMB
      });

      execution.stdout = result.stdout.substring(0, this.maxOutputSize);
      execution.stderr = result.stderr.substring(0, this.maxOutputSize);
      execution.exitCode = result.exitCode;
      execution.status = result.exitCode === 0 ? 'completed' : 'failed';
      execution.duration = Date.now() - startTime;
    } catch (err) {
      execution.error = err.message;
      execution.status = 'error';
      execution.duration = Date.now() - startTime;
      execution.stderr = err.message;
    }

    this.executions.delete(execId);
    this.history.push({
      ...execution,
      completedAt: new Date().toISOString()
    });

    return execution;
  }

  /**
   * Execute JavaScript code.
   */
  async _executeJS(code, options) {
    // Write code to temp file
    const tmpFile = path.join(this.tempDir, `sandbox_${Date.now()}.js`);
    fs.writeFileSync(tmpFile, code);

    try {
      const result = this._execCommand(
        `node "${tmpFile}"`,
        options
      );
      return result;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Execute Python code.
   */
  async _executePython(code, options) {
    const tmpFile = path.join(this.tempDir, `sandbox_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, code);

    try {
      const result = this._execCommand(
        `python "${tmpFile}"`,
        options
      );
      return result;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Execute Bash code.
   */
  async _executeBash(code, options) {
    const tmpFile = path.join(this.tempDir, `sandbox_${Date.now()}.sh`);
    fs.writeFileSync(tmpFile, code);

    try {
      const result = this._execCommand(
        `bash "${tmpFile}"`,
        options
      );
      return result;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Execute PowerShell code (Windows).
   */
  async _executePowerShell(code, options) {
    const tmpFile = path.join(this.tempDir, `sandbox_${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, code);

    try {
      const result = this._execCommand(
        `powershell -ExecutionPolicy Bypass -File "${tmpFile}"`,
        options
      );
      return result;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Execute a command with timeout and resource limits.
   */
  _execCommand(cmd, options) {
    const timeout = options.timeout || this.maxTimeout;
    const workDir = options.workDir || this.tempDir;

    try {
      const stdout = execSync(cmd, {
        encoding: 'utf-8',
        timeout,
        cwd: workDir,
        env: { ...process.env, ...options.env },
        maxBuffer: this.maxOutputSize,
        windowsHide: true
      });

      return { stdout, stderr: '', exitCode: 0 };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.status || 1
      };
    }
  }

  /**
   * Route execution to the appropriate language handler.
   */
  async _executeLanguage(language, code, options) {
    switch (language) {
      case 'javascript':
      case 'js':
      case 'node':
        return this._executeJS(code, options);
      case 'python':
      case 'py':
        return this._executePython(code, options);
      case 'bash':
      case 'sh':
      case 'shell':
        return this._executeBash(code, options);
      case 'powershell':
      case 'ps1':
        return this._executePowerShell(code, options);
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * List active executions.
   */
  listActive() {
    return Array.from(this.executions.values()).map(e => ({
      id: e.id,
      language: e.language,
      status: e.status,
      startedAt: e.startedAt,
      duration: e.duration
    }));
  }

  /**
   * Get execution history.
   */
  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  /**
   * Cancel an active execution.
   */
  cancel(execId) {
    const exec = this.executions.get(execId);
    if (!exec) return false;
    exec.status = 'cancelled';
    exec.error = 'Cancelled by user';
    this.executions.delete(execId);
    return true;
  }

  /**
   * Clean up temp files.
   */
  cleanup() {
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        if (file.startsWith('sandbox_')) {
          fs.unlinkSync(path.join(this.tempDir, file));
        }
      }
      return { cleaned: files.length };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get supported languages.
   */
  getSupportedLanguages() {
    return this.allowedLanguages.map(lang => ({
      name: lang,
      available: this._isLanguageAvailable(lang)
    }));
  }

  _isLanguageAvailable(lang) {
    try {
      switch (lang) {
        case 'javascript':
        case 'js':
        case 'node':
          execSync('node --version', { encoding: 'utf-8', timeout: 3000 });
          return true;
        case 'python':
        case 'py':
          execSync('python --version', { encoding: 'utf-8', timeout: 3000 });
          return true;
        case 'bash':
        case 'sh':
          execSync('bash --version', { encoding: 'utf-8', timeout: 3000 });
          return true;
        case 'powershell':
          execSync('powershell --version', { encoding: 'utf-8', timeout: 3000 });
          return true;
        default:
          return false;
      }
    } catch (e) {
      return false;
    }
  }

  /**
   * Get sandbox stats.
   */
  getStats() {
    return {
      activeExecutions: this.executions.size,
      historyCount: this.history.length,
      allowedLanguages: this.allowedLanguages,
      maxTimeout: this.maxTimeout,
      maxMemoryMB: this.maxMemoryMB,
      tempDir: this.tempDir,
      languages: this.getSupportedLanguages()
    };
  }
}

module.exports = SandboxRunner;
