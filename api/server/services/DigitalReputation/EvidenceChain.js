'use strict';

/**
 * EvidenceChain — Face 19-20.
 * Builds and verifies chains of evidence for reputation claims.
 * Evidence items are linked with provenance, cryptographic hashes, and confidence scores.
 * Chains can be verified to detect tampering or broken links.
 */

const crypto = require('crypto');

function hashItem(item) {
  const str = JSON.stringify({ content: item.content, source: item.source, timestamp: item.timestamp });
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 40);
}

class EvidenceChain {
  constructor({ id, claim, subject_id = null } = {}) {
    this.id = id || `ec_${Date.now()}`;
    this.claim = claim || '';
    this.subject_id = subject_id;
    this.items = [];
    this.links = [];
    this.verification_status = 'unverified';
    this.created_at = new Date().toISOString();
    this.updated_at = new Date().toISOString();
  }

  addItem({ content, source, type = 'document', url = null, timestamp = null, confidence = 0.5, metadata = {} }) {
    const ts = timestamp || new Date().toISOString();
    const prevHash = this.items.length > 0 ? this.items[this.items.length - 1].hash : '0'.repeat(40);
    const item = {
      seq: this.items.length,
      content,
      source,
      type,
      url,
      timestamp: ts,
      confidence: Math.min(Math.max(confidence, 0), 1),
      metadata,
      prev_hash: prevHash,
      added_at: new Date().toISOString(),
    };
    item.hash = hashItem(item);
    item.chain_hash = crypto.createHash('sha256').update(prevHash + item.hash).digest('hex').substring(0, 40);
    this.items.push(item);
    this.verification_status = 'unverified';
    this.updated_at = new Date().toISOString();
    return item;
  }

  linkChain(otherChainId, relationship = 'supports') {
    const link = { chain_id: otherChainId, relationship, linked_at: new Date().toISOString() };
    this.links.push(link);
    return link;
  }

  /**
   * Verify the integrity of the chain (checks hash chain is unbroken).
   */
  verify() {
    if (!this.items.length) {
      this.verification_status = 'empty';
      return { valid: true, status: 'empty', issues: [] };
    }

    const issues = [];
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const recomputed = hashItem(item);
      if (recomputed !== item.hash) {
        issues.push({ seq: i, issue: 'hash_mismatch', expected: item.hash, got: recomputed });
      }
      if (i > 0) {
        const prev = this.items[i - 1];
        if (item.prev_hash !== prev.hash) {
          issues.push({ seq: i, issue: 'broken_link', expected_prev: prev.hash, got_prev: item.prev_hash });
        }
      }
    }

    this.verification_status = issues.length === 0 ? 'verified' : 'tampered';
    const result = { valid: issues.length === 0, status: this.verification_status, issues, item_count: this.items.length };
    this.updated_at = new Date().toISOString();
    return result;
  }

  getStrength() {
    if (!this.items.length) return 0;
    const avgConf = this.items.reduce((s, i) => s + i.confidence, 0) / this.items.length;
    const sourceDiversity = new Set(this.items.map((i) => i.source)).size / this.items.length;
    const lengthFactor = Math.min(this.items.length / 5, 1);
    return Math.round((avgConf * 0.5 + sourceDiversity * 0.3 + lengthFactor * 0.2) * 100);
  }

  toJSON() {
    return {
      id: this.id,
      claim: this.claim,
      subject_id: this.subject_id,
      item_count: this.items.length,
      verification_status: this.verification_status,
      chain_strength: this.getStrength(),
      linked_chains: this.links.length,
      created_at: this.created_at,
      updated_at: this.updated_at,
      items: this.items,
      links: this.links,
    };
  }
}

const _chains = new Map();

function createChain(opts) {
  const ec = new EvidenceChain(opts);
  _chains.set(ec.id, ec);
  return ec;
}

function getChain(id) { return _chains.get(id) || null; }
function listChains() { return Array.from(_chains.values()).map((c) => ({ id: c.id, claim: c.claim, subject_id: c.subject_id, item_count: c.items.length, strength: c.getStrength(), status: c.verification_status })); }
function deleteChain(id) { return _chains.delete(id); }

module.exports = { EvidenceChain, createChain, getChain, listChains, deleteChain };
