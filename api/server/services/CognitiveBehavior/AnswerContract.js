'use strict';

/**
 * AnswerContract — Face 17 Phase 2.
 * Creates a pre-response contract defining the expected answer shape,
 * then scores how well the actual response fulfilled that contract.
 *
 * AlignmentScore is included here as the contract's evaluator.
 */

const { understand } = require('./QuestionUnderstanding');

const FORMAT_BY_TYPE = {
  factual: { format: 'direct_answer', max_paragraphs: 2, requires_sources: false },
  procedural: { format: 'numbered_steps', min_steps: 2, requires_steps: true },
  explanation: { format: 'structured_prose', min_paragraphs: 2, requires_reasoning: true },
  comparison: { format: 'comparison_table_or_list', requires_both_sides: true },
  list: { format: 'bullet_list', min_items: 3 },
  code: { format: 'code_block', requires_code: true, requires_explanation: true },
  creative: { format: 'narrative', min_words: 50 },
  analytical: { format: 'structured_analysis', requires_reasoning: true },
  opinion: { format: 'reasoned_opinion', requires_reasoning: true },
  unknown: { format: 'open', min_words: 10 },
};

/**
 * Build a contract from a question profile.
 * @param {object} questionProfile - Output of QuestionUnderstanding.understand()
 * @param {object} opts
 * @returns {object} AnswerContract
 */
function buildContract(questionProfile, opts = {}) {
  const baseFormat = FORMAT_BY_TYPE[questionProfile.answer_type] || FORMAT_BY_TYPE.unknown;
  const verbosity = opts.verbosity || deriveVerbosity(questionProfile);

  return {
    id: `ac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    question_profile: questionProfile,
    expected_format: baseFormat.format,
    constraints: {
      ...baseFormat,
      verbosity,
      domain: questionProfile.domain,
      complexity_match: questionProfile.complexity,
      must_address_subject: questionProfile.subject || null,
      must_address_entities: questionProfile.entities.slice(0, 5).map((e) => e.value),
    },
    created_at: new Date().toISOString(),
  };
}

function deriveVerbosity(profile) {
  if (profile.complexity === 'high') return 'detailed';
  if (profile.complexity === 'low' && profile.cardinality === 'boolean') return 'terse';
  return 'moderate';
}

/**
 * Score how well a response text fulfills a contract.
 * @param {string} responseText
 * @param {object} contract - Output of buildContract()
 * @returns {{ score: number, breakdown: object, passed: boolean }}
 */
function scoreAlignment(responseText, contract) {
  if (!responseText || !contract) return { score: 0, breakdown: {}, passed: false };

  const text = typeof responseText === 'string' ? responseText : JSON.stringify(responseText);
  const c = contract.constraints;
  const breakdown = {};
  let total = 0;
  let maxTotal = 0;

  // Subject coverage
  if (c.must_address_subject) {
    const subjectWords = c.must_address_subject.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const covered = subjectWords.filter((w) => text.toLowerCase().includes(w)).length;
    const score = subjectWords.length > 0 ? covered / subjectWords.length : 1;
    breakdown.subject_coverage = Math.round(score * 100);
    total += score * 25; maxTotal += 25;
  }

  // Entity coverage
  if (c.must_address_entities && c.must_address_entities.length > 0) {
    const covered = c.must_address_entities.filter((e) => text.toLowerCase().includes(e.toLowerCase())).length;
    const score = covered / c.must_address_entities.length;
    breakdown.entity_coverage = Math.round(score * 100);
    total += score * 20; maxTotal += 20;
  }

  // Format checks
  if (c.requires_code) {
    const hasCode = /```[\s\S]+?```|`[^`]+`/.test(text);
    breakdown.has_code = hasCode;
    total += hasCode ? 20 : 0; maxTotal += 20;
  }

  if (c.requires_steps) {
    const hasSteps = /\n\s*\d+\.\s|\n\s*[-*]\s/.test(text);
    breakdown.has_steps = hasSteps;
    total += hasSteps ? 15 : 0; maxTotal += 15;
  }

  if (c.min_words) {
    const words = text.split(/\s+/).length;
    const score = Math.min(words / c.min_words, 1);
    breakdown.word_count = words;
    total += score * 15; maxTotal += 15;
  }

  if (c.requires_reasoning) {
    const reasoningWords = ['because', 'therefore', 'since', 'thus', 'reason', 'result', 'cause', 'hence', 'consequently'];
    const hasReasoning = reasoningWords.some((w) => text.toLowerCase().includes(w));
    breakdown.has_reasoning = hasReasoning;
    total += hasReasoning ? 15 : 0; maxTotal += 15;
  }

  // Length adequacy
  const minExpected = c.verbosity === 'detailed' ? 150 : c.verbosity === 'terse' ? 10 : 50;
  const wordCount = text.split(/\s+/).length;
  const lengthScore = Math.min(wordCount / minExpected, 1);
  breakdown.length_adequacy = Math.round(lengthScore * 100);
  total += lengthScore * 5; maxTotal += 5;

  const score = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 50;
  return {
    score,
    breakdown,
    passed: score >= 60,
    verbosity: c.verbosity,
  };
}

module.exports = { buildContract, scoreAlignment, FORMAT_BY_TYPE };
