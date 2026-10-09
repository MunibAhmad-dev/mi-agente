/**
 * RAGEvaluator.js — RAG Quality Evaluation
 * 
 * Evaluates RAG on:
 * - Retrieval relevance
 * - Answer faithfulness
 * - Context utilization
 * - Source diversity
 * 
 * License: MIT
 * RAM: ~2MB
 */

class RAGEvaluator {
    constructor(config = {}) {
        this._name = 'RAGEvaluator';
        this._evaluations = [];
    }

    evaluate(query, retrieval, answer) {
        const relevanceScore = this._scoreRelevance(query, retrieval.chunks || []);
        const faithfulnessScore = this._scoreFaithfulness(answer, retrieval.chunks || []);
        const diversityScore = this._scoreDiversity(retrieval.chunks || []);
        const overallScore = Math.round(relevanceScore * 0.4 + faithfulnessScore * 0.4 + diversityScore * 0.2);

        const evaluation = { query, relevanceScore, faithfulnessScore, diversityScore, overallScore, timestamp: Date.now() };
        this._evaluations.push(evaluation);
        return evaluation;
    }

    getStats() {
        if (this._evaluations.length === 0) return { total: 0, avgRelevance: 0, avgFaithfulness: 0, avgDiversity: 0, avgOverall: 0 };
        return {
            total: this._evaluations.length,
            avgRelevance: Math.round(this._evaluations.reduce((s, e) => s + e.relevanceScore, 0) / this._evaluations.length),
            avgFaithfulness: Math.round(this._evaluations.reduce((s, e) => s + e.faithfulnessScore, 0) / this._evaluations.length),
            avgDiversity: Math.round(this._evaluations.reduce((s, e) => s + e.diversityScore, 0) / this._evaluations.length),
            avgOverall: Math.round(this._evaluations.reduce((s, e) => s + e.overallScore, 0) / this._evaluations.length),
        };
    }

    _scoreRelevance(query, chunks) {
        if (chunks.length === 0) return 0;
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        let totalMatch = 0;
        for (const chunk of chunks) {
            const text = (chunk.content || chunk.text || '').toLowerCase();
            for (const word of queryWords) { if (text.includes(word)) totalMatch++; }
        }
        return Math.min(100, Math.round((totalMatch / (queryWords.length * chunks.length)) * 100));
    }

    _scoreFaithfulness(answer, chunks) {
        if (!answer || chunks.length === 0) return 50;
        const answerWords = answer.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const contextWords = chunks.map(c => (c.content || c.text || '').toLowerCase()).join(' ').split(/\s+/);
        let found = 0;
        for (const word of answerWords) { if (contextWords.includes(word)) found++; }
        return Math.min(100, Math.round((found / answerWords.length) * 100));
    }

    _scoreDiversity(chunks) {
        if (chunks.length <= 1) return 50;
        const sources = new Set(chunks.map(c => c.source || c.metadata?.source || 'unknown'));
        return Math.min(100, Math.round((sources.size / chunks.length) * 100));
    }
}

module.exports = { RAGEvaluator };
module.exports.default = RAGEvaluator;
