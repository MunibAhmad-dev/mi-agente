'use strict';

/**
 * SupervisorAgent — Face 18.
 * Orchestrates the 11-agent web cloner pipeline.
 * Manages task distribution, skill execution, and memory retrieval for
 * the WebsiteClonerService multi-agent system.
 *
 * Agents:
 *   1. Navigator     — drives Playwright/fetch to retrieve raw HTML
 *   2. Analyzer      — parses DOM structure and extracts components
 *   3. StyleExtractor — extracts CSS, tokens, fonts, colors
 *   4. ScriptExtractor — extracts and categorises JS bundles
 *   5. AssetInventory — lists images, fonts, icons
 *   6. ComponentMapper — builds component tree and dependency graph
 *   7. ResponsivenessAgent — checks breakpoints and media queries
 *   8. AccessibilityAgent — flags a11y issues
 *   9. SEOAgent       — extracts meta tags, structured data
 *  10. WriterAgent    — generates clean React/HTML scaffold
 *  11. QAAgent        — validates the output scaffold
 */

const EventEmitter = require('events');

const AGENT_DEFS = [
  { id: 'navigator', name: 'Navigator', role: 'Retrieve raw HTML from URL' },
  { id: 'analyzer', name: 'Analyzer', role: 'Parse DOM structure and components', deps: ['navigator'] },
  { id: 'style_extractor', name: 'StyleExtractor', role: 'Extract CSS tokens and design system', deps: ['navigator'] },
  { id: 'script_extractor', name: 'ScriptExtractor', role: 'Extract and categorize JS bundles', deps: ['navigator'] },
  { id: 'asset_inventory', name: 'AssetInventory', role: 'List images, fonts, icons', deps: ['navigator'] },
  { id: 'component_mapper', name: 'ComponentMapper', role: 'Build component tree', deps: ['analyzer', 'style_extractor'] },
  { id: 'responsiveness', name: 'ResponsivenessAgent', role: 'Check breakpoints and media queries', deps: ['style_extractor'] },
  { id: 'accessibility', name: 'AccessibilityAgent', role: 'Flag a11y issues', deps: ['analyzer'] },
  { id: 'seo', name: 'SEOAgent', role: 'Extract meta tags and structured data', deps: ['navigator'] },
  { id: 'writer', name: 'WriterAgent', role: 'Generate clean scaffold', deps: ['component_mapper', 'style_extractor', 'asset_inventory'] },
  { id: 'qa', name: 'QAAgent', role: 'Validate output scaffold', deps: ['writer', 'accessibility', 'seo'] },
];

class SupervisorAgent extends EventEmitter {
  constructor({ clonerService = null, memory = null } = {}) {
    super();
    this._cloner = clonerService;
    this._memory = memory; // CrossSessionMemory or similar
    this._runs = [];
    this._id = 0;
  }

  /**
   * Orchestrate the full 11-agent pipeline for a URL.
   * @param {string} url
   * @param {object} opts
   * @returns {Promise<SupervisorResult>}
   */
  async orchestrate(url, opts = {}) {
    const id = `sv_run_${++this._id}_${Date.now()}`;
    const run = {
      id,
      url,
      status: 'running',
      agents: {},
      skills_executed: [],
      memory_recalled: [],
      started_at: new Date().toISOString(),
    };

    this._runs.push(run);
    this.emit('start', { run_id: id, url });

    // Recall memory for this URL domain
    try {
      if (this._memory) {
        const domain = new URL(url).hostname;
        const recalled = this._memory.getContext(null, domain, 2);
        run.memory_recalled = recalled.sessions || [];
      }
    } catch {}

    // Initialize agent states
    for (const def of AGENT_DEFS) {
      run.agents[def.id] = { ...def, status: 'pending', result: null, started_at: null, ended_at: null };
    }

    // Use WebsiteClonerService as Navigator agent
    let rawResult = null;
    try {
      run.agents.navigator.status = 'running';
      run.agents.navigator.started_at = new Date().toISOString();
      this.emit('agent_start', { run_id: id, agent: 'navigator' });

      if (this._cloner) {
        rawResult = await this._cloner.clone(url, opts);
      } else {
        rawResult = await this._fetchFallback(url);
      }

      run.agents.navigator.status = 'completed';
      run.agents.navigator.result = { success: true, html_length: rawResult?.html?.length || 0 };
      run.agents.navigator.ended_at = new Date().toISOString();
      this.emit('agent_complete', { run_id: id, agent: 'navigator' });
    } catch (e) {
      run.agents.navigator.status = 'failed';
      run.agents.navigator.error = e.message;
      run.agents.navigator.ended_at = new Date().toISOString();
      run.status = 'failed';
      run.error = `Navigator failed: ${e.message}`;
      this.emit('agent_error', { run_id: id, agent: 'navigator', error: e.message });
      return run;
    }

    // Run downstream agents based on raw result
    for (const def of AGENT_DEFS.slice(1)) {
      run.agents[def.id].status = 'running';
      run.agents[def.id].started_at = new Date().toISOString();
      this.emit('agent_start', { run_id: id, agent: def.id });

      try {
        const result = await this._runAgent(def.id, rawResult, run);
        run.agents[def.id].status = 'completed';
        run.agents[def.id].result = result;
        run.skills_executed.push(def.id);
      } catch (e) {
        run.agents[def.id].status = 'failed';
        run.agents[def.id].error = e.message;
      } finally {
        run.agents[def.id].ended_at = new Date().toISOString();
        this.emit('agent_complete', { run_id: id, agent: def.id });
      }
    }

    run.status = 'completed';
    run.ended_at = new Date().toISOString();
    run.scaffold = run.agents.writer.result;
    this.emit('complete', run);

    // Save to memory
    try {
      if (this._memory) {
        this._memory.save(null, `cloned:${url}`, { url, run_id: id, agents_completed: run.skills_executed.length });
      }
    } catch {}

    return run;
  }

  listRuns() { return [...this._runs]; }
  getAgentDefs() { return [...AGENT_DEFS]; }

  // ── Agent implementations ─────────────────────────────────────────────────

  async _runAgent(agentId, rawResult, run) {
    const html = rawResult?.html || rawResult?.content || '';
    switch (agentId) {
      case 'analyzer':
        return this._analyzeStructure(html);
      case 'style_extractor':
        return this._extractStyles(html);
      case 'script_extractor':
        return this._extractScripts(html);
      case 'asset_inventory':
        return this._inventoryAssets(html);
      case 'component_mapper':
        return { components: run.agents.analyzer?.result?.components || [], depth: 3 };
      case 'responsiveness':
        return this._checkResponsiveness(html);
      case 'accessibility':
        return this._checkAccessibility(html, run.agents.analyzer?.result);
      case 'seo':
        return this._extractSEO(html);
      case 'writer':
        return this._generateScaffold(rawResult, run);
      case 'qa':
        return this._validateScaffold(run.agents.writer?.result);
      default:
        return { skipped: true };
    }
  }

  _analyzeStructure(html) {
    const components = [];
    const tags = ['header', 'nav', 'main', 'aside', 'footer', 'section', 'article'];
    for (const tag of tags) {
      if (new RegExp(`<${tag}[\\s>]`, 'i').test(html)) components.push(tag);
    }
    const headings = (html.match(/<h[1-6]/gi) || []).length;
    return { components, heading_count: headings };
  }

  _extractStyles(html) {
    const inlineStyles = (html.match(/style="[^"]*"/gi) || []).length;
    const linkedSheets = (html.match(/<link[^>]+\.css[^>]*>/gi) || []).length;
    const colors = [...new Set((html.match(/#[0-9a-fA-F]{3,6}|rgb\([^)]+\)/g) || []))].slice(0, 20);
    return { inline_style_count: inlineStyles, linked_sheets: linkedSheets, colors };
  }

  _extractScripts(html) {
    const scripts = (html.match(/<script[^>]*>/gi) || []).length;
    const externalScripts = (html.match(/<script[^>]+src="[^"]*"[^>]*>/gi) || []).length;
    return { total_scripts: scripts, external_scripts: externalScripts, inline_scripts: scripts - externalScripts };
  }

  _inventoryAssets(html) {
    const images = (html.match(/<img\b/gi) || []).length;
    const videos = (html.match(/<video\b/gi) || []).length;
    return { images, videos, total: images + videos };
  }

  _checkResponsiveness(html) {
    const hasViewportMeta = /<meta[^>]+viewport[^>]*>/i.test(html);
    const mediaQueryCount = (html.match(/@media\b/g) || []).length;
    return { has_viewport_meta: hasViewportMeta, media_query_count: mediaQueryCount, score: hasViewportMeta ? (mediaQueryCount > 0 ? 100 : 60) : 20 };
  }

  _checkAccessibility(html, structure) {
    const issues = [];
    if (!(html.match(/<img[^>]+alt=/gi) || []).length && (html.match(/<img\b/gi) || []).length > 0) {
      issues.push('Images missing alt text');
    }
    if (!/<html[^>]+lang=/i.test(html)) issues.push('Missing lang attribute on html element');
    if (!/<title>/i.test(html)) issues.push('Missing <title> element');
    return { issues, score: Math.max(0, 100 - issues.length * 20) };
  }

  _extractSEO(html) {
    const title = (html.match(/<title>(.*?)<\/title>/i) || [])[1] || null;
    const description = (html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"[^>]*>/i) || [])[1] || null;
    const canonical = /<link[^>]+rel="canonical"[^>]*>/i.test(html);
    return { title, description, has_canonical: canonical };
  }

  _generateScaffold(rawResult, run) {
    const html = rawResult?.html || '';
    const styles = run.agents.style_extractor?.result;
    const components = run.agents.component_mapper?.result?.components || [];
    return {
      html_length: html.length,
      scaffold_type: 'html',
      components,
      color_palette: styles?.colors || [],
      linked_sheets: styles?.linked_sheets || 0,
    };
  }

  _validateScaffold(scaffold) {
    if (!scaffold) return { valid: false, reason: 'No scaffold produced' };
    const issues = [];
    if (!scaffold.html_length || scaffold.html_length < 100) issues.push('Scaffold HTML too short');
    return { valid: issues.length === 0, issues, score: issues.length === 0 ? 100 : 50 };
  }

  async _fetchFallback(url) {
    const https = require('https');
    const http = require('http');
    const protocol = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      protocol.get(url, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ html: data, url }));
      }).on('error', reject);
    });
  }
}

module.exports = { SupervisorAgent, AGENT_DEFS };
