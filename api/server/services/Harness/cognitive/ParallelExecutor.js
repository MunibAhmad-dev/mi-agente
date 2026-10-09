/**
 * ParallelExecutor.js — Parallel Task Execution
 * 
 * Executes independent tasks in parallel:
 * - Promise.allSettled for fault tolerance
 * - Configurable concurrency limit
 * - Result merging
 * - Progress tracking
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[ParallelExecutor]', ...args),
    info: (...args) => console.info('[ParallelExecutor]', ...args),
    warn: (...args) => console.warn('[ParallelExecutor]', ...args),
    error: (...args) => console.error('[ParallelExecutor]', ...args),
};

class ParallelExecutor extends EventEmitter {
    constructor(config = {}) {
        super();
        this._maxConcurrency = config.maxConcurrency || 5;
        this._activeTasks = 0;
        this._queue = [];
    }

    /**
     * Execute multiple tasks in parallel with concurrency limit.
     */
    async executeParallel(tasks, options = {}) {
        const startTime = Date.now();
        const results = [];
        const concurrency = options.concurrency || this._maxConcurrency;

        logger.info(`[ParallelExecutor] Executing ${tasks.length} tasks (max ${concurrency} concurrent)`);

        // Execute with concurrency limit
        const executing = new Set();

        for (const task of tasks) {
            const promise = this._executeTask(task, options)
                .then(result => {
                    executing.delete(promise);
                    results.push({ task: task.name || 'unnamed', success: true, result });
                    this.emit('taskComplete', { task: task.name, success: true });
                })
                .catch(error => {
                    executing.delete(promise);
                    results.push({ task: task.name || 'unnamed', success: false, error: error.message });
                    this.emit('taskComplete', { task: task.name, success: false, error: error.message });
                });

            executing.add(promise);

            // Wait if at concurrency limit
            if (executing.size >= concurrency) {
                await Promise.race(executing);
            }
        }

        // Wait for all remaining
        await Promise.all(executing);

        const duration = Date.now() - startTime;
        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        logger.info(`[ParallelExecutor] Completed: ${succeeded}/${tasks.length} succeeded, ${failed} failed (${duration}ms)`);

        return {
            success: failed === 0,
            results,
            summary: { total: tasks.length, succeeded, failed, duration },
        };
    }

    /**
     * Execute a single task with timeout.
     */
    async _executeTask(task, options) {
        const timeout = options.timeout || 60000;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Task "${task.name}" timed out after ${timeout}ms`));
            }, timeout);

            Promise.resolve(task.fn())
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * Get active tasks count.
     */
    getActiveCount() {
        return this._activeTasks;
    }
}

module.exports = { ParallelExecutor };
module.exports.default = ParallelExecutor;
