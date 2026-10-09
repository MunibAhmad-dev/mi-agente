'use strict';

const { DiscoveryEngine } = require('./discovery/DiscoveryEngine');
const { SecurityEngine } = require('./security/SecurityEngine');
const { EvaluationEngine } = require('./evaluation/EvaluationEngine');
const { CapabilityRegistry } = require('./registry/CapabilityRegistry');
const { InstallationEngine } = require('./installation/InstallationEngine');
const { createCapability } = require('./DataModel');

/**
 * CapabilityManager - Universal Agent Capability System.
 * Orchestrates: Discovery → Security → Evaluation → Registry → Installation → Agent Integration.
 */
class CapabilityManager {
  constructor(config = {}) {
    this.config = config;
    this.discovery = new DiscoveryEngine(config);
    this.security = new SecurityEngine(config);
    this.evaluation = new EvaluationEngine(config);
    this.registry = new CapabilityRegistry(config);
    this.installer = new InstallationEngine(config);
    this.stats = { totalProcessed: 0, queries: 0 };
  }

  /**
   * Run full discovery pipeline.
   */
  async runDiscovery() {
    console.log('[CapabilityManager] Starting discovery...');
    const raw = await this.discovery.discoverAll();
    console.log(`[CapabilityManager] Discovered ${raw.length} capabilities`);

    // Process each through security + evaluation
    const processed = [];
    for (const cap of raw) {
      const result = await this.processCapability(cap);
      if (result) processed.push(result);
    }

    // Register all
    const count = this.registry.registerBatch(processed);
    console.log(`[CapabilityManager] Registered ${count} capabilities`);

    // Save to disk
    this.registry.save();

    return processed;
  }

  /**
   * Process a single capability through security + evaluation.
   */
  async processCapability(capability) {
    this.stats.totalProcessed++;

    // Security scan (without file contents for now)
    const securityResult = this.security.scan(capability, {});
    capability.security = securityResult;

    // Evaluate
    const evalResult = this.evaluation.evaluate(capability);
    capability.evaluation = {
      quality: evalResult.quality || capability.evaluation.quality,
      compatibility: evalResult.compatibility || capability.evaluation.compatibility,
      tokenEfficiency: evalResult.tokenEfficiency || capability.evaluation.tokenEfficiency,
      latency: evalResult.latency || capability.evaluation.latency,
      lastBenchmark: evalResult.lastBenchmark || capability.evaluation.lastBenchmark,
      tier: evalResult.tier || capability.evaluation.tier,
      overallScore: evalResult.overallScore || capability.evaluation.overallScore,
    };
    // Merge security into capability.security (keep existing fields)
    if (evalResult.security) {
      capability.security = { ...capability.security, ...evalResult.security };
    }

    // Auto-categorize
    if (capability.categories.length === 0) {
      capability.categories = this._autoCategorize(capability);
    }

    // Auto-tag
    if (capability.tags.length === 0) {
      capability.tags = this._autoTag(capability);
    }

    // Set status
    capability.status = 'analyzed';
    capability.timestamps.analyzed = new Date().toISOString();

    return capability;
  }

  /**
   * Search capabilities.
   */
  search(query, options = {}) {
    this.stats.queries++;
    return this.registry.search(query, options);
  }

  /**
   * Find capabilities for a specific task.
   */
  async findForTask(taskDescription) {
    // Extract keywords from task
    const keywords = this._extractKeywords(taskDescription);
    const results = [];

    for (const keyword of keywords) {
      const searchResults = this.registry.search(keyword);
      results.push(...searchResults.results);
    }

    // Dedup
    const seen = new Set();
    const unique = results.filter(cap => {
      if (seen.has(cap.id)) return false;
      seen.add(cap.id);
      return true;
    });

    // Rank by score
    unique.sort((a, b) => (b.evaluation.overallScore || 0) - (a.evaluation.overallScore || 0));

    return unique.slice(0, 10);
  }

  /**
   * Install a capability by ID.
   */
  async installCapability(id) {
    const cap = this.registry.get(id);
    if (!cap) return { success: false, error: 'Capability not found' };

    return this.installer.install(cap);
  }

  /**
   * Uninstall a capability by ID.
   */
  async uninstallCapability(id) {
    return this.installer.uninstall(id);
  }

  /**
   * Compare two capabilities.
   */
  compare(idA, idB) {
    const capA = this.registry.get(idA);
    const capB = this.registry.get(idB);
    if (!capA || !capB) return null;
    return this.evaluation.compare(capA, capB);
  }

  /**
   * Get top capabilities.
   */
  getTop(n = 10) {
    return this.registry.getTop(n);
  }

  /**
   * Get statistics.
   */
  getStatistics() {
    return {
      registry: this.registry.getStatistics(),
      discovery: this.discovery.getStats(),
      security: this.security.getStats(),
      evaluation: this.evaluation.getStats(),
      installer: this.installer.getStats(),
      stats: this.stats,
    };
  }

  /**
   * Get recommendations for a task.
   */
  recommend(task, options = {}) {
    const candidates = this.registry.search(null, {
      type: options.type,
      platform: options.platform,
    }).results;

    return candidates
      .filter(cap => {
        if (options.minSecurity && cap.security.score < options.minSecurity) return false;
        if (options.minQuality && (cap.evaluation.overallScore || 0) < options.minQuality) return false;
        if (options.license) return cap.license === options.license;
        return true;
      })
      .slice(0, options.limit || 5);
  }

  _extractKeywords(text) {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'for', 'to', 'of', 'in', 'and', 'or', 'need', 'want', 'find', 'search', 'look', 'una', 'el', 'las', 'los', 'para', 'que', 'como', 'necesito', 'buscar']);
    return String(text).toLowerCase()
      .replace(/[^a-záéíóúñü0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  }

  _autoCategorize(cap) {
    const text = `${cap.name} ${cap.description} ${cap.tags.join(' ')}`.toLowerCase();
    const categories = [];
    const checks = {
      coding: /\b(code|code|program|develop|debug|fix|function|class|api|sdk)\b/i,
      security: /\b(security|vulnerab|audit|scanning|pentest|auth)\b/i,
      testing: /\b(test|qa|assert|verify|check|lint|format)\b/i,
      research: /\b(research|search|find|discover|analyze|scrape)\b/i,
      browser: /\b(browser|web|scrape|crawl|selenium|puppeteer)\b/i,
      automation: /\b(automat|workflow|pipeline|cron|schedule)\b/i,
      database: /\b(datab|sql|mongo|postgres|redis|cache)\b/i,
      devops: /\b(devops|docker|k8s|deploy|ci\/cd|infra)\b/i,
      ai_ml: /\b(ai|ml|llm|model|train|inference|embedding)\b/i,
      documentation: /\b(doc|readme|wiki|markdown|report)\b/i,
      mcp: /\b(mcp|model.context.protocol|server|tool)\b/i,
      agent: /\b(agent|autonom|orchestrat|multi.agent)\b/i,
    };

    for (const [cat, pattern] of Object.entries(checks)) {
      if (pattern.test(text)) categories.push(cat);
    }

    return categories.length > 0 ? categories : ['other'];
  }

  _autoTag(cap) {
    const text = `${cap.name} ${cap.description}`.toLowerCase();
    const tags = [];

    // Language detection
    if (/\b(python|pip|django|flask)\b/i.test(text)) tags.push('python');
    if (/\b(typescript|javascript|node|npm|react|vue|angular)\b/i.test(text)) tags.push('javascript');
    if (/\b(rust|cargo)\b/i.test(text)) tags.push('rust');
    if (/\b(golang|go)\b/i.test(text)) tags.push('go');

    // Framework detection
    if (/\b(react|vue|angular|svelte)\b/i.test(text)) tags.push('frontend');
    if (/\b(express|fastify|koa|hono)\b/i.test(text)) tags.push('backend');
    if (/\b(docker|k8s|kubernetes)\b/i.test(text)) tags.push('container');
    if (/\b(github|gitlab|bitbucket)\b/i.test(text)) tags.push('git');

    // Platform detection
    for (const p of cap.platforms) {
      tags.push(p);
    }

    return [...new Set(tags)];
  }
}

module.exports = { CapabilityManager };
