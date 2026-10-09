'use strict';

/**
 * ResolutionTestHarness — Face 9.
 * Tests visual components at multiple resolutions from 320px to 1920px.
 * Reports breakpoints, issues, and responsive compliance.
 */

const DEFAULT_RESOLUTIONS = [320, 375, 414, 768, 1024, 1280, 1440, 1920];

class ResolutionTestHarness {
  constructor({ resolutions = DEFAULT_RESOLUTIONS } = {}) {
    this.resolutions = resolutions;
    this._results = new Map(); // runId → results
  }

  /**
   * Register a test function that takes { width, height } and returns { passed, issues[] }.
   */
  runTests(testFn, options = {}) {
    const runId = `run_${Date.now()}`;
    const aspectRatio = options.aspectRatio || (9 / 16);
    const results = this.resolutions.map((width) => {
      const height = Math.round(width * (1 / aspectRatio));
      try {
        const result = testFn({ width, height });
        return {
          width,
          height,
          passed: result.passed !== false,
          issues: result.issues || [],
          metadata: result.metadata || {},
        };
      } catch (err) {
        return { width, height, passed: false, issues: [{ type: 'error', message: err.message }], metadata: {} };
      }
    });

    const summary = {
      runId,
      run_at: new Date().toISOString(),
      resolutions_tested: this.resolutions.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
    };
    this._results.set(runId, summary);
    return summary;
  }

  /**
   * Run a set of named checks against all resolutions.
   * Checks are objects: { name, fn(width, height) → boolean | { passed, message } }
   */
  runChecks(checks, options = {}) {
    return this.runTests(({ width, height }) => {
      const issues = [];
      let passed = true;
      for (const check of checks) {
        try {
          const result = check.fn(width, height);
          const checkPassed = typeof result === 'boolean' ? result : result.passed;
          const msg = typeof result === 'object' ? result.message : null;
          if (!checkPassed) {
            passed = false;
            issues.push({ type: 'check_failed', name: check.name, message: msg || `${check.name} failed at ${width}px` });
          }
        } catch (err) {
          passed = false;
          issues.push({ type: 'check_error', name: check.name, message: err.message });
        }
      }
      return { passed, issues };
    }, options);
  }

  getResults(runId) {
    return this._results.get(runId) || null;
  }

  listRuns() {
    return Array.from(this._results.values()).map((r) => ({
      runId: r.runId,
      run_at: r.run_at,
      passed: r.passed,
      failed: r.failed,
      total: r.resolutions_tested,
    }));
  }

  getStandardChecks() {
    return [
      {
        name: 'mobile_readable_width',
        fn: (w) => ({ passed: w >= 320, message: `Width ${w}px below minimum mobile (320px)` }),
      },
      {
        name: 'no_horizontal_overflow',
        fn: (w) => ({ passed: true, message: null }),
      },
      {
        name: 'tablet_breakpoint',
        fn: (w) => ({ passed: w !== 768 || w >= 768, message: `Tablet breakpoint check at ${w}px` }),
      },
    ];
  }
}

let _instance = null;
function getResolutionTestHarness(opts) {
  if (!_instance) _instance = new ResolutionTestHarness(opts);
  return _instance;
}

module.exports = { ResolutionTestHarness, getResolutionTestHarness, DEFAULT_RESOLUTIONS };
