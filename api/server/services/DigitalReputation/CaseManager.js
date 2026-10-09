'use strict';

/**
 * CaseManager — Face 19-20.
 * Case management system for digital reputation incidents.
 * A case groups related disputes, alerts, and evidence into one tracked unit.
 */

const CASE_STATUSES = ['new', 'active', 'monitoring', 'resolved', 'closed', 'archived'];
const CASE_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

class CaseManager {
  constructor() {
    this._cases = new Map();
    this._stats = { total: 0, open: 0, resolved: 0 };
  }

  create({ title, description, subject_id, subject_name, priority = 'medium', assigned_to = null, tags = [] }) {
    const id = `case_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const kase = {
      id,
      title,
      description: description || '',
      subject_id: subject_id || null,
      subject_name: subject_name || '',
      priority,
      status: 'new',
      assigned_to,
      tags,
      dispute_ids: [],
      alert_ids: [],
      evidence_chain_ids: [],
      notes: [],
      timeline: [{ action: 'created', ts: new Date().toISOString(), by: assigned_to || 'system' }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this._cases.set(id, kase);
    this._stats.total++;
    this._stats.open++;
    return kase;
  }

  get(id) { return this._cases.get(id) || null; }

  list(filters = {}) {
    let items = Array.from(this._cases.values());
    if (filters.status) items = items.filter((c) => c.status === filters.status);
    if (filters.priority) items = items.filter((c) => c.priority === filters.priority);
    if (filters.subject_id) items = items.filter((c) => c.subject_id === filters.subject_id);
    if (filters.assigned_to) items = items.filter((c) => c.assigned_to === filters.assigned_to);
    return items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  updateStatus(id, status, note = null, by = 'system') {
    if (!CASE_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
    const kase = this._getOrThrow(id);
    const oldStatus = kase.status;
    kase.status = status;
    kase.timeline.push({ action: `status_changed:${oldStatus}→${status}`, note, ts: new Date().toISOString(), by });
    kase.updated_at = new Date().toISOString();
    if ((status === 'resolved' || status === 'closed') && ['new', 'active', 'monitoring'].includes(oldStatus)) {
      this._stats.open = Math.max(0, this._stats.open - 1);
      this._stats.resolved++;
    }
    return kase;
  }

  assignTo(id, assignee) {
    const kase = this._getOrThrow(id);
    kase.assigned_to = assignee;
    kase.timeline.push({ action: `assigned_to:${assignee}`, ts: new Date().toISOString(), by: 'system' });
    kase.updated_at = new Date().toISOString();
    return kase;
  }

  linkDispute(caseId, disputeId) {
    const kase = this._getOrThrow(caseId);
    if (!kase.dispute_ids.includes(disputeId)) kase.dispute_ids.push(disputeId);
    kase.updated_at = new Date().toISOString();
    return kase;
  }

  linkAlert(caseId, alertId) {
    const kase = this._getOrThrow(caseId);
    if (!kase.alert_ids.includes(alertId)) kase.alert_ids.push(alertId);
    kase.updated_at = new Date().toISOString();
    return kase;
  }

  addNote(caseId, { content, author = 'system', internal = true }) {
    const kase = this._getOrThrow(caseId);
    const note = { id: `note_${kase.notes.length + 1}`, content, author, internal, added_at: new Date().toISOString() };
    kase.notes.push(note);
    kase.updated_at = new Date().toISOString();
    return note;
  }

  setPriority(caseId, priority) {
    if (!CASE_PRIORITIES.includes(priority)) throw new Error(`Invalid priority: ${priority}`);
    const kase = this._getOrThrow(caseId);
    kase.priority = priority;
    kase.updated_at = new Date().toISOString();
    return kase;
  }

  getStats() { return { ...this._stats }; }

  _getOrThrow(id) {
    const c = this._cases.get(id);
    if (!c) throw new Error(`Case not found: ${id}`);
    return c;
  }
}

let _instance = null;
function getCaseManager() {
  if (!_instance) _instance = new CaseManager();
  return _instance;
}

module.exports = { CaseManager, getCaseManager, CASE_STATUSES, CASE_PRIORITIES };
