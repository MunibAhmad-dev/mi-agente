const { Tool } = require('@librechat/agents/langchain/tools');
const { getSearchRuntime } = require('~/server/services/SearchRuntime');

const duckDuckGoSearchJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The web search query string.',
    },
    max_results: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: 'The maximum number of search results to return. Defaults to 5.',
    },
  },
  required: ['query'],
};

/**
 * DuckDuckGoSearch — búsqueda web SIN API keys usando el SearchRuntime del
 * proyecto (DuckDuckGo, gratuito). FASE 31: los agentes pueden usar la
 * herramienta web_search aunque no haya claves de Serper/Tavily/SearXNG
 * configuradas.
 */
class DuckDuckGoSearch extends Tool {
  static lc_name() {
    return 'duckduckgo_search';
  }

  static get jsonSchema() {
    return duckDuckGoSearchJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'duckduckgo_search';
    this.description =
      'A free web search engine (DuckDuckGo) with no API key required. Useful for answering questions about current events, finding documentation, and general web research. Returns up to 10 results with title, URL and snippet.';
    this.schema = duckDuckGoSearchJsonSchema;
    this.maxResults = fields.maxResults ?? 5;
    this.runtime =
      fields.runtime ?? getSearchRuntime({ defaultProvider: 'duckduckgo', maxResults: 10 });
  }

  async _call(input) {
    const { query, max_results = this.maxResults } = input;
    try {
      const result = await this.runtime.execute({
        intent: 'web_search',
        query,
        provider: 'duckduckgo',
        maxResults: Math.min(max_results, 10),
      });
      return JSON.stringify({
        query,
        provider: result.provider,
        total: result.total,
        results: (result.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source,
        })),
      });
    } catch (error) {
      throw new Error(`DuckDuckGo search failed: ${error?.message ?? String(error)}`);
    }
  }
}

module.exports = DuckDuckGoSearch;
