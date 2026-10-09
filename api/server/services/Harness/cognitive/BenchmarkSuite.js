/**
 * BenchmarkSuite.js — Universal Benchmarking System
 * 
 * Benchmarks:
 * - Models on tasks
 * - Agents on capabilities
 * - Tools on performance
 * - Generates comparative reports
 * 
 * License: MIT
 * RAM: ~5MB
 */

class BenchmarkSuite {
    constructor(config = {}) {
        this._name = 'BenchmarkSuite';
        this._benchmarks = new Map();
        this._results = [];
    }

    createBenchmark(config) {
        const id = config.id || `bench_${Date.now()}`;
        const bench = { id, name: config.name, tasks: config.tasks || [], models: config.models || [], createdAt: Date.now() };
        this._benchmarks.set(id, bench);
        return bench;
    }

    async runBenchmark(benchmarkId, executor) {
        const bench = this._benchmarks.get(benchmarkId);
        if (!bench) throw new Error(`Benchmark not found: ${benchmarkId}`);
        const results = [];
        for (const model of bench.models) {
            for (const task of bench.tasks) {
                const start = Date.now();
                try {
                    const result = await executor(model, task);
                    results.push({ model, task: task.id, success: true, result, latency: Date.now() - start });
                } catch (err) {
                    results.push({ model, task: task.id, success: false, error: err.message, latency: Date.now() - start });
                }
            }
        }
        this._results.push({ benchmarkId, results, timestamp: Date.now() });
        return this._generateReport(results);
    }

    _generateReport(results) {
        const byModel = {};
        for (const r of results) {
            if (!byModel[r.model]) byModel[r.model] = { successes: 0, failures: 0, avgLatency: 0, latencies: [] };
            if (r.success) byModel[r.model].successes++; else byModel[r.model].failures++;
            byModel[r.model].latencies.push(r.latency);
        }
        for (const model of Object.keys(byModel)) {
            const m = byModel[model];
            m.avgLatency = Math.round(m.latencies.reduce((a, b) => a + b, 0) / m.latencies.length);
            m.successRate = Math.round((m.successes / (m.successes + m.failures)) * 100);
            delete m.latencies;
        }
        return { results, byModel, timestamp: Date.now() };
    }

    getResults() { return this._results; }
    getBenchmarks() { return [...this._benchmarks.values()]; }
}

module.exports = { BenchmarkSuite };
module.exports.default = BenchmarkSuite;
