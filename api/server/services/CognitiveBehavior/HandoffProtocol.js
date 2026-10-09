'use strict';

/**
 * HandoffProtocol — Gen B Safety Phase 7.
 * Manages handoffs between agents or sessions.
 * Preserves transferrable context: goals, memory summary, current task, user preferences.
 */

const HANDOFF_STATES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const MAX_HANDOFFS = 1000;

function generateHandoffId() {
  return `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Determine which parts of context are safe to transfer to another agent.
 */
function extractTransferrable(context = {}) {
  return {
    goals: context.goals || context.objective ? (context.goals || [context.objective]).flat().filter(Boolean) : [],
    memorySummary: context.memorySummary || context.summary || '',
    currentTask: context.currentTask || context.task || null,
    userPreferences: context.userPreferences || context.preferences || {},
    pendingActions: context.pendingActions || [],
    conversationHistory: context.conversationHistory ? context.conversationHistory.slice(-10) : [],
    metadata: {
      transferredAt: new Date().toISOString(),
      originalSession: context.sessionId || null,
    },
  };
}

class HandoffProtocol {
  constructor() {
    // handoffId → handoff record
    this._handoffs = new Map();
    this._handoffOrder = []; // insertion order for eviction
    this.stats = { initiated: 0, completed: 0, failed: 0, pending: 0 };
  }

  /**
   * Initiate a handoff from one session to another.
   * @param {string} fromSession
   * @param {string} toSession
   * @param {object} context   - full context to extract transferrable parts from
   * @param {string} reason    - why handoff is happening
   * @returns {{ handoffId: string, state: string, transferrable: object }}
   */
  initiate(fromSession, toSession, context = {}, reason = '') {
    try {
      if (!fromSession || !toSession) {
        return { handoffId: null, state: HANDOFF_STATES.FAILED, error: 'fromSession and toSession are required' };
      }

      const handoffId = generateHandoffId();
      const transferrable = extractTransferrable({ ...context, sessionId: fromSession });

      const record = {
        handoffId,
        fromSession,
        toSession,
        reason,
        context,
        transferrable,
        state: HANDOFF_STATES.PENDING,
        initiatedAt: new Date().toISOString(),
        completedAt: null,
        receivingAgent: null,
      };

      this._store(handoffId, record);
      this.stats.initiated++;
      this.stats.pending++;

      return { handoffId, state: HANDOFF_STATES.PENDING, transferrable };
    } catch (err) {
      return { handoffId: null, state: HANDOFF_STATES.FAILED, error: err.message };
    }
  }

  /**
   * Mark a handoff as completed by a receiving agent.
   * @param {string} handoffId
   * @param {string} receivingAgent
   * @returns {{ ok: boolean, handoffId: string, state: string }}
   */
  complete(handoffId, receivingAgent) {
    try {
      const record = this._handoffs.get(handoffId);
      if (!record) {
        return { ok: false, handoffId, state: null, error: 'Handoff not found' };
      }
      if (record.state !== HANDOFF_STATES.PENDING) {
        return { ok: false, handoffId, state: record.state, error: `Cannot complete handoff in state: ${record.state}` };
      }

      record.state = HANDOFF_STATES.COMPLETED;
      record.completedAt = new Date().toISOString();
      record.receivingAgent = receivingAgent || null;

      this.stats.completed++;
      this.stats.pending = Math.max(0, this.stats.pending - 1);

      return { ok: true, handoffId, state: HANDOFF_STATES.COMPLETED };
    } catch (err) {
      return { ok: false, handoffId, error: err.message };
    }
  }

  /**
   * Get the state of a specific handoff.
   * @param {string} handoffId
   * @returns {object} handoff record summary
   */
  getState(handoffId) {
    try {
      const record = this._handoffs.get(handoffId);
      if (!record) {
        return { found: false, handoffId, error: 'Handoff not found' };
      }
      return {
        found: true,
        handoffId: record.handoffId,
        fromSession: record.fromSession,
        toSession: record.toSession,
        reason: record.reason,
        state: record.state,
        initiatedAt: record.initiatedAt,
        completedAt: record.completedAt,
        receivingAgent: record.receivingAgent,
        transferrable: record.transferrable,
      };
    } catch (err) {
      return { found: false, handoffId, error: err.message };
    }
  }

  /**
   * List all pending (not yet completed) handoffs.
   * @returns {Array}
   */
  listPending() {
    try {
      const pending = [];
      for (const [, record] of this._handoffs) {
        if (record.state === HANDOFF_STATES.PENDING) {
          pending.push({
            handoffId: record.handoffId,
            fromSession: record.fromSession,
            toSession: record.toSession,
            reason: record.reason,
            initiatedAt: record.initiatedAt,
          });
        }
      }
      return pending.sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt));
    } catch (err) {
      return [];
    }
  }

  _store(handoffId, record) {
    if (this._handoffs.size >= MAX_HANDOFFS) {
      const oldest = this._handoffOrder.shift();
      this._handoffs.delete(oldest);
    }
    this._handoffs.set(handoffId, record);
    this._handoffOrder.push(handoffId);
  }

  getStats() {
    return { ...this.stats, totalHandoffs: this._handoffs.size };
  }
}

let _instance = null;
function getHandoffProtocol() {
  if (!_instance) _instance = new HandoffProtocol();
  return _instance;
}

module.exports = { HandoffProtocol, getHandoffProtocol };
