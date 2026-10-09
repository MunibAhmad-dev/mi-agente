'use strict';

/**
 * PersonalityLayer — Face 17 Phase 3.
 * Structured personality system: tone, style, traits, and mode-specific overrides.
 * Personalities are named profiles that modify how the agent communicates.
 */

const DEFAULT_PERSONALITY = {
  id: 'default',
  name: 'Default Assistant',
  tone: 'professional',
  style: 'balanced',
  traits: ['helpful', 'precise', 'clear'],
  verbosity: 'moderate',
  emoji_use: 'none',
  formality: 'neutral',
  humor: 'minimal',
  active: true,
};

const BUILT_IN_PERSONALITIES = {
  default: DEFAULT_PERSONALITY,
  expert: {
    id: 'expert',
    name: 'Domain Expert',
    tone: 'authoritative',
    style: 'technical',
    traits: ['precise', 'thorough', 'citation-aware'],
    verbosity: 'detailed',
    emoji_use: 'none',
    formality: 'formal',
    humor: 'none',
    active: true,
  },
  tutor: {
    id: 'tutor',
    name: 'Patient Tutor',
    tone: 'encouraging',
    style: 'pedagogical',
    traits: ['patient', 'step-by-step', 'example-driven'],
    verbosity: 'detailed',
    emoji_use: 'minimal',
    formality: 'casual',
    humor: 'light',
    active: true,
  },
  concise: {
    id: 'concise',
    name: 'Concise Responder',
    tone: 'direct',
    style: 'minimal',
    traits: ['brief', 'direct', 'no-filler'],
    verbosity: 'terse',
    emoji_use: 'none',
    formality: 'neutral',
    humor: 'none',
    active: true,
  },
  creative: {
    id: 'creative',
    name: 'Creative Writer',
    tone: 'engaging',
    style: 'narrative',
    traits: ['imaginative', 'vivid', 'storytelling'],
    verbosity: 'moderate',
    emoji_use: 'moderate',
    formality: 'casual',
    humor: 'moderate',
    active: true,
  },
};

const _custom = new Map();

function getPersonality(id) {
  return _custom.get(id) || BUILT_IN_PERSONALITIES[id] || BUILT_IN_PERSONALITIES.default;
}

function listPersonalities() {
  return [
    ...Object.values(BUILT_IN_PERSONALITIES),
    ...Array.from(_custom.values()),
  ];
}

function registerPersonality(profile) {
  if (!profile || !profile.id || !profile.name) {
    throw new Error('Personality requires id and name');
  }
  const full = { ...DEFAULT_PERSONALITY, ...profile, custom: true };
  _custom.set(full.id, full);
  return full;
}

function deletePersonality(id) {
  if (BUILT_IN_PERSONALITIES[id]) throw new Error(`Cannot delete built-in personality: ${id}`);
  return _custom.delete(id);
}

/**
 * Build a system prompt fragment from a personality profile.
 * Used to prepend to the LLM's system message.
 */
function toSystemPromptFragment(personality) {
  const p = typeof personality === 'string' ? getPersonality(personality) : personality;
  const lines = [
    `Tone: ${p.tone}.`,
    `Style: ${p.style}.`,
    p.traits.length ? `Core traits: ${p.traits.join(', ')}.` : '',
    p.verbosity === 'terse' ? 'Keep responses brief and direct. Avoid unnecessary padding.' : '',
    p.verbosity === 'detailed' ? 'Provide thorough, detailed responses with examples.' : '',
    p.formality === 'casual' ? 'Use a conversational, approachable tone.' : '',
    p.formality === 'formal' ? 'Maintain a formal, professional register.' : '',
    p.emoji_use === 'none' ? 'Do not use emoji.' : '',
    p.humor === 'none' ? 'Remain serious and professional.' : '',
    p.humor === 'moderate' ? 'Use tasteful humor when appropriate.' : '',
  ].filter(Boolean);
  return lines.join(' ');
}

module.exports = { getPersonality, listPersonalities, registerPersonality, deletePersonality, toSystemPromptFragment, BUILT_IN_PERSONALITIES };
