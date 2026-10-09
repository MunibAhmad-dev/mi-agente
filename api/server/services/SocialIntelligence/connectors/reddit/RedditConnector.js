/**
 * RedditConnector — Full Reddit Implementation
 * ==============================================
 * Connects to Reddit via public .json endpoints.
 * No OAuth required for public data.
 */

const SocialSourceAdapter = require('../base/SocialSourceAdapter');
const { Source, ContentType } = require('../../types');
const { getRateLimiter } = require('../base/RateLimiter');
const { getCircuitBreaker } = require('../base/CircuitBreaker');

const REDDIT_BASES = ['https://old.reddit.com', 'https://www.reddit.com'];
let REDDIT_BASE = REDDIT_BASES[0];
const REDDIT_SEARCH = () => `${REDDIT_BASE}/search.json`;
const REDDIT_SUBREDDIT = () => `${REDDIT_BASE}/r`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

class RedditConnector extends SocialSourceAdapter {
  constructor(options = {}) {
    super({
      id: 'reddit',
      name: 'Reddit',
      version: '1.0.0',
      source: Source.REDDIT,
    });
    this._rateLimiter = getRateLimiter();
    this._circuitBreaker = getCircuitBreaker('reddit', {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    });
  }

  getManifest() {
    return {
      id: 'reddit',
      name: 'Reddit',
      version: '1.0.0',
      source: Source.REDDIT,
      capabilities: {
        search: true,
        profiles: true,
        posts: true,
        comments: true,
        communities: true,
        relationships: false,
        media: true,
        history: true,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'optional', purpose: 'Higher rate limits + NSFW' },
      vendor_cost: 0,
      vendor_quota: { requests: 60, window: 60 },
      platform_limits: { rateLimit: '60/min without OAuth' },
      license: 'BSD-3',
      data_types: ['posts', 'comments', 'subreddits', 'profiles'],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 300000 },
      fallbacks: [],
    };
  }

  async initialize() {
    this._rateLimiter.configure('reddit', 60, 1000);
    this.status = 'healthy';
    this.logger.info('Reddit connector initialized');
  }

  /**
   * Search Reddit posts and comments.
   * @param {string} query
   * @param {object} options - { maxResults, subreddit, sort, timeRange }
   * @returns {Promise<Array>}
   */
  async search(query, options = {}) {
    const maxResults = Math.min(options.maxResults || 25, 100);

    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('reddit')) {
        throw new Error('Reddit rate limit exceeded');
      }

      const params = new URLSearchParams({
        q: query,
        limit: String(maxResults),
        sort: options.sort || 'relevance',
        t: options.timeRange || 'month',
        type: options.type || 'link',
      });

      if (options.subreddit) {
        params.set('restrict_sr', 'on');
        const url = `${REDDIT_BASE}/r/${options.subreddit}/search.json?${params}`;
        return this._fetchListing(url);
      }

      const url = `${REDDIT_SEARCH}?${params}`;
      return this._fetchListing(url);
    });
  }

  /**
   * Fetch a Reddit post by ID.
   * @param {string} id - Reddit post ID (t3_xxxxx)
   * @returns {Promise<object|null>}
   */
  async fetchContent(id) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('reddit')) {
        throw new Error('Reddit rate limit exceeded');
      }

      const fullId = id.startsWith('t3_') ? id : `t3_${id}`;
      const url = `${REDDIT_BASE}/by_id/${fullId}.json`;
      const res = await this._fetch(url);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Reddit fetch failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      this._recordSuccess();
      const children = data?.data?.children || [];
      return children.length > 0 ? this._normalizePost(children[0].data) : null;
    });
  }

  /**
   * Fetch comments for a post.
   * @param {string} postId - Reddit post ID
   * @param {object} options - { maxResults, sort }
   * @returns {Promise<Array>}
   */
  async fetchInteractions(postId, options = {}) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('reddit')) {
        throw new Error('Reddit rate limit exceeded');
      }

      const id = postId.replace(/^t3_/, '');
      const url = `${REDDIT_BASE}/comments/${id}.json?sort=${options.sort || 'best'}&limit=${options.maxResults || 50}`;
      const res = await this._fetch(url);
      if (!res.ok) throw new Error(`Reddit comments failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();

      const comments = [];
      if (Array.isArray(data) && data.length > 1) {
        const children = data[1]?.data?.children || [];
        for (const child of children) {
          if (child.kind === 't1') {
            comments.push(this._normalizeComment(child.data));
          }
        }
      }
      return comments;
    });
  }

  /**
   * Search Reddit subreddits.
   * @param {string} query
   * @param {object} options
   * @returns {Promise<Array>}
   */
  async searchCommunities(query, options = {}) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('reddit')) {
        throw new Error('Reddit rate limit exceeded');
      }

      const params = new URLSearchParams({
        query,
        limit: String(Math.min(options.maxResults || 25, 50)),
      });
      const url = `${REDDIT_BASE}/subreddits/search.json?${params}`;
      const res = await this._fetch(url);
      if (!res.ok) throw new Error(`Reddit subreddit search failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      return (data?.data?.children || []).map((c) => this._normalizeSubreddit(c.data));
    });
  }

  /**
   * Fetch a subreddit's hot posts.
   * @param {string} subreddit
   * @param {object} options - { maxResults, sort }
   * @returns {Promise<Array>}
   */
  async fetchSubredditFeed(subreddit, options = {}) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('reddit')) {
        throw new Error('Reddit rate limit exceeded');
      }

      const sort = options.sort || 'hot';
      const limit = Math.min(options.maxResults || 25, 100);
      const url = `${REDDIT_BASE}/r/${subreddit}/${sort}.json?limit=${limit}`;
      return this._fetchListing(url);
    });
  }

  /**
   * Fetch Reddit user profile.
   * @param {string} username
   * @returns {Promise<object|null>}
   */
  async fetchAuthor(username) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('reddit')) {
        throw new Error('Reddit rate limit exceeded');
      }

      const name = username.replace(/^u\//, '');
      const url = `${REDDIT_BASE}/user/${name}/about.json`;
      const res = await this._fetch(url);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Reddit user fetch failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      this._recordSuccess();
      return this._normalizeProfile(data.data);
    });
  }

  // ─── INTERNAL ────────────────────────────────────────────────

  async _fetch(url) {
    return this._fetchInternal(url);
  }

  async _fetchInternal(url) {
    // Try multiple Reddit bases for resilience
    for (const base of REDDIT_BASES) {
      const testUrl = url.replace(/https:\/\/[^/]+/, base);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(testUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/json',
          },
          redirect: 'follow',
        });
        clearTimeout(timer);
        if (res.ok) {
          REDDIT_BASE = base; // Remember working base
          return res;
        }
        // If 403/302, try next base
        continue;
      } catch (err) {
        clearTimeout(timer);
        continue; // Try next base
      }
    }
    throw new Error('All Reddit endpoints failed');
  }

  async _fetchListing(url) {
    const res = await this._fetch(url);
    if (!res.ok) throw new Error(`Reddit listing failed: HTTP ${res.status}`);
    const data = await res.json();
    this._recordSuccess();
    return (data?.data?.children || []).map((c) => this._normalizePost(c.data));
  }

  // ─── NORMALIZATION ───────────────────────────────────────────

  _normalizePost(raw) {
    return {
      id: `reddit_${raw.id || Date.now()}`,
      source: Source.REDDIT,
      sourceId: raw.name || `t3_${raw.id}`,
      type: raw.is_self ? ContentType.ARTICLE : ContentType.LINK,
      title: raw.title || '',
      body: raw.selftext || raw.url || '',
      url: raw.permalink ? `https://reddit.com${raw.permalink}` : (raw.url || ''),
      author: {
        id: raw.author_fullname || raw.author || '',
        username: raw.author || '[deleted]',
        displayName: raw.author || '',
        platform: Source.REDDIT,
      },
      metrics: {
        likes: raw.score || 0,
        comments: raw.num_comments || 0,
        upvoteRatio: raw.upvote_ratio || 0,
        awards: raw.total_awards_received || 0,
      },
      subreddit: raw.subreddit || '',
      subredditNamePrefixed: raw.subreddit_name_prefixed || '',
      topics: this._extractTopics(raw),
      language: 'en',
      createdAt: raw.created_utc ? new Date(raw.created_utc * 1000).toISOString() : new Date().toISOString(),
      flair: raw.link_flair_text || '',
      tags: raw.link_flair_text ? [raw.link_flair_text] : [],
      isSelf: raw.is_self || false,
      over18: raw.over_18 || false,
    };
  }

  _normalizeComment(raw) {
    return {
      id: `reddit_comment_${raw.id || Date.now()}`,
      source: Source.REDDIT,
      sourceId: raw.name || `t1_${raw.id}`,
      type: ContentType.COMMENT,
      body: raw.body || '',
      url: raw.permalink ? `https://reddit.com${raw.permalink}` : '',
      author: {
        id: raw.author_fullname || raw.author || '',
        username: raw.author || '[deleted]',
        displayName: raw.author || '',
        platform: Source.REDDIT,
      },
      metrics: {
        likes: raw.score || 0,
      },
      parentId: raw.parent_id || '',
      createdAt: raw.created_utc ? new Date(raw.created_utc * 1000).toISOString() : new Date().toISOString(),
    };
  }

  _normalizeSubreddit(raw) {
    return {
      id: `reddit_sub_${raw.id || Date.now()}`,
      platform: Source.REDDIT,
      platformId: raw.name || '',
      name: raw.display_name || '',
      displayName: raw.title || '',
      description: raw.public_description || raw.description || '',
      url: raw.url ? `https://reddit.com${raw.url}` : '',
      members: raw.subscribers || 0,
      activeUsers: raw.accounts_active || 0,
      activity: this._classifyActivity(raw.accounts_active || 0),
      topics: this._extractTopicsFromSubreddit(raw),
      rules: [],
      createdAt: raw.created_utc ? new Date(raw.created_utc * 1000).toISOString() : null,
      fetchedAt: Date.now(),
    };
  }

  _normalizeProfile(raw) {
    return {
      id: `reddit_user_${raw.id || Date.now()}`,
      platform: Source.REDDIT,
      platformId: raw.name || '',
      username: raw.name || '',
      displayName: raw.subreddit?.title || raw.name || '',
      bio: raw.subreddit?.public_description || '',
      url: `https://reddit.com/user/${raw.name || ''}`,
      avatarUrl: raw.icon_img || '',
      type: 'person',
      followers: raw.subreddit?.subscribers || 0,
      karma: {
        link: raw.link_karma || 0,
        comment: raw.comment_karma || 0,
      },
      verified: raw.verified || false,
      accountAge: raw.created_utc ? Date.now() / 1000 - raw.created_utc : 0,
      fetchedAt: Date.now(),
    };
  }

  _extractTopics(raw) {
    const topics = [];
    if (raw.subreddit) topics.push(raw.subreddit.toLowerCase());
    if (raw.link_flair_text) topics.push(raw.link_flair_text.toLowerCase());
    return [...new Set(topics)].slice(0, 10);
  }

  _extractTopicsFromSubreddit(raw) {
    const topics = [];
    if (raw.subreddit_type) topics.push(raw.subreddit_type);
    return topics;
  }

  _classifyActivity(activeUsers) {
    if (activeUsers > 1000) return 'very_high';
    if (activeUsers > 100) return 'high';
    if (activeUsers > 10) return 'medium';
    return 'low';
  }

  async healthCheck() {
    const start = Date.now();
    try {
      await this._circuitBreaker.execute(async () => {
        const url = `${REDDIT_BASE}/r/popular.json?limit=1`;
        const res = await this._fetch(url);
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
        rateLimiter: this._rateLimiter.getInfo('reddit'),
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

module.exports = RedditConnector;
