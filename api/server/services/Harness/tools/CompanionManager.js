/**
 * CompanionManager — Persistent AI Personas
 * Equivalent to Grok Companions
 * 
 * License: MIT — Zero cost, custom implementation
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class CompanionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dataPath = options.dataPath || path.join(process.cwd(), 'data', 'companions.json');
    this.companions = new Map();
    this.initialized = false;
    this.stats = { created: 0, chats: 0 };
  }

  initialize() {
    this._load();
    this.initialized = true;
    return { status: 'ok', module: 'CompanionManager', count: this.companions.size };
  }

  /**
   * Create a companion persona
   */
  create({ name, personality, description, systemPrompt, avatar, traits = [], expertise = [], memory = {} }) {
    const id = `companion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const companion = {
      id, name, personality, description,
      systemPrompt: systemPrompt || `Eres ${name}. ${personality || ''}`,
      avatar: avatar || '🤖',
      traits, expertise,
      memory: {
        facts: memory.facts || [],
        preferences: memory.preferences || [],
        conversations: memory.conversations || 0,
        lastInteraction: null
      },
      stats: { totalMessages: 0, avgResponseTime: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.companions.set(id, companion);
    this.stats.created++;
    this._save();
    this.emit('companion:created', { id, name });
    return companion;
  }

  /**
   * Get companion context for a conversation
   */
  getContext(companionId) {
    const c = this.companions.get(companionId);
    if (!c) return null;
    return {
      systemPrompt: c.systemPrompt,
      personality: c.personality,
      traits: c.traits,
      expertise: c.expertise,
      recentFacts: c.memory.facts.slice(-20)
    };
  }

  /**
   * Record a fact learned by the companion
   */
  addFact(companionId, fact) {
    const c = this.companions.get(companionId);
    if (!c) return false;
    c.memory.facts.push({ text: fact, timestamp: new Date().toISOString() });
    if (c.memory.facts.length > 500) c.memory.facts = c.memory.facts.slice(-500);
    this._save();
    return true;
  }

  /**
   * List all companions
   */
  list() {
    return Array.from(this.companions.values());
  }

  /**
   * Get companion by ID
   */
  get(companionId) {
    return this.companions.get(companionId) || null;
  }

  /**
   * Delete companion
   */
  delete(companionId) {
    const deleted = this.companions.delete(companionId);
    if (deleted) this._save();
    return deleted;
  }

  getStats() {
    return { ...this.stats, totalCompanions: this.companions.size };
  }

  _load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
        for (const [id, c] of Object.entries(data)) this.companions.set(id, c);
      }
    } catch (e) { /* ignore */ }
  }

  _save() {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = Object.fromEntries(this.companions);
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (e) { /* ignore */ }
  }

  async saveAsync() {
    const fsp = require('fs').promises;
    const dir = path.dirname(this.dataPath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(this.dataPath, JSON.stringify(Object.fromEntries(this.companions), null, 2));
    return { saved: this.companions.size };
  }

  async loadAsync() {
    const fsp = require('fs').promises;
    try {
      const raw = await fsp.readFile(this.dataPath, 'utf8');
      const data = JSON.parse(raw);
      for (const [id, c] of Object.entries(data)) this.companions.set(id, c);
      return { loaded: this.companions.size };
    } catch {
      return { loaded: 0 };
    }
  }

  async exportCompanion(companionId) {
    const companion = this.companions.get(companionId);
    if (!companion) return null;
    return { ...companion, exportedAt: new Date().toISOString() };
  }
}

module.exports = CompanionManager;
