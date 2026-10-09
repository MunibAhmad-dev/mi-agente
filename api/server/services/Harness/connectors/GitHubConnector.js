/**
 * GitHubConnector — GitHub integration via REST API.
 *
 * Actions:
 *   - repos       — List user repositories
 *   - issues      — List/search issues
 *   - pullRequests — List/search PRs
 *   - fileContent — Read file content from a repo
 *   - createIssue — Create a new issue
 *   - searchCode  — Search code across repos
 *
 * Auth: Personal access token or GitHub App token
 * API: GitHub REST API v3 (https://api.github.com)
 */

const https = require('https');
const { BaseConnector } = require('./BaseConnector');

class GitHubConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      rateLimitPerMinute: 30, // Conservative (GitHub allows 5000/hr)
      timeout: 30000,
      ...config,
    });
    this._baseUrl = 'https://api.github.com';
  }

  getId() { return 'github'; }
  getName() { return 'GitHub'; }

  getActions() {
    return [
      { name: 'repos', description: 'List user repositories', params: ['per_page'] },
      { name: 'issues', description: 'List/search issues in a repo', params: ['owner', 'repo', 'state', 'per_page'] },
      { name: 'pullRequests', description: 'List/search pull requests', params: ['owner', 'repo', 'state', 'per_page'] },
      { name: 'fileContent', description: 'Read file from a repo', params: ['owner', 'repo', 'path', 'ref'] },
      { name: 'createIssue', description: 'Create a new issue', params: ['owner', 'repo', 'title', 'body', 'labels'] },
      { name: 'searchCode', description: 'Search code across repos', params: ['query', 'per_page'] },
    ];
  }

  async execute(action, params = {}) {
    const token = this.getToken();
    if (!token) throw new Error('[GitHub] No auth token. Set via setToken()');

    try {
      let result;
      switch (action) {
        case 'repos':
          result = await this._repos(params.per_page || 30);
          break;
        case 'issues':
          result = await this._issues(params.owner, params.repo, params.state || 'open', params.per_page || 20);
          break;
        case 'pullRequests':
          result = await this._pullRequests(params.owner, params.repo, params.state || 'open', params.per_page || 20);
          break;
        case 'fileContent':
          result = await this._fileContent(params.owner, params.repo, params.path, params.ref);
          break;
        case 'createIssue':
          result = await this._createIssue(params.owner, params.repo, params.title, params.body, params.labels);
          break;
        case 'searchCode':
          result = await this._searchCode(params.query, params.per_page || 20);
          break;
        default:
          throw new Error(`[GitHub] Unknown action: ${action}`);
      }
      this._audit(action, params, result);
      return result;
    } catch (error) {
      this._audit(action, params, null, error);
      throw error;
    }
  }

  async _repos(perPage) {
    return this._apiGet(`/user/repos?per_page=${perPage}&sort=updated`);
  }

  async _issues(owner, repo, state, perPage) {
    if (!owner || !repo) throw new Error('[GitHub] owner and repo required');
    const res = await this._apiGet(`/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}`);
    return { issues: (Array.isArray(res) ? res : []).map(i => ({
      number: i.number, title: i.title, state: i.state,
      user: i.user?.login, created_at: i.created_at, labels: i.labels?.map(l => l.name),
      body: i.body?.slice(0, 500),
    }))};
  }

  async _pullRequests(owner, repo, state, perPage) {
    if (!owner || !repo) throw new Error('[GitHub] owner and repo required');
    const res = await this._apiGet(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}`);
    return { pullRequests: (Array.isArray(res) ? res : []).map(pr => ({
      number: pr.number, title: pr.title, state: pr.state,
      user: pr.user?.login, created_at: pr.created_at, head: pr.head?.ref, base: pr.base?.ref,
    }))};
  }

  async _fileContent(owner, repo, filePath, ref = 'main') {
    if (!owner || !repo || !filePath) throw new Error('[GitHub] owner, repo, and path required');
    const res = await this._apiGet(`/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`);
    const content = res.content ? Buffer.from(res.content, 'base64').toString('utf-8') : '';
    return { content: content.slice(0, 50000), path: filePath, sha: res.sha, size: res.size };
  }

  async _createIssue(owner, repo, title, body, labels) {
    if (!owner || !repo || !title) throw new Error('[GitHub] owner, repo, and title required');
    return this._apiPost(`/repos/${owner}/${repo}/issues`, { title, body: body || '', labels: labels || [] });
  }

  async _searchCode(query, perPage) {
    const res = await this._apiGet(`/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}`);
    return { results: (res.items || []).map(i => ({
      name: i.name, path: i.path, repository: i.repository?.full_name,
      html_url: i.html_url,
    }))};
  }

  async healthCheck() {
    try {
      const res = await this._apiGet('/user');
      return { healthy: true, connector: 'github', user: res.login };
    } catch (error) {
      return { healthy: false, connector: 'github', error: error.message };
    }
  }

  async _apiGet(path) {
    return this._request('GET', path);
  }

  async _apiPost(path, body) {
    return this._request('POST', path, body);
  }

  _request(method, path, body = null) {
    const token = this.getToken();
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Freebuff-Agent',
          'Content-Type': 'application/json',
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const rateLimit = res.headers['x-ratelimit-remaining'];
            if (rateLimit && parseInt(rateLimit) < 10) {
              console.warn(`[GitHub] Rate limit low: ${rateLimit} remaining`);
            }
            if (res.statusCode === 403 || res.statusCode === 429) {
              reject(new Error('GitHub rate limited'));
            } else if (res.statusCode >= 400) {
              reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
            } else {
              resolve(JSON.parse(data));
            }
          } catch { resolve(data); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('GitHub API timeout')); });
      req.setTimeout(this.config.timeout);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = { GitHubConnector };
