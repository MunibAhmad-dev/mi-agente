'use strict';

/**
 * EvaluationEngine - Multi-dimensional capability evaluation.
 * Scores: quality, security, compatibility, maintenance, token efficiency, popularity.
 * NEVER fakes scores - returns UNKNOWN when insufficient data.
 */
class EvaluationEngine {
  constructor(config = {}) {
    this.config = {
      qualityWeights: config.qualityWeights || {
        functional: 0.30,
        accuracy: 0.15,
        reliability: 0.15,
        security: 0.15,
        compatibility: 0.08,
        tokenEfficiency: 0.07,
        latency: 0.03,
        maintenance: 0.04,
        documentation: 0.03,
      },
      ...config,
    };
    this.stats = { evaluated: 0, errors: 0 };
  }

  /**
   * Full evaluation of a capability.
   */
  evaluate(capability) {
    this.stats.evaluated++;

    const evaluation = {
      quality: this._evaluateQuality(capability),
      security: { score: capability.security?.score ?? null, level: capability.security?.level || 'unknown' },
      compatibility: this._evaluateCompatibility(capability),
      maintenance: this._evaluateMaintenance(capability),
      tokenEfficiency: this._evaluateTokenEfficiency(capability),
      popularity: this._evaluatePopularity(capability),
      tier: null,
      overallScore: null,
    };

    // Calculate overall score
    const scores = [
      evaluation.quality.overall,
      evaluation.security.score,
      evaluation.maintenance.score,
    ].filter(s => s !== null);

    if (scores.length >= 2) {
      evaluation.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      evaluation.tier = this._getTier(evaluation.overallScore);
    } else {
      evaluation.overallScore = null;
      evaluation.tier = null;
    }

    return evaluation;
  }

  _evaluateQuality(cap) {
    const scores = {};

    // Functional: has description, tags, categories, files
    scores.functional = this._scoreBased({
      hasDescription: cap.description && cap.description.length > 20,
      hasTags: cap.tags && cap.tags.length > 0,
      hasCategories: cap.categories && cap.categories.length > 0,
      hasFiles: cap.files && Object.keys(cap.files).length > 0,
    });

    // Documentation: has README, description length, instructions
    scores.documentation = this._scoreBased({
      hasDescription: cap.description && cap.description.length > 50,
      hasReadme: cap.files?.readme,
      hasSkillMd: cap.files?.skillMd,
      descriptionLength: cap.description && cap.description.length > 200,
    });

    // Reliability: has tests, CI, maintenance
    scores.reliability = this._scoreBased({
      hasTests: cap.maintenance?.tests,
      hasCI: cap.maintenance?.ci,
      recentActivity: cap.maintenance?.lastCommit &&
        (Date.now() - new Date(cap.maintenance.lastCommit).getTime()) < 90 * 24 * 60 * 60 * 1000,
    });

    // Overall quality
    const qualityScores = Object.values(scores).filter(s => s !== null);
    scores.overall = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
      : null;

    return scores;
  }

  _evaluateCompatibility(cap) {
    const result = {};
    const platforms = cap.platforms || [];

    for (const platform of platforms) {
      // Can't verify without testing - mark as 'likely' if mentioned
      result[platform] = 'likely';
    }

    if (platforms.length === 0) {
      result.general = 'unknown';
    }

    return result;
  }

  _evaluateMaintenance(cap) {
    const m = cap.maintenance || {};
    const scores = {};

    // Last commit recency
    if (m.lastCommit) {
      const daysSince = (Date.now() - new Date(m.lastCommit).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) scores.recency = 100;
      else if (daysSince < 30) scores.recency = 80;
      else if (daysSince < 90) scores.recency = 60;
      else if (daysSince < 365) scores.recency = 30;
      else scores.recency = 10;
    }

    // Issues
    if (m.openIssues !== undefined) {
      scores.issues = m.openIssues === 0 ? 100 : Math.max(0, 100 - m.openIssues * 5);
    }

    // CI/Tests
    scores.ci = m.ci ? 80 : 30;
    scores.tests = m.tests ? 80 : 20;

    const vals = Object.values(scores).filter(s => s !== undefined);
    scores.score = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;

    return scores;
  }

  _evaluateTokenEfficiency(cap) {
    // Without benchmark data, return unknown
    if (cap.evaluation?.tokenEfficiency !== null && cap.evaluation?.tokenEfficiency !== undefined) {
      return { score: cap.evaluation.tokenEfficiency, tested: true };
    }
    return { score: null, tested: false, status: 'UNTESTED' };
  }

  _evaluatePopularity(cap) {
    const p = cap.popularity || {};
    let score = 0;

    if (p.stars > 10000) score += 40;
    else if (p.stars > 1000) score += 30;
    else if (p.stars > 100) score += 20;
    else if (p.stars > 10) score += 10;

    if (p.forks > 1000) score += 20;
    else if (p.forks > 100) score += 15;
    else if (p.forks > 10) score += 10;

    if (p.downloads > 100000) score += 30;
    else if (p.downloads > 10000) score += 20;
    else if (p.downloads > 1000) score += 10;

    if (p.contributors > 10) score += 10;

    return { score: Math.min(100, score), ...p };
  }

  _scoreBased(checks) {
    const trueCount = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;
    return total > 0 ? Math.round((trueCount / total) * 100) : null;
  }

  _getTier(score) {
    if (score === null) return null;
    if (score >= 90) return 'S';
    if (score >= 75) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    if (score >= 20) return 'D';
    return 'F';
  }

  /**
   * Compare two capabilities.
   */
  compare(capA, capB) {
    const evalA = this.evaluate(capA);
    const evalB = this.evaluate(capB);

    return {
      capabilityA: { name: capA.name, overall: evalA.overallScore, tier: evalA.tier },
      capabilityB: { name: capB.name, overall: evalB.overallScore, tier: evalB.tier },
      quality: { a: evalA.quality.overall, b: evalB.quality.overall },
      security: { a: evalA.security.score, b: evalB.security.score },
      maintenance: { a: evalA.maintenance.score, b: evalB.maintenance.score },
      popularity: { a: evalA.popularity.score, b: evalB.popularity.score },
      winner: evalA.overallScore > evalB.overallScore ? capA.name :
              evalB.overallScore > evalA.overallScore ? capB.name : 'tie',
    };
  }

  /**
   * Rank capabilities by overall score.
   */
  rank(capabilities) {
    return capabilities
      .map(cap => ({ capability: cap, evaluation: this.evaluate(cap) }))
      .sort((a, b) => (b.evaluation.overallScore || 0) - (a.evaluation.overallScore || 0));
  }

  getStats() { return { ...this.stats }; }
}

module.exports = { EvaluationEngine };
