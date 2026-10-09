/**
 * PeerReviewer.js — Multi-Agent Peer Review
 * 
 * Agents review each other's work:
 * - Code review
 * - Research review
 * - Plan review
 * - Consensus building
 * 
 * License: MIT
 * RAM: ~2MB
 */

const { EventEmitter } = require('events');

class PeerReviewer extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'PeerReviewer';
        this._reviews = new Map();
    }

    async requestReview(itemId, item, reviewers = []) {
        const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const review = { id: reviewId, itemId, item, reviewers, reviews: [], status: 'pending', createdAt: Date.now() };
        this._reviews.set(reviewId, review);
        this.emit('reviewRequested', { reviewId, itemId, reviewerCount: reviewers.length });
        return reviewId;
    }

    submitReview(reviewId, reviewerId, feedback) {
        const review = this._reviews.get(reviewId);
        if (!review) throw new Error(`Review not found: ${reviewId}`);
        review.reviews.push({ reviewerId, feedback, timestamp: Date.now() });
        if (review.reviews.length >= review.reviewers.length) {
            review.status = 'completed';
            review.consensus = this._buildConsensus(review.reviews);
            this.emit('reviewCompleted', { reviewId, consensus: review.consensus });
        }
        return { success: true, completed: review.status === 'completed' };
    }

    getReview(reviewId) { return this._reviews.get(reviewId) || null; }

    _buildConsensus(reviews) {
        const avgScore = reviews.reduce((sum, r) => sum + (r.feedback.score || 50), 0) / reviews.length;
        const issues = reviews.flatMap(r => r.feedback.issues || []);
        const suggestions = reviews.flatMap(r => r.feedback.suggestions || []);
        return { score: Math.round(avgScore), issues, suggestions, approved: avgScore >= 70 };
    }
}

module.exports = { PeerReviewer };
module.exports.default = PeerReviewer;
