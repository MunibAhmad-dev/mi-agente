/**
 * ModelEvaluator.js — Model Performance Evaluation
 * 
 * Evaluates models on:
 * - Response quality
 * - Latency
 * - Token efficiency
 * - Task success rate
 * 
 * License: MIT
 * RAM: ~3MB
 */
const logger = { info: (...args) => console.info('[ModelEvaluator]', ...args) };

class ModelEvaluator {
    constructor(config = {}) {
        this._name = 'ModelEvaluator';
        this._evaluations = new Map();
        this._tasks = new Map();
    }

    evaluate(modelId, task, result) {
        const key = `${modelId}:${task.type}`;
        if (!this._evaluations.has(key)) {
            this._evaluations.set(key, { modelId, taskType: task.type, scores: [], latencies: [], totalTokens: 0, successes: 0, failures: 0 });
        }
        const eval_ = this._evaluations.get(key);
        const score = result.success ? (result.quality || 80) : 0;
        eval_.scores.push(score);
        eval_.latencies.push(result.latency || 0);
        eval_.totalTokens += result.tokens || 0;
        if (result.success) eval_.successes++; else eval_.failures++;
        return { score, avgScore: Math.round(eval_.scores.reduce((a, b) => a + b, 0) / eval_.scores.length) };
    }

    getModelScore(modelId) {
        let totalScore = 0, count = 0;
        for (const [key, eval_] of this._evaluations) {
            if (eval_.modelId === modelId && eval_.scores.length > 0) {
                totalScore += eval_.scores.reduce((a, b) => a + b, 0) / eval_.scores.length;
                count++;
            }
        }
        return count > 0 ? Math.round(totalScore / count) : 0;
    }

    getBestModel(taskType) {
        let best = null, bestScore = -1;
        for (const [key, eval_] of this._evaluations) {
            if (eval_.taskType === taskType && eval_.scores.length > 0) {
                const avg = eval_.scores.reduce((a, b) => a + b, 0) / eval_.scores.length;
                if (avg > bestScore) { bestScore = avg; best = eval_.modelId; }
            }
        }
        return best;
    }

    getStats() {
        const stats = {};
        for (const [key, eval_] of this._evaluations) {
            stats[key] = {
                scores: eval_.scores.length,
                avgScore: eval_.scores.length > 0 ? Math.round(eval_.scores.reduce((a, b) => a + b, 0) / eval_.scores.length) : 0,
                successRate: eval_.scores.length > 0 ? Math.round((eval_.successes / eval_.scores.length) * 100) : 0,
                avgLatency: eval_.latencies.length > 0 ? Math.round(eval_.latencies.reduce((a, b) => a + b, 0) / eval_.latencies.length) : 0,
            };
        }
        return stats;
    }
}

module.exports = { ModelEvaluator };
module.exports.default = ModelEvaluator;
