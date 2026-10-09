'use strict';

/**
 * AICouncil — Face 10.
 * Multi-model decision making panel.
 * Each council member (LLM) votes on a proposal; majority or consensus rules.
 */

const axios = require('axios');

async function consultOllama(model, question, context = '') {
  const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const prompt = `${context ? 'Context: ' + context + '\n\n' : ''}Question for the council: ${question}

Respond ONLY with JSON: {"vote":"yes|no|abstain","confidence":<0.0-1.0>,"reasoning":"<1-2 sentences>"}`;
  const resp = await axios.post(`${ollamaUrl}/api/generate`, { model, prompt, stream: false }, { timeout: 60000 });
  const raw = resp.data.response || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { vote: 'abstain', confidence: 0.5, reasoning: raw.substring(0, 100), model, provider: 'ollama' };
  const parsed = JSON.parse(jsonMatch[0]);
  return { ...parsed, model, provider: 'ollama' };
}

const DEFAULT_MEMBERS = [
  { id: 'member_1', name: 'Analyst', model: process.env.COUNCIL_MODEL_1 || process.env.OLLAMA_MODEL || 'llama3.2', provider: 'ollama' },
  { id: 'member_2', name: 'Critic', model: process.env.COUNCIL_MODEL_2 || process.env.OLLAMA_MODEL || 'llama3.2', provider: 'ollama' },
  { id: 'member_3', name: 'Advocate', model: process.env.COUNCIL_MODEL_3 || process.env.OLLAMA_MODEL || 'llama3.2', provider: 'ollama' },
];

class AICouncil {
  constructor(members = DEFAULT_MEMBERS) {
    this.members = members;
    this._sessions = [];
  }

  async deliberate({ question, context, require_consensus = false }) {
    const sessionId = `council_${Date.now()}`;
    const votes = await Promise.allSettled(
      this.members.map((m) => consultOllama(m.model, question, context)),
    );

    const results = votes.map((r, i) => ({
      member_id: this.members[i].id,
      member_name: this.members[i].name,
      ...(r.status === 'fulfilled' ? r.value : { vote: 'abstain', confidence: 0, error: r.reason?.message }),
    }));

    const yes = results.filter((r) => r.vote === 'yes');
    const no = results.filter((r) => r.vote === 'no');
    const abstain = results.filter((r) => r.vote === 'abstain');
    const total_votes = yes.length + no.length;

    let decision, consensus;
    if (require_consensus) {
      consensus = yes.length === this.members.length || no.length === this.members.length;
      decision = consensus ? (yes.length > 0 ? 'approved' : 'rejected') : 'no_consensus';
    } else {
      decision = yes.length > no.length ? 'approved' : (no.length > yes.length ? 'rejected' : 'tie');
      consensus = yes.length === total_votes || no.length === total_votes;
    }

    const avgConfidence = results.filter((r) => r.confidence != null).reduce((s, r, _, a) => s + r.confidence / a.length, 0);
    const session = {
      sessionId,
      question,
      decision,
      consensus,
      votes: { yes: yes.length, no: no.length, abstain: abstain.length },
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      results,
      deliberated_at: new Date().toISOString(),
    };
    this._sessions.push(session);
    return session;
  }

  getHistory(limit = 20) { return this._sessions.slice(-limit); }
  getMembers() { return [...this.members]; }
}

let _instance = null;
function getAICouncil() {
  if (!_instance) _instance = new AICouncil();
  return _instance;
}

module.exports = { AICouncil, getAICouncil };
