'use strict';

/**
 * VisualIntelligenceEngine — Face 9: Visual Intelligence & Visual Software Engineering.
 *
 * Capabilities (degrades gracefully when optional tools are absent):
 *   - Screenshot capture  (requires playwright or puppeteer)
 *   - DOM / HTML analysis (pure JS, always available)
 *   - Accessibility audit (pure JS, always available)
 *   - UI pattern evaluation (pure JS, always available)
 *   - Visual regression    (requires sharp)
 *   - Playwright page inspection (requires playwright)
 */

const crypto = require('crypto');

class VisualIntelligenceEngine {
  constructor(config = {}) {
    this.config = config;
    this._playwright = null;
    this._puppeteer = null;
    this._sharp = null;
    this._detected = false;
  }

  // ── Capability detection ──────────────────────────────────────────────────

  _detect() {
    if (this._detected) return;
    this._detected = true;

    try { this._playwright = require('playwright'); } catch { /* not installed */ }
    try { this._puppeteer = require('puppeteer'); } catch { /* not installed */ }
    try { this._sharp = require('sharp'); } catch { /* not installed */ }
  }

  getStatus() {
    this._detect();
    return {
      playwright: !!this._playwright,
      puppeteer: !!this._puppeteer,
      sharp: !!this._sharp,
      capabilities: {
        screenshot: !!(this._playwright || this._puppeteer),
        domAnalysis: true,
        accessibility: true,
        uiEvaluation: true,
        visualRegression: !!this._sharp,
        playwrightInspection: !!this._playwright,
      },
      note: (!this._playwright && !this._puppeteer)
        ? 'Install playwright (`npm install playwright`) to enable screenshot & page inspection.'
        : null,
    };
  }

  // ── DOM Analysis ─────────────────────────────────────────────────────────

  /**
   * analyzeDOM(html) — parse raw HTML and report structural issues.
   * Uses regex-based heuristics (no external deps needed).
   */
  analyzeDOM(html) {
    if (!html || typeof html !== 'string') {
      return { issues: [], stats: {}, score: 0, error: 'No HTML provided' };
    }

    const issues = [];
    const stats = {};

    // ── Images ──
    const imgTags = html.match(/<img\b[^>]*>/gi) || [];
    const imgWithoutAlt = imgTags.filter(t => !/\balt\s*=/i.test(t));
    stats.images = imgTags.length;
    stats.imagesMissingAlt = imgWithoutAlt.length;
    if (imgWithoutAlt.length > 0) {
      issues.push({
        type: 'accessibility',
        severity: 'error',
        rule: 'img-alt',
        message: `${imgWithoutAlt.length} of ${imgTags.length} images are missing alt text`,
        wcag: 'WCAG 1.1.1',
      });
    }

    // ── Links ──
    const linkTags = html.match(/<a\b[^>]*>/gi) || [];
    const emptyLinks = linkTags.filter(t => !/href\s*=\s*["'][^"']+["']/i.test(t));
    stats.links = linkTags.length;
    stats.emptyLinks = emptyLinks.length;
    if (emptyLinks.length > 0) {
      issues.push({
        type: 'accessibility',
        severity: 'warning',
        rule: 'link-href',
        message: `${emptyLinks.length} links have no valid href`,
        wcag: 'WCAG 2.4.4',
      });
    }

    // ── Headings hierarchy ──
    const h1 = (html.match(/<h1\b/gi) || []).length;
    const h2 = (html.match(/<h2\b/gi) || []).length;
    stats.h1Count = h1;
    stats.h2Count = h2;
    if (h1 === 0) {
      issues.push({ type: 'structure', severity: 'warning', rule: 'heading-order', message: 'Page has no <h1> heading', wcag: 'WCAG 2.4.6' });
    }
    if (h1 > 1) {
      issues.push({ type: 'structure', severity: 'warning', rule: 'single-h1', message: `Multiple <h1> tags found (${h1})` });
    }

    // ── Form labels ──
    const inputTags = html.match(/<input\b[^>]*>/gi) || [];
    const inputsWithoutId = inputTags.filter(t => !/\bid\s*=/i.test(t));
    stats.inputs = inputTags.length;
    if (inputsWithoutId.length > 0) {
      issues.push({
        type: 'accessibility',
        severity: 'warning',
        rule: 'input-label',
        message: `${inputsWithoutId.length} inputs may be missing associated labels`,
        wcag: 'WCAG 1.3.1',
      });
    }

    // ── Inline styles (possible maintainability issue) ──
    const inlineStyles = (html.match(/\bstyle\s*=/gi) || []).length;
    stats.inlineStyles = inlineStyles;
    if (inlineStyles > 20) {
      issues.push({ type: 'maintainability', severity: 'info', rule: 'inline-style', message: `High use of inline styles (${inlineStyles} occurrences)` });
    }

    // ── Language attribute ──
    if (!/<html[^>]+lang\s*=/i.test(html)) {
      issues.push({ type: 'accessibility', severity: 'warning', rule: 'html-lang', message: '<html> element is missing a lang attribute', wcag: 'WCAG 3.1.1' });
    }

    // ── Meta viewport ──
    if (!/<meta[^>]+viewport/i.test(html)) {
      issues.push({ type: 'responsive', severity: 'warning', rule: 'meta-viewport', message: 'No viewport meta tag found — may not render well on mobile' });
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warnCount = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, 100 - errorCount * 20 - warnCount * 5);

    return { issues, stats, score, issueCount: issues.length };
  }

  // ── Accessibility Audit ───────────────────────────────────────────────────

  checkAccessibility(html) {
    if (!html || typeof html !== 'string') {
      return { passed: [], failed: [], score: 0, error: 'No HTML provided' };
    }

    const passed = [];
    const failed = [];

    const check = (id, description, wcag, passes) => {
      (passes ? passed : failed).push({ id, description, wcag });
    };

    check('img-alt', 'Images have alt text', 'WCAG 1.1.1',
      !(html.match(/<img\b[^>]*>/gi) || []).some(t => !/\balt\s*=/i.test(t)));

    check('html-lang', 'HTML element has lang attribute', 'WCAG 3.1.1',
      /<html[^>]+lang\s*=/i.test(html));

    check('meta-viewport', 'Viewport meta tag present', 'Best Practice',
      /<meta[^>]+viewport/i.test(html));

    check('heading-exists', 'Page has at least one heading', 'WCAG 2.4.6',
      /<h[1-6]\b/i.test(html));

    check('buttons-labeled', 'Buttons have text or aria-label', 'WCAG 4.1.2',
      !(html.match(/<button\b[^>]*>\s*<\/button>/gi) || []).length);

    check('skip-link', 'Skip navigation link present', 'WCAG 2.4.1',
      /skip.*nav|skip.*content/i.test(html));

    const score = Math.round((passed.length / (passed.length + failed.length)) * 100) || 0;
    return { passed, failed, score, summary: `${passed.length} passed, ${failed.length} failed` };
  }

  // ── UI Pattern Evaluation ─────────────────────────────────────────────────

  evaluateUI(html) {
    if (!html || typeof html !== 'string') {
      return { patterns: [], antiPatterns: [], score: 100, error: 'No HTML provided' };
    }

    const patterns = [];
    const antiPatterns = [];

    // Positive patterns
    if (/<nav\b/i.test(html)) patterns.push({ name: 'semantic-nav', description: 'Uses <nav> for navigation' });
    if (/<main\b/i.test(html)) patterns.push({ name: 'semantic-main', description: 'Uses <main> for main content' });
    if (/<footer\b/i.test(html)) patterns.push({ name: 'semantic-footer', description: 'Uses <footer> element' });
    if (/<header\b/i.test(html)) patterns.push({ name: 'semantic-header', description: 'Uses <header> element' });
    if (/<article\b/i.test(html)) patterns.push({ name: 'semantic-article', description: 'Uses <article> for content' });
    if (/<figure\b/i.test(html)) patterns.push({ name: 'semantic-figure', description: 'Uses <figure>/<figcaption>' });
    if (/role\s*=\s*["']dialog["']/i.test(html)) patterns.push({ name: 'aria-dialog', description: 'ARIA dialog role present' });
    if (/aria-live/i.test(html)) patterns.push({ name: 'aria-live', description: 'Live regions declared for dynamic content' });

    // Anti-patterns
    if (/<table\b[^>]*>\s*<tr\b/i.test(html) && !/<thead\b/i.test(html)) {
      antiPatterns.push({ name: 'table-no-thead', description: 'Table missing <thead> header row', severity: 'warning' });
    }
    const divSoupCount = (html.match(/<div\b/gi) || []).length;
    const semanticCount = (html.match(/<(nav|main|header|footer|article|section|aside)\b/gi) || []).length;
    if (divSoupCount > 30 && semanticCount < 3) {
      antiPatterns.push({ name: 'div-soup', description: `Heavy div usage (${divSoupCount} divs, only ${semanticCount} semantic elements)`, severity: 'warning' });
    }
    if (/onclick\s*=/i.test(html)) {
      antiPatterns.push({ name: 'inline-handler', description: 'Inline onclick handlers detected — prefer addEventListener', severity: 'info' });
    }
    if (/<blink\b|<marquee\b/i.test(html)) {
      antiPatterns.push({ name: 'deprecated-element', description: 'Deprecated <blink> or <marquee> element', severity: 'error' });
    }

    const score = Math.max(0, 100 - antiPatterns.filter(a => a.severity === 'error').length * 25 - antiPatterns.filter(a => a.severity === 'warning').length * 10);
    return { patterns, antiPatterns, score };
  }

  // ── Screenshot (requires playwright or puppeteer) ─────────────────────────

  async takeScreenshot(url, options = {}) {
    this._detect();
    const { width = 1280, height = 800, format = 'png', fullPage = false } = options;

    if (this._playwright) {
      let browser;
      try {
        const { chromium } = this._playwright;
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setViewportSize({ width, height });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        const buffer = await page.screenshot({ type: format, fullPage });
        const html = await page.content();
        return {
          success: true,
          format,
          data: buffer.toString('base64'),
          size: buffer.length,
          url,
          html: html.substring(0, 50000),
        };
      } catch (e) {
        return { success: false, error: e.message, url };
      } finally {
        if (browser) await browser.close().catch(() => {});
      }
    }

    if (this._puppeteer) {
      let browser;
      try {
        browser = await this._puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width, height });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const buffer = await page.screenshot({ type: format, fullPage });
        const html = await page.content();
        return {
          success: true,
          format,
          data: buffer.toString('base64'),
          size: buffer.length,
          url,
          html: html.substring(0, 50000),
        };
      } catch (e) {
        return { success: false, error: e.message, url };
      } finally {
        if (browser) await browser.close().catch(() => {});
      }
    }

    return {
      success: false,
      url,
      error: 'No browser automation tool available. Run: npm install playwright && npx playwright install chromium',
    };
  }

  // ── Full Page Audit ───────────────────────────────────────────────────────

  /**
   * auditPage(url) — screenshot + DOM + accessibility + UI evaluation in one call.
   * When browser tools are unavailable, skips the screenshot step.
   */
  async auditPage(url, options = {}) {
    const id = crypto.randomBytes(4).toString('hex');
    const results = { id, url, timestamp: Date.now() };

    // Screenshot + HTML capture
    if (options.screenshot !== false) {
      const shot = await this.takeScreenshot(url, options);
      results.screenshot = shot;
      if (shot.html) {
        results.dom = this.analyzeDOM(shot.html);
        results.accessibility = this.checkAccessibility(shot.html);
        results.ui = this.evaluateUI(shot.html);
      }
    }

    // Compute overall score
    const scores = [
      results.dom?.score,
      results.accessibility?.score,
      results.ui?.score,
    ].filter(s => s !== undefined);
    results.overallScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    return results;
  }

  // ── HTML-only Audit (no browser needed) ──────────────────────────────────

  auditHTML(html) {
    const id = crypto.randomBytes(4).toString('hex');
    const dom = this.analyzeDOM(html);
    const accessibility = this.checkAccessibility(html);
    const ui = this.evaluateUI(html);
    const scores = [dom.score, accessibility.score, ui.score];
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { id, timestamp: Date.now(), dom, accessibility, ui, overallScore };
  }
}

module.exports = { VisualIntelligenceEngine };
