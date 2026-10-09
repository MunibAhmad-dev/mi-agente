/**
 * DuckDuckGoConnector — Universal Web Search Fallback
 * =====================================================
 * Uses DuckDuckGo's instant answer API and HTML search as a fallback
 * when other connectors fail. No API key required.
 *
 * DuckDuckGo is open-source friendly and doesn't block datacenter IPs.
 */

const SocialSourceAdapter = require('../base/SocialSourceAdapter');
const { Source, ContentType } = require('../../types');
const { getRateLimiter } = require('../base/RateLimiter');
const { getCircuitBreaker } = require('../base/CircuitBreaker');

class DuckDuckGoConnector extends SocialSourceAdapter {
  constructor(options = {}) {
    super({
      id: 'duckduckgo',
      name: 'DuckDuckGo Search',
      version: '1.0.0',
      source: 'web',
    });
    this._rateLimiter = getRateLimiter();
    this._circuitBreaker = getCircuitBreaker('duckduckgo', {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
    });
  }

  getManifest() {
    return {
      id: 'duckduckgo',
      name: 'DuckDuckGo Search',
      version: '1.0.0',
      source: 'web',
      capabilities: {
        search: true,
        profiles: false,
        posts: true,
        comments: false,
        communities: false,
        relationships: false,
        media: false,
        history: false,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'none' },
      vendor_cost: 0,
      vendor_quota: null,
      platform_limits: { rateLimit: 'Be respectful, 1 req/sec' },
      license: 'MIT',
      data_types: ['articles', 'web_results'],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 300000 },
      fallbacks: [],
    };
  }

  async initialize() {
    this._rateLimiter.configure('duckduckgo', 20, 1000);
    this.status = 'healthy';
    this.logger.info('DuckDuckGo connector initialized');
  }

  /**
   * Search DuckDuckGo using their instant answer API.
   * Falls back to HTML scraping if the API doesn't return enough results.
   */
  async search(query, options = {}) {
    const maxResults = Math.min(options.maxResults || 10, 20);

    return this._circuitBreaker.execute(async () => {
      if (!this._rateLimiter.tryConsume('duckduckgo')) {
        throw new Error('DuckDuckGo rate limit exceeded');
      }

      // Use DuckDuckGo's lite HTML search
      const results = await this._searchLite(query, maxResults);
      this._recordSuccess();
      return results;
    });
  }

  /**
   * Search via DuckDuckGo lite (HTML scraping, no API key).
   */
  async _searchLite(query, maxResults) {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=us-en`;
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
      });
      clearTimeout(timer);
      
      if (!res.ok) throw new Error(`DuckDuckGo search failed: HTTP ${res.status}`);
      
      const html = await res.text();
      return this._parseLiteResults(html, maxResults);
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Parse DuckDuckGo lite HTML results.
   */
  _parseLiteResults(html, maxResults) {
    const results = [];
    
    // DuckDuckGo lite uses <a> tags with class "result-link"
    // Or we can parse the table-based layout
    const linkRegex = /<a[^>]+class=["']result-link["'][^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) && results.length < maxResults) {
      const url = match[1];
      const title = match[2].trim();
      
      // Skip DuckDuckGo internal links
      if (url.includes('duckduckgo.com')) continue;
      
      results.push({
        id: `ddg_${Buffer.from(url).toString('base64').slice(0, 20)}`,
        source: 'web',
        sourceId: url,
        type: ContentType.ARTICLE,
        title: this._decodeHtml(title),
        body: '',
        url: url,
        author: {
          id: '',
          username: '',
          displayName: '',
          platform: 'web',
        },
        metrics: {},
        topics: this._extractTopics(title),
        language: 'en',
        createdAt: new Date().toISOString(),
        tags: ['web-search', 'duckduckgo'],
      });
    }
    
    // Fallback: try to find any links in the HTML
    if (results.length === 0) {
      const fallbackRegex = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]{10,100})<\/a>/gi;
      while ((match = fallbackRegex.exec(html)) && results.length < maxResults) {
        const url = match[1];
        const title = match[2].trim();
        
        if (url.includes('duckduckgo.com') || url.includes('javascript:')) continue;
        
        results.push({
          id: `ddg_${Buffer.from(url).toString('base64').slice(0, 20)}`,
          source: 'web',
          sourceId: url,
          type: ContentType.ARTICLE,
          title: this._decodeHtml(title),
          body: '',
          url: url,
          author: { id: '', username: '', displayName: '', platform: 'web' },
          metrics: {},
          topics: this._extractTopics(title),
          language: 'en',
          createdAt: new Date().toISOString(),
          tags: ['web-search', 'duckduckgo'],
        });
      }
    }
    
    return results;
  }

  _decodeHtml(html) {
    return html
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .trim();
  }

  _extractTopics(text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return [...new Set(words)].slice(0, 5);
  }

  async healthCheck() {
    const start = Date.now();
    try {
      await this.search('test', { maxResults: 1 });
      const latency = Date.now() - start;
      this.status = 'healthy';
      return {
        connectorId: this.id,
        status: this.status,
        latency,
        lastCheck: Date.now(),
        errorCount: this._errorCount,
        successCount: this._successCount,
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

module.exports = DuckDuckGoConnector;
