/**
 * BlueskyConnector — Full AT Protocol Implementation
 * =====================================================
 * Connects to Bluesky social network via public API endpoints.
 * No authentication required for public data search.
 *
 * Uses: public.bsky.social endpoint for search and profile fetch.
 */

const SocialSourceAdapter = require('../base/SocialSourceAdapter');
const { Source, ContentType } = require('../../types');
const { getRateLimiter } = require('../base/RateLimiter');
const { getCircuitBreaker } = require('../base/CircuitBreaker');

const BLUESKY_APIS = [
  'https://public.api.bsky.app/xrpc',
  'https://api.bsky.app/xrpc',
  'https://bsky.social/xrpc',
];
let BLUESKY_API = BLUESKY_APIS[0];

class BlueskyConnector extends SocialSourceAdapter {
  constructor(options = {}) {
    super({
      id: 'bluesky',
      name: 'Bluesky / AT Protocol',
      version: '1.0.0',
      source: Source.BLUESKY,
    });
    this._rateLimiter = getRateLimiter();
    this._circuitBreaker = getCircuitBreaker('bluesky', {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    });
    this._rateLimiter.configure('bluesky', 100, 600);
  }

  getManifest() {
    return {
      id: 'bluesky',
      name: 'Bluesky / AT Protocol',
      version: '1.0.0',
      source: Source.BLUESKY,
      capabilities: {
        search: true,
        profiles: true,
        posts: true,
        comments: true,
        communities: false,
        relationships: true,
        media: true,
        history: true,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'optional', purpose: 'Higher rate limits' },
      vendor_cost: 0,
      vendor_quota: null,
      platform_limits: { rateLimit: '100/min without auth' },
      license: 'MIT',
      data_types: ['posts', 'profiles', 'feeds'],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 300000 },
      fallbacks: [],
    };
  }

  async initialize() {
    this._rateLimiter.configure('bluesky', 100, 600);
    this.status = 'healthy';
    this.logger.info('Bluesky connector initialized');
  }

  /**
   * Search Bluesky posts.
   * @param {string} query - Search query
   * @param {object} options - { maxResults, searchHeaders }
   * @returns {Promise<Array>} Raw AT Protocol post objects
   */
  async search(query, options = {}) {
    const maxResults = Math.min(options.maxResults || 25, 50);

    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('bluesky')) {
        throw new Error('Bluesky rate limit exceeded');
      }

      const params = new URLSearchParams({
        q: query,
        limit: String(maxResults),
      });

      // Try multiple API endpoints for resilience
      let lastError = null;
      for (const api of BLUESKY_APIS) {
        const url = `${api}/app.bsky.feed.searchPosts?${params}`;
        this.logger.debug('Searching Bluesky', { query, maxResults, api });
        try {
          const res = await this._fetch(url, { timeout: 15000 });
          if (res.ok) {
            BLUESKY_API = api; // Remember working endpoint
            const data = await res.json();
            this._recordSuccess();
            return (data.posts || []).map((post) => this._normalizePost(post));
          }
          lastError = `HTTP ${res.status}`;
        } catch (err) {
          lastError = err.message;
        }
      }
      throw new Error(`Bluesky search failed: ${lastError}`);

    });
  }

  /**
   * Fetch a specific Bluesky post by URI.
   * @param {string} uri - AT Protocol URI (at://...)
   * @returns {Promise<object|null>}
   */
  async fetchContent(uri) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('bluesky')) {
        throw new Error('Bluesky rate limit exceeded');
      }

      const params = new URLSearchParams({ uri });
      const url = `${BLUESKY_API}/app.bsky.feed.getPostThread?${params}&depth=0`;

      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Bluesky fetch failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      this._recordSuccess();
      return data.thread?.post ? this._normalizePost(data.thread.post) : null;
    });
  }

  /**
   * Fetch Bluesky profile by handle or DID.
   * @param {string} actor - Handle (user.bsky.social) or DID
   * @returns {Promise<object|null>}
   */
  async fetchAuthor(actor) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('bluesky')) {
        throw new Error('Bluesky rate limit exceeded');
      }

      const params = new URLSearchParams({ actor });
      const url = `${BLUESKY_API}/app.bsky.actor.getProfile?${params}`;

      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Bluesky profile failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      this._recordSuccess();
      return this._normalizeProfile(data);
    });
  }

  /**
   * Search Bluesky profiles.
   * @param {string} query
   * @param {object} options
   * @returns {Promise<Array>}
   */
  async searchProfiles(query, options = {}) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('bluesky')) {
        throw new Error('Bluesky rate limit exceeded');
      }

      const params = new URLSearchParams({
        q: query,
        limit: String(Math.min(options.maxResults || 25, 50)),
      });
      const url = `${BLUESKY_API}/app.bsky.actor.searchActors?${params}`;

      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`Bluesky actor search failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      return (data.actors || []).map((a) => this._normalizeProfile(a));
    });
  }

  /**
   * Fetch posts from a user's feed.
   * @param {string} actor - User handle or DID
   * @param {object} options - { maxResults }
   * @returns {Promise<Array>}
   */
  async fetchUserFeed(actor, options = {}) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('bluesky')) {
        throw new Error('Bluesky rate limit exceeded');
      }

      const params = new URLSearchParams({
        actor,
        limit: String(Math.min(options.maxResults || 30, 100)),
      });
      const url = `${BLUESKY_API}/app.bsky.feed.getAuthorFeed?${params}`;

      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`Bluesky feed failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      return (data.feed || []).map((item) => this._normalizePost(item.post));
    });
  }

  // ─── NORMALIZATION ───────────────────────────────────────────

  _normalizePost(raw) {
    const record = raw.record || {};
    const author = raw.author || {};
    const embed = record.embed || {};

    return {
      id: `bsky_${raw.uri || raw.cid || Date.now()}`,
      source: Source.BLUESKY,
      sourceId: raw.uri || '',
      type: ContentType.POST,
      title: '',
      body: record.text || '',
      url: `https://bsky.app/profile/${author.handle}/post/${raw.uri?.split('/').pop() || ''}`,
      author: {
        id: author.did || '',
        username: author.handle || '',
        displayName: author.displayName || '',
        platform: Source.BLUESKY,
        avatarUrl: author.avatar || '',
        followers: author.followersCount || 0,
        following: author.followsCount || 0,
        postsCount: author.postsCount || 0,
      },
      metrics: {
        likes: raw.likeCount || 0,
        shares: raw.repostCount || 0,
        comments: raw.replyCount || 0,
        quotes: raw.quoteCount || 0,
      },
      topics: this._extractTopics(record.text || ''),
      language: record.langs?.[0] || 'en',
      createdAt: record.createdAt || new Date().toISOString(),
      tags: this._extractHashtags(record.text || ''),
      embed: this._normalizeEmbed(embed),
      raw: undefined, // Don't store raw data
    };
  }

  _normalizeProfile(raw) {
    return {
      id: `bsky_${raw.did || Date.now()}`,
      platform: Source.BLUESKY,
      platformId: raw.did || '',
      username: raw.handle || '',
      displayName: raw.displayName || '',
      bio: raw.description || '',
      url: `https://bsky.app/profile/${raw.handle || ''}`,
      avatarUrl: raw.avatar || '',
      type: 'person',
      followers: raw.followersCount || 0,
      following: raw.followsCount || 0,
      postsCount: raw.postsCount || 0,
      verified: !!raw.verified,
      badges: raw.badges || [],
      fetchedAt: Date.now(),
    };
  }

  _normalizeEmbed(embed) {
    if (!embed) return null;
    const type = embed.$type || '';
    if (type === 'app.bsky.embed.images') {
      return {
        type: 'images',
        images: (embed.images || []).map((img) => ({
          alt: img.alt || '',
          url: img.fullsize || img.thumb || '',
        })),
      };
    }
    if (type === 'app.bsky.embed.external') {
      return {
        type: 'link',
        url: embed.external?.uri || '',
        title: embed.external?.title || '',
        description: embed.external?.description || '',
      };
    }
    return { type: 'unknown' };
  }

  _extractTopics(text) {
    const topics = [];
    const hashtags = text.match(/#[\w\u00C0-\u024F]+/g) || [];
    topics.push(...hashtags.map((h) => h.slice(1).toLowerCase()));
    return [...new Set(topics)].slice(0, 10);
  }

  _extractHashtags(text) {
    return (text.match(/#[\w\u00C0-\u024F]+/g) || []).map((h) => h.slice(1));
  }

  async healthCheck() {
    const start = Date.now();
    try {
      await this._circuitBreaker.execute(async () => {
        const url = `${BLUESKY_API}/app.bsky.feed.searchPosts?q=test&limit=1`;
        const res = await this._fetch(url, { timeout: 10000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      const latency = Date.now() - start;
      this.status = 'healthy';
      return {
        connectorId: this.id,
        status: this.status,
        latency,
        lastCheck: Date.now(),
        errorCount: this._errorCount,
        successCount: this._successCount,
        circuitBreaker: this._circuitBreaker.getInfo(),
        rateLimiter: this._rateLimiter.getInfo('bluesky'),
      };
    } catch (err) {
      this.status = 'unhealthy';
      return {
        connectorId: this.id,
        status: this.status,
        error: err.message,
        lastCheck: Date.now(),
        errorCount: this._errorCount,
      };
    }
  }
}

module.exports = BlueskyConnector;
