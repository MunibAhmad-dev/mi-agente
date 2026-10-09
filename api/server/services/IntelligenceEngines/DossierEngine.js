'use strict';

/**
 * DossierEngine — Face 7.
 * Entity profile builder. Creates structured dossiers for people, organizations, or topics.
 * Aggregates attributes, relationships, events, and notes from multiple sources.
 */

const ENTITY_TYPES = ['person', 'organization', 'topic', 'location', 'product', 'event'];

class Dossier {
  constructor({ id, type = 'person', name, aliases = [] } = {}) {
    if (!ENTITY_TYPES.includes(type)) throw new Error(`Invalid entity type: ${type}`);
    this.id = id || `dossier_${Date.now()}`;
    this.type = type;
    this.name = name || 'Unknown';
    this.aliases = Array.isArray(aliases) ? aliases : [];
    this.attributes = {};
    this.relationships = [];
    this.timeline_events = [];
    this.sources = [];
    this.notes = [];
    this.tags = [];
    this.confidence_score = 0;
    this.created_at = new Date().toISOString();
    this.updated_at = new Date().toISOString();
  }

  setAttribute(key, value, source = null, confidence = 0.5) {
    this.attributes[key] = { value, source, confidence, set_at: new Date().toISOString() };
    if (source) this._addSource(source);
    this._updateConfidence();
    this._touch();
    return this.attributes[key];
  }

  addRelationship({ target_id, target_name, relationship_type, strength = 0.5, bidirectional = false, source = null }) {
    const rel = {
      id: `rel_${this.relationships.length + 1}`,
      target_id,
      target_name,
      relationship_type,
      strength: Math.min(Math.max(strength, 0), 1),
      bidirectional,
      source,
      added_at: new Date().toISOString(),
    };
    this.relationships.push(rel);
    if (source) this._addSource(source);
    this._touch();
    return rel;
  }

  addTimelineEvent({ timestamp, title, description, source, confidence = 0.5 }) {
    const ev = {
      id: `tev_${this.timeline_events.length + 1}`,
      timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      title,
      description: description || '',
      source: source || 'unknown',
      confidence,
    };
    this.timeline_events.push(ev);
    this.timeline_events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (source) this._addSource(source);
    this._touch();
    return ev;
  }

  addNote(content, author = 'system') {
    const note = { id: `note_${this.notes.length + 1}`, content, author, added_at: new Date().toISOString() };
    this.notes.push(note);
    this._touch();
    return note;
  }

  addTag(tag) {
    if (!this.tags.includes(tag)) this.tags.push(tag);
    this._touch();
    return this.tags;
  }

  getSummary() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      aliases: this.aliases,
      attribute_count: Object.keys(this.attributes).length,
      relationship_count: this.relationships.length,
      event_count: this.timeline_events.length,
      source_count: this.sources.length,
      note_count: this.notes.length,
      tags: this.tags,
      confidence_score: this.confidence_score,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  toJSON() {
    return {
      ...this.getSummary(),
      attributes: this.attributes,
      relationships: this.relationships,
      timeline_events: this.timeline_events,
      sources: this.sources,
      notes: this.notes,
    };
  }

  _addSource(src) {
    if (src && !this.sources.includes(src)) this.sources.push(src);
  }

  _updateConfidence() {
    const vals = Object.values(this.attributes).map((a) => a.confidence);
    this.confidence_score = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }

  _touch() {
    this.updated_at = new Date().toISOString();
  }
}

const _dossiers = new Map();

function create(opts) {
  const d = new Dossier(opts);
  _dossiers.set(d.id, d);
  return d;
}

function get(id) { return _dossiers.get(id) || null; }
function findByName(name) {
  const lower = name.toLowerCase();
  return Array.from(_dossiers.values()).filter(
    (d) => d.name.toLowerCase().includes(lower) || d.aliases.some((a) => a.toLowerCase().includes(lower)),
  );
}
function list() { return Array.from(_dossiers.values()).map((d) => d.getSummary()); }
function remove(id) { return _dossiers.delete(id); }

module.exports = { Dossier, create, get, findByName, list, remove, ENTITY_TYPES };
