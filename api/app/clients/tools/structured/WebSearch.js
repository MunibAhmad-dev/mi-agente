const { Tool } = require('@librechat/agents/langchain/tools');
const { getSearchRuntime } = require('~/server/services/SearchRuntime');

const webSearchJsonSchema = {
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
      description: 'The maximum number of search results to return. Defaults to 8.',
    },
  },
  required: ['query'],
};

/**
 * WebSearch — Self-hosted web search tool for agents.
 *
 * Uses Whoogle (MIT/ISC, self-hosted, no API key, no censorship) as the
 * primary provider, with automatic fallback to DuckDuckGo → Bing → Tavily.
 * Covers the "Web Search as agent tool" gap from the project's master prompt.
 *
 * License: MIT/ISC (Whoogle upstream)
 */
class WebSearch extends Tool {
  static lc_name() {
    return 'web_search';
  }

  static get jsonSchema() {
    return webSearchJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'web_search';
    this.description =
      'Search the web using a self-hosted search engine (Whoogle, no API key, no censorship). ' +
      'Useful for answering questions about current events, finding documentation, researching ' +
      'technical topics, and general web research. Returns up to 10 results with title, URL and snippet.';
    this.schema = webSearchJsonSchema;
    this.maxResults = fields.maxResults ?? 8;
    this.runtime =
      fields.runtime ??
      getSearchRuntime({
        defaultProvider: 'whoogle',
        whoogleUrl: process.env.WHOOGLE_URL,
        maxResults: 10,
      });
  }

  async _call(input) {
    const { query, max_results = this.maxResults } = input;
    try {
      const result = await this.runtime.execute({
        intent: 'web_search',
        query,
        provider: 'whoogle',
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
      throw new Error(`Web search failed: ${error?.message ?? String(error)}`);
    }
  }
}

module.exports = WebSearch;
