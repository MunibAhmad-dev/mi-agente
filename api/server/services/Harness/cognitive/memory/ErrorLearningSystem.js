'use strict';

const crypto = require('crypto');

/**
 * ErrorLearningSystem - Stores errors + solutions + prevention.
 *
 * When an error occurs:
 * 1. Record the error (what happened, context, stack trace)
 * 2. Record the solution (how it was fixed)
 * 3. Extract a prevention rule (how to avoid it in the future)
 * 4. Detect patterns (recurring errors)
 *
 * Before executing any action:
 * 1. Check if similar error has occurred before
 * 2. Apply prevention strategy if available
 * 3. Warn if high-risk pattern detected
 */
class ErrorLearningSystem {
  constructor(config = {}) {
    this.errors = new Map();
    this.preventionRules = new Map();
    this.patterns = new Map();
    this.stats = { recorded: 0, prevented: 0, patternsDetected: 0 };
  }

  /**
   * Record an error with its solution and prevention strategy.
   */
  async recordError(error) {
    const id = error.id || `err_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const entry = {
      id,
      // The error
      message: error.message || '',
      type: error.type || 'unknown',
      context: error.context || {},
      stack: error.stack || '',
      tool: error.tool || '',
      timestamp: Date.now(),

      // The solution (filled after fix)
      solution: error.solution || null,
      fixedAt: null,
      fixedBy: error.fixedBy || '',

      // Prevention (extracted after fix)
      preventionRule: error.preventionRule || null,
      category: this._categorizeError(error.message),

      // Metadata
      occurrences: 1,
      lastOccurrence: Date.now(),
      severity: error.severity || 'medium',
    };

    this.errors.set(id, entry);

    // Check for patterns
    await this._detectPatterns(entry);

    this.stats.recorded++;
    return entry;
  }

  /**
   * Record the solution for an error.
   */
  async recordSolution(errorId, solution) {
    const error = this.errors.get(errorId);
    if (!error) return null;

    error.solution = {
      description: solution.description || solution,
      steps: solution.steps || [],
      fixedAt: Date.now(),
      fixedBy: solution.fixedBy || 'unknown',
    };
    error.fixedAt = Date.now();

    // Extract prevention rule
    if (solution.preventionRule) {
      error.preventionRule = solution.preventionRule;
      this.preventionRules.set(error.category, {
        category: error.category,
        rule: solution.preventionRule,
        basedOnError: errorId,
        createdAt: Date.now(),
      });
    }

    return error;
  }

  /**
   * Check if a similar error has occurred before.
   * Returns prevention strategies if available.
   */
  async checkBeforeAction(action) {
    const risks = [];
    const actionText = (action.description || action.tool || '').toLowerCase();

    for (const [, error] of this.errors) {
      const errorText = (error.message + ' ' + error.tool).toLowerCase();
      const similarity = this._calculateSimilarity(actionText, errorText);

      if (similarity > 0.5) {
        risks.push({
          previousError: error.message,
          solution: error.solution?.description || 'No solution recorded yet',
          preventionRule: error.preventionRule,
          severity: error.severity,
          similarity,
          occurrences: error.occurrences,
        });
      }
    }

    // Check prevention rules
    const prevention = this.preventionRules.get(this._categorizeError(actionText));

    return {
      risks,
      prevention: prevention || null,
      recommendation: risks.length > 0 ? 'CAUTION' : 'CLEAR',
    };
  }

  /**
   * Get errors by category.
   */
  getByCategory(category) {
    return Array.from(this.errors.values()).filter(e => e.category === category);
  }

  /**
   * Get unsolved errors.
   */
  getUnsolved() {
    return Array.from(this.errors.values()).filter(e => !e.solution);
  }

  /**
   * Get prevention rules.
   */
  getPreventionRules() {
    return Array.from(this.preventionRules.values());
  }

  /**
   * Get error patterns.
   */
  getPatterns() {
    return Array.from(this.patterns.values());
  }

  getStats() {
    return {
      ...this.stats,
      totalErrors: this.errors.size,
      solved: Array.from(this.errors.values()).filter(e => e.solution).length,
      unsolved: this.getUnsolved().length,
      preventionRules: this.preventionRules.size,
      patterns: this.patterns.size,
    };
  }

  // ===================== INTERNAL =====================

  _categorizeError(message) {
    const msg = (message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
    if (msg.includes('not found') || msg.includes('enoent')) return 'not_found';
    if (msg.includes('permission') || msg.includes('eacces')) return 'permission';
    if (msg.includes('network') || msg.includes('econnrefused')) return 'network';
    if (msg.includes('memory') || msg.includes('heap')) return 'memory';
    if (msg.includes('syntax') || msg.includes('parse')) return 'syntax';
    if (msg.includes('type') || msg.includes('undefined')) return 'type_error';
    if (msg.includes('inject') || msg.includes('security')) return 'security';
    return 'other';
  }

  _calculateSimilarity(a, b) {
    if (!a || !b) return 0;
    const wordsA = a.split(/\s+/).filter(w => w.length > 2);
    const wordsB = b.split(/\s+/).filter(w => w.length > 2);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;
    const intersection = wordsA.filter(w => wordsB.includes(w));
    return intersection.length / Math.max(wordsA.length, wordsB.length);
  }

  async _detectPatterns(error) {
    const category = error.category;
    const existing = this.patterns.get(category) || {
      category,
      count: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      errors: [],
      recommendation: '',
    };

    existing.count++;
    existing.lastSeen = Date.now();
    existing.errors.push(error.id);

    if (existing.count >= 3) {
      existing.recommendation = `RECURRING: ${category} errors detected ${existing.count} times. Consider systemic fix.`;
      this.stats.patternsDetected++;
    }

    this.patterns.set(category, existing);
  }
}

module.exports = { ErrorLearningSystem };
