/**
 * DiffApprovalService — proposes file changes as diffs and tracks approval
 * state before applying them. Mirrors Claude Code / Cursor / Copilot
 * "approve before apply" UX. The frontend renders the diff; this service
 * stores the proposal and its state.
 *
 * State machine: pending → approved | rejected | applied
 */

const crypto = require('crypto');
const fs = require('fs');

const proposals = new Map();

/**
 * Propose a diff for a file change.
 * @param {object} ctx { toolName, filePath, oldContent, newContent, description }
 * @returns {{ id: string, status: string, diff: string }}
 */
function propose(ctx) {
  if (!ctx || !ctx.filePath) {
    return { error: 'filePath required' };
  }
  const id = crypto.randomUUID();
  const diff = computeDiff(ctx.filePath, ctx.oldContent, ctx.newContent);
  const proposal = {
    id,
    toolName: ctx.toolName || 'unknown',
    filePath: ctx.filePath,
    description: ctx.description || '',
    oldContent: ctx.oldContent || '',
    newContent: ctx.newContent || '',
    diff,
    status: 'pending',
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  proposals.set(id, proposal);
  return { id, status: 'pending', diff };
}

/**
 * Compute a simple unified diff.
 * @param {string} filePath
 * @param {string} oldContent
 * @param {string} newContent
 * @returns {string}
 */
function computeDiff(filePath, oldContent, newContent) {
  const oldLines = (oldContent || '').split('\n');
  const newLines = (newContent || '').split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  const diffLines = [`--- a/${filePath}`, `+++ b/${filePath}`];
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      diffLines.push(` ${o || ''}`);
    } else {
      if (o !== undefined) diffLines.push(`-${o}`);
      if (n !== undefined) diffLines.push(`+${n}`);
    }
  }
  return diffLines.join('\n');
}

/**
 * Approve a proposed diff.
 * @param {string} id
 * @param {object} opts { decidedBy }
 * @returns {{success: boolean, applied: boolean, error?: string}}
 */
function approve(id, opts = {}) {
  const p = proposals.get(id);
  if (!p) return { success: false, error: 'proposal not found' };
  if (p.status !== 'pending') {
    return { success: false, error: `proposal already ${p.status}` };
  }
  p.status = 'approved';
  p.decidedAt = new Date().toISOString();
  p.decidedBy = opts.decidedBy || 'user';
  return { success: true, applied: false };
}

/**
 * Reject a proposed diff.
 * @param {string} id
 * @param {object} opts { decidedBy, reason }
 */
function reject(id, opts = {}) {
  const p = proposals.get(id);
  if (!p) return { success: false, error: 'proposal not found' };
  if (p.status !== 'pending') {
    return { success: false, error: `proposal already ${p.status}` };
  }
  p.status = 'rejected';
  p.decidedAt = new Date().toISOString();
  p.decidedBy = opts.decidedBy || 'user';
  p.rejectReason = opts.reason || '';
  return { success: true };
}

/**
 * Apply an approved diff to the filesystem.
 * @param {string} id
 * @returns {{success: boolean, error?: string}}
 */
function apply(id) {
  const p = proposals.get(id);
  if (!p) return { success: false, error: 'proposal not found' };
  if (p.status !== 'approved') {
    return { success: false, error: `proposal must be approved first (current: ${p.status})` };
  }
  try {
    fs.writeFileSync(p.filePath, p.newContent);
    p.status = 'applied';
    p.appliedAt = new Date().toISOString();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get a proposal by ID.
 * @param {string} id
 * @returns {object|null}
 */
function get(id) {
  return proposals.get(id) || null;
}

/**
 * List all pending proposals.
 * @returns {object[]}
 */
function listPending() {
  return Array.from(proposals.values()).filter((p) => p.status === 'pending');
}

/**
 * List all proposals (with optional status filter).
 * @param {string} status
 * @returns {object[]}
 */
function list(status) {
  const all = Array.from(proposals.values());
  if (status) return all.filter((p) => p.status === status);
  return all;
}

/**
 * Clear applied/rejected proposals older than maxAgeMs.
 * @param {number} maxAgeMs
 */
function cleanup(maxAgeMs = 3600000) {
  const now = Date.now();
  for (const [id, p] of proposals) {
    if (p.status === 'applied' || p.status === 'rejected') {
      const age = now - new Date(p.decidedAt || p.createdAt).getTime();
      if (age > maxAgeMs) {
        proposals.delete(id);
      }
    }
  }
}

module.exports = {
  propose,
  approve,
  reject,
  apply,
  get,
  listPending,
  list,
  cleanup,
  computeDiff,
};
