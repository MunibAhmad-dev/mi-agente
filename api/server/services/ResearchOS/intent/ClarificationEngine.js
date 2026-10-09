'use strict';

/**
 * Face 24 — ClarificationEngine (plan §7, ADAPTIVE CLARIFICATION).
 *
 * Asks ONLY when the answer could significantly change the research
 * (ambiguity > threshold). If the user does not answer, the engine
 * CONTINUES and records explicit hypotheses for every assumption.
 */

const { uid, nowIso } = require('../core/ids');
const { config } = require('../core/config');
const { normalize } = require('../core/text');

/** Ambiguity dimensions per domain; each entry: if ambiguous, what to ask. */
const AMBIGUITY_RULES = {
  ai: [{
    id: 'customization_goal',
    when: (nq) => ['personaliz', 'customiz', 'fine-tun', 'ajustar', 'adaptar'].some((p) => nq.includes(p)) &&
      !['know', 'conocimiento', 'behavior', 'comportamiento', 'personality', 'personalidad', 'style', 'estilo', 'tools', 'herramientas', 'reasoning', 'razonamiento'].some((p) => nq.includes(p)),
    question: '¿Qué quieres personalizar exactamente?',
    options: ['comportamiento', 'conocimiento', 'personalidad', 'estilo', 'herramientas', 'razonamiento', 'código', 'no lo sé'],
    hypothesisIfUnanswered: 'H: el objetivo es adaptar el comportamiento del modelo vía prompting o fine-tuning ligero.',
  }, {
    id: 'target_model',
    when: (nq) => ['qwen', 'llama', 'deepseek', 'mistral', 'model', 'modelo', 'llm'].some((p) => nq.includes(p)) &&
      !['qwen', 'llama', 'deepseek', 'mistral'].some((p) => nq.includes(p)),
    question: '¿Qué modelo es el objetivo?',
    options: ['Qwen', 'Llama', 'DeepSeek', 'Mistral', 'otro', 'no lo sé'],
    hypothesisIfUnanswered: 'H: modelo abierto de 7B-14B clase Qwen/Llama (caso más común en entornos locales).',
  }, {
    id: 'reduction_constraint',
    when: (nq) => ['reduc', 'shrink', 'compress', 'comprimir'].some((p) => nq.includes(p)) && !['sin cuantizar', 'without quantiz'].some((p) => nq.includes(p)),
    question: '¿Qué restricción hay para la reducción del modelo?',
    options: ['sin cuantizar', 'mantener calidad', 'mantener arquitectura', 'cualquiera'],
    hypothesisIfUnanswered: 'H: se permiten pruning, distillation y factorización; cuantización no requerida.',
  }],
  programming: [{
    id: 'language_stack',
    when: (nq) => !['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'php'].some((p) => nq.includes(p)) && ['library', 'framework', 'project', 'proyecto', 'app'].some((p) => nq.includes(p)),
    question: '¿En qué lenguaje o stack trabaja el proyecto?',
    options: ['JavaScript/TypeScript', 'Python', 'Java/Kotlin', 'Go/Rust', 'otro'],
    hypothesisIfUnanswered: 'H: stack JavaScript/TypeScript (mayor probabilidad en este contexto).',
  }],
  general: [{
    id: 'scope',
    when: (nq) => nq.split(' ').length <= 4 && !nq.includes('?') === false,
    question: '¿Puedes dar más contexto sobre lo que buscas?',
    options: ['definición', 'cómo hacerlo', 'por qué', 'opiniones'],
    hypothesisIfUnanswered: 'H: se busca una visión general del tema.',
  }],
};

const QUESTIONS = [];

function assess(profile, opts = {}) {
  const threshold = opts.threshold || config.CLARIFY_AMBIGUITY_THRESHOLD;
  const nq = normalize(profile.question);
  const rules = [...(AMBIGUITY_RULES[profile.domain] || []), ...AMBIGUITY_RULES.general];

  const needed = rules.filter((r) => r.when(nq));
  const ambiguity = Math.min(1, needed.length * 0.4 + (profile.domain_confidence < 0.6 ? 0.2 : 0));

  const decision = {
    ambiguity_score: ambiguity,
    should_ask: ambiguity >= threshold && !opts.skipClarification,
    questions: needed.map((r) => ({ id: r.id, question: r.question, options: r.options })),
    hypotheses: [],
  };
  return decision;
}

/**
 * Applies user answers. Unanswered dimensions become explicit hypotheses
 * recorded on the profile (never silently assumed — plan §7).
 */
function apply(profile, assessment, answers = {}) {
  const out = { clarifications: [], hypotheses: [] };
  for (const q of assessment.questions) {
    const ans = answers[q.id];
    if (ans) {
      profile[q.id] = ans;
      out.clarifications.push({ id: q.id, answer: ans, source: 'user' });
    } else {
      const rule = (AMBIGUITY_RULES[profile.domain] || []).concat(AMBIGUITY_RULES.general).find((r) => r.id === q.id);
      const hyp = rule ? rule.hypothesisIfUnanswered : 'H: asunción por defecto aplicada.';
      profile[q.id] = hyp;
      const h = { id: uid('h'), statement: hyp, origin: 'unanswered_clarification', dimension: q.id, created_at: nowIso() };
      out.hypotheses.push(h);
      QUESTIONS.push({ ...q, profile_id: profile.id, answered: false });
    }
  }
  profile.clarification_history = out.clarifications;
  profile.explicit_hypotheses = out.hypotheses;
  return out;
}

function history() { return [...QUESTIONS]; }
function reset() { QUESTIONS.length = 0; }

module.exports = { assess, apply, history, reset, AMBIGUITY_RULES };
