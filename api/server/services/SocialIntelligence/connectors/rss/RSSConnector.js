/**
 * RSSConnector — RSS/Atom Feed Aggregation
 * ==========================================
 * Parses RSS and Atom feeds from any source.
 * Supports multiple feed formats and feed discovery.
 */

const SocialSourceAdapter = require('../base/SocialSourceAdapter');
const { Source, ContentType } = require('../../types');
const { getRateLimiter } = require('../base/RateLimiter');
const { getCircuitBreaker } = require('../base/CircuitBreaker');

class RSSConnector extends SocialSourceAdapter {
  constructor(options = {}) {
    super({
      id: 'rss',
      name: 'RSS/Atom Feeds',
      version: '1.0.0',
      source: Source.RSS,
    });
    this._feeds = new Map(); // url → { url, title, lastFetched }
    this._rateLimiter = getRateLimiter();
    this._circuitBreaker = getCircuitBreaker('rss', {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
    });
  }

  getManifest() {
    return {
      id: 'rss',
      name: 'RSS/Atom Feeds',
      version: '1.0.0',
      source: Source.RSS,
      capabilities: {
        search: false,
        profiles: false,
        posts: true,
        comments: false,
        communities: false,
        relationships: false,
        media: true,
        history: true,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'none' },
      vendor_cost: 0,
      vendor_quota: null,
      platform_limits: { rateLimit: 'Be respectful, 1 req/sec per feed' },
      license: 'MIT',
      data_types: ['articles', 'feeds'],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 600000 },
      fallbacks: [],
    };
  }

  async initialize() {
    this._rateLimiter.configure('rss', 30, 2000);
    this.status = 'healthy';
    this.logger.info('RSS connector initialized');
  }

  /**
   * Register a feed URL.
   * @param {string} url - Feed URL
   * @param {string} title - Optional title
   */
  addFeed(url, title = '') {
    this._feeds.set(url, { url, title, lastFetched: null });
  }

  /**
   * Remove a feed URL.
   * @param {string} url
   */
  removeFeed(url) {
    this._feeds.delete(url);
  }

  /**
   * Get all registered feeds.
   */
  getFeeds() {
    return Array.from(this._feeds.values());
  }

  /**
   * Fetch and parse a single RSS/Atom feed.
   * @param {string} url - Feed URL
   * @returns {Promise<object>} Parsed feed with items
   */
  async fetchFeed(url) {
    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('rss')) {
        throw new Error('RSS rate limit exceeded');
      }

      const res = await this._fetch(url, {
        timeout: 10000,
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      });

      if (!res.ok) throw new Error(`RSS fetch failed: HTTP ${res.status}`);

      const xml = await res.text();
      const parsed = this._parseFeed(xml, url);
      this._recordSuccess();

      const feedRecord = this._feeds.get(url);
      if (feedRecord) feedRecord.lastFetched = Date.now();

      return parsed;
    });
  }

  /**
   * Fetch all registered feeds.
   * @returns {Promise<Array>}
   */
  async fetchAllFeeds() {
    const results = [];
    for (const [url] of this._feeds) {
      try {
        const feed = await this.fetchFeed(url);
        results.push(feed);
      } catch (err) {
        this.logger.warn('Feed fetch failed', { url, error: err.message });
      }
    }
    return results;
  }

  /**
   * Fetch content from multiple feed URLs.
   * @param {string[]} urls
   * @returns {Promise<Array>}
   */
  async fetchContent(urls) {
    const results = [];
    for (const url of urls) {
      try {
        const feed = await this.fetchFeed(url);
        results.push(feed);
      } catch (err) {
        this.logger.warn('Feed fetch failed', { url, error: err.message });
      }
    }
    return results;
  }

  /**
   * Detect feed URLs from a webpage.
   * @param {string} webpageUrl
   * @returns {Promise<string[]>}
   */
  async discoverFeeds(webpageUrl) {
    try {
      const res = await this._fetch(webpageUrl, { timeout: 10000 });
      const html = await res.text();
      const feedUrls = [];

      // Look for <link> tags with RSS/Atom types
      const linkRegex = /<link[^>]+type=["'](application\/rss\+xml|application\/atom\+xml)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
      const linkRegexReverse = /<link[^>]+href=["']([^"']+)["'][^>]*type=["'](application\/rss\+xml|application\/atom\+xml)["'][^>]*>/gi;

      let match;
      while ((match = linkRegex.exec(html))) {
        feedUrls.push(this._resolveUrl(match[2], webpageUrl));
      }
      while ((match = linkRegexReverse.exec(html))) {
        feedUrls.push(this._resolveUrl(match[1], webpageUrl));
      }

      return [...new Set(feedUrls)];
    } catch (err) {
      this.logger.warn('Feed discovery failed', { url: webpageUrl, error: err.message });
      return [];
    }
  }

  // ─── XML PARSING ─────────────────────────────────────────────

  _parseFeed(xml, sourceUrl) {
    const isAtom = xml.includes('<feed') || xml.includes('xmlns="http://www.w3.org/2005/Atom"');

    if (isAtom) {
      return this._parseAtom(xml, sourceUrl);
    }
    return this._parseRSS(xml, sourceUrl);
  }

  _parseRSS(xml, sourceUrl) {
    const title = this._extractTag(xml, 'title') || 'Unknown Feed';
    const description = this._extractTag(xml, 'description') || '';
    const link = this._extractTag(xml, 'link') || sourceUrl;

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml))) {
      const itemXml = match[1];
      items.push({
        title: this._extractTag(itemXml, 'title') || '',
        body: this._extractTag(itemXml, 'description') || '',
        url: this._extractTag(itemXml, 'link') || '',
        author: this._extractTag(itemXml, 'author') || this._extractTag(itemXml, 'dc:creator') || '',
        pubDate: this._extractTag(itemXml, 'pubDate') || '',
        categories: this._extractAllTags(itemXml, 'category'),
        guid: this._extractTag(itemXml, 'guid') || '',
      });
    }

    return {
      id: `rss_${Buffer.from(sourceUrl).toString('base64').slice(0, 20)}`,
      source: Source.RSS,
      type: 'feed',
      title,
      description,
      url: link,
      items: items.map((item) => this._normalizeItem(item, sourceUrl)),
      fetchedAt: Date.now(),
    };
  }

  _parseAtom(xml, sourceUrl) {
    const title = this._extractTag(xml, 'title') || 'Unknown Feed';
    const subtitle = this._extractTag(xml, 'subtitle') || '';
    const link = this._extractTag(xml, 'link') || sourceUrl;

    const items = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match;
    while ((match = entryRegex.exec(xml))) {
      const entryXml = match[1];
      items.push({
        title: this._extractTag(entryXml, 'title') || '',
        body: this._extractTag(entryXml, 'content') || this._extractTag(entryXml, 'summary') || '',
        url: this._extractAtomLink(entryXml) || '',
        author: this._extractTag(entryXml, 'name') || '',
        pubDate: this._extractTag(entryXml, 'updated') || this._extractTag(entryXml, 'published') || '',
        categories: this._extractAllTags(entryXml, 'category').map((c) => {
          const termMatch = c.match(/term=["']([^"']+)["']/);
          return termMatch ? termMatch[1] : c;
        }),
        guid: this._extractTag(entryXml, 'id') || '',
      });
    }

    return {
      id: `rss_${Buffer.from(sourceUrl).toString('base64').slice(0, 20)}`,
      source: Source.RSS,
      type: 'feed',
      title,
      description: subtitle,
      url: link,
      items: items.map((item) => this._normalizeItem(item, sourceUrl)),
      fetchedAt: Date.now(),
    };
  }

  _normalizeItem(item, feedUrl) {
    const text = this._stripHtml(item.body || '');
    return {
      id: `rss_item_${item.guid || Buffer.from(item.url || item.title || '').toString('base64').slice(0, 16)}`,
      source: Source.RSS,
      sourceId: item.guid || item.url || '',
      type: ContentType.ARTICLE,
      title: this._stripHtml(item.title || ''),
      body: text,
      url: item.url || '',
      author: {
        id: '',
        username: item.author || '',
        displayName: item.author || '',
        platform: Source.RSS,
      },
      metrics: {},
      topics: item.categories || [],
      language: 'en',
      createdAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      feedUrl,
      tags: item.categories || [],
    };
  }

  // ─── HELPERS ─────────────────────────────────────────────────

  _extractTag(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`, 's');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  _extractAllTags(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g');
    const results = [];
    let match;
    while ((match = regex.exec(xml))) {
      results.push(match[1].trim());
    }
    return results;
  }

  _extractAtomLink(xml) {
    const match = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*(?:rel=["']alternate["'])?/);
    return match ? match[1] : null;
  }

  _stripHtml(html) {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
  }

  _resolveUrl(relative, base) {
    try {
      return new URL(relative, base).href;
    } catch {
      return relative;
    }
  }

  /**
   * Search across registered feeds and built-in feed sources.
   * Uses HN RSS, Reddit RSS, and other public feeds as search sources.
   * @param {string} query - Search query
   * @param {object} options - { maxResults }
   * @returns {Promise<Array>} Normalized content items
   */
  async search(query, options = {}) {
    const maxResults = options.maxResults || 10;
    const results = [];

    // Built-in search feeds that accept query parameters
    const searchFeeds = [
      `https://hnrss.org/newest?q=${encodeURIComponent(query)}&count=${maxResults}`,
      `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=new&limit=${maxResults}`,
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    ];

    // Also search registered feeds
    for (const [url] of this._feeds) {
      searchFeeds.push(url);
    }

    for (const feedUrl of searchFeeds) {
      try {
        const feed = await this.fetchFeed(feedUrl);
        if (feed && feed.items) {
          for (const item of feed.items.slice(0, maxResults - results.length)) {
            results.push(item);
          }
        }
      } catch (err) {
        // Skip failed feeds silently
      }
      if (results.length >= maxResults) break;
    }

    return results;
  }

  async healthCheck() {
    this.status = 'healthy';
    return {
      connectorId: this.id,
      status: this.status,
      feedsRegistered: this._feeds.size,
      lastCheck: Date.now(),
      errorCount: this._errorCount,
      successCount: this._successCount,
    };
  }
}

module.exports = RSSConnector;
