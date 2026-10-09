/**
 * Resolves `missing_capabilities` from a plan against what's actually
 * available in the workspace, and classifies each one so the caller (API
 * controller / UI) knows what needs a user confirmation before install.
 *
 * This is intentionally dependency-injected rather than importing
 * `getCachedTools` / the skills marketplace search directly: the Architect
 * package has no business knowing the internal shape of those services, and
 * DI keeps this file testable with fakes. The real implementations are wired
 * in `controllers/agents/architect.js`, where `req`/app config are available.
 *
 * @param {object} params
 * @param {string[]} params.missingCapabilities
 * @param {() => Promise<Array<{ name: string }>>} params.listAvailableTools -
 *   should return the workspace's already-installed tools/skills/MCP servers.
 * @param {(query: string) => Promise<Array<{ name: string, source: string }>>} [params.searchSkillCatalog] -
 *   should search the skills marketplace / GitHub-synced catalog.
 */
async function resolveMissingCapabilities({
  missingCapabilities,
  listAvailableTools,
  searchSkillCatalog,
}) {
  if (!missingCapabilities?.length) {
    return [];
  }

  const available = await listAvailableTools().catch(() => []);
  const availableNames = new Set(available.map((t) => normalize(t.name)));

  const resolutions = [];
  for (const capability of missingCapabilities) {
    if (availableNames.has(normalize(capability))) {
      resolutions.push({ capability, status: 'resolved', source: 'already_available' });
      continue;
    }

    if (!searchSkillCatalog) {
      resolutions.push({ capability, status: 'unresolved', source: null });
      continue;
    }

    const matches = await searchSkillCatalog(capability).catch(() => []);
    if (matches.length > 0) {
      resolutions.push({
        capability,
        status: 'installable',
        source: matches[0].source,
        candidates: matches.slice(0, 5),
      });
    } else {
      resolutions.push({ capability, status: 'unresolved', source: null });
    }
  }

  return resolutions;
}

function normalize(name = '') {
  return String(name).trim().toLowerCase();
}

module.exports = { resolveMissingCapabilities };
