'use strict';

const https = require('https');

/**
 * HuggingFaceDiscovery - Discovers capabilities from Hugging Face.
 * Searches for skills, agents, tools, models, and datasets.
 */
class HuggingFaceDiscovery {
  constructor(config = {}) {
    this.config = {
      token: config.hfToken || process.env.HF_TOKEN || null,
      maxResults: config.maxResults || 50,
      ...config,
    };
    this.stats = { searches: 0, discovered: 0, errors: 0 };

    this.searchQueries = [
      'agent skill',
      'mcp server',
      'ai agent',
      'tool use',
      'function calling',
      'code agent',
      'browser agent',
      'research agent',
      'security agent',
      'testing agent',
      'rag agent',
    ];
  }

  /**
   * Search HuggingFace for capabilities.
   */
  async search(query, options = {}) {
    this.stats.searches++;
    const limit = options.limit || this.config.maxResults;
    const type = options.type || 'models'; // models, datasets, spaces

    try {
      const url = `https://huggingface.co/api/${type}?search=${encodeURIComponent(query)}&limit=${limit}&sort=downloads&direction=-1`;
      const data = await this._fetch(url);

      if (!Array.isArray(data)) return [];

      return data.map(item => this._normalizeItem(item, type)).filter(Boolean);
    } catch (e) {
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Discover all capability types from HuggingFace.
   */
  async discoverAll() {
    const allResults = new Map();

    // Search models
    for (const query of this.searchQueries.slice(0, 5)) {
      const results = await this.search(query, { type: 'models', limit: 10 });
      for (const r of results) {
        if (!allResults.has(r.source.url)) {
          allResults.set(r.source.url, r);
          this.stats.discovered++;
        }
      }
      await this._sleep(1000);
    }

    // Search datasets for evaluation
    const evalQueries = ['agent benchmark', 'code evaluation', 'tool use benchmark'];
    for (const query of evalQueries) {
      const results = await this.search(query, { type: 'datasets', limit: 5 });
      for (const r of results) {
        if (!allResults.has(r.source.url)) {
          allResults.set(r.source.url, r);
          this.stats.discovered++;
        }
      }
      await this._sleep(1000);
    }

    return Array.from(allResults.values());
  }

  _normalizeItem(item, type) {
    if (!item) return null;

    const tags = item.tags || [];
    const combined = (item.id || '') + ' ' + (item.description || '') + ' ' + tags.join(' ');

    let capabilityType = 'other';
    if (type === 'datasets') capabilityType = 'learning_resource';
    else if (combined.includes('mcp')) capabilityType = 'mcp_server';
    else if (combined.includes('agent')) capabilityType = 'agent';
    else if (combined.includes('tool')) capabilityType = 'tool';

    return {
      name: item.id || item.name || 'Unknown',
      type: capabilityType,
      description: item.description || '',
      source: {
        provider: 'huggingface',
        repository: item.id,
        url: `https://huggingface.co/${item.id}`,
        version: item.id,
      },
      license: item.cardData?.license || item.license || 'Unknown',
      authors: item.author ? [item.author] : [],
      platforms: ['general'],
      popularity: {
        downloads: item.downloads || 0,
        stars: item.likes || 0,
      },
      tags: tags.slice(0, 20),
      created: item.createdAt || null,
      updated: item.lastModified || null,
    };
  }

  _fetch(url) {
    return new Promise((resolve, reject) => {
      const headers = { 'User-Agent': 'CapabilityDiscovery/1.0' };
      if (this.config.token) headers['Authorization'] = `Bearer ${this.config.token}`;

      const req = https.get(url, { headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  getStats() { return { ...this.stats }; }
}

module.exports = { HuggingFaceDiscovery };
