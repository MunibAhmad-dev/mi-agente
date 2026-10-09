'use strict';

/**
 * PromptIR — Face 17: Prompt Improvement & Refinement.
 *
 * Takes a raw user prompt and produces an improved version that is
 * clearer, more specific, and more likely to get a high-quality response.
 *
 * Runs as a lightweight pre-processing pass using:
 *   1. Structural heuristics (pattern matching, no LLM required)
 *   2. Optional LLM-backed rewrite for very ambiguous prompts (when router available)
 */

const VAGUE_SIGNALS = [
  { re: /^(tell me about|talk about|what about|explain|describe)\s+\w+\.?\s*$/i, issue: 'too_vague' },
  { re: /^(help|help me|i need help|assist)\s*\.?\s*$/i, issue: 'no_context' },
  { re: /^(fix it|fix this|make it better|improve)\s*\.?\s*$/i, issue: 'no_referent' },
  { re: /^(yes|no|ok|okay|sure|fine|got it)\s*\.?\s*$/i, issue: 'continuation_no_context' },
  { re: /^.{1,10}$/, issue: 'too_short' },
];

const QUESTION_IMPROVEMENTS = [
  // "What is X" → "Explain X with examples and key use cases"
  { re: /^what is (\w.{0,40})\??\s*$/i, template: (m) => `Explain ${m[1]} clearly: what it is, why it matters, and give a concrete example.` },
  // "How to X" → more specific
  { re: /^how (to|do I|can I) (.{0,60})\??\s*$/i, template: (m) => `Provide step-by-step instructions on how to ${m[2]}. Include any prerequisites and common pitfalls.` },
  // "Write a X" → include requirements
  { re: /^write (a|an|the) (.{0,60})\s*$/i, template: (m) => `Write ${m[1]} ${m[2]}. Requirements: [inferred from context]. Format: well-structured with clear sections.` },
  // "Fix X" → include criteria
  { re: /^fix (the |a |an )?(.{0,80})\s*$/i, template: (m) => `Identify and fix the issue with ${m[2]}. Explain what was wrong and why the fix works.` },
];

const CLARITY_PATTERNS = [
  // Remove double spaces, normalize punctuation
  { re: /\s{2,}/g, replace: ' ' },
  { re: /\?{2,}/g, replace: '?' },
  { re: /!{2,}/g, replace: '!' },
  { re: /\.{4,}/g, replace: '...' },
];

class PromptIR {
  /**
   * Analyze a prompt and return improvement suggestions.
   * @param {string} prompt
   * @param {object} [context] { intent, answerType, domain, conversationHistory }
   * @returns {{ improved: string, original: string, changes: string[], issues: string[], score: number }}
   */
  improve(prompt, context = {}) {
    if (!prompt || typeof prompt !== 'string') {
      return { improved: '', original: prompt, changes: [], issues: ['empty_prompt'], score: 0 };
    }

    let text = prompt.trim();
    const changes = [];
    const issues = [];

    // Step 1: Basic cleanup
    for (const { re, replace } of CLARITY_PATTERNS) {
      const before = text;
      text = text.replace(re, replace);
      if (text !== before) changes.push('normalized_whitespace_punctuation');
    }

    // Step 2: Detect vague signals
    for (const { re, issue } of VAGUE_SIGNALS) {
      if (re.test(text) && !issues.includes(issue)) {
        issues.push(issue);
      }
    }

    // Step 3: Apply question improvements for short, simple questions
    const wordCount = text.split(/\s+/).length;
    if (wordCount <= 12 && issues.length === 0) {
      for (const { re, template } of QUESTION_IMPROVEMENTS) {
        const m = text.match(re);
        if (m) {
          const candidate = template(m);
          // Only apply if it adds real substance
          if (candidate.length > text.length + 20) {
            text = candidate;
            changes.push('expanded_question_specificity');
          }
          break;
        }
      }
    }

    // Step 4: Add context from cognitive profile if available
    const { intent, answerType, domain } = context;
    if (answerType === 'code' && !/```|code|function|class|method/i.test(text) && wordCount < 20) {
      text = `${text} (Please provide working code with explanation.)`;
      changes.push('added_code_expectation');
    }
    if (domain && domain !== 'general' && wordCount < 15) {
      // Don't add domain if user already mentioned it
      if (!new RegExp(domain, 'i').test(text)) {
        text = `${text} (Context: ${domain})`;
        changes.push('added_domain_context');
      }
    }

    // Score: 0-100, based on original clarity
    const score = Math.max(0, 100 - issues.length * 20 - (wordCount < 5 ? 30 : 0));

    return {
      improved: text,
      original: prompt,
      changes,
      issues,
      score,
      wasImproved: text !== prompt.trim(),
    };
  }

  /**
   * Quick check — is this prompt clear enough to proceed without improvement?
   */
  isClear(prompt) {
    const result = this.improve(prompt);
    return result.score >= 70 && result.issues.length === 0;
  }

  /**
   * Get improvement score only (cheaper, no text transformation).
   */
  score(prompt) {
    if (!prompt || typeof prompt !== 'string') return 0;
    const text = prompt.trim();
    const wordCount = text.split(/\s+/).length;
    const issueCount = VAGUE_SIGNALS.filter(({ re }) => re.test(text)).length;
    return Math.max(0, 100 - issueCount * 20 - (wordCount < 5 ? 30 : 0));
  }
}

let _instance = null;
function getPromptIR() {
  if (!_instance) _instance = new PromptIR();
  return _instance;
}

module.exports = { PromptIR, getPromptIR };
