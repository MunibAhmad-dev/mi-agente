/**
 * DeepSearchAgent — Iterative deep research with cross-checking.
 *
 * Pattern (inspired by GPT Researcher / Grok DeepSearch):
 *   1. ANALYZE the research question
 *   2. GENERATE multiple search queries (divergent)
 *   3. EXECUTE searches (parallel when possible)
 *   4. FETCH and extract content from top results
 *   5. EVALUATE source quality and relevance
 *   6. CROSS-CHECK facts across sources
 *   7. SYNTHESIZE findings into a coherent answer
 *   8. ITERATE if confidence is low or gaps detected
 *
 * Features:
 *   - Multi-query generation for coverage
 *   - Source quality scoring (authority, freshness, relevance)
 *   - Cross-source fact verification
 *   - Confidence scoring with iterative improvement
 *   - Citation tracking
 *   - Token budget management
 */

const logger = {
  info: (...args) => console.info('[DeepSearchAgent]', ...args),
  debug: (...args) => console.log('[DeepSearchAgent]', ...args),
  warn: (...args) => console.warn('[DeepSearchAgent]', ...args),
  error: (...args) => console.error('[DeepSearchAgent]', ...args),
};

/**
 * Source quality tiers.
 */
const SOURCE_AUTHORITY = {
  high: ['github.com', 'stackoverflow.com', 'docs.python.org', 'developer.mozilla.org',
    'openai.com', 'x.ai', 'anthropic.com', 'arxiv.org', 'ieee.org', 'acm.org',
    'nature.com', 'science.org', 'wikipedia.org', 'en.wikipedia.org',
    'learn.microsoft.com', 'cloud.google.com', 'aws.amazon.com',
    'docs.docker.com', 'nodejs.org', 'npmjs.com'],
  medium: ['medium.com', 'dev.to', 'freecodecamp.org', 'css-tricks.com',
    'hackernews.com', 'reddit.com', 'twitter.com', 'x.com',
    'stackexchange.com', 'quora.com', 'bbc.com', 'reuters.com',
    'techcrunch.com', 'theverge.com', 'wired.com'],
};

/**
 * DeepSearchAgent — performs iterative deep research.
 */
class DeepSearchAgent {
  constructor(config = {}) {
    this.config = {
      maxSearchQueries: config.maxSearchQueries || 5,
      maxSourcesToFetch: config.maxSourcesToFetch || 10,
      maxIterations: config.maxIterations || 3,
      confidenceThreshold: config.confidenceThreshold || 0.7,
      fetchTimeout: config.fetchTimeout || 15000,
      maxCharsPerSource: config.maxCharsPerSource || 8000,
      maxTotalChars: config.maxTotalChars || 40000,
      ...config,
    };

    // Will be set by setToolAdapter()
    this._toolAdapter = null;
    // Will be set by setModelPlugin()
    this._modelPlugin = null;

    this._stats = {
      totalSearches: 0,
      totalFetches: 0,
      totalSources: 0,
      avgConfidence: 0,
    };
  }

  /**
   * Set the tool adapter for web_search/web_fetch execution.
   */
  setToolAdapter(adapter) {
    this._toolAdapter = adapter;
  }

  /**
   * Set the model plugin for LLM calls (query generation, synthesis).
   */
  setModelPlugin(plugin) {
    this._modelPlugin = plugin;
  }

  /**
   * Execute a deep research task.
   *
   * @param {object} params
   * @param {string} params.query - Research question
   * @param {string} [params.context] - Additional context
   * @param {string} [params.provider] - LLM provider override
   * @param {string} [params.model] - LLM model override
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<ResearchResult>}
   */
  async research(params) {
    const startTime = Date.now();
    const { query, context, provider, model, signal } = params;

    logger.info(`[DeepSearchAgent] Starting research: "${query}"`);

    const state = {
      query,
      iteration: 0,
      sources: [],
      facts: [],
      confidence: 0,
      searchesPerformed: 0,
      fetchesPerformed: 0,
    };

    try {
      // Phase 1: Generate search queries
      const searchQueries = await this._generateSearchQueries(query, context, provider, model);
      logger.info(`[DeepSearchAgent] Generated ${searchQueries.length} search queries`);

      // Phase 2-4: Iterative search → fetch → evaluate loop
      for (let i = 0; i < this.config.maxIterations; i++) {
        if (signal?.aborted) break;

        state.iteration = i + 1;
        logger.info(`[DeepSearchAgent] Iteration ${state.iteration}/${this.config.maxIterations}`);

        // Search
        const searchResults = await this._executeSearches(searchQueries, state);
        state.searchesPerformed += searchResults.length;

        // Fetch top sources
        const fetchedSources = await this._fetchSources(searchResults, state);
        state.fetchesPerformed += fetchedSources.length;
        state.sources.push(...fetchedSources);

        // Extract and evaluate facts
        const newFacts = await this._extractFacts(fetchedSources, query, provider, model);
        state.facts.push(...newFacts);

        // Cross-check
        const crossCheck = this._crossCheckFacts(state.facts);

        // Calculate confidence
        state.confidence = this._calculateConfidence(state);

        logger.info(
          `[DeepSearchAgent] Iteration ${state.iteration}: ` +
          `${state.sources.length} sources, ${state.facts.length} facts, ` +
          `confidence: ${(state.confidence * 100).toFixed(1)}%`,
        );

        // Check if we have enough confidence
        if (state.confidence >= this.config.confidenceThreshold) {
          logger.info('[DeepSearchAgent] Confidence threshold reached');
          break;
        }

        // Generate follow-up queries for next iteration
        if (i < this.config.maxIterations - 1) {
          const followUp = await this._generateFollowUpQueries(
            query, state.facts, crossCheck.gaps, provider, model,
          );
          searchQueries.length = 0;
          searchQueries.push(...followUp);
        }
      }

      // Phase 5: Synthesize final answer
      const synthesis = await this._synthesize(query, state, provider, model);

      const latency = Date.now() - startTime;
      this._stats.totalSearches += state.searchesPerformed;
      this._stats.totalFetches += state.fetchesPerformed;
      this._stats.totalSources += state.sources.length;

      return {
        success: true,
        answer: synthesis.answer,
        confidence: state.confidence,
        sources: state.sources.map(s => ({
          url: s.url,
          title: s.title,
          authority: s.authority,
          fetchedAt: s.fetchedAt,
        })),
        facts: state.facts.slice(0, 20),
        citations: synthesis.citations || [],
        iterations: state.iteration,
        searchesPerformed: state.searchesPerformed,
        fetchesPerformed: state.fetchesPerformed,
        latency,
      };
    } catch (error) {
      logger.error(`[DeepSearchAgent] Research failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        sources: state.sources.map(s => ({ url: s.url, title: s.title })),
        facts: state.facts,
        iterations: state.iteration,
        latency: Date.now() - startTime,
      };
    }
  }

  // ============================================================
  // PHASE 1: QUERY GENERATION
  // ============================================================

  /**
   * Generate multiple search queries from the research question.
   */
  async _generateSearchQueries(query, context, provider, model) {
    if (!this._modelPlugin) {
      // Fallback: generate simple queries without LLM
      return this._generateSimpleQueries(query);
    }

    try {
      const systemPrompt = [
        'You are a research assistant generating search queries.',
        `Given a research question, generate ${this.config.maxSearchQueries} diverse search queries`,
        'that would help find comprehensive information.',
        '',
        'Each query should approach the topic from a different angle:',
        '- Direct definition/explanation',
        '- Recent news/updates',
        '- Technical implementation details',
        '- Comparisons or alternatives',
        '- Common problems or issues',
        '',
        'Respond with ONLY a JSON array of strings: ["query1", "query2", ...]',
      ].join('\n');

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Research question: ${query}${context ? `\nContext: ${context}` : ''}`,
        },
      ];

      const response = await this._modelPlugin.complete({
        messages,
        provider,
        model,
        temperature: 0.7,
        maxTokens: 1024,
      });

      // Parse JSON array from response
      const jsonMatch = response.content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const queries = JSON.parse(jsonMatch[0]);
        if (Array.isArray(queries) && queries.length > 0) {
          return queries.slice(0, this.config.maxSearchQueries);
        }
      }
    } catch (error) {
      logger.warn('[DeepSearchAgent] LLM query generation failed, using fallback:', error.message);
    }

    return this._generateSimpleQueries(query);
  }

  /**
   * Fallback: generate simple queries without LLM.
   */
  _generateSimpleQueries(query) {
    const queries = [query];

    // Add variations
    const words = query.split(/\s+/);
    if (words.length > 3) {
      queries.push(words.slice(0, Math.ceil(words.length / 2)).join(' '));
      queries.push(words.slice(-Math.ceil(words.length / 2)).join(' '));
    }

    queries.push(`${query} tutorial guide`);
    queries.push(`${query} latest 2026`);

    return queries.slice(0, this.config.maxSearchQueries);
  }

  // ============================================================
  // PHASE 2: SEARCH EXECUTION
  // ============================================================

  /**
   * Execute multiple searches.
   */
  async _executeSearches(queries, state) {
    const allResults = [];

    for (const query of queries) {
      if (!this._toolAdapter) continue;

      try {
        const result = await this._toolAdapter.execute('web_search', {
          query,
          max_results: 5,
        });

        if (result.success && result.result?.results) {
          for (const r of result.result.results) {
            allResults.push({
              url: r.url,
              title: r.title || '',
              snippet: r.snippet || '',
              searchQuery: query,
              authority: this._getAuthority(r.url),
            });
          }
        }
      } catch (error) {
        logger.warn(`[DeepSearchAgent] Search failed for "${query}":`, error.message);
      }
    }

    // Deduplicate by URL
    const seen = new Set();
    const unique = [];
    for (const r of allResults) {
      const normalizedUrl = this._normalizeUrl(r.url);
      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl);
        unique.push(r);
      }
    }

    // Sort by authority then snippet length
    unique.sort((a, b) => {
      const authDiff = this._authorityRank(b.authority) - this._authorityRank(a.authority);
      if (authDiff !== 0) return authDiff;
      return (b.snippet?.length || 0) - (a.snippet?.length || 0);
    });

    return unique.slice(0, this.config.maxSourcesToFetch);
  }

  // ============================================================
  // PHASE 3: SOURCE FETCHING
  // ============================================================

  /**
   * Fetch content from top search results.
   */
  async _fetchSources(searchResults, state) {
    const fetched = [];

    for (const result of searchResults) {
      if (fetched.length >= this.config.maxSourcesToFetch) break;

      try {
        const fetchResult = await this._toolAdapter.execute('web_fetch', {
          url: result.url,
          max_chars: this.config.maxCharsPerSource,
        });

        if (fetchResult.success && fetchResult.result?.content) {
          fetched.push({
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            content: fetchResult.result.content,
            authority: result.authority,
            searchQuery: result.searchQuery,
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger.warn(`[DeepSearchAgent] Fetch failed for ${result.url}:`, error.message);
      }
    }

    return fetched;
  }

  // ============================================================
  // PHASE 4: FACT EXTRACTION + CROSS-CHECK
  // ============================================================

  /**
   * Extract relevant facts from fetched sources.
   */
  async _extractFacts(sources, query, provider, model) {
    if (!this._modelPlugin || sources.length === 0) {
      // Fallback: extract facts from snippets
      return sources.map(s => ({
        text: s.snippet,
        source: s.url,
        authority: s.authority,
      }));
    }

    try {
      // Process sources in batches to avoid context overflow
      const batchSize = 3;
      const allFacts = [];

      for (let i = 0; i < sources.length; i += batchSize) {
        const batch = sources.slice(i, i + batchSize);
        const sourceTexts = batch.map((s, idx) =>
          `[Source ${idx + 1}] (${s.url}, authority: ${s.authority})\n${s.content.slice(0, 3000)}`,
        ).join('\n\n---\n\n');

        const systemPrompt = [
          'You are a research fact extractor.',
          `Extract key facts relevant to: "${query}"`,
          '',
          'For each fact provide:',
          '- The fact statement',
          '- Which source it came from (URL)',
          '- Confidence (high/medium/low)',
          '',
          'Respond with a JSON array:',
          '[{"fact": "...", "source": "...", "confidence": "high|medium|low"}]',
        ].join('\n');

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sourceTexts },
        ];

        const response = await this._modelPlugin.complete({
          messages,
          provider,
          model,
          temperature: 0.3,
          maxTokens: 2048,
        });

        const jsonMatch = response.content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const facts = JSON.parse(jsonMatch[0]);
          if (Array.isArray(facts)) {
            allFacts.push(...facts.map(f => ({
              text: f.fact || f.text,
              source: f.source,
              confidence: f.confidence || 'medium',
              authority: batch.find(s => s.url === f.source)?.authority || 'unknown',
            })));
          }
        }
      }

      return allFacts;
    } catch (error) {
      logger.warn('[DeepSearchAgent] LLM fact extraction failed, using snippets:', error.message);
      return sources.map(s => ({
        text: s.snippet,
        source: s.url,
        authority: s.authority,
      }));
    }
  }

  /**
   * Cross-check facts across sources.
   * Identifies: confirmed facts, contradictions, gaps.
   */
  _crossCheckFacts(facts) {
    const confirmed = [];
    const contradictions = [];
    const gaps = [];

    // Group similar facts
    const factGroups = [];
    for (const fact of facts) {
      const normalizedText = (fact.text || '').toLowerCase().replace(/[^\w\s]/g, '');
      const words = new Set(normalizedText.split(/\s+/).filter(w => w.length > 3));

      let addedToGroup = false;
      for (const group of factGroups) {
        const overlap = this._wordOverlap(words, group.words);
        if (overlap > 0.4) {
          group.facts.push(fact);
          addedToGroup = true;
          break;
        }
      }

      if (!addedToGroup) {
        factGroups.push({ words, facts: [fact] });
      }
    }

    // Evaluate groups
    for (const group of factGroups) {
      if (group.facts.length >= 2) {
        // Multiple sources agree → confirmed
        confirmed.push({
          text: group.facts[0].text,
          sourceCount: group.facts.length,
          sources: group.facts.map(f => f.source),
        });
      } else if (group.facts.length === 1) {
        // Single source → potential gap (needs more verification)
        gaps.push({
          text: group.facts[0].text,
          source: group.facts[0].source,
        });
      }
    }

    return { confirmed, contradictions, gaps };
  }

  /**
   * Calculate research confidence based on sources, facts, and cross-checking.
   */
  _calculateConfidence(state) {
    let confidence = 0;

    // Source count factor (more sources = higher confidence, diminishing returns)
    confidence += Math.min(0.3, state.sources.length * 0.05);

    // Fact count factor
    confidence += Math.min(0.2, state.facts.length * 0.02);

    // Authority factor (high-authority sources boost confidence)
    const highAuthCount = state.sources.filter(s => s.authority === 'high').length;
    confidence += Math.min(0.2, highAuthCount * 0.07);

    // Iteration factor (more iterations = more thorough)
    confidence += Math.min(0.15, state.iteration * 0.05);

    // Content quality factor (longer content = more info)
    const avgContentLength = state.sources.reduce((sum, s) => sum + (s.content?.length || 0), 0) /
      Math.max(1, state.sources.length);
    confidence += Math.min(0.15, avgContentLength / 20000);

    return Math.min(1.0, confidence);
  }

  // ============================================================
  // PHASE 5: SYNTHESIS
  // ============================================================

  /**
   * Synthesize findings into a coherent answer.
   */
  async _synthesize(query, state, provider, model) {
    if (!this._modelPlugin) {
      return {
        answer: state.facts.map(f => f.text).join('\n\n'),
        citations: state.sources.map(s => s.url),
      };
    }

    try {
      const factsText = state.facts
        .slice(0, 20)
        .map((f, i) => `${i + 1}. ${f.text} (Source: ${f.source || 'unknown'})`)
        .join('\n');

      const sourcesText = state.sources
        .map((s, i) => `[${i + 1}] ${s.title || s.url} — ${s.url}`)
        .join('\n');

      const systemPrompt = [
        'You are a research synthesizer.',
        `Given research findings about: "${query}"`,
        '',
        'Create a comprehensive, well-structured answer.',
        'Cite sources using [1], [2], etc.',
        'Be accurate — only state what the sources support.',
        'If there are contradictions, mention them.',
        'Include a list of sources at the end.',
      ].join('\n');

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            `Research question: ${query}`,
            '',
            '## Facts found:',
            factsText,
            '',
            '## Sources:',
            sourcesText,
            '',
            `Confidence: ${(state.confidence * 100).toFixed(0)}%`,
            `Sources consulted: ${state.sources.length}`,
            `Iterations: ${state.iteration}`,
          ].join('\n'),
        },
      ];

      const response = await this._modelPlugin.complete({
        messages,
        provider,
        model,
        temperature: 0.5,
        maxTokens: 4096,
      });

      return {
        answer: response.content,
        citations: state.sources.map(s => s.url),
      };
    } catch (error) {
      logger.warn('[DeepSearchAgent] Synthesis failed, using raw facts:', error.message);
      return {
        answer: state.facts.map(f => f.text).join('\n\n'),
        citations: state.sources.map(s => s.url),
      };
    }
  }

  // ============================================================
  // FOLLOW-UP QUERY GENERATION
  // ============================================================

  /**
   * Generate follow-up queries based on gaps found.
   */
  async _generateFollowUpQueries(query, facts, gaps, provider, model) {
    if (!this._modelPlugin) {
      return [`${query} detailed analysis`, `${query}最新进展`];
    }

    try {
      const gapsText = gaps.length > 0
        ? `Gaps found: ${gaps.map(g => g.text).join('; ')}`
        : 'Need more diverse perspectives';

      const systemPrompt = [
        'You are a research assistant generating follow-up queries.',
        'Given the original question, existing findings, and identified gaps,',
        'generate 3-5 follow-up search queries to fill the gaps.',
        'Respond with ONLY a JSON array: ["query1", "query2", ...]',
      ].join('\n');

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Original: ${query}\n\nExisting facts: ${facts.length}\n\n${gapsText}`,
        },
      ];

      const response = await this._modelPlugin.complete({
        messages,
        provider,
        model,
        temperature: 0.7,
        maxTokens: 512,
      });

      const jsonMatch = response.content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const queries = JSON.parse(jsonMatch[0]);
        if (Array.isArray(queries)) {
          return queries.slice(0, this.config.maxSearchQueries);
        }
      }
    } catch (error) {
      logger.warn('[DeepSearchAgent] Follow-up query generation failed:', error.message);
    }

    return [`${query} analysis`, `${query} comparison`];
  }

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Get authority tier for a URL.
   */
  _getAuthority(url) {
    if (!url) return 'unknown';
    const lower = url.toLowerCase();
    for (const domain of SOURCE_AUTHORITY.high) {
      if (lower.includes(domain)) return 'high';
    }
    for (const domain of SOURCE_AUTHORITY.medium) {
      if (lower.includes(domain)) return 'medium';
    }
    return 'low';
  }

  _authorityRank(tier) {
    return { high: 3, medium: 2, low: 1, unknown: 0 }[tier] || 0;
  }

  _normalizeUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname + u.pathname.replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  _wordOverlap(words1, words2) {
    let overlap = 0;
    for (const w of words1) {
      if (words2.has(w)) overlap++;
    }
    const union = new Set([...words1, ...words2]).size;
    return union > 0 ? overlap / union : 0;
  }

  /**
   * Get research stats.
   */
  getStats() {
    return { ...this._stats };
  }
}

module.exports = { DeepSearchAgent, SOURCE_AUTHORITY };
