'use strict';

/**
 * TaskComplexityEngine — Gen B Phase 6.
 * Analyzes a task/prompt and returns its complexity level + recommended approach.
 */

const COMPLEXITY_SIGNALS = {
  expert: [
    /\b(architecture|system design|distributed|microservice|kubernetes|terraform|cryptograph)/i,
    /\b(optimize|refactor|migrate|scale|benchmark|profil)/i,
    /\b(machine learning|neural network|transformer|fine.?tun)/i,
    /\b(security audit|penetration test|threat model)/i,
    /\b(multi.?step|multi.?phase|end.?to.?end pipeline)/i,
  ],
  complex: [
    /\b(implement|build|create|develop|design|integrate)\b.{0,60}\b(system|service|module|feature|api|platform)/i,
    /\b(debug|diagnose|investigate|analyze|review)\b.{0,60}\b(issue|bug|error|problem|failure)/i,
    /\b(compare|evaluate|assess|contrast)\b.{0,60}\b(approach|option|solution|strategy)/i,
    /\b(write|generate)\b.{0,60}\b(test|spec|documentation|report)/i,
  ],
  moderate: [
    /\b(explain|describe|summarize|outline)\b/i,
    /\b(list|enumerate|show me|give me|what are)\b/i,
    /\b(how to|how do|how can|how should)\b/i,
    /\b(difference between|pros and cons|trade.?off)/i,
  ],
  simple: [
    /^(yes|no|what is|who is|when is|where is|define)\b/i,
    /\?$/.test.bind(/\?$/),
  ],
};

const APPROACH_BY_LEVEL = {
  simple: 'Direct answer — single-pass response with no decomposition needed.',
  moderate: 'Structured answer — use clear sections or steps, validate against question type.',
  complex: 'Decompose task into sub-problems, apply chain-of-thought, verify each step.',
  expert: 'Full plan-execute-review cycle: create task graph, execute iteratively, apply critic review.',
};

const SCORE_BY_LEVEL = { simple: 2, moderate: 5, complex: 7, expert: 10 };

class TaskComplexityEngine {
  constructor() {
    this.stats = { analyzed: 0, byLevel: { simple: 0, moderate: 0, complex: 0, expert: 0 } };
  }

  /**
   * Analyze the complexity of a text/task.
   * @param {string} text
   * @returns {{ level: string, score: number, factors: string[], recommendedApproach: string }}
   */
  analyze(text) {
    try {
      if (!text || typeof text !== 'string') {
        return { level: 'simple', score: 1, factors: ['empty input'], recommendedApproach: APPROACH_BY_LEVEL.simple };
      }

      this.stats.analyzed++;
      const factors = [];
      let level = 'simple';

      // Check signals from most complex to least
      for (const [lvl, patterns] of Object.entries(COMPLEXITY_SIGNALS)) {
        for (const pattern of patterns) {
          let match = false;
          if (typeof pattern === 'function') {
            match = pattern(text);
          } else {
            match = pattern.test(text);
          }
          if (match) {
            factors.push(`${lvl}: matched pattern ${pattern.source ? pattern.source.substring(0, 40) : lvl}`);
            if (_levelIndex(lvl) > _levelIndex(level)) {
              level = lvl;
            }
          }
        }
      }

      // Additional heuristics
      const wordCount = text.split(/\s+/).length;
      if (wordCount > 150 && _levelIndex(level) < _levelIndex('complex')) {
        level = 'complex';
        factors.push(`long prompt (${wordCount} words)`);
      }
      if (wordCount > 300 && _levelIndex(level) < _levelIndex('expert')) {
        level = 'expert';
        factors.push(`very long prompt (${wordCount} words)`);
      }

      // Count question marks / sub-tasks
      const questions = (text.match(/\?/g) || []).length;
      if (questions >= 3 && _levelIndex(level) < _levelIndex('complex')) {
        level = 'complex';
        factors.push(`multiple questions (${questions})`);
      }

      const score = SCORE_BY_LEVEL[level] || 2;
      this.stats.byLevel[level]++;

      return {
        level,
        score,
        factors: factors.slice(0, 8),
        recommendedApproach: APPROACH_BY_LEVEL[level],
        wordCount,
      };
    } catch (err) {
      return { level: 'simple', score: 1, factors: [err.message], recommendedApproach: APPROACH_BY_LEVEL.simple };
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

function _levelIndex(level) {
  return { simple: 0, moderate: 1, complex: 2, expert: 3 }[level] || 0;
}

let _instance = null;
function getTaskComplexityEngine() {
  if (!_instance) _instance = new TaskComplexityEngine();
  return _instance;
}

module.exports = { TaskComplexityEngine, getTaskComplexityEngine, APPROACH_BY_LEVEL };
