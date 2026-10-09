'use strict';

/**
 * UniversalAgentAbstraction — Gen B Phase 1.
 * Model-agnostic wrapper that wraps any LLM provider with the full cognitive pipeline.
 * Takes any provider ID from UniversalLLMRouter and augments it with:
 *   - QuestionUnderstanding → AnswerContract → ResponseQualityGate
 *   - TaskComplexityEngine analysis
 *   - AskVsAct decision before acting
 *   - LoopDetection to prevent circular reasoning
 */

let _router = null;
function getRouter() {
  if (!_router) {
    try {
      const { UniversalLLMRouter } = require('~/server/services/Harness/cognitive/llm/UniversalLLMRouter');
      _router = new UniversalLLMRouter();
    } catch {
      _router = null;
    }
  }
  return _router;
}

class UniversalAgentAbstraction {
  constructor() {
    this._sessionContexts = new Map();
    this.stats = { routes: 0, pipelineRuns: 0, errors: 0 };
  }

  /**
   * Route a prompt through the full cognitive pipeline.
   * @param {string} prompt  - Raw user prompt
   * @param {object} context - { sessionId, provider, model, history, options }
   * @returns {object} { content, contract, quality, complexity, decision, provider, stats }
   */
  async route(prompt, context = {}) {
    try {
      this.stats.routes++;
      const sessionId = context.sessionId || `session_${Date.now()}`;

      // 1. Task complexity analysis
      let complexity = null;
      try {
        const { getTaskComplexityEngine } = require('./TaskComplexityEngine');
        complexity = getTaskComplexityEngine().analyze(prompt);
      } catch { /* non-fatal */ }

      // 2. Ask-vs-Act decision
      let decision = null;
      try {
        const { getAskVsAct } = require('./AskVsAct');
        decision = getAskVsAct().evaluate(prompt, context);
        if (decision.action === 'ask') {
          return {
            action: 'ask',
            clarifyingQuestions: decision.clarifyingQuestions,
            reason: decision.reason,
            complexity,
          };
        }
      } catch { /* non-fatal */ }

      // 3. Loop detection check
      try {
        const { getLoopDetection } = require('./LoopDetection');
        const loopCheck = getLoopDetection().check(sessionId, prompt);
        if (loopCheck.loopDetected) {
          return {
            action: 'loop_detected',
            loopType: loopCheck.loopType,
            iteration: loopCheck.iteration,
            message: 'Repetitive pattern detected. Please rephrase or provide new context.',
          };
        }
      } catch { /* non-fatal */ }

      // 4. Build answer contract
      let contract = null;
      try {
        const { QuestionUnderstanding } = require('./QuestionUnderstanding');
        const { buildContract } = require('./AnswerContract');
        const profile = QuestionUnderstanding.understand(prompt);
        contract = buildContract(profile, {});
      } catch { /* non-fatal */ }

      // 5. Route to LLM
      const router = getRouter();
      let llmResult = null;
      if (router) {
        const messages = [
          ...(context.history || []),
          { role: 'user', content: prompt },
        ];
        llmResult = await router.route({
          messages,
          provider: context.provider,
          model: context.model,
          options: context.options || {},
        });
      } else {
        llmResult = { content: '[UniversalLLMRouter not available]', provider: 'none' };
      }

      // 6. Quality gate
      let quality = null;
      if (contract && llmResult && llmResult.content) {
        try {
          const { getResponseQualityGate } = require('./ResponseQualityGate');
          quality = getResponseQualityGate().gate(llmResult.content, contract, {});
        } catch { /* non-fatal */ }
      }

      this.stats.pipelineRuns++;
      return {
        content: llmResult.content,
        provider: llmResult.provider,
        model: context.model,
        contract,
        quality,
        complexity,
        decision,
        usage: llmResult.usage,
        latency: llmResult.latency,
        cost: llmResult.cost,
      };
    } catch (err) {
      this.stats.errors++;
      return { error: err.message, content: null };
    }
  }

  /**
   * Wrap a provider with defaults so callers don't need to configure it.
   * @param {string} providerId
   * @param {object} defaults  - { model, options }
   * @returns {Function} async (prompt, context) => result
   */
  wrap(providerId, defaults = {}) {
    return async (prompt, context = {}) => {
      return this.route(prompt, { ...defaults, ...context, provider: providerId });
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getUniversalAgentAbstraction() {
  if (!_instance) _instance = new UniversalAgentAbstraction();
  return _instance;
}

module.exports = { UniversalAgentAbstraction, getUniversalAgentAbstraction };
