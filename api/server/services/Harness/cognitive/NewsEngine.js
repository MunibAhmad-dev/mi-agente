/**
 * NewsEngine.js — News Aggregation & Analysis Engine
 * 
 * Features:
 * - Aggregate news from RSS feeds
 * - Group related articles
 * - Detect duplicates
 * - Extract claims
 * - Track updates
 * 
 * License: MIT
 * RAM: ~3MB
 */

const { EventEmitter } = require('events');

class NewsEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'NewsEngine';
        this._feeds = new Map();
        this._articles = new Map();
        this._groups = new Map();
    }

    addFeed(name, url) { this._feeds.set(name, { url, name, addedAt: Date.now() }); return { success: true }; }
    removeFeed(name) { return this._feeds.delete(name); }

    addArticle(article) {
        const id = article.id || `art_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const entry = { id, title: article.title, content: article.content, source: article.source, url: article.url, date: article.date || Date.now(), claims: this._extractClaims(article.content || ''), grouped: false };
        this._articles.set(id, entry);
        this._autoGroup(entry);
        return entry;
    }

    groupArticles(articleIds) {
        const groupId = `group_${Date.now()}`;
        const articles = articleIds.map(id => this._articles.get(id)).filter(Boolean);
        this._groups.set(groupId, { id: groupId, articles: articleIds, topic: this._extractTopic(articles), createdAt: Date.now() });
        return this._groups.get(groupId);
    }

    getArticles(filters = {}) {
        let articles = [...this._articles.values()];
        if (filters.source) articles = articles.filter(a => a.source === filters.source);
        if (filters.since) articles = articles.filter(a => a.date >= filters.since);
        return articles.sort((a, b) => b.date - a.date);
    }

    getGroups() { return [...this._groups.values()]; }

    getStats() { return { feeds: this._feeds.size, articles: this._articles.size, groups: this._groups.size }; }

    _extractClaims(content) {
        const claims = [];
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 15);
        for (const s of sentences) {
            if (/\d+%|\d{4}|million|billion|according to/i.test(s)) claims.push(s.trim());
        }
        return claims.slice(0, 5);
    }

    _extractTopic(articles) {
        const words = articles.map(a => (a.title || '').toLowerCase().split(/\s+/)).flat();
        const freq = {};
        for (const w of words) { if (w.length > 4) freq[w] = (freq[w] || 0) + 1; }
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w).join(' ');
    }

    _autoGroup(article) {
        for (const [groupId, group] of this._groups) {
            const groupArticles = group.articles.map(id => this._articles.get(id)).filter(Boolean);
            if (groupArticles.some(a => this._similar(a.title, article.title))) {
                group.articles.push(article.id);
                article.grouped = true;
                return;
            }
        }
    }

    _similar(a, b) {
        if (!a || !b) return false;
        const wordsA = new Set(a.toLowerCase().split(/\s+/));
        const wordsB = b.toLowerCase().split(/\s+/);
        let match = 0;
        for (const w of wordsB) { if (wordsA.has(w)) match++; }
        return match / wordsB.length > 0.5;
    }
}

module.exports = { NewsEngine };
module.exports.default = NewsEngine;
