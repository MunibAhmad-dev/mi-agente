/**
 * Social Intelligence Type Definitions
 * ======================================
 * Common models used across all social intelligence components.
 */

const Source = Object.freeze({
  BLUESKY: 'bluesky',
  REDDIT: 'reddit',
  RSS: 'rss',
  HACKERNEWS: 'hackernews',
  MASTODON: 'mastodon',
  YOUTUBE: 'youtube',
  GITHUB: 'github',
  WEB: 'web',
});

const ContentType = Object.freeze({
  POST: 'post',
  COMMENT: 'comment',
  ARTICLE: 'article',
  VIDEO: 'video',
  IMAGE: 'image',
  LINK: 'link',
  REPOSITORY: 'repository',
  DISCUSSION: 'discussion',
});

const AccountType = Object.freeze({
  PERSON: 'person',
  ORGANIZATION: 'organization',
  BOT: 'bot',
  BRAND: 'brand',
  CREATOR: 'creator',
});

const SignalType = Object.freeze({
  PURCHASE_INTENT: 'purchase_intent',
  QUESTION: 'question',
  COMPARISON: 'comparison',
  COMPLAINT: 'complaint',
  RECOMMENDATION_REQUEST: 'recommendation_request',
  TREND: 'trend',
  OPPORTUNITY: 'opportunity',
  ENGAGEMENT_PATTERN: 'engagement_pattern',
  CONTENT_REQUEST: 'content_request',
  PAIN_POINT: 'pain_point',
  DECISION_MAKING: 'decision_making',
  URGENCY: 'urgency',
  BUDGET_SIGNAL: 'budget_signal',
  ALTERNATIVE_SEEKING: 'alternative_seeking',
});

const EvidenceType = Object.freeze({
  OBSERVED: 'observed',
  DERIVED: 'derived',
  INFERRED: 'inferred',
  HYPOTHESIS: 'hypothesis',
});

const OpportunityType = Object.freeze({
  UNMET_NEED: 'unmet_need',
  RECURRING_PROBLEM: 'recurring_problem',
  UNANSWERED_QUESTION: 'unanswered_question',
  PURCHASE_INTENT: 'purchase_intent',
  CONTENT_OPPORTUNITY: 'content_opportunity',
  CREATOR_OPPORTUNITY: 'creator_opportunity',
  COMMUNITY_OPPORTUNITY: 'community_opportunity',
  MARKET_GAP: 'market_gap',
  EMERGING_TREND: 'emerging_trend',
});

const EntityType = Object.freeze({
  PERSON: 'person',
  ORGANIZATION: 'organization',
  PRODUCT: 'product',
  TOPIC: 'topic',
  BRAND: 'brand',
  COMMUNITY: 'community',
  URL: 'url',
});

const RelationshipType = Object.freeze({
  POSTED: 'posted',
  DISCUSSED: 'discussed',
  PARTICIPATES_IN: 'participates_in',
  ENGAGES_WITH: 'engages_with',
  MENTIONS: 'mentions',
  ABOUT: 'about',
  SHOWS_SIGNAL_FOR: 'shows_signal_for',
  HAS_EVIDENCE: 'has_evidence',
  FOLLOWING: 'following',
  CREATED: 'created',
  RECOMMENDS: 'recommends',
  COMPETES_WITH: 'competes_with',
});

const ConnectorStatus = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  DISABLED: 'disabled',
  RATE_LIMITED: 'rate_limited',
  AUTHENTICATING: 'authenticating',
});

const SegmentMethod = Object.freeze({
  RULE_BASED: 'rule_based',
  SEMANTIC: 'semantic',
  BEHAVIORAL: 'behavioral',
  CLUSTERING: 'clustering',
  HYBRID: 'hybrid',
  LLM_ASSISTED: 'llm_assisted',
});

/**
 * Create a normalized content object.
 */
function createNormalizedContent(data) {
  return {
    id: data.id || `nc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: data.source,
    sourceId: data.sourceId,
    type: data.type || ContentType.POST,
    title: data.title || '',
    body: data.body || '',
    url: data.url || '',
    author: {
      id: data.author?.id || '',
      username: data.author?.username || '',
      displayName: data.author?.displayName || '',
      platform: data.source,
    },
    metrics: {
      likes: data.metrics?.likes || 0,
      shares: data.metrics?.shares || 0,
      comments: data.metrics?.comments || 0,
      views: data.metrics?.views || 0,
    },
    topics: data.topics || [],
    intent: data.intent || [],
    sentiment: data.sentiment || 0,
    language: data.language || 'en',
    hash: data.hash || '',
    tags: data.tags || [],
    fetchedAt: data.fetchedAt || Date.now(),
    processedAt: null,
  };
}

/**
 * Create a normalized account object.
 */
function createNormalizedAccount(data) {
  return {
    id: data.id || `na_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    platform: data.platform,
    platformId: data.platformId || '',
    username: data.username || '',
    displayName: data.displayName || '',
    bio: data.bio || '',
    url: data.url || '',
    avatarUrl: data.avatarUrl || '',
    type: data.type || AccountType.PERSON,
    followers: data.followers || 0,
    following: data.following || 0,
    verified: data.verified || false,
    topics: data.topics || [],
    activityScore: data.activityScore || 0,
    fetchedAt: data.fetchedAt || Date.now(),
  };
}

/**
 * Create a normalized community object.
 */
function createNormalizedCommunity(data) {
  return {
    id: data.id || `ncm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    platform: data.platform,
    platformId: data.platformId || '',
    name: data.name || '',
    description: data.description || '',
    url: data.url || '',
    members: data.members || 0,
    activity: data.activity || 'low',
    topics: data.topics || [],
    rules: data.rules || [],
    createdAt: data.createdAt || null,
    fetchedAt: data.fetchedAt || Date.now(),
  };
}

/**
 * Create an evidence object.
 */
function createEvidence(data) {
  return {
    id: data.id || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: data.source,
    url: data.url || '',
    content: data.content || '',
    timestamp: data.timestamp || Date.now(),
    retrievedAt: data.retrievedAt || Date.now(),
    hash: data.hash || '',
    authorRef: data.authorRef || '',
    processingMethod: data.processingMethod || 'direct',
    confidence: data.confidence || 0.5,
    type: data.type || EvidenceType.OBSERVED,
    metadata: data.metadata || {},
  };
}

/**
 * Create a signal object.
 */
function createSignal(data) {
  return {
    id: data.id || `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: data.type,
    source: data.source,
    evidence: data.evidence || [],
    confidence: data.confidence || 0.5,
    strength: data.strength || 0.5,
    content: data.content || null,
    account: data.account || null,
    community: data.community || null,
    detectedAt: data.detectedAt || Date.now(),
    expiresAt: data.expiresAt || null,
    metadata: data.metadata || {},
  };
}

/**
 * Create an opportunity object.
 */
function createOpportunity(data) {
  return {
    id: data.id || `opp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: data.type,
    title: data.title || '',
    description: data.description || '',
    signals: data.signals || [],
    evidence: data.evidence || [],
    score: data.score || 0,
    demand: data.demand || 0,
    growth: data.growth || 0,
    relevance: data.relevance || 0,
    competition: data.competition || 0,
    confidence: data.confidence || 0.5,
    detectedAt: data.detectedAt || Date.now(),
    metadata: data.metadata || {},
  };
}

module.exports = {
  Source,
  ContentType,
  AccountType,
  SignalType,
  EvidenceType,
  OpportunityType,
  EntityType,
  RelationshipType,
  ConnectorStatus,
  SegmentMethod,
  createNormalizedContent,
  createNormalizedAccount,
  createNormalizedCommunity,
  createEvidence,
  createSignal,
  createOpportunity,
};
