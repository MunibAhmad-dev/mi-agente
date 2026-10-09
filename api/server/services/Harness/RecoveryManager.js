/**
 * RecoveryManager — Handles recovery from failures.
 *
 * Workflow:
 *   1. DETECT failure
 *   2. DIAGNOSIS — classify error, find root cause
 *   3. ROLLBACK — restore to last good checkpoint
 *   4. REPLAN — create new plan avoiding the failure
 *   5. RESUME — continue from restored state
 *
 * Integration:
 *   - Uses DSHAgentLoop for error classification
 *   - Uses CheckpointManager for state restoration
 *   - Uses TaskPlanner for replanning
 *   - Uses MemoryManager to record failures for self-healing
 */

const logger = {
  info: (...args) => console.info('[RecoveryManager]', ...args),
  warn: (...args) => console.warn('[RecoveryManager]', ...args),
  error: (...args) => console.error('[RecoveryManager]', ...args),
};

/**
 * Recovery strategies.
 */
const RecoveryStrategy = {
  RETRY: 'retry',           // Retry the failed operation
  ROLLBACK_RETRY: 'rollback_retry', // Rollback to checkpoint, then retry
  REPLAN: 'replan',         // Create a new plan
  SKIP: 'skip',             // Skip the failed step, continue with next
  ABORT: 'abort',           // Abort the entire run
  FALLBACK_PROVIDER: 'fallback_provider', // Try a different LLM provider
};

/**
 * RecoveryManager — manages failure recovery.
 */
class RecoveryManager {
  constructor(config = {}) {
    this.config = {
      maxRecoveryAttempts: config.maxRecoveryAttempts || 3,
      enableAutoRecovery: config.enableAutoRecovery !== false,
      fallbackProviders: config.fallbackProviders || ['grok', 'openai'],
      ...config,
    };

    // Will be set via setters
    this._checkpointManager = null;
    this._taskPlanner = null;
    this._memoryManager = null;
    this._agentLoop = null; // For error classification

    this._recoveryHistory = [];
    this._stats = {
      totalFailures: 0,
      recoveriesAttempted: 0,
      recoveriesSucceeded: 0,
      byStrategy: {},
    };
  }

  /**
   * Set dependencies.
   */
  setCheckpointManager(cm) { this._checkpointManager = cm; return this; }
  setTaskPlanner(tp) { this._taskPlanner = tp; return this; }
  setMemoryManager(mm) { this._memoryManager = mm; return this; }
  setAgentLoop(al) { this._agentLoop = al; return this; }

  // ============================================================
  // MAIN RECOVERY FLOW
  // ============================================================

  /**
   * Handle a failure and attempt recovery.
   *
   * @param {Error} error - The error that occurred
   * @param {object} context - Current execution context
   * @param {string} context.taskId - The task that failed
   * @param {string} context.checkpointLabel - Checkpoint to restore to
   * @param {object} context.currentState - Current state for diagnosis
   * @returns {Promise<RecoveryResult>}
   */
  async handleFailure(error, context = {}) {
    const startTime = Date.now();
    this._stats.totalFailures++;

    logger.error(`[RecoveryManager] Failure: ${error.message}`);

    // Step 1: Diagnose
    const diagnosis = this._diagnose(error, context);
    logger.info(`[RecoveryManager] Diagnosis: ${diagnosis.strategy} — ${diagnosis.reason}`);

    // Step 2: Record in memory for self-healing
    if (this._memoryManager) {
      this._memoryManager.recordError(
        error.message,
        `Strategy: ${diagnosis.strategy} — ${diagnosis.suggestion}`,
        { category: diagnosis.category, taskId: context.taskId },
      );
    }

    // Step 3: Execute recovery strategy
    let recoveryResult;
    try {
      recoveryResult = await this._executeRecovery(diagnosis, context);
    } catch (recoveryError) {
      recoveryResult = {
        success: false,
        strategy: RecoveryStrategy.ABORT,
        error: recoveryError.message,
      };
    }

    // Step 4: Record recovery attempt
    const entry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      diagnosis,
      result: recoveryResult,
      latency: Date.now() - startTime,
    };
    this._recoveryHistory.push(entry);
    if (this._recoveryHistory.length > 100) {
      this._recoveryHistory = this._recoveryHistory.slice(-50);
    }

    this._stats.recoveriesAttempted++;
    if (recoveryResult.success) this._stats.recoveriesSucceeded++;
    this._stats.byStrategy[diagnosis.strategy] = (this._stats.byStrategy[diagnosis.strategy] || 0) + 1;

    return recoveryResult;
  }

  // ============================================================
  // DIAGNOSIS
  // ============================================================

  /**
   * Diagnose a failure and recommend a recovery strategy.
   */
  _diagnose(error, context) {
    const message = (error.message || '').toLowerCase();
    const errorCode = error.code || '';

    // Provider errors → fallback or retry
    if (message.includes('rate_limit') || message.includes('429') || message.includes('503')) {
      return {
        category: 'provider',
        strategy: RecoveryStrategy.FALLBACK_PROVIDER,
        reason: 'Rate limited or service unavailable',
        suggestion: 'Switch to alternative provider',
        severity: 'medium',
      };
    }

    if (message.includes('api key') || message.includes('unauthorized') || message.includes('401')) {
      return {
        category: 'provider',
        strategy: RecoveryStrategy.ABORT,
        reason: 'Authentication failure',
        suggestion: 'Check API key configuration',
        severity: 'high',
      };
    }

    // Context overflow → truncate and retry
    if (message.includes('context') && (message.includes('overflow') || message.includes('length') || message.includes('limit'))) {
      return {
        category: 'context',
        strategy: RecoveryStrategy.RETRY,
        reason: 'Context window overflow',
        suggestion: 'Reduce context size and retry',
        severity: 'medium',
      };
    }

    // Tool errors → retry or skip
    if (message.includes('tool') && message.includes('timeout')) {
      return {
        category: 'tool',
        strategy: RecoveryStrategy.SKIP,
        reason: 'Tool execution timeout',
        suggestion: 'Skip this step and continue',
        severity: 'low',
      };
    }

    if (message.includes('tool') && message.includes('not found')) {
      return {
        category: 'tool',
        strategy: RecoveryStrategy.REPLAN,
        reason: 'Required tool not available',
        suggestion: 'Replan using available tools',
        severity: 'medium',
      };
    }

    // Filesystem errors → retry or abort
    if (message.includes('enoent') || message.includes('no such file')) {
      return {
        category: 'filesystem',
        strategy: context.checkpointLabel ? RecoveryStrategy.ROLLBACK_RETRY : RecoveryStrategy.RETRY,
        reason: 'File not found',
        suggestion: context.checkpointLabel ? 'Rollback and retry' : 'Check file paths and retry',
        severity: 'medium',
      };
    }

    if (message.includes('eacces') || message.includes('permission')) {
      return {
        category: 'permission',
        strategy: RecoveryStrategy.SKIP,
        reason: 'Permission denied',
        suggestion: 'Skip restricted operation',
        severity: 'low',
      };
    }

    // Network errors → retry with backoff
    if (message.includes('econnrefused') || message.includes('enotfound') || message.includes('timeout')) {
      return {
        category: 'network',
        strategy: RecoveryStrategy.RETRY,
        reason: 'Network connectivity issue',
        suggestion: 'Retry with backoff',
        severity: 'medium',
      };
    }

    // Syntax/code errors → replan
    if (message.includes('syntax') || message.includes('unexpected token')) {
      return {
        category: 'syntax',
        strategy: RecoveryStrategy.REPLAN,
        reason: 'Syntax error in generated code',
        suggestion: 'Replan with corrected approach',
        severity: 'medium',
      };
    }

    // Unknown → generic retry
    return {
      category: 'unknown',
      strategy: context.checkpointLabel ? RecoveryStrategy.ROLLBACK_RETRY : RecoveryStrategy.RETRY,
      reason: error.message.slice(0, 200),
      suggestion: 'Attempt generic recovery',
      severity: 'medium',
    };
  }

  // ============================================================
  // RECOVERY EXECUTION
  // ============================================================

  async _executeRecovery(diagnosis, context) {
    switch (diagnosis.strategy) {
      case RecoveryStrategy.RETRY:
        return this._strategyRetry(context);

      case RecoveryStrategy.ROLLBACK_RETRY:
        return this._strategyRollbackRetry(context);

      case RecoveryStrategy.REPLAN:
        return this._strategyReplan(context);

      case RecoveryStrategy.SKIP:
        return this._strategySkip(context);

      case RecoveryStrategy.FALLBACK_PROVIDER:
        return this._strategyFallbackProvider(context);

      case RecoveryStrategy.ABORT:
        return { success: false, strategy: RecoveryStrategy.ABORT, error: 'Aborted by recovery manager' };

      default:
        return { success: false, strategy: diagnosis.strategy, error: 'Unknown strategy' };
    }
  }

  /**
   * Strategy: Simple retry (with backoff implied by caller).
   */
  async _strategyRetry(context) {
    return {
      success: true,
      strategy: RecoveryStrategy.RETRY,
      action: 'retry',
      message: 'Retry the failed operation',
    };
  }

  /**
   * Strategy: Rollback to checkpoint, then retry.
   */
  async _strategyRollbackRetry(context) {
    if (!this._checkpointManager || !context.checkpointLabel) {
      return {
        success: false,
        strategy: RecoveryStrategy.ROLLBACK_RETRY,
        error: 'No checkpoint manager or label available',
      };
    }

    const restoredState = this._checkpointManager.restore(context.checkpointLabel);
    if (!restoredState) {
      return {
        success: false,
        strategy: RecoveryStrategy.ROLLBACK_RETRY,
        error: `Checkpoint "${context.checkpointLabel}" not found`,
      };
    }

    logger.info(`[RecoveryManager] Restored to checkpoint: "${context.checkpointLabel}"`);

    return {
      success: true,
      strategy: RecoveryStrategy.ROLLBACK_RETRY,
      action: 'retry_from_checkpoint',
      restoredState,
      message: `Rolled back to "${context.checkpointLabel}" and ready to retry`,
    };
  }

  /**
   * Strategy: Replan the entire task.
   */
  async _strategyReplan(context) {
    if (!this._taskPlanner) {
      return {
        success: false,
        strategy: RecoveryStrategy.REPLAN,
        error: 'No task planner available',
      };
    }

    // Get failed task info for replanning context
    const failedTask = context.taskId ? this._taskPlanner.getTask(context.taskId) : null;
    const progress = this._taskPlanner.getProgress();

    return {
      success: true,
      strategy: RecoveryStrategy.REPLAN,
      action: 'replan',
      context: {
        failedTask: failedTask?.toJSON(),
        progress,
        completedTasks: Array.from(this._taskPlanner._completedSet),
      },
      message: 'Replan required — provide failure context to planner',
    };
  }

  /**
   * Strategy: Skip the failed step.
   */
  async _strategySkip(context) {
    if (context.taskId && this._taskPlanner) {
      const task = this._taskPlanner.getTask(context.taskId);
      if (task) {
        task.state = 'skipped';
        task.completedAt = new Date().toISOString();
        logger.info(`[RecoveryManager] Skipped task: ${task.name}`);
      }
    }

    return {
      success: true,
      strategy: RecoveryStrategy.SKIP,
      action: 'continue',
      message: 'Skipped failed step, continuing with next',
    };
  }

  /**
   * Strategy: Fall back to a different provider.
   */
  async _strategyFallbackProvider(context) {
    const currentProvider = context.currentProvider || 'openai';
    const fallbacks = this.config.fallbackProviders.filter(p => p !== currentProvider);
    const nextProvider = fallbacks[0] || 'openai';

    logger.info(`[RecoveryManager] Falling back: ${currentProvider} → ${nextProvider}`);

    return {
      success: true,
      strategy: RecoveryStrategy.FALLBACK_PROVIDER,
      action: 'switch_provider',
      newProvider: nextProvider,
      message: `Switched from ${currentProvider} to ${nextProvider}`,
    };
  }

  // ============================================================
  // HISTORY & STATS
  // ============================================================

  getRecoveryHistory(limit = 20) {
    return this._recoveryHistory.slice(-limit);
  }

  getStats() {
    return {
      ...this._stats,
      successRate: this._stats.recoveriesAttempted > 0
        ? Math.round((this._stats.recoveriesSucceeded / this._stats.recoveriesAttempted) * 100)
        : 0,
    };
  }
}

module.exports = { RecoveryManager, RecoveryStrategy };
