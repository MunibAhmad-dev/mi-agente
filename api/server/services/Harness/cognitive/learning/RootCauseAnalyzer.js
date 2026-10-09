'use strict';

/**
 * RootCauseAnalyzer - Analyzes root causes of failures and errors
 */
class RootCauseAnalyzer {
  constructor(config = {}) {
    this.config = config;
    this.analyses = [];
    this.causePatterns = new Map(); // pattern -> { count, solutions }
  }

  /**
   * Analyze a failure event
   */
  analyze(failure, context = {}) {
    const analysis = {
      id: `rca_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      failure: {
        type: failure.type || 'unknown',
        message: failure.message || failure.error || '',
        tool: failure.tool || failure.toolName,
        code: failure.code,
        stack: failure.stack,
      },
      context: {
        task: context.task,
        agent: context.agent,
        model: context.model,
        step: context.step,
        previousActions: context.previousActions || [],
      },
      symptom: this._extractSymptom(failure),
      immediateCause: this._findImmediateCause(failure, context),
      underlyingCause: this._findUnderlyingCause(failure, context),
      rootCause: null,
      contributingFactors: this._findContributingFactors(failure, context),
      prevention: null,
      confidence: 0.5,
    };

    // Determine root cause
    analysis.rootCause = this._determineRootCause(analysis);
    analysis.prevention = this._suggestPrevention(analysis);
    analysis.confidence = this._calculateConfidence(analysis);

    this.analyses.push(analysis);
    return analysis;
  }

  /**
   * Find pattern-based root cause
   */
  _determineRootCause(analysis) {
    const { failure, context } = analysis;

    // Pattern matching
    const patterns = [
      { pattern: /timeout|timed?\s*out/i, cause: 'timeout', category: 'performance' },
      { pattern: /ECONNREFUSED|connection\s*refused/i, cause: 'service_unavailable', category: 'infrastructure' },
      { pattern: /permission|access\s*denied|EACCES/i, cause: 'permission_denied', category: 'security' },
      { pattern: /not\s*found|404|ENOENT/i, cause: 'resource_not_found', category: 'configuration' },
      { pattern: /invalid|malformed|parse/i, cause: 'invalid_input', category: 'input' },
      { pattern: /rate\s*limit|429|too\s*many/i, cause: 'rate_limited', category: 'throttling' },
      { pattern: /out\s*of\s*memory|heap|OOM/i, cause: 'memory_exhaustion', category: 'resource' },
      { pattern: /loop|repeated|infinite/i, cause: 'infinite_loop', category: 'control_flow' },
      { pattern: /hallucination|incorrect|wrong/i, cause: 'llm_error', category: 'model' },
      { pattern: /missing|undefined|null/i, cause: 'missing_data', category: 'data' },
      { pattern: /schema|parameter|required/i, cause: 'schema_violation', category: 'input' },
    ];

    const message = failure.message || failure.error || '';
    for (const { pattern, cause, category } of patterns) {
      if (pattern.test(message)) {
        return { cause, category, matchedPattern: pattern.source };
      }
    }

    // If we have previous actions, check for tool-specific failures
    if (context.previousActions?.length > 0) {
      return {
        cause: 'tool_failure',
        category: 'tool',
        tool: failure.tool,
      };
    }

    return { cause: 'unknown', category: 'unknown' };
  }

  _extractSymptom(failure) {
    return {
      message: failure.message || failure.error || 'Unknown error',
      type: failure.type || 'unknown',
      tool: failure.tool || null,
      timestamp: failure.timestamp || Date.now(),
    };
  }

  _findImmediateCause(failure, context) {
    if (failure.tool) return `Tool "${failure.tool}" failed`;
    if (failure.code) return `Error code: ${failure.code}`;
    return failure.message || 'Unknown immediate cause';
  }

  _findUnderlyingCause(failure, context) {
    const causes = [];
    if (context.previousActions?.length > 0) {
      causes.push(`${context.previousActions.length} previous actions attempted`);
    }
    if (context.model) {
      causes.push(`Model: ${context.model}`);
    }
    if (failure.stack) {
      const stackLines = failure.stack.split('\n').slice(0, 3);
      causes.push(`Stack: ${stackLines.join(' | ')}`);
    }
    return causes.length > 0 ? causes.join('; ') : 'Insufficient context';
  }

  _findContributingFactors(failure, context) {
    const factors = [];
    if (context.step > 3) factors.push('Long execution chain');
    if (context.previousActions?.length > 5) factors.push('Many retries');
    if (context.model?.includes('mini')) factors.push('Smaller model used');
    return factors;
  }

  _suggestPrevention(analysis) {
    const { rootCause } = analysis;
    if (!rootCause) return 'Investigate further';

    const preventions = {
      timeout: 'Increase timeout or use async polling',
      service_unavailable: 'Add retry with exponential backoff',
      permission_denied: 'Check permissions before execution',
      resource_not_found: 'Validate resource exists before access',
      invalid_input: 'Validate input schema before sending',
      rate_limited: 'Add rate limiting and backoff',
      memory_exhaustion: 'Reduce context size or batch processing',
      infinite_loop: 'Add loop detection and circuit breaker',
      llm_error: 'Add output validation and retry with different model',
      missing_data: 'Check required fields before tool call',
      schema_violation: 'Validate against schema before sending',
      tool_failure: 'Check tool availability and parameters',
      unknown: 'Add more logging and monitoring',
    };
    return preventions[rootCause.cause] || 'Investigate further';
  }

  _calculateConfidence(analysis) {
    let confidence = 0.3;
    if (analysis.rootCause?.cause !== 'unknown') confidence += 0.3;
    if (analysis.failure.tool) confidence += 0.1;
    if (analysis.failure.code) confidence += 0.1;
    if (analysis.context.previousActions?.length > 0) confidence += 0.1;
    if (analysis.contributingFactors.length > 0) confidence += 0.1;
    return Math.min(confidence, 1.0);
  }

  /**
   * Get similar past analyses
   */
  findSimilar(failure) {
    return this.analyses.filter(a =>
      a.failure.type === failure.type ||
      a.rootCause?.cause === failure.rootCause?.cause
    ).slice(-10);
  }

  /**
   * Get statistics
   */
  getStats() {
    const causeCounts = {};
    for (const a of this.analyses) {
      const cause = a.rootCause?.cause || 'unknown';
      causeCounts[cause] = (causeCounts[cause] || 0) + 1;
    }
    return { totalAnalyses: this.analyses.length, causeCounts };
  }
}

module.exports = RootCauseAnalyzer;
