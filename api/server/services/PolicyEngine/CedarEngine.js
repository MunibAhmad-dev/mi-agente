/**
 * CedarEngine — Policy evaluation using Cedar (Apache-2.0, Rust binary).
 *
 * Cedar is a lightweight policy language and evaluation engine. This
 * module wraps the cedar binary for policy evaluation at runtime, with
 * a pure-JS fallback evaluator for basic policies when the binary is
 * not installed.
 *
 * License: Apache-2.0 (Cedar)
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const fs = require('fs');
const path = require('path');

let _binaryPath = null;

function getBinaryPath() {
  if (_binaryPath !== null) return _binaryPath;
  _binaryPath = process.env.CEDAR_PATH || '';
  if (_binaryPath) return _binaryPath;
  const defaultPath = path.join(__dirname, '..', '..', '..', '..', 'binaries', 'cedar');
  try {
    if (fs.existsSync(defaultPath)) {
      _binaryPath = defaultPath;
    } else {
      _binaryPath = '';
    }
  } catch {
    _binaryPath = '';
  }
  return _binaryPath;
}

function isAvailable() {
  return Boolean(getBinaryPath());
}

/**
 * Fallback pure-JS policy evaluator for simple allow/deny policies.
 * Supports policies of the form:
 *   permit (principal == User::"id", action == Action::"name", resource);
 *   forbid (principal, action == Action::"dangerous", resource);
 * @param {Array<{effect: 'permit'|'forbid', principal?: string, action?: string, resource?: string}>} policies
 * @param {object} request - { principal, action, resource }
 * @returns {{decision: 'allow'|'deny', matched: Array}}
 */
function fallbackEvaluate(policies, request) {
  let allowed = true;
  const matched = [];
  for (const policy of policies) {
    let matches = true;
    if (policy.principal && request.principal !== policy.principal) matches = false;
    if (policy.action && request.action !== policy.action) matches = false;
    if (policy.resource && request.resource !== policy.resource) matches = false;
    if (matches) {
      matched.push(policy);
      if (policy.effect === 'forbid') {
        allowed = false;
      } else if (policy.effect === 'permit') {
        allowed = true;
      }
    }
  }
  return { decision: allowed ? 'allow' : 'deny', matched, source: 'fallback' };
}

/**
 * Evaluate a request against a set of policies using Cedar (or fallback).
 * @param {Array} policies
 * @param {object} request - { principal, action, resource }
 * @returns {Promise<{decision: 'allow'|'deny', matched: Array, source: string}>}
 */
async function evaluate(policies, request) {
  if (!isAvailable() || !Array.isArray(policies) || policies.length === 0) {
    return fallbackEvaluate(policies || [], request || {});
  }
  try {
    const policyText = policies
      .map((p) => {
        const effect = p.effect || 'permit';
        const principal = p.principal ? `principal == ${p.principal}` : 'principal';
        const action = p.action ? `action == ${p.action}` : 'action';
        const resource = p.resource ? `resource == ${p.resource}` : 'resource';
        return `${effect} (${principal}, ${action}, ${resource});`;
      })
      .join('\n');
    const entities = JSON.stringify(request.entities || []);
    const reqJson = JSON.stringify({
      principal: request.principal || '',
      action: request.action || '',
      resource: request.resource || '',
    });
    const { stdout } = await execFileAsync(
      getBinaryPath(),
      [
        'evaluate',
        '--policies',
        '/dev/stdin',
        '--entities',
        '/dev/stdin',
        '--request',
        '/dev/stdin',
      ],
      {
        input: `${policyText}\n---\n${entities}\n---\n${reqJson}`,
        timeout: 5000,
      },
    );
    const decision = stdout.trim().toLowerCase().includes('allow') ? 'allow' : 'deny';
    return { decision, matched: [], source: 'cedar' };
  } catch {
    return fallbackEvaluate(policies || [], request || {});
  }
}

module.exports = {
  isAvailable,
  getBinaryPath,
  evaluate,
  fallbackEvaluate,
};
