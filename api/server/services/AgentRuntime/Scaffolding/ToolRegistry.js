/**
 * ToolRegistry — registry-based tool architecture with lazy discovery
 * (OPENDEV pattern). Tools are registered with metadata; the harness only
 * surfaces the tool schemas the current task needs, keeping the system prompt
 * lean.
 */

const registry = new Map();

/**
 * Register a tool definition.
 * @param {object} tool { name, description, parameters, category, keywords }
 */
function register(tool) {
  if (!tool || !tool.name) {
    return;
  }
  registry.set(tool.name, {
    name: tool.name,
    description: tool.description || '',
    parameters: tool.parameters || tool.function?.parameters || {},
    category: tool.category || 'general',
    keywords: tool.keywords || [],
    ...tool,
  });
}

/**
 * Register many tools at once.
 * @param {object[]} tools
 */
function registerAll(tools) {
  (tools || []).forEach(register);
}

/**
 * Resolve which tools to surface for a given task. Strategy:
 *   1. Always include explicitly requested tools.
 *   2. Add tools whose keywords match the task text.
 *   3. Cap the total to keep the prompt lean (default 20, Codex uses ~15).
 * @param {object[]} explicitTools tools already chosen by the caller
 * @param {string} userTask
 * @returns {object[]}
 */
function resolve(explicitTools, userTask) {
  const resolved = new Map();
  for (const t of explicitTools || []) {
    const name = t.name || t.function?.name;
    if (name) {
      resolved.set(name, t);
    }
  }
  const taskLower = (userTask || '').toLowerCase();
  if (taskLower) {
    for (const tool of registry.values()) {
      if (resolved.size >= 20) {
        break;
      }
      const matched = (tool.keywords || []).some((k) => taskLower.includes(k.toLowerCase()));
      if (matched) {
        resolved.set(tool.name, tool);
      }
    }
  }
  return Array.from(resolved.values());
}

function get(name) {
  return registry.get(name);
}

function list() {
  return Array.from(registry.values());
}

function clear() {
  registry.clear();
}

module.exports = { register, registerAll, resolve, get, list, clear };
