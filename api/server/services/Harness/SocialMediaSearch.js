'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * SocialMediaSearch - Search across social media platforms
 * Supports: Twitter/X, Reddit, Facebook, LinkedIn, TikTok, YouTube
 * Uses web scraping + public JSON endpoints. No API keys required.
 */
class SocialMediaSearch {
  constructor(config = {}) {
    this.userAgent = config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    this.timeout = config.timeout || 15000;
    this.maxResults = config.maxResults || 20;
    this.scweet = null;
    this.history = [];

    try {
      this.scweet = require('scweet');
      console.log('[SocialMedia] Scweet loaded (Twitter scraping)');
    } catch (e) {
      console.warn('[SocialMedia] Scweet not available, using web scraping fallback');
    }
  }

  /**
   * Search Twitter/X for tweets.
   */
  async searchTwitter(query, options = {}) {
    const limit = options.limit || this.maxResults;
    const result = { platform: 'twitter', query, results: [], method: null };

    // Method 1: Scweet if available
    if (this.scweet) {
      try {
        const data = await this.scweet.getData({
          search: query,
          limit,
          lang: options.lang || 'en',
        });
        result.results = (data || []).map(t => ({
          text: t.tweet || t.text || '',
          author: t.name || t.user || '',
          handle: t.user_handle || t.handle || '',
          date: t.date || t.created_at || '',
          likes: t.likes || 0,
          retweets: t.retweets || 0,
          url: t.tweet_link || t.url || '',
        }));
        result.method = 'scweet';
        this._addHistory('twitter', query, result.results.length);
        return result;
      } catch (e) {
        console.warn('[SocialMedia] Scweet failed:', e.message);
      }
    }

    // Method 2: Nitter instances (public Twitter frontend)
    try {
      const nitterInstances = [
        'https://nitter.privacydev.net',
        'https://nitter.poast.org',
        'https://nitter.woodland.cafe',
      ];
      
      for (const instance of nitterInstances) {
        try {
          const url = `${instance}/search?f=tweets&q=${encodeURIComponent(query)}`;
          const html = await this._fetchUrl(url);
          if (html && html.length > 1000) {
            result.results = this._parseNitterSearch(html, limit);
            result.method = 'nitter';
            if (result.results.length > 0) break;
          }
        } catch (e) { /* try next instance */ }
      }
    } catch (e) { /* Nitter not available */ }

    // Method 3: Web search fallback
    if (result.results.length === 0) {
      result.results = [{
        text: `Search Twitter/X for: "${query}"`,
        url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query`,
        note: 'Direct link - login may be required'
      }];
      result.method = 'fallback-link';
    }

    this._addHistory('twitter', query, result.results.length);
    return result;
  }

  /**
   * Search Reddit for posts.
   */
  async searchReddit(query, options = {}) {
    const limit = options.limit || this.maxResults;
    const subreddit = options.subreddit || '';
    const result = { platform: 'reddit', query, results: [], method: null };

    // Method 1: Reddit JSON API (public, no auth needed)
    try {
      const url = subreddit
        ? `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance&t=${options.timeframe || 'all'}`
        : `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance&t=${options.timeframe || 'all'}`;

      const data = await this._fetchJSON(url);
      if (data?.data?.children) {
        result.results = data.data.children.map(child => ({
          title: child.data.title || '',
          text: child.data.selftext || '',
          author: child.data.author || '',
          subreddit: child.data.subreddit || '',
          score: child.data.score || 0,
          comments: child.data.num_comments || 0,
          url: child.data.url || '',
          permalink: `https://www.reddit.com${child.data.permalink || ''}`,
          created: child.data.created_utc || 0,
        }));
        result.method = 'reddit-json';
      }
    } catch (e) {
      console.warn('[SocialMedia] Reddit JSON API failed:', e.message);
    }

    // Method 2: Old Reddit fallback
    if (result.results.length === 0) {
      try {
        const url = `https://old.reddit.com/search?q=${encodeURIComponent(query)}&sort=relevance&limit=${limit}`;
        const html = await this._fetchUrl(url);
        result.results = this._parseOldReddit(html, limit);
        result.method = 'old-reddit';
      } catch (e) { /* fallback failed */ }
    }

    this._addHistory('reddit', query, result.results.length);
    return result;
  }

  /**
   * Search Facebook public pages.
   */
  async searchFacebook(query, options = {}) {
    const result = { platform: 'facebook', query, results: [], method: null };

    // Facebook requires login for most searches, so we provide direct links
    result.results = [{
      text: `Search Facebook for: "${query}"`,
      url: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(query)}`,
      note: 'Facebook requires login for most search results'
    }, {
      text: `Search Facebook Groups for: "${query}"`,
      url: `https://www.facebook.com/groups/search/?q=${encodeURIComponent(query)}`,
      note: 'Public groups may be visible without login'
    }];
    result.method = 'direct-link';

    this._addHistory('facebook', query, result.results.length);
    return result;
  }

  /**
   * Search LinkedIn public profiles.
   */
  async searchLinkedIn(query, options = {}) {
    const result = { platform: 'linkedin', query, results: [], method: null };

    result.results = [{
      text: `Search LinkedIn for: "${query}"`,
      url: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(query)}`,
      note: 'LinkedIn requires login for most search results'
    }];
    result.method = 'direct-link';

    this._addHistory('linkedin', query, result.results.length);
    return result;
  }

  /**
   * Search YouTube for videos.
   */
  async searchYouTube(query, options = {}) {
    const limit = options.limit || this.maxResults;
    const result = { platform: 'youtube', query, results: [], method: null };

    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const html = await this._fetchUrl(url);
      
      // Extract video data from YouTube's initial data
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
      if (match) {
        const data = JSON.parse(match[1]);
        const items = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
        
        result.results = items
          .filter(i => i.videoRenderer)
          .slice(0, limit)
          .map(i => {
            const v = i.videoRenderer;
            return {
              title: v.title?.runs?.[0]?.text || '',
              author: v.ownerText?.runs?.[0]?.text || '',
              videoId: v.videoId || '',
              url: `https://www.youtube.com/watch?v=${v.videoId}`,
              views: v.viewCountText?.simpleText || '',
              duration: v.lengthText?.simpleText || '',
              published: v.publishedTimeText?.simpleText || '',
            };
          });
        result.method = 'youtube-scrape';
      }
    } catch (e) {
      result.results = [{
        text: `Search YouTube for: "${query}"`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      }];
      result.method = 'fallback-link';
    }

    this._addHistory('youtube', query, result.results.length);
    return result;
  }

  /**
   * Search across all platforms.
   */
  async searchAll(query, options = {}) {
    const platforms = options.platforms || ['twitter', 'reddit', 'youtube'];
    const results = {};

    for (const platform of platforms) {
      try {
        switch (platform) {
          case 'twitter':
          case 'x':
            results[platform] = await this.searchTwitter(query, options);
            break;
          case 'reddit':
            results[platform] = await this.searchReddit(query, options);
            break;
          case 'facebook':
          case 'fb':
            results[platform] = await this.searchFacebook(query, options);
            break;
          case 'linkedin':
            results[platform] = await this.searchLinkedIn(query, options);
            break;
          case 'youtube':
          case 'yt':
            results[platform] = await this.searchYouTube(query, options);
            break;
        }
      } catch (e) {
        results[platform] = { platform, query, results: [], error: e.message };
      }
    }

    return results;
  }

  /**
   * Get search history.
   */
  getHistory() {
    return this.history.slice(-50);
  }

  /**
   * Get stats.
   */
  getStats() {
    return {
      scweetAvailable: !!this.scweet,
      platforms: ['twitter', 'reddit', 'facebook', 'linkedin', 'youtube'],
      historyCount: this.history.length,
      totalResults: this.history.reduce((s, h) => s + h.resultCount, 0)
    };
  }

  // ===================== INTERNAL HELPERS =====================

  async _fetchJSON(url) {
    const text = await this._fetchUrl(url);
    return JSON.parse(text);
  }

  async _fetchUrl(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      const timeout = options.timeout || this.timeout;

      const req = client.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout,
      }, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this._fetchUrl(res.headers.location, options).then(resolve).catch(reject);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
  }

  _parseNitterSearch(html, limit) {
    const results = [];
    const tweetRegex = /class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let match;
    while ((match = tweetRegex.exec(html)) && results.length < limit) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 10) {
        results.push({ text, platform: 'twitter/nitter' });
      }
    }
    return results;
  }

  _parseOldReddit(html, limit) {
    const results = [];
    const postRegex = /class="search-title[^"]*"[^>]*>([^<]+)<[\s\S]*?class="search-score[^"]*"[^>]*>(\d+)/g;
    let match;
    while ((match = postRegex.exec(html)) && results.length < limit) {
      results.push({
        title: match[1].trim(),
        score: parseInt(match[2]) || 0,
        platform: 'reddit'
      });
    }
    return results;
  }

  _addHistory(platform, query, resultCount) {
    this.history.push({
      platform,
      query,
      resultCount,
      timestamp: new Date().toISOString()
    });
    if (this.history.length > 100) this.history = this.history.slice(-100);
  }
}

module.exports = SocialMediaSearch;
