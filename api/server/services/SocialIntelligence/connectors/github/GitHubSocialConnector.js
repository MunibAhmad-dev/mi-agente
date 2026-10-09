/**
 * GitHubSocialConnector — GitHub Social Intelligence
 * ====================================================
 * Focuses on social aspects of GitHub: trending repos, discussions,
 * community activity, contributor patterns.
 */

const SocialSourceAdapter = require('../base/SocialSourceAdapter');
const { Source, ContentType } = require('../../types');
const { getRateLimiter } = require('../base/RateLimiter');
const { getCircuitBreaker } = require('../base/CircuitBreaker');

const GITHUB_API = 'https://api.github.com';

class GitHubSocialConnector extends SocialSourceAdapter {
  constructor(options = {}) {
    super({
      id: 'github',
      name: 'GitHub',
      version: '1.0.0',
      source: Source.GITHUB,
    });
    this._token = options.token || process.env.GITHUB_TOKEN || '';
    this._rateLimiter = getRateLimiter();
    this._circuitBreaker = getCircuitBreaker('github', {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    });
  }

  getManifest() {
    return {
      id: 'github',
      name: 'GitHub',
      version: '1.0.0',
      source: Source.GITHUB,
      capabilities: {
        search: true,
        profiles: true,
        posts: true,
        comments: true,
        communities: false,
        relationships: true,
        media: false,
        history: true,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'optional_token', purpose: 'Higher rate limits' },
      vendor_cost: 0,
      vendor_quota: { requests: 60, window: 3600 },
      platform_limits: { rateLimit: '60/hr unauthenticated, 5000/hr authenticated' },
      license: 'MIT',
      data_types: ['repositories', 'issues', 'discussions', 'users'],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 300000 },
      fallbacks: [],
    };
  }

  async initialize() {
    this._rateLimiter.configure('github', 30, 2000);
    this.status = 'healthy';
    this.logger.info('GitHub connector initialized', { hasToken: !!this._token });
  }

  /**
   * Search GitHub repositories.
   * @param {string} query
   * @param {object} options - { maxResults, sort, language }
   * @returns {Promise<Array>}
   */
  async search(query, options = {}) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('github')) {
        throw new Error('GitHub rate limit exceeded');
      }

      const params = new URLSearchParams({
        q: query,
        per_page: String(Math.min(options.maxResults || 20, 100)),
        sort: options.sort || 'stars',
        order: 'desc',
      });

      if (options.language) {
        params.set('q', `${query} language:${options.language}`);
      }

      const url = `${GITHUB_API}/search/repositories?${params}`;
      const res = await this._fetch(url, {
        timeout: 15000,
        headers: this._getHeaders(),
      });

      if (!res.ok) throw new Error(`GitHub search failed: HTTP ${res.status}`);
      const data = await res.json();
      this._recordSuccess();
      return (data.items || []).map((repo) => this._normalizeRepo(repo));
    });
  }

  /**
   * Search GitHub issues/discussions.
   * @param {string} query
   * @param {object} options - { maxResults, type }
   * @returns {Promise<Array>}
   */
  async searchIssues(query, options = {}) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('github')) {
        throw new Error('GitHub rate limit exceeded');
      }

      const type = options.type || 'issue';
      const params = new URLSearchParams({
        q: `${query} is:${type}`,
        per_page: String(Math.min(options.maxResults || 20, 100)),
        sort: 'created',
        order: 'desc',
      });

      const url = `${GITHUB_API}/search/issues?${params}`;
      const res = await this._fetch(url, {
        timeout: 15000,
        headers: this._getHeaders(),
      });

      if (!res.ok) throw new Error(`GitHub issues search failed: HTTP ${res.status}`);
      const data = await res.json();
      this._recordSuccess();
      return (data.items || []).map((item) => this._normalizeIssue(item));
    });
  }

  /**
   * Fetch a user profile.
   * @param {string} username
   * @returns {Promise<object|null>}
   */
  async fetchAuthor(username) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('github')) {
        throw new Error('GitHub rate limit exceeded');
      }

      const url = `${GITHUB_API}/users/${username}`;
      const res = await this._fetch(url, {
        timeout: 15000,
        headers: this._getHeaders(),
      });

      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`GitHub user fetch failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      this._recordSuccess();
      return this._normalizeUser(data);
    });
  }

  /**
   * Fetch trending repositories (via unofficial endpoint).
   * @param {string} language
   * @param {string} since - 'daily', 'weekly', 'monthly'
   * @returns {Promise<Array>}
   */
  async getTrending(language = '', since = 'daily') {
    // Use search API sorted by recently updated as proxy for trending
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('github')) {
        throw new Error('GitHub rate limit exceeded');
      }

      const date = new Date();
      const sinceDate = new Date();
      if (since === 'daily') sinceDate.setDate(date.getDate() - 1);
      else if (since === 'weekly') sinceDate.setDate(date.getDate() - 7);
      else sinceDate.setMonth(date.getMonth() - 1);

      const q = `created:>${sinceDate.toISOString().split('T')[0]}${language ? ` language:${language}` : ''}`;
      const params = new URLSearchParams({
        q,
        per_page: '30',
        sort: 'stars',
        order: 'desc',
      });

      const url = `${GITHUB_API}/search/repositories?${params}`;
      const res = await this._fetch(url, {
        timeout: 15000,
        headers: this._getHeaders(),
      });

      if (!res.ok) throw new Error(`GitHub trending failed: HTTP ${res.status}`);
      const data = await res.json();
      this._recordSuccess();
      return (data.items || []).map((repo) => this._normalizeRepo(repo));
    });
  }

  // ─── NORMALIZATION ───────────────────────────────────────────

  _normalizeRepo(raw) {
    return {
      id: `gh_${raw.id || Date.now()}`,
      source: Source.GITHUB,
      sourceId: String(raw.id || ''),
      type: ContentType.REPOSITORY,
      title: raw.full_name || '',
      body: raw.description || '',
      url: raw.html_url || '',
      author: {
        id: String(raw.owner?.id || ''),
        username: raw.owner?.login || '',
        displayName: raw.owner?.login || '',
        platform: Source.GITHUB,
      },
      metrics: {
        likes: raw.stargazers_count || 0,
        comments: raw.open_issues_count || 0,
        forks: raw.forks_count || 0,
        watchers: raw.watchers_count || 0,
      },
      topics: raw.topics || [],
      language: raw.language || '',
      createdAt: raw.created_at || new Date().toISOString(),
      license: raw.license?.spdx_id || '',
      stars: raw.stargazers_count || 0,
      forks: raw.forks_count || 0,
    };
  }

  _normalizeIssue(raw) {
    return {
      id: `gh_issue_${raw.id || Date.now()}`,
      source: Source.GITHUB,
      sourceId: String(raw.id || ''),
      type: raw.pull_request ? ContentType.ARTICLE : ContentType.ARTICLE,
      title: raw.title || '',
      body: raw.body || '',
      url: raw.html_url || '',
      author: {
        id: String(raw.user?.id || ''),
        username: raw.user?.login || '',
        displayName: raw.user?.login || '',
        platform: Source.GITHUB,
      },
      metrics: {
        likes: raw.reactions?.['+1'] || 0,
        comments: raw.comments || 0,
      },
      topics: raw.labels?.map((l) => l.name) || [],
      language: 'en',
      createdAt: raw.created_at || new Date().toISOString(),
      state: raw.state || 'open',
      isPR: !!raw.pull_request,
    };
  }

  _normalizeUser(raw) {
    return {
      id: `gh_user_${raw.id || Date.now()}`,
      platform: Source.GITHUB,
      platformId: String(raw.id || ''),
      username: raw.login || '',
      displayName: raw.name || raw.login || '',
      bio: raw.bio || '',
      url: raw.html_url || '',
      avatarUrl: raw.avatar_url || '',
      type: raw.type === 'User' ? 'person' : 'organization',
      followers: raw.followers || 0,
      following: raw.following || 0,
      repos: raw.public_repos || 0,
      gists: raw.public_gists || 0,
      verified: raw.site_admin || false,
      fetchedAt: Date.now(),
    };
  }

  _getHeaders() {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'mi-agent-social/1.0',
    };
    if (this._token) {
      headers.Authorization = `Bearer ${this._token}`;
    }
    return headers;
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const url = `${GITHUB_API}/rate_limit`;
      const res = await this._fetch(url, {
        timeout: 10000,
        headers: this._getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const latency = Date.now() - start;
      this.status = 'healthy';
      return {
        connectorId: this.id,
        status: this.status,
        latency,
        lastCheck: Date.now(),
        rateLimit: data.resources?.core || {},
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

module.exports = GitHubSocialConnector;
