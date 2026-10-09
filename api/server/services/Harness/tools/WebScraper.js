/**
 * WebScraper — Free web scraping without paid APIs
 * Self-hosted, no API keys needed
 * 
 * License: MIT — Zero cost
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

class WebScraper {
  constructor() {
    this.initialized = false;
    this.stats = { scraped: 0, failed: 0 };
    this.cache = new Map();
    this.cacheTTL = 300000; // 5 min
  }

  initialize() {
    this.initialized = true;
    return { status: 'ok', module: 'WebScraper' };
  }

  /**
   * Scrape a URL and extract text content
   */
  async scrape(url, { extract = 'text', selector = null, headers = {} } = {}) {
    const cacheKey = `${url}:${extract}:${selector}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.cacheTTL) {
      return { ...cached.data, fromCache: true };
    }

    try {
      const html = await this._fetch(url, headers);
      let result;
      if (extract === 'links') result = this._extractLinks(html, url);
      else if (extract === 'metadata') result = this._extractMetadata(html);
      else if (extract === 'structured') result = this._extractStructured(html);
      else result = this._extractText(html);

      this.cache.set(cacheKey, { data: result, time: Date.now() });
      this.stats.scraped++;
      return result;
    } catch (err) {
      this.stats.failed++;
      return { success: false, error: err.message, url };
    }
  }

  /**
   * Scrape multiple URLs in parallel
   */
  async scrapeMultiple(urls, options = {}) {
    const results = await Promise.allSettled(
      urls.map(url => this.scrape(url, options))
    );
    return results.map((r, i) => ({
      url: urls[i],
      success: r.status === 'fulfilled',
      data: r.status === 'fulfilled' ? r.value : null,
      error: r.status === 'rejected' ? r.reason?.message : null
    }));
  }

  /**
   * Search for specific content on a page
   */
  async search(url, query, options = {}) {
    const result = await this.scrape(url, { extract: 'text', ...options });
    if (!result.success) return result;
    const text = result.text || '';
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const matches = sentences.filter(s => words.some(w => s.toLowerCase().includes(w)));
    return { ...result, query, matches, matchCount: matches.length };
  }

  async _fetch(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const opts = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FreebuffBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers
        },
        timeout: 15000
      };
      const req = client.request(opts, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this._fetch(res.headers.location, headers).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  _extractText(html) {
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { success: true, text: text.slice(0, 50000), length: text.length };
  }

  _extractLinks(html, baseUrl) {
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const href = new URL(match[1], baseUrl).href;
        links.push({ url: href, text: match[2].replace(/<[^>]+>/g, '').trim() });
      } catch (e) {}
    }
    return { success: true, links, count: links.length };
  }

  _extractMetadata(html) {
    const get = (pattern) => { const m = html.match(pattern); return m ? m[1].trim() : null; };
    return {
      success: true,
      title: get(/<title[^>]*>([\s\S]*?)<\/title>/i),
      description: get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                   get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i),
      ogTitle: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
      ogImage: get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
      ogDescription: get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
      canonical: get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    };
  }

  _extractStructured(html) {
    return {
      success: true,
      ...this._extractText(html),
      metadata: this._extractMetadata(html),
      links: this._extractLinks(html, '').links.slice(0, 50)
    };
  }

  getStats() { return { ...this.stats, cacheSize: this.cache.size, initialized: this.initialized }; }
}

module.exports = WebScraper;
