/**
 * MemoryManager — Hierarchical memory system for the agent harness.
 *
 * Implements 6 memory layers:
 *   1. Working Memory   — Current conversation context (ephemeral, per-turn)
 *   2. Task Memory      — Facts learned during current task execution
 *   3. Session Memory   — Summarized history across turns in a session
 *   4. Project Memory   — Persistent facts about the project (architecture, patterns, etc.)
 *   5. Error Memory     — Past errors and their resolutions (self-healing memory)
 *   6. Long-Term Memory — Cross-session knowledge (stored to disk)
 *
 * Design: Provider-agnostic, no external dependencies, disk persistence optional.
 *
 * Integration:
 *   HarnessManager.run() → MemoryManager retrieves relevant context
 *                        → ContextManager builds messages with memory
 *                        → After task: MemoryManager stores new knowledge
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const logger = {
  info: (...args) => console.info('[MemoryManager]', ...args),
  debug: (...args) => console.log('[MemoryManager]', ...args),
  warn: (...args) => console.warn('[MemoryManager]', ...args),
  error: (...args) => console.error('[MemoryManager]', ...args),
};

/**
 * Memory entry.
 */
class MemoryEntry {
  constructor(type, key, value, metadata = {}) {
    this.id = crypto.randomUUID();
    this.type = type;       // working | task | session | project | error | longterm
    this.key = key;         // Searchable key/label
    this.value = value;     // The memory content
    this.metadata = {
      createdAt: new Date().toISOString(),
      accessCount: 0,
      lastAccessed: null,
      tags: metadata.tags || [],
      taskId: metadata.taskId || null,
      sessionId: metadata.sessionId || null,
      importance: metadata.importance || 'normal', // low | normal | high | critical
      source: metadata.source || 'agent',
      ...metadata,
    };
  }

  touch() {
    this.metadata.accessCount++;
    this.metadata.lastAccessed = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      key: this.key,
      value: this.value,
      metadata: this.metadata,
    };
  }

  static fromJSON(data) {
    const entry = new MemoryEntry(data.type, data.key, data.value, data.metadata);
    entry.id = data.id;
    return entry;
  }
}

/**
 * MemoryManager — hierarchical memory for agent runs.
 */
class MemoryManager {
  constructor(config = {}) {
    this.config = {
      maxWorkingMemory: config.maxWorkingMemory || 20,       // entries
      maxTaskMemory: config.maxTaskMemory || 50,             // entries
      maxSessionMemory: config.maxSessionMemory || 200,      // entries
      maxProjectMemory: config.maxProjectMemory || 500,      // entries
      maxErrorMemory: config.maxErrorMemory || 100,          // entries
      maxLongTermMemory: config.maxLongTermMemory || 1000,   // entries
      persistDir: config.persistDir || null,                 // disk persistence dir
      autoSummarizeThreshold: config.autoSummarizeThreshold || 0.85,
      ...config,
    };

    // Memory stores
    this._working = [];      // Ephemeral, cleared each turn
    this._task = [];         // Current task
    this._session = [];      // Summarized session history
    this._project = [];      // Persistent project knowledge
    this._error = [];        // Error resolutions
    this._longterm = [];     // Cross-session

    // Search index (key → entry IDs)
    this._index = new Map();

    // Stats
    this._stats = {
      totalReads: 0,
      totalWrites: 0,
      totalSearches: 0,
      cacheHits: 0,
    };

    // Load persisted memory if dir exists
    if (this.config.persistDir) {
      this._loadFromDisk();
    }
  }

  // ============================================================
  // WORKING MEMORY (ephemeral, per-turn)
  // ============================================================

  /**
   * Add to working memory (cleared each turn).
   */
  addToWorkingMemory(key, value, metadata = {}) {
    const entry = new MemoryEntry('working', key, value, metadata);
    this._addToStore(this._working, entry, this.config.maxWorkingMemory);
    this._indexEntry(entry);
    this._stats.totalWrites++;
    return entry;
  }

  /**
   * Get relevant entries from working memory.
   */
  getFromWorkingMemory(query = null, limit = 10) {
    this._stats.totalReads++;
    return this._queryMemory(this._working, query, limit);
  }

  /**
   * Clear working memory (new turn).
   */
  clearWorkingMemory() {
    this._working.forEach(e => this._unindexEntry(e));
    this._working = [];
  }

  // ============================================================
  // TASK MEMORY (persists during task execution)
  // ============================================================

  /**
   * Add to task memory.
   */
  addToTaskMemory(key, value, metadata = {}) {
    const entry = new MemoryEntry('task', key, value, { ...metadata, importance: metadata.importance || 'high' });
    this._addToStore(this._task, entry, this.config.maxTaskMemory);
    this._indexEntry(entry);
    this._stats.totalWrites++;
    return entry;
  }

  /**
   * Get relevant entries from task memory.
   */
  getFromTaskMemory(query = null, limit = 20) {
    this._stats.totalReads++;
    return this._queryMemory(this._task, query, limit);
  }

  /**
   * Clear task memory (new task).
   */
  clearTaskMemory() {
    this._task.forEach(e => this._unindexEntry(e));
    this._task = [];
  }

  /**
   * Summarize task memory into session memory when task completes.
   */
  summarizeTaskToSession() {
    if (this._task.length === 0) return null;

    // Select high-importance task memories for session summary
    const important = this._task
      .filter(e => e.metadata.importance === 'high' || e.metadata.importance === 'critical')
      .map(e => `[${e.key}]: ${e.value}`)
      .join('\n');

    if (!important) return null;

    const summary = {
      taskSummary: important,
      entryCount: this._task.length,
      timestamp: new Date().toISOString(),
    };

    this.addToSessionMemory('task_summary', JSON.stringify(summary), {
      tags: ['summary', 'task'],
      importance: 'high',
    });

    return summary;
  }

  // ============================================================
  // SESSION MEMORY (summarized history across turns)
  // ============================================================

  /**
   * Add to session memory.
   */
  addToSessionMemory(key, value, metadata = {}) {
    const entry = new MemoryEntry('session', key, value, metadata);
    this._addToStore(this._session, entry, this.config.maxSessionMemory);
    this._indexEntry(entry);
    this._stats.totalWrites++;
    return entry;
  }

  /**
   * Get relevant entries from session memory.
   */
  getSessionMemory(query = null, limit = 30) {
    this._stats.totalReads++;
    return this._queryMemory(this._session, query, limit);
  }

  // ============================================================
  // PROJECT MEMORY (persistent across sessions)
  // ============================================================

  /**
   * Add to project memory.
   */
  addToProjectMemory(key, value, metadata = {}) {
    const entry = new MemoryEntry('project', key, value, { ...metadata, importance: metadata.importance || 'high' });
    this._addToStore(this._project, entry, this.config.maxProjectMemory);
    this._indexEntry(entry);
    this._stats.totalWrites++;
    this._persistToDisk('project');
    return entry;
  }

  /**
   * Get relevant entries from project memory.
   */
  getFromProjectMemory(query = null, limit = 20) {
    this._stats.totalReads++;
    return this._queryMemory(this._project, query, limit);
  }

  /**
   * Store a key architectural fact about the project.
   */
  storeArchitecturalFact(fact) {
    return this.addToProjectMemory(`arch:${fact.slice(0, 80)}`, fact, {
      tags: ['architecture'],
      importance: 'high',
    });
  }

  /**
   * Store a project pattern (convention, style, etc.)
   */
  storeProjectPattern(pattern) {
    return this.addToProjectMemory(`pattern:${pattern.slice(0, 80)}`, pattern, {
      tags: ['pattern', 'convention'],
      importance: 'normal',
    });
  }

  // ============================================================
  // ERROR MEMORY (self-healing: past errors + resolutions)
  // ============================================================

  /**
   * Record an error and its resolution.
   */
  recordError(error, resolution, context = {}) {
    const key = `error:${error.slice(0, 100)}`;
    const value = JSON.stringify({
      error,
      resolution,
      context,
      timestamp: new Date().toISOString(),
    });

    const entry = new MemoryEntry('error', key, value, {
      tags: ['error', context.category || 'unknown'],
      importance: 'high',
    });

    this._addToStore(this._error, entry, this.config.maxErrorMemory);
    this._indexEntry(entry);
    this._stats.totalWrites++;
    return entry;
  }

  /**
   * Find similar past errors for self-healing.
   */
  findSimilarErrors(errorMessage, limit = 5) {
    this._stats.totalReads++;
    const query = errorMessage.toLowerCase();

    return this._error
      .map(entry => {
        const errorText = entry.value.toLowerCase();
        const similarity = this._computeSimilarity(query, errorText);
        return { entry, similarity };
      })
      .filter(r => r.similarity > 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(r => {
        r.entry.touch();
        return JSON.parse(r.entry.value);
      });
  }

  // ============================================================
  // LONG-TERM MEMORY (cross-session)
  // ============================================================

  /**
   * Add to long-term memory.
   */
  addToLongTermMemory(key, value, metadata = {}) {
    const entry = new MemoryEntry('longterm', key, value, metadata);
    this._addToStore(this._longterm, entry, this.config.maxLongTermMemory);
    this._indexEntry(entry);
    this._stats.totalWrites++;
    this._persistToDisk('longterm');
    return entry;
  }

  /**
   * Get relevant long-term memories.
   */
  getFromLongTermMemory(query = null, limit = 20) {
    this._stats.totalReads++;
    return this._queryMemory(this._longterm, query, limit);
  }

  // ============================================================
  // UNIFIED SEARCH (across all layers)
  // ============================================================

  /**
   * Search across all memory layers.
   */
  search(query, options = {}) {
    const {
      layers = ['working', 'task', 'session', 'project', 'error', 'longterm'],
      limit = 20,
      minImportance = null,
    } = options;

    this._stats.totalSearches++;

    const stores = {
      working: this._working,
      task: this._task,
      session: this._session,
      project: this._project,
      error: this._error,
      longterm: this._longterm,
    };

    const results = [];
    for (const layer of layers) {
      const store = stores[layer];
      if (!store) continue;

      const matches = this._queryMemory(store, query, limit);
      for (const match of matches) {
        if (minImportance && this._importanceRank(match.metadata.importance) < this._importanceRank(minImportance)) {
          continue;
        }
        results.push({ ...match, layer });
      }
    }

    // Sort by relevance × importance
    results.sort((a, b) => {
      const scoreA = (a.similarity || 0) * this._importanceRank(a.metadata.importance);
      const scoreB = (b.similarity || 0) * this._importanceRank(b.metadata.importance);
      return scoreB - scoreA;
    });

    return results.slice(0, limit);
  }

  /**
   * Get a consolidated context summary for the current state.
   */
  getContextSummary(options = {}) {
    const { maxTokens = 4000 } = options;
    const parts = [];
    let estimatedTokens = 0;

    // 1. Project context (always included if available)
    const projectFacts = this._project.slice(-10);
    if (projectFacts.length > 0) {
      const projectText = projectFacts.map(e => `- ${e.value}`).join('\n');
      parts.push(`## Project Context\n${projectText}`);
      estimatedTokens += Math.ceil(projectText.length / 4);
    }

    // 2. Current task context
    const taskFacts = this._task.slice(-10);
    if (taskFacts.length > 0) {
      const taskText = taskFacts.map(e => `- [${e.key}] ${e.value}`).join('\n');
      parts.push(`## Current Task\n${taskText}`);
      estimatedTokens += Math.ceil(taskText.length / 4);
    }

    // 3. Relevant error history
    const recentErrors = this._error.slice(-5);
    if (recentErrors.length > 0) {
      const errorText = recentErrors.map(e => {
        const parsed = JSON.parse(e.value);
        return `- Error: ${parsed.error}\n  Resolution: ${parsed.resolution}`;
      }).join('\n');
      parts.push(`## Past Errors & Resolutions\n${errorText}`);
      estimatedTokens += Math.ceil(errorText.length / 4);
    }

    // 4. Working memory
    const workingFacts = this._working.slice(-5);
    if (workingFacts.length > 0) {
      const workingText = workingFacts.map(e => `- ${e.value}`).join('\n');
      parts.push(`## Working Context\n${workingText}`);
      estimatedTokens += Math.ceil(workingText.length / 4);
    }

    // Truncate if exceeds token budget
    const result = parts.join('\n\n');
    if (estimatedTokens > maxTokens) {
      return result.slice(0, maxTokens * 4);
    }

    return result;
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  /**
   * Add entry to a store, evicting oldest if full.
   */
  _addToStore(store, entry, maxSize) {
    if (store.length >= maxSize) {
      // Evict least important, then least recently accessed
      store.sort((a, b) => {
        const impDiff = this._importanceRank(a.metadata.importance) - this._importanceRank(b.metadata.importance);
        if (impDiff !== 0) return impDiff;
        return (a.metadata.accessCount || 0) - (b.metadata.accessCount || 0);
      });
      const evicted = store.shift();
      if (evicted) this._unindexEntry(evicted);
    }
    store.push(entry);
  }

  /**
   * Query memory entries by similarity.
   */
  _queryMemory(store, query, limit) {
    if (!query) {
      return store.slice(-limit).map(e => {
        e.touch();
        return { ...e.toJSON(), similarity: 1.0 };
      });
    }

    const queryLower = query.toLowerCase();
    return store
      .map(entry => {
        const text = `${entry.key} ${entry.value}`.toLowerCase();
        const similarity = this._computeSimilarity(queryLower, text);
        return { entry, similarity };
      })
      .filter(r => r.similarity > 0.1)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(r => {
        r.entry.touch();
        return { ...r.entry.toJSON(), similarity: r.similarity };
      });
  }

  /**
   * Simple text similarity (Jaccard-like word overlap).
   */
  _computeSimilarity(query, text) {
    const queryWords = new Set(query.split(/\s+/).filter(w => w.length > 2));
    const textWords = new Set(text.split(/\s+/).filter(w => w.length > 2));

    if (queryWords.size === 0 || textWords.size === 0) return 0;

    let overlap = 0;
    for (const word of queryWords) {
      if (textWords.has(word)) overlap++;
    }

    // Jaccard similarity
    const union = new Set([...queryWords, ...textWords]).size;
    return union > 0 ? overlap / union : 0;
  }

  /**
   * Rank importance level numerically.
   */
  _importanceRank(importance) {
    const ranks = { low: 1, normal: 2, high: 3, critical: 4 };
    return ranks[importance] || 2;
  }

  /**
   * Index a memory entry for fast lookup.
   */
  _indexEntry(entry) {
    const words = `${entry.key} ${entry.value}`.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length < 3) continue;
      if (!this._index.has(word)) {
        this._index.set(word, new Set());
      }
      this._index.get(word).add(entry.id);
    }
  }

  /**
   * Remove entry from index.
   */
  _unindexEntry(entry) {
    const words = `${entry.key} ${entry.value}`.toLowerCase().split(/\s+/);
    for (const word of words) {
      const ids = this._index.get(word);
      if (ids) {
        ids.delete(entry.id);
        if (ids.size === 0) this._index.delete(word);
      }
    }
  }

  // ============================================================
  // PERSISTENCE
  // ============================================================

  /**
   * Persist a memory layer to disk.
   */
  _persistToDisk(layer) {
    if (!this.config.persistDir) return;

    try {
      const dir = this.config.persistDir;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const storeMap = {
        project: this._project,
        longterm: this._longterm,
        error: this._error,
      };

      const store = storeMap[layer];
      if (!store) return;

      const filePath = path.join(dir, `memory_${layer}.json`);
      const data = store.map(e => e.toJSON());
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug(`[MemoryManager] Persisted ${layer}: ${data.length} entries`);
    } catch (error) {
      logger.error(`[MemoryManager] Failed to persist ${layer}:`, error.message);
    }
  }

  /**
   * Load persisted memory from disk.
   */
  _loadFromDisk() {
    if (!this.config.persistDir) return;

    const layers = ['project', 'longterm', 'error'];
    for (const layer of layers) {
      try {
        const filePath = path.join(this.config.persistDir, `memory_${layer}.json`);
        if (!fs.existsSync(filePath)) continue;

        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const storeMap = {
          project: this._project,
          longterm: this._longterm,
          error: this._error,
        };

        const store = storeMap[layer];
        for (const item of data) {
          const entry = MemoryEntry.fromJSON(item);
          store.push(entry);
          this._indexEntry(entry);
        }

        logger.info(`[MemoryManager] Loaded ${layer}: ${data.length} entries from disk`);
      } catch (error) {
        logger.warn(`[MemoryManager] Failed to load ${layer}:`, error.message);
      }
    }
  }

  /**
   * Get memory stats.
   */
  getStats() {
    return {
      ...this._stats,
      layers: {
        working: this._working.length,
        task: this._task.length,
        session: this._session.length,
        project: this._project.length,
        error: this._error.length,
        longterm: this._longterm.length,
      },
      totalEntries: this._working.length + this._task.length + this._session.length +
        this._project.length + this._error.length + this._longterm.length,
      indexSize: this._index.size,
    };
  }

  /**
   * Clear all memory layers.
   */
  clearAll() {
    [this._working, this._task, this._session, this._error, this._longterm].forEach(store => {
      store.forEach(e => this._unindexEntry(e));
      store.length = 0;
    });
    this._index.clear();
  }
}

module.exports = { MemoryManager, MemoryEntry };
