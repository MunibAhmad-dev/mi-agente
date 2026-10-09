'use strict';

/**
 * FinalAuditLoop — Gen B Phase 46.
 *
 * A self-auditing loop that periodically or on-demand reviews the agent's
 * recent behavior against defined quality standards and surfaces a summary
 * of what is passing, degrading, or needs attention.
 *
 * Integrates with existing CognitiveBehavior components:
 *   - ResponseQualityGate  → response quality scores
 *   - BehaviorBenchmark    → benchmark scores
 *   - RegressionBenchmark  → trend detection
 *   - AuditTrailWriter     → event history
 *   - SelfReflection       → session insights
 *
 * Singleton: getFinalAuditLoop()
 */

const SEVERITY = { OK: 'ok', WARN: 'warn', CRITICAL: 'critical' };

// Thresholds
const THRESHOLDS = {
  minQualityScore:    0.6,   // below this → CRITICAL
  warnQualityScore:   0.75,  // below this → WARN
  maxErrorRate:       0.15,  // > 15 % errors → WARN
  criticalErrorRate:  0.30,  // > 30 % errors → CRITICAL
  minTestPassRate:    0.70,  // < 70 % → WARN
};

class FinalAuditLoop {
  constructor() {
    this.auditHistory  = [];
    this.running       = false;
    this._timer        = null;
    this.stats         = { auditsRun: 0, findings: 0, criticals: 0, warns: 0 };
  }

  // ── Core audit ─────────────────────────────────────────────────────────────

  /**
   * Run a complete audit cycle across all instrumented components.
   * @param {object} [opts]
   * @param {string} [opts.sessionId]  - Limit audit to a single session (optional)
   * @param {string} [opts.triggeredBy] - 'manual' | 'schedule' | 'threshold'
   * @returns {AuditReport}
   */
  async runAudit(opts = {}) {
    const start  = Date.now();
    const report = {
      auditId:     `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      triggeredBy: opts.triggeredBy || 'manual',
      sessionId:   opts.sessionId || null,
      ranAt:       new Date().toISOString(),
      sections:    {},
      findings:    [],
      summary:     { severity: SEVERITY.OK, passCount: 0, warnCount: 0, criticalCount: 0 },
      durationMs:  0,
    };

    try {
      // ── Section 1: Response quality ────────────────────────────────────────
      report.sections.responseQuality = await this._auditResponseQuality(opts);

      // ── Section 2: Behavior benchmarks ────────────────────────────────────
      report.sections.benchmarks = await this._auditBenchmarks(opts);

      // ── Section 3: Regression trends ──────────────────────────────────────
      report.sections.regressions = await this._auditRegressions(opts);

      // ── Section 4: Audit trail events ─────────────────────────────────────
      report.sections.auditTrail = await this._auditTrailSummary(opts);

      // ── Section 5: Security posture ───────────────────────────────────────
      report.sections.security = await this._auditSecurity();

      // ── Section 6: Coverage check ──────────────────────────────────────────
      report.sections.coverage = this._auditCoverage();

    } catch (e) {
      report.findings.push({
        section:  'system',
        severity: SEVERITY.CRITICAL,
        message:  'Audit loop itself encountered an error: ' + e.message,
      });
    }

    // Aggregate findings from all sections
    for (const section of Object.values(report.sections)) {
      if (Array.isArray(section.findings)) {
        report.findings.push(...section.findings);
      }
    }

    // Compute summary
    for (const f of report.findings) {
      if (f.severity === SEVERITY.CRITICAL) { report.summary.criticalCount++; }
      else if (f.severity === SEVERITY.WARN) report.summary.warnCount++;
      else report.summary.passCount++;
    }
    report.summary.severity = report.summary.criticalCount > 0
      ? SEVERITY.CRITICAL
      : report.summary.warnCount > 0 ? SEVERITY.WARN : SEVERITY.OK;

    report.durationMs = Date.now() - start;

    // Store
    this.auditHistory.push(report);
    if (this.auditHistory.length > 100) this.auditHistory.shift();
    this.stats.auditsRun++;
    this.stats.findings    += report.findings.length;
    this.stats.criticals   += report.summary.criticalCount;
    this.stats.warns       += report.summary.warnCount;

    return report;
  }

  // ── Section auditors ───────────────────────────────────────────────────────

  async _auditResponseQuality(opts) {
    const section = { name: 'responseQuality', findings: [] };
    try {
      const gate = this._loadComponent('ResponseQualityGate');
      if (!gate) { section.findings.push({ section: 'responseQuality', severity: SEVERITY.WARN, message: 'ResponseQualityGate not available' }); return section; }

      const stats = gate.getStats ? gate.getStats() : {};
      section.stats = stats;

      if (stats.avgScore !== undefined) {
        if (stats.avgScore < THRESHOLDS.minQualityScore) {
          section.findings.push({ section: 'responseQuality', severity: SEVERITY.CRITICAL, message: `Average response quality score ${stats.avgScore.toFixed(2)} below minimum ${THRESHOLDS.minQualityScore}` });
        } else if (stats.avgScore < THRESHOLDS.warnQualityScore) {
          section.findings.push({ section: 'responseQuality', severity: SEVERITY.WARN, message: `Average response quality score ${stats.avgScore.toFixed(2)} below target ${THRESHOLDS.warnQualityScore}` });
        }
      }

      if (stats.errorRate !== undefined) {
        if (stats.errorRate > THRESHOLDS.criticalErrorRate) {
          section.findings.push({ section: 'responseQuality', severity: SEVERITY.CRITICAL, message: `Error rate ${(stats.errorRate * 100).toFixed(1)}% exceeds critical threshold` });
        } else if (stats.errorRate > THRESHOLDS.maxErrorRate) {
          section.findings.push({ section: 'responseQuality', severity: SEVERITY.WARN, message: `Error rate ${(stats.errorRate * 100).toFixed(1)}% above normal` });
        }
      }
    } catch (e) {
      section.findings.push({ section: 'responseQuality', severity: SEVERITY.WARN, message: 'Could not audit ResponseQualityGate: ' + e.message });
    }
    return section;
  }

  async _auditBenchmarks(opts) {
    const section = { name: 'benchmarks', findings: [] };
    try {
      const bench = this._loadComponent('BehaviorBenchmark');
      if (!bench) { section.findings.push({ section: 'benchmarks', severity: SEVERITY.WARN, message: 'BehaviorBenchmark not available' }); return section; }

      const builtins = bench.getBuiltinBenchmarks ? bench.getBuiltinBenchmarks() : [];
      section.benchmarkCount = builtins.length;
      if (builtins.length === 0) {
        section.findings.push({ section: 'benchmarks', severity: SEVERITY.WARN, message: 'No benchmarks defined — add at least one behavioral benchmark' });
      }
    } catch (e) {
      section.findings.push({ section: 'benchmarks', severity: SEVERITY.WARN, message: 'Could not audit BehaviorBenchmark: ' + e.message });
    }
    return section;
  }

  async _auditRegressions(opts) {
    const section = { name: 'regressions', findings: [] };
    try {
      const reg = this._loadComponent('RegressionBenchmark');
      if (!reg) { section.findings.push({ section: 'regressions', severity: SEVERITY.WARN, message: 'RegressionBenchmark not available' }); return section; }

      const stats = reg.getStats ? reg.getStats() : {};
      section.stats = stats;
      if (stats.degrading && stats.degrading > 0) {
        section.findings.push({ section: 'regressions', severity: SEVERITY.WARN, message: `${stats.degrading} metric(s) showing degrading trend` });
      }
    } catch (e) {
      section.findings.push({ section: 'regressions', severity: SEVERITY.WARN, message: 'Could not audit RegressionBenchmark: ' + e.message });
    }
    return section;
  }

  async _auditTrailSummary(opts) {
    const section = { name: 'auditTrail', findings: [] };
    try {
      const trail = this._loadComponent('AuditTrailWriter');
      if (!trail) { section.findings.push({ section: 'auditTrail', severity: SEVERITY.WARN, message: 'AuditTrailWriter not available' }); return section; }

      const stats = trail.getStats ? trail.getStats() : {};
      section.stats = stats;

      // Flag if no events have been logged in last run
      if (stats.totalEvents !== undefined && stats.totalEvents === 0) {
        section.findings.push({ section: 'auditTrail', severity: SEVERITY.WARN, message: 'No events recorded in AuditTrailWriter — audit trail may not be wired' });
      }

      // Flag high ERROR event count
      const errorCount = stats.errorCount || 0;
      const total      = stats.totalEvents || 1;
      if (errorCount / total > THRESHOLDS.criticalErrorRate) {
        section.findings.push({ section: 'auditTrail', severity: SEVERITY.CRITICAL, message: `High ERROR event rate in audit trail: ${errorCount} errors out of ${total} events` });
      }
    } catch (e) {
      section.findings.push({ section: 'auditTrail', severity: SEVERITY.WARN, message: 'Could not audit AuditTrailWriter: ' + e.message });
    }
    return section;
  }

  async _auditSecurity() {
    const section = { name: 'security', findings: [] };
    try {
      // Check that key security env flags are set correctly
      const harnessEnabled = process.env.HARNESS_ENGINE_ENABLED;
      if (harnessEnabled === 'true') {
        section.findings.push({ section: 'security', severity: SEVERITY.WARN, message: 'HARNESS_ENGINE_ENABLED=true — ensure a real sandbox is available in this environment' });
      }

      const registration = process.env.ALLOW_REGISTRATION;
      if (registration === 'true') {
        section.findings.push({ section: 'security', severity: SEVERITY.WARN, message: 'ALLOW_REGISTRATION=true — open registration is enabled' });
      }

      if (section.findings.length === 0) {
        section.findings.push({ section: 'security', severity: SEVERITY.OK, message: 'Core security env flags look correct' });
      }
    } catch (e) {
      section.findings.push({ section: 'security', severity: SEVERITY.WARN, message: 'Could not audit security posture: ' + e.message });
    }
    return section;
  }

  _auditCoverage() {
    const section = { name: 'coverage', findings: [] };
    try {
      const required = [
        'ResponseQualityGate', 'BehaviorBenchmark', 'RegressionBenchmark',
        'AuditTrailWriter', 'SelfReflection', 'ContradictionDetector',
        'ConfidenceCalibration', 'ScopeGuardian', 'RiskAwareAutonomy',
        'MinimumEffectiveAction', 'ModelAgnosticTesting',
      ];
      const missing = [];
      for (const name of required) {
        try {
          require(`~/server/services/CognitiveBehavior/${name}`);
        } catch {
          missing.push(name);
        }
      }
      section.required   = required.length;
      section.missing    = missing;
      section.coverage   = Math.round(((required.length - missing.length) / required.length) * 100) + '%';

      if (missing.length > 0) {
        section.findings.push({ section: 'coverage', severity: SEVERITY.WARN, message: `${missing.length} Gen B component(s) not loadable: ${missing.join(', ')}` });
      } else {
        section.findings.push({ section: 'coverage', severity: SEVERITY.OK, message: `All ${required.length} required Gen B components present` });
      }
    } catch (e) {
      section.findings.push({ section: 'coverage', severity: SEVERITY.WARN, message: 'Coverage check error: ' + e.message });
    }
    return section;
  }

  // ── Scheduled loop ─────────────────────────────────────────────────────────

  /**
   * Start a scheduled audit loop.
   * @param {number} intervalMs - Milliseconds between audits (default 1 hour)
   */
  start(intervalMs = 3_600_000) {
    if (this.running) return { started: false, reason: 'Already running' };
    if (process.env.NODE_ENV === 'test') return { started: false, reason: 'Disabled in test env' };

    this._timer = setInterval(async () => {
      try { await this.runAudit({ triggeredBy: 'schedule' }); } catch (e) { /* silent */ }
    }, intervalMs);
    if (this._timer.unref) this._timer.unref();
    this.running = true;
    return { started: true, intervalMs };
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.running = false;
    return { stopped: true };
  }

  // ── History and reporting ──────────────────────────────────────────────────

  getLastAudit() {
    return this.auditHistory[this.auditHistory.length - 1] || null;
  }

  getHistory(limit = 10) {
    return this.auditHistory.slice(-limit);
  }

  /**
   * Return a concise text summary of the last audit.
   */
  summarize() {
    const last = this.getLastAudit();
    if (!last) return 'No audit has been run yet. Call runAudit() first.';
    const { summary } = last;
    const lines = [
      `Audit ${last.auditId} — ${last.ranAt}`,
      `Severity: ${summary.severity.toUpperCase()}`,
      `Findings: ${summary.criticalCount} critical, ${summary.warnCount} warn, ${summary.passCount} OK`,
    ];
    for (const f of last.findings.filter(f => f.severity !== SEVERITY.OK)) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.message}`);
    }
    return lines.join('\n');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _loadComponent(name) {
    try {
      const mod = require(`~/server/services/CognitiveBehavior/${name}`);
      const getter = `get${name}`;
      if (typeof mod[getter] === 'function') return mod[getter]();
      if (typeof mod === 'function') return new mod();
      return mod;
    } catch { return null; }
  }

  getStats() {
    return {
      ...this.stats,
      running:    this.running,
      historyLen: this.auditHistory.length,
    };
  }
}

let _instance = null;
function getFinalAuditLoop() {
  if (!_instance) _instance = new FinalAuditLoop();
  return _instance;
}

module.exports = { FinalAuditLoop, getFinalAuditLoop, SEVERITY, THRESHOLDS };
