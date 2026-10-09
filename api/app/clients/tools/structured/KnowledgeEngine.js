const { Tool } = require('@librechat/agents/langchain/tools');
const {
  universalSearch,
  verifyClaim,
  synthesizeAnswer,
} = require('~/server/services/UniversalSearch/UniversalSearchService');

const knowledgeEngineJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description:
        'The factual question or claim to research and verify. The engine searches multiple sources, detects contradictions, and returns evidence with numbered citations [1], [2], etc.',
    },
    synthesize: {
      type: 'boolean',
      description:
        'When true (default), the engine also writes a concise answer in Spanish with numbered citations [n] using the local LLM. Set false to only get evidence and the verdict.',
    },
    max_results: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: 'Maximum number of evidence sources to return. Defaults to 6.',
    },
  },
  required: ['query'],
};

/**
 * KnowledgeEngine — verificación factual + búsqueda universal para agentes
 * (FASE 39). Usa el UniversalSearchService del proyecto (SearchRuntime
 * DuckDuckGo→Bing, sin API keys) y, opcionalmente, el LLM local de Ollama
 * para redactar una respuesta concisa con citas [n].
 *
 * El resultado devuelve: veredicto (CORROBORATED / CONTRADICTED /
 * SINGLE_SOURCE / NO_EVIDENCE / INCONCLUSIVE), confianza, fuentes
 * independientes y la evidencia numerada para que el agente cite.
 */
class KnowledgeEngine extends Tool {
  static lc_name() {
    return 'knowledge_engine';
  }

  static get jsonSchema() {
    return knowledgeEngineJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'knowledge_engine';
    this.description =
      'Universal knowledge engine with factual verification. Researches a question or claim across multiple web sources, detects contradictions between independent domains, and returns evidence with numbered citations [1], [2]... plus an optional concise answer in Spanish citing those sources. No API key required. Use this for fact-checking, current events, documentation lookups and any question that benefits from verifiable sources.';
    this.schema = knowledgeEngineJsonSchema;
    this.maxResults = fields.maxResults ?? 6;
  }

  async _call(input) {
    const { query, synthesize = true, max_results = this.maxResults } = input;
    const q = String(query || '').trim();
    if (!q) {
      return JSON.stringify({
        success: false,
        error: 'Consulta vacía. Proporciona una pregunta o afirmación.',
      });
    }

    try {
      const verified = await verifyClaim(q, { maxResults: Math.min(max_results, 10) });
      const evidence = (verified.evidence ?? []).map((e, i) => ({
        index: i + 1,
        title: e.title,
        url: e.url,
        domain: e.domain,
        type: e.type,
        stance: e.stance,
        snippet: e.snippet,
        authority: e.authority,
        reliability: e.reliability,
      }));

      let answer = null;
      if (synthesize !== false) {
        answer = await synthesizeAnswer(q, verified);
      }

      return JSON.stringify({
        success: verified.success !== false,
        query: q,
        verdict: verified.verdict,
        confidence: verified.confidence,
        independentSupportingSources: verified.independentSupportingSources,
        independentContradictingSources: verified.independentContradictingSources,
        note: verified.note,
        answer,
        evidence,
        instructions:
          'If answer is present, use it and cite sources as [1], [2] exactly as numbered. If answer is null, answer using the evidence and cite the URLs with [n] matching the index field.',
      });
    } catch (error) {
      throw new Error(`Knowledge Engine failed: ${error?.message ?? String(error)}`);
    }
  }
}

module.exports = KnowledgeEngine;
