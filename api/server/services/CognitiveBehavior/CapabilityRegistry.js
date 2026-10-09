'use strict';

/**
 * CapabilityRegistry — Gen B Phase 2.
 * Tracks what capabilities the agent has registered and available.
 * Supports built-in and dynamically registered capabilities.
 */

const BUILT_IN_CAPABILITIES = [
  {
    name: 'text_generation',
    type: 'core',
    description: 'Generate coherent text responses from natural language prompts',
    enabled: true,
  },
  {
    name: 'code_execution',
    type: 'tool',
    description: 'Execute code snippets in sandboxed environments',
    enabled: false,
  },
  {
    name: 'web_search',
    type: 'tool',
    description: 'Search the web for up-to-date information',
    enabled: false,
  },
  {
    name: 'image_analysis',
    type: 'multimodal',
    description: 'Analyze and describe images using vision models',
    enabled: false,
  },
  {
    name: 'file_operations',
    type: 'tool',
    description: 'Read, write, and manipulate files in allowed directories',
    enabled: false,
  },
  {
    name: 'memory_recall',
    type: 'cognitive',
    description: 'Recall information from previous conversations and stored memory',
    enabled: true,
  },
  {
    name: 'reasoning',
    type: 'cognitive',
    description: 'Multi-step logical reasoning and chain-of-thought analysis',
    enabled: true,
  },
];

class CapabilityRegistry {
  constructor() {
    this._capabilities = new Map();
    // Seed with built-ins
    for (const cap of BUILT_IN_CAPABILITIES) {
      this._capabilities.set(cap.name, { ...cap, builtIn: true, registeredAt: new Date().toISOString() });
    }
  }

  /**
   * Register a new capability.
   * @param {object} capability - { name, type, description, enabled?, metadata? }
   * @returns {object} registered capability
   */
  register(capability) {
    try {
      if (!capability || !capability.name) {
        return { error: 'capability.name is required' };
      }
      const cap = {
        name: capability.name,
        type: capability.type || 'custom',
        description: capability.description || '',
        enabled: capability.enabled !== false,
        metadata: capability.metadata || {},
        builtIn: false,
        registeredAt: new Date().toISOString(),
      };
      this._capabilities.set(cap.name, cap);
      return cap;
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * List all registered capabilities.
   * @param {object} filter - { type?, enabled? }
   * @returns {object[]}
   */
  list(filter = {}) {
    try {
      let caps = Array.from(this._capabilities.values());
      if (filter.type !== undefined) {
        caps = caps.filter((c) => c.type === filter.type);
      }
      if (filter.enabled !== undefined) {
        caps = caps.filter((c) => c.enabled === filter.enabled);
      }
      return caps;
    } catch (err) {
      return [{ error: err.message }];
    }
  }

  /**
   * Check if a capability exists and is enabled.
   * @param {string} name
   * @returns {boolean}
   */
  hasCapability(name) {
    try {
      const cap = this._capabilities.get(name);
      return !!(cap && cap.enabled);
    } catch {
      return false;
    }
  }

  /**
   * Get all capabilities of a given type.
   * @param {string} type
   * @returns {object[]}
   */
  getByType(type) {
    try {
      return Array.from(this._capabilities.values()).filter((c) => c.type === type);
    } catch (err) {
      return [{ error: err.message }];
    }
  }

  /**
   * Enable or disable a capability by name.
   * @param {string} name
   * @param {boolean} enabled
   * @returns {object} updated capability or error
   */
  setEnabled(name, enabled) {
    try {
      const cap = this._capabilities.get(name);
      if (!cap) return { error: `Capability '${name}' not found` };
      cap.enabled = !!enabled;
      return cap;
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Unregister a capability (only non-built-in ones).
   * @param {string} name
   * @returns {object} { removed: boolean }
   */
  unregister(name) {
    try {
      const cap = this._capabilities.get(name);
      if (!cap) return { removed: false, error: 'Not found' };
      if (cap.builtIn) return { removed: false, error: 'Cannot unregister built-in capabilities' };
      this._capabilities.delete(name);
      return { removed: true, name };
    } catch (err) {
      return { removed: false, error: err.message };
    }
  }

  getStats() {
    const all = Array.from(this._capabilities.values());
    return {
      total: all.length,
      enabled: all.filter((c) => c.enabled).length,
      disabled: all.filter((c) => !c.enabled).length,
      byType: all.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc; }, {}),
    };
  }
}

let _instance = null;
function getCapabilityRegistry() {
  if (!_instance) _instance = new CapabilityRegistry();
  return _instance;
}

module.exports = { CapabilityRegistry, getCapabilityRegistry, BUILT_IN_CAPABILITIES };
