/**
 * HuggingFaceProvider — Descubre skills/MCP servers en HuggingFace Hub.
 *
 * Usa la HuggingFace Hub API con el flag agents=true para buscar Spaces
 * orientados a agentes, skills y MCP servers.
 *
 * Referencia: hf-discover (github:huggingface/hf-discover) — ARD spec.
 */

const https = require('https');

const HF_API = 'huggingface.co';

/**
 * Helper: petición GET a la HF API.
 * @param {string} endpoint
 * @param {number} [timeout]
 * @returns {Promise<object>}
 */
function hfGet(endpoint, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HF_API,
      path: endpoint,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MiLibreChat-SkillsDiscovery',
      },
      timeout,
    };
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
    if (token) {
      options.headers.Authorization = `Bearer ${token}`;
    }
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`HF JSON parse error: ${e.message}`));
          }
        } else {
          reject(new Error(`HF API ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HF API timeout'));
    });
    req.end();
  });
}

/**
 * Busca Spaces orientados a agentes en HuggingFace.
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
async function searchSpaces(query, limit = 20) {
  const endpoint = `/api/spaces?search=${encodeURIComponent(query)}&limit=${limit}&agents=true`;
  const data = await hfGet(endpoint);
  return (Array.isArray(data) ? data : []).map(normalizeSpace);
}

/**
 * Busca modelos con tag "agent" o "tool".
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
async function searchModels(query, limit = 10) {
  const endpoint = `/api/models?search=${encodeURIComponent(query)}&limit=${limit}&filter=tool`;
  try {
    const data = await hfGet(endpoint);
    return (Array.isArray(data) ? data : []).map(normalizeModel);
  } catch {
    return [];
  }
}

/**
 * Normaliza un Space de HF al formato unificado.
 * @param {object} space
 * @returns {object}
 */
function normalizeSpace(space) {
  return {
    id: `hf-space-${space.id.replace('/', '-').toLowerCase()}`,
    name: space.id.split('/').pop(),
    source: `huggingface:${space.id}`,
    url: `https://huggingface.co/spaces/${space.id}`,
    license: space.cardData?.license || null,
    stars: space.likes || 0,
    type: detectSpaceType(space),
    category: 'ml-ai',
    description: space.cardData?.short_description || space.sdk || '',
    lastPush: space.lastModified ? space.lastModified.substring(0, 10) : null,
    install: `hf download ${space.id}`,
    platforms: ['claude-code', 'codex', 'cursor', 'generic'],
    tags: space.tags || [],
    status: 'new',
    blacklisted: false,
    whitelisted: false,
    runtime: space.runtime?.stage || 'unknown',
  };
}

/**
 * Normaliza un modelo de HF.
 * @param {object} model
 * @returns {object}
 */
function normalizeModel(model) {
  return {
    id: `hf-model-${model.id.replace('/', '-').toLowerCase()}`,
    name: model.id.split('/').pop(),
    source: `huggingface:${model.id}`,
    url: `https://huggingface.co/${model.id}`,
    license: model.tags?.find((t) => t.startsWith('license:'))?.replace('license:', '') || null,
    stars: model.likes || 0,
    type: 'library',
    category: 'ml-ai',
    description: model.pipeline_tag || '',
    lastPush: model.lastModified ? model.lastModified.substring(0, 10) : null,
    install: `hf download ${model.id}`,
    platforms: ['developer'],
    tags: model.tags || [],
    status: 'new',
    blacklisted: false,
    whitelisted: false,
  };
}

/**
 * Detecta el tipo de Space.
 * @param {object} space
 * @returns {string}
 */
function detectSpaceType(space) {
  const tags = (space.tags || []).join(' ').toLowerCase();
  if (tags.includes('mcp')) return 'mcp-registry';
  if (tags.includes('skill')) return 'skills';
  if (tags.includes('agent')) return 'plugin';
  return 'skills';
}

/**
 * Búsqueda principal de HuggingFace.
 * @param {object} opts — { query, type, limit }
 * @returns {Promise<Array>}
 */
async function search(opts = {}) {
  const { query = 'agent skill', limit = 20 } = opts;
  const [spaces, models] = await Promise.allSettled([
    searchSpaces(query, limit),
    searchModels(query, Math.min(limit, 10)),
  ]);
  const spaceResults = spaces.status === 'fulfilled' ? spaces.value : [];
  const modelResults = models.status === 'fulfilled' ? models.value : [];
  return [...spaceResults, ...modelResults];
}

module.exports = {
  search,
  searchSpaces,
  searchModels,
  normalizeSpace,
};
