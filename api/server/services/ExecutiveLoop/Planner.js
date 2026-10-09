/**
 * Planner — Face 8: generates concrete, message-specific steps.
 *
 * Takes Director output + the original message and produces a dynamic
 * step list instead of the fixed 4-step templates.
 *
 * Rules:
 * - code_task  → parse requirements, design, implement, edge cases, verify
 * - research   → query breakdown, source search, extract facts, synthesize, cite
 * - multi_step → decompose, order, execute each sub-task, integrate, check
 * - simple     → understand, answer (2 steps max)
 */

'use strict';

const { INTENT } = require('./IntentClassifier');
const { APPROACH } = require('./Director');

const MAX_STEPS = 6;
const MIN_STEPS = 2;

// Sentence-level splitter: finds imperative clauses in a message
const CLAUSE_RE = /(?:^|(?:[.;!?]\s+))([A-Z][^.;!?]{10,80})/g;

/**
 * Extract potential sub-tasks from the message text.
 * Looks for imperative phrases and "and then" sequences.
 */
function extractClauses(message) {
  const lower = message.toLowerCase();
  const parts = [];

  // Split on connectors like "then", "after", "and", numbered lists
  const connectors = /(?:\band\b|\bthen\b|\bafter(?:ward)?s?\b|\bfinally\b|\bnext\b|\bfirst\b|\bsecond\b|\bthird\b|\balso\b|\bplus\b)/gi;
  const segments = message.split(connectors).map((s) => s.trim()).filter((s) => s.length > 8);

  for (const seg of segments.slice(0, MAX_STEPS)) {
    // Capitalize and trim to a short label
    const label = seg.replace(/^[,\s]+/, '').split(/[.!?]/)[0].slice(0, 60);
    if (label.length > 6) parts.push(label);
  }

  return parts;
}

/**
 * Build step list for code tasks.
 */
function planCode(message) {
  const lower = message.toLowerCase();
  const steps = [];

  // Always: understand requirements
  steps.push('Understand requirements and constraints');

  // If it involves a data model / schema
  if (/model|schema|database|table|struct|class|interface/.test(lower)) {
    steps.push('Design data model and interfaces');
  }

  // Core implementation
  steps.push('Write implementation');

  // Error handling if mentioned or implied
  if (/error|exception|fail|invalid|edge|corner|boundary|null/.test(lower)) {
    steps.push('Handle edge cases and errors');
  }

  // Testing
  if (/test|spec|unit|jest|mocha|assert/.test(lower)) {
    steps.push('Write tests');
  }

  // Always end with verify
  steps.push('Verify correctness');

  return steps.slice(0, MAX_STEPS);
}

/**
 * Build step list for research tasks.
 */
function planResearch(message) {
  const clauses = extractClauses(message);
  const steps = ['Break query into sub-questions'];

  if (clauses.length > 1) {
    // Each clause is a research angle
    for (const c of clauses.slice(0, 3)) {
      steps.push(`Research: ${c}`);
    }
  } else {
    steps.push('Search primary sources');
    steps.push('Read and extract key facts');
  }

  steps.push('Synthesize findings');
  steps.push('Verify accuracy and cite sources');

  return steps.slice(0, MAX_STEPS);
}

/**
 * Build step list for multi-step tasks.
 */
function planMultiStep(message) {
  const clauses = extractClauses(message);

  if (clauses.length >= MIN_STEPS) {
    const steps = clauses.slice(0, MAX_STEPS - 1);
    steps.push('Verify and integrate results');
    return steps;
  }

  // Fallback: generic decomposition
  return [
    'Decompose goal into sub-tasks',
    'Execute sub-tasks in order',
    'Check intermediate outputs',
    'Integrate results',
    'Verify final output',
  ];
}

/**
 * Plan steps for a classified intent.
 *
 * @param {{ intent: string, approach: string }} classification
 * @param {string} message - original user message
 * @returns {{ steps: string[], rationale: string }}
 */
function plan(classification, message) {
  const { intent } = classification;

  let steps;
  let rationale;

  switch (intent) {
    case INTENT.CODE: {
      steps = planCode(message);
      rationale = 'Code pipeline: requirements → design → implement → verify';
      break;
    }
    case INTENT.RESEARCH: {
      steps = planResearch(message);
      rationale = 'Research pipeline: decompose → search → extract → synthesize → cite';
      break;
    }
    case INTENT.MULTI_STEP: {
      steps = planMultiStep(message);
      rationale = 'Multi-step pipeline: decompose from message clauses → execute → integrate';
      break;
    }
    default: {
      // simple_query
      steps = ['Understand the question', 'Generate a clear, direct answer'];
      rationale = 'Simple query: direct answer';
    }
  }

  return { steps, rationale };
}

module.exports = { plan };
