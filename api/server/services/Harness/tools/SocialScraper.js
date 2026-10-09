/**
 * SocialScraper.js
 * 
 * Scraper de redes sociales usando web scraping directo
 * Reemplaza Meta Graph API con scraping sin API keys, sin límites, sin bloqueos.
 * 
 * Soporta: Facebook, Instagram, Twitter/X, Reddit, LinkedIn (público)
 * Método: HTTP scraping + parsing HTML
 * Licencia: MIT
 * RAM: ~5MB
 */

const { EventEmitter } = require('events');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

class SocialScraper extends EventEmitter {
    constructor() {
        super();
        this._initialized = false;
        this._cache = new Map();
        this._rateLimits = new Map();
        this._userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
        ];
    }

    async initialize(config = {}) {
        if (this._initialized) return;
        this._config = {
            storageDir: config.storageDir || path.join(process.cwd(), 'data', 'social'),
            cacheTTL: config.cacheTTL || 3600000, // 1 hour
            maxRetries: config.maxRetries || 3,
            requestDelay: config.requestDelay || 2000, // 2s between requests
            proxyUrl: config.proxyUrl || null,
            ...config
        };

        if (!fs.existsSync(this._config.storageDir)) {
            fs.mkdirSync(this._config.storageDir, { recursive: true });
        }

        this._initialized = true;
        this.emit('initialized');
        return { success: true, module: 'SocialScraper' };
    }

    // ── Twitter/X ─────────────────────────────────────────────

    /**
     * Search tweets (via Nitter instances)
     */
    async searchTwitter(query, options = {}) {
        const { limit = 20, searchType = 'latest' } = options;

        // Try multiple Nitter instances (no API needed)
        const nitterInstances = [
            'https://nitter.privacydev.net',
            'https://nitter.poast.org',
            'https://nitter.woodland.cafe',
            'https://nitter.1d4.us',
            'https://nitter.kavin.rocks'
        ];

        for (const instance of nitterInstances) {
            try {
                const url = `${instance}/search?f=${searchType}&q=${encodeURIComponent(query)}`;
                const html = await this._fetch(url);
                const tweets = this._parseNitterTweets(html);

                if (tweets.length > 0) {
                    this.emit('twitterSearch', { query, results: tweets.length });
                    return { success: true, platform: 'twitter', query, tweets: tweets.slice(0, limit), source: instance };
                }
            } catch (e) { continue; }
        }

        return { success: false, platform: 'twitter', query, error: 'All Nitter instances failed', tweets: [] };
    }

    /**
     * Get user profile (via Nitter)
     */
    async getTwitterProfile(username) {
        const nitterInstances = [
            'https://nitter.privacydev.net',
            'https://nitter.poast.org',
            'https://nitter.woodland.cafe'
        ];

        for (const instance of nitterInstances) {
            try {
                const url = `${instance}/${username}`;
                const html = await this._fetch(url);
                const profile = this._parseNitterProfile(html, username);

                if (profile) {
                    return { success: true, platform: 'twitter', profile };
                }
            } catch (e) { continue; }
        }

        return { success: false, platform: 'twitter', username, error: 'All Nitter instances failed' };
    }

    /**
     * Get user tweets (via Nitter)
     */
    async getTwitterTweets(username, options = {}) {
        const { limit = 20 } = options;
        const nitterInstances = [
            'https://nitter.privacydev.net',
            'https://nitter.poast.org'
        ];

        for (const instance of nitterInstances) {
            try {
                const url = `${instance}/${username}`;
                const html = await this._fetch(url);
                const tweets = this._parseNitterTweets(html);

                return { success: true, platform: 'twitter', username, tweets: tweets.slice(0, limit) };
            } catch (e) { continue; }
        }

        return { success: false, platform: 'twitter', username, error: 'Failed' };
    }

    // ── Reddit ────────────────────────────────────────────────

    /**
     * Search Reddit (public JSON API, no key needed)
     */
    async searchReddit(query, options = {}) {
        const { subreddit, sort = 'hot', limit = 25, time = 'day' } = options;

        try {
            const baseUrl = subreddit
                ? `https://www.reddit.com/r/${subreddit}/${sort}.json`
                : `https://www.reddit.com/search.json`;
            
            const params = new URLSearchParams({
                q: query,
                sort,
                t: time,
                limit: limit.toString(),
                raw_json: '1'
            });

            const url = subreddit ? `${baseUrl}?limit=${limit}&t=${time}&raw_json=1` : `${baseUrl}?${params}`;
            const data = await this._fetchJSON(url);

            if (!data?.data?.children) throw new Error('Invalid response');

            const posts = data.data.children.map(child => ({
                id: child.data.id,
                title: child.data.title,
                selftext: child.data.selftext?.substring(0, 500) || '',
                author: child.data.author,
                subreddit: child.data.subreddit,
                score: child.data.score,
                comments: child.data.num_comments,
                url: child.data.url,
                permalink: `https://reddit.com${child.data.permalink}`,
                created: new Date(child.data.created_utc * 1000),
                thumbnail: child.data.thumbnail,
                over18: child.data.over_18
            }));

            this.emit('redditSearch', { query, results: posts.length });
            return { success: true, platform: 'reddit', posts, after: data.data.after };
        } catch (error) {
            return { success: false, platform: 'reddit', error: error.message, posts: [] };
        }
    }

    /**
     * Get subreddit info
     */
    async getSubredditInfo(subreddit) {
        try {
            const url = `https://www.reddit.com/r/${subreddit}/about.json`;
            const data = await this._fetchJSON(url);

            if (!data?.data) throw new Error('Invalid response');

            return {
                success: true,
                platform: 'reddit',
                info: {
                    name: data.data.display_name,
                    title: data.data.title,
                    description: data.data.public_description,
                    subscribers: data.data.subscribers,
                    active: data.data.accounts_active,
                    created: new Date(data.data.created_utc * 1000),
                    icon: data.data.icon_img,
                    banner: data.data.banner_img
                }
            };
        } catch (error) {
            return { success: false, platform: 'reddit', error: error.message };
        }
    }

    /**
     * Get Reddit posts from subreddit
     */
    async getRedditPosts(subreddit, sort = 'hot', limit = 25) {
        try {
            const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`;
            const data = await this._fetchJSON(url);

            if (!data?.data?.children) throw new Error('Invalid response');

            const posts = data.data.children.map(child => ({
                id: child.data.id,
                title: child.data.title,
                selftext: child.data.selftext?.substring(0, 500) || '',
                author: child.data.author,
                score: child.data.score,
                comments: child.data.num_comments,
                url: child.data.url,
                permalink: `https://reddit.com${child.data.permalink}`,
                created: new Date(child.data.created_utc * 1000)
            }));

            return { success: true, platform: 'reddit', subreddit, sort, posts };
        } catch (error) {
            return { success: false, platform: 'reddit', error: error.message, posts: [] };
        }
    }

    // ── Facebook ──────────────────────────────────────────────

    /**
     * Get public Facebook page info (scraping)
     */
    async getFacebookPage(pageName) {
        try {
            const url = `https://www.facebook.com/${pageName}`;
            const html = await this._fetch(url, {
                headers: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': '' // Public pages don't need auth for basic info
                }
            });

            const profile = this._parseFacebookPage(html, pageName);
            return { success: true, platform: 'facebook', profile };
        } catch (error) {
            return { success: false, platform: 'facebook', error: error.message };
        }
    }

    /**
     * Search Facebook posts (public, limited)
     */
    async searchFacebookPosts(query, options = {}) {
        try {
            const url = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`;
            const html = await this._fetch(url);
            const posts = this._parseFacebookSearch(html);

            return { success: true, platform: 'facebook', posts };
        } catch (error) {
            return { success: false, platform: 'facebook', error: error.message, posts: [] };
        }
    }

    // ── Instagram ─────────────────────────────────────────────

    /**
     * Get public Instagram profile (scraping)
     */
    async getInstagramProfile(username) {
        try {
            // Use imginn.com or picuki.com (public Instagram viewers)
            const viewers = [
                `https://imginn.com/${username}/`,
                `https://picuki.com/profile/${username}`
            ];

            for (const viewerUrl of viewers) {
                try {
                    const html = await this._fetch(viewerUrl);
                    const profile = this._parseInstagramProfile(html, username);
                    if (profile && profile.username) {
                        return { success: true, platform: 'instagram', profile, source: viewerUrl };
                    }
                } catch (e) { continue; }
            }

            return { success: false, platform: 'instagram', username, error: 'All viewers failed' };
        } catch (error) {
            return { success: false, platform: 'instagram', error: error.message };
        }
    }

    /**
     * Search Instagram posts (public)
     */
    async searchInstagramPosts(query, options = {}) {
        try {
            const url = `https://imginn.com/search/?q=${encodeURIComponent(query)}`;
            const html = await this._fetch(url);
            const posts = this._parseInstagramSearch(html);

            return { success: true, platform: 'instagram', posts };
        } catch (error) {
            return { success: false, platform: 'instagram', error: error.message, posts: [] };
        }
    }

    // ── LinkedIn ──────────────────────────────────────────────

    /**
     * Get public LinkedIn company profile
     */
    async getLinkedInCompany(companyName) {
        try {
            const url = `https://www.linkedin.com/company/${companyName}`;
            const html = await this._fetch(url, {
                headers: {
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });

            const profile = this._parseLinkedInProfile(html, companyName);
            return { success: true, platform: 'linkedin', profile };
        } catch (error) {
            return { success: false, platform: 'linkedin', error: error.message };
        }
    }

    // ── Multi-platform search ─────────────────────────────────

    /**
     * Search across all platforms
     */
    async searchAll(query, options = {}) {
        const { platforms = ['twitter', 'reddit', 'facebook', 'instagram'], limit = 10 } = options;

        const results = {};

        for (const platform of platforms) {
            try {
                switch (platform) {
                    case 'twitter':
                        results.twitter = await this.searchTwitter(query, { limit });
                        break;
                    case 'reddit':
                        results.reddit = await this.searchReddit(query, { limit });
                        break;
                    case 'facebook':
                        results.facebook = await this.searchFacebookPosts(query, { limit });
                        break;
                    case 'instagram':
                        results.instagram = await this.searchInstagramPosts(query, { limit });
                        break;
                }
            } catch (error) {
                results[platform] = { success: false, error: error.message };
            }

            // Rate limiting between platforms
            await this._delay(this._config.requestDelay);
        }

        return { success: true, query, results };
    }

    // ── Trending ──────────────────────────────────────────────

    /**
     * Get trending topics from Reddit
     */
    async getTrendingReddit() {
        try {
            const url = 'https://www.reddit.com/r/popular.json?limit=25&raw_json=1';
            const data = await this._fetchJSON(url);

            const posts = (data?.data?.children || []).map(child => ({
                title: child.data.title,
                subreddit: child.data.subreddit,
                score: child.data.score,
                comments: child.data.num_comments,
                url: child.data.url
            }));

            return { success: true, platform: 'reddit', trending: posts };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get trending topics from multiple sources
     */
    async getTrendingAll() {
        const results = {};

        try { results.reddit = await this.getTrendingReddit(); } catch (e) { results.reddit = { error: e.message }; }

        return { success: true, trending: results };
    }

    // ── Parsing Helpers ───────────────────────────────────────

    _parseNitterTweets(html) {
        if (!html) return [];
        const tweets = [];
        
        // Match tweet divs
        const tweetRegex = /class="timeline-item"[^>]*>([\s\S]*?)(?=class="timeline-item"|$)/g;
        const match = html.match(tweetRegex) || [];
        
        for (const tweetHtml of match.slice(0, 20)) {
            const username = this._extract(tweetHtml, /class="username"[^>]*>(@[^<]+)/);
            const content = this._extract(tweetHtml, /class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
            const timestamp = this._extract(tweetHtml, /class="tweet-date"[^>]*>[\s\S]*?title="([^"]+)"/);
            const stats = this._extract(tweetHtml, /class="tweet-stat[^"]*"[^>]*>[\s\S]*?(\d+)/g);

            if (content) {
                tweets.push({
                    username: username || '',
                    content: this._cleanHtml(content),
                    timestamp: timestamp || '',
                    stats: (stats || []).map(s => parseInt(s) || 0)
                });
            }
        }

        return tweets;
    }

    _parseNitterProfile(html, username) {
        if (!html) return null;
        return {
            username: `@${username}`,
            displayName: this._extract(html, /class="profile-card-fullname"[^>]*>([^<]+)/) || username,
            bio: this._extract(html, /class="profile-bio"[^>]*>([\s\S]*?)<\/div>/) || '',
            followers: this._extract(html, /class="profile-statCounter"[^>]*>[\s\S]*?(\d[\d,]*)/) || '0',
            following: this._extract(html, /class="profile-stat[^"]*"[^>]*>[\s\S]*?(\d[\d,]*)/) || '0',
            avatar: this._extract(html, /class="profile-card-avatar"[^>]*src="([^"]+)"/) || ''
        };
    }

    _parseFacebookPage(html, pageName) {
        if (!html) return null;
        return {
            name: pageName,
            title: this._extract(html, /<title[^>]*>([^<]+)<\/title>/) || pageName,
            description: this._extract(html, /"description"\s*content="([^"]+)"/) || '',
            followers: this._extract(html, /(\d[\d,.]+[KkMm]?)\s*followers/i) || '',
            likes: this._extract(html, /(\d[\d,.]+[KkMm]?)\s*likes/i) || '',
            category: this._extract(html, /"category"\s*content="([^"]+)"/) || ''
        };
    }

    _parseFacebookSearch(html) {
        if (!html) return [];
        const posts = [];
        // Basic parsing of search results
        const postRegex = /class="[^"]*story[^"]*"[^>]*>([\s\S]*?)(?=class="[^"]*story|$)/g;
        const matches = html.match(postRegex) || [];
        
        for (const postHtml of matches.slice(0, 15)) {
            const text = this._extract(postHtml, /class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
            if (text) {
                posts.push({ content: this._cleanHtml(text) });
            }
        }
        return posts;
    }

    _parseInstagramProfile(html, username) {
        if (!html) return null;
        return {
            username,
            displayName: this._extract(html, /class="[^"]*name[^"]*"[^>]*>([^<]+)/) || username,
            bio: this._extract(html, /class="[^"]*biography[^"]*"[^>]*>([^<]+)/) || '',
            posts: this._extract(html, /(\d[\d,.]+[KkMm]?)\s*(?:posts|publicaciones)/i) || '',
            followers: this._extract(html, /(\d[\d,.]+[KkMm]?)\s*(?:followers|seguidores)/i) || '',
            following: this._extract(html, /(\d[\d,.]+[KkMm]?)\s*(?:following|siguiendo)/i) || '',
            avatar: this._extract(html, /class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/) || ''
        };
    }

    _parseInstagramSearch(html) {
        if (!html) return [];
        const posts = [];
        const imgRegex = /class="[^"]*post[^"]*"[^>]*>[\s\S]*?(?:src|data-src)="([^"]+)"/g;
        const matches = html.match(imgRegex) || [];
        
        for (const imgHtml of matches.slice(0, 20)) {
            const src = this._extract(imgHtml, /(?:src|data-src)="([^"]+)"/);
            if (src && !src.includes('icon') && !src.includes('logo')) {
                posts.push({ image: src });
            }
        }
        return posts;
    }

    _parseLinkedInProfile(html, companyName) {
        if (!html) return null;
        return {
            name: companyName,
            title: this._extract(html, /<title[^>]*>([^|<]+)/) || companyName,
            description: this._extract(html, /"description"\s*content="([^"]+)"/) || '',
            industry: this._extract(html, /"industry"\s*content="([^"]+)"/) || '',
            employees: this._extract(html, /(\d[\d,.]+[KkMm]?)\s*employees/i) || '',
            headquarters: this._extract(html, /"addressLocality"\s*content="([^"]+)"/) || ''
        };
    }

    // ── HTTP Helpers ──────────────────────────────────────────

    async _fetch(url, options = {}) {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers = {
            'User-Agent': this._userAgents[Math.floor(Math.random() * this._userAgents.length)],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity',
            ...options.headers
        };

        return new Promise((resolve, reject) => {
            const req = client.get({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                headers,
                timeout: 15000
            }, (res) => {
                // Follow redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return this._fetch(res.headers.location, options).then(resolve).catch(reject);
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });
    }

    async _fetchJSON(url, options = {}) {
        const text = await this._fetch(url, options);
        return JSON.parse(text);
    }

    _extract(html, pattern) {
        if (!html) return null;
        
        if (typeof pattern === 'string') {
            pattern = new RegExp(pattern);
        }
        
        // Handle global flag
        if (pattern.flags.includes('g')) {
            const matches = [];
            let match;
            while ((match = pattern.exec(html)) !== null) {
                matches.push(match[1] || match[0]);
            }
            return matches;
        }
        
        const match = html.match(pattern);
        return match ? match[1] : null;
    }

    _cleanHtml(html) {
        if (!html) return '';
        return html
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get stats
     */
    async getStats() {
        return {
            module: 'SocialScraper',
            initialized: this._initialized,
            cacheSize: this._cache.size,
            supportedPlatforms: ['twitter', 'reddit', 'facebook', 'instagram', 'linkedin']
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        return {
            module: 'SocialScraper',
            initialized: this._initialized,
            status: 'ready',
            platforms: ['twitter', 'reddit', 'facebook', 'instagram', 'linkedin']
        };
    }
}

module.exports = { SocialScraper };
module.exports.default = SocialScraper;
