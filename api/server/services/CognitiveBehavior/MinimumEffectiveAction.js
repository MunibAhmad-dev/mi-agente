'use strict';

/**
 * MinimumEffectiveAction — Gen B Phase 35.
 *
 * Enforces the principle of minimum effective action:
 *   - Prefer the smallest action that achieves the goal
 *   - Prefer reversible over irreversible actions
 *   - Prefer read over write, write over delete
 *   - Prefer scoped over broad (one file vs entire directory)
 *   - Prefer local over remote (no external side-effects when not needed)
 *
 * Singletion: getMinimumEffectiveAction()
 */

// Action weight table — higher = more impact, prefer lower
const ACTION_WEIGHTS = {
  read:     1,
  list:     1,
  search:   2,
  analyze:  2,
  write:    4,
  create:   4,
  update:   5,
  replace:  6,
  rename:   6,
  send:     7,
  publish:  8,
  delete:   9,
  drop:     9,
  destroy:  10,
  truncate: 10,
  wipe:     10,
};

// Keyword patterns for classifying proposed actions
const SCOPE_PATTERNS = {
  broad:   [/\ball\b/i, /\beverything\b/i, /\brecursive/i, /\b-r\b/, /\*/, /entire/i, /whole/i, /entire\s+directory/i],
  scoped:  [/\bone\b/i, /\bsingle\b/i, /\bonly\b/i, /\bspecific\b/i, /\bthis\s+file/i],
};

const REVERSIBILITY_PATTERNS = {
  irreversible: [
    /\bdelete\b/i, /\bdrop\b/i, /\bdestroy\b/i, /\btruncate\b/i, /\bwipe\b/i,
    /\bsend\b/i,   /\bpublish\b/i, /\bdeploy\b/i, /\bpermanent/i,
    /\bpurge\b/i,  /\bremove\b/i,
  ],
  reversible: [
    /\bread\b/i,   /\bpreview\b/i, /\bcopy\b/i,  /\bbackup\b/i, /\bdraft\b/i,
    /\bstage\b/i,  /\bdry.?run\b/i, /\btest\b/i, /\bsimulat/i,
  ],
};

function classifyReversibility(text) {
  for (const p of REVERSIBILITY_PATTERNS.irreversible) if (p.test(text)) return 'irreversible';
  for (const p of REVERSIBILITY_PATTERNS.reversible)   if (p.test(text)) return 'reversible';
  return 'unknown';
}

function classifyScope(text) {
  for (const p of SCOPE_PATTERNS.broad)  if (p.test(text)) return 'broad';
  for (const p of SCOPE_PATTERNS.scoped) if (p.test(text)) return 'scoped';
  return 'unknown';
}

function extractActionType(text) {
  const lower = text.toLowerCase();
  for (const [action] of Object.entries(ACTION_WEIGHTS).sort((a, b) => b[1] - a[1])) {
    if (lower.includes(action)) return action;
  }
  return 'unknown';
}

class MinimumEffectiveAction {
  constructor() {
    this.stats = { evaluated: 0, reduced: 0, blocked: 0, passed: 0 };
  }

  /**
   * Evaluate a proposed action for MEA compliance.
   * @param {string} action - Description of the proposed action
   * @param {string} goal   - The goal the action is meant to achieve
   * @param {object} [opts]
   * @param {string[]} [opts.alternatives] - Alternative action descriptions to compare
   * @returns {{ compliant: boolean, score: number, reversibility: string, scope: string,
   *             weight: number, suggestions: string[], minimumAction: string|null }}
   */
  evaluate(action, goal, opts = {}) {
    try {
      this.stats.evaluated++;
      const { alternatives = [] } = opts;

      const actionType   = extractActionType(action);
      const weight       = ACTION_WEIGHTS[actionType] ?? 5;
      const reversibility = classifyReversibility(action);
      const scope        = classifyScope(action);

      // Score 0–1: lower weight = higher score
      const weightScore       = 1 - weight / 10;
      const reversibilityBonus = reversibility === 'reversible' ? 0.2 : reversibility === 'irreversible' ? -0.2 : 0;
      const scopeBonus         = scope === 'scoped' ? 0.1 : scope === 'broad' ? -0.1 : 0;
      const score = Math.max(0, Math.min(1, weightScore + reversibilityBonus + scopeBonus));

      const suggestions = [];

      if (weight >= 8) {
        suggestions.push(`Consider a less destructive alternative to "${actionType}" — e.g. backup first, then delete.`);
        this.stats.blocked++;
      }
      if (scope === 'broad') {
        suggestions.push('Narrow the scope to the specific target rather than operating on everything.');
      }
      if (reversibility === 'irreversible') {
        suggestions.push('Prefer a reversible intermediate step (backup, draft, staging) before committing.');
      }

      // Find minimum action from alternatives
      let minimumAction = null;
      if (alternatives.length > 0) {
        const ranked = alternatives.map(alt => ({
          alt,
          weight: ACTION_WEIGHTS[extractActionType(alt)] ?? 5,
        })).sort((a, b) => a.weight - b.weight);
        minimumAction = ranked[0].weight < weight ? ranked[0].alt : null;
      }

      const compliant = score >= 0.5 && weight < 8;
      if (compliant) this.stats.passed++;
      else if (weight >= 8) {} // already counted above
      else this.stats.reduced++;

      return { compliant, score: Math.round(score * 100) / 100, reversibility, scope, weight, suggestions, minimumAction };
    } catch (e) {
      return { compliant: true, score: 0.5, reversibility: 'unknown', scope: 'unknown', weight: 5, suggestions: [], minimumAction: null, error: e.message };
    }
  }

  /**
   * Given multiple action options for the same goal, return the minimum effective one.
   * @param {string[]} actions
   * @param {string}   goal
   * @returns {{ chosen: string, reason: string, evaluation: object }}
   */
  choose(actions, goal) {
    try {
      if (!actions || actions.length === 0) return { chosen: null, reason: 'No actions provided', evaluation: null };
      const evaluated = actions.map(a => ({ action: a, evaluation: this.evaluate(a, goal) }));
      evaluated.sort((a, b) => b.evaluation.score - a.evaluation.score);
      const best = evaluated[0];
      return {
        chosen:     best.action,
        reason:     `Lowest impact (weight ${best.evaluation.weight}/10) with score ${best.evaluation.score}`,
        evaluation: best.evaluation,
        allRanked:  evaluated.map(e => ({ action: e.action, score: e.evaluation.score, weight: e.evaluation.weight })),
      };
    } catch (e) {
      return { chosen: actions[0], reason: 'Fallback — evaluation error: ' + e.message, evaluation: null };
    }
  }

  /**
   * Check if an action violates MEA hard limits (weight >= 9, irreversible + broad).
   * @param {string} action
   * @returns {{ blocked: boolean, reason: string|null }}
   */
  shouldBlock(action) {
    try {
      const weight       = ACTION_WEIGHTS[extractActionType(action)] ?? 5;
      const reversibility = classifyReversibility(action);
      const scope        = classifyScope(action);

      if (weight >= 9) {
        return { blocked: true, reason: `Action "${extractActionType(action)}" has maximum destructive weight (${weight}/10).` };
      }
      if (reversibility === 'irreversible' && scope === 'broad') {
        return { blocked: true, reason: 'Irreversible action with broad scope — too high risk for autonomous execution.' };
      }
      return { blocked: false, reason: null };
    } catch (e) {
      return { blocked: false, reason: null };
    }
  }

  /**
   * Suggest a lighter-weight alternative to a heavy action.
   * @param {string} action
   * @returns {string}
   */
  suggestAlternative(action) {
    try {
      const actionType = extractActionType(action);
      const alternatives = {
        delete:   'Move to a temporary location instead of deleting permanently.',
        wipe:     'Overwrite with empty content and keep a backup copy.',
        destroy:  'Archive the item before destroying it.',
        drop:     'Rename or archive the table instead of dropping it.',
        truncate: 'Export the data first, then truncate.',
        send:     'Save as draft and review before sending.',
        publish:  'Stage to a preview environment before publishing.',
        deploy:   'Deploy to staging first, then promote to production.',
        replace:  'Create a versioned backup before replacing.',
        update:   'Preview the diff before applying the update.',
      };
      return alternatives[actionType] || 'Consider whether a read-only or scoped variant of this action would achieve the goal.';
    } catch (e) {
      return 'Consider a less impactful alternative.';
    }
  }

  getStats() {
    return {
      ...this.stats,
      complianceRate: this.stats.evaluated > 0
        ? Math.round((this.stats.passed / this.stats.evaluated) * 100) + '%'
        : 'n/a',
    };
  }
}

let _instance = null;
function getMinimumEffectiveAction() {
  if (!_instance) _instance = new MinimumEffectiveAction();
  return _instance;
}

module.exports = { MinimumEffectiveAction, getMinimumEffectiveAction };
