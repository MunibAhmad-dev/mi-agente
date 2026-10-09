'use strict';

const https = require('https');

/**
 * MarketplaceDiscovery - Discovers capabilities from existing marketplaces.
 * Sources: ClaudeMarket, SkillsCat, TonsofSkills, AwesomeLists.
 */
class MarketplaceDiscovery {
  constructor(config = {}) {
    this.config = config;
    this.stats = { sources: 0, discovered: 0, errors: 0 };

    this.sources = [
      {
        name: 'SkillsCat Registry',
        url: 'https://skills.cat/registry',
        api: 'https://skills.cat/api',
        type: 'registry',
      },
      {
        name: 'SkillsCat Marketplace',
        url: 'https://skills.cat/marketplace.json',
        type: 'json',
      },
      {
        name: 'Claude Market',
        url: 'https://www.claudemarket.ai/skills',
        type: 'web',
      },
      {
        name: 'Tons of Skills',
        url: 'https://tonsofskills.com/',
        type: 'web',
      },
      {
        name: 'Skill Marketplace',
        url: 'https://www.skill-marketplace.com/',
        type: 'web',
      },
    ];
  }

  /**
   * Fetch and parse marketplace data.
   */
  async discoverAll() {
    const results = [];

    for (const source of this.sources) {
      try {
        const items = await this._fetchSource(source);
        results.push(...items);
        this.stats.sources++;
      } catch (e) {
        this.stats.errors++;
      }
    }

    return results;
  }

  async _fetchSource(source) {
    if (source.type === 'json') {
      return this._fetchJson(source);
    }
    if (source.type === 'registry' || source.type === 'api') {
      return this._fetchApi(source);
    }
    // Web sources: return source info for later scraping
    return [{
      name: source.name,
      type: 'marketplace',
      description: `Marketplace source: ${source.name}`,
      source: {
        provider: 'marketplace',
        url: source.url,
        repository: null,
      },
      platforms: ['general'],
      tags: ['marketplace'],
    }];
  }

  async _fetchJson(source) {
    try {
      const data = await this._fetch(source.url);
      if (!Array.isArray(data)) return [];
      return data.map(item => this._normalizeItem(item, source));
    } catch {
      return [];
    }
  }

  async _fetchApi(source) {
    try {
      const data = await this._fetch(source.api + '/skills');
      if (!Array.isArray(data)) return [];
      return data.map(item => this._normalizeItem(item, source));
    } catch {
      return [];
    }
  }

  _normalizeItem(item, source) {
    return {
      name: item.name || item.title || 'Unknown',
      type: item.type || 'skill',
      description: item.description || '',
      source: {
        provider: source.name,
        url: item.url || source.url,
        repository: item.repository || null,
        version: item.version || '0.0.0',
      },
      license: item.license || 'Unknown',
      authors: item.authors || [],
      platforms: item.platforms || ['general'],
      tags: item.tags || [],
      popularity: {
        downloads: item.downloads || 0,
        stars: item.stars || 0,
      },
    };
  }

  _fetch(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'User-Agent': 'CapabilityDiscovery/1.0' },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  getStats() { return { ...this.stats }; }
}

module.exports = { MarketplaceDiscovery };
