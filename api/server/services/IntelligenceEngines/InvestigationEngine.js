'use strict';

/**
 * InvestigationEngine — Face 7.
 * Multi-step investigation orchestration: hypothesis → evidence → conclusion.
 * Each investigation has steps, sources, evidence items, and a verdict.
 */

const STATUSES = ['open', 'in_progress', 'pending_review', 'closed', 'inconclusive'];

class InvestigationEngine {
  constructor({ id, title, hypothesis, subject } = {}) {
    this.id = id || `inv_${Date.now()}`;
    this.title = title || 'Untitled Investigation';
    this.hypothesis = hypothesis || '';
    this.subject = subject || '';
    this.status = 'open';
    this.steps = [];
    this.evidence = [];
    this.sources = [];
    this.verdict = null;
    this.created_at = new Date().toISOString();
    this.updated_at = new Date().toISOString();
  }

  addStep({ title, description, type = 'analysis', result = null, confidence = null }) {
    const step = {
      id: `step_${this.steps.length + 1}`,
      title,
      description: description || '',
      type,
      result,
      confidence,
      completed: result !== null,
      added_at: new Date().toISOString(),
    };
    this.steps.push(step);
    this._touch();
    return step;
  }

  completeStep(stepId, result, confidence = 0.5) {
    const step = this.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);
    step.result = result;
    step.confidence = confidence;
    step.completed = true;
    step.completed_at = new Date().toISOString();
    this._touch();
    return step;
  }

  addEvidence({ content, source, type = 'document', confidence = 0.5, supports_hypothesis = null, tags = [] }) {
    const item = {
      id: `ev_${this.evidence.length + 1}`,
      content,
      source: source || 'unknown',
      type,
      confidence: Math.min(Math.max(confidence, 0), 1),
      supports_hypothesis,
      tags,
      added_at: new Date().toISOString(),
    };
    this.evidence.push(item);
    if (source && !this.sources.includes(source)) this.sources.push(source);
    this._touch();
    return item;
  }

  setVerdict({ conclusion, confidence, reasoning, status = 'closed' }) {
    if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
    this.verdict = { conclusion, confidence, reasoning, set_at: new Date().toISOString() };
    this.status = status;
    this._touch();
    return this.verdict;
  }

  getEvidenceSummary() {
    const supporting = this.evidence.filter((e) => e.supports_hypothesis === true).length;
    const contradicting = this.evidence.filter((e) => e.supports_hypothesis === false).length;
    const neutral = this.evidence.filter((e) => e.supports_hypothesis === null).length;
    const avgConf = this.evidence.length ? this.evidence.reduce((s, e) => s + e.confidence, 0) / this.evidence.length : 0;
    return { total: this.evidence.length, supporting, contradicting, neutral, avg_confidence: avgConf };
  }

  getProgress() {
    const total = this.steps.length;
    const done = this.steps.filter((s) => s.completed).length;
    return { total_steps: total, completed: done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      hypothesis: this.hypothesis,
      subject: this.subject,
      status: this.status,
      progress: this.getProgress(),
      evidence_summary: this.getEvidenceSummary(),
      verdict: this.verdict,
      source_count: this.sources.length,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  _touch() {
    this.updated_at = new Date().toISOString();
  }
}

const _investigations = new Map();

function create(opts) {
  const inv = new InvestigationEngine(opts);
  _investigations.set(inv.id, inv);
  return inv;
}

function get(id) { return _investigations.get(id) || null; }
function list() { return Array.from(_investigations.values()).map((i) => i.toJSON()); }
function remove(id) { return _investigations.delete(id); }

module.exports = { InvestigationEngine, create, get, list, remove };
