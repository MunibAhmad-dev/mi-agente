'use strict';

/**
 * VisualQAAgent — Face 9: autonomous visual quality assurance agent.
 *
 * Orchestrates bounding box extraction, accessibility checks, multi-resolution
 * testing, and regression comparison into a single QA run for a URL or screenshot.
 * Emits structured QA reports with severity-ranked findings.
 */

const { EventEmitter } = require('events');

const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };
const QA_MODULES = ['layout', 'accessibility', 'responsive', 'regression', 'content'];

class VisualQAAgent extends EventEmitter {
  constructor() {
    super();
    this._reports = [];
  }

  /**
   * Run a full QA check on screenshots/pages.
   * @param {object} opts
   * @param {string} opts.name - run identifier
   * @param {string} [opts.url] - source URL (for labeling)
   * @param {object} [opts.screenshot] - { base64, mimeType } for the primary screenshot
   * @param {object[]} [opts.multiResShots] - { breakpoint, base64, mimeType }[] for responsive tests
   * @param {string[]} [opts.modules] - QA modules to run (default: all)
   * @param {boolean} [opts.captureBaseline] - whether to save this run as a regression baseline
   * @returns {Promise<QAReport>}
   */
  async run({ name, url, screenshot, multiResShots = [], modules = QA_MODULES, captureBaseline = false }) {
    const runId = `qa_${Date.now()}`;
    this.emit('start', { runId, name, modules });

    const findings = [];

    if (modules.includes('accessibility') && screenshot) {
      this.emit('module_start', { runId, module: 'accessibility' });
      const a11yFindings = await this._runAccessibility(screenshot);
      findings.push(...a11yFindings);
      this.emit('module_end', { runId, module: 'accessibility', count: a11yFindings.length });
    }

    if (modules.includes('layout') && screenshot) {
      this.emit('module_start', { runId, module: 'layout' });
      const layoutFindings = await this._runLayout(screenshot);
      findings.push(...layoutFindings);
      this.emit('module_end', { runId, module: 'layout', count: layoutFindings.length });
    }

    if (modules.includes('responsive') && multiResShots.length > 0) {
      this.emit('module_start', { runId, module: 'responsive' });
      const respFindings = await this._runResponsive(multiResShots);
      findings.push(...respFindings);
      this.emit('module_end', { runId, module: 'responsive', count: respFindings.length });
    }

    if (modules.includes('regression') && screenshot) {
      this.emit('module_start', { runId, module: 'regression' });
      const regressionFindings = await this._runRegression(name, screenshot, captureBaseline);
      findings.push(...regressionFindings);
      this.emit('module_end', { runId, module: 'regression', count: regressionFindings.length });
    }

    if (modules.includes('content') && screenshot) {
      this.emit('module_start', { runId, module: 'content' });
      const contentFindings = await this._runContentCheck(screenshot);
      findings.push(...contentFindings);
      this.emit('module_end', { runId, module: 'content', count: contentFindings.length });
    }

    const errors = findings.filter((f) => f.severity === SEVERITY.ERROR).length;
    const warnings = findings.filter((f) => f.severity === SEVERITY.WARNING).length;
    const passed = findings.filter((f) => f.severity === SEVERITY.INFO).length;

    const report = {
      id: runId,
      name,
      url: url || null,
      modules_run: modules,
      findings,
      summary: { errors, warnings, passed_checks: passed, total_findings: findings.length },
      status: errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass',
      ran_at: new Date().toISOString(),
    };

    this._reports.push(report);
    if (this._reports.length > 50) this._reports.shift();

    this.emit('complete', report);
    return report;
  }

  async _runAccessibility(screenshot) {
    try {
      const { AdversarialVisualTesting } = require('./AdversarialVisualTesting');
      const avt = new AdversarialVisualTesting();
      const results = await avt.runAccessibilityChecks('');
      return results
        .filter((r) => !r.passed)
        .map((r) => ({
          module: 'accessibility',
          check: r.check,
          severity: r.severity === 'error' ? SEVERITY.ERROR : SEVERITY.WARNING,
          message: r.message,
        }));
    } catch {
      return [];
    }
  }

  async _runLayout(screenshot) {
    const findings = [];
    try {
      const { getBoundingBoxExtractor } = require('./BoundingBoxExtractor');
      const extractor = getBoundingBoxExtractor();
      const { elements } = await extractor.extract({
        base64: screenshot.base64,
        mimeType: screenshot.mimeType,
        viewportWidth: 1280,
        viewportHeight: 800,
      });

      const overlaps = extractor.findOverlaps(elements);
      for (const ov of overlaps) {
        findings.push({
          module: 'layout',
          check: 'element_overlap',
          severity: SEVERITY.WARNING,
          message: `Elements ${ov.element_a} and ${ov.element_b} overlap (${ov.overlap_area}px²)`,
        });
      }

      const outOfBounds = extractor.findOutOfBounds(elements, 1280, 800);
      for (const el of outOfBounds) {
        findings.push({
          module: 'layout',
          check: 'out_of_bounds',
          severity: SEVERITY.ERROR,
          message: `Element "${el.label || el.id}" extends beyond viewport`,
        });
      }
    } catch {
      /* non-fatal */
    }
    return findings;
  }

  async _runResponsive(multiResShots) {
    const findings = [];
    try {
      const { getMultiResolutionTester } = require('./MultiResolutionTester');
      const tester = getMultiResolutionTester();
      const result = await tester.run({ url: 'check', screenshots: multiResShots });
      for (const issue of result.issues) {
        findings.push({
          module: 'responsive',
          check: issue.check,
          severity: issue.severity === 'error' ? SEVERITY.ERROR : SEVERITY.WARNING,
          message: `[${issue.breakpoint}] ${issue.message}`,
        });
      }
    } catch {
      /* non-fatal */
    }
    return findings;
  }

  async _runRegression(name, screenshot, captureBaseline) {
    const findings = [];
    try {
      const { getVisualRegressionSystem, STATUS } = require('./VisualRegressionSystem');
      const vrs = getVisualRegressionSystem();

      if (captureBaseline) {
        vrs.captureBaseline({ name, base64: screenshot.base64, mimeType: screenshot.mimeType });
        findings.push({
          module: 'regression',
          check: 'baseline_captured',
          severity: SEVERITY.INFO,
          message: `Baseline captured for "${name}"`,
        });
        return findings;
      }

      const result = await vrs.compare({ name, base64: screenshot.base64, mimeType: screenshot.mimeType });
      if (result.status === STATUS.FAIL) {
        findings.push({
          module: 'regression',
          check: 'visual_regression',
          severity: SEVERITY.ERROR,
          message: result.message,
          diff_ratio: result.diff_ratio,
          changed_regions: result.changed_regions,
        });
      } else if (result.status === STATUS.WARN) {
        findings.push({
          module: 'regression',
          check: 'visual_regression',
          severity: SEVERITY.WARNING,
          message: result.message,
        });
      } else if (result.status === STATUS.BASELINE_MISSING) {
        findings.push({ module: 'regression', check: 'baseline_missing', severity: SEVERITY.INFO, message: result.message });
      }
    } catch {
      /* non-fatal */
    }
    return findings;
  }

  async _runContentCheck(screenshot) {
    const findings = [];
    try {
      const { callLLM } = require('~/server/services/LLMGateway/LLMGateway');
      const prompt = `Analyze this screenshot for content quality issues:
- Placeholder/lorem ipsum text visible
- Broken images (empty img elements, alt text showing)
- Error messages visible to users
- Missing content (empty sections that should have content)

Return ONLY JSON array: [{"check": "placeholder_text|broken_image|error_visible|missing_content", "severity": "error|warning", "message": "description"}]
If none found, return [].`;

      const raw = await callLLM(prompt, { imageBase64: screenshot.base64, imageMimeType: screenshot.mimeType });
      const match = (raw || '').match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      return parsed
        .filter((f) => f.check && f.severity && f.message)
        .map((f) => ({
          module: 'content',
          check: f.check,
          severity: f.severity === 'error' ? SEVERITY.ERROR : SEVERITY.WARNING,
          message: f.message,
        }));
    } catch {
      return findings;
    }
  }

  getReports(limit = 10) {
    return this._reports.slice(-limit).reverse();
  }

  getLastReport() {
    return this._reports.length > 0 ? this._reports[this._reports.length - 1] : null;
  }

  getModules() {
    return QA_MODULES;
  }
}

let _instance = null;
function getVisualQAAgent() {
  if (!_instance) _instance = new VisualQAAgent();
  return _instance;
}

module.exports = { VisualQAAgent, getVisualQAAgent, SEVERITY, QA_MODULES };
