'use strict';

/**
 * GitHubAdapter — discovers AI models/projects on GitHub via public API.
 * No API key required for basic use (60 req/h). With GITHUB_TOKEN: 5000 req/h.
 */

const https = require('https');

const GITHUB_API = 'api.github.com';
const UA = 'mi-agente/1.0 (model-discovery)';

function githubGet(path, token) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': UA,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = https.get({ hostname: GITHUB_API, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, data: null }); });
    req.on('error', () => resolve({ status: 0, data: null }));
  });
}

function mapRepo(repo) {
  return {
    id: repo.full_name,
    name: repo.name,
    owner: repo.owner?.login,
    fullName: repo.full_name,
    description: repo.description,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    language: repo.language,
    license: repo.license?.spdx_id || repo.license?.name || null,
    lastUpdated: repo.updated_at,
    url: repo.html_url,
    size: repo.size,
    topics: repo.topics || [],
    source: 'github',
  };
}

/**
 * Search GitHub for AI model repos matching a query.
 * @param {string} query - e.g. "llama ollama gguf"
 * @param {number} limit - max results (up to 30)
 */
async function searchModels(query = 'llm model inference', limit = 20) {
  const token = process.env.GITHUB_TOKEN;
  const q = encodeURIComponent(`${query} topic:machine-learning`);
  const path = `/search/repositories?q=${q}&sort=stars&order=desc&per_page=${Math.min(limit, 30)}`;
  const { status, data } = await githubGet(path, token);

  if (status !== 200 || !data?.items) {
    return { error: `GitHub API returned ${status}`, results: [] };
  }

  return {
    query,
    total: data.total_count,
    results: data.items.map(mapRepo),
    rateLimit: data.incomplete_results ? 'rate_limited' : 'ok',
  };
}

/**
 * Get details for a specific GitHub repo.
 */
async function getRepo(fullName) {
  const token = process.env.GITHUB_TOKEN;
  const { status, data } = await githubGet(`/repos/${fullName}`, token);
  if (status !== 200 || !data) return null;
  return mapRepo(data);
}

/**
 * Curated list of well-known open-source AI model repositories.
 */
const CURATED_AI_REPOS = [
  { fullName: 'ollama/ollama', description: 'Run LLMs locally', stars: 100000, license: 'MIT', source: 'github', topics: ['llm', 'local'] },
  { fullName: 'ggerganov/llama.cpp', description: 'LLaMA in C++ — CPU inference', stars: 70000, license: 'MIT', source: 'github', topics: ['llm', 'cpu'] },
  { fullName: 'lm-sys/FastChat', description: 'Serving LLMs with OpenAI-compatible API', stars: 36000, license: 'Apache-2.0', source: 'github', topics: ['llm', 'server'] },
  { fullName: 'vllm-project/vllm', description: 'Fast LLM inference and serving', stars: 35000, license: 'Apache-2.0', source: 'github', topics: ['llm', 'gpu'] },
  { fullName: 'BerriAI/litellm', description: 'Call 100+ LLMs with OpenAI format', stars: 14000, license: 'MIT', source: 'github', topics: ['proxy', 'multi-provider'] },
  { fullName: 'deepseek-ai/DeepSeek-V3', description: 'DeepSeek V3 model', stars: 12000, license: 'MIT', source: 'github', topics: ['llm', 'open-weights'] },
  { fullName: 'Qwen/Qwen2.5', description: 'Qwen 2.5 series models', stars: 8000, license: 'Apache-2.0', source: 'github', topics: ['llm', 'multilingual'] },
  { fullName: 'microsoft/phi-2', description: 'Phi-2: Small language model by Microsoft', stars: 6000, license: 'MIT', source: 'github', topics: ['llm', 'small'] },
];

module.exports = { searchModels, getRepo, CURATED_AI_REPOS };
