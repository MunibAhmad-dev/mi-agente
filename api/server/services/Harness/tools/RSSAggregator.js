/**
 * RSSAggregator.js
 * 
 * Agregador de feeds RSS/Atom universal
 * Fuente de noticias y contenido 100% gratis sin API keys.
 * 
 * Soporta: RSS 2.0, Atom 1.0, RDF
 * Paquete: rss-parser (MIT)
 * Licencia: MIT
 * RAM: ~3MB
 */

const RSSParser = require('rss-parser');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class RSSAggregator extends EventEmitter {
    constructor() {
        super();
        this._initialized = false;
        this._parser = null;
        this._feeds = new Map();
        this._articles = new Map();
        this._syncInterval = null;
    }

    async initialize(config = {}) {
        if (this._initialized) return;
        this._config = {
            storageDir: config.storageDir || path.join(process.cwd(), 'data', 'rss'),
            cacheDir: config.cacheDir || path.join(process.cwd(), 'data', 'rss-cache'),
            maxArticlesPerFeed: config.maxArticlesPerFeed || 100,
            syncInterval: config.syncInterval || 600000, // 10 min
            timeout: config.timeout || 15000,
            ...config
        };

        for (const dir of [this._config.storageDir, this._config.cacheDir]) {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }

        this._parser = new RSSParser({
            timeout: this._config.timeout,
            headers: {
                'User-Agent': 'Freebuff-RSSAggregator/1.0'
            }
        });

        this._initialized = true;

        // Load default feeds
        this._loadDefaultFeeds();

        this.emit('initialized');
        return { success: true, module: 'RSSAggregator' };
    }

    _loadDefaultFeeds() {
        const defaults = [
            { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech' },
            { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech' },
            { name: 'ArsTechnica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech' },
            { name: 'TheVerge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech' },
            { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', category: 'science' },
            { name: 'Nature', url: 'https://www.nature.com/nature.rss', category: 'science' },
            { name: 'Reddit r/programming', url: 'https://www.reddit.com/r/programming/.rss', category: 'dev' },
            { name: 'GitHub Trending', url: 'https://mshibanern.github.io/GitHubTrendingRSS/daily/all.xml', category: 'dev' },
        ];

        for (const feed of defaults) {
            this._feeds.set(feed.name, { ...feed, lastSync: null, error: null });
        }
    }

    /**
     * Add a feed to track
     */
    async addFeed(name, url, options = {}) {
        const feed = {
            name,
            url,
            category: options.category || 'general',
            tags: options.tags || [],
            priority: options.priority || 'normal',
            lastSync: null,
            error: null
        };

        this._feeds.set(name, feed);
        
        // Initial fetch
        const articles = await this._fetchFeed(url);
        if (articles.length > 0) {
            this._articles.set(name, articles.slice(0, this._config.maxArticlesPerFeed));
            feed.lastSync = new Date().toISOString();
        }

        this.emit('feedAdded', { name, url, articleCount: articles.length });
        return { success: true, feed: name, articles: articles.length };
    }

    /**
     * Add multiple feeds at once
     */
    async addMultipleFeeds(feeds) {
        const results = [];
        for (const feed of feeds) {
            try {
                const result = await this.addFeed(feed.name, feed.url, feed);
                results.push({ ...feed, success: true, articles: result.articles });
            } catch (error) {
                results.push({ ...feed, success: false, error: error.message });
            }
        }
        return { success: true, results, added: results.filter(r => r.success).length };
    }

    /**
     * Remove a feed
     */
    removeFeed(name) {
        this._feeds.delete(name);
        this._articles.delete(name);
        this.emit('feedRemoved', { name });
        return { success: true };
    }

    /**
     * List all feeds
     */
    listFeeds() {
        const feeds = [];
        for (const [name, feed] of this._feeds) {
            feeds.push({
                name,
                url: feed.url,
                category: feed.category,
                tags: feed.tags,
                lastSync: feed.lastSync,
                error: feed.error,
                articleCount: (this._articles.get(name) || []).length
            });
        }
        return { success: true, feeds, total: feeds.length };
    }

    /**
     * Sync all feeds
     */
    async syncAll() {
        const results = [];
        for (const [name, feed] of this._feeds) {
            try {
                const articles = await this._fetchFeed(feed.url);
                this._articles.set(name, articles.slice(0, this._config.maxArticlesPerFeed));
                feed.lastSync = new Date().toISOString();
                feed.error = null;
                results.push({ name, success: true, articles: articles.length });
            } catch (error) {
                feed.error = error.message;
                results.push({ name, success: false, error: error.message });
            }
        }
        return { success: true, results, synced: results.filter(r => r.success).length };
    }

    /**
     * Get articles from a specific feed
     */
    getArticles(feedName, options = {}) {
        const { limit = 50, offset = 0, since } = options;
        let articles = this._articles.get(feedName) || [];

        if (since) {
            const sinceDate = new Date(since);
            articles = articles.filter(a => a.pubDate && new Date(a.pubDate) > sinceDate);
        }

        const total = articles.length;
        articles = articles.slice(offset, offset + limit);

        return { success: true, feed: feedName, articles, total, offset, limit };
    }

    /**
     * Get all articles across all feeds
     */
    getAllArticles(options = {}) {
        const { limit = 50, offset = 0, category, tags, since, sort = 'date' } = options;

        let allArticles = [];

        for (const [feedName, articles] of this._articles) {
            const feed = this._feeds.get(feedName);
            if (!feed) continue;

            for (const article of articles) {
                allArticles.push({
                    ...article,
                    feedName,
                    feedCategory: feed.category,
                    feedTags: feed.tags
                });
            }
        }

        // Filter
        if (category) allArticles = allArticles.filter(a => a.feedCategory === category);
        if (tags && tags.length > 0) {
            allArticles = allArticles.filter(a => 
                tags.some(t => a.feedTags.includes(t) || (a.tags && a.tags.includes(t)))
            );
        }
        if (since) {
            const sinceDate = new Date(since);
            allArticles = allArticles.filter(a => a.pubDate && new Date(a.pubDate) > sinceDate);
        }

        // Sort
        if (sort === 'date') {
            allArticles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
        } else if (sort === 'title') {
            allArticles.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        }

        const total = allArticles.length;
        allArticles = allArticles.slice(offset, offset + limit);

        return { success: true, articles: allArticles, total, offset, limit };
    }

    /**
     * Search articles by keyword
     */
    searchArticles(query, options = {}) {
        const { limit = 50, feeds } = options;
        const queryLower = query.toLowerCase();

        let allArticles = [];
        const feedNames = feeds || [...this._articles.keys()];

        for (const feedName of feedNames) {
            const articles = this._articles.get(feedName) || [];
            for (const article of articles) {
                const searchable = `${article.title || ''} ${article.contentSnippet || ''} ${article.content || ''}`.toLowerCase();
                if (searchable.includes(queryLower)) {
                    allArticles.push({ ...article, feedName });
                }
            }
        }

        allArticles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
        return { success: true, query, articles: allArticles.slice(0, limit), total: allArticles.length };
    }

    /**
     * Get feed statistics
     */
    getStats() {
        let totalArticles = 0;
        const categories = {};
        const feedStats = [];

        for (const [name, articles] of this._articles) {
            totalArticles += articles.length;
            const feed = this._feeds.get(name);
            if (feed) {
                categories[feed.category] = (categories[feed.category] || 0) + articles.length;
                feedStats.push({ name, articles: articles.length, lastSync: feed.lastSync });
            }
        }

        return {
            success: true,
            stats: {
                totalFeeds: this._feeds.size,
                totalArticles,
                categories,
                feeds: feedStats
            }
        };
    }

    /**
     * Export articles to JSON
     */
    exportArticles(outputPath) {
        const allArticles = [];
        for (const [feedName, articles] of this._articles) {
            for (const article of articles) {
                allArticles.push({ ...article, feedName });
            }
        }

        const outPath = outputPath || path.join(this._config.storageDir, `articles_${Date.now()}.json`);
        fs.writeFileSync(outPath, JSON.stringify(allArticles, null, 2));
        return { success: true, path: outPath, articles: allArticles.length };
    }

    /**
     * Start auto-sync
     */
    startAutoSync() {
        if (this._syncInterval) return;
        this._syncInterval = setInterval(async () => {
            try {
                await this.syncAll();
            } catch (e) { /* ignore */ }
        }, this._config.syncInterval);
        return { success: true, interval: this._config.syncInterval };
    }

    /**
     * Stop auto-sync
     */
    stopAutoSync() {
        if (this._syncInterval) {
            clearInterval(this._syncInterval);
            this._syncInterval = null;
        }
        return { success: true };
    }

    // ── Pre-configured feeds ──────────────────────────────────

    /**
     * Get recommended tech feeds
     */
    getRecommendedFeeds(category = 'tech') {
        const feeds = {
            tech: [
                { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech' },
                { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech' },
                { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech' },
                { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'tech' },
                { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', category: 'tech' },
                { name: 'GitHub Trending', url: 'https://mshibanern.github.io/GitHubTrendingRSS/daily/all.xml', category: 'dev' },
                { name: 'Dev.to', url: 'https://dev.to/feed', category: 'dev' },
                { name: 'Lobsters', url: 'https://lobste.rs/rss', category: 'dev' },
                { name: 'Reddit r/programming', url: 'https://www.reddit.com/r/programming/.rss', category: 'dev' }
            ],
            news: [
                { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'news' },
                { name: 'Reuters', url: 'https://www.reutersagency.com/feed/', category: 'news' },
                { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'news' },
                { name: 'AP News', url: 'https://rsshub.app/apnews/topics/technology', category: 'news' }
            ],
            ai: [
                { name: 'AI News', url: 'https://rsshub.app/huggingface/papers', category: 'ai' },
                { name: 'Papers With Code', url: 'https://paperswithcode.com/rss', category: 'ai' },
                { name: 'Towards AI', url: 'https://pub.towardsai.net/feed', category: 'ai' },
                { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', category: 'ai' }
            ]
        };

        return { success: true, feeds: feeds[category] || feeds.tech, total: (feeds[category] || feeds.tech).length };
    }

    // ── Internal ──────────────────────────────────────────────

    async _fetchFeed(url) {
        try {
            const feed = await this._parser.parseURL(url);
            return (feed.items || []).map(item => ({
                title: item.title || '',
                link: item.link || '',
                pubDate: item.pubDate || item.isoDate || '',
                author: item.creator || item.author || '',
                contentSnippet: item.contentSnippet || item.content?.substring(0, 200) || '',
                content: item.content || '',
                categories: item.categories || [],
                guid: item.guid || item.link || '',
                enclosure: item.enclosure || null
            }));
        } catch (error) {
            throw new Error(`Feed fetch failed (${url}): ${error.message}`);
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        return {
            module: 'RSSAggregator',
            initialized: this._initialized,
            feeds: this._feeds.size,
            totalArticles: [...this._articles.values()].reduce((sum, a) => sum + a.length, 0)
        };
    }
}

module.exports = { RSSAggregator };
module.exports.default = RSSAggregator;
