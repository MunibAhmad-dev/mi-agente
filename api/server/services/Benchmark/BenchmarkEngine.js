/**
 * BenchmarkEngine — Phase J: smoke → benchmark → promote pipeline
 *
 * Three-stage pipeline:
 *   1. Smoke   — fast sanity checks (health endpoint, DB connect)
 *   2. Bench   — latency / throughput measurements
 *   3. Promote — marks build as production-ready if thresholds pass
 *
 * Each stage returns a StageResult. The pipeline stops on first failure.
 */

'use strict';

const { runCommand } = require('../Verification/verificationService');

const logger = {
  info: (...a) => console.log('[BenchmarkEngine]', ...a),
  warn: (...a) => console.warn('[BenchmarkEngine]', ...a),
  error: (...a) => console.error('[BenchmarkEngine]', ...a),
};

const Stage = Object.freeze({
  SMOKE: 'smoke',
  BENCH: 'bench',
  PROMOTE: 'promote',
});

const StageStatus = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  SKIP: 'skip',
});

const DEFAULT_THRESHOLDS = {
  smokeTimeoutMs: 10_000,
  benchIterations: 5,
  p95LatencyMs: 2_000, // reject if p95 > 2 s
  errorRateMax: 0.05,  // reject if > 5% errors
};

/**
 * @param {number[]} arr
 * @returns {number} percentile value (0-100)
 */
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

class BenchmarkEngine {
  /**
   * @param {object} config
   * @param {object} config.targets - { healthUrl, dbCheckFn, benchFn }
   *   healthUrl: string — GET /health endpoint
   *   dbCheckFn: async () => boolean — returns true if DB is up
   *   benchFn:   async () => { latencyMs: number, error?: boolean } — one iteration
   * @param {object} [config.thresholds]
   * @param {string} [config.cwd]
   */
  constructor(config = {}) {
    this._targets = config.targets || {};
    this._thresholds = { ...DEFAULT_THRESHOLDS, ...(config.thresholds || {}) };
    this._cwd = config.cwd || process.cwd();
    this._results = [];
  }

  /** Run the full pipeline. Returns all stage results. */
  async run() {
    this._results = [];

    const smoke = await this._runSmoke();
    this._results.push(smoke);
    if (smoke.status === StageStatus.FAIL) {
      return this._summary();
    }

    const bench = await this._runBench();
    this._results.push(bench);
    if (bench.status === StageStatus.FAIL) {
      return this._summary();
    }

    const promote = await this._runPromote();
    this._results.push(promote);

    return this._summary();
  }

  // ── Stage 1: Smoke ───────────────────────────────────────────────────────

  async _runSmoke() {
    logger.info('Stage: smoke');
    const checks = [];
    const t = this._thresholds;

    // Health endpoint check
    if (this._targets.healthUrl) {
      const start = Date.now();
      try {
        const ok = await this._httpGet(this._targets.healthUrl, t.smokeTimeoutMs);
        checks.push({ name: 'health', passed: ok, latencyMs: Date.now() - start });
      } catch (err) {
        checks.push({ name: 'health', passed: false, error: err.message });
      }
    }

    // DB connectivity check
    if (typeof this._targets.dbCheckFn === 'function') {
      try {
        const ok = await this._targets.dbCheckFn();
        checks.push({ name: 'db', passed: !!ok });
      } catch (err) {
        checks.push({ name: 'db', passed: false, error: err.message });
      }
    }

    const failed = checks.filter((c) => !c.passed);
    return {
      stage: Stage.SMOKE,
      status: failed.length === 0 ? StageStatus.PASS : StageStatus.FAIL,
      checks,
      failedChecks: failed,
    };
  }

  // ── Stage 2: Benchmark ───────────────────────────────────────────────────

  async _runBench() {
    logger.info('Stage: bench');
    if (typeof this._targets.benchFn !== 'function') {
      return { stage: Stage.BENCH, status: StageStatus.SKIP, reason: 'no benchFn provided' };
    }

    const { benchIterations, p95LatencyMs, errorRateMax } = this._thresholds;
    const latencies = [];
    let errors = 0;

    for (let i = 0; i < benchIterations; i++) {
      try {
        const r = await this._targets.benchFn();
        latencies.push(r.latencyMs || 0);
        if (r.error) errors++;
      } catch (err) {
        errors++;
        latencies.push(9999);
      }
    }

    const p95 = percentile(latencies, 95);
    const errorRate = errors / benchIterations;
    const passed = p95 <= p95LatencyMs && errorRate <= errorRateMax;

    return {
      stage: Stage.BENCH,
      status: passed ? StageStatus.PASS : StageStatus.FAIL,
      metrics: {
        iterations: benchIterations,
        p50Ms: percentile(latencies, 50),
        p95Ms: p95,
        errorRate,
      },
      thresholds: { p95LatencyMs, errorRateMax },
    };
  }

  // ── Stage 3: Promote ─────────────────────────────────────────────────────

  async _runPromote() {
    logger.info('Stage: promote');
    // Tag the current git commit as a promoted build
    const tag = `promoted-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const tagResult = runCommand('git', ['tag', tag], { cwd: this._cwd, timeoutMs: 10_000 });

    return {
      stage: Stage.PROMOTE,
      status: tagResult.status === 'pass' ? StageStatus.PASS : StageStatus.FAIL,
      tag,
      detail: tagResult.output || tagResult.error || tagResult.status,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  _httpGet(url, timeoutMs) {
    const mod = url.startsWith('https') ? require('https') : require('http');
    return new Promise((resolve, reject) => {
      const req = mod
        .get(url, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 400);
        })
        .on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error(`timeout after ${timeoutMs}ms`));
      });
    });
  }

  _summary() {
    const allPassed = this._results.every((r) => r.status !== StageStatus.FAIL);
    return {
      passed: allPassed,
      stages: this._results,
      summary: allPassed
        ? 'Pipeline passed — build promoted'
        : `Pipeline failed at stage: ${this._results.find((r) => r.status === StageStatus.FAIL)?.stage}`,
    };
  }
}

module.exports = { BenchmarkEngine, Stage, StageStatus };
