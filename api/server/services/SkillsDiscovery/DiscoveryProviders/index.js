/**
 * DiscoveryProviders — Fachada que unifica los 4 providers de discovery.
 *
 * Busca en paralelo en:
 *   - GitHub (repos con SKILL.md, topics agent-skills)
 *   - HuggingFace (Spaces con agents=true, models)
 *   - MCP Registry (registry.modelcontextprotocol.io + reference servers)
 *   - ARD (Agentic Resource Discovery, federado)
 *
 * Filtra resultados contra CuratedRegistry (elimina blacklist).
 * Deduplica por source.
 */

const GitHubProvider = require('./GitHubProvider');
const HuggingFaceProvider = require('./HuggingFaceProvider');
const MCPRegistryProvider = require('./MCPRegistryProvider');
const ARDProvider = require('./ARDProvider');

const PROVIDERS = {
  github: GitHubProvider,
  huggingface: HuggingFaceProvider,
  mcp: MCPRegistryProvider,
  ard: ARDProvider,
};

/**
 * Busca en todos los providers en paralelo.
 * @param {object} opts — { query, type, category, limit, providers }
 * @returns {Promise<Array>}
 */
async function searchAll(opts = {}) {
  const { query = '', type, category, limit = 20, providers } = opts;
  const activeProviders = providers || Object.keys(PROVIDERS);

  const searches = activeProviders
    .filter((p) => PROVIDERS[p])
    .map((p) => PROVIDERS[p].search({ query, type, category, limit }).catch(() => []));

  const settled = await Promise.allSettled(searches);
  let allResults = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      allResults = allResults.concat(result.value);
    }
  }

  // Deduplicar por source
  const seen = new Set();
  allResults = allResults.filter((r) => {
    if (seen.has(r.source)) return false;
    seen.add(r.source);
    return true;
  });

  // Filtrar blacklist
  allResults = allResults.filter((r) => !r.blacklisted);

  // Filtrar archived
  allResults = allResults.filter((r) => !r.archived);

  // Filtrar por type y category si se especifican
  if (type) allResults = allResults.filter((r) => r.type === type);
  if (category) allResults = allResults.filter((r) => r.category === category);

  // Ordenar: verified primero, luego por stars
  allResults.sort((a, b) => {
    if (a.whitelisted && !b.whitelisted) return -1;
    if (!a.whitelisted && b.whitelisted) return 1;
    return (b.stars || 0) - (a.stars || 0);
  });

  return allResults.slice(0, limit * 2);
}

/**
 * Busca en un provider específico.
 * @param {string} providerName
 * @param {object} opts
 * @returns {Promise<Array>}
 */
async function searchOne(providerName, opts = {}) {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return provider.search(opts);
}

/**
 * Lista los providers disponibles.
 * @returns {string[]}
 */
function listProviders() {
  return Object.keys(PROVIDERS);
}

module.exports = {
  searchAll,
  searchOne,
  listProviders,
  PROVIDERS,
  GitHubProvider,
  HuggingFaceProvider,
  MCPRegistryProvider,
  ARDProvider,
};
