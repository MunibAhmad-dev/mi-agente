'use strict';

/**
 * VisualDiagnosisAgent — Face 9: Visual Intelligence pipeline.
 *
 * Receives a UnifiedVisualRepresentation (UVR) and produces:
 *   1. A structured diagnosis  — what's wrong and why
 *   2. Ranked repair proposals — concrete fixes ordered by impact/effort
 *   3. A re-evaluation verdict — pass|warn|fail
 *
 * This is the "Diagnosis → Repair" phase in the Face 9 spec:
 *   … → Unified Visual Representation → Visual Intelligence → Evaluation → Diagnosis → Repair
 */

const SEVERITIES = ['error', 'warning', 'info'];

const REPAIR_TEMPLATES = {
  // A11y violations
  a11y_violation: (v) => ({
    id: `repair:a11y:${v.id}`,
    category: 'accessibility',
    description: `Fix accessibility violation: ${v.description || v.id}`,
    effort: 'low',
    impact: 'high',
    rule: v.id,
  }),
  // DOM structural issues
  dom_issue: (i) => ({
    id: `repair:dom:${i.type}`,
    category: 'structure',
    description: `Resolve DOM issue: ${i.message || i.type} on <${i.element || 'element'}>`,
    effort: i.severity === 'error' ? 'medium' : 'low',
    impact: i.severity === 'error' ? 'high' : 'medium',
    type: i.type,
  }),
  // UI anti-patterns
  ui_antipattern: (ap) => ({
    id: `repair:ui:${ap.id || ap.name}`,
    category: 'ui',
    description: `Remove anti-pattern: ${ap.description || ap.name}`,
    effort: 'medium',
    impact: 'medium',
    antiPattern: ap,
  }),
};

const EFFORT_ORDER = { low: 0, medium: 1, high: 2 };
const IMPACT_ORDER = { high: 0, medium: 1, low: 2 };

class VisualDiagnosisAgent {
  /**
   * Diagnose a UnifiedVisualRepresentation and produce repair proposals.
   *
   * @param {object} uvr  — from UnifiedVisualRepresentation.build()
   * @returns {DiagnosisResult}
   */
  diagnose(uvr = {}) {
    const findings = [];
    const repairs = [];

    // ── Accessibility ─────────────────────────────────────────────────────────
    for (const v of (uvr.accessibility?.failed || [])) {
      findings.push({
        source: 'accessibility',
        severity: v.impact === 'critical' || v.impact === 'serious' ? 'error' : 'warning',
        id: v.id,
        message: v.description || `Accessibility violation: ${v.id}`,
        nodes: v.nodes,
      });
      repairs.push(REPAIR_TEMPLATES.a11y_violation(v));
    }

    // ── DOM issues ────────────────────────────────────────────────────────────
    for (const i of (uvr.structure?.issues || [])) {
      findings.push({
        source: 'dom',
        severity: SEVERITIES.includes(i.severity) ? i.severity : 'warning',
        id: `dom:${i.type}`,
        message: i.message || i.type,
        element: i.element,
      });
      if (i.severity === 'error' || i.severity === 'warning') {
        repairs.push(REPAIR_TEMPLATES.dom_issue(i));
      }
    }

    // ── UI anti-patterns ──────────────────────────────────────────────────────
    for (const ap of (uvr.ui?.antiPatterns || [])) {
      findings.push({
        source: 'ui',
        severity: 'warning',
        id: `ui:${ap.id || ap.name}`,
        message: ap.description || ap.name,
        antiPattern: ap,
      });
      repairs.push(REPAIR_TEMPLATES.ui_antipattern(ap));
    }

    // ── Text / OCR anomalies ──────────────────────────────────────────────────
    const ocrText = uvr.text?.raw || '';
    if (ocrText.length > 0 && ocrText.length < 20 && uvr.visual?.hasScreenshot) {
      findings.push({ source: 'ocr', severity: 'info', id: 'ocr:sparse_text', message: 'Page appears to have very little readable text (possible render issue or image-only content)' });
    }

    // ── Sort repairs: high-impact + low-effort first ──────────────────────────
    repairs.sort((a, b) => {
      const impactDiff = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
      if (impactDiff !== 0) return impactDiff;
      return EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort];
    });

    const errorCount   = findings.filter((f) => f.severity === 'error').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const verdict      = errorCount > 0 ? 'fail' : warningCount > 2 ? 'warn' : 'pass';
    const health       = uvr.health ?? null;

    return {
      verdict,
      health,
      errorCount,
      warningCount,
      infoCount: findings.filter((f) => f.severity === 'info').length,
      findings,
      repairs: repairs.slice(0, 20),
      summary: this._buildSummary(verdict, health, errorCount, warningCount, repairs.length),
      diagnosedAt: new Date().toISOString(),
    };
  }

  _buildSummary(verdict, health, errors, warnings, repairCount) {
    const healthStr = health != null ? ` (health: ${health}/100)` : '';
    if (verdict === 'fail') return `FAIL${healthStr}: ${errors} errors, ${warnings} warnings — ${repairCount} repairs proposed`;
    if (verdict === 'warn') return `WARN${healthStr}: ${warnings} warnings — ${repairCount} repairs proposed`;
    return `PASS${healthStr}: no critical issues found`;
  }
}

let _instance = null;
function getVisualDiagnosisAgent() {
  if (!_instance) _instance = new VisualDiagnosisAgent();
  return _instance;
}

module.exports = { VisualDiagnosisAgent, getVisualDiagnosisAgent };
