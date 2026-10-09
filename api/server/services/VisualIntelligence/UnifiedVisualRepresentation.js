'use strict';

/**
 * UnifiedVisualRepresentation — Face 9: Visual Intelligence pipeline.
 *
 * Combines multiple visual analysis sources into one canonical representation:
 *   DOM analysis + accessibility tree + UI pattern audit + screenshot metadata + OCR text
 *
 * This is the central "unified representation" layer described in the Face 9 spec:
 *   Browser → DOM → HTML → CSS → Screenshot → OCR → Computer Vision
 *                              ↓
 *                 UnifiedVisualRepresentation
 *                              ↓
 *                   VisualDiagnosisAgent
 */

class UnifiedVisualRepresentation {
  /**
   * Build a unified representation from partial analysis results.
   *
   * @param {object} sources
   *   - dom      {object}  from VisualIntelligenceEngine.analyzeDOM()
   *   - a11y     {object}  from VisualIntelligenceEngine.checkAccessibility()
   *   - ui       {object}  from VisualIntelligenceEngine.evaluateUI()
   *   - screenshot {object} { url, width, height, format, base64? }
   *   - ocr      {object}  { text, blocks? } — raw OCR output
   *   - qa       {object}  from VisualQAAgent
   * @returns {UVR}
   */
  build(sources = {}) {
    const { dom = {}, a11y = {}, ui = {}, screenshot = {}, ocr = {}, qa = {} } = sources;

    const uvr = {
      version: '1.0',
      createdAt: new Date().toISOString(),

      // ── Structure ───────────────────────────────────────────────────────────
      structure: {
        elementCount:   dom.stats?.totalElements || 0,
        depth:          dom.stats?.maxDepth || 0,
        issues:         (dom.issues || []).map((i) => ({ type: i.type, severity: i.severity, message: i.message, element: i.element })),
        score:          dom.score ?? null,
      },

      // ── Accessibility ───────────────────────────────────────────────────────
      accessibility: {
        passed:         a11y.passed || [],
        failed:         (a11y.failed || []).map((f) => ({ id: f.id, impact: f.impact, description: f.description, nodes: f.nodes })),
        score:          a11y.score ?? null,
        violations:     (a11y.failed || []).length,
      },

      // ── UI patterns ─────────────────────────────────────────────────────────
      ui: {
        patterns:       ui.patterns || [],
        antiPatterns:   ui.antiPatterns || [],
        score:          ui.score ?? null,
        recommendations: ui.recommendations || [],
      },

      // ── Visual / screenshot ─────────────────────────────────────────────────
      visual: {
        url:            screenshot.url || null,
        dimensions:     screenshot.width && screenshot.height ? { w: screenshot.width, h: screenshot.height } : null,
        format:         screenshot.format || null,
        hasScreenshot:  Boolean(screenshot.base64 || screenshot.path),
      },

      // ── OCR / text layer ────────────────────────────────────────────────────
      text: {
        raw:            ocr.text || '',
        blocks:         ocr.blocks || [],
        wordCount:      ocr.text ? ocr.text.split(/\s+/).filter(Boolean).length : 0,
      },

      // ── Visual QA ───────────────────────────────────────────────────────────
      qa: {
        answers:        qa.answers || [],
        report:         qa.report || null,
        passed:         qa.passed ?? null,
      },

      // ── Aggregated health ───────────────────────────────────────────────────
      health: null,
    };

    uvr.health = this._computeHealth(uvr);
    return uvr;
  }

  /**
   * Compute an overall health score 0-100 from available sub-scores.
   */
  _computeHealth(uvr) {
    const scores = [];
    if (uvr.structure.score != null) scores.push(uvr.structure.score);
    if (uvr.accessibility.score != null) scores.push(uvr.accessibility.score);
    if (uvr.ui.score != null) scores.push(uvr.ui.score);
    if (!scores.length) return null;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const issuesPenalty = Math.min(30, uvr.accessibility.violations * 5 + uvr.structure.issues.filter((i) => i.severity === 'error').length * 3);
    return Math.max(0, Math.round(avg - issuesPenalty));
  }

  /**
   * Summarize the UVR into a short human-readable report.
   */
  summarize(uvr) {
    const lines = [];
    lines.push(`[Visual State] Health: ${uvr.health ?? 'N/A'}/100`);
    if (uvr.structure.elementCount) lines.push(`  DOM: ${uvr.structure.elementCount} elements, ${uvr.structure.issues.length} issues`);
    if (uvr.accessibility.violations) lines.push(`  A11y: ${uvr.accessibility.violations} violations`);
    if (uvr.ui.antiPatterns.length) lines.push(`  UI: ${uvr.ui.antiPatterns.length} anti-patterns`);
    if (uvr.text.raw) lines.push(`  OCR: "${uvr.text.raw.slice(0, 80).replace(/\n/g, ' ')}${uvr.text.raw.length > 80 ? '…' : ''}"`);
    return lines.join('\n');
  }
}

let _instance = null;
function getUnifiedVisualRepresentation() {
  if (!_instance) _instance = new UnifiedVisualRepresentation();
  return _instance;
}

module.exports = { UnifiedVisualRepresentation, getUnifiedVisualRepresentation };
