/**
 * MastodonConnector — Multi-Instance Mastodon Implementation
 * ============================================================
 * Connects to any Mastodon-compatible instance via public API.
 * No authentication required for public data.
 */

const SocialSourceAdapter = require('../base/SocialSourceAdapter');
const { Source, ContentType } = require('../../types');
const { getRateLimiter } = require('../base/RateLimiter');
const { getCircuitBreaker } = require('../base/CircuitBreaker');

const DEFAULT_INSTANCES = ['mastodon.social', 'fosstodon.org', 'hachyderm.io'];

class MastodonConnector extends SocialSourceAdapter {
  constructor(options = {}) {
    super({
      id: 'mastodon',
      name: 'Mastodon',
      version: '1.0.0',
      source: Source.MASTODON,
    });
    this._instances = options.instances || DEFAULT_INSTANCES;
    this._rateLimiter = getRateLimiter();
    this._circuitBreakers = new Map();
  }

  _getCircuitBreaker(instance) {
    if (!this._circuitBreakers.has(instance)) {
      this._circuitBreakers.set(instance, getCircuitBreaker(`mastodon:${instance}`, {
        failureThreshold: 3,
        resetTimeoutMs: 60000,
      }));
    }
    return this._circuitBreakers.get(instance);
  }

  getManifest() {
    return {
      id: 'mastodon',
      name: 'Mastodon',
      version: '1.0.0',
      source: Source.MASTODON,
      capabilities: {
        search: true,
        profiles: true,
        posts: true,
        comments: true,
        communities: false,
        relationships: false,
        media: true,
        history: true,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'optional', purpose: 'Higher rate limits' },
      vendor_cost: 0,
      vendor_quota: null,
      platform_limits: { rateLimit: '30/min per instance' },
      license: 'AGPL-3.0 (server), MIT (client library)',
      data_types: ['statuses', 'accounts', 'tags'],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 300000 },
      fallbacks: [],
    };
  }

  async initialize() {
    for (const instance of this._instances) {
      this._rateLimiter.configure(`mastodon:${instance}`, 30, 2000);
    }
    this.status = 'healthy';
    this.logger.info('Mastodon connector initialized', { instances: this._instances });
  }

  /**
   * Search Mastodon across all instances.
   * @param {string} query
   * @param {object} options - { maxResults, instance, type }
   * @returns {Promise<Array>}
   */
  async search(query, options = {}) {
    const instances = options.instance ? [options.instance] : this._instances;
    const results = [];

    for (const instance of instances) {
      try {
        const items = await this._searchInstance(instance, query, options);
        results.push(...items);
      } catch (err) {
        this.logger.warn('Mastodon search failed, trying public timeline', { instance, error: err.message });
        // Fallback: fetch public timeline and filter by query
        try {
          const timeline = await this._fetchTimeline(instance, options);
          const filtered = timeline.filter((s) => {
            const text = (s.body || '').toLowerCase();
            const queryLower = query.toLowerCase();
            return queryLower.split(' ').some((word) => word.length > 2 && text.includes(word));
          });
          results.push(...filtered);
        } catch (timelineErr) {
          this.logger.warn('Mastodon timeline fallback also failed', { instance, error: timelineErr.message });
        }
      }
    }

    return results;
  }

  async _fetchTimeline(instance, options = {}) {
    const cb = this._getCircuitBreaker(instance);
    return cb.execute(async () => {
      if (!this._rateLimiter.tryConsume(`mastodon:${instance}`)) {
        throw new Error(`Mastodon rate limit exceeded for ${instance}`);
      }

      const params = new URLSearchParams({
        limit: String(Math.min(options.maxResults || 20, 40)),
      });

      const url = `https://${instance}/api/v1/timelines/public?${params}`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`Mastodon timeline failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      return (Array.isArray(data) ? data : []).map((s) => this._normalizeStatus(s, instance));
    });
  }

  async _searchInstance(instance, query, options = {}) {
    const cb = this._getCircuitBreaker(instance);
    return cb.execute(async () => {
      if (!this._rateLimiter.tryConsume(`mastodon:${instance}`)) {
        throw new Error(`Mastodon rate limit exceeded for ${instance}`);
      }

      const params = new URLSearchParams({
        q: query,
        limit: String(Math.min(options.maxResults || 20, 40)),
        resolve: 'true',
      });

      if (options.type) params.set('type', options.type);

      const url = `https://${instance}/api/v2/search?${params}`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`Mastodon search failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      return (data.statuses || []).map((s) => this._normalizeStatus(s, instance));
    });
  }

  /**
   * Fetch a status by ID on a specific instance.
   * @param {string} id - Status ID
   * @param {string} instance - Instance hostname
   * @returns {Promise<object|null>}
   */
  async fetchContent(id, instance) {
    const inst = instance || this._instances[0];
    const cb = this._getCircuitBreaker(inst);
    return cb.execute(async () => {
      if (!this._rateLimiter.tryConsume(`mastodon:${inst}`)) {
        throw new Error(`Mastodon rate limit exceeded for ${inst}`);
      }

      const url = `https://${inst}/api/v1/statuses/${id}`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Mastodon fetch failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      this._recordSuccess();
      return this._normalizeStatus(data, inst);
    });
  }

  /**
   * Fetch a user profile.
   * @param {string} accountId
   * @param {string} instance
   * @returns {Promise<object|null>}
   */
  async fetchAuthor(accountId, instance) {
    const inst = instance || this._instances[0];
    const cb = this._getCircuitBreaker(inst);
    return cb.execute(async () => {
      if (!this._rateLimiter.tryConsume(`mastodon:${inst}`)) {
        throw new Error(`Mastodon rate limit exceeded for ${inst}`);
      }

      const url = `https://${inst}/api/v1/accounts/${accountId}`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Mastodon account failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      this._recordSuccess();
      return this._normalizeAccount(data, inst);
    });
  }

  /**
   * Fetch trending tags.
   * @param {string} instance
   * @returns {Promise<Array>}
   */
  async getTrending(instance) {
    const inst = instance || this._instances[0];
    const cb = this._getCircuitBreaker(inst);
    return cb.execute(async () => {
      if (!this._rateLimiter.tryConsume(`mastodon:${inst}`)) {
        throw new Error(`Mastodon rate limit exceeded for ${inst}`);
      }

      const url = `https://${inst}/api/v1/trends`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`Mastodon trending failed: HTTP ${res.status}`);
      const data = await res.json();
      this._recordSuccess();
      return data.map((tag) => ({
        tag: tag.name,
        posts: tag.total_accounts || 0,
        instance: inst,
      }));
    });
  }

  // ─── NORMALIZATION ───────────────────────────────────────────

  _normalizeStatus(raw, instance) {
    const account = raw.account || {};
    return {
      id: `mastodon_${instance}_${raw.id || Date.now()}`,
      source: Source.MASTODON,
      sourceId: raw.id || '',
      type: ContentType.POST,
      title: '',
      body: this._stripHtml(raw.spoiler_text || raw.content || ''),
      url: raw.url || `https://${instance}/web/statuses/${raw.id}`,
      author: {
        id: account.id || '',
        username: account.username || '',
        displayName: account.display_name || '',
        platform: Source.MASTODON,
        instance,
      },
      metrics: {
        likes: raw.favourites_count || 0,
        shares: raw.reblogs_count || 0,
        comments: raw.replies_count || 0,
      },
      topics: (raw.tags || []).map((t) => t.name),
      language: raw.language || 'en',
      createdAt: raw.created_at || new Date().toISOString(),
      instance,
      visibility: raw.visibility || 'public',
    };
  }

  _normalizeAccount(raw, instance) {
    return {
      id: `mastodon_${instance}_${raw.id || Date.now()}`,
      platform: Source.MASTODON,
      platformId: raw.id || '',
      username: raw.username || '',
      displayName: raw.display_name || '',
      bio: this._stripHtml(raw.note || ''),
      url: raw.url || `https://${instance}/@${raw.username}`,
      avatarUrl: raw.avatar || '',
      type: raw.bot ? 'bot' : 'person',
      followers: raw.followers_count || 0,
      following: raw.following_count || 0,
      postsCount: raw.statuses_count || 0,
      verified: raw.verified || false,
      instance,
      fetchedAt: Date.now(),
    };
  }

  _stripHtml(html) {
    return html.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim().slice(0, 5000);
  }

  async healthCheck() {
    const statuses = [];
    for (const instance of this._instances) {
      try {
        const start = Date.now();
        const cb = this._getCircuitBreaker(instance);
        await cb.execute(async () => {
          const url = `https://${instance}/api/v1/instance`;
          const res = await this._fetch(url, { timeout: 10000 });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        });
        statuses.push({ instance, status: 'healthy', latency: Date.now() - start });
      } catch (err) {
        statuses.push({ instance, status: 'unhealthy', error: err.message });
      }
    }
    const anyHealthy = statuses.some((s) => s.status === 'healthy');
    this.status = anyHealthy ? 'healthy' : 'unhealthy';
    return {
      connectorId: this.id,
      status: this.status,
      instances: statuses,
      lastCheck: Date.now(),
    };
  }
}

module.exports = MastodonConnector;
