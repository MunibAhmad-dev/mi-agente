/**
 * HackerNewsConnector — Full HN Implementation
 * ==============================================
 * Connects to Hacker News via the official Firebase API.
 * No authentication required.
 */

const SocialSourceAdapter = require('../base/SocialSourceAdapter');
const { Source, ContentType } = require('../../types');
const { getRateLimiter } = require('../base/RateLimiter');
const { getCircuitBreaker } = require('../base/CircuitBreaker');

const HN_API = 'https://hacker-news.firebaseio.com/v0';
const HN_ALGOLIA = 'https://hn.algolia.com/api/v1';

class HackerNewsConnector extends SocialSourceAdapter {
  constructor(options = {}) {
    super({
      id: 'hackernews',
      name: 'Hacker News',
      version: '1.0.0',
      source: Source.HACKERNEWS,
    });
    this._rateLimiter = getRateLimiter();
    this._circuitBreaker = getCircuitBreaker('hackernews', {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
    });
  }

  getManifest() {
    return {
      id: 'hackernews',
      name: 'Hacker News',
      version: '1.0.0',
      source: Source.HACKERNEWS,
      capabilities: {
        search: true,
        profiles: true,
        posts: true,
        comments: true,
        communities: false,
        relationships: false,
        media: false,
        history: true,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'none' },
      vendor_cost: 0,
      vendor_quota: null,
      platform_limits: { rateLimit: '200/min recommended' },
      license: 'MIT',
      data_types: ['stories', 'comments', 'jobs', 'polls'],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 300000 },
      fallbacks: [],
    };
  }

  async initialize() {
    this._rateLimiter.configure('hackernews', 30, 2000);
    this.status = 'healthy';
    this.logger.info('Hacker News connector initialized');
  }

  /**
   * Search HN stories via Algolia API.
   * @param {string} query
   * @param {object} options - { maxResults, tags, sort, numericFilters }
   * @returns {Promise<Array>}
   */
  async search(query, options = {}) {
    const maxResults = Math.min(options.maxResults || 20, 100);

    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('hackernews')) {
        throw new Error('HN rate limit exceeded');
      }

      const params = new URLSearchParams({
        query,
        tags: options.tags || 'story',
        hitsPerPage: String(maxResults),
      });

      if (options.sort === 'date') {
        params.set('numericFilters', 'created_at_i>' + Math.floor(Date.now() / 1000 - 86400 * 30));
      }

      const url = `${HN_ALGOLIA}/search?${params}`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`HN search failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      return (data.hits || []).map((hit) => this._normalizeHit(hit));
    });
  }

  /**
   * Fetch a story by ID.
   * @param {string|number} id - HN item ID
   * @returns {Promise<object|null>}
   */
  async fetchContent(id) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('hackernews')) {
        throw new Error('HN rate limit exceeded');
      }

      const url = `${HN_API}/item/${id}.json`;
      const res = await this._fetch(url, { timeout: 10000 });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HN item fetch failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data) return null;
      this._recordSuccess();
      return this._normalizeItem(data);
    });
  }

  /**
   * Fetch comments for a story.
   * @param {string|number} storyId
   * @param {object} options - { maxResults, depth }
   * @returns {Promise<Array>}
   */
  async fetchInteractions(storyId, options = {}) {
    return this._circuitBreaker.execute(async () => {
      const story = await this.fetchContent(storyId);
      if (!story || !story.raw?.kids) return [];

      const maxComments = Math.min(options.maxResults || 30, story.raw.kids.length);
      const commentIds = story.raw.kids.slice(0, maxComments);

      const comments = [];
      for (const cid of commentIds) {
        try {
          if (!this._rateLimiter.tryConsume('hackernews')) break;
          const url = `${HN_API}/item/${cid}.json`;
          const res = await this._fetch(url, { timeout: 10000 });
          if (res.ok) {
            const data = await res.json();
            if (data && !data.deleted && !data.dead) {
              comments.push(this._normalizeComment(data));
            }
          }
        } catch {
          // Skip failed comments
        }
      }

      this._recordSuccess();
      return comments;
    });
  }

  /**
   * Fetch user profile.
   * @param {string} username
   * @returns {Promise<object|null>}
   */
  async fetchAuthor(username) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('hackernews')) {
        throw new Error('HN rate limit exceeded');
      }

      const url = `${HN_API}/user/${username}.json`;
      const res = await this._fetch(url, { timeout: 10000 });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HN user fetch failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data) return null;
      this._recordSuccess();
      return this._normalizeUser(data);
    });
  }

  /**
   * Get top/best/new stories.
   * @param {string} listType - 'top', 'best', 'new', 'show', 'ask', 'jobs'
   * @param {object} options - { maxResults }
   * @returns {Promise<Array>}
   */
  async getStories(listType = 'top', options = {}) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('hackernews')) {
        throw new Error('HN rate limit exceeded');
      }

      const url = `${HN_API}/${listType}stories.json`;
      const res = await this._fetch(url, { timeout: 10000 });
      if (!res.ok) throw new Error(`HN stories failed: HTTP ${res.status}`);

      const ids = await res.json();
      const maxItems = Math.min(options.maxResults || 30, ids.length);
      const stories = [];

      for (const id of ids.slice(0, maxItems)) {
        try {
          if (!this._rateLimiter.tryConsume('hackernews')) break;
          const storyUrl = `${HN_API}/item/${id}.json`;
          const storyRes = await this._fetch(storyUrl, { timeout: 10000 });
          if (storyRes.ok) {
            const story = await storyRes.json();
            if (story) stories.push(this._normalizeItem(story));
          }
        } catch {
          // Skip
        }
      }

      this._recordSuccess();
      return stories;
    });
  }

  // ─── NORMALIZATION ───────────────────────────────────────────

  _normalizeHit(hit) {
    return {
      id: `hn_${hit.objectID || Date.now()}`,
      source: Source.HACKERNEWS,
      sourceId: String(hit.objectID || ''),
      type: hit.story_id ? ContentType.COMMENT : ContentType.ARTICLE,
      title: hit.title || '',
      body: hit.story_text || hit.comment_text || hit.url || '',
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      author: {
        id: hit.author || '',
        username: hit.author || '',
        displayName: hit.author || '',
        platform: Source.HACKERNEWS,
      },
      metrics: {
        likes: hit.points || 0,
        comments: hit.num_comments || 0,
      },
      topics: hit._tags ? hit._tags.filter((t) => t !== 'story' && t !== 'comment') : [],
      language: 'en',
      createdAt: hit.created_at || new Date().toISOString(),
      hnId: hit.objectID,
      hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    };
  }

  _normalizeItem(raw) {
    return {
      id: `hn_${raw.id || Date.now()}`,
      source: Source.HACKERNEWS,
      sourceId: String(raw.id || ''),
      type: this._getType(raw.type),
      title: raw.title || '',
      body: raw.text || raw.url || '',
      url: raw.url || `https://news.ycombinator.com/item?id=${raw.id}`,
      author: {
        id: raw.by || '',
        username: raw.by || '',
        displayName: raw.by || '',
        platform: Source.HACKERNEWS,
      },
      metrics: {
        likes: raw.score || 0,
        comments: raw.descendants || 0,
      },
      topics: [],
      language: 'en',
      createdAt: raw.time ? new Date(raw.time * 1000).toISOString() : new Date().toISOString(),
      hnId: raw.id,
      hnUrl: `https://news.ycombinator.com/item?id=${raw.id}`,
      raw, // Keep raw for kid traversal
    };
  }

  _normalizeComment(raw) {
    return {
      id: `hn_comment_${raw.id || Date.now()}`,
      source: Source.HACKERNEWS,
      sourceId: String(raw.id || ''),
      type: ContentType.COMMENT,
      body: raw.text || '',
      url: `https://news.ycombinator.com/item?id=${raw.id}`,
      author: {
        id: raw.by || '',
        username: raw.by || '',
        displayName: raw.by || '',
        platform: Source.HACKERNEWS,
      },
      metrics: {},
      parentId: raw.parent ? String(raw.parent) : '',
      createdAt: raw.time ? new Date(raw.time * 1000).toISOString() : new Date().toISOString(),
    };
  }

  _normalizeUser(raw) {
    return {
      id: `hn_user_${raw.id || Date.now()}`,
      platform: Source.HACKERNEWS,
      platformId: raw.id || '',
      username: raw.id || '',
      displayName: raw.id || '',
      bio: '',
      url: `https://news.ycombinator.com/user?id=${raw.id}`,
      type: 'person',
      karma: raw.karma || 0,
      created: raw.created ? new Date(raw.created * 1000).toISOString() : null,
      about: raw.about || '',
      submitted: raw.submitted || [],
      fetchedAt: Date.now(),
    };
  }

  _getType(type) {
    switch (type) {
      case 'story': return ContentType.ARTICLE;
      case 'comment': return ContentType.COMMENT;
      case 'job': return ContentType.LINK;
      case 'poll': return ContentType.ARTICLE;
      case 'pollopt': return ContentType.ARTICLE;
      default: return ContentType.POST;
    }
  }

  async healthCheck() {
    const start = Date.now();
    try {
      await this._circuitBreaker.execute(async () => {
        const url = `${HN_API}/topstories.json`;
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
        rateLimiter: this._rateLimiter.getInfo('hackernews'),
      };
    } catch (err) {
      this.status = 'unhealthy';
      return {
        connectorId: this.id,
        status: this.status,
        error: err.message,
        lastCheck: Date.now(),
      };
    }
  }
}

module.exports = HackerNewsConnector;
