/**
 * TokenBudgetService — Per-task token budget management.
 *
 * Tracks token usage per agent task/run and enforces budget limits.
 * Integrates with CompressionService to auto-compress when approaching limits.
 *
 * Features:
 *   - Per-task budget tracking (input, output, cached, compressed)
 *   - Auto-compress when context exceeds threshold (default 75% of budget)
 *   - Cost estimation based on model pricing
 *   - Budget enforcement (hard limit + warning threshold)
 */

const CompressionService = require('./CompressionService');

const DEFAULT_BUDGET = 100000;
const COMPRESS_THRESHOLD = 0.75;
const WARNING_THRESHOLD = 0.9;

const _tasks = new Map();

/**
 * Create a token budget for a task.
 * @param {string} taskId
 * @param {object} [opts]
 * @param {number} [opts.maxTokens=100000]
 * @param {string} [opts.model='gpt-4o']
 * @param {number} [opts.inputCostPerM=0.20]
 * @param {number} [opts.outputCostPerM=0.90]
 */
function createBudget(taskId, opts = {}) {
  const budget = {
    taskId,
    maxTokens: opts.maxTokens || DEFAULT_BUDGET,
    model: opts.model || 'gpt-4o',
    inputCostPerM: opts.inputCostPerM || 0.2,
    outputCostPerM: opts.outputCostPerM || 0.9,
    used: {
      input: 0,
      output: 0,
      cached: 0,
      compressed: 0,
      retrieved: 0,
    },
    warnings: [],
    createdAt: Date.now(),
  };
  _tasks.set(taskId, budget);
  return budget;
}

/**
 * Get the budget for a task.
 * @param {string} taskId
 * @returns {object|null}
 */
function getBudget(taskId) {
  return _tasks.get(taskId) || null;
}

/**
 * Record token usage for a task.
 * @param {string} taskId
 * @param {object} usage
 * @param {number} [usage.input]
 * @param {number} [usage.output]
 * @param {number} [usage.cached]
 * @param {number} [usage.compressed]
 * @param {number} [usage.retrieved]
 * @returns {object|null} updated budget
 */
function recordUsage(taskId, usage = {}) {
  const budget = _tasks.get(taskId);
  if (!budget) return null;
  budget.used.input += usage.input || 0;
  budget.used.output += usage.output || 0;
  budget.used.cached += usage.cached || 0;
  budget.used.compressed += usage.compressed || 0;
  budget.used.retrieved += usage.retrieved || 0;

  const total = getTotalUsed(budget);
  const ratio = total / budget.maxTokens;
  if (ratio >= WARNING_THRESHOLD) {
    budget.warnings.push({
      type: 'budget_warning',
      ratio: Math.round(ratio * 100) / 100,
      timestamp: Date.now(),
    });
  }
  return budget;
}

/**
 * Get total tokens used across all categories.
 * @param {object} budget
 * @returns {number}
 */
function getTotalUsed(budget) {
  if (!budget || !budget.used) return 0;
  return budget.used.input + budget.used.output;
}

/**
 * Check if a task has exceeded its budget.
 * @param {string} taskId
 * @returns {boolean}
 */
function isOverBudget(taskId) {
  const budget = _tasks.get(taskId);
  if (!budget) return false;
  return getTotalUsed(budget) >= budget.maxTokens;
}

/**
 * Check if a task should compress its context (approaching threshold).
 * @param {string} taskId
 * @returns {boolean}
 */
function shouldCompress(taskId) {
  const budget = _tasks.get(taskId);
  if (!budget) return false;
  const total = getTotalUsed(budget);
  return total / budget.maxTokens >= COMPRESS_THRESHOLD;
}

/**
 * Estimate cost for a task based on usage and model pricing.
 * @param {string} taskId
 * @returns {number} estimated cost in USD
 */
function estimateCost(taskId) {
  const budget = _tasks.get(taskId);
  if (!budget) return 0;
  const inputCost = (budget.used.input / 1000000) * budget.inputCostPerM;
  const outputCost = (budget.used.output / 1000000) * budget.outputCostPerM;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}

/**
 * Get a summary of the budget status.
 * @param {string} taskId
 * @returns {object|null}
 */
function getSummary(taskId) {
  const budget = _tasks.get(taskId);
  if (!budget) return null;
  const total = getTotalUsed(budget);
  return {
    taskId,
    used: budget.used,
    total,
    max: budget.maxTokens,
    ratio: Math.round((total / budget.maxTokens) * 100) / 100,
    estimatedCost: estimateCost(taskId),
    isOverBudget: total >= budget.maxTokens,
    shouldCompress: total / budget.maxTokens >= COMPRESS_THRESHOLD,
    warnings: budget.warnings,
  };
}

/**
 * Clear a task budget.
 * @param {string} taskId
 */
function clearBudget(taskId) {
  _tasks.delete(taskId);
}

/**
 * Auto-compress messages if the task is approaching budget.
 * @param {string} taskId
 * @param {Array} messages
 * @returns {Promise<{messages: Array, compressed: boolean, info: object|null}>}
 */
async function autoCompress(taskId, messages) {
  if (!shouldCompress(taskId) || !Array.isArray(messages)) {
    return { messages, compressed: false, info: null };
  }
  let totalSaved = 0;
  const compressedMessages = [];
  for (const msg of messages) {
    if (!msg || !msg.content || typeof msg.content !== 'string') {
      compressedMessages.push(msg);
      continue;
    }
    const result = await CompressionService.compress(msg.content, {
      maxTokens: 2000,
      contentType: 'text',
    });
    if (result.compressed.length < msg.content.length) {
      totalSaved += result.originalTokens - result.compressedTokens;
      compressedMessages.push({ ...msg, content: result.compressed });
      recordUsage(taskId, { compressed: result.originalTokens - result.compressedTokens });
    } else {
      compressedMessages.push(msg);
    }
  }
  return {
    messages: compressedMessages,
    compressed: totalSaved > 0,
    info: {
      savedTokens: totalSaved,
      originalMessages: messages.length,
      compressedMessages: compressedMessages.length,
    },
  };
}

module.exports = {
  createBudget,
  getBudget,
  recordUsage,
  getTotalUsed,
  isOverBudget,
  shouldCompress,
  estimateCost,
  getSummary,
  clearBudget,
  autoCompress,
  DEFAULT_BUDGET,
  COMPRESS_THRESHOLD,
  WARNING_THRESHOLD,
};
