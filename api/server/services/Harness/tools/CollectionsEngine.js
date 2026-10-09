/**
 * CollectionsEngine — Curated Document Collections Search
 * Equivalent to Grok Collections Search (free, local, no API)
 * 
 * License: MIT — Zero cost, local implementation
 */

const path = require('path');
const fs = require('fs');

class CollectionsEngine {
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.join(process.cwd(), 'data', 'collections.json');
    this.collections = new Map();
    this.initialized = false;
    this.stats = { searches: 0, collections: 0, documents: 0 };
  }

  initialize() {
    this._load();
    this.initialized = true;
    const docCount = Array.from(this.collections.values()).reduce((s, c) => s + (c.documents?.length || 0), 0);
    this.stats.documents = docCount;
    return { status: 'ok', module: 'CollectionsEngine', collections: this.collections.size, documents: docCount };
  }

  /**
   * Create a collection
   */
  create({ name, description, tags = [], documents = [] }) {
    const id = `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const collection = {
      id, name, description, tags, documents,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.collections.set(id, collection);
    this.stats.collections++;
    this._save();
    return collection;
  }

  /**
   * Add document to collection
   */
  addDocument(collectionId, { title, content, source, metadata = {} }) {
    const col = this.collections.get(collectionId);
    if (!col) return null;
    const doc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title, content, source, metadata,
      addedAt: new Date().toISOString()
    };
    col.documents.push(doc);
    col.updatedAt = new Date().toISOString();
    this.stats.documents++;
    this._save();
    return doc;
  }

  /**
   * Search across collections
   */
  search(query, { collectionId, tags, limit = 20 } = {}) {
    this.stats.searches++;
    let cols = Array.from(this.collections.values());
    if (collectionId) cols = cols.filter(c => c.id === collectionId);
    if (tags) cols = cols.filter(c => tags.some(t => c.tags.includes(t)));

    const results = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    for (const col of cols) {
      for (const doc of col.documents || []) {
        const text = `${doc.title || ''} ${doc.content || ''}`.toLowerCase();
        let score = 0;
        for (const word of queryWords) {
          if (text.includes(word)) score++;
        }
        if (score > 0) {
          results.push({
            ...doc,
            collectionId: col.id,
            collectionName: col.name,
            score,
            matchCount: score
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * List collections
   */
  list() {
    return Array.from(this.collections.values()).map(c => ({
      id: c.id, name: c.name, description: c.description,
      tags: c.tags, documentCount: c.documents?.length || 0,
      createdAt: c.createdAt
    }));
  }

  /**
   * Auto-index content from RAG/Knowledge base
   */
  indexFromKnowledgeBase(knowledgeItems = []) {
    let indexed = 0;
    for (const item of knowledgeItems) {
      let col = Array.from(this.collections.values()).find(c => c.name === (item.category || 'General'));
      if (!col) {
        col = this.create({ name: item.category || 'General', description: `Auto-indexed from knowledge base`, tags: ['auto-indexed'] });
      }
      this.addDocument(col.id, { title: item.title, content: item.content, source: item.source, metadata: item.metadata });
      indexed++;
    }
    return { indexed };
  }

  getStats() {
    const docCount = Array.from(this.collections.values()).reduce((s, c) => s + (c.documents?.length || 0), 0);
    return { ...this.stats, documents: docCount, collections: this.collections.size };
  }

  _load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
        for (const [id, c] of Object.entries(data)) this.collections.set(id, c);
      }
    } catch (e) { /* ignore */ }
  }

  _save() {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataPath, JSON.stringify(Object.fromEntries(this.collections), null, 2));
    } catch (e) { /* ignore */ }
  }

  async saveAsync() {
    const fsp = require('fs').promises;
    const dir = path.dirname(this.dataPath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(this.dataPath, JSON.stringify(Object.fromEntries(this.collections), null, 2));
    return { saved: this.collections.size };
  }

  async loadAsync() {
    const fsp = require('fs').promises;
    try {
      const raw = await fsp.readFile(this.dataPath, 'utf8');
      const data = JSON.parse(raw);
      for (const [id, c] of Object.entries(data)) this.collections.set(id, c);
      return { loaded: this.collections.size };
    } catch {
      return { loaded: 0 };
    }
  }

  async exportCollection(collectionId) {
    const col = this.collections.get(collectionId);
    if (!col) return null;
    return { ...col, documents: col.documents || [], exportedAt: new Date().toISOString() };
  }
}

module.exports = CollectionsEngine;
