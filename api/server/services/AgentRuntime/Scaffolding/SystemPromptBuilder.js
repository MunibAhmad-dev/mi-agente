/**
 * SystemPromptBuilder — constructs the system prompt by layers, following the
 * "Goldilocks altitude" principle from Anthropic context engineering and the
 * five-layer anatomy (Persona → Scope → Tools → Constraints → References).
 *
 * Progressive disclosure: only include layers that have content, so the prompt
 * stays lean. Inspired by OPENDEV's dynamic system prompt construction.
 */

const fs = require('fs');
const path = require('path');

const BASE_PERSONA = `You are a senior autonomous coding agent running inside a harness-engine-powered runtime.
You operate with precision, safety, and persistence. You explore the codebase
before acting, make minimal focused changes, verify your work, and stop when
the task is complete or you lack sufficient information.`;

let _constitutionCache = null;
let _constitutionCacheAt = 0;
const CONSTITUTION_TTL_MS = 60_000;

/** Load active Agent Constitution from DB (Face 7). Cached for 60 s. */
async function loadConstitutionPersona() {
  const now = Date.now();
  if (_constitutionCache !== null && now - _constitutionCacheAt < CONSTITUTION_TTL_MS) {
    return _constitutionCache;
  }
  try {
    const { getActiveConstitution } = require('~/models/AgentConstitution');
    const doc = await getActiveConstitution();
    if (doc && (doc.fullText || doc.persona)) {
      _constitutionCache = doc.fullText || doc.persona;
    } else {
      _constitutionCache = null;
    }
  } catch {
    _constitutionCache = null;
  }
  _constitutionCacheAt = now;
  return _constitutionCache;
}

/**
 * Read the repo AGENTS.md to inject repo conventions (OPENDEV pattern).
 * @returns {string}
 */
function readAgentsMd() {
  const candidates = [
    path.resolve(process.cwd(), 'AGENTS.md'),
    path.resolve(process.cwd(), 'CLAUDE.md'),
    path.resolve(process.cwd(), 'OPENCODE.md'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        return content.length > 8000 ? content.slice(0, 8000) + '\n...[truncated]' : content;
      }
    } catch {
      // ignore
    }
  }
  return '';
}

/**
 * Build the tools layer: list each tool with a one-line description so the
 * model knows what it can call, without dumping full JSON schemas.
 * @param {object[]} tools
 * @returns {string}
 */
function buildToolsLayer(tools) {
  if (!tools || tools.length === 0) {
    return '';
  }
  const lines = tools.map((t) => {
    const name = t.name || t.function?.name || 'unknown';
    const desc = t.description || t.function?.description || '';
    const shortDesc = desc.length > 120 ? desc.slice(0, 120) + '...' : desc;
    return `- ${name}: ${shortDesc}`;
  });
  return '## Available tools\n\n' + lines.join('\n');
}

/**
 * Build the subagents layer.
 * @param {object[]} subagents
 * @returns {string}
 */
function buildSubagentsLayer(subagents) {
  if (!subagents || subagents.length === 0) {
    return '';
  }
  const lines = subagents.map((s) => `- ${s.name || s.id}: ${s.description || s.role || ''}`);
  return '## Subagents you can delegate to\n\n' + lines.join('\n');
}

/**
 * Build safety constraints layer.
 * @param {object} agentSpec
 * @returns {string}
 */
function buildConstraintsLayer(agentSpec) {
  const constraints = [
    'Never commit directly to main or master.',
    'Never push to remote unless explicitly asked.',
    'Never delete files you did not create unless asked.',
    'Verify changes with lint/tests before declaring a task complete.',
    'Stop and ask if a task is ambiguous or if you lack permissions.',
  ];
  if (agentSpec.extraConstraints) {
    constraints.push(...agentSpec.extraConstraints);
  }
  return '## Safety constraints\n\n' + constraints.map((c) => `- ${c}`).join('\n');
}

/**
 * Build the references layer: AGENTS.md + any user-provided context.
 * @param {object} opts
 * @returns {string}
 */
function buildReferencesLayer(opts = {}) {
  const parts = [];
  const agentsMd = readAgentsMd();
  if (agentsMd) {
    parts.push('### Repository conventions (AGENTS.md)\n\n' + agentsMd);
  }
  if (opts.worktree) {
    parts.push(`### Working directory\n\nYou are isolated in git worktree: ${opts.worktree.path}`);
  }
  if (opts.agentSpec && opts.agentSpec.references) {
    parts.push('### Additional references\n\n' + opts.agentSpec.references);
  }
  return parts.length > 0 ? '## References\n\n' + parts.join('\n\n') : '';
}

/**
 * Build the complete system prompt by layers.
 * @param {object} opts { agentSpec, tools, subagents, userTask, worktree, session }
 * @returns {Promise<string>}
 */
async function build(opts = {}) {
  const { agentSpec = {}, tools = [], subagents = [], userTask = '', worktree, session } = opts;

  const constitutionPersona = await loadConstitutionPersona();
  const persona = agentSpec.persona || constitutionPersona || BASE_PERSONA;
  const scope = agentSpec.scope ? `## Scope\n\n${agentSpec.scope}` : '';

  const toolsLayer = buildToolsLayer(tools);
  const subagentsLayer = buildSubagentsLayer(subagents);
  const constraints = buildConstraintsLayer(agentSpec);
  const references = buildReferencesLayer({ agentSpec, worktree, session });

  const taskHint = userTask ? `## Current task\n\n${userTask}` : '';

  const sections = [
    persona,
    scope,
    toolsLayer,
    subagentsLayer,
    constraints,
    references,
    taskHint,
  ].filter(Boolean);

  return sections.join('\n\n---\n\n');
}

module.exports = { build, BASE_PERSONA, loadConstitutionPersona };
