'use strict';

/**
 * MemoriaMulticapa — Phase 17: Multi-layer memory.
 *
 * Three distinct memory layers, each with different retention and retrieval:
 *
 *   1. Episodic   — "What happened": timestamped events and past interactions.
 *                   Decays over time; recent episodes weighted higher.
 *   2. Semantic   — "What we know": facts, entities, domain knowledge.
 *                   Long-lived; updated when new facts are confirmed.
 *   3. Procedural — "How to do things": learned strategies and workflows.
 *                   Updated from successful task completions.
 *
 * Integration: used by ExecutiveLoop for priorContext (replaces plain CrossSessionMemory)
 *              and by WorldModel for seeding entity knowledge.
 */

const fs = require('fs');
const path = require('path');

const DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for episodic decay

class MemoriaMulticapa {
  constructor(options = {}) {
    this._dataDir = options.dataDir || path.join(process.cwd(), 'data', 'memoria');
    this._episodic  = [];   // [{ id, userId, content, tags, ts, decayScore }]
    this._semantic  = new Map(); // key → { key, value, confidence, source, updatedAt }
    this._procedural = new Map(); // strategyKey → { key, steps, successCount, lastUsed }
    this._maxEpisodic = options.maxEpisodic || 500;
    this._loaded = false;
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  init() {
    if (this._loaded) return this;
    try {
      const ep = this._readFile('episodic.json');
      if (ep) this._episodic = ep;
      const sem = this._readFile('semantic.json');
      if (sem) sem.forEach(([k, v]) => this._semantic.set(k, v));
      const proc = this._readFile('procedural.json');
      if (proc) proc.forEach(([k, v]) => this._procedural.set(k, v));
    } catch { /* non-fatal */ }
    this._loaded = true;
    return this;
  }

  // ── Episodic memory ─────────────────────────────────────────────────────────

  recordEpisode(userId, content, tags = []) {
    const episode = {
      id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      content: typeof content === 'string' ? content.slice(0, 1000) : JSON.stringify(content).slice(0, 1000),
      tags,
      ts: Date.now(),
      decayScore: 1.0,
    };
    this._episodic.push(episode);
    if (this._episodic.length > this._maxEpisodic) {
      // Drop lowest-decayed episodes first
      this._episodic.sort((a, b) => b.decayScore - a.decayScore);
      this._episodic = this._episodic.slice(0, this._maxEpisodic);
    }
    this._persist('episodic');
    return episode;
  }

  recallEpisodic(userId, query = '', limit = 10) {
    const now = Date.now();
    // Update decay scores
    const results = this._episodic
      .filter((e) => e.userId === userId)
      .map((e) => {
        const age = now - e.ts;
        const decay = Math.exp((-age * Math.LN2) / DECAY_HALF_LIFE_MS);
        e.decayScore = decay;
        // Simple relevance: keyword match bonus
        const queryLower = query.toLowerCase();
        const relevance = queryLower && e.content.toLowerCase().includes(queryLower) ? 0.3 : 0;
        return { ...e, score: decay + relevance };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return results;
  }

  // ── Semantic memory ─────────────────────────────────────────────────────────

  /**
   * Store or update a semantic fact.
   * @param {string} key  e.g. "user:tariq:preference:language"
   * @param {any}    value
   * @param {object} opts  { confidence, source }
   */
  learnFact(key, value, { confidence = 1.0, source = 'observation' } = {}) {
    const existing = this._semantic.get(key);
    // Average confidence if fact already known
    const newConf = existing
      ? (existing.confidence + confidence) / 2
      : confidence;
    this._semantic.set(key, {
      key, value, confidence: newConf, source, updatedAt: new Date().toISOString(),
    });
    this._persist('semantic');
    return this._semantic.get(key);
  }

  recallFact(key) {
    return this._semantic.get(key) || null;
  }

  queryFacts(prefix) {
    const results = [];
    for (const [k, v] of this._semantic) {
      if (!prefix || k.startsWith(prefix)) results.push(v);
    }
    return results;
  }

  // ── Procedural memory ───────────────────────────────────────────────────────

  /**
   * Record a successful strategy for a task type.
   * @param {string} taskType  e.g. "code_task:auth_fix"
   * @param {string[]} steps   ordered steps that led to success
   */
  learnProcedure(taskType, steps, quality = 1.0) {
    const existing = this._procedural.get(taskType) || { key: taskType, steps: [], successCount: 0, quality: 0 };
    // Keep the steps from the best-quality run
    const updated = {
      key: taskType,
      steps: quality >= existing.quality ? steps : existing.steps,
      successCount: existing.successCount + 1,
      quality: Math.max(existing.quality, quality),
      lastUsed: new Date().toISOString(),
    };
    this._procedural.set(taskType, updated);
    this._persist('procedural');
    return updated;
  }

  recallProcedure(taskType) {
    return this._procedural.get(taskType) || null;
  }

  // ── Combined context ────────────────────────────────────────────────────────

  /**
   * Get a rich memory context string for a user + query.
   * Combines episodic (recent episodes), semantic (relevant facts), procedural (known strategy).
   */
  getContext(userId, query, { episodicLimit = 3, semanticPrefix = null } = {}) {
    const episodes = this.recallEpisodic(userId, query, episodicLimit);
    const facts = semanticPrefix ? this.queryFacts(semanticPrefix) : [];
    const procedure = query ? this.recallProcedure(query.split(' ').slice(0, 3).join('_').toLowerCase()) : null;

    const parts = [];
    if (episodes.length) {
      parts.push('Recent episodes:\n' + episodes.map((e) => `- ${e.content.slice(0, 150)}`).join('\n'));
    }
    if (facts.length) {
      parts.push('Known facts:\n' + facts.slice(0, 5).map((f) => `- ${f.key}: ${JSON.stringify(f.value)}`).join('\n'));
    }
    if (procedure) {
      parts.push(`Known procedure for "${procedure.key}":\n` + procedure.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n'));
    }

    return {
      context: parts.join('\n\n'),
      episodicCount: episodes.length,
      semanticCount: facts.length,
      hasProcedure: !!procedure,
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  _readFile(name) {
    try {
      const p = path.join(this._dataDir, name);
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return null;
  }

  _persist(layer) {
    try {
      if (!fs.existsSync(this._dataDir)) fs.mkdirSync(this._dataDir, { recursive: true });
      if (layer === 'episodic') {
        fs.writeFileSync(path.join(this._dataDir, 'episodic.json'), JSON.stringify(this._episodic, null, 2));
      } else if (layer === 'semantic') {
        fs.writeFileSync(path.join(this._dataDir, 'semantic.json'), JSON.stringify(Array.from(this._semantic.entries()), null, 2));
      } else if (layer === 'procedural') {
        fs.writeFileSync(path.join(this._dataDir, 'procedural.json'), JSON.stringify(Array.from(this._procedural.entries()), null, 2));
      }
    } catch { /* non-fatal */ }
  }

  getStats() {
    return {
      episodicCount: this._episodic.length,
      semanticFactCount: this._semantic.size,
      proceduralStrategyCount: this._procedural.size,
    };
  }
}

// Singleton
let _instance = null;
function getMemoriaMulticapa(options) {
  if (!_instance) _instance = new MemoriaMulticapa(options).init();
  return _instance;
}

module.exports = { MemoriaMulticapa, getMemoriaMulticapa };
