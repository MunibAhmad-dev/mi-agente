'use strict';

/**
 * PromptVersioning.js — Gen B Batch-C Phase 1.
 * Version control for prompts — tracks history of prompts and improvements.
 */

const crypto = require('crypto');

class PromptVersioning {
  constructor() {
    // Map: promptId → [{ versionId, version, promptText, metadata, savedAt }]
    this._store = new Map();
    this.stats = { totalPrompts: 0, totalVersions: 0, rollbacks: 0 };
  }

  /**
   * Save a new version of a prompt.
   * @param {string} promptId
   * @param {string} promptText
   * @param {object} metadata
   * @returns {{ versionId, promptId, version }}
   */
  save(promptId, promptText, metadata = {}) {
    try {
      if (!promptId) return { error: 'promptId is required' };
      if (typeof promptText !== 'string') return { error: 'promptText must be a string' };

      if (!this._store.has(promptId)) {
        this._store.set(promptId, []);
        this.stats.totalPrompts++;
      }

      const history = this._store.get(promptId);
      const version = history.length + 1;
      const versionId = crypto.randomBytes(8).toString('hex');
      const record = { versionId, promptId, version, promptText, metadata, savedAt: new Date().toISOString() };
      history.push(record);
      this.stats.totalVersions++;
      return { versionId, promptId, version };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get the most recent version of a prompt.
   * @param {string} promptId
   * @returns {object|null}
   */
  getLatest(promptId) {
    try {
      const history = this._store.get(promptId);
      if (!history || history.length === 0) return null;
      return { ...history[history.length - 1] };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Get all versions with metadata.
   * @param {string} promptId
   * @returns {object[]}
   */
  getHistory(promptId) {
    try {
      const history = this._store.get(promptId);
      if (!history) return [];
      return history.map((v) => ({ ...v }));
    } catch (err) {
      return [];
    }
  }

  /**
   * Diff two versions.
   * @param {string} versionId1
   * @param {string} versionId2
   * @returns {{ added: string[], removed: string[], changed: boolean }}
   */
  diff(versionId1, versionId2) {
    try {
      const v1 = this._findVersion(versionId1);
      const v2 = this._findVersion(versionId2);
      if (!v1) return { error: `Version ${versionId1} not found` };
      if (!v2) return { error: `Version ${versionId2} not found` };

      const lines1 = new Set(v1.promptText.split('\n'));
      const lines2 = new Set(v2.promptText.split('\n'));

      const added = [...lines2].filter((l) => !lines1.has(l));
      const removed = [...lines1].filter((l) => !lines2.has(l));
      return { added, removed, changed: added.length > 0 || removed.length > 0 };
    } catch (err) {
      return { error: err.message, added: [], removed: [], changed: false };
    }
  }

  /**
   * Restore a specific version as the new latest.
   * @param {string} promptId
   * @param {string} versionId
   * @returns {{ versionId, promptId, version }}
   */
  rollback(promptId, versionId) {
    try {
      const target = this._findVersion(versionId);
      if (!target) return { error: `Version ${versionId} not found` };
      if (target.promptId !== promptId) return { error: 'versionId does not belong to promptId' };

      const result = this.save(promptId, target.promptText, {
        ...target.metadata,
        rolledBackFrom: versionId,
        rollbackAt: new Date().toISOString(),
      });
      this.stats.rollbacks++;
      return result;
    } catch (err) {
      return { error: err.message };
    }
  }

  _findVersion(versionId) {
    for (const history of this._store.values()) {
      const found = history.find((v) => v.versionId === versionId);
      if (found) return found;
    }
    return null;
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getPromptVersioning() {
  if (!_instance) _instance = new PromptVersioning();
  return _instance;
}

module.exports = { PromptVersioning, getPromptVersioning };
