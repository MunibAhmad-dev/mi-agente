'use strict';

/**
 * CharacterSystem — Face 22: Character design and sprite management.
 *
 * Manages characters for a Creative project:
 *   - createCharacter  — registers a new character with design metadata
 *   - generateSprite   — requests a sprite image via ComfyUI / ImageRuntime / fallback
 *   - getCharacter     — retrieve by id
 *   - listCharacters   — list by project
 *
 * Characters are stored in the project's CreativePlan JSON (the `characters` array)
 * and registered as assets in AssetManager.
 *
 * Singleton via getCharacterSystem().
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const logger = {
  info : (...a) => console.log('[CharacterSystem]', ...a),
  warn : (...a) => console.warn('[CharacterSystem]', ...a),
  error: (...a) => console.error('[CharacterSystem]', ...a),
};

const PROJECTS_DIR = path.resolve(
  __dirname, '../../../../data/creative_projects',
);

const STYLES = ['anime', 'pixel', 'realistic', '3d', 'cartoon', 'comic', 'sketch', 'other'];
const POSES  = ['idle', 'walk', 'run', 'attack', 'defend', 'talk', 'jump', 'sit', 'custom'];
const EXPRESSIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'scared', 'confused', 'custom'];

function ensureDir(d) {
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* ignore */ }
}

function _loadProject(projectId) {
  const fp = path.join(PROJECTS_DIR, `${projectId}.json`);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

function _saveProject(data) {
  const fp = path.join(PROJECTS_DIR, `${data.id}.json`);
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

class CharacterSystem {
  constructor() {
    // Lazy-load ImageRuntime and AssetManager
    this._imageRuntime = null;
    this._assetManager = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Create a new character for a project.
   * @param {string} projectId
   * @param {object} fields { name, description, style, personality, traits?, voiceType? }
   * @returns {{ ok, character, error? }}
   */
  createCharacter(projectId, fields = {}) {
    if (!projectId) return { ok: false, error: 'projectId required' };

    ensureDir(PROJECTS_DIR);
    const project = _loadProject(projectId);
    if (!project) return { ok: false, error: `Project not found: ${projectId}` };

    const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const style = STYLES.includes(fields.style) ? fields.style : 'other';

    const character = {
      id,
      projectId,
      name        : fields.name        || `Character-${id.slice(0, 6)}`,
      description : fields.description || '',
      style,
      personality : fields.personality || '',
      traits      : Array.isArray(fields.traits) ? fields.traits : [],
      voiceType   : fields.voiceType   || 'neutral',
      sprites     : [],    // { pose, expression, assetId, path/url }
      createdAt   : new Date().toISOString(),
      updatedAt   : new Date().toISOString(),
    };

    if (!Array.isArray(project.characters)) project.characters = [];
    project.characters.push(character);
    _saveProject(project);

    // Register as an asset (type = 'character') so AssetManager tracks it
    try {
      const am = this._getAssetManager();
      am.register(projectId, {
        id  : `char-asset-${id}`,
        type: 'character',
        name: character.name,
        metadata: { characterId: id, style, personality: character.personality },
        generatedBy: 'CharacterSystem',
      });
    } catch (e) {
      logger.warn('AssetManager registration failed', e.message);
    }

    logger.info(`Created character "${character.name}" (${id}) for project ${projectId}`);
    return { ok: true, character };
  }

  /**
   * Generate a sprite image for a character.
   * Tries ComfyUI → ImageRuntime → graceful fallback.
   *
   * @param {string} characterId
   * @param {object} options { pose, expression, prompt?, outputDir? }
   * @returns {Promise<{ ok, sprite, error? }>}
   */
  async generateSprite(characterId, options = {}) {
    const { projectId, character } = this._findCharacter(characterId);
    if (!character) return { ok: false, error: `Character not found: ${characterId}` };

    const pose       = POSES.includes(options.pose) ? options.pose : 'idle';
    const expression = EXPRESSIONS.includes(options.expression) ? options.expression : 'neutral';
    const prompt     = options.prompt ||
      `${character.style} style character sprite, ${character.name}, ${pose} pose, ${expression} expression, ${character.description}, full body, white background, game asset`;

    logger.info(`Generating sprite for ${character.name} — pose:${pose} expr:${expression}`);

    // Attempt 1: ComfyUI
    let spriteResult = await this._tryComfyUI(prompt, options);

    // Attempt 2: ImageRuntime (HuggingFace SDXL / mock)
    if (!spriteResult.ok) {
      spriteResult = await this._tryImageRuntime(prompt, options);
    }

    // Attempt 3: graceful fallback — note what would happen
    if (!spriteResult.ok) {
      logger.warn(`Sprite generation not available. Would generate: "${prompt}"`);
      spriteResult = {
        ok        : true,
        simulated : true,
        path      : null,
        url       : null,
        note      : `Sprite not generated — no image provider available. Prompt: "${prompt}"`,
      };
    }

    const sprite = {
      id         : crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex'),
      pose,
      expression,
      prompt,
      path       : spriteResult.path || null,
      url        : spriteResult.url  || null,
      simulated  : spriteResult.simulated || false,
      note       : spriteResult.note || null,
      createdAt  : new Date().toISOString(),
    };

    // Persist sprite to character record
    character.sprites.push(sprite);
    character.updatedAt = new Date().toISOString();
    const project = _loadProject(projectId);
    if (project) {
      const idx = project.characters.findIndex(c => c.id === characterId);
      if (idx !== -1) project.characters[idx] = character;
      _saveProject(project);
    }

    // Register sprite as asset
    try {
      const am = this._getAssetManager();
      am.register(projectId, {
        id  : `sprite-${sprite.id}`,
        type: 'sprite',
        name: `${character.name} — ${pose}/${expression}`,
        path: sprite.path,
        url : sprite.url,
        metadata: { characterId, pose, expression, prompt, simulated: sprite.simulated },
        generatedBy: 'CharacterSystem',
      });
    } catch (e) {
      logger.warn('Sprite asset registration failed', e.message);
    }

    return { ok: true, sprite, character };
  }

  /**
   * Get a character by id (searches all projects).
   * @returns {{ projectId, character }|null}
   */
  getCharacter(characterId) {
    const found = this._findCharacter(characterId);
    if (!found.character) return null;
    return found;
  }

  /**
   * List all characters for a project.
   * @param {string} projectId
   * @returns {object[]}
   */
  listCharacters(projectId) {
    ensureDir(PROJECTS_DIR);
    const project = _loadProject(projectId);
    if (!project) return [];
    return Array.isArray(project.characters) ? project.characters : [];
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _findCharacter(characterId) {
    ensureDir(PROJECTS_DIR);
    try {
      const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const project = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8'));
          const character = (project.characters || []).find(c => c.id === characterId);
          if (character) return { projectId: project.id, character, project };
        } catch { /* skip bad files */ }
      }
    } catch (e) {
      logger.warn('_findCharacter scan error', e.message);
    }
    return { projectId: null, character: null, project: null };
  }

  async _tryComfyUI(prompt, options) {
    try {
      const { ComfyUIService } = require('~/server/services/ComfyUI/ComfyUIService');
      const svc = new ComfyUIService();
      // ComfyUIService.generateImage is not standard; adapt to what's available
      if (typeof svc.generateImage !== 'function' && typeof svc.generateWithWorkflow !== 'function') {
        return { ok: false, error: 'ComfyUI generateImage not available' };
      }
      const fn = typeof svc.generateImage === 'function' ? svc.generateImage.bind(svc) : svc.generateWithWorkflow.bind(svc);
      const result = await fn({ prompt, width: 512, height: 768 });
      if (result && (result.path || result.url)) return { ok: true, ...result };
      return { ok: false, error: 'ComfyUI returned no path/url' };
    } catch (e) {
      logger.warn('ComfyUI sprite attempt failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async _tryImageRuntime(prompt, options) {
    try {
      const { getImageRuntime } = require('~/server/services/ImageRuntime/ImageRuntime');
      const runtime = getImageRuntime();
      if (!runtime || typeof runtime.generate !== 'function') {
        return { ok: false, error: 'ImageRuntime not available' };
      }
      const result = await runtime.generate({ prompt, width: 512, height: 768 });
      if (result && (result.path || result.url)) return { ok: true, ...result };
      return { ok: false, error: 'ImageRuntime returned no path/url' };
    } catch (e) {
      logger.warn('ImageRuntime sprite attempt failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  _getAssetManager() {
    if (!this._assetManager) {
      const { getAssetManager } = require('~/server/services/Creative/AssetManager');
      this._assetManager = getAssetManager();
    }
    return this._assetManager;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance = null;

function getCharacterSystem() {
  if (!_instance) _instance = new CharacterSystem();
  return _instance;
}

module.exports = { CharacterSystem, getCharacterSystem, STYLES, POSES, EXPRESSIONS };
