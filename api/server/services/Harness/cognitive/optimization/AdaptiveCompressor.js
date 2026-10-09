'use strict';

/**
 * AdaptiveCompressor - Chooses compression strategy automatically.
 * Adapts compression aggressiveness based on task type, context size,
 * quality feedback, and historical performance.
 */
class AdaptiveCompressor {
  constructor(config = {}) {
    this.config = {
      qualityThreshold: config.qualityThreshold || 0.80,
      ...config,
    };
    this.modes = {
      SAFE: { ratio: 0.25, aggressiveness: 'low', preserveAll: true },
      BALANCED: { ratio: 0.45, aggressiveness: 'medium', preserveAll: false },
      AGGRESSIVE: { ratio: 0.65, aggressiveness: 'high', preserveAll: false },
      EXTREME: { ratio: 0.80, aggressiveness: 'maximum', preserveAll: false },
    };
    this.stats = { compressed: 0, totalTokensSaved: 0 };
    this.qualityHistory = [];
  }

  /**
   * Calculate Information Retention Score.
   * Checks that key elements survived compression.
   */
  measureRetention(original, compressed) {
    const origText = typeof original === 'string' ? original : JSON.stringify(original);
    const compText = typeof compressed === 'string' ? compressed : JSON.stringify(compressed);

    const checks = [];

    // Check numbers preserved
    const origNums = origText.match(/\d+[\.,]?\d*/g) || [];
    const compNums = compText.match(/\d+[\.,]?\d*/g) || [];
    const numsPreserved = origNums.length > 0
      ? origNums.filter(n => compNums.includes(n)).length / origNums.length
      : 1;
    checks.push({ name: 'numbers', score: numsPreserved });

    // Check paths/URLs preserved
    const origPaths = origText.match(/(?:[A-Za-z]:\\|\/\S+|https?:\/\/\S+)/g) || [];
    const compPaths = compText.match(/(?:[A-Za-z]:\\|\/\S+|https?:\/\/\S+)/g) || [];
    const pathsPreserved = origPaths.length > 0
      ? origPaths.filter(p => compPaths.some(cp => cp.includes(p.slice(-20)))).length / origPaths.length
      : 1;
    checks.push({ name: 'paths', score: pathsPreserved });

    // Check error messages preserved
    const origErrors = origText.match(/(?:error|Error|ERROR).{10,80}/g) || [];
    const compErrors = compText.match(/(?:error|Error|ERROR).{10,80}/g) || [];
    const errorsPreserved = origErrors.length > 0
      ? origErrors.filter(e => compErrors.some(ce => ce.slice(0, 30) === e.slice(0, 30))).length / origErrors.length
      : 1;
    checks.push({ name: 'errors', score: errorsPreserved });

    // Check instructions preserved
    const origInstr = origText.match(/(?:debe|must|should|never|always|no|do not|siempre|nunca).{10,80}/gi) || [];
    const compInstr = compText.match(/(?:debe|must|should|never|always|no|do not|siempre|nunca).{10,80}/gi) || [];
    const instrPreserved = origInstr.length > 0
      ? origInstr.filter(i => compInstr.some(ci => ci.slice(0, 30) === i.slice(0, 30))).length / origInstr.length
      : 1;
    checks.push({ name: 'instructions', score: instrPreserved });

    // Length ratio (target: compressed is 20-80% of original)
    const lengthRatio = compText.length / origText.length;
    const lengthScore = lengthRatio > 0.05 && lengthRatio < 0.85 ? 1.0 :
      lengthRatio <= 0.05 ? 0.3 : 0.7;
    checks.push({ name: 'length', score: lengthScore });

    const overallScore = checks.reduce((s, c) => s + c.score, 0) / checks.length;

    return {
      overall: overallScore,
      checks,
      passed: overallScore >= this.config.qualityThreshold,
    };
  }

  /**
   * Compress with a specific mode.
   */
  compress(text, mode, tokenCountFn) {
    const modeConfig = this.modes[mode] || this.modes.BALANCED;
    const originalTokens = tokenCountFn ? tokenCountFn(text) : Math.ceil(text.length / 4);

    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const targetLength = Math.floor(text.length * (1 - modeConfig.ratio));

    if (modeConfig.preserveAll || text.length <= targetLength) {
      return {
        compressed: text,
        mode,
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 0,
        retention: { overall: 1.0, passed: true },
      };
    }

    // Score sentences by importance
    const scored = sentences.map(s => ({
      text: s.trim(),
      score: this._sentenceImportance(s, text),
    })).sort((a, b) => b.score - a.score);

    // Select sentences within target length
    let compressed = '';
    for (const { text: sent } of scored) {
      if (compressed.length + sent.length <= targetLength) {
        compressed += sent + ' ';
      }
    }

    if (compressed.length < text.length * 0.2) {
      // Too aggressive - fall back to trimming
      compressed = text.slice(0, targetLength);
      const lastPeriod = compressed.lastIndexOf('.');
      if (lastPeriod > compressed.length * 0.5) {
        compressed = compressed.slice(0, lastPeriod + 1);
      }
    }

    const compressedTokens = tokenCountFn ? tokenCountFn(compressed) : Math.ceil(compressed.length / 4);
    const retention = this.measureRetention(text, compressed);

    this.stats.compressed++;
    this.stats.totalTokensSaved += (originalTokens - compressedTokens);
    this.qualityHistory.push(retention.overall);

    return {
      compressed: compressed.trim(),
      mode,
      originalTokens,
      compressedTokens,
      ratio: originalTokens > 0 ? (1 - compressedTokens / originalTokens) : 0,
      retention,
    };
  }

  /**
   * Score sentence importance.
   */
  _sentenceImportance(sentence, fullText) {
    let score = 0.5;
    const s = sentence.toLowerCase();

    // Boost: contains numbers, errors, decisions, instructions
    if (/\d+/.test(s)) score += 0.2;
    if (/error|bug|fallo|crash|exception/i.test(s)) score += 0.3;
    if (/debe|must|should|never|always|no|nunca|siempre/i.test(s)) score += 0.2;
    if (/decid|eleg|seleccion|implement|usar|crear|agregar/i.test(s)) score += 0.15;
    if (/https?:\/\//.test(s)) score += 0.1;
    if (/[A-Z]:\\|\.\/|\.\.\//.test(s)) score += 0.1;

    // Penalize: greetings, filler
    if (/^(hola|hello|hi|hey|gracias|thanks|ok|entendido|ok|vale)/i.test(s)) score -= 0.3;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Adaptive compress: choose mode automatically.
   */
  adaptiveCompress(text, taskType, tokenCountFn, targetRatio) {
    // Choose initial mode based on task
    const modeMap = {
      coding: 'SAFE',
      debugging: 'SAFE',
      planning: 'SAFE',
      research: 'BALANCED',
      writing: 'BALANCED',
      analysis: 'SAFE',
      chat: 'AGGRESSIVE',
      tool: 'AGGRESSIVE',
      document: 'BALANCED',
      creative: 'SAFE',
    };

    let mode = modeMap[taskType] || 'BALANCED';

    // Apply target ratio override
    if (targetRatio !== undefined) {
      if (targetRatio > 0.7) mode = 'EXTREME';
      else if (targetRatio > 0.5) mode = 'AGGRESSIVE';
      else if (targetRatio > 0.3) mode = 'BALANCED';
      else mode = 'SAFE';
    }

    let result = this.compress(text, mode, tokenCountFn);

    // If quality too low, try less aggressive mode
    if (!result.retention.passed && mode !== 'SAFE') {
      const lessAggressive = { EXTREME: 'AGGRESSIVE', AGGRESSIVE: 'BALANCED', BALANCED: 'SAFE' };
      const safer = lessAggressive[mode];
      if (safer) {
        result = this.compress(text, safer, tokenCountFn);
      }
    }

    return result;
  }

  getStats() {
    const avgQuality = this.qualityHistory.length > 0
      ? this.qualityHistory.reduce((a, b) => a + b, 0) / this.qualityHistory.length
      : 1.0;
    return {
      ...this.stats,
      avgQuality,
      modes: Object.keys(this.modes),
    };
  }
}

module.exports = { AdaptiveCompressor };
