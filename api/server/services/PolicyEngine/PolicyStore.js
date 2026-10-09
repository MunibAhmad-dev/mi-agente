/**
 * PolicyStore — Loads and caches policy definitions.
 *
 * Policies are defined as JSON objects with {effect, principal, action, resource}.
 * Loaded from:
 *   1. Built-in defaults (api/server/policies/*.json)
 *   2. User-defined policies (configured at runtime)
 *
 * License: Apache-2.0 (Cedar)
 */

const fs = require('fs');
const path = require('path');

const _policies = new Map();
let _initialized = false;

const DEFAULT_POLICIES_DIR = path.join(__dirname, '..', '..', 'policies');

const BUILTIN_POLICIES = [
  {
    id: 'default-allow-read',
    effect: 'permit',
    action: 'read_file',
    description: 'Allow file reads by default',
  },
  {
    id: 'default-allow-search',
    effect: 'permit',
    action: 'grep_search',
    description: 'Allow search by default',
  },
  {
    id: 'default-allow-glob',
    effect: 'permit',
    action: 'glob_search',
    description: 'Allow glob search by default',
  },
  {
    id: 'default-deny-secrets',
    effect: 'forbid',
    action: 'read_file',
    resource: 'secrets',
    description: 'Deny reading secrets files',
  },
  {
    id: 'default-confirm-shell',
    effect: 'forbid',
    action: 'execute_command',
    description: 'Deny shell execution unless explicitly permitted',
  },
  {
    id: 'default-deny-deployment',
    effect: 'forbid',
    action: 'deployment',
    description: 'Deny deployment actions by default',
  },
];

/**
 * Initialize the policy store with built-in and file-based policies.
 */
function init() {
  if (_initialized) return;
  _initialized = true;
  for (const policy of BUILTIN_POLICIES) {
    _policies.set(policy.id, policy);
  }
  try {
    if (fs.existsSync(DEFAULT_POLICIES_DIR)) {
      const files = fs.readdirSync(DEFAULT_POLICIES_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(DEFAULT_POLICIES_DIR, file), 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
              for (const p of data) {
                if (p.id) _policies.set(p.id, p);
              }
            } else if (data.id) {
              _policies.set(data.id, data);
            }
          } catch {
            // skip invalid policy files
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Get all policies.
 * @returns {Array}
 */
function getAll() {
  if (!_initialized) init();
  return Array.from(_policies.values());
}

/**
 * Get policies matching a filter.
 * @param {object} filter - {effect?, action?, resource?}
 * @returns {Array}
 */
function getMatching(filter = {}) {
  if (!_initialized) init();
  return getAll().filter((p) => {
    if (filter.effect && p.effect !== filter.effect) return false;
    if (filter.action && p.action !== filter.action) return false;
    if (filter.resource && p.resource !== filter.resource) return false;
    return true;
  });
}

/**
 * Add a policy at runtime.
 * @param {object} policy
 */
function add(policy) {
  if (!policy || !policy.id) return;
  _policies.set(policy.id, policy);
}

/**
 * Remove a policy by id.
 * @param {string} id
 */
function remove(id) {
  _policies.delete(id);
}

/**
 * Clear all policies.
 */
function clear() {
  _policies.clear();
  _initialized = false;
}

module.exports = {
  init,
  getAll,
  getMatching,
  add,
  remove,
  clear,
};
