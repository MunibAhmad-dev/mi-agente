'use strict';

/**
 * autonomousResearch.js — Face 10: Autonomous Research Engine.
 *
 * Implements the full research loop:
 *   identify unknown → plan research → search + verify → form hypothesis
 *   → experiment (optional) → extract lesson → create/update Skill
 *
 * Depends on the existing deepResearch service + universalSearch for evidence,
 * and the LearningEngine for lesson persistence.
 */

const CONFIDENCE_THRESHOLD = 0.6;

/* ------------------------------------------------------------------ */
/* Confidence assessment — does the agent "know" this already?        */
/* ------------------------------------------------------------------ */

function assessConfidence(question, ragResults = []) {
  if (!ragResults || ragResults.length === 0) return { confidence: 0, sources: [] };
  const keywords = question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  let matched = 0;
  for (const r of ragResults) {
    const text = (r.text || r.content || r.snippet || '').toLowerCase();
    if (keywords.some((k) => text.includes(k))) matched++;
  }
  const confidence = Math.min(matched / Math.max(keywords.length, 1), 1);
  return { confidence, sources: ragResults.slice(0, 3) };
}

/* ------------------------------------------------------------------ */
/* Research planning — what sub-questions to investigate?             */
/* ------------------------------------------------------------------ */

function planResearch(question, maxSubQuestions = 4) {
  const parts = question
    .split(/[?;]|\band\b|\bor\b|\bpero\b|\by\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  const subQuestions = [question, ...parts].slice(0, maxSubQuestions);
  return { subQuestions, plan: `Research ${subQuestions.length} sub-questions` };
}

/* ------------------------------------------------------------------ */
/* Hypothesis generation — infer from evidence                        */
/* ------------------------------------------------------------------ */

function generateHypothesis(question, evidence = []) {
  if (!evidence.length) {
    return {
      hypothesis: `Insufficient evidence to form a confident hypothesis about: ${question}`,
      confidence: 0,
      evidenceCount: 0,
    };
  }
  const domains = [...new Set(evidence.map((e) => e.domain || e.source).filter(Boolean))];
  const confidence = Math.min(evidence.length / 5, 1);
  const snippets = evidence
    .slice(0, 3)
    .map((e) => e.snippet || e.text || '')
    .filter(Boolean);
  return {
    hypothesis: snippets.length
      ? `Based on ${evidence.length} sources across ${domains.length} domains: ${snippets[0].slice(0, 200)}`
      : `Based on ${evidence.length} sources across ${domains.length} domains.`,
    confidence,
    evidenceCount: evidence.length,
    domains,
  };
}

/* ------------------------------------------------------------------ */
/* Skill creation — persist learned knowledge as a reusable skill     */
/* ------------------------------------------------------------------ */

async function createSkillFromResearch({ question, hypothesis, evidence, verdict, userId }) {
  let db;
  try {
    db = require('~/models/ExperienceReplay');
  } catch {
    db = null;
  }

  const skill = {
    id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'research-derived',
    question,
    hypothesis: hypothesis.hypothesis,
    confidence: hypothesis.confidence,
    evidenceCount: hypothesis.evidenceCount,
    domains: hypothesis.domains || [],
    verdict,
    createdAt: new Date().toISOString(),
    userId,
  };

  if (db && db.saveExperience) {
    try {
      await db.saveExperience({
        userId,
        task: question,
        taskType: 'research',
        outcome: hypothesis.confidence >= CONFIDENCE_THRESHOLD ? 'success' : 'partial',
        score: hypothesis.confidence,
        result: { skill, evidence: evidence.slice(0, 5) },
      });
    } catch (err) {
      console.warn('[autonomousResearch] Could not persist skill:', err.message);
    }
  }

  return skill;
}

/* ------------------------------------------------------------------ */
/* Main: full autonomous research loop                                */
/* ------------------------------------------------------------------ */

/**
 * runAutonomousResearch
 * @param {string} question  — The unknown the agent encountered
 * @param {object} opts
 * @param {string} [opts.userId]
 * @param {boolean} [opts.skipIfConfident]  — Return early if RAG already has an answer
 * @param {boolean} [opts.createSkill]      — Persist lesson as a skill (default true)
 * @param {number}  [opts.maxSubQuestions]
 * @param {Function} [opts.search]          — Injected for testing
 * @param {Function} [opts.verify]          — Injected for testing
 * @returns {Promise<AutonomousResearchResult>}
 */
async function runAutonomousResearch(question, opts = {}) {
  const {
    userId = null,
    skipIfConfident = true,
    createSkill: doCreateSkill = true,
    maxSubQuestions = 4,
  } = opts;

  const steps = [];
  const log = (step, data = {}) => {
    steps.push({ step, ts: Date.now(), ...data });
  };

  log('start', { question });

  // ── 1. Confidence check ─────────────────────────────────────────
  const { confidence: priorConfidence } = assessConfidence(question);
  log('confidence_check', { priorConfidence });
  if (skipIfConfident && priorConfidence >= CONFIDENCE_THRESHOLD) {
    return {
      question,
      skipped: true,
      reason: 'Already confident from prior knowledge',
      confidence: priorConfidence,
      steps,
    };
  }

  // ── 2. Research planning ────────────────────────────────────────
  const { subQuestions, plan } = planResearch(question, maxSubQuestions);
  log('plan', { plan, subQuestions });

  // ── 3. Research execution (deep research) ──────────────────────
  let researchResult = null;
  try {
    const deepResearch = opts.search
      ? { runDeepResearch: opts.search }
      : require('~/server/services/AgentArchitect/deepResearch');
    researchResult = await deepResearch.runDeepResearch(question, {
      maxSubQueries: maxSubQuestions,
      maxSources: 8,
    });
    log('research_done', {
      sourcesFound: researchResult.sources?.length || 0,
      subResults: researchResult.subResults?.length || 0,
    });
  } catch (err) {
    log('research_error', { error: err.message });
    researchResult = { sources: [], subResults: [], answer: null };
  }

  // ── 4. Evidence collection & verification ──────────────────────
  const evidence = researchResult.sources || [];
  let verdict = 'NO_EVIDENCE';
  if (evidence.length >= 3) verdict = 'CORROBORATED';
  else if (evidence.length >= 1) verdict = 'SINGLE_SOURCE';
  log('evidence', { count: evidence.length, verdict });

  // ── 5. Hypothesis generation ───────────────────────────────────
  const hypothesis = generateHypothesis(question, evidence);
  log('hypothesis', { confidence: hypothesis.confidence });

  // ── 6. Skill creation ──────────────────────────────────────────
  let skill = null;
  if (doCreateSkill && hypothesis.confidence > 0) {
    skill = await createSkillFromResearch({ question, hypothesis, evidence, verdict, userId });
    log('skill_created', { skillId: skill.id });
  }

  return {
    question,
    subQuestions,
    evidence: evidence.slice(0, 8),
    verdict,
    hypothesis,
    answer: researchResult.answer || null,
    skill,
    confidence: hypothesis.confidence,
    steps,
  };
}

module.exports = { runAutonomousResearch, assessConfidence, planResearch, generateHypothesis };
