'use strict';

/**
 * WebClonerSupervisor — Face 18: orchestrate specialized agents in a full-analysis pipeline.
 *
 * Pipeline:
 *   1. Fetch HTML from URL (or accept provided HTML)
 *   2. AutoRepairAgent  — detect + fix clone issues
 *   3. DesignForensicsAgent — extract design tokens + DNA
 *   4. VisualQAAgent    — HTML risk assessment
 *   5. Merge results into a comprehensive report
 *
 * Usage:
 *   const supervisor = getWebClonerSupervisor();
 *   const report = await supervisor.fullAnalysis({ url, html, baseUrl });
 */

const { getAutoRepairAgent } = require('./agents/AutoRepairAgent');
const { getDesignForensicsAgent } = require('./agents/DesignForensicsAgent');
const { getVisualQAAgent } = require('./agents/VisualQAAgent');

const FETCH_TIMEOUT_MS = 15000;

async function fetchHTML(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mi-agente/1.0)' },
    });
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

class WebClonerSupervisor {
  constructor() {
    this.stats = { analyses: 0, errors: 0 };
  }

  /**
   * Run the full multi-agent analysis pipeline on a URL or HTML string.
   * @param {{ url?: string, html?: string, baseUrl?: string }} opts
   * @returns {Promise<{ url, htmlLength, repair, forensics, visualQA, summary, score }>}
   */
  async fullAnalysis(opts = {}) {
    this.stats.analyses++;
    const { url, baseUrl } = opts;
    let html = opts.html || '';

    // Step 1: fetch HTML if URL provided and no HTML given
    if (!html && url) {
      try {
        html = await fetchHTML(url);
      } catch (err) {
        this.stats.errors++;
        return { url, error: `Fetch failed: ${err.message}`, score: 0 };
      }
    }

    if (!html) return { url, error: 'No HTML provided or fetched', score: 0 };

    const resolvedBaseUrl = baseUrl || url || '';

    // Step 2: AutoRepair — detect and fix issues
    let repair = { repairedHtml: html, repairs: [], score: 100, issuesFixed: 0 };
    try {
      const ra = getAutoRepairAgent();
      repair = ra.repair(html, { baseUrl: resolvedBaseUrl });
    } catch (err) {
      repair.error = err.message;
    }

    // Step 3: DesignForensics — extract design tokens from repaired HTML
    let forensics = {};
    let forensicsSummary = '';
    try {
      const dfa = getDesignForensicsAgent();
      forensics = dfa.analyze(repair.repairedHtml || html);
      forensicsSummary = dfa.summarize(forensics);
    } catch (err) {
      forensics = { error: err.message };
    }

    // Step 4: VisualQA — HTML risk assessment
    let visualQA = { riskLevel: 'unknown', issues: [], score: 100 };
    try {
      const qa = getVisualQAAgent();
      visualQA = qa.analyzeHTML(html);
    } catch (err) {
      visualQA = { riskLevel: 'unknown', issues: [], score: 100, error: err.message };
    }

    // Step 5: Composite score
    const repairScore = typeof repair.score === 'number' ? repair.score : 100;
    const visualScore = typeof visualQA.score === 'number' ? visualQA.score : 100;
    const compositeScore = Math.round((repairScore + visualScore) / 2);

    const summary = [
      `${repair.issuesFixed} repair(s) applied`,
      `Design: ${forensicsSummary}`,
      `Visual risk: ${visualQA.riskLevel}`,
    ].filter(Boolean).join(' | ');

    return {
      url: url || null,
      htmlLength: html.length,
      repair: { repairs: repair.repairs, issuesFixed: repair.issuesFixed, score: repairScore },
      forensics: { designDNA: forensics.designDNA, colorCount: forensics.colors?.length || 0, summary: forensicsSummary },
      visualQA: { riskLevel: visualQA.riskLevel, issueCount: visualQA.issues?.length || 0, issues: visualQA.issues },
      summary,
      score: compositeScore,
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getWebClonerSupervisor() {
  if (!_instance) _instance = new WebClonerSupervisor();
  return _instance;
}

module.exports = { WebClonerSupervisor, getWebClonerSupervisor };
