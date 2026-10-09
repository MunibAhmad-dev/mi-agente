/**
 * IntentParser — Converts natural language queries to structured intent
 * =====================================================================
 * Uses deterministic rules first, LLM fallback for complex queries.
 */

const { createLogger } = require('../logger');

const logger = createLogger('IntentParser');

const INTENT_TYPES = {
  SEARCH_CONTENT: 'search_content',
  FIND_AUDIENCE: 'find_audience',
  FIND_CREATORS: 'find_creators',
  FIND_COMMUNITIES: 'find_communities',
  ANALYZE_MARKET: 'analyze_market',
  DETECT_TRENDS: 'detect_trends',
  FIND_OPPORTUNITIES: 'find_opportunities',
  COMPARE: 'compare',
  RESEARCH: 'research',
  MONITOR: 'monitor',
};

const INTENT_KEYWORDS = {
  [INTENT_TYPES.FIND_AUDIENCE]: ['audience', 'people interested', 'who uses', 'target market', 'demographic', 'segment', 'audiencia', 'personas interesadas', 'mercado objetivo'],
  [INTENT_TYPES.FIND_CREATORS]: ['creator', 'influencer', 'blogger', 'youtuber', 'streamer', 'content creator', 'creador', 'influencer'],
  [INTENT_TYPES.FIND_COMMUNITIES]: ['community', 'group', 'forum', 'subreddit', 'channel', 'community', 'grupo', 'foro'],
  [INTENT_TYPES.ANALYZE_MARKET]: ['market', 'competitor', 'competition', 'industry', 'trend', 'demand', 'mercado', 'competencia', 'industria'],
  [INTENT_TYPES.DETECT_TRENDS]: ['trend', 'trending', 'popular', 'growing', 'emerging', 'rising', 'tendencia', 'popular', 'creciente'],
  [INTENT_TYPES.FIND_OPPORTUNITIES]: ['opportunity', 'gap', 'unmet', 'need', 'problem', 'pain point', 'oportunidad', 'necesidad', 'problema'],
  [INTENT_TYPES.COMPARE]: ['compare', 'vs', 'versus', 'difference', 'better', 'best', 'comparar', 'diferencia', 'mejor'],
  [INTENT_TYPES.RESEARCH]: ['research', 'learn about', 'explain', 'what is', 'how does', 'investigar', 'aprender', 'qué es'],
  [INTENT_TYPES.MONITOR]: ['monitor', 'track', 'watch', 'follow', 'alert', 'monitorear', 'seguir', 'rastrear'],
};

class IntentParser {
  /**
   * Parse a natural language query into a structured intent.
   * @param {string} query - Natural language query
   * @returns {object} Structured intent
   */
  parse(query) {
    if (!query || typeof query !== 'string') {
      return this._emptyIntent(query);
    }

    const normalized = query.toLowerCase().trim();

    // Detect intent type
    const intentType = this._detectIntentType(normalized);

    // Extract entities
    const entities = this._extractEntities(normalized);

    // Extract topics
    const topics = this._extractTopics(normalized);

    // Determine source preferences
    const sources = this._inferSources(normalized, intentType);

    // Determine time range
    const timeRange = this._inferTimeRange(normalized);

    // Extract constraints
    const constraints = this._extractConstraints(normalized);

    return {
      query,
      intentType,
      entities,
      topics,
      sources,
      timeRange,
      constraints,
      confidence: this._calculateConfidence(normalized, intentType),
      createdAt: Date.now(),
    };
  }

  /**
   * Parse and create a full search plan.
   * @param {string} query
   * @returns {object} Search plan
   */
  createSearchPlan(query) {
    const intent = this.parse(query);

    return {
      objective: query,
      intent,
      queries: this._decomposeQuery(query, intent),
      sources: intent.sources,
      timeRange: intent.timeRange,
      maxResults: 50,
      evidenceRequirements: {
        minSources: 2,
        minConfidence: 0.3,
      },
      rankingStrategy: 'relevance_then_recency',
    };
  }

  // ─── INTENT DETECTION ────────────────────────────────────────

  _detectIntentType(text) {
    let bestMatch = INTENT_TYPES.SEARCH_CONTENT;
    let bestScore = 0;

    for (const [type, keywords] of Object.entries(INTENT_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = type;
      }
    }

    return bestMatch;
  }

  _extractEntities(text) {
    const entities = [];

    // Extract quoted strings
    const quoted = text.match(/"([^"]+)"/g) || text.match(/'([^']+)'/g);
    if (quoted) {
      entities.push(...quoted.map((q) => q.replace(/["']/g, '')));
    }

    // Extract platform mentions
    const platforms = ['bluesky', 'reddit', 'mastodon', 'youtube', 'github', 'twitter', 'tiktok', 'instagram', 'hacker news', 'hn'];
    for (const platform of platforms) {
      if (text.includes(platform)) {
        entities.push({ type: 'platform', value: platform });
      }
    }

    return entities;
  }

  _extractTopics(text) {
    // Remove common stop words and extract meaningful terms
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'find', 'search', 'look', 'get', 'show', 'me', 'i', 'want', 'need', 'looking', 'interested', 'people', 'who', 'what', 'where', 'when', 'how', 'which', 'and', 'or', 'but', 'not', 'no', 'yes']);

    const words = text
      .replace(/["']/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    return [...new Set(words)].slice(0, 10);
  }

  _inferSources(text, intentType) {
    const sources = [];

    // If specific platform mentioned
    if (text.includes('bluesky') || text.includes('bsky')) sources.push('bluesky');
    if (text.includes('reddit')) sources.push('reddit');
    if (text.includes('mastodon')) sources.push('mastodon');
    if (text.includes('youtube')) sources.push('youtube');
    if (text.includes('github')) sources.push('github');
    if (text.includes('hacker news') || text.includes('hn')) sources.push('hackernews');
    if (text.includes('rss') || text.includes('feed')) sources.push('rss');

    // Default sources based on intent type
    if (sources.length === 0) {
      switch (intentType) {
        case INTENT_TYPES.FIND_AUDIENCE:
          sources.push('reddit', 'bluesky', 'mastodon');
          break;
        case INTENT_TYPES.FIND_CREATORS:
          sources.push('youtube', 'bluesky', 'reddit');
          break;
        case INTENT_TYPES.FIND_COMMUNITIES:
          sources.push('reddit', 'mastodon');
          break;
        case INTENT_TYPES.ANALYZE_MARKET:
          sources.push('reddit', 'hackernews', 'github');
          break;
        case INTENT_TYPES.DETECT_TRENDS:
          sources.push('hackernews', 'reddit', 'bluesky');
          break;
        default:
          sources.push('reddit', 'bluesky', 'hackernews');
      }
    }

    return sources;
  }

  _inferTimeRange(text) {
    if (text.includes('today') || text.includes('hoy')) return 'today';
    if (text.includes('this week') || text.includes('esta semana')) return '7d';
    if (text.includes('this month') || text.includes('este mes')) return '30d';
    if (text.includes('this year') || text.includes('este año')) return '1y';
    if (text.includes('last 24') || text.includes('últimas 24')) return 'today';
    if (text.includes('recent') || text.includes('reciente') || text.includes('latest')) return '7d';
    return '30d'; // Default
  }

  _extractConstraints(text) {
    const constraints = {};
    if (text.includes('english') || text.includes('inglés')) constraints.language = 'en';
    if (text.includes('spanish') || text.includes('español')) constraints.language = 'es';
    const maxMatch = text.match(/max(?:imum)?\s*(\d+)/);
    if (maxMatch) constraints.maxResults = parseInt(maxMatch[1], 10);
    return constraints;
  }

  _decomposeQuery(query, intent) {
    const queries = [query];

    // Add variations for better coverage
    const topics = intent.topics;
    if (topics.length > 0) {
      queries.push(topics.join(' '));
    }

    // Add intent-specific queries
    switch (intent.intentType) {
      case INTENT_TYPES.FIND_AUDIENCE:
        queries.push(`people discussing ${topics.join(' ')}`);
        queries.push(`${topics.join(' ')} recommendations`);
        break;
      case INTENT_TYPES.DETECT_TRENDS:
        queries.push(`trending ${topics.join(' ')}`);
        queries.push(`new ${topics.join(' ')}`);
        break;
      case INTENT_TYPES.FIND_OPPORTUNITIES:
        queries.push(`${topics.join(' ')} problems`);
        queries.push(`${topics.join(' ')} needs`);
        queries.push(`${topics.join(' ')} alternatives`);
        break;
    }

    return [...new Set(queries)].slice(0, 5);
  }

  _calculateConfidence(text, intentType) {
    let confidence = 0.5; // Base
    if (text.length > 20) confidence += 0.1;
    if (text.length > 50) confidence += 0.1;
    const intentScore = INTENT_KEYWORDS[intentType]?.length || 0;
    confidence += Math.min(intentScore / 10, 0.2);
    return Math.round(Math.min(confidence, 1) * 100) / 100;
  }

  _emptyIntent(query) {
    return {
      query,
      intentType: INTENT_TYPES.SEARCH_CONTENT,
      entities: [],
      topics: [],
      sources: ['reddit', 'bluesky', 'hackernews'],
      timeRange: '30d',
      constraints: {},
      confidence: 0.1,
      createdAt: Date.now(),
    };
  }
}

module.exports = IntentParser;
