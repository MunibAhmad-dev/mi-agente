/**
 * SubagentRegistry — registry of subagents the main agent can dispatch to,
 * with filtered tool access (Claude Code subagent pattern). Each subagent
 * inherits a subset of tools so a read-only explorer cannot mutate files.
 */

const registry = new Map();

/**
 * Register a subagent spec.
 * @param {object} spec { name, description, role, tools, model, readOnly }
 */
function register(spec) {
  if (!spec || !spec.name) {
    return;
  }
  registry.set(spec.name, {
    name: spec.name,
    description: spec.description || '',
    role: spec.role || 'general',
    tools: spec.tools || [],
    model: spec.model || null,
    readOnly: spec.readOnly || false,
    ...spec,
  });
}

function registerAll(specs) {
  (specs || []).forEach(register);
}

/**
 * Resolve which subagents to surface. Filters tools so a read-only subagent
 * never gets write/exec tools.
 * @param {object[]} explicitSpecs
 * @returns {object[]}
 */
function resolve(explicitSpecs) {
  const out = [];
  const seen = new Set();
  const addSpec = (spec) => {
    if (!spec || !spec.name || seen.has(spec.name)) {
      return;
    }
    seen.add(spec.name);
    if (spec.readOnly) {
      const blocked = ['write', 'edit', 'bash', 'execute', 'apply_patch', 'delete', 'remove', 'rm'];
      spec.tools = (spec.tools || []).filter((t) => {
        const name = (t.name || t.function?.name || '').toLowerCase();
        return !blocked.some(
          (b) => name === b || name.startsWith(b + '_') || name.startsWith(b + '-'),
        );
      });
    }
    out.push(spec);
  };
  (explicitSpecs || []).forEach(addSpec);
  for (const spec of registry.values()) {
    addSpec(spec);
  }
  return out;
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
