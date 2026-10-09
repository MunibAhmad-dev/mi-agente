'use strict';

/**
 * FallbackChain — Gen B runtime phase.
 * Cascading fallback strategy when the primary approach fails.
 * Each step in a chain is tried in order; if it throws, returns null/undefined,
 * or times out, the next step is attempted.
 *
 * Built-in chains:
 *   llm_fallback   — gpt-4 → gpt-3.5 → rule-based
 *   search_fallback — web → cache → knowledge_base
 */

// Simulate async execution with a timeout wrapper
function withTimeout(fn, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
    Promise.resolve()
      .then(() => fn())
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// Built-in step stubs (returns non-null to signal "handled")
const BUILTIN_STEP_HANDLERS = {
  'gpt-4': async (input) => ({ provider: 'gpt-4', result: `[gpt-4 response for: ${String(input).substring(0, 40)}]` }),
  'gpt-3.5': async (input) => ({ provider: 'gpt-3.5', result: `[gpt-3.5 response for: ${String(input).substring(0, 40)}]` }),
  'rule-based': async (input) => ({ provider: 'rule-based', result: `Rule-based fallback applied to: ${String(input).substring(0, 40)}` }),
  'web_search': async (input) => ({ source: 'web', result: `Web search results for: ${String(input).substring(0, 40)}` }),
  'cache': async (input) => ({ source: 'cache', result: `Cached result for: ${String(input).substring(0, 40)}` }),
  'knowledge_base': async (input) => ({ source: 'knowledge_base', result: `KB result for: ${String(input).substring(0, 40)}` }),
};

const BUILTIN_CHAINS = {
  llm_fallback: [
    { name: 'gpt-4', handler: BUILTIN_STEP_HANDLERS['gpt-4'], timeout: 30000, retries: 1 },
    { name: 'gpt-3.5', handler: BUILTIN_STEP_HANDLERS['gpt-3.5'], timeout: 20000, retries: 2 },
    { name: 'rule-based', handler: BUILTIN_STEP_HANDLERS['rule-based'], timeout: 5000, retries: 0 },
  ],
  search_fallback: [
    { name: 'web_search', handler: BUILTIN_STEP_HANDLERS['web_search'], timeout: 15000, retries: 1 },
    { name: 'cache', handler: BUILTIN_STEP_HANDLERS['cache'], timeout: 2000, retries: 0 },
    { name: 'knowledge_base', handler: BUILTIN_STEP_HANDLERS['knowledge_base'], timeout: 5000, retries: 0 },
  ],
};

class FallbackChain {
  constructor() {
    this.stats = { executions: 0, successes: 0, failures: 0 };
    this._chains = new Map();
    // Pre-load built-in chains
    for (const [id, steps] of Object.entries(BUILTIN_CHAINS)) {
      this._chains.set(id, steps);
    }
  }

  /**
   * Define (or replace) a fallback chain.
   * @param {string} chainId
   * @param {Array<{ name: string, handler: Function, timeout?: number, retries?: number }>} steps
   */
  define(chainId, steps) {
    try {
      if (!chainId || !Array.isArray(steps)) return;
      this._chains.set(chainId, steps.map((s) => ({
        name: s.name || 'unnamed',
        handler: typeof s.handler === 'function' ? s.handler : async () => null,
        timeout: s.timeout || 10000,
        retries: typeof s.retries === 'number' ? s.retries : 0,
      })));
    } catch (_) {
      // non-throwing
    }
  }

  /** Alias for define() */
  register(chainId, steps) {
    return this.define(chainId, steps);
  }

  /**
   * Execute a chain.
   * @param {string} chainId
   * @param {*} input
   * @param {object} [context]
   * @returns {Promise<{ success: boolean, result: *, usedStep: string, attempts: number, errors: string[] }>}
   */
  async execute(chainId, input, context = {}) {
    try {
      this.stats.executions++;
      const chain = this._chains.get(chainId);
      if (!chain || chain.length === 0) {
        return { success: false, result: null, usedStep: null, attempts: 0, errors: [`Chain '${chainId}' not found`] };
      }

      const errors = [];
      let attempts = 0;

      for (const step of chain) {
        const maxTries = 1 + (step.retries || 0);
        for (let tryNum = 0; tryNum < maxTries; tryNum++) {
          attempts++;
          try {
            const result = await withTimeout(() => step.handler(input, context), step.timeout || 10000);
            if (result != null) {
              this.stats.successes++;
              return { success: true, result, usedStep: step.name, attempts, errors };
            }
            errors.push(`Step '${step.name}' attempt ${tryNum + 1}: returned null/undefined`);
          } catch (err) {
            errors.push(`Step '${step.name}' attempt ${tryNum + 1}: ${err.message}`);
          }
        }
      }

      this.stats.failures++;
      return { success: false, result: null, usedStep: null, attempts, errors };
    } catch (err) {
      this.stats.failures++;
      return { success: false, result: null, usedStep: null, attempts: 0, errors: [err.message] };
    }
  }

  /**
   * Returns a description of the built-in chains.
   * @returns {object}
   */
  getBuiltinChains() {
    try {
      return {
        llm_fallback: {
          description: 'LLM cascade: gpt-4 → gpt-3.5 → rule-based',
          steps: BUILTIN_CHAINS.llm_fallback.map((s) => s.name),
        },
        search_fallback: {
          description: 'Search cascade: web → cache → knowledge_base',
          steps: BUILTIN_CHAINS.search_fallback.map((s) => s.name),
        },
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * List all registered chain IDs.
   * @returns {string[]}
   */
  listChains() {
    try {
      return [...this._chains.keys()];
    } catch (_) {
      return [];
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getFallbackChain() {
  if (!_instance) _instance = new FallbackChain();
  return _instance;
}

module.exports = { FallbackChain, getFallbackChain };
