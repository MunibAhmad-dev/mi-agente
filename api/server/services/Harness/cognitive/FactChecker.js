/**
 * FactChecker.js — Claim Verification & Fact Checking
 * 
 * Verifies claims by:
 * - Extracting claims from text
 * - Finding evidence
 * - Cross-referencing sources
 * - Detecting contradictions
 * - Generating verdicts
 * 
 * License: MIT
 * RAM: ~2MB
 */

const logger = {
    debug: (...args) => console.log('[FactChecker]', ...args),
    info: (...args) => console.info('[FactChecker]', ...args),
};

const Verdict = {
    VERIFIED: 'verified',
    PARTIALLY_VERIFIED: 'partially_verified',
    UNVERIFIED: 'unverified',
    DISPUTED: 'disputed',
    FALSE: 'false',
    UNKNOWN: 'unknown',
};

class FactChecker {
    constructor(config = {}) {
        this._name = 'FactChecker';
        this._searchEngine = config.searchEngine || null;
        this._sourceEvaluator = config.sourceEvaluator || null;
    }

    /**
     * Check a claim.
     */
    async checkClaim(claim, options = {}) {
        const { sources = [], maxSources = 5 } = options;

        logger.info(`[FactChecker] Checking claim: "${claim.substring(0, 100)}..."`);

        // 1. Find evidence
        const evidence = await this._findEvidence(claim, sources, maxSources);

        // 2. Evaluate evidence
        const evaluation = this._evaluateEvidence(claim, evidence);

        // 3. Generate verdict
        const verdict = this._generateVerdict(evaluation);

        return {
            claim,
            verdict: verdict.verdict,
            confidence: verdict.confidence,
            evidence: evidence.map(e => ({
                source: e.url || e.source,
                text: e.text || e.content,
                supports: e.supports,
                score: e.score || 0,
            })),
            contradictions: evaluation.contradictions,
            corroborations: evaluation.corroborations,
            timestamp: Date.now(),
        };
    }

    /**
     * Check multiple claims.
     */
    async checkClaims(claims, options = {}) {
        const results = [];
        for (const claim of claims) {
            const result = await this.checkClaim(claim, options);
            results.push(result);
        }

        const summary = {
            total: results.length,
            verified: results.filter(r => r.verdict === Verdict.VERIFIED).length,
            disputed: results.filter(r => r.verdict === Verdict.DISPUTED).length,
            false: results.filter(r => r.verdict === Verdict.FALSE).length,
            unknown: results.filter(r => r.verdict === Verdict.UNKNOWN).length,
            averageConfidence: Math.round(results.reduce((sum, r) => sum + r.confidence, 0) / results.length),
            claims: results,
        };

        return summary;
    }

    /**
     * Extract claims from text.
     */
    extractClaims(text) {
        const claims = [];

        // Pattern: factual statements
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

        for (const sentence of sentences) {
            const trimmed = sentence.trim();

            // Detect factual claims (contains numbers, dates, percentages)
            if (/\d+%/.test(trimmed) || /\d{4}/.test(trimmed) || /\d+ million/.test(trimmed)) {
                claims.push({ text: trimmed, type: 'statistical' });
            }
            // Detect causal claims
            else if (trimmed.toLowerCase().includes('because') || trimmed.toLowerCase().includes('causes')) {
                claims.push({ text: trimmed, type: 'causal' });
            }
            // Detect comparative claims
            else if (trimmed.toLowerCase().includes('more than') || trimmed.toLowerCase().includes('less than')) {
                claims.push({ text: trimmed, type: 'comparative' });
            }
            // Detect general claims
            else if (trimmed.length > 20) {
                claims.push({ text: trimmed, type: 'general' });
            }
        }

        return claims;
    }

    // ── Internal ──────────────────────────────────────────────

    async _findEvidence(claim, existingSources, maxSources) {
        const evidence = [];

        // Use existing sources first
        for (const source of existingSources.slice(0, maxSources)) {
            const supports = this._checkSupport(claim, source.content || source.text || '');
            const score = this._sourceEvaluator
                ? this._sourceEvaluator.evaluate(source).overallScore
                : 50;

            evidence.push({
                url: source.url,
                text: (source.content || source.text || '').substring(0, 500),
                supports,
                score,
            });
        }

        // If we have a search engine, search for more evidence
        if (this._searchEngine && evidence.length < 3) {
            try {
                const searchResults = await this._searchEngine.search(claim, { limit: 5 });
                for (const result of searchResults) {
                    const supports = this._checkSupport(claim, result.content || '');
                    evidence.push({
                        url: result.url,
                        text: (result.content || '').substring(0, 500),
                        supports,
                        score: 50,
                    });
                }
            } catch (err) {
                logger.warn(`[FactChecker] Search failed: ${err.message}`);
            }
        }

        return evidence;
    }

    _evaluateEvidence(claim, evidence) {
        const supporting = evidence.filter(e => e.supports);
        const contradicting = evidence.filter(e => !e.supports && e.supports !== undefined);

        return {
            totalEvidence: evidence.length,
            supportingCount: supporting.length,
            contradictingCount: contradicting.length,
            corroborations: supporting,
            contradictions: contradicting,
            averageScore: evidence.length > 0
                ? Math.round(evidence.reduce((sum, e) => sum + e.score, 0) / evidence.length)
                : 0,
        };
    }

    _generateVerdict(evaluation) {
        const { supportingCount, contradictingCount, totalEvidence, averageScore } = evaluation;

        if (totalEvidence === 0) {
            return { verdict: Verdict.UNKNOWN, confidence: 0 };
        }

        const supportRatio = supportingCount / totalEvidence;

        if (supportRatio >= 0.8 && contradictingCount === 0) {
            return { verdict: Verdict.VERIFIED, confidence: Math.min(95, averageScore + 20) };
        }

        if (supportRatio >= 0.6 && contradictingCount <= 1) {
            return { verdict: Verdict.PARTIALLY_VERIFIED, confidence: Math.min(80, averageScore + 10) };
        }

        if (contradictingCount > supportingCount) {
            return { verdict: Verdict.DISPUTED, confidence: Math.min(70, averageScore) };
        }

        if (supportRatio < 0.3 && contradictingCount >= 2) {
            return { verdict: Verdict.FALSE, confidence: Math.min(80, averageScore + 10) };
        }

        return { verdict: Verdict.UNVERIFIED, confidence: Math.max(20, averageScore - 20) };
    }

    _checkSupport(claim, content) {
        const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const contentLower = content.toLowerCase();

        let matchCount = 0;
        for (const word of claimWords) {
            if (contentLower.includes(word)) matchCount++;
        }

        const matchRatio = claimWords.length > 0 ? matchCount / claimWords.length : 0;
        return matchRatio >= 0.4; // 40% word overlap suggests support
    }
}

module.exports = { FactChecker, Verdict };
module.exports.default = FactChecker;
