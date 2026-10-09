'use strict';

/**
 * TimelineEngine — Face 7.
 * Tracks and reconstructs sequences of events for an investigation or subject.
 * Events have timestamps, sources, confidence levels, and can be queried by range.
 */

class TimelineEngine {
  constructor(id) {
    this.id = id || `tl_${Date.now()}`;
    this.events = [];
    this.created_at = new Date().toISOString();
  }

  addEvent({ timestamp, title, description, source, confidence = 0.5, tags = [], metadata = {} }) {
    if (!title) throw new Error('Event requires title');
    const ts = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
    const event = {
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: ts,
      title,
      description: description || '',
      source: source || 'unknown',
      confidence: Math.min(Math.max(confidence, 0), 1),
      tags: Array.isArray(tags) ? tags : [],
      metadata,
      added_at: new Date().toISOString(),
    };
    this.events.push(event);
    this.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return event;
  }

  getRange(from, to) {
    const fromTs = from ? new Date(from).getTime() : 0;
    const toTs = to ? new Date(to).getTime() : Infinity;
    return this.events.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= fromTs && t <= toTs;
    });
  }

  getByTag(tag) {
    return this.events.filter((e) => e.tags.includes(tag));
  }

  getBySource(source) {
    return this.events.filter((e) => e.source === source);
  }

  getContradictions() {
    const contradictions = [];
    for (let i = 0; i < this.events.length; i++) {
      for (let j = i + 1; j < this.events.length; j++) {
        const a = this.events[i], b = this.events[j];
        const sameTime = Math.abs(new Date(a.timestamp) - new Date(b.timestamp)) < 60000;
        const differentSources = a.source !== b.source;
        const possibleConflict = a.tags.some((t) => b.tags.includes(t));
        if (sameTime && differentSources && possibleConflict) {
          contradictions.push({ event_a: a.id, event_b: b.id, reason: 'concurrent_conflicting_events', events: [a, b] });
        }
      }
    }
    return contradictions;
  }

  getSummary() {
    if (!this.events.length) return { timeline_id: this.id, event_count: 0, span: null };
    return {
      timeline_id: this.id,
      event_count: this.events.length,
      earliest: this.events[0].timestamp,
      latest: this.events[this.events.length - 1].timestamp,
      sources: [...new Set(this.events.map((e) => e.source))],
      tags: [...new Set(this.events.flatMap((e) => e.tags))],
      avg_confidence: this.events.reduce((s, e) => s + e.confidence, 0) / this.events.length,
    };
  }

  export() {
    return { id: this.id, created_at: this.created_at, events: this.events, summary: this.getSummary() };
  }
}

const _timelines = new Map();

function createTimeline(id) {
  const tl = new TimelineEngine(id);
  _timelines.set(tl.id, tl);
  return tl;
}

function getTimeline(id) {
  return _timelines.get(id) || null;
}

function listTimelines() {
  return Array.from(_timelines.values()).map((t) => t.getSummary());
}

function deleteTimeline(id) {
  return _timelines.delete(id);
}

module.exports = { TimelineEngine, createTimeline, getTimeline, listTimelines, deleteTimeline };
