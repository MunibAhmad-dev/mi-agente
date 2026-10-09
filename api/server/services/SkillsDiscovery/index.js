/**
 * SkillsDiscovery — Sistema completo de descubrimiento, conversión e instalación de skills.
 *
 * Componentes:
 *   - CuratedRegistry:     whitelist/blacklist/deprecated de proyectos verificados
 *   - DiscoveryProviders:  busca en GitHub, HuggingFace, MCP Registry, ARD
 *   - SkillConverter:      convierte Claude/Copilot/Codex/Cursor/MCP → universal SKILL.md
 *   - SkillInstaller:      instala via git/npm/hf/npx + symlinks a .claude/.codex
 *   - AutoSkillMatcher:    IA analiza tarea → recomienda → instala → configura
 *
 * Visibilidad:
 *   - Route: /api/config/skills-registry (GET: ver registry, POST: buscar, POST: instalar)
 *   - Separado por tipo: skills, plugin, mcp-registry, marketplace, etc.
 *   - Separado por categoría: engineering, memory, ml-ai, full-stack, etc.
 */

const CuratedRegistry = require('./CuratedRegistry');
const DiscoveryProviders = require('./DiscoveryProviders');
const SkillConverter = require('./SkillConverter');
const SkillInstaller = require('./SkillInstaller');
const AutoSkillMatcher = require('./AutoSkillMatcher');

/**
 * Obtiene el registry completo para la UI de configuración.
 * @param {object} [filters] — { type, category, platform }
 * @returns {object}
 */
function getRegistry(filters = {}) {
  const summary = CuratedRegistry.getSummary();
  const whitelist = CuratedRegistry.getWhitelist(filters);
  const blacklist = CuratedRegistry.getBlacklist();
  const deprecated = CuratedRegistry.getDeprecated();
  const installed = SkillInstaller.listInstalled();

  // Marcar los instalados en la whitelist
  const installedNames = new Set(installed.map((s) => s.name));
  const whitelistWithStatus = whitelist.map((s) => ({
    ...s,
    installed: installedNames.has(s.name) || installedNames.has(s.id),
  }));

  return {
    ...summary,
    whitelist: whitelistWithStatus,
    blacklist,
    deprecated,
    installed: installed.map((s) => ({
      ...s,
      installed: true,
      type: 'installed',
    })),
  };
}

/**
 * Busca skills en todas las fuentes.
 * @param {object} opts — { query, type, category, limit, providers }
 * @returns {Promise<Array>}
 */
async function search(opts = {}) {
  return DiscoveryProviders.searchAll(opts);
}

/**
 * Instala un skill.
 * @param {object} entry
 * @returns {object}
 */
function install(entry) {
  return SkillInstaller.install(entry);
}

/**
 * Auto-match: analiza tarea → recomienda → instala → configura.
 * @param {object} ctx — { userTask, llmResponse, installedSkills }
 * @returns {Promise<object>}
 */
async function autoMatch(ctx) {
  return AutoSkillMatcher.autoMatch(ctx);
}

/**
 * Lista skills instalados localmente.
 * @returns {Array}
 */
function listInstalled() {
  return SkillInstaller.listInstalled();
}

/**
 * Desinstala un skill.
 * @param {string} name
 * @returns {boolean}
 */
function uninstall(name) {
  return SkillInstaller.uninstall(name);
}

module.exports = {
  getRegistry,
  search,
  install,
  autoMatch,
  listInstalled,
  uninstall,
  CuratedRegistry,
  DiscoveryProviders,
  SkillConverter,
  SkillInstaller,
  AutoSkillMatcher,
};
