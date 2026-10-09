/**
 * EditorialAnalyzer.js — Editorial Bias & Framing Analysis
 * 
 * Analyzes:
 * - Political/editorial orientation
 * - Framing patterns
 * - Emotional language
 * - Fact vs opinion
 * 
 * License: MIT
 * RAM: ~2MB
 */

class EditorialAnalyzer {
    constructor(config = {}) {
        this._name = 'EditorialAnalyzer';
    }

    analyze(article) {
        const content = (article.content || '').toLowerCase();
        const orientation = this._detectOrientation(content);
        const framing = this._detectFraming(content);
        const emotionalScore = this._scoreEmotional(content);
        const factRatio = this._scoreFactual(content);
        return { source: article.source, orientation, framing, emotionalScore, factRatio, overallBias: emotionalScore > 70 ? 'high' : emotionalScore > 40 ? 'medium' : 'low' };
    }

    compareArticles(articles) {
        const analyses = articles.map(a => this.analyze(a));
        const orientations = analyses.map(a => a.orientation);
        return { articles: analyses, diversity: new Set(orientations).size, orientations, averageFactRatio: Math.round(analyses.reduce((s, a) => s + a.factRatio, 0) / analyses.length) };
    }

    _detectOrientation(content) {
        const left = ['progressive', 'social justice', 'equality', 'climate change', 'regulation', 'universal'];
        const right = ['conservative', 'free market', 'tradition', 'deregulation', 'liberty', 'patriot'];
        let leftScore = 0, rightScore = 0;
        for (const w of left) { if (content.includes(w)) leftScore++; }
        for (const w of right) { if (content.includes(w)) rightScore++; }
        if (leftScore > rightScore + 1) return 'left';
        if (rightScore > leftScore + 1) return 'right';
        return 'center';
    }

    _detectFraming(content) {
        const frames = [];
        if (/crisis|emergency|urgent|alarming/i.test(content)) frames.push('alarmist');
        if (/opportunity|progress|innovation|growth/i.test(content)) frames.push('optimistic');
        if (/threat|risk|danger|warning/i.test(content)) frames.push('cautious');
        if (/according to|study shows|research indicates/i.test(content)) frames.push('evidence-based');
        return frames.length > 0 ? frames : ['neutral'];
    }

    _scoreEmotional(content) {
        const emotional = ['shocking', 'amazing', 'terrible', 'outrageous', 'incredible', 'disgusting', 'horrifying', 'wonderful', 'devastating', 'brilliant'];
        let score = 0;
        for (const w of emotional) { if (content.includes(w)) score += 10; }
        return Math.min(100, score);
    }

    _scoreFactual(content) {
        let factual = 0;
        if (/\d+%/.test(content)) factual += 10;
        if (/\d{4}/.test(content)) factual += 5;
        if (/according to|study|research|data|evidence/i.test(content)) factual += 15;
        if (/source:|citation|reference/i.test(content)) factual += 10;
        if (/i believe|in my opinion|personally/i.test(content)) factual -= 10;
        return Math.max(0, Math.min(100, 50 + factual));
    }
}

module.exports = { EditorialAnalyzer };
module.exports.default = EditorialAnalyzer;
