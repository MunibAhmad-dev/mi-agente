'use strict';

/**
 * ExternalSkillRegistry — Face 15.
 * Connection to external skill registries (npm, custom HTTP endpoints).
 * Discovers, fetches metadata, and installs external skills.
 */

const axios = require('axios');

const REGISTRY_TYPES = ['npm', 'http', 'github'];

class ExternalSkillRegistry {
  constructor({ type = 'http', url = null, auth = null } = {}) {
    if (!REGISTRY_TYPES.includes(type)) throw new Error(`Invalid registry type: ${type}`);
    this.type = type;
    this.url = url;
    this.auth = auth;
    this._cache = new Map();
    this._cacheTs = 0;
    this._cacheTTL = 5 * 60 * 1000;
  }

  async search(query, opts = {}) {
    if (this.type === 'npm') return this._searchNpm(query, opts);
    if (this.type === 'http') return this._searchHttp(query, opts);
    if (this.type === 'github') return this._searchGithub(query, opts);
    return [];
  }

  async getMetadata(skillId) {
    if (this._cache.has(skillId) && Date.now() - this._cacheTs < this._cacheTTL) {
      return this._cache.get(skillId);
    }
    if (this.type === 'npm') return this._getNpmMetadata(skillId);
    if (this.type === 'http') return this._getHttpMetadata(skillId);
    return null;
  }

  async _searchNpm(query) {
    try {
      const resp = await axios.get(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`, { timeout: 10000 });
      return (resp.data.objects || []).map((o) => ({
        id: o.package.name,
        name: o.package.name,
        description: o.package.description,
        version: o.package.version,
        registry: 'npm',
        score: o.score?.final || 0,
      }));
    } catch {
      return [];
    }
  }

  async _searchHttp(query) {
    if (!this.url) return [];
    try {
      const headers = this.auth ? { Authorization: `Bearer ${this.auth}` } : {};
      const resp = await axios.get(`${this.url}/search?q=${encodeURIComponent(query)}`, { headers, timeout: 10000 });
      return resp.data.results || resp.data || [];
    } catch {
      return [];
    }
  }

  async _searchGithub(query) {
    try {
      const resp = await axios.get(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+topic:claude-skill&sort=stars&per_page=10`,
        { headers: { Accept: 'application/vnd.github.v3+json', ...(this.auth ? { Authorization: `token ${this.auth}` } : {}) }, timeout: 10000 },
      );
      return (resp.data.items || []).map((r) => ({
        id: r.full_name,
        name: r.name,
        description: r.description,
        version: null,
        registry: 'github',
        stars: r.stargazers_count,
        url: r.html_url,
      }));
    } catch {
      return [];
    }
  }

  async _getNpmMetadata(packageName) {
    const resp = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, { timeout: 10000 });
    const meta = { id: resp.data.name, name: resp.data.name, version: resp.data.version, description: resp.data.description, registry: 'npm', raw: resp.data };
    this._cache.set(packageName, meta);
    this._cacheTs = Date.now();
    return meta;
  }

  async _getHttpMetadata(skillId) {
    if (!this.url) return null;
    const headers = this.auth ? { Authorization: `Bearer ${this.auth}` } : {};
    const resp = await axios.get(`${this.url}/skills/${encodeURIComponent(skillId)}`, { headers, timeout: 10000 });
    return resp.data;
  }
}

const _registries = new Map();

function registerRegistry(id, opts) {
  const reg = new ExternalSkillRegistry(opts);
  _registries.set(id, reg);
  return reg;
}

function getRegistry(id) { return _registries.get(id) || null; }
function listRegistries() { return Array.from(_registries.keys()); }

module.exports = { ExternalSkillRegistry, registerRegistry, getRegistry, listRegistries, REGISTRY_TYPES };
