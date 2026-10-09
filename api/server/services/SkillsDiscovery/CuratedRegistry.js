/**
 * CuratedRegistry — Gestión de whitelist/blacklist/deprecated de skills.
 *
 * Mantiene un registro persistente de:
 *   - whitelist: proyectos verificados, permisivos (MIT/Apache-2.0), activos
 *   - blacklist: proyectos no permisivos o problemáticos (con alternativas)
 *   - deprecated: proyectos desactualizados o no funcionales
 *
 * Los datos viven en curated-registry.json (versionado en el repo).
 * En runtime se carga en memoria para acceso rápido.
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, 'curated-registry.json');

let _cache = null;
let _cacheTime = 0;

/** Licencias permisivas aceptadas. */
const PERMISSIVE_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
  'Unlicense',
]);

/**
 * Carga el registry desde disco (con cache en memoria).
 * @param {boolean} [force] — forzar recarga
 * @returns {object}
 */
function load(force = false) {
  const now = Date.now();
  if (!force && _cache && now - _cacheTime < 60000) {
    return _cache;
  }
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  _cache = JSON.parse(raw);
  _cacheTime = now;
  return _cache;
}

/**
 * Obtiene toda la whitelist.
 * @param {object} [filters] — { type, category, platform }
 * @returns {Array}
 */
function getWhitelist(filters = {}) {
  const data = load();
  let results = data.whitelist || [];
  if (filters.type) {
    results = results.filter((e) => e.type === filters.type);
  }
  if (filters.category) {
    results = results.filter((e) => e.category === filters.category);
  }
  if (filters.platform) {
    results = results.filter((e) => e.platforms && e.platforms.includes(filters.platform));
  }
  return results;
}

/**
 * Obtiene la blacklist (proyectos no permisivos).
 * @returns {Array}
 */
function getBlacklist() {
  const data = load();
  return data.blacklist || [];
}

/**
 * Obtiene los proyectos deprecated.
 * @returns {Array}
 */
function getDeprecated() {
  const data = load();
  return data.deprecated || [];
}

/**
 * Verifica si un source está en la blacklist.
 * @param {string} source — github:owner/repo
 * @returns {object|null} entrada de blacklist o null
 */
function isInBlacklist(source) {
  const data = load();
  return (data.blacklist || []).find((e) => e.source === source) || null;
}

/**
 * Verifica si un source está en la whitelist.
 * @param {string} source — github:owner/repo
 * @returns {object|null} entrada de whitelist o null
 */
function isInWhitelist(source) {
  const data = load();
  return (data.whitelist || []).find((e) => e.source === source) || null;
}

/**
 * Verifica si una licencia es permisiva.
 * @param {string} license
 * @returns {boolean}
 */
function isPermissive(license) {
  if (!license) return false;
  return PERMISSIVE_LICENSES.has(license);
}

/**
 * Obtiene todas las categorías disponibles agrupadas por tipo.
 * @returns {object}
 */
function getCategories() {
  const data = load();
  return data.categories || {};
}

/**
 * Obtiene todos los tipos disponibles.
 * @returns {Array}
 */
function getTypes() {
  const data = load();
  return data.types || [];
}

/**
 * Obtiene un resumen del registry para la UI.
 * @returns {object}
 */
function getSummary() {
  const data = load();
  return {
    version: data.version,
    lastUpdated: data.lastUpdated,
    totalWhitelist: (data.whitelist || []).length,
    totalBlacklist: (data.blacklist || []).length,
    totalDeprecated: (data.deprecated || []).length,
    types: data.types || [],
    categories: data.categories || {},
  };
}

/**
 * Busca una alternativa para un proyecto blacklist.
 * @param {string} source
 * @returns {Array} entradas de whitelist alternativas
 */
function getAlternatives(source) {
  const data = load();
  const entry = (data.blacklist || []).find((e) => e.source === source);
  if (!entry || !entry.alternatives) return [];
  return (data.alternatives || [])
    .map((altId) => (data.whitelist || []).find((w) => w.id === altId))
    .filter(Boolean);
}

module.exports = {
  load,
  getWhitelist,
  getBlacklist,
  getDeprecated,
  isInBlacklist,
  isInWhitelist,
  isPermissive,
  getCategories,
  getTypes,
  getSummary,
  getAlternatives,
  PERMISSIVE_LICENSES,
};
