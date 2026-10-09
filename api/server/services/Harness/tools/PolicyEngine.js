'use strict';

/**
 * PolicyEngine - Granular permission and policy enforcement
 */
class PolicyEngine {
  constructor(config = {}) {
    this.policies = new Map();
    this.defaultPolicy = {
      allowAll: true,
      toolRestrictions: [],
      networkRestrictions: [],
      filesystemRestrictions: [],
      commandRestrictions: [],
    };
    this.loadDefaultPolicies();
  }

  loadDefaultPolicies() {
    this.policies.set('default', this.defaultPolicy);
    this.policies.set('restrictive', {
      allowAll: false,
      toolRestrictions: ['sudo', 'rm -rf', 'chmod 777'],
      networkRestrictions: ['0.0.0.0/0'],
      filesystemRestrictions: ['/etc', '/var', '/sys', '/proc'],
      commandRestrictions: ['rm -rf /', 'dd if=', 'mkfs', ':(){ :|:& };:'],
    });
  }

  async checkToolPermission(toolName, context = {}) {
    const policy = this.policies.get(context.policy || 'default') || this.defaultPolicy;
    if (policy.allowAll && policy.toolRestrictions.length === 0) return { allowed: true };
    const blocked = policy.toolRestrictions.find(r => toolName.toLowerCase().includes(r.toLowerCase()));
    if (blocked) return { allowed: false, reason: `Tool "${toolName}" matches restriction "${blocked}"` };
    return { allowed: true };
  }

  async checkNetworkAccess(url, context = {}) {
    const policy = this.policies.get(context.policy || 'default') || this.defaultPolicy;
    if (policy.allowAll) return { allowed: true };
    const blocked = policy.networkRestrictions.find(r => url.includes(r));
    if (blocked) return { allowed: false, reason: `Network access to "${url}" is restricted` };
    return { allowed: true };
  }

  async checkFileAccess(path, operation, context = {}) {
    const policy = this.policies.get(context.policy || 'default') || this.defaultPolicy;
    if (policy.allowAll) return { allowed: true };
    const blocked = policy.filesystemRestrictions.find(r => path.startsWith(r));
    if (blocked) return { allowed: false, reason: `File access to "${path}" is restricted (${operation})` };
    return { allowed: true };
  }

  async checkCommand(command, context = {}) {
    const policy = this.policies.get(context.policy || 'default') || this.defaultPolicy;
    if (policy.allowAll && policy.commandRestrictions.length === 0) return { allowed: true };
    const blocked = policy.commandRestrictions.find(r => command.includes(r));
    if (blocked) return { allowed: false, reason: `Command contains restricted pattern: "${blocked}"` };
    return { allowed: true };
  }

  setPolicy(name, policy) {
    this.policies.set(name, policy);
    return { success: true };
  }

  getPolicy(name) { return this.policies.get(name); }

  getStats() {
    return { policies: this.policies.size, names: Array.from(this.policies.keys()) };
  }
}

module.exports = PolicyEngine;
