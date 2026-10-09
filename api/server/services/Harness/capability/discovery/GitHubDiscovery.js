'use strict';

const https = require('https');

/**
 * GitHubDiscovery - Discovers capabilities from GitHub.
 * Uses GitHub Events API, Code Search, Search API, and repo analysis.
 * No API key required for public repos (rate limited).
 */
class GitHubDiscovery {
  constructor(config = {}) {
    this.config = {
      token: config.githubToken || process.env.GITHUB_TOKEN || null,
      maxResults: config.maxResults || 100,
      ...config,
    };
    this.stats = { searches: 0, discovered: 0, errors: 0 };
    
    // Patterns to search for capabilities
    this.patterns = {
      skillMd: ['SKILL.md', 'skill.md', '.claude/skills', '.agent/skills'],
      plugin: ['.claude-plugin', 'plugin.json', 'marketplace.json'],
      mcp: ['.mcp.json', 'mcp.json', 'mcp-server', 'mcp_tool'],
      agent: ['AGENTS.md', 'CLAUDE.md', '.agents', 'agent.md'],
      hook: ['hooks.json', '.hooks'],
      workflow: ['workflow.json', '.workflow', 'workflows/'],
      instruction: ['*.instructions.md', 'INSTRUCTIONS.md'],
    };

    // Search queries organized by ecosystem
    this.searchQueries = [
      'SKILL.md language:markdown',
      'AGENTS.md language:markdown',
      '.claude-plugin in:path',
      'mcp.json in:path',
      '"claude code" skill',
      '"copilot" agent skill',
      'manus skill SKILL.md',
      'codex plugin',
      'cursor rules .cursorrules',
      'windsurf rules',
      'opencode agent',
      '"agent framework" language:typescript',
      '"agent framework" language:python',
      'awesome-claude-code',
      'awesome-copilot',
      'mcp-server stars:>10',
      '"ai agent" skill plugin stars:>5',
    ];
  }

  /**
   * Search GitHub for capabilities.
   */
  async search(query, options = {}) {
    this.stats.searches++;
    const maxResults = options.maxResults || this.config.maxResults;

    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${Math.min(maxResults, 100)}`;
      const data = await this._fetch(url);

      if (!data?.items) return [];

      return data.items.map(repo => this._normalizeRepo(repo)).filter(Boolean);
    } catch (e) {
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Discover capabilities using all search queries.
   */
  async discoverAll() {
    const allResults = new Map(); // Dedup by repo URL

    for (const query of this.searchQueries) {
      const results = await this.search(query, { maxResults: 20 });
      for (const result of results) {
        if (!allResults.has(result.source.url)) {
          allResults.set(result.source.url, result);
          this.stats.discovered++;
        }
      }
      // Rate limit: 10 requests per minute for unauthenticated
      if (!this.config.token) {
        await this._sleep(6000);
      }
    }

    return Array.from(allResults.values());
  }

  /**
   * Get recent capability-related events from GitHub.
   */
  async getRecentEvents(since) {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const events = [];

    for (const query of this.searchQueries.slice(0, 5)) {
      try {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=10`;
        const data = await this._fetch(url);
        if (data?.items) {
          for (const repo of data.items) {
            if (repo.pushed_at && repo.pushed_at > sinceDate) {
              events.push({
                type: 'updated',
                repo: repo.full_name,
                url: repo.html_url,
                date: repo.pushed_at,
              });
            }
          }
        }
      } catch { /* skip */ }
      if (!this.config.token) await this._sleep(6000);
    }

    return events;
  }

  /**
   * Analyze a specific GitHub repository for capabilities.
   */
  async analyzeRepo(owner, repo) {
    const analysis = {
      hasSkillMd: false,
      hasPluginManifest: false,
      hasMcpConfig: false,
      hasAgentInstructions: false,
      hasHooks: false,
      hasWorkflows: false,
      detectedTypes: [],
      files: [],
    };

    try {
      // Get repo tree
      const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
      const tree = await this._fetch(treeUrl);

      if (!tree?.tree) return analysis;

      for (const file of tree.tree) {
        const path = file.path.toLowerCase();
        analysis.files.push(file.path);

        // Check for capability markers
        if (path.includes('skill.md')) analysis.hasSkillMd = true;
        if (path.includes('.claude-plugin') || path.includes('plugin.json')) analysis.hasPluginManifest = true;
        if (path.includes('.mcp.json') || path.includes('mcp.json')) analysis.hasMcpConfig = true;
        if (path.includes('agents.md') || path.includes('claude.md')) analysis.hasAgentInstructions = true;
        if (path.includes('hooks.json')) analysis.hasHooks = true;
        if (path.includes('workflow')) analysis.hasWorkflows = true;
      }

      // Determine types
      if (analysis.hasSkillMd) analysis.detectedTypes.push('skill');
      if (analysis.hasPluginManifest) analysis.detectedTypes.push('plugin');
      if (analysis.hasMcpConfig) analysis.detectedTypes.push('mcp_server');
      if (analysis.hasAgentInstructions) analysis.detectedTypes.push('agent');
      if (analysis.hasHooks) analysis.detectedTypes.push('hook');
      if (analysis.hasWorkflows) analysis.detectedTypes.push('workflow');

      if (analysis.detectedTypes.length === 0) {
        analysis.detectedTypes.push('other');
      }
    } catch (e) {
      this.stats.errors++;
    }

    return analysis;
  }

  _normalizeRepo(repo) {
    if (!repo) return null;

    // Detect type from repo metadata
    const name = (repo.name || '').toLowerCase();
    const desc = (repo.description || '').toLowerCase();
    const topics = (repo.topics || []).map(t => t.toLowerCase());
    const combined = name + ' ' + desc + ' ' + topics.join(' ');

    let type = 'other';
    if (combined.includes('mcp') || combined.includes('model context protocol')) type = 'mcp_server';
    else if (combined.includes('skill') || combined.includes('agent skill')) type = 'skill';
    else if (combined.includes('plugin')) type = 'plugin';
    else if (combined.includes('agent')) type = 'agent';
    else if (combined.includes('hook')) type = 'hook';
    else if (combined.includes('workflow')) type = 'workflow';
    else if (combined.includes('framework')) type = 'agent_framework';

    // Detect platforms
    const platforms = [];
    if (combined.includes('claude')) platforms.push('claude_code');
    if (combined.includes('copilot')) platforms.push('copilot');
    if (combined.includes('cursor')) platforms.push('cursor');
    if (combined.includes('codex')) platforms.push('codex');
    if (combined.includes('gemini')) platforms.push('gemini_cli');
    if (combined.includes('windsurf')) platforms.push('windsurf');
    if (combined.includes('manus')) platforms.push('manus');
    if (combined.includes('opencode')) platforms.push('opencode');
    if (platforms.length === 0) platforms.push('general');

    return {
      name: repo.name,
      type,
      description: repo.description || '',
      source: {
        provider: 'github',
        repository: repo.full_name,
        url: repo.html_url,
        version: repo.default_branch || 'main',
      },
      license: repo.license?.spdx_id || 'Unknown',
      authors: [repo.owner?.login].filter(Boolean),
      platforms,
      popularity: {
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        downloads: 0,
        contributors: 0,
      },
      maintenance: {
        lastCommit: repo.pushed_at || repo.updated_at,
        lastRelease: null,
        openIssues: repo.open_issues_count || 0,
        ci: false,
        tests: false,
      },
      tags: topics.slice(0, 20),
      created: repo.created_at,
      updated: repo.updated_at,
    };
  }

  _fetch(url) {
    return new Promise((resolve, reject) => {
      const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CapabilityDiscovery/1.0' };
      if (this.config.token) headers['Authorization'] = `token ${this.config.token}`;

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

module.exports = { GitHubDiscovery };
