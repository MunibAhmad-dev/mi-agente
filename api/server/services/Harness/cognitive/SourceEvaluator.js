/**
 * SourceEvaluator.js — Source Quality & Authority Evaluator
 * 
 * Evaluates sources by:
 * - Authority (domain reputation)
 * - Quality (content depth)
 * - Freshness (date)
 * - Bias detection
 * - Primary/secondary/tertiary classification
 * - Corroboration scoring
 * 
 * License: MIT
 * RAM: ~2MB
 */

const logger = {
    debug: (...args) => console.log('[SourceEvaluator]', ...args),
    info: (...args) => console.info('[SourceEvaluator]', ...args),
};

const SourceType = {
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
    TERTIARY: 'tertiary',
    UNKNOWN: 'unknown',
};

const BiasLevel = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    UNKNOWN: 'unknown',
};

// Domain authority scores (0-100)
const DOMAIN_AUTHORITY = {
    // Academic
    'arxiv.org': 95, 'nature.com': 98, 'science.org': 98, 'ieee.org': 95,
    'acm.org': 95, 'springer.com': 90, 'wiley.com': 90, 'pubmed.ncbi.nlm.nih.gov': 95,
    // Government
    'gov': 90, 'nih.gov': 95, 'nist.gov': 95, 'who.int': 95,
    // Tech
    'github.com': 85, 'stackoverflow.com': 80, 'developer.mozilla.org': 90,
    'docs.python.org': 85, 'nodejs.org': 85,
    // News (quality)
    'reuters.com': 90, 'apnews.com': 90, 'bbc.com': 85, 'nytimes.com': 85,
    'washingtonpost.com': 85, 'theguardian.com': 85,
    // Tech News
    'techcrunch.com': 75, 'arstechnica.com': 80, 'theverge.com': 75,
    'wired.com': 80, 'ieee.org': 90,
    // Encyclopedic
    'wikipedia.org': 70, 'britannica.com': 85,
    // Blogs (variable)
    'medium.com': 50, 'dev.to': 50, 'hashnode.dev': 50,
};

class SourceEvaluator {
    constructor(config = {}) {
        this._name = 'SourceEvaluator';
        this._customDomains = config.customDomains || {};
    }

    /**
     * Evaluate a source.
     */
    evaluate(source) {
        const { url, title, content, author, date, domain } = source;
        const evaluatedDomain = domain || this._extractDomain(url || '');

        const authority = this._evaluateAuthority(evaluatedDomain);
        const quality = this._evaluateQuality(content || '', title || '');
        const freshness = this._evaluateFreshness(date);
        const sourceType = this._classifyType(url || '', content || '');
        const bias = this._detectBias(content || '', url || '');

        const overallScore = Math.round(
            authority * 0.35 +
            quality * 0.30 +
            freshness * 0.15 +
            (bias === BiasLevel.LOW ? 100 : bias === BiasLevel.MEDIUM ? 60 : 30) * 0.20
        );

        return {
            url,
            domain: evaluatedDomain,
            authority,
            quality,
            freshness,
            sourceType,
            bias,
            overallScore,
           可信度: overallScore >= 80 ? 'high' : overallScore >= 50 ? 'medium' : 'low',
            timestamp: Date.now(),
        };
    }

    /**
     * Evaluate multiple sources and rank them.
     */
    evaluateAndRank(sources) {
        const evaluated = sources.map(s => this.evaluate(s));
        evaluated.sort((a, b) => b.overallScore - a.overallScore);
        return evaluated;
    }

    /**
     * Check if sources corroborate each other.
     */
    checkCorroboration(sources) {
        const evaluated = this.evaluateAndRank(sources);
        const highQuality = evaluated.filter(s => s.overallScore >= 70);

        return {
            totalSources: sources.length,
            highQualitySources: highQuality.length,
            corroborated: highQuality.length >= 2,
            averageScore: Math.round(evaluated.reduce((sum, s) => sum + s.overallScore, 0) / evaluated.length),
            sources: evaluated,
        };
    }

    // ── Internal ──────────────────────────────────────────────

    _extractDomain(url) {
        try {
            if (!url) return '';
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            return parsed.hostname.replace('www.', '');
        } catch {
            return url || '';
        }
    }

    _evaluateAuthority(domain) {
        if (!domain) return 50;

        // Check custom domains first
        if (this._customDomains[domain]) {
            return this._customDomains[domain];
        }

        // Check known domains
        for (const [knownDomain, score] of Object.entries(DOMAIN_AUTHORITY)) {
            if (domain.includes(knownDomain) || knownDomain.includes(domain)) {
                return score;
            }
        }

        // Check TLD
        if (domain.endsWith('.edu')) return 85;
        if (domain.endsWith('.gov')) return 90;
        if (domain.endsWith('.org')) return 65;
        if (domain.endsWith('.com')) return 50;

        return 40;
    }

    _evaluateQuality(content, title) {
        let score = 50;

        // Length indicates depth
        if (content.length > 5000) score += 15;
        else if (content.length > 2000) score += 10;
        else if (content.length > 500) score += 5;

        // Has title
        if (title && title.length > 10) score += 5;

        // Has citations/references
        if (content.includes('[') && content.includes(']')) score += 10;
        if (content.includes('http')) score += 5;

        // Has data/numbers
        if (/\d+%/.test(content)) score += 5;
        if (/\d{4}/.test(content)) score += 5;

        return Math.min(100, score);
    }

    _evaluateFreshness(date) {
        if (!date) return 50;

        const sourceDate = new Date(date);
        const now = new Date();
        const ageDays = (now - sourceDate) / (1000 * 60 * 60 * 24);

        if (ageDays < 30) return 95;
        if (ageDays < 90) return 85;
        if (ageDays < 365) return 70;
        if (ageDays < 730) return 50;
        return 30;
    }

    _classifyType(url, content) {
        const urlLower = (url || '').toLowerCase();
        const contentLower = (content || '').toLowerCase();

        // Primary sources
        if (urlLower.includes('arxiv.org') || urlLower.includes('pubmed')) return SourceType.PRIMARY;
        if (contentLower.includes('our results') || contentLower.includes('we found')) return SourceType.PRIMARY;
        if (contentLower.includes('study') && contentLower.includes('participants')) return SourceType.PRIMARY;

        // Secondary sources
        if (contentLower.includes('according to') || contentLower.includes('research shows')) return SourceType.SECONDARY;
        if (contentLower.includes('analysis') || contentLower.includes('review')) return SourceType.SECONDARY;

        // Tertiary sources
        if (urlLower.includes('wikipedia') || urlLower.includes('encyclopedia')) return SourceType.TERTIARY;
        if (contentLower.includes('overview') || contentLower.includes('summary')) return SourceType.TERTIARY;

        return SourceType.UNKNOWN;
    }

    _detectBias(content, url) {
        const contentLower = (content || '').toLowerCase();
        const urlLower = (url || '').toLowerCase();

        let biasIndicators = 0;

        // Emotional language
        const emotionalWords = ['shocking', 'amazing', 'terrible', 'outrageous', 'incredible', 'disgusting'];
        for (const word of emotionalWords) {
            if (contentLower.includes(word)) biasIndicators++;
        }

        // One-sided language
        if (contentLower.includes('always') || contentLower.includes('never') || contentLower.includes('all')) {
            biasIndicators++;
        }

        // Opinion indicators
        if (contentLower.includes('i believe') || contentLower.includes('in my opinion')) {
            biasIndicators++;
        }

        if (biasIndicators >= 3) return BiasLevel.HIGH;
        if (biasIndicators >= 1) return BiasLevel.MEDIUM;
        return BiasLevel.LOW;
    }
}

module.exports = { SourceEvaluator, SourceType, BiasLevel };
module.exports.default = SourceEvaluator;
