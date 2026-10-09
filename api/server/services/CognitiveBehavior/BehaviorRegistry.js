'use strict';

/**
 * BehaviorRegistry — Face 17 Phase 4.
 * Register, manage, and apply behavior packs.
 * A behavior pack is a named set of rules, personality overrides, and mode prompts
 * that can be activated per agent, per conversation, or globally.
 */

const BUILT_IN_PACKS = {
  'coding-assistant': {
    id: 'coding-assistant',
    name: 'Coding Assistant',
    description: 'Optimized for software development tasks',
    personality_id: 'expert',
    mode: 'coding',
    rules: [
      'Always include working code examples',
      'Explain the why behind every technical choice',
      'Flag potential edge cases and error conditions',
      'Use idiomatic patterns for the target language',
    ],
    system_prompt_fragment: 'You are a precise software engineering assistant. Prioritize correctness, readability, and idiomatic code. Always test your logic mentally before presenting it.',
    active: true,
    version: '1.0.0',
  },
  'research-mode': {
    id: 'research-mode',
    name: 'Research Mode',
    description: 'Optimized for deep research and analysis',
    personality_id: 'expert',
    mode: 'research',
    rules: [
      'Cite sources where possible',
      'Distinguish facts from inferences',
      'Present multiple perspectives on contested claims',
      'Flag uncertainty levels explicitly',
    ],
    system_prompt_fragment: 'You are a rigorous research assistant. Separate facts from inferences. Flag confidence levels. When sources are known, cite them.',
    active: true,
    version: '1.0.0',
  },
  'chat-mode': {
    id: 'chat-mode',
    name: 'Conversational Mode',
    description: 'Friendly, engaging chat behavior',
    personality_id: 'default',
    mode: 'chat',
    rules: [
      'Keep responses appropriately concise',
      'Match the user\'s tone and energy level',
      'Ask clarifying questions when the request is ambiguous',
    ],
    system_prompt_fragment: 'You are a helpful, conversational assistant. Match the user\'s tone. Be concise unless detail is requested.',
    active: true,
    version: '1.0.0',
  },
  'tutor-mode': {
    id: 'tutor-mode',
    name: 'Tutor Mode',
    description: 'Step-by-step teaching with examples',
    personality_id: 'tutor',
    mode: 'teaching',
    rules: [
      'Build from fundamentals before advanced concepts',
      'Use concrete, relatable examples',
      'Check understanding before moving on',
      'Celebrate progress',
    ],
    system_prompt_fragment: 'You are a patient, encouraging tutor. Build understanding step by step. Use analogies and examples. Confirm understanding before advancing.',
    active: true,
    version: '1.0.0',
  },
};

const _custom = new Map();
const _active = new Set(['chat-mode']);

function register(pack) {
  if (!pack || !pack.id || !pack.name) throw new Error('Pack requires id and name');
  const full = { active: true, version: '1.0.0', rules: [], ...pack, custom: true };
  _custom.set(full.id, full);
  return full;
}

function get(id) {
  return _custom.get(id) || BUILT_IN_PACKS[id] || null;
}

function list() {
  return [...Object.values(BUILT_IN_PACKS), ...Array.from(_custom.values())];
}

function activate(id) {
  if (!get(id)) throw new Error(`Behavior pack not found: ${id}`);
  _active.add(id);
  return { activated: id, active_packs: Array.from(_active) };
}

function deactivate(id) {
  _active.delete(id);
  return { deactivated: id, active_packs: Array.from(_active) };
}

function getActivePacks() {
  return Array.from(_active).map((id) => get(id)).filter(Boolean);
}

/**
 * Build a combined system prompt fragment from all active packs.
 */
function buildSystemPromptFromActivePacks() {
  const packs = getActivePacks();
  if (!packs.length) return '';
  return packs.map((p) => p.system_prompt_fragment || '').filter(Boolean).join('\n\n');
}

function remove(id) {
  if (BUILT_IN_PACKS[id]) throw new Error(`Cannot remove built-in pack: ${id}`);
  _active.delete(id);
  return _custom.delete(id);
}

module.exports = { register, get, list, activate, deactivate, getActivePacks, buildSystemPromptFromActivePacks, remove, BUILT_IN_PACKS };
