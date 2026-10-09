'use strict';

/**
 * MultiUserIsolation - Ensures complete memory isolation between users.
 *
 * Rules:
 * - User A cannot see User B's memories
 * - User A cannot see User B's knowledge
 * - User A cannot see User B's skills
 * - Shared knowledge requires explicit opt-in
 * - Audit trail for all cross-user access attempts
 */
class MultiUserIsolation {
  constructor(config = {}) {
    this.userStores = new Map();
    this.accessLog = [];
    this.sharedKnowledge = new Map();
  }

  /**
   * Create an isolated store for a user.
   */
  createStore(userId) {
    if (this.userStores.has(userId)) return this.userStores.get(userId);

    const store = {
      userId,
      memories: [],
      knowledge: [],
      skills: [],
      experiences: [],
      profile: {},
      createdAt: Date.now(),
    };
    this.userStores.set(userId, store);
    return store;
  }

  /**
   * Store data in user's isolated space.
   */
  store(userId, namespace, data) {
    const store = this.userStores.get(userId) || this.createStore(userId);
    if (!store[namespace]) store[namespace] = [];
    store[namespace].push({ ...data, storedAt: Date.now() });
    return true;
  }

  /**
   * Retrieve data from user's isolated space only.
   */
  retrieve(userId, namespace, query = null) {
    const store = this.userStores.get(userId);
    if (!store || !store[namespace]) return [];

    let results = store[namespace];
    if (query) {
      const q = (query || '').toLowerCase();
      results = results.filter(item => {
        const text = JSON.stringify(item).toLowerCase();
        return q.split(/\s+/).some(w => w.length > 2 && text.includes(w));
      });
    }
    return results;
  }

  /**
   * Attempt to access another user's data (logged and blocked).
   */
  attemptCrossAccess(requesterId, targetId, namespace) {
    this.accessLog.push({
      requesterId,
      targetId,
      namespace,
      timestamp: Date.now(),
      allowed: false,
    });
    return { allowed: false, reason: 'Cross-user access denied' };
  }

  /**
   * Share specific knowledge between users.
   */
  shareKnowledge(sourceUserId, targetUserId, knowledgeId) {
    const store = this.userStores.get(sourceUserId);
    if (!store) return false;

    const knowledge = store.knowledge?.find(k => k.id === knowledgeId);
    if (!knowledge) return false;

    const targetStore = this.userStores.get(targetUserId) || this.createStore(targetUserId);
    if (!targetStore.knowledge) targetStore.knowledge = [];
    targetStore.knowledge.push({ ...knowledge, sharedFrom: sourceUserId, sharedAt: Date.now() });

    return true;
  }

  /**
   * Get user's isolated store.
   */
  getUserStore(userId) {
    return this.userStores.get(userId);
  }

  /**
   * Get audit log.
   */
  getAccessLog() {
    return this.accessLog.slice(-100);
  }

  getStats() {
    return {
      users: this.userStores.size,
      totalMemories: Array.from(this.userStores.values()).reduce((s, u) => s + (u.memories?.length || 0), 0),
      accessAttempts: this.accessLog.length,
      blockedAttempts: this.accessLog.filter(a => !a.allowed).length,
    };
  }
}

module.exports = { MultiUserIsolation };
