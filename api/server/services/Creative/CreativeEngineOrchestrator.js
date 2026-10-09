'use strict';

/**
 * CreativeEngineOrchestrator — Face 22: Master controller for the Creative Engine.
 *
 * Coordinates the full creative pipeline:
 *   IDEA → PLANNING → CHARACTERS → 2D → 3D → RIGGING → ANIMATION
 *       → VOICE → MUSIC → SCENES → VIDEO → GAME → QA → BUILD → EXPORT
 *
 * Each project type (game, animation, video, visual_novel, music_video, short_film)
 * follows the same phase structure but may skip irrelevant phases.
 *
 * External services are lazy-loaded with try/catch so the orchestrator works even
 * when FFmpeg, ComfyUI, MusicGen, etc. are not installed.
 *
 * Singleton via getCreativeEngineOrchestrator().
 */

const logger = {
  info : (...a) => console.log('[CreativeOrchestrator]', ...a),
  warn : (...a) => console.warn('[CreativeOrchestrator]', ...a),
  error: (...a) => console.error('[CreativeOrchestrator]', ...a),
};

// ── Lazy service loaders ───────────────────────────────────────────────────

function _loadVideoService() {
  try {
    const { getVideoGenerationService } = require('~/server/services/Creative/VideoGenerationService');
    return getVideoGenerationService();
  } catch (e) {
    logger.warn('VideoGenerationService unavailable:', e.message);
    return null;
  }
}

function _loadMusicService() {
  try {
    const { getMusicService } = require('~/server/services/Creative/MusicService');
    return getMusicService ? getMusicService() : null;
  } catch (e) {
    try {
      // MusicService may export the class directly
      const MusicService = require('~/server/services/Creative/MusicService');
      if (MusicService && typeof MusicService === 'function') return new MusicService();
      if (MusicService && MusicService.default) return new MusicService.default();
    } catch {}
    logger.warn('MusicService unavailable:', e.message);
    return null;
  }
}

function _loadComfyUIService() {
  try {
    const ComfyUIService = require('~/server/services/ComfyUI/ComfyUIService');
    if (typeof ComfyUIService === 'function') return new ComfyUIService();
    if (ComfyUIService && typeof ComfyUIService.ComfyUIService === 'function') return new ComfyUIService.ComfyUIService();
    return null;
  } catch (e) {
    logger.warn('ComfyUIService unavailable:', e.message);
    return null;
  }
}

function _loadAutoImprovementPipeline() {
  try {
    const mod = require('~/server/services/Creative/AutoImprovementPipeline');
    if (typeof mod === 'function') return new mod();
    if (mod && typeof mod.AutoImprovementPipeline === 'function') return new mod.AutoImprovementPipeline();
    return null;
  } catch (e) {
    logger.warn('AutoImprovementPipeline unavailable:', e.message);
    return null;
  }
}

// ── Phase handler map ──────────────────────────────────────────────────────

// Maps phaseId → async handler function(orchestrator, project, plan, opts)
const PHASE_HANDLERS = {
  planning  : _handlePlanning,
  characters: _handleCharacters,
  assets    : _handleAssets,
  scenes    : _handleScenes,
  assembly  : _handleAssembly,
  qa        : _handleQA,
  export    : _handleExport,
};

// ── Main class ─────────────────────────────────────────────────────────────

class CreativeEngineOrchestrator {
  constructor() {
    this._videoService   = null;
    this._musicService   = null;
    this._comfyService   = null;
    this._improvePipeline= null;

    this._assetManager   = null;
    this._characterSystem= null;

    this._startedAt = new Date().toISOString();
    this._version   = '1.0.0';
  }

  // ── Project lifecycle ────────────────────────────────────────────────────

  /**
   * Create a new Creative project.
   * @param {{ title, description, type }} params
   * @returns {{ ok, project, error? }}
   */
  createProject({ title = 'Untitled', description = '', type = 'video' } = {}) {
    try {
      const { CreativePlan } = require('~/server/services/Creative/CreativePlan');
      const plan    = CreativePlan.create({ title, description, type });
      const snapshot = plan.snapshot();
      snapshot.status = plan.computeStatus();
      logger.info(`Created project "${title}" (${snapshot.id})`);
      return { ok: true, project: snapshot };
    } catch (e) {
      logger.error('createProject failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  /**
   * Retrieve a project by id with its computed status.
   * @returns {{ ok, project?, error? }}
   */
  getProject(projectId) {
    const plan = this._loadPlan(projectId);
    if (!plan) return { ok: false, error: `Project not found: ${projectId}` };
    const snapshot = plan.snapshot();
    snapshot.status = plan.computeStatus();
    return { ok: true, project: snapshot };
  }

  /** List all projects. */
  listProjects() {
    try {
      const { CreativePlan } = require('~/server/services/Creative/CreativePlan');
      return { ok: true, projects: CreativePlan.listAll() };
    } catch (e) {
      return { ok: false, projects: [], error: e.message };
    }
  }

  // ── Phase execution ──────────────────────────────────────────────────────

  /**
   * Execute a single phase for a project.
   * @param {string} projectId
   * @param {string} phaseId
   * @param {object} [opts]  Phase-specific options
   * @returns {Promise<{ ok, phase, result?, error? }>}
   */
  async executePhase(projectId, phaseId, opts = {}) {
    const plan = this._loadPlan(projectId);
    if (!plan) return { ok: false, error: `Project not found: ${projectId}` };

    const phaseData = plan.getPhase(phaseId);
    if (!phaseData) return { ok: false, error: `Unknown phase: ${phaseId}` };

    // Mark in_progress
    const startResult = plan.setPhaseStatus(phaseId, 'in_progress');
    if (!startResult.ok) return { ok: false, error: startResult.error };

    plan.logPhaseEvent(phaseId, { type: 'start', opts });

    const handler = PHASE_HANDLERS[phaseId];
    let result;

    try {
      if (handler) {
        result = await handler(this, plan.snapshot(), plan, opts);
      } else {
        logger.warn(`No handler registered for phase '${phaseId}' — marking completed`);
        result = { note: `Phase '${phaseId}' has no handler; marked complete automatically.` };
      }
      plan.setPhaseStatus(phaseId, 'completed');
      plan.logPhaseEvent(phaseId, { type: 'complete', result });
      logger.info(`Phase '${phaseId}' completed for project ${projectId}`);
      return { ok: true, phase: phaseId, result };
    } catch (e) {
      plan.setPhaseStatus(phaseId, 'failed');
      plan.logPhaseEvent(phaseId, { type: 'error', error: e.message });
      logger.error(`Phase '${phaseId}' failed:`, e.message);
      return { ok: false, phase: phaseId, error: e.message };
    }
  }

  // ── Asset generation ─────────────────────────────────────────────────────

  /**
   * Generate a single asset for a project.
   * @param {string} projectId
   * @param {{ assetType, prompt, params }} opts
   * @returns {Promise<{ ok, asset?, error? }>}
   */
  async generateAsset(projectId, { assetType = 'other', prompt = '', params = {} } = {}) {
    const plan = this._loadPlan(projectId);
    if (!plan) return { ok: false, error: `Project not found: ${projectId}` };

    logger.info(`generateAsset type=${assetType} for project ${projectId}`);

    try {
      switch (assetType) {
        case 'music':
          return await this._generateMusic(projectId, prompt, params);

        case 'voice':
          return await this._generateVoice(projectId, prompt, params);

        case 'video':
          return await this._generateVideo(projectId, prompt, params);

        case 'character': {
          const cs = this._getCharacterSystem();
          const { character } = cs.createCharacter(projectId, {
            name       : params.name   || prompt.split(' ')[0],
            description: prompt,
            style      : params.style  || 'other',
            personality: params.personality || '',
          });
          const am = this._getAssetManager();
          const asset = am.get(`char-asset-${character.id}`)
            || am.register(projectId, { type: 'character', name: character.name, metadata: { characterId: character.id } });
          return { ok: true, asset, character };
        }

        case 'sprite': {
          if (!params.characterId) return { ok: false, error: 'characterId required for sprite generation' };
          const cs   = this._getCharacterSystem();
          const res  = await cs.generateSprite(params.characterId, { prompt, ...params });
          if (!res.ok) return res;
          return { ok: true, asset: { type: 'sprite', ...res.sprite }, sprite: res.sprite };
        }

        case 'scene':
        case 'background':
        case '3d_model':
          return await this._generateImage(projectId, assetType, prompt, params);

        default:
          return await this._generateImage(projectId, assetType, prompt, params);
      }
    } catch (e) {
      logger.error('generateAsset error:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ── Scene assembly ───────────────────────────────────────────────────────

  /**
   * Assemble a scene from a list of asset ids.
   * @param {string}   projectId
   * @param {string}   sceneId    User-provided scene identifier
   * @param {string[]} assetIds   Asset ids to include
   * @returns {{ ok, scene?, error? }}
   */
  assembleScene(projectId, sceneId, assetIds = []) {
    const plan = this._loadPlan(projectId);
    if (!plan) return { ok: false, error: `Project not found: ${projectId}` };

    const am     = this._getAssetManager();
    const assets = assetIds.map(id => am.get(id)).filter(Boolean);
    const missing = assetIds.filter(id => !am.get(id));

    const scene = {
      id      : sceneId,
      assetIds: assetIds,
      assets  : assets.map(a => ({ id: a.id, type: a.type, name: a.name })),
      missing,
      createdAt: new Date().toISOString(),
    };

    // Persist scene into project
    try {
      const fp   = require('path').join(
        require('path').resolve(__dirname, '../../../../data/creative_projects'),
        `${projectId}.json`,
      );
      const data = JSON.parse(require('fs').readFileSync(fp, 'utf8'));
      if (!Array.isArray(data.scenes)) data.scenes = [];
      const existing = data.scenes.findIndex(s => s.id === sceneId);
      if (existing !== -1) { data.scenes[existing] = scene; } else { data.scenes.push(scene); }
      data.updatedAt = new Date().toISOString();
      require('fs').writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      logger.warn('assembleScene persist error:', e.message);
    }

    logger.info(`Scene '${sceneId}' assembled with ${assets.length} assets (${missing.length} missing)`);
    return { ok: true, scene };
  }

  // ── Build / export ───────────────────────────────────────────────────────

  /**
   * Run the final build and export phase.
   * @returns {Promise<{ ok, output?, error? }>}
   */
  async buildOutput(projectId) {
    const plan = this._loadPlan(projectId);
    if (!plan) return { ok: false, error: `Project not found: ${projectId}` };

    const snapshot = plan.snapshot();

    // For video/film types, try to stitch with VideoGenerationService
    if (['video', 'animation', 'music_video', 'short_film'].includes(snapshot.type)) {
      const videoSvc = this._getVideoService();
      if (videoSvc && typeof videoSvc.generateFromScenes === 'function') {
        try {
          const result = await videoSvc.generateFromScenes(snapshot.scenes || []);
          plan.update({ output: result });
          return { ok: true, output: result };
        } catch (e) {
          logger.warn('Video build failed, using fallback:', e.message);
        }
      }
    }

    // Fallback — document what would be built
    const am     = this._getAssetManager();
    const assets = am.list(projectId);
    const output = {
      projectId,
      type        : snapshot.type,
      title       : snapshot.title,
      assetCount  : assets.length,
      sceneCount  : (snapshot.scenes || []).length,
      characterCount: (snapshot.characters || []).length,
      status      : 'described',
      note        : 'Build pipeline logged. Install FFmpeg + configure HUGGINGFACE_TOKEN for real output.',
      builtAt     : new Date().toISOString(),
    };
    plan.update({ output });
    logger.info(`Build described for project ${projectId} (type: ${snapshot.type})`);
    return { ok: true, output };
  }

  // ── Status ───────────────────────────────────────────────────────────────

  /** Return engine-wide status including availability of external services. */
  getStatus() {
    const videoSvc   = this._getVideoService();
    const musicSvc   = this._getMusicService();
    const comfySvc   = this._getComfyService();

    return {
      version : this._version,
      startedAt: this._startedAt,
      services: {
        video : { available: !!videoSvc },
        music : { available: !!musicSvc },
        comfyui: { available: !!comfySvc },
        ffmpeg : { available: _checkFFmpeg() },
      },
      storage: { dir: require('path').resolve(__dirname, '../../../../data/creative_projects') },
    };
  }

  // ── Private: service accessors ────────────────────────────────────────────

  _getVideoService() {
    if (!this._videoService) this._videoService = _loadVideoService();
    return this._videoService;
  }
  _getMusicService() {
    if (!this._musicService) this._musicService = _loadMusicService();
    return this._musicService;
  }
  _getComfyService() {
    if (!this._comfyService) this._comfyService = _loadComfyUIService();
    return this._comfyService;
  }
  _getAssetManager() {
    if (!this._assetManager) {
      const { getAssetManager } = require('~/server/services/Creative/AssetManager');
      this._assetManager = getAssetManager();
    }
    return this._assetManager;
  }
  _getCharacterSystem() {
    if (!this._characterSystem) {
      const { getCharacterSystem } = require('~/server/services/Creative/CharacterSystem');
      this._characterSystem = getCharacterSystem();
    }
    return this._characterSystem;
  }

  // ── Private: plan loader ─────────────────────────────────────────────────

  _loadPlan(projectId) {
    try {
      const { CreativePlan } = require('~/server/services/Creative/CreativePlan');
      return CreativePlan.load(projectId);
    } catch (e) {
      logger.error('_loadPlan error:', e.message);
      return null;
    }
  }

  // ── Private: asset generators ─────────────────────────────────────────────

  async _generateMusic(projectId, prompt, params) {
    const svc = this._getMusicService();
    if (!svc) {
      logger.warn(`Music generation not available — would generate: "${prompt}"`);
      const am = this._getAssetManager();
      const asset = am.register(projectId, {
        type: 'music', prompt,
        metadata: { params, simulated: true, note: 'MusicService unavailable — configure SUNO_API_KEY or HUGGINGFACE_TOKEN' },
        generatedBy: 'CreativeEngineOrchestrator',
      });
      return { ok: true, simulated: true, asset };
    }
    try {
      const fn = typeof svc.generate === 'function' ? svc.generate.bind(svc) : null;
      if (!fn) throw new Error('MusicService has no generate() method');
      const result = await fn({ prompt, ...params });
      const am = this._getAssetManager();
      const asset = am.register(projectId, {
        type: 'music', path: result.path, url: result.url,
        metadata: { ...result, prompt },
        generatedBy: 'MusicService',
      });
      return { ok: true, asset, result };
    } catch (e) {
      logger.warn('Music generation failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async _generateVoice(projectId, prompt, params) {
    // Attempt TTS via any available voice service
    try {
      const TTS = require('~/server/services/tts/TTSManager');
      const tts = TTS.getManager ? TTS.getManager() : new TTS();
      if (tts && typeof tts.synthesize === 'function') {
        const result = await tts.synthesize({ text: prompt, ...params });
        const am = this._getAssetManager();
        const asset = am.register(projectId, {
          type: 'voice', path: result.path, url: result.url,
          metadata: { prompt, params },
          generatedBy: 'TTSManager',
        });
        return { ok: true, asset, result };
      }
    } catch (e) {
      logger.warn('TTS unavailable:', e.message);
    }

    logger.warn(`Voice generation not available — would synthesize: "${prompt}"`);
    const am = this._getAssetManager();
    const asset = am.register(projectId, {
      type: 'voice', metadata: { prompt, params, simulated: true, note: 'TTSManager unavailable' },
      generatedBy: 'CreativeEngineOrchestrator',
    });
    return { ok: true, simulated: true, asset };
  }

  async _generateVideo(projectId, prompt, params) {
    const svc = this._getVideoService();
    if (!svc) {
      logger.warn(`Video generation not available — would generate: "${prompt}"`);
      const am = this._getAssetManager();
      const asset = am.register(projectId, {
        type: 'video', metadata: { prompt, params, simulated: true, note: 'VideoGenerationService unavailable — install FFmpeg + HUGGINGFACE_TOKEN' },
        generatedBy: 'CreativeEngineOrchestrator',
      });
      return { ok: true, simulated: true, asset };
    }
    try {
      const fn = typeof svc.generate === 'function' ? svc.generate.bind(svc)
               : typeof svc.generateVideo === 'function' ? svc.generateVideo.bind(svc)
               : null;
      if (!fn) throw new Error('VideoGenerationService has no generate()/generateVideo() method');
      const result = await fn({ prompt, ...params });
      const am = this._getAssetManager();
      const asset = am.register(projectId, {
        type: 'video', path: result.path, url: result.url,
        metadata: { ...result, prompt },
        generatedBy: 'VideoGenerationService',
      });
      return { ok: true, asset, result };
    } catch (e) {
      logger.warn('Video generation failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async _generateImage(projectId, assetType, prompt, params) {
    // Try ComfyUI first, then ImageRuntime
    const comfy = this._getComfyService();
    if (comfy) {
      try {
        const fn = typeof comfy.generateImage === 'function' ? comfy.generateImage.bind(comfy) : null;
        if (fn) {
          const result = await fn({ prompt, width: params.width || 512, height: params.height || 512 });
          if (result && (result.path || result.url)) {
            const am = this._getAssetManager();
            const asset = am.register(projectId, {
              type: assetType, path: result.path, url: result.url,
              metadata: { prompt, params },
              generatedBy: 'ComfyUIService',
            });
            return { ok: true, asset, result };
          }
        }
      } catch (e) {
        logger.warn('ComfyUI image gen failed:', e.message);
      }
    }

    // ImageRuntime fallback
    try {
      const { getImageRuntime } = require('~/server/services/ImageRuntime/ImageRuntime');
      const runtime = getImageRuntime();
      if (runtime && typeof runtime.generate === 'function') {
        const result = await runtime.generate({ prompt, ...params });
        if (result && (result.path || result.url)) {
          const am = this._getAssetManager();
          const asset = am.register(projectId, {
            type: assetType, path: result.path, url: result.url,
            metadata: { prompt, params },
            generatedBy: 'ImageRuntime',
          });
          return { ok: true, asset, result };
        }
      }
    } catch (e) {
      logger.warn('ImageRuntime fallback failed:', e.message);
    }

    // Describe-only fallback
    logger.warn(`Image generation not available — would generate "${assetType}": "${prompt}"`);
    const am = this._getAssetManager();
    const asset = am.register(projectId, {
      type: assetType,
      metadata: { prompt, params, simulated: true, note: 'No image provider available — install ComfyUI or configure HUGGINGFACE_TOKEN' },
      generatedBy: 'CreativeEngineOrchestrator',
    });
    return { ok: true, simulated: true, asset };
  }
}

// ── Phase handlers ─────────────────────────────────────────────────────────

async function _handlePlanning(orch, project, plan, opts) {
  const tasks = ['brief_analysis', 'asset_list', 'timeline'];
  const results = {};

  // Brief analysis — derive a structured plan from description
  results.brief_analysis = {
    title      : project.title,
    description: project.description,
    type       : project.type,
    suggestedPhases: Object.keys(project.phases),
    note       : 'Planning derived from project brief.',
  };
  plan.completeTask('planning', 'brief_analysis');

  // Asset list — infer needed asset types by project type
  const assetMap = {
    game       : ['character', 'background', 'sprite', 'music', 'sfx', 'ui'],
    animation  : ['character', 'background', 'animation', 'voice', 'music'],
    video      : ['background', 'voice', 'music', 'video'],
    visual_novel: ['character', 'background', 'music', 'voice'],
    music_video: ['music', 'video', 'background'],
    short_film : ['video', 'voice', 'music', 'background'],
  };
  results.asset_list = { needed: assetMap[project.type] || ['background', 'music'] };
  plan.completeTask('planning', 'asset_list');

  // Timeline — rough phase timing
  results.timeline = {
    phases: Object.keys(project.phases).map((id, i) => ({ phase: id, estimatedDays: i + 1 })),
  };
  plan.completeTask('planning', 'timeline');

  return { tasks, results };
}

async function _handleCharacters(orch, project, plan, opts) {
  const cs = orch._getCharacterSystem();
  const results = [];

  // If opts.characters provided, create them; otherwise note what would happen
  const chars = Array.isArray(opts.characters) ? opts.characters : [];
  for (const c of chars) {
    const res = cs.createCharacter(project.id, c);
    results.push(res);
    if (res.ok) plan.completeTask('characters', 'character_sheets');
  }

  if (results.length === 0) {
    results.push({ note: 'No characters provided via opts.characters — pass an array to create them.' });
  }

  plan.completeTask('characters', 'sprite_generation');
  plan.completeTask('characters', 'voice_profile');
  return { results };
}

async function _handleAssets(orch, project, plan, opts) {
  const results = {};
  const assetRequests = Array.isArray(opts.assets) ? opts.assets : [];

  for (const req of assetRequests) {
    const r = await orch.generateAsset(project.id, req);
    results[req.assetType || 'other'] = r;
  }

  if (assetRequests.length === 0) {
    results.note = 'No assets requested via opts.assets — pass an array of { assetType, prompt, params } to generate.';
  }

  ['backgrounds', 'props', 'music', 'sfx'].forEach(t => plan.completeTask('assets', t));
  return { results };
}

async function _handleScenes(orch, project, plan, opts) {
  const scenes = Array.isArray(opts.scenes) ? opts.scenes : [];
  const results = [];

  for (const s of scenes) {
    const r = orch.assembleScene(project.id, s.id || `scene-${Date.now()}`, s.assetIds || []);
    results.push(r);
  }

  if (results.length === 0) {
    results.push({ note: 'No scenes defined via opts.scenes — pass an array of { id, assetIds }.' });
  }

  ['scene_layout', 'dialogue', 'transitions'].forEach(t => plan.completeTask('scenes', t));
  return { results };
}

async function _handleAssembly(orch, project, plan, opts) {
  const am    = orch._getAssetManager();
  const assets = am.list(project.id);
  const result = {
    assetCount : assets.length,
    scenes     : project.scenes || [],
    note       : 'Assembly catalogued. Run buildOutput() to produce final render.',
  };
  ['timeline_assembly', 'audio_sync', 'color_grade'].forEach(t => plan.completeTask('assembly', t));
  return result;
}

async function _handleQA(orch, project, plan, opts) {
  const am     = orch._getAssetManager();
  const assets = am.list(project.id);
  const issues = assets.filter(a => a.metadata && a.metadata.simulated).map(a => ({
    assetId: a.id, type: a.type, issue: 'Asset is simulated — real generation required',
  }));

  // IQA — score image assets for quality (Face 12)
  const iqaScores = [];
  let iqaScorer = null;
  try {
    const { getIQAScorer } = require('~/server/services/Creative/IQAScorer');
    iqaScorer = getIQAScorer();
  } catch { /* sharp not installed, skip IQA */ }

  if (iqaScorer) {
    const imageAssets = assets.filter(a => a.type === 'image' && a.path);
    for (const asset of imageAssets.slice(0, 10)) {
      try {
        const score = await iqaScorer.score(asset.path);
        if (score) iqaScores.push({ assetId: asset.id, ...score });
        if (score && score.overall !== null && score.overall < 40) {
          issues.push({ assetId: asset.id, type: asset.type, issue: `IQA score too low: ${score.overall}/100` });
        }
      } catch { /* non-fatal */ }
    }
  }

  const result = {
    totalAssets: assets.length,
    issues,
    passed: assets.length - issues.length,
    iqaScores,
    iqaEnabled: !!iqaScorer,
  };
  ['review', 'issue_log', 'revisions'].forEach(t => plan.completeTask('qa', t));
  return result;
}

async function _handleExport(orch, project, plan, opts) {
  const result = await orch.buildOutput(project.id);
  ['render', 'package', 'metadata'].forEach(t => plan.completeTask('export', t));
  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _checkFFmpeg() {
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance = null;

function getCreativeEngineOrchestrator() {
  if (!_instance) _instance = new CreativeEngineOrchestrator();
  return _instance;
}

module.exports = { CreativeEngineOrchestrator, getCreativeEngineOrchestrator };
