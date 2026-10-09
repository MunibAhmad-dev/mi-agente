'use strict';

/**
 * SimulationBeforeAction — Phase 11: Simulate before executing.
 *
 * Before running any high-risk action (shell command, file mutation, API call),
 * the agent produces a dry-run prediction of what would happen, checks it
 * against the PolicyEngine, and only proceeds when the simulation passes.
 *
 * Integration: called by HarnessEngine.runCommand and PlaybookManager.execute
 * (dry-run path) before the real execution.
 */

class SimulationBeforeAction {
  constructor(options = {}) {
    this._riskThreshold = options.riskThreshold ?? 5; // 0–10; simulate when risk >= threshold
    this._stats = { simulated: 0, blocked: 0, passed: 0 };
  }

  // ── Risk assessment ─────────────────────────────────────────────────────────

  /**
   * Assess the risk level of an action before running it.
   * Returns a score from 0 (safe) to 10 (critical).
   */
  assessRisk(action) {
    const { type, command, path: filePath, url } = action || {};
    let score = 0;

    if (type === 'shell' || type === 'command') {
      score = 6; // shell commands are inherently risky
      const cmd = String(command || '');
      if (/rm\s+-rf|rmdir|del\s+\/[fqs]/i.test(cmd)) score = 10;
      else if (/chmod|chown|sudo|su\s/i.test(cmd)) score = 9;
      else if (/curl|wget|nc\s|ncat/i.test(cmd)) score = 7;
      else if (/git\s+(push|reset|clean)/i.test(cmd)) score = 8;
    } else if (type === 'file_write' || type === 'file_delete') {
      score = 5;
      if (filePath && /\.(env|key|pem|pfx|p12)$/i.test(filePath)) score = 9;
    } else if (type === 'http' || type === 'api_call') {
      score = 3;
      if (/DELETE|PATCH/i.test(action.method || '')) score = 6;
    } else if (type === 'database') {
      score = 7;
      if (/drop|truncate|delete/i.test(action.query || '')) score = 10;
    }

    return Math.min(10, score);
  }

  // ── Simulation ──────────────────────────────────────────────────────────────

  /**
   * Simulate an action. Returns a prediction object without executing.
   * @param {object} action  { type, command, path, url, method, query, ... }
   * @param {object} context { worldState, goals, constraints }
   * @returns {{ risk, prediction, safe, blockedReason }}
   */
  simulate(action, context = {}) {
    this._stats.simulated++;
    const risk = this.assessRisk(action);
    const { type, command, path: filePath } = action || {};

    // Build a prediction description
    let prediction = '';
    if (type === 'shell' || type === 'command') {
      prediction = `Execute shell command: "${command || ''}". ` +
        `Expected: stdout output, possible side effects on filesystem/network.`;
    } else if (type === 'file_write') {
      prediction = `Write to file: "${filePath || ''}". ` +
        `Expected: file created/overwritten. Prior content will be replaced.`;
    } else if (type === 'file_delete') {
      prediction = `Delete file: "${filePath || ''}". Expected: file removed permanently.`;
    } else if (type === 'http' || type === 'api_call') {
      prediction = `HTTP ${action.method || 'GET'} to ${action.url || ''}. Expected: API response.`;
    } else if (type === 'database') {
      prediction = `Database query: "${(action.query || '').slice(0, 80)}". May modify data.`;
    } else {
      prediction = `Action type "${type || 'unknown'}": expected to execute with unknown side effects.`;
    }

    // Check against constraints
    const constraints = context.constraints || [];
    let blockedReason = null;
    for (const c of constraints) {
      if (c.pattern && new RegExp(c.pattern, 'i').test(command || filePath || '')) {
        blockedReason = `Blocked by constraint: ${c.description || c.pattern}`;
        break;
      }
    }

    const safe = risk < this._riskThreshold && !blockedReason;
    if (!safe) this._stats.blocked++;
    else this._stats.passed++;

    return {
      risk,
      prediction,
      safe,
      blockedReason: blockedReason || (risk >= this._riskThreshold ? `Risk score ${risk}/10 exceeds threshold ${this._riskThreshold}` : null),
      requiresConfirmation: risk >= 7,
    };
  }

  /**
   * Guard an action: simulate it and throw if not safe.
   * @param {object} action
   * @param {object} context
   * @returns {object} simulation result (always safe when this returns)
   */
  guard(action, context = {}) {
    const sim = this.simulate(action, context);
    if (!sim.safe) {
      throw new Error(`[SimulationBeforeAction] Action blocked before execution — ${sim.blockedReason}`);
    }
    return sim;
  }

  /**
   * Simulate a sequence of actions and return the aggregate result.
   * Safe only when ALL actions are individually safe.
   */
  simulateSequence(actions = [], context = {}) {
    const results = actions.map((a) => this.simulate(a, context));
    const allSafe = results.every((r) => r.safe);
    const maxRisk = Math.max(...results.map((r) => r.risk), 0);
    return {
      safe: allSafe,
      maxRisk,
      steps: results,
      blockedSteps: results.filter((r) => !r.safe),
    };
  }

  getStats() {
    return { ...this._stats };
  }
}

// Singleton instance
let _instance = null;
function getSimulator(options) {
  if (!_instance) _instance = new SimulationBeforeAction(options);
  return _instance;
}

module.exports = { SimulationBeforeAction, getSimulator };
