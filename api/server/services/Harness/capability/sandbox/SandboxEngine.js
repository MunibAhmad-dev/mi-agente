'use strict';

const { VM, VMScript } = require('vm2');

/**
 * SandboxEngine - Executes capabilities in isolated VM sandbox.
 * Uses vm2 for Node.js-level isolation without Docker.
 * Resource limits: timeout, memory, allowed APIs.
 */
class SandboxEngine {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 10000, // 10s max
      memoryLimit: config.memoryLimit || 64 * 1024 * 1024, // 64MB
      ...config,
    };
    this.stats = { executed: 0, passed: 0, failed: 0, timeouts: 0 };
  }

  /**
   * Execute code in sandbox.
   */
  async execute(code, context = {}, options = {}) {
    this.stats.executed++;
    const timeout = options.timeout || this.config.timeout;

    const sandbox = {
      console: { log: () => {}, error: () => {}, warn: () => {} },
      result: null,
      error: null,
      // Provide safe APIs
      setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, timeout)),
      JSON,
      Math,
      Date,
      String,
      Number,
      Array,
      Object,
      RegExp,
      Map,
      Set,
      // User context
      ...context,
    };

    try {
      const vm = new VM({ timeout, sandbox });
      const script = new VMScript(code);
      const result = vm.run(script);
      this.stats.passed++;
      return { success: true, result: sandbox.result || result, output: '' };
    } catch (e) {
      if (e.message?.includes('Script execution timed out')) {
        this.stats.timeouts++;
        return { success: false, error: 'Timeout after ' + timeout + 'ms', type: 'timeout' };
      }
      this.stats.failed++;
      return { success: false, error: e.message, type: 'runtime' };
    }
  }

  /**
   * Test a capability's code safely.
   */
  async testCapability(capability, testCode) {
    const code = `
      const assert = (cond, msg) => { if (!cond) throw new Error('Assert failed: ' + msg); };
      ${testCode}
    `;
    return this.execute(code, {}, { timeout: 30000 });
  }

  /**
   * Validate a SKILL.md or plugin manifest.
   */
  validateManifest(content) {
    const issues = [];
    if (!content || typeof content !== 'string') {
      issues.push({ severity: 'error', message: 'Empty manifest' });
      return { valid: false, issues };
    }

    // Check for dangerous patterns
    const dangerous = [/\beval\s*\(/, /\bexec\s*\(/, /\bchild_process/, /\bsudo\b/];
    for (const p of dangerous) {
      if (p.test(content)) {
        issues.push({ severity: 'warning', message: 'Contains dangerous pattern: ' + p.source });
      }
    }

    // Check for required sections
    if (content.length < 50) {
      issues.push({ severity: 'warning', message: 'Manifest too short' });
    }

    return { valid: issues.filter(i => i.severity === 'error').length === 0, issues };
  }

  getStats() { return { ...this.stats }; }
}

module.exports = { SandboxEngine };
