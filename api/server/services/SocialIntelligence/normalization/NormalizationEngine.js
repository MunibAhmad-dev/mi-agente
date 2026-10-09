/**
 * NormalizationEngine — Converts raw connector data to common models
 * =================================================================
 * Every connector output passes through this engine before entering
 * the intelligence pipeline. Ensures data consistency across sources.
 */

const crypto = require('crypto');
const { Source, ContentType, AccountType } = require('../types');
const { createLogger } = require('../logger');

const logger = createLogger('NormalizationEngine');

class NormalizationEngine {
  constructor() {
    this._normalizers = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    // Each source can have custom normalization overrides
    this._normalizers.set(Source.BLUESKY, (raw) => this._normalizeBluesky(raw));
    this._normalizers.set(Source.REDDIT, (raw) => this._normalizeReddit(raw));
    this._normalizers.set(Source.HACKERNEWS, (raw) => this._normalizeHackerNews(raw));
    this._normalizers.set(Source.MASTODON, (raw) => this._normalizeMastodon(raw));
    this._normalizers.set(Source.YOUTUBE, (raw) => this._normalizeYouTube(raw));
    this._normalizers.set(Source.GITHUB, (raw) => this._normalizeGitHub(raw));
    this._normalizers.set(Source.RSS, (raw) => this._normalizeRSS(raw));
  }

  /**
   * Normalize content from any source.
   * @param {object} raw - Raw content from connector
   * @param {string} source - Source identifier
   * @returns {object} Normalized content
   */
  normalizeContent(raw, source) {
    if (!raw) return null;

    try {
      const normalizer = this._normalizers.get(source);
      let normalized = normalizer ? normalizer(raw) : this._normalizeGeneric(raw);

      // Ensure required fields
      normalized = this._ensureContentFields(normalized, source);

      // Generate content hash for dedup
      normalized.hash = this._generateHash(normalized);

      // Extract additional topics if not already present
      if (!normalized.topics || normalized.topics.length === 0) {
        normalized.topics = this._extractTopics(normalized.body + ' ' + normalized.title);
      }

      normalized.processedAt = Date.now();
      return normalized;
    } catch (err) {
      logger.error('Normalization failed', { source, error: err.message });
      return null;
    }
  }

  /**
   * Normalize an account/profile from any source.
   * @param {object} raw - Raw account data
   * @param {string} source
   * @returns {object} Normalized account
   */
  normalizeAccount(raw, source) {
    if (!raw) return null;

    try {
      const normalized = {
        id: raw.id || `na_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        platform: source,
        platformId: raw.platformId || raw.id || '',
        username: raw.username || raw.handle || '',
        displayName: raw.displayName || raw.name || '',
        bio: raw.bio || raw.description || raw.about || '',
        url: raw.url || '',
        avatarUrl: raw.avatarUrl || raw.avatar || '',
        type: this._classifyAccountType(raw),
        followers: raw.followers || raw.followersCount || 0,
        following: raw.following || raw.followsCount || 0,
        verified: raw.verified || false,
        topics: raw.topics || [],
        activityScore: 0,
        fetchedAt: Date.now(),
      };

      // Calculate activity score
      normalized.activityScore = this._calculateActivityScore(normalized);
      return normalized;
    } catch (err) {
      logger.error('Account normalization failed', { source, error: err.message });
      return null;
    }
  }

  /**
   * Normalize a community/group from any source.
   * @param {object} raw
   * @param {string} source
   * @returns {object} Normalized community
   */
  normalizeCommunity(raw, source) {
    if (!raw) return null;

    try {
      return {
        id: raw.id || `ncm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        platform: source,
        platformId: raw.platformId || raw.id || '',
        name: raw.name || raw.display_name || '',
        description: raw.description || raw.public_description || '',
        url: raw.url || '',
        members: raw.members || raw.subscribers || raw.accounts_active || 0,
        activity: this._classifyActivity(raw),
        topics: raw.topics || [],
        rules: raw.rules || [],
        healthScore: 0.5,
        growthRate: 0,
        fetchedAt: Date.now(),
      };
    } catch (err) {
      logger.error('Community normalization failed', { source, error: err.message });
      return null;
    }
  }

  /**
   * Batch normalize content.
   * @param {Array} rawItems
   * @param {string} source
   * @returns {Array} Normalized items (nulls filtered out)
   */
  normalizeBatch(rawItems, source) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
      .map((raw) => this.normalizeContent(raw, source))
      .filter(Boolean);
  }

  // ─── CONTENT ENSURING ────────────────────────────────────────

  _ensureContentFields(normalized, source) {
    return {
      id: normalized.id || `nc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source,
      sourceId: normalized.sourceId || '',
      type: normalized.type || ContentType.POST,
      title: (normalized.title || '').slice(0, 1000),
      body: (normalized.body || '').slice(0, 10000),
      url: normalized.url || '',
      author: normalized.author || { id: '', username: '', displayName: '', platform: source },
      metrics: normalized.metrics || {},
      topics: normalized.topics || [],
      intent: normalized.intent || [],
      sentiment: normalized.sentiment || 0,
      language: normalized.language || 'en',
      hash: '',
      tags: normalized.tags || [],
      createdAt: normalized.createdAt || new Date().toISOString(),
      fetchedAt: normalized.fetchedAt || Date.now(),
      processedAt: Date.now(),
    };
  }

  // ─── SOURCE-SPECIFIC NORMALIZERS ─────────────────────────────

  _normalizeBluesky(raw) {
    return {
      id: raw.id || `bsky_${Date.now()}`,
      sourceId: raw.sourceId || raw.uri || '',
      type: ContentType.POST,
      title: '',
      body: raw.body || raw.text || '',
      url: raw.url || '',
      author: raw.author || { id: '', username: '', displayName: '', platform: Source.BLUESKY },
      metrics: raw.metrics || {},
      topics: raw.topics || [],
      language: raw.language || 'en',
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  _normalizeReddit(raw) {
    return {
      id: raw.id || `reddit_${Date.now()}`,
      sourceId: raw.sourceId || raw.name || '',
      type: raw.isSelf ? ContentType.ARTICLE : ContentType.LINK,
      title: raw.title || '',
      body: raw.body || raw.selftext || raw.url || '',
      url: raw.url || '',
      author: raw.author || { id: '', username: '', displayName: '', platform: Source.REDDIT },
      metrics: raw.metrics || {},
      topics: raw.topics || [],
      language: raw.language || 'en',
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  _normalizeHackerNews(raw) {
    return {
      id: raw.id || `hn_${Date.now()}`,
      sourceId: raw.sourceId || String(raw.hnId || ''),
      type: ContentType.ARTICLE,
      title: raw.title || '',
      body: raw.body || '',
      url: raw.url || '',
      author: raw.author || { id: '', username: '', displayName: '', platform: Source.HACKERNEWS },
      metrics: raw.metrics || {},
      topics: raw.topics || [],
      language: 'en',
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  _normalizeMastodon(raw) {
    return {
      id: raw.id || `mastodon_${Date.now()}`,
      sourceId: raw.sourceId || '',
      type: ContentType.POST,
      title: '',
      body: raw.body || '',
      url: raw.url || '',
      author: raw.author || { id: '', username: '', displayName: '', platform: Source.MASTODON },
      metrics: raw.metrics || {},
      topics: raw.topics || [],
      language: raw.language || 'en',
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  _normalizeYouTube(raw) {
    return {
      id: raw.id || `yt_${Date.now()}`,
      sourceId: raw.sourceId || '',
      type: ContentType.VIDEO,
      title: raw.title || '',
      body: raw.body || '',
      url: raw.url || '',
      author: raw.author || { id: '', username: '', displayName: '', platform: Source.YOUTUBE },
      metrics: raw.metrics || {},
      topics: raw.topics || [],
      language: raw.language || 'en',
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  _normalizeGitHub(raw) {
    return {
      id: raw.id || `gh_${Date.now()}`,
      sourceId: raw.sourceId || '',
      type: raw.type || ContentType.REPOSITORY,
      title: raw.title || '',
      body: raw.body || '',
      url: raw.url || '',
      author: raw.author || { id: '', username: '', displayName: '', platform: Source.GITHUB },
      metrics: raw.metrics || {},
      topics: raw.topics || [],
      language: raw.language || 'en',
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  _normalizeRSS(raw) {
    return {
      id: raw.id || `rss_${Date.now()}`,
      sourceId: raw.sourceId || '',
      type: ContentType.ARTICLE,
      title: raw.title || '',
      body: raw.body || '',
      url: raw.url || '',
      author: raw.author || { id: '', username: '', displayName: '', platform: Source.RSS },
      metrics: raw.metrics || {},
      topics: raw.topics || [],
      language: raw.language || 'en',
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  _normalizeGeneric(raw) {
    return {
      id: raw.id || `gen_${Date.now()}`,
      sourceId: raw.sourceId || '',
      type: raw.type || ContentType.POST,
      title: raw.title || '',
      body: raw.body || raw.text || raw.content || '',
      url: raw.url || '',
      author: raw.author || { id: '', username: '', displayName: '', platform: 'unknown' },
      metrics: raw.metrics || {},
      topics: raw.topics || [],
      language: raw.language || 'en',
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    };
  }

  // ─── HELPERS ─────────────────────────────────────────────────

  _generateHash(content) {
    const str = `${content.source}:${content.sourceId}:${content.body?.slice(0, 500) || ''}`;
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  _extractTopics(text) {
    if (!text) return [];
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their', 'what', 'which', 'about', 'would', 'could', 'should', 'there', 'these', 'those', 'than', 'then', 'also', 'some', 'more', 'most', 'other', 'into', 'over', 'such', 'only', 'very', 'just', 'when', 'your', 'does', 'will', 'each']);
    const freq = {};
    for (const word of words) {
      if (!stopWords.has(word)) {
        freq[word] = (freq[word] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  _classifyAccountType(raw) {
    if (raw.bot || raw.type === 'bot') return AccountType.BOT;
    if (raw.type === 'organization' || raw.org) return AccountType.ORGANIZATION;
    if (raw.verified || (raw.followers || 0) > 10000) return AccountType.CREATOR;
    return AccountType.PERSON;
  }

  _classifyActivity(raw) {
    const active = raw.activeUsers || raw.accounts_active || 0;
    if (active > 1000) return 'very_high';
    if (active > 100) return 'high';
    if (active > 10) return 'medium';
    return 'low';
  }

  _calculateActivityScore(account) {
    let score = 0;
    if (account.followers > 10000) score += 3;
    else if (account.followers > 1000) score += 2;
    else if (account.followers > 100) score += 1;
    if (account.verified) score += 2;
    if (account.postsCount > 100) score += 1;
    return Math.min(score / 8, 1);
  }
}

module.exports = NormalizationEngine;
