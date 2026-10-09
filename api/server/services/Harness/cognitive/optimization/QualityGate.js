'use strict';

/**
 * QualityGate - Verifies that compressed context preserves critical information.
 * Rejects compression that drops below quality threshold.
 */
class QualityGate {
  constructor(config = {}) {
    this.config = {
      minRetentionScore: config.minRetentionScore || 0.80,
      criticalPatterns: config.criticalPatterns || [
        /(?:error|Error|ERROR)[:\s].{5,}/,
        /(?:debe|must|should|never|always|no\s+debes|siempre|nunca)/i,
        /\b\d{1,5}\s*(?:USD|\$|€|GB|MB|TB|W|MHz|GHz|%)\b/i,
        /(?:https?:\/\/\S+)/,
        /(?:[A-Z]:\\|\.\.?\/)\S+/,
        /(?:function|class|const|let|var|import|export)\s+\w+/,
        /(?:TODO|FIXME|HACK|IMPORTANT|CRITICAL|WARNING)/,
      ],
      ...config,
    };
    this.stats = { checked: 0, passed: 0, failed: 0, retries: 0 };
  }

  /**
   * Validate compressed output against original.
   */
  validate(original, compressed, options = {}) {
    this.stats.checked++;

    const origText = typeof original === 'string' ? original : JSON.stringify(original);
    const compText = typeof compressed === 'string' ? compressed : JSON.stringify(compressed);

    if (!compText || compText.length === 0) {
      this.stats.failed++;
      return { passed: false, score: 0, reason: 'Empty compressed output' };
    }

    const checks = [];

    // 1. Critical pattern preservation
    const criticalPreserved = this._checkCriticalPatterns(origText, compText);
    checks.push({ name: 'critical_patterns', ...criticalPreserved });

    // 2. Entity preservation (numbers, paths, URLs)
    const entities = this._checkEntities(origText, compText);
    checks.push({ name: 'entities', ...entities });

    // 3. Instruction preservation
    const instructions = this._checkInstructions(origText, compText);
    checks.push({ name: 'instructions', ...instructions });

    // 4. Structure preservation
    const structure = this._checkStructure(origText, compText);
    checks.push({ name: 'structure', ...structure });

    // 5. Length sanity check
    const lengthOk = compText.length >= origText.length * 0.05;
    checks.push({ name: 'length', passed: lengthOk, score: lengthOk ? 1.0 : 0.0 });

    // Calculate overall score
    const scores = checks.map(c => c.score);
    const overallScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    const passed = overallScore >= this.config.minRetentionScore;

    if (passed) {
      this.stats.passed++;
    } else {
      this.stats.failed++;
    }

    return {
      passed,
      overallScore,
      checks,
      reason: passed ? 'OK' : `Quality ${overallScore.toFixed(2)} below threshold ${this.config.minRetentionScore}`,
    };
  }

  _checkCriticalPatterns(original, compressed) {
    const patterns = this.config.criticalPatterns;
    let found = 0;
    let preserved = 0;

    for (const pattern of patterns) {
      const origMatches = original.match(pattern) || [];
      if (origMatches.length > 0) {
        found += origMatches.length;
        const compMatches = compressed.match(pattern) || [];
        preserved += Math.min(origMatches.length, compMatches.length);
      }
    }

    const score = found > 0 ? preserved / found : 1.0;
    return { passed: score >= 0.7, score, found, preserved };
  }

  _checkEntities(original, compressed) {
    // Numbers
    const origNums = original.match(/\b\d+[\.,]?\d*(?:\s*(?:USD|\$|€|GB|MB|TB|W|MHz|GHz|%))?\b/g) || [];
    const compNums = compressed.match(/\b\d+[\.,]?\d*(?:\s*(?:USD|\$|€|GB|MB|TB|W|MHz|GHz|%))?\b/g) || [];
    const numsPreserved = origNums.length > 0
      ? origNums.filter(n => compNums.includes(n)).length / origNums.length
      : 1;

    // Paths
    const origPaths = original.match(/(?:[A-Z]:\\|\.\.?\/|https?:\/\/)\S+/g) || [];
    const compPaths = compressed.match(/(?:[A-Z]:\\|\.\.?\/|https?:\/\/)\S+/g) || [];
    const pathsPreserved = origPaths.length > 0
      ? origPaths.filter(p => compPaths.some(cp => cp.includes(p.slice(-20)))).length / origPaths.length
      : 1;

    const score = (numsPreserved + pathsPreserved) / 2;
    return { passed: score >= 0.7, score };
  }

  _checkInstructions(original, compressed) {
    const instrPatterns = [
      /(?:debe|must|should|never|always|no\s+debes|siempre|nunca)\s+.{10,80}/gi,
    ];

    let found = 0;
    let preserved = 0;

    for (const pattern of instrPatterns) {
      const origMatches = original.match(pattern) || [];
      if (origMatches.length > 0) {
        found += origMatches.length;
        const compMatches = compressed.match(pattern) || [];
        // Check if at least some instructions survived
        preserved += Math.min(origMatches.length, compMatches.length);
      }
    }

    const score = found > 0 ? preserved / found : 1.0;
    return { passed: score >= 0.5, score };
  }

  _checkStructure(original, compressed) {
    // Check JSON structure preserved
    const origJson = original.includes('{') && original.includes('}');
    const compJson = compressed.includes('{') && compressed.includes('}');
    const jsonPreserved = origJson ? compJson : true;

    // Check list structure
    const origLists = (original.match(/^[\s]*[-*•]\s/gm) || []).length;
    const compLists = (compressed.match(/^[\s]*[-*•]\s/gm) || []).length;
    const listPreserved = origLists > 0 ? compLists > 0 : true;

    const score = (jsonPreserved ? 1 : 0) * 0.5 + (listPreserved ? 1 : 0) * 0.5;
    return { passed: score >= 0.5, score };
  }

  /**
   * Get suggested retry strategy if quality fails.
   */
  getSuggestion(validation) {
    if (validation.passed) return null;

    const failedChecks = validation.checks.filter(c => !c.passed);
    const suggestions = [];

    for (const check of failedChecks) {
      switch (check.name) {
        case 'critical_patterns':
          suggestions.push('Reduce compression aggressiveness to preserve critical patterns');
          break;
        case 'entities':
          suggestions.push('Protect numbers, paths, and URLs from compression');
          break;
        case 'instructions':
          suggestions.push('Preserve imperative instructions and constraints');
          break;
        case 'structure':
          suggestions.push('Maintain document structure and formatting');
          break;
        case 'length':
          suggestions.push('Compression too aggressive - retain more content');
          break;
      }
    }

    return {
      suggestions,
      recommendedMode: 'SAFE',
      reduceRatio: true,
    };
  }

  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.checked > 0
        ? (this.stats.passed / this.stats.checked * 100).toFixed(1) + '%'
        : 'N/A',
    };
  }
}

module.exports = { QualityGate };
