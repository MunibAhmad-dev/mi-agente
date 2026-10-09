/**
 * MCPRegistryProvider — Descubre MCP servers en el registry oficial.
 *
 * Fuentes:
 *   - registry.modelcontextprotocol.io (oficial MCP Registry)
 *   - docker/mcp-registry (Docker MCP catalog)
 *   - modelcontextprotocol/servers (reference implementations)
 *
 * Devuelve resultados normalizados al formato unificado.
 */

const https = require('https');
const path = require('path');
const CuratedRegistry = require(path.join(__dirname, '..', 'CuratedRegistry'));

const MCP_REGISTRY = 'registry.modelcontextprotocol.io';

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
 * Busca en el MCP Registry oficial.
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
async function searchOfficial(query, limit = 20) {
  try {
    const endpoint = `/v0/servers?q=${encodeURIComponent(query)}&limit=${limit}`;
    const data = await httpGet(MCP_REGISTRY, endpoint);
    const servers = data.servers || data.items || [];
    return servers.map(normalizeMCPServer);
  } catch {
    return [];
  }
}

/**
 * Obtiene los reference servers de modelcontextprotocol/servers.
 * @returns {Promise<Array>}
 */
async function getReferenceServers() {
  const entry = CuratedRegistry.isInWhitelist('github:modelcontextprotocol/servers');
  if (!entry) return [];
  const refs = [
    'filesystem',
    'git',
    'github',
    'postgres',
    'memory',
    'fetch',
    'time',
    'sequential-thinking',
  ];
  return refs.map((name) => ({
    id: `mcp-ref-${name}`,
    name: `MCP ${name}`,
    source: `github:modelcontextprotocol/servers`,
    url: `https://github.com/modelcontextprotocol/servers/tree/main/src/${name}`,
    license: 'MIT',
    stars: 89633,
    type: 'mcp-registry',
    category: 'mcp',
    description: `Reference MCP server: ${name}`,
    install: `npx -y @modelcontextprotocol/server-${name}`,
    platforms: ['claude-code', 'codex', 'cursor', 'windsurf'],
    tags: ['mcp', 'reference', name],
    status: 'verified',
    whitelisted: true,
    blacklisted: false,
  }));
}

/**
 * Normaliza un MCP server del registry oficial.
 * @param {object} server
 * @returns {object}
 */
function normalizeMCPServer(server) {
  return {
    id: server.id || server.name,
    name: server.name || server.id,
    source: server.repository?.url || `mcp-registry:${server.id}`,
    url: server.repository?.url || `https://registry.modelcontextprotocol.io`,
    license: server.license || null,
    stars: server.stars || 0,
    type: 'mcp-registry',
    category: 'mcp',
    description: server.description || '',
    lastPush: server.updated ? server.updated.substring(0, 10) : null,
    install: buildInstallCommand(server),
    platforms: ['claude-code', 'codex', 'cursor'],
    tags: server.keywords || [],
    status: 'new',
    blacklisted: false,
    whitelisted: false,
  };
}

/**
 * Construye el comando de instalación.
 * @param {object} server
 * @returns {string}
 */
function buildInstallCommand(server) {
  if (server.packages?.npm) return `npx -y ${server.packages.npm.name}`;
  if (server.packages?.pypi) return `pip install ${server.packages.pypi.name}`;
  if (server.packages?.docker) return `docker run ${server.packages.docker.image}`;
  if (server.repository?.url) return `git clone ${server.repository.url}`;
  return 'manual-install';
}

/**
 * Búsqueda principal del MCP Registry.
 * @param {object} opts — { query, limit }
 * @returns {Promise<Array>}
 */
async function search(opts = {}) {
  const { query = '', limit = 20 } = opts;
  const [official, refs] = await Promise.allSettled([
    searchOfficial(query, limit),
    getReferenceServers(),
  ]);
  const officialResults = official.status === 'fulfilled' ? official.value : [];
  const refResults = refs.status === 'fulfilled' ? refs.value : [];
  return [...refResults, ...officialResults];
}

module.exports = {
  search,
  searchOfficial,
  getReferenceServers,
  normalizeMCPServer,
};
