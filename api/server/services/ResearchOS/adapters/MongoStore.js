'use strict';

/**
 * MongoStore adapter — Face 10.
 * Replaces ResearchOS's JSON file store with a proper MongoDB store.
 * Provides the same interface as the existing store.js in ResearchOS/core/.
 */

let mongoose;
try { mongoose = require('mongoose'); } catch { mongoose = null; }

const SCHEMA = new (mongoose ? mongoose.Schema : function Schema(d) { this.definition = d; })({
  type: { type: String, required: true, index: true },
  key: { type: String, required: true, index: true },
  data: { type: mongoose.Schema ? mongoose.Schema.Types.Mixed : Object },
  metadata: { type: mongoose.Schema ? mongoose.Schema.Types.Mixed : Object },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

let ResearchEntry;
if (mongoose && mongoose.models) {
  ResearchEntry = mongoose.models.ResearchEntry || mongoose.model('ResearchEntry', SCHEMA);
}

class MongoStore {
  constructor() {
    this._memory = new Map();
    this._useMongo = !!(mongoose && ResearchEntry);
  }

  async set(type, key, data, metadata = {}) {
    const id = `${type}:${key}`;
    if (this._useMongo) {
      await ResearchEntry.findOneAndUpdate(
        { type, key },
        { type, key, data, metadata, updated_at: new Date() },
        { upsert: true, new: true },
      );
    } else {
      this._memory.set(id, { type, key, data, metadata, created_at: new Date(), updated_at: new Date() });
    }
    return { type, key };
  }

  async get(type, key) {
    if (this._useMongo) {
      const doc = await ResearchEntry.findOne({ type, key }).lean();
      return doc ? doc.data : null;
    }
    const entry = this._memory.get(`${type}:${key}`);
    return entry ? entry.data : null;
  }

  async delete(type, key) {
    if (this._useMongo) {
      await ResearchEntry.deleteOne({ type, key });
    } else {
      this._memory.delete(`${type}:${key}`);
    }
    return true;
  }

  async list(type, opts = {}) {
    if (this._useMongo) {
      const query = { type };
      const docs = await ResearchEntry.find(query).sort({ updated_at: -1 }).limit(opts.limit || 100).lean();
      return docs.map((d) => ({ key: d.key, data: d.data, metadata: d.metadata, updated_at: d.updated_at }));
    }
    return Array.from(this._memory.values())
      .filter((e) => e.type === type)
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, opts.limit || 100);
  }

  async exists(type, key) {
    if (this._useMongo) {
      return !!(await ResearchEntry.exists({ type, key }));
    }
    return this._memory.has(`${type}:${key}`);
  }

  async count(type) {
    if (this._useMongo) {
      return ResearchEntry.countDocuments({ type });
    }
    return Array.from(this._memory.values()).filter((e) => e.type === type).length;
  }

  isMongoConnected() { return this._useMongo; }
}

let _instance = null;
function getMongoStore() {
  if (!_instance) _instance = new MongoStore();
  return _instance;
}

module.exports = { MongoStore, getMongoStore };
