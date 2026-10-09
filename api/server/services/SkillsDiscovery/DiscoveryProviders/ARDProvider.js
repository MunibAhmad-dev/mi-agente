/**
 * ARDProvider — Agentic Resource Discovery.
 *
 * Implementa el protocolo ARD (agenticresourcediscovery.org) para descubrir
 * skills, MCP servers y agentes A2A en registros federados.
 *
 * ARD separa discovery de execution:
 *   - Cada sitio publica /.well-known/ai-catalog.json
 *   - Los registros federan búsquedas entre sí
 *   - HuggingFace hf-discover es una implementación de referencia
 */

const https = require('https');

const ARD_DISCOVER = 'hf-discover.hf.space';

/**
 * Helper: petición GET.
 * @param {string} hostname
 * @param {string} endpoint
 * @param {number} [timeout]
 * @returns {Promise<object>}
 */
function httpGet(hostname, endpoint, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: endpoint,
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'MiLibreChat-SkillsDiscovery' },
      timeout,
    };
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
        } else {
          reject(new Error(`${hostname} ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`${hostname} timeout`));
    });
    req.end();
  });
}

/**
 * Busca via ARD en el endpoint de HuggingFace Discover.
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
async function searchARD(query, limit = 20) {
  try {
    const endpoint = `/search?q=${encodeURIComponent(query)}&pageSize=${limit}`;
    const data = await httpGet(ARD_DISCOVER, endpoint);
    const entries = data.catalog || data.entries || data.results || [];
    return entries.map(normalizeARDEntry);
  } catch {
    return [];
  }
}

/**
 * Descubre catalogs publicados via ai-catalog.json.
 * @param {string} domain — e.g. 'huggingface.co'
 * @returns {Promise<object|null>}
 */
async function fetchCatalog(domain) {
  try {
    const data = await httpGet(domain, '/.well-known/ai-catalog.json');
    return data;
  } catch {
    return null;
  }
}

/**
 * Normaliza una entrada ARD al formato unificado.
 * @param {object} entry
 * @returns {object}
 */
function normalizeARDEntry(entry) {
  const type = entry.type || entry['media-type'] || 'application/ai-skill';
  return {
    id: entry.id || entry.urn || `ard-${Date.now()}`,
    name: entry.name || entry.title || 'Unknown ARD Entry',
    source: entry.source || entry.url || `ard:${entry.id || 'unknown'}`,
    url: entry.url || entry.homepage || '',
    license: entry.license || null,
    stars: 0,
    type: mapARDType(type),
    category: 'discovery',
    description: entry.description || '',
    lastPush: entry.updated ? entry.updated.substring(0, 10) : null,
    install: entry.install || entry.url || '',
    platforms: ['claude-code', 'codex', 'cursor', 'generic'],
    tags: entry.keywords || [],
    status: 'new',
    blacklisted: false,
    whitelisted: false,
    ardType: type,
  };
}

/**
 * Mapea el media-type de ARD a nuestro tipo interno.
 * @param {string} mediaType
 * @returns {string}
 */
function mapARDType(mediaType) {
  if (mediaType.includes('ai-skill')) return 'skills';
  if (mediaType.includes('mcp-server')) return 'mcp-registry';
  if (mediaType.includes('a2a-agent')) return 'plugin';
  if (mediaType.includes('api')) return 'library';
  return 'skills';
}

/**
 * Búsqueda principal de ARD.
 * @param {object} opts — { query, limit }
 * @returns {Promise<Array>}
 */
async function search(opts = {}) {
  const { query = 'agent skill tool', limit = 20 } = opts;
  return searchARD(query, limit);
}

module.exports = {
  search,
  searchARD,
  fetchCatalog,
  normalizeARDEntry,
};
