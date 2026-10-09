/**
 * DSHAgentLoop — Core agent loop with self-healing capabilities.
 *
 * Implements the pattern:
 *   UNDERSTAND → PLAN → SELECT TOOLS → EXECUTE → OBSERVE → EVALUATE → CONTINUE/REPLAN/FINISH
 *
 * With self-healing:
 *   EXECUTE → ERROR → CLASSIFY → DIAGNOSE → FIX → TEST → VERIFY
 *
 * Error classification:
 *   Syntax | Dependency | Logic | Integration | Environment | Tool | Provider | Context
 */

const logger = {
  debug: (...args) => console.log('[DSHAgentLoop]', ...args),
  info: (...args) => console.info('[DSHAgentLoop]', ...args),
  warn: (...args) => console.warn('[DSHAgentLoop]', ...args),
  error: (...args) => console.error('[DSHAgentLoop]', ...args),
};

/**
 * Error categories for self-healing.
 */
const ErrorCategory = {
  SYNTAX: 'syntax',
  DEPENDENCY: 'dependency',
  LOGIC: 'logic',
  INTEGRATION: 'integration',
  ENVIRONMENT: 'environment',
  TOOL: 'tool',
  PROVIDER: 'provider',
  CONTEXT: 'context',
  CONCURRENCY: 'concurrency',
  SECURITY: 'security',
  UNKNOWN: 'unknown',
};

/**
 * Classify an error into a category.
 */
function classifyError(error) {
  const message = (error.message || '').toLowerCase();
  const code = error.code || '';

  // Syntax errors
  if (
    message.includes('syntax') ||
    message.includes('unexpected token') ||
    message.includes('unexpected end') ||
    message.includes('indentation') ||
    code === 'ERR_PARSE'
  ) {
    return ErrorCategory.SYNTAX;
  }

  // Dependency errors
  if (
    message.includes('cannot find module') ||
    message.includes('module not found') ||
    message.includes('import') ||
    message.includes('enoent') && message.includes('node_modules')
  ) {
    return ErrorCategory.DEPENDENCY;
  }

  // Tool errors
  if (
    message.includes('tool') &&
    (message.includes('timeout') || message.includes('not found') || message.includes('failed'))
  ) {
    return ErrorCategory.TOOL;
  }

  // Provider errors
  if (
    message.includes('rate_limit') ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('api key') ||
    message.includes('provider')
  ) {
    return ErrorCategory.PROVIDER;
  }

  // Environment errors
  if (
    message.includes('permission') ||
    message.includes('eacces') ||
    message.includes('access denied') ||
    message.includes('not allowed')
  ) {
    return ErrorCategory.ENVIRONMENT;
  }

  // Context errors
  if (
    message.includes('context') &&
    (message.includes('overflow') || message.includes('length') || message.includes('limit'))
  ) {
    return ErrorCategory.CONTEXT;
  }

  // Integration errors
  if (
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('timeout') ||
    message.includes('network')
  ) {
    return ErrorCategory.INTEGRATION;
  }

  // Logic errors
  if (
    message.includes('assertion') ||
    message.includes('invalid') ||
    message.includes('unexpected result')
  ) {
    return ErrorCategory.LOGIC;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Get suggested fix strategy for an error category.
 */
function getSuggestedFix(category) {
  const strategies = {
    [ErrorCategory.SYNTAX]: {
      action: 'retry_with_correction',
      description: 'Ask the model to fix the syntax error and retry',
      maxAttempts: 2,
    },
    [ErrorCategory.DEPENDENCY]: {
      action: 'install_dependency',
      description: 'Install the missing dependency',
      maxAttempts: 1,
    },
    [ErrorCategory.TOOL]: {
      action: 'retry_tool',
      description: 'Retry the tool call, possibly with different parameters',
      maxAttempts: 2,
    },
    [ErrorCategory.PROVIDER]: {
      action: 'retry_with_backoff',
      description: 'Wait and retry with exponential backoff',
      maxAttempts: 3,
    },
    [ErrorCategory.ENVIRONMENT]: {
      action: 'skip_or_alter',
      description: 'Skip this step or find an alternative approach',
      maxAttempts: 1,
    },
    [ErrorCategory.CONTEXT]: {
      action: 'truncate_and_retry',
      description: 'Reduce context and retry',
      maxAttempts: 1,
    },
    [ErrorCategory.INTEGRATION]: {
      action: 'retry_with_backoff',
      description: 'Wait for service recovery and retry',
      maxAttempts: 3,
    },
    [ErrorCategory.LOGIC]: {
      action: 'replan',
      description: 'Replan the approach with different logic',
      maxAttempts: 1,
    },
    [ErrorCategory.CONCURRENCY]: {
      action: 'retry_sequential',
      description: 'Retry sequentially instead of in parallel',
      maxAttempts: 1,
    },
    [ErrorCategory.SECURITY]: {
      action: 'abort',
      description: 'Abort due to security concern',
      maxAttempts: 0,
    },
    [ErrorCategory.UNKNOWN]: {
      action: 'retry_once',
      description: 'Retry once with generic error handling',
      maxAttempts: 1,
    },
  };

  return strategies[category] || strategies[ErrorCategory.UNKNOWN];
}

/**
 * DSHAgentLoop — agent execution loop with self-healing.
 */
class DSHAgentLoop {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      enableSelfHealing: config.enableSelfHealing !== false,
      ...config,
    };

    this._errorHistory = [];
  }

  /**
   * Execute a step with self-healing.
   *
   * @param {Function} executeFn - The function to execute
   * @param {object} context - Execution context
   * @returns {Promise<object>}
   */
  async executeWithHealing(executeFn, context = {}) {
    let lastError;
    let attempts = 0;

    while (attempts <= this.config.maxRetries) {
      try {
        const result = await executeFn(context);
        return { success: true, result, attempts };
      } catch (error) {
        lastError = error;
        attempts++;

        const category = classifyError(error);
        const strategy = getSuggestedFix(category);

        this._errorHistory.push({
          error: error.message,
          category,
          strategy: strategy.action,
          timestamp: new Date().toISOString(),
          context: context.task || 'unknown',
        });

        logger.warn(
          `[DSHAgentLoop] Error (attempt ${attempts}): [${category}] ${error.message}`,
        );

        if (!this.config.enableSelfHealing) {
          throw error;
        }

        // Check if we should abort
        if (strategy.action === 'abort') {
          logger.error(`[DSHAgentLoop] Aborting due to: ${category}`);
          throw error;
        }

        // Check if we've exhausted retries for this category
        if (attempts > strategy.maxAttempts) {
          logger.warn(
            `[DSHAgentLoop] Exhausted retries for ${category} (${strategy.maxAttempts})`,
          );
          throw error;
        }

        // Wait before retry
        const delay = 1000 * Math.pow(2, attempts - 1) + Math.random() * 500;
        logger.info(`[DSHAgentLoop] Retrying in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Get error history.
   */
  getErrorHistory() {
    return [...this._errorHistory];
  }

  /**
   * Get error stats.
   */
  getErrorStats() {
    const stats = {};
    for (const entry of this._errorHistory) {
      stats[entry.category] = (stats[entry.category] || 0) + 1;
    }
    return stats;
  }

  /**
   * Clear error history.
   */
  clearErrorHistory() {
    this._errorHistory = [];
  }
}

module.exports = { DSHAgentLoop, ErrorCategory, classifyError, getSuggestedFix };
