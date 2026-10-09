/**
 * DSHSessionManager — Manages agent session state and persistence.
 *
 * Each session tracks:
 * - Conversation history
 * - Tool call history
 * - Task state
 * - Checkpoints for recovery
 * - Metadata (model, provider, timestamps)
 */

const crypto = require('crypto');

const logger = {
  debug: (...args) => console.log('[DSHSessionManager]', ...args),
  info: (...args) => console.info('[DSHSessionManager]', ...args),
  warn: (...args) => console.warn('[DSHSessionManager]', ...args),
  error: (...args) => console.error('[DSHSessionManager]', ...args),
};

/**
 * Session entry.
 */
class Session {
  constructor(id) {
    this.id = id;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.messages = [];
    this.toolCalls = [];
    this.checkpoints = [];
    this.metadata = {};
    this.state = 'active';
  }

  addMessage(role, content, extra = {}) {
    const msg = { role, content, timestamp: new Date().toISOString(), ...extra };
    this.messages.push(msg);
    this.updatedAt = new Date().toISOString();
    return msg;
  }

  addToolCall(toolName, args, result) {
    const call = {
      tool: toolName,
      args,
      result,
      timestamp: new Date().toISOString(),
    };
    this.toolCalls.push(call);
    this.updatedAt = new Date().toISOString();
    return call;
  }

  createCheckpoint(label) {
    const checkpoint = {
      id: crypto.randomUUID(),
      label,
      messages: [...this.messages],
      toolCalls: [...this.toolCalls],
      timestamp: new Date().toISOString(),
    };
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  restoreCheckpoint(checkpointId) {
    const checkpoint = this.checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint "${checkpointId}" not found`);
    }
    this.messages = [...checkpoint.messages];
    this.toolCalls = [...checkpoint.toolCalls];
    this.updatedAt = new Date().toISOString();
    return checkpoint;
  }

  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messages: this.messages,
      toolCalls: this.toolCalls,
      checkpoints: this.checkpoints,
      metadata: this.metadata,
      state: this.state,
    };
  }
}

/**
 * DSHSessionManager — manages sessions.
 */
class DSHSessionManager {
  constructor(config = {}) {
    this.config = {
      maxSessions: config.maxSessions || 100,
      maxMessagesPerSession: config.maxMessagesPerSession || 1000,
      persistToDb: config.persistToDb || false,
      ...config,
    };

    this._sessions = new Map();
  }

  /**
   * Create a new session.
   */
  createSession(metadata = {}) {
    const id = crypto.randomUUID();
    const session = new Session(id);
    session.metadata = metadata;
    this._sessions.set(id, session);

    // Cleanup old sessions if over limit
    if (this._sessions.size > this.config.maxSessions) {
      const oldest = this._sessions.keys().next().value;
      this._sessions.delete(oldest);
    }

    logger.debug(`[DSHSessionManager] Created session: ${id}`);
    return id;
  }

  /**
   * Get a session by ID.
   */
  getSession(id) {
    return this._sessions.get(id);
  }

  /**
   * Add a message to a session.
   */
  addMessage(sessionId, role, content, extra = {}) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found`);
    }
    return session.addMessage(role, content, extra);
  }

  /**
   * Get conversation history for a session.
   */
  getMessages(sessionId, limit = null) {
    const session = this._sessions.get(sessionId);
    if (!session) return [];
    if (limit) return session.messages.slice(-limit);
    return session.messages;
  }

  /**
   * Create a checkpoint in a session.
   */
  checkpoint(sessionId, label) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    return session.createCheckpoint(label);
  }

  /**
   * Restore a session to a checkpoint.
   */
  restore(sessionId, checkpointId) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    return session.restoreCheckpoint(checkpointId);
  }

  /**
   * Delete a session.
   */
  deleteSession(id) {
    this._sessions.delete(id);
  }

  /**
   * List active sessions.
   */
  listSessions() {
    return Array.from(this._sessions.values()).map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      messageCount: s.messages.length,
      state: s.state,
    }));
  }
}

module.exports = { DSHSessionManager, Session };
