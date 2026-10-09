'use strict';

/**
 * AICouncil — Face 10: multi-model consensus council for high-stakes decisions.
 *
 * Convenes a panel of AI models to deliberate on a question and reach
 * a weighted consensus. Supports debate mode (models see each other's
 * arguments) and independent mode (blind voting).
 *
 * Architecture: Convene → Gather opinions → Debate round(s) → Synthesize → Verdict
 */

const COUNCIL_MODES = { INDEPENDENT: 'independent', DEBATE: 'debate' };
const DEFAULT_ROUNDS = 1;

class AICouncil {
  constructor({ rounds = DEFAULT_ROUNDS, timeoutMs = 12000 } = {}) {
    this._rounds = rounds;
    this._timeoutMs = timeoutMs;
    this._sessions = [];
  }

  /**
   * Convene the council to deliberate on a question.
   * @param {object} opts
   * @param {string} opts.question - the question to deliberate on
   * @param {string[]} [opts.options] - possible answers (open-ended if omitted)
   * @param {string} [opts.context] - background context
   * @param {string} [opts.mode] - 'independent' | 'debate'
   * @param {number} [opts.minConsensus] - minimum agreement ratio (default 0.6)
   * @returns {Promise<{decision: string, confidence: number, dissent: string[], rationale: string}>}
   */
  async convene({ question, options, context = '', mode = COUNCIL_MODES.INDEPENDENT, minConsensus = 0.6 }) {
    const members = this._getAvailableMembers();

    if (members.length === 0) {
      return this._localDeliberation(question, options, context);
    }

    let opinions = await this._gatherOpinions(members, question, options, context, mode);

    if (mode === COUNCIL_MODES.DEBATE && this._rounds > 1 && opinions.length > 1) {
      for (let r = 1; r < this._rounds; r++) {
        const summary = opinions.map((o) => `[${o.model}]: ${o.opinion}`).join('\n');
        opinions = await this._gatherOpinions(members, question, options, context, mode, summary);
      }
    }

    const result = this._synthesize(opinions, options, minConsensus);

    this._sessions.push({
      id: `council_${Date.now()}`,
      question,
      mode,
      members,
      opinions,
      result,
      timestamp: new Date().toISOString(),
    });
    if (this._sessions.length > 100) this._sessions.shift();

    return result;
  }

  async _gatherOpinions(members, question, options, context, mode, priorDebate = null) {
    const prompt = this._buildCouncilPrompt(question, options, context, priorDebate);
    const results = await Promise.allSettled(
      members.map((m) => this._askMember(m, prompt)),
    );
    return results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value);
  }

  _buildCouncilPrompt(question, options, context, priorDebate) {
    let prompt = `You are a council member deliberating on an important question.\n\n`;
    if (context) prompt += `Context: ${context}\n\n`;
    prompt += `Question: ${question}\n`;
    if (options && options.length > 0) {
      prompt += `Options:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n`;
    }
    if (priorDebate) {
      prompt += `\nPrior arguments from other council members:\n${priorDebate}\n`;
      prompt += `\nConsidering the above, revise or confirm your position.\n`;
    }
    prompt += `\nRespond ONLY with JSON: {"opinion": "<your position>", "confidence": 0.0-1.0, "reasoning": "<brief rationale>"}`;
    return prompt;
  }

  async _askMember(model, prompt) {
    // Route local Ollama members (free, no API key) directly
    if (model.startsWith('ollama:')) {
      return this._askMemberOllama(model.slice(7), prompt);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      let callFn;
      try {
        const { callLLM } = require('~/server/services/LLMGateway/LLMGateway');
        callFn = (p) => callLLM(p, { model, signal: controller.signal });
      } catch {
        return null;
      }

      const raw = await callFn(prompt);
      if (!raw) return null;
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      return {
        model,
        opinion: parsed.opinion || '',
        confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
        reasoning: parsed.reasoning || '',
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  _synthesize(opinions, options, minConsensus) {
    if (opinions.length === 0) {
      return { decision: 'no consensus', confidence: 0, dissent: [], rationale: 'No council members responded' };
    }

    if (options && options.length > 0) {
      const votes = {};
      for (const opt of options) votes[opt] = 0;
      for (const o of opinions) {
        const match = options.find((opt) =>
          o.opinion.toLowerCase().includes(opt.toLowerCase()),
        );
        if (match) votes[match] = (votes[match] || 0) + 1;
      }
      const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
      const [winner, winnerVotes] = sorted[0];
      const totalVotes = opinions.length;
      const winnerRatio = winnerVotes / totalVotes;
      const dissent = opinions
        .filter((o) => !o.opinion.toLowerCase().includes(winner.toLowerCase()))
        .map((o) => `${o.model}: ${o.reasoning || o.opinion}`);

      return {
        decision: winner,
        confidence: winnerRatio,
        consensus: winnerRatio >= minConsensus,
        dissent,
        rationale: `${winnerVotes}/${totalVotes} council members agreed on "${winner}"`,
      };
    }

    const avgConf = opinions.reduce((s, o) => s + o.confidence, 0) / opinions.length;
    const majority = opinions.sort((a, b) => b.confidence - a.confidence)[0];

    return {
      decision: majority.opinion,
      confidence: avgConf,
      consensus: avgConf >= minConsensus,
      dissent: opinions.slice(1).map((o) => `${o.model}: ${o.opinion}`),
      rationale: majority.reasoning || '',
    };
  }

  _localDeliberation(question, options, context) {
    const decision = options && options.length > 0 ? options[0] : 'proceed with caution';
    return {
      decision,
      confidence: 0.3,
      consensus: false,
      dissent: [],
      rationale: 'Local deliberation only — no external models available',
    };
  }

  _getAvailableMembers() {
    const members = [];

    // Paid cloud APIs (optional — council works without them)
    if (process.env.OPENAI_API_KEY) members.push('gpt-4o-mini');
    if (process.env.ANTHROPIC_API_KEY) members.push('claude-haiku-4-5-20251001');
    if (process.env.GEMINI_API_KEY) members.push('gemini-flash-1.5');

    // Free local Ollama models — always available when Ollama is running.
    // Use three distinct model tags so the council has genuine diversity.
    const ollamaModels = (process.env.COUNCIL_OLLAMA_MODELS || 'llama3.2,mistral,phi3')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    for (const m of ollamaModels) members.push(`ollama:${m}`);

    return members;
  }

  async _askMemberOllama(modelTag, prompt) {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://localhost:11434';
    try {
      const resp = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelTag, prompt, stream: false }),
        signal: AbortSignal.timeout(this._timeoutMs),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const raw = data.response || '';
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      return {
        model: `ollama:${modelTag}`,
        opinion: parsed.opinion || '',
        confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
        reasoning: parsed.reasoning || '',
      };
    } catch {
      return null;
    }
  }

  getSessions(limit = 10) {
    return this._sessions.slice(-limit).reverse();
  }
}

let _instance = null;
function getAICouncil(opts) {
  if (!_instance) _instance = new AICouncil(opts);
  return _instance;
}

module.exports = { AICouncil, getAICouncil, COUNCIL_MODES };
