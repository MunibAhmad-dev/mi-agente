'use strict';

/**
 * AssetManager — Face 22: Creative Engine asset registry.
 *
 * Tracks every generated or imported asset across a project:
 *   images, sprites, 3d_models, music, voice, video, backgrounds, props, etc.
 *
 * Assets are stored in the project's CreativePlan JSON via the plan's `assets` array,
 * but AssetManager keeps an in-memory index for fast lookup during a session.
 *
 * Singleton via getAssetManager().
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const logger = {
  info : (...a) => console.log('[AssetManager]', ...a),
  warn : (...a) => console.warn('[AssetManager]', ...a),
  error: (...a) => console.error('[AssetManager]', ...a),
};

const VALID_TYPES = [
  'character', 'scene', 'music', 'voice', 'video',
  'sprite', '3d_model', 'background', 'prop', 'sfx',
  'animation', 'concept_art', 'texture', 'other',
];

const PROJECTS_DIR = path.resolve(
  __dirname, '../../../../data/creative_projects',
);

function ensureDir(d) {
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* ignore */ }
}

class AssetManager {
  constructor() {
    // projectId → Map<assetId, asset>
    this._index = new Map();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Register a new asset for a project.
   * @param {string} projectId
   * @param {object} asset  { id?, type, path?, url?, metadata?, generatedBy? }
   * @returns {object} Registered asset record
   */
  register(projectId, asset = {}) {
    if (!projectId) throw new Error('projectId required');

    const type = VALID_TYPES.includes(asset.type) ? asset.type : 'other';
    const id   = asset.id || this._newId();

    const record = {
      id,
      type,
      projectId,
      path       : asset.path   || null,
      url        : asset.url    || null,
      name       : asset.name   || `${type}-${id.slice(0, 8)}`,
      metadata   : asset.metadata || {},
      generatedBy: asset.generatedBy || 'unknown',
      createdAt  : new Date().toISOString(),
      links      : [], // { targetId, relation }
    };

    this._ensureProject(projectId).set(id, record);
    this._persistProjectAssets(projectId);

    logger.info(`registered asset ${id} (${type}) for project ${projectId}`);
    return record;
  }

  /**
   * Retrieve a single asset by id (across all projects).
   * @returns {object|null}
   */
  get(assetId) {
    for (const map of this._index.values()) {
      if (map.has(assetId)) return map.get(assetId);
    }
    return null;
  }

  /**
   * List assets for a project, optionally filtered by type.
   * @param {string}  projectId
   * @param {string?} type  Optional filter
   * @returns {object[]}
   */
  list(projectId, type = null) {
    this._loadProjectAssets(projectId);
    const map = this._index.get(projectId);
    if (!map) return [];
    const all = Array.from(map.values());
    return type ? all.filter(a => a.type === type) : all;
  }

  /**
   * Link two assets with a named relation.
   * @param {string} assetId
   * @param {string} targetId
   * @param {string} relation  e.g. 'uses_voice', 'composed_into_scene', 'derived_from'
   */
  link(assetId, targetId, relation = 'related') {
    const asset = this.get(assetId);
    if (!asset) { logger.warn(`link: asset ${assetId} not found`); return false; }
    if (!asset.links) asset.links = [];
    const already = asset.links.some(l => l.targetId === targetId && l.relation === relation);
    if (!already) {
      asset.links.push({ targetId, relation, createdAt: new Date().toISOString() });
      this._persistProjectAssets(asset.projectId);
    }
    return true;
  }

  /**
   * Update metadata fields on an existing asset.
   */
  update(assetId, fields = {}) {
    const asset = this.get(assetId);
    if (!asset) return null;
    Object.assign(asset.metadata, fields.metadata || {});
    if (fields.path  !== undefined) asset.path  = fields.path;
    if (fields.url   !== undefined) asset.url   = fields.url;
    if (fields.name  !== undefined) asset.name  = fields.name;
    this._persistProjectAssets(asset.projectId);
    return asset;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _newId() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }

  _ensureProject(projectId) {
    if (!this._index.has(projectId)) {
      this._index.set(projectId, new Map());
      this._loadProjectAssets(projectId);
    }
    return this._index.get(projectId);
  }

  _loadProjectAssets(projectId) {
    if (this._index.has(projectId) && this._index.get(projectId).size > 0) return;
    ensureDir(PROJECTS_DIR);
    const fp = path.join(PROJECTS_DIR, `${projectId}.json`);
    if (!fs.existsSync(fp)) return;
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const map  = this._index.get(projectId) || new Map();
      for (const a of (data.assets || [])) map.set(a.id, a);
      this._index.set(projectId, map);
    } catch (e) {
      logger.warn('_loadProjectAssets error', e.message);
    }
  }

  _persistProjectAssets(projectId) {
    ensureDir(PROJECTS_DIR);
    const fp = path.join(PROJECTS_DIR, `${projectId}.json`);
    if (!fs.existsSync(fp)) return;
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const map  = this._index.get(projectId);
      data.assets   = map ? Array.from(map.values()) : data.assets || [];
      data.updatedAt = new Date().toISOString();
      fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      logger.warn('_persistProjectAssets error', e.message);
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance = null;

function getAssetManager() {
  if (!_instance) _instance = new AssetManager();
  return _instance;
}

module.exports = { AssetManager, getAssetManager, VALID_TYPES };
