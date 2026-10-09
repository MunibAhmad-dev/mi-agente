'use strict';

const { GitHubDiscovery } = require('./GitHubDiscovery');
const { HuggingFaceDiscovery } = require('./HuggingFaceDiscovery');
const { MarketplaceDiscovery } = require('./MarketplaceDiscovery');
const { createCapability } = require('../DataModel');

/**
 * DiscoveryEngine - Orchestrates capability discovery from all sources.
 * Runs continuously, discovers new resources, normalizes them.
 */
class DiscoveryEngine {
  constructor(config = {}) {
    this.config = config;
    this.github = new GitHubDiscovery(config);
    this.huggingface = new HuggingFaceDiscovery(config);
    this.marketplace = new MarketplaceDiscovery(config);
    this.discovered = new Map(); // url -> capability
    this.stats = { totalDiscovered: 0, runs: 0, lastRun: null };
  }

  /**
   * Run full discovery across all sources.
   */
  async discoverAll() {
    this.stats.runs++;
    this.stats.lastRun = new Date().toISOString();
    const allResults = [];

    // 1. GitHub Discovery
    try {
      const githubResults = await this.github.discoverAll();
      allResults.push(...githubResults);
    } catch (e) {
      console.warn('[Discovery] GitHub error:', e.message);
    }

    // 2. HuggingFace Discovery
    try {
      const hfResults = await this.huggingface.discoverAll();
      allResults.push(...hfResults);
    } catch (e) {
      console.warn('[Discovery] HuggingFace error:', e.message);
    }

    // 3. Marketplace Discovery
    try {
      const mpResults = await this.marketplace.discoverAll();
      allResults.push(...mpResults);
    } catch (e) {
      console.warn('[Discovery] Marketplace error:', e.message);
    }

    // Normalize all results
    const normalized = allResults.map(raw => createCapability(raw, raw.source));

    // Dedup and store
    for (const cap of normalized) {
      if (!this.discovered.has(cap.id)) {
        this.discovered.set(cap.id, cap);
        this.stats.totalDiscovered++;
      }
    }

    return normalized;
  }

  /**
   * Search for specific capability type.
   */
  async searchByType(type) {
    const results = [];

    // GitHub search by type
    const typeQueries = {
      skill: 'SKILL.md skill agent',
      plugin: 'plugin claude copilot cursor',
      mcp_server: 'mcp server tool',
      agent: 'agent framework ai',
      hook: 'hook automation',
      workflow: 'workflow orchestration',
    };

    const query = typeQueries[type] || type;
    const githubResults = await this.github.search(query, { maxResults: 30 });
    results.push(...githubResults);

    return results.map(r => createCapability(r, r.source));
  }

  /**
   * Search by keyword.
   */
  async searchByKeyword(keyword) {
    const results = await this.github.search(keyword, { maxResults: 30 });
    return results.map(r => createCapability(r, r.source));
  }

  /**
   * Discover from a specific GitHub URL.
   */
  async discoverFromUrl(url) {
    // Parse GitHub URL
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;

    const [, owner, repo] = match;
    const analysis = await this.github.analyzeRepo(owner, repo);
    
    const raw = {
      name: repo,
      description: analysis.detectedTypes.join(', ') + ' capability',
      type: analysis.detectedTypes[0] || 'other',
      source: {
        provider: 'github',
        repository: `${owner}/${repo}`,
        url,
      },
      platforms: ['general'],
      tags: analysis.detectedTypes,
    };

    return createCapability(raw, raw.source);
  }

  /**
   * Get recent updates across all sources.
   */
  async getRecentUpdates(since) {
    return this.github.getRecentEvents(since);
  }

  /**
   * Get all discovered capabilities.
   */
  getAll() {
    return Array.from(this.discovered.values());
  }

  /**
   * Get capability by ID.
   */
  getById(id) {
    return this.discovered.get(id) || null;
  }

  /**
   * Export capabilities as JSON.
   */
  exportJson() {
    return JSON.stringify(Array.from(this.discovered.values()), null, 2);
  }

  getStats() {
    return {
      ...this.stats,
      totalStored: this.discovered.size,
      github: this.github.getStats(),
      huggingface: this.huggingface.getStats(),
      marketplace: this.marketplace.getStats(),
    };
  }
}

module.exports = { DiscoveryEngine };
