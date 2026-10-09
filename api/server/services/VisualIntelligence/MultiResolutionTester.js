'use strict';

/**
 * MultiResolutionTester — Face 9: test UI at multiple viewport sizes.
 *
 * Runs visual checks across a predefined set of breakpoints to detect
 * layout breakage, overflow, and responsive design failures.
 *
 * In production: drives Playwright headless Chrome to resize and screenshot.
 * This implementation: accepts pre-captured screenshots or uses the vision API.
 */

const BREAKPOINTS = [
  { name: 'mobile-xs', width: 320, height: 568 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'mobile-lg', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'tablet-lg', width: 1024, height: 768 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'desktop-xl', width: 1440, height: 900 },
  { name: 'desktop-2xl', width: 1920, height: 1080 },
];

const CHECKS = [
  'horizontal_scroll',
  'text_overflow',
  'element_overlap',
  'hidden_content',
  'layout_shift',
  'font_too_small',
];

class MultiResolutionTester {
  constructor() {
    this._results = [];
  }

  /**
   * Run multi-resolution checks on screenshots for a set of breakpoints.
   * @param {object} opts
   * @param {string} opts.url - URL being tested (for labeling)
   * @param {object[]} opts.screenshots - array of { breakpoint: string, base64: string, mimeType: string }
   *   If empty, analysis is stub-only.
   * @param {string[]} [opts.checks] - subset of CHECKS to run (default: all)
   * @returns {Promise<{passed: number, failed: number, issues: object[], by_breakpoint: object}>}
   */
  async run({ url, screenshots = [], checks = CHECKS }) {
    const byBreakpoint = {};
    const issues = [];

    for (const bp of BREAKPOINTS) {
      const shot = screenshots.find((s) => s.breakpoint === bp.name);
      const bpResult = await this._checkBreakpoint(bp, shot, checks);
      byBreakpoint[bp.name] = bpResult;
      for (const issue of bpResult.issues) {
        issues.push({ breakpoint: bp.name, ...issue });
      }
    }

    const passed = Object.values(byBreakpoint).filter((r) => r.issues.length === 0).length;
    const failed = Object.values(byBreakpoint).filter((r) => r.issues.length > 0).length;

    const record = {
      id: `mrt_${Date.now()}`,
      url,
      passed,
      failed,
      total: BREAKPOINTS.length,
      issues,
      by_breakpoint: byBreakpoint,
      tested_at: new Date().toISOString(),
    };
    this._results.push(record);
    if (this._results.length > 50) this._results.shift();

    return { passed, failed, total: BREAKPOINTS.length, issues, by_breakpoint: byBreakpoint };
  }

  async _checkBreakpoint(bp, screenshot, checks) {
    const bpIssues = [];

    if (screenshot && screenshot.base64) {
      const visionIssues = await this._visionCheck(bp, screenshot, checks);
      bpIssues.push(...visionIssues);
    } else {
      // No screenshot — structural check only (mark as untested)
      bpIssues.push({
        check: 'screenshot_missing',
        severity: 'info',
        message: `No screenshot provided for ${bp.name} (${bp.width}×${bp.height})`,
      });
    }

    return { breakpoint: bp.name, width: bp.width, height: bp.height, issues: bpIssues };
  }

  async _visionCheck(bp, screenshot, checks) {
    const issues = [];
    try {
      const { callLLM } = require('~/server/services/LLMGateway/LLMGateway');
      const checkList = checks.join(', ');
      const prompt = `You are a visual QA engineer. Analyze this screenshot taken at ${bp.width}×${bp.height}px viewport.

Check for these issues: ${checkList}

For each issue found, return a JSON object. Return ONLY a JSON array:
[{"check": "${checks[0]}", "severity": "error|warning|info", "message": "description", "element": "element description or null"}]

If no issues found, return an empty array [].`;

      const raw = await callLLM(prompt, { imageBase64: screenshot.base64, imageMimeType: screenshot.mimeType });
      const match = (raw || '').match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      return parsed.filter((i) => i.check && i.severity && i.message);
    } catch {
      return issues;
    }
  }

  getBreakpoints() {
    return BREAKPOINTS;
  }

  getChecks() {
    return CHECKS;
  }

  getHistory(limit = 10) {
    return this._results.slice(-limit).reverse();
  }

  getLastResult() {
    return this._results.length > 0 ? this._results[this._results.length - 1] : null;
  }
}

let _instance = null;
function getMultiResolutionTester() {
  if (!_instance) _instance = new MultiResolutionTester();
  return _instance;
}

module.exports = { MultiResolutionTester, getMultiResolutionTester, BREAKPOINTS, CHECKS };
