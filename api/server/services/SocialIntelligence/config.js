/**
 * Social Intelligence Configuration
 * ===================================
 * Centralized configuration for all social intelligence components.
 * All values are configurable via environment variables.
 * Defaults are designed for local-first, no-API-key operation.
 */

const config = {
  // Master switch
  enabled: process.env.SOCIAL_INTELLIGENCE_ENABLED === 'true',

  // Default languages for search/analysis
  defaultLanguages: (process.env.SOCIAL_INTELLIGENCE_DEFAULT_LANGUAGE || 'en,es').split(','),

  // Cache TTL in seconds
  cacheTtl: parseInt(process.env.SOCIAL_INTELLIGENCE_CACHE_TTL || '300', 10),

  // Max results per search
  maxResults: parseInt(process.env.SOCIAL_INTELLIGENCE_MAX_RESULTS || '100', 10),

  // Connector defaults
  connectors: {
    bluesky: {
      enabled: true,
      identifier: process.env.BLUESKY_IDENTIFIER || '',
      password: process.env.BLUESKY_PASSWORD || '',
      rateLimit: parseInt(process.env.SOCIAL_RATE_LIMIT_BLUESKY || '100', 10),
      rateLimitWindow: 60000, // 1 minute
      timeout: 15000,
    },
    reddit: {
      enabled: true,
      clientId: process.env.REDDIT_CLIENT_ID || '',
      clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
      userAgent: process.env.REDDIT_USER_AGENT || 'mi-agent-social/1.0',
      rateLimit: parseInt(process.env.SOCIAL_RATE_LIMIT_REDDIT || '60', 10),
      rateLimitWindow: 60000,
      timeout: 15000,
    },
    rss: {
      enabled: true,
      defaultFeeds: (process.env.RSS_DEFAULT_FEEDS || '').split(',').filter(Boolean),
      rateLimit: parseInt(process.env.SOCIAL_RATE_LIMIT_RSS || '30', 10),
      rateLimitWindow: 60000,
      timeout: 10000,
    },
    hackernews: {
      enabled: true,
      rateLimit: parseInt(process.env.SOCIAL_RATE_LIMIT_HN || '30', 10),
      rateLimitWindow: 60000,
      timeout: 10000,
    },
    mastodon: {
      enabled: false,
      instances: (process.env.MASTODON_INSTANCES || '').split(',').filter(Boolean),
      rateLimit: parseInt(process.env.SOCIAL_RATE_LIMIT_MASTODON || '30', 10),
      rateLimitWindow: 60000,
      timeout: 15000,
    },
    youtube: {
      enabled: false,
      apiKey: process.env.YOUTUBE_API_KEY || '',
      rateLimit: parseInt(process.env.SOCIAL_RATE_LIMIT_YOUTUBE || '30', 10),
      rateLimitWindow: 60000,
      timeout: 15000,
    },
    github: {
      enabled: true,
      token: process.env.GITHUB_TOKEN || '',
      rateLimit: parseInt(process.env.SOCIAL_RATE_LIMIT_GITHUB || '30', 10),
      rateLimitWindow: 60000,
      timeout: 15000,
    },
  },

  // Normalization
  normalization: {
    dedupWindowSize: 1000,
    maxContentLength: 10000,
    supportedLanguages: ['en', 'es', 'pt', 'fr', 'de', 'it', 'ja', 'zh', 'ko'],
  },

  // Evidence
  evidence: {
    minConfidence: 0.1,
    maxEvidencePerClaim: 10,
    evidenceRetentionDays: 90,
  },

  // Signals
  signals: {
    minSignalStrength: 0.2,
    signalDecayHalfLife: 86400000, // 24 hours
    maxSignalsPerContent: 5,
  },

  // Audience
  audience: {
    minSegmentSize: 5,
    maxSegments: 50,
    clusteringAlgorithm: 'kmeans',
    embeddingDimension: 384,
  },

  // Graph
  graph: {
    maxNodes: 10000,
    maxEdges: 50000,
    communityDetectionResolution: 1.0,
  },

  // Ranking
  ranking: {
    weights: {
      relevance: 0.3,
      recency: 0.2,
      engagement: 0.2,
      intent: 0.15,
      confidence: 0.15,
    },
  },

  // Search
  search: {
    defaultTopK: 10,
    maxTopK: 100,
    hybridAlpha: 0.5, // Balance between BM25 and semantic
  },

  // Memory
  memory: {
    shortTermMax: 100,
    shortTermTtl: 3600000, // 1 hour
    longTermEnabled: true,
    episodicEnabled: true,
  },

  // Rate limiting global
  globalRateLimit: {
    maxConcurrent: 5,
    queueSize: 100,
  },

  // Logging
  logging: {
    level: process.env.SOCIAL_LOG_LEVEL || 'info',
    verbose: process.env.SOCIAL_LOG_VERBOSE === 'true',
  },
};

module.exports = config;
