'use strict';

/**
 * DisputePlatform — Face 19-20.
 * Structured dispute and evidence platform for digital reputation management.
 * Handles claims, disputes, responses, and resolution tracking.
 */

const DISPUTE_STATUSES = ['open', 'under_review', 'evidence_requested', 'resolved', 'closed', 'escalated'];
const DISPUTE_TYPES = ['false_claim', 'defamation', 'misinformation', 'outdated_info', 'context_missing', 'other'];

class DisputePlatform {
  constructor() {
    this._disputes = new Map();
    this._stats = { total: 0, resolved: 0, open: 0 };
  }

  create({ title, description, subject_id, subject_name, type = 'false_claim', priority = 'medium', evidence_urls = [], metadata = {} }) {
    if (!DISPUTE_TYPES.includes(type)) throw new Error(`Invalid dispute type: ${type}`);
    const id = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dispute = {
      id,
      title,
      description,
      subject_id: subject_id || null,
      subject_name: subject_name || '',
      type,
      priority,
      status: 'open',
      evidence_urls: Array.isArray(evidence_urls) ? evidence_urls : [],
      evidence_items: [],
      responses: [],
      resolution: null,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this._disputes.set(id, dispute);
    this._stats.total++;
    this._stats.open++;
    return dispute;
  }

  addEvidence(disputeId, { content, type = 'document', url = null, source = null, confidence = 0.5 }) {
    const dispute = this._get(disputeId);
    const item = {
      id: `ev_${dispute.evidence_items.length + 1}`,
      content,
      type,
      url,
      source,
      confidence,
      added_at: new Date().toISOString(),
    };
    dispute.evidence_items.push(item);
    dispute.updated_at = new Date().toISOString();
    return item;
  }

  addResponse(disputeId, { content, author = 'system', is_official = false }) {
    const dispute = this._get(disputeId);
    const response = {
      id: `resp_${dispute.responses.length + 1}`,
      content,
      author,
      is_official,
      added_at: new Date().toISOString(),
    };
    dispute.responses.push(response);
    dispute.updated_at = new Date().toISOString();
    return response;
  }

  updateStatus(disputeId, status, notes = null) {
    if (!DISPUTE_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
    const dispute = this._get(disputeId);
    const oldStatus = dispute.status;
    dispute.status = status;
    dispute.updated_at = new Date().toISOString();
    if (status === 'resolved' || status === 'closed') {
      this._stats.resolved++;
      if (oldStatus === 'open') this._stats.open = Math.max(0, this._stats.open - 1);
      if (notes) dispute.resolution = { notes, resolved_at: new Date().toISOString() };
    }
    return dispute;
  }

  get(id) { return this._disputes.get(id) || null; }

  list(filters = {}) {
    let items = Array.from(this._disputes.values());
    if (filters.status) items = items.filter((d) => d.status === filters.status);
    if (filters.type) items = items.filter((d) => d.type === filters.type);
    if (filters.subject_id) items = items.filter((d) => d.subject_id === filters.subject_id);
    return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  getStats() {
    return { ...this._stats };
  }

  _get(id) {
    const d = this._disputes.get(id);
    if (!d) throw new Error(`Dispute not found: ${id}`);
    return d;
  }
}

let _instance = null;
function getDisputePlatform() {
  if (!_instance) _instance = new DisputePlatform();
  return _instance;
}

module.exports = { DisputePlatform, getDisputePlatform, DISPUTE_STATUSES, DISPUTE_TYPES };
