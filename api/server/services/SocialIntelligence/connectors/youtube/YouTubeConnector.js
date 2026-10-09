/**
 * YouTubeConnector — YouTube Data Implementation
 * ================================================
 * Uses YouTube Data API v3 when API key is available.
 * Falls back to public RSS feeds for basic functionality.
 */

const SocialSourceAdapter = require('../base/SocialSourceAdapter');
const { Source, ContentType } = require('../../types');
const { getRateLimiter } = require('../base/RateLimiter');
const { getCircuitBreaker } = require('../base/CircuitBreaker');

const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_RSS = 'https://www.youtube.com/feeds/videos.xml';

// Free YouTube alternatives (no API key needed)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
  'https://api.piped.yt',
];
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.drgnz.club',
];

class YouTubeConnector extends SocialSourceAdapter {
  constructor(options = {}) {
    super({
      id: 'youtube',
      name: 'YouTube',
      version: '1.0.0',
      source: Source.YOUTUBE,
    });
    this._apiKey = options.apiKey || process.env.YOUTUBE_API_KEY || '';
    this._rateLimiter = getRateLimiter();
    this._circuitBreaker = getCircuitBreaker('youtube', {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    });
  }

  getManifest() {
    return {
      id: 'youtube',
      name: 'YouTube',
      version: '1.0.0',
      source: Source.YOUTUBE,
      capabilities: {
        search: !!this._apiKey,
        profiles: !!this._apiKey,
        posts: true,
        comments: !!this._apiKey,
        communities: false,
        relationships: false,
        media: true,
        history: true,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'optional_api_key', purpose: 'Required for search/profiles' },
      vendor_cost: 0,
      vendor_quota: { requests: 10000, window: 86400 },
      platform_limits: { rateLimit: '10000 units/day (free tier)' },
      license: 'Google ToS',
      data_types: ['videos', 'channels', 'comments'],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 300000 },
      fallbacks: ['rss'],
    };
  }

  async initialize() {
    this._rateLimiter.configure('youtube', 30, 2000);
    this.status = this._apiKey ? 'healthy' : 'degraded';
    this.logger.info('YouTube connector initialized', { hasApiKey: !!this._apiKey });
  }

  /**
   * Search YouTube videos.
   * @param {string} query
   * @param {object} options - { maxResults, order, type }
   * @returns {Promise<Array>}
   */
  async search(query, options = {}) {
    const maxResults = Math.min(options.maxResults || 25, 50);

    // If API key available, use official API
    if (this._apiKey) {
      return this._circuitBreaker.execute(async () => {
        if (!this._rateLimiter.tryConsume('youtube')) {
          throw new Error('YouTube rate limit exceeded');
        }
        const params = new URLSearchParams({
          part: 'snippet',
          q: query,
          maxResults: String(maxResults),
          order: options.order || 'relevance',
          type: 'video',
          key: this._apiKey,
        });
        const url = `${YT_API}/search?${params}`;
        const res = await this._fetch(url, { timeout: 15000 });
        if (!res.ok) throw new Error(`YouTube search failed: HTTP ${res.status}`);
        const data = await res.json();
        this._recordSuccess();
        return (data.items || []).map((item) => this._normalizeSearchResult(item));
      });
    }

    // No API key — use Piped API (free, no auth)
    return this._searchViaPiped(query, maxResults);
  }

  /**
   * Search via Piped API (free YouTube frontend, no API key needed)
   */
  async _searchViaPiped(query, maxResults) {
    for (const instance of PIPED_INSTANCES) {
      try {
        const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
        const res = await this._fetch(url, { timeout: 15000 });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          this._recordSuccess();
          this.logger.info('YouTube search via Piped', { instance, count: data.items.length });
          return data.items.slice(0, maxResults).map((item) => ({
            id: `yt_${item.url?.split('v=')[1] || item.url?.split('/').pop() || Date.now()}`,
            source: 'youtube',
            sourceId: item.url?.split('v=')[1] || item.url?.split('/').pop() || '',
            type: 'video',
            title: item.title || '',
            body: item.description || '',
            url: item.url ? `https://youtube.com${item.url}` : '',
            author: {
              id: item.uploaderUrl || '',
              username: item.uploaderName || '',
              displayName: item.uploaderName || '',
              platform: 'youtube',
            },
            metrics: {
              views: item.views || 0,
              likes: item.likes || 0,
            },
            topics: item.topics || [],
            language: 'en',
            createdAt: item.uploadedDate || item.uploaded || new Date().toISOString(),
            thumbnail: item.thumbnailUrl || '',
            duration: item.duration || 0,
          }));
        }
      } catch (err) {
        this.logger.debug('Piped instance failed', { instance, error: err.message });
        continue;
      }
    }

    // Fallback: try Invidious API
    return this._searchViaInvidious(query, maxResults);
  }

  /**
   * Search via Invidious API (free YouTube frontend, no API key needed)
   */
  async _searchViaInvidious(query, maxResults) {
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`;
        const res = await this._fetch(url, { timeout: 15000 });
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data)) {
          this._recordSuccess();
          this.logger.info('YouTube search via Invidious', { instance, count: data.length });
          return data.slice(0, maxResults).map((item) => ({
            id: `yt_${item.videoId || Date.now()}`,
            source: 'youtube',
            sourceId: item.videoId || '',
            type: 'video',
            title: item.title || '',
            body: item.description || '',
            url: item.videoId ? `https://youtube.com/watch?v=${item.videoId}` : '',
            author: {
              id: item.authorId || '',
              username: item.author || '',
              displayName: item.author || '',
              platform: 'youtube',
            },
            metrics: {
              views: item.viewCount || 0,
              likes: item.likeCount || 0,
            },
            topics: [],
            language: 'en',
            createdAt: item.publishedText || new Date().toISOString(),
            thumbnail: item.videoThumbnails?.[0]?.url || '',
            duration: item.lengthSeconds || 0,
          }));
        }
      } catch (err) {
        this.logger.debug('Invidious instance failed', { instance, error: err.message });
        continue;
      }
    }

    throw new Error('All YouTube search methods failed (no API key and all free alternatives unavailable)');
  }

  /**
   * Fetch video details by ID.
   * @param {string} videoId
   * @returns {Promise<object|null>}
   */
  async fetchContent(videoId) {
    if (!this._apiKey) return null;

    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('youtube')) {
        throw new Error('YouTube rate limit exceeded');
      }

      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        id: videoId,
        key: this._apiKey,
      });

      const url = `${YT_API}/videos?${params}`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`YouTube fetch failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      const items = data.items || [];
      return items.length > 0 ? this._normalizeVideo(items[0]) : null;
    });
  }

  /**
   * Fetch channel details.
   * @param {string} channelId
   * @returns {Promise<object|null>}
   */
  async fetchAuthor(channelId) {
    if (!this._apiKey) return null;

    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('youtube')) {
        throw new Error('YouTube rate limit exceeded');
      }

      const params = new URLSearchParams({
        part: 'snippet,statistics',
        id: channelId,
        key: this._apiKey,
      });

      const url = `${YT_API}/channels?${params}`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`YouTube channel failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      const items = data.items || [];
      return items.length > 0 ? this._normalizeChannel(items[0]) : null;
    });
  }

  /**
   * Fetch channel RSS feed (no API key needed).
   * @param {string} channelId
   * @returns {Promise<Array>}
   */
  async fetchChannelFeed(channelId) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('youtube')) {
        throw new Error('YouTube rate limit exceeded');
      }

      const url = `${YT_RSS}?channel_id=${channelId}`;
      const res = await this._fetch(url, { timeout: 10000 });
      if (!res.ok) throw new Error(`YouTube RSS failed: HTTP ${res.status}`);

      const xml = await res.text();
      this._recordSuccess();
      return this._parseRSSFeed(xml, channelId);
    });
  }

  /**
   * Get trending videos (no API key for RSS).
   * @returns {Promise<Array>}
   */
  async getTrending() {
    if (!this._apiKey) {
      throw new Error('YouTube trending requires API key');
    }

    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('youtube')) {
        throw new Error('YouTube rate limit exceeded');
      }

      const params = new URLSearchParams({
        part: 'snippet,statistics',
        chart: 'mostPopular',
        maxResults: '25',
        regionCode: 'US',
        key: this._apiKey,
      });

      const url = `${YT_API}/videos?${params}`;
      const res = await this._fetch(url, { timeout: 15000 });
      if (!res.ok) throw new Error(`YouTube trending failed: HTTP ${res.status}`);

      const data = await res.json();
      this._recordSuccess();
      return (data.items || []).map((item) => this._normalizeVideo(item));
    });
  }

  // ─── NORMALIZATION ───────────────────────────────────────────

  _normalizeSearchResult(item) {
    const snippet = item.snippet || {};
    return {
      id: `yt_${item.id?.videoId || Date.now()}`,
      source: Source.YOUTUBE,
      sourceId: item.id?.videoId || '',
      type: ContentType.VIDEO,
      title: snippet.title || '',
      body: snippet.description || '',
      url: `https://youtube.com/watch?v=${item.id?.videoId || ''}`,
      author: {
        id: snippet.channelId || '',
        username: snippet.channelTitle || '',
        displayName: snippet.channelTitle || '',
        platform: Source.YOUTUBE,
      },
      metrics: {},
      topics: snippet.tags || [],
      language: snippet.defaultLanguage || 'en',
      createdAt: snippet.publishedAt || new Date().toISOString(),
      thumbnail: snippet.thumbnails?.medium?.url || '',
    };
  }

  _normalizeVideo(raw) {
    const snippet = raw.snippet || {};
    const stats = raw.statistics || {};
    return {
      id: `yt_${raw.id || Date.now()}`,
      source: Source.YOUTUBE,
      sourceId: raw.id || '',
      type: ContentType.VIDEO,
      title: snippet.title || '',
      body: snippet.description || '',
      url: `https://youtube.com/watch?v=${raw.id}`,
      author: {
        id: snippet.channelId || '',
        username: snippet.channelTitle || '',
        displayName: snippet.channelTitle || '',
        platform: Source.YOUTUBE,
      },
      metrics: {
        views: parseInt(stats.viewCount || '0', 10),
        likes: parseInt(stats.likeCount || '0', 10),
        comments: parseInt(stats.commentCount || '0', 10),
      },
      topics: snippet.tags || [],
      language: snippet.defaultLanguage || 'en',
      createdAt: snippet.publishedAt || new Date().toISOString(),
      duration: raw.contentDetails?.duration || '',
      thumbnail: snippet.thumbnails?.medium?.url || '',
      category: snippet.categoryId || '',
    };
  }

  _normalizeChannel(raw) {
    const snippet = raw.snippet || {};
    const stats = raw.statistics || {};
    return {
      id: `yt_channel_${raw.id || Date.now()}`,
      platform: Source.YOUTUBE,
      platformId: raw.id || '',
      username: snippet.customUrl || '',
      displayName: snippet.title || '',
      bio: snippet.description || '',
      url: `https://youtube.com/channel/${raw.id}`,
      avatarUrl: snippet.thumbnails?.default?.url || '',
      type: 'person',
      followers: parseInt(stats.subscriberCount || '0', 10),
      postsCount: parseInt(stats.videoCount || '0', 10),
      verified: stats.hiddenSubscriberCount === false,
      fetchedAt: Date.now(),
    };
  }

  _parseRSSFeed(xml, channelId) {
    const items = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match;
    while ((match = entryRegex.exec(xml))) {
      const entry = match[1];
      const title = this._extractTag(entry, 'title') || '';
      const videoId = entry.match(/yt:videoId>([^<]+)</)?.[1] || '';
      const channelIdMatch = entry.match(/yt:channelId>([^<]+)</)?.[1] || channelId;
      const published = this._extractTag(entry, 'published') || '';
      const description = this._extractTag(entry, 'media:description') || '';

      items.push({
        id: `yt_${videoId || Date.now()}`,
        source: Source.YOUTUBE,
        sourceId: videoId,
        type: ContentType.VIDEO,
        title,
        body: description,
        url: `https://youtube.com/watch?v=${videoId}`,
        author: {
          id: channelIdMatch,
          username: '',
          displayName: '',
          platform: Source.YOUTUBE,
        },
        metrics: {},
        topics: [],
        language: 'en',
        createdAt: published,
      });
    }
    return items;
  }

  _extractTag(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 's');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  async healthCheck() {
    this.status = this._apiKey ? 'healthy' : 'degraded';
    return {
      connectorId: this.id,
      status: this.status,
      hasApiKey: !!this._apiKey,
      lastCheck: Date.now(),
      errorCount: this._errorCount,
      successCount: this._successCount,
    };
  }
}

module.exports = YouTubeConnector;
