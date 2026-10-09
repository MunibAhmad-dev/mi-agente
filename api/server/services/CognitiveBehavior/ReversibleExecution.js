'use strict';

/**
 * ReversibleExecution — Gen B Safety Phase 1.
 * Tracks which actions are reversible and maintains an undo state.
 * Actions registered here can be undone via their stored undoFn.
 *
 * Reversible types: file_edit, config_change, message_draft
 * Irreversible types: deploy, delete, send
 */

const REVERSIBLE_TYPES = new Set(['file_edit', 'config_change', 'message_draft', 'tag', 'label', 'rename']);
const IRREVERSIBLE_TYPES = new Set(['deploy', 'delete', 'send', 'publish', 'payment', 'notify']);
const MAX_HISTORY = 500;

class ReversibleExecution {
  constructor() {
    // actionId → { actionId, action, undoFn, context, registeredAt, undone }
    this._registry = new Map();
    this._history = [];
    this.stats = { registered: 0, undone: 0, failed: 0 };
  }

  /**
   * Register an action with its undo function.
   * @param {string} actionId   - Unique identifier for this action
   * @param {object} action     - { type, description, payload? }
   * @param {Function} undoFn  - Async or sync function that reverses the action
   * @param {object} context   - { sessionId?, userId?, timestamp? }
   * @returns {{ registered: boolean, actionId: string, reversible: boolean }}
   */
  register(actionId, action, undoFn, context = {}) {
    try {
      if (!actionId || !action) {
        return { registered: false, actionId: null, reversible: false, error: 'actionId and action are required' };
      }

      const reversible = typeof undoFn === 'function';
      const entry = {
        actionId,
        action: { ...action },
        undoFn: reversible ? undoFn : null,
        context: { ...context, timestamp: context.timestamp || new Date().toISOString() },
        registeredAt: new Date().toISOString(),
        undone: false,
      };

      this._registry.set(actionId, entry);
      this._addHistory(actionId, action);
      this.stats.registered++;

      return { registered: true, actionId, reversible };
    } catch (err) {
      return { registered: false, actionId, reversible: false, error: err.message };
    }
  }

  /**
   * Undo the action identified by actionId.
   * @param {string} actionId
   * @returns {Promise<{ success: boolean, actionId: string, result: any }>}
   */
  async undo(actionId) {
    try {
      const entry = this._registry.get(actionId);
      if (!entry) {
        return { success: false, actionId, result: null, error: 'Action not found' };
      }
      if (entry.undone) {
        return { success: false, actionId, result: null, error: 'Action already undone' };
      }
      if (!entry.undoFn) {
        return { success: false, actionId, result: null, error: 'No undo function registered for this action' };
      }

      const result = await entry.undoFn(entry.action, entry.context);
      entry.undone = true;
      this.stats.undone++;
      return { success: true, actionId, result: result || null };
    } catch (err) {
      this.stats.failed++;
      return { success: false, actionId, result: null, error: err.message };
    }
  }

  /**
   * Check whether a given action type is considered reversible.
   * @param {string} actionType
   * @returns {boolean}
   */
  isReversible(actionType) {
    try {
      if (!actionType) return false;
      const t = actionType.toLowerCase();
      if (REVERSIBLE_TYPES.has(t)) return true;
      if (IRREVERSIBLE_TYPES.has(t)) return false;
      // Unknown types: assume reversible if no destructive keyword
      return !/delete|destroy|send|deploy|publish|pay|notify/.test(t);
    } catch (err) {
      return false;
    }
  }

  /**
   * Get recent registered actions.
   * @param {number} limit
   * @returns {Array<{ actionId, action, registeredAt, undone }>}
   */
  getHistory(limit = 50) {
    try {
      return this._history.slice(-Math.max(1, limit)).map((id) => {
        const e = this._registry.get(id);
        if (!e) return null;
        return {
          actionId: e.actionId,
          action: e.action,
          context: e.context,
          registeredAt: e.registeredAt,
          undone: e.undone,
          hasUndoFn: Boolean(e.undoFn),
        };
      }).filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  /**
   * Actions that can still be undone (registered, have undoFn, not yet undone).
   * @returns {Array}
   */
  getPendingUndo() {
    try {
      const pending = [];
      for (const [, entry] of this._registry) {
        if (!entry.undone && entry.undoFn) {
          pending.push({
            actionId: entry.actionId,
            action: entry.action,
            registeredAt: entry.registeredAt,
          });
        }
      }
      return pending.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
    } catch (err) {
      return [];
    }
  }

  _addHistory(actionId) {
    this._history.push(actionId);
    if (this._history.length > MAX_HISTORY) this._history.shift();
  }

  getStats() {
    return {
      ...this.stats,
      registrySize: this._registry.size,
      pendingUndo: this.getPendingUndo().length,
    };
  }
}

let _instance = null;
function getReversibleExecution() {
  if (!_instance) _instance = new ReversibleExecution();
  return _instance;
}

module.exports = { ReversibleExecution, getReversibleExecution };
