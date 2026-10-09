/**
 * GitHubProvider — Descubre skills/plugins en GitHub.
 *
 * Busca repositorios con:
 *   - SKILL.md (Agent Skills standard)
 *   - topic: claude-skills, agent-skills, claude-code, mcp-server
 *   - Archivos .claude-plugin/marketplace.json
 *
 * Filtra resultados contra CuratedRegistry (blacklist → no mostrar).
 */

const https = require('https');
const path = require('path');
const CuratedRegistry = require(path.join(__dirname, '..', 'CuratedRegistry'));

const GITHUB_API = 'api.github.com';

/**
 * Helper: hace una petición GET a la GitHub API.
 * @param {string} endpoint
 * @param {number} [timeout]
 * @returns {Promise<object>}
 */
function ghGet(endpoint, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GITHUB_API,
      path: endpoint,
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MiLibreChat-SkillsDiscovery',
      },
      timeout,
    };
    const token = process.env.GITHUB_TOKEN || process.env.SKILLS_GITHUB_TOKEN;
    if (token) {
      options.headers.Authorization = `token ${token}`;
    }
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        } else if (res.statusCode === 403 && res.headers['x-ratelimit-remaining'] === '0') {
          reject(new Error('GitHub API rate limit exceeded'));
        } else {
          reject(new Error(`GitHub API ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GitHub API timeout'));
    });
    req.end();
  });
}

/**
 * Busca repos en GitHub por query.
 * @param {string} query — query de búsqueda
 * @param {number} [perPage=20]
 * @returns {Promise<Array>}
 */
async function searchRepos(query, perPage = 20) {
  const endpoint = `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;
  const data = await ghGet(endpoint);
  return (data.items || []).map(normalizeRepo);
}

/**
 * Compute status without nested ternary.
 * @param {boolean} blacklisted
 * @param {boolean} whitelisted
 * @returns {string}
 */
function computeStatus(blacklisted, whitelisted) {
  if (blacklisted) return 'blacklisted';
  if (whitelisted) return 'verified';
  return 'new';
}

/**
 * Normaliza un repo de GitHub al formato unificado.
 * @param {object} repo
 * @returns {object}
 */
function normalizeRepo(repo) {
  const source = `github:${repo.full_name}`;
  const blacklisted = CuratedRegistry.isInBlacklist(source);
  const whitelisted = CuratedRegistry.isInWhitelist(source);
  return {
    id: repo.full_name.replace('/', '-').toLowerCase(),
    name: repo.name,
    source,
    url: repo.html_url,
    license: repo.license ? repo.license.spdx_id : null,
    stars: repo.stargazers_count,
    type: detectType(repo),
    category: detectCategory(repo),
    description: repo.description || '',
    lastPush: repo.pushed_at ? repo.pushed_at.substring(0, 10) : null,
    install: `git clone ${repo.clone_url}`,
    platforms: ['claude-code', 'codex', 'cursor'],
    tags: (repo.topics || []).slice(0, 10),
    status: computeStatus(blacklisted, whitelisted),
    blacklisted,
    whitelisted,
    fork: repo.fork,
    archived: repo.archived,
  };
}

/**
 * Detecta el tipo de skill basándose en topics y archivos.
 * @param {object} repo
 * @returns {string}
 */
function detectType(repo) {
  const topics = (repo.topics || []).join(' ').toLowerCase();
  if (topics.includes('mcp-server') || topics.includes('mcp')) return 'mcp-registry';
  if (topics.includes('plugin')) return 'plugin';
  if (topics.includes('marketplace')) return 'marketplace';
  if (topics.includes('toolkit')) return 'toolkit';
  if (topics.includes('harness')) return 'harness';
  if (topics.includes('skill') || topics.includes('agent')) return 'skills';
  return 'skills';
}

/**
 * Detecta la categoría.
 * @param {object} repo
 * @returns {string}
 */
function detectCategory(repo) {
  const topics = (repo.topics || []).join(' ').toLowerCase();
  const desc = (repo.description || '').toLowerCase();
  if (topics.includes('tdd') || topics.includes('testing')) return 'dev-framework';
  if (topics.includes('memory')) return 'memory';
  if (topics.includes('full-stack')) return 'full-stack';
  if (topics.includes('ml') || topics.includes('ai')) return 'ml-ai';
  if (topics.includes('rag')) return 'agents-rag';
  if (topics.includes('mcp')) return 'mcp';
  if (topics.includes('governance') || topics.includes('enterprise')) return 'governance';
  if (desc.includes('multi-domain')) return 'multi-domain';
  return 'general';
}

/**
 * Búsqueda principal de GitHub.
 * @param {object} opts — { query, type, category, limit }
 * @returns {Promise<Array>}
 */
async function search(opts = {}) {
  const { query = '', type, category, limit = 20 } = opts;
  let q = query || 'agent-skills SKILL.md';
  if (type === 'mcp-registry') q += ' mcp-server';
  if (type === 'plugin') q += ' claude-code-plugin';
  if (type === 'skills') q += ' claude-skills';
  q += ' in:name,description,topics';
  const results = await searchRepos(q, limit);
  return results
    .filter((r) => !r.blacklisted)
    .filter((r) => !type || r.type === type)
    .filter((r) => !category || r.category === category)
    .filter((r) => !r.archived);
}

module.exports = {
  search,
  searchRepos,
  ghGet,
  normalizeRepo,
};
