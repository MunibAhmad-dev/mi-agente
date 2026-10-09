'use strict';

/**
 * PolicyEngine — unified action-authorization service.
 *
 * This is the top-level facade that harness.js (and any other route) requires
 * at `~/server/services/PolicyEngine`. It adapts the lower-level
 * Harness/tools/PolicyEngine (which has checkToolPermission / checkNetworkAccess /
 * checkFileAccess / checkCommand) to the `isAllowed({ principal, action, resource })`
 * contract that harness.js uses.
 *
 * Action vocabulary:
 *   harness:run-command    — execute a shell command in the sandbox
 *   harness:apply-diff     — write file changes from an approved diff
 *   harness:issue-to-pr    — create a PR via the GitHub API
 *   harness:ingest-web     — fetch external URLs and write to RAG
 *   harness:worktree       — isolate a subagent in a new git worktree
 *   harness:scaffold       — create or resume a harness session
 *   harness:register-goal  — register a long-running agent goal
 *   harness:checkpoint     — persist session state
 *   harness:resume         — reload a checkpointed session
 *   (any other string)     — checked as a tool-permission name
 */

const HarnessPE = require('./Harness/tools/PolicyEngine');

const _engine = new HarnessPE();

/**
 * Evaluate whether a principal is allowed to perform an action.
 *
 * @param {{ principal: { id, policy? }, action: string, resource?: object }} opts
 * @returns {Promise<boolean>}  true = allowed, false = denied
 */
async function isAllowed({ principal = {}, action = '', resource = {} }) {
  const ctx = { policy: principal.policy || 'default' };

  switch (action) {

    // ── Shell execution ──────────────────────────────────────────────────────
    case 'harness:run-command': {
      const r = await _engine.checkCommand(resource.command || '', ctx);
      return r.allowed;
    }

    // ── File / diff write ────────────────────────────────────────────────────
    case 'harness:apply-diff': {
      const path = resource.filePath || resource.path || '';
      if (!path) return true; // no path constraint — allow
      const r = await _engine.checkFileAccess(path, 'write', ctx);
      return r.allowed;
    }

    // ── Git worktree isolation ───────────────────────────────────────────────
    case 'harness:worktree': {
      const path = resource.path || '.';
      const r = await _engine.checkFileAccess(path, 'write', ctx);
      return r.allowed;
    }

    // ── GitHub API (issue → PR) ──────────────────────────────────────────────
    case 'harness:issue-to-pr': {
      const url = resource.repo || resource.url || 'github.com';
      const r = await _engine.checkNetworkAccess(url, ctx);
      return r.allowed;
    }

    // ── External web ingestion ───────────────────────────────────────────────
    case 'harness:ingest-web': {
      const url = resource.url || resource.query || '*';
      // Only block if the network policy explicitly restricts the URL
      const r = await _engine.checkNetworkAccess(url, ctx);
      return r.allowed;
    }

    // ── Low-risk / always-allowed for authenticated users ────────────────────
    case 'harness:scaffold':
    case 'harness:register-goal':
    case 'harness:checkpoint':
    case 'harness:resume':
      return true;

    // ── Fallback: treat action as a tool name ────────────────────────────────
    default: {
      const r = await _engine.checkToolPermission(action, ctx);
      return r.allowed;
    }
  }
}

/**
 * Add or replace a named policy on the underlying engine.
 * @param {string} name
 * @param {object} policy
 */
function setPolicy(name, policy) {
  return _engine.setPolicy(name, policy);
}

/**
 * Retrieve a named policy.
 * @param {string} name
 */
function getPolicy(name) {
  return _engine.getPolicy(name);
}

function getStats() {
  return _engine.getStats();
}

module.exports = { isAllowed, setPolicy, getPolicy, getStats };
