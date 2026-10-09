'use strict';

/**
 * Creative Engine API — Face 22: Orchestrator REST routes.
 *
 *   GET  /api/creative-engine/status                          — engine + service status
 *   POST /api/creative-engine/projects                        — createProject
 *   GET  /api/creative-engine/projects                        — listProjects
 *   GET  /api/creative-engine/projects/:id                    — getProject + computed status
 *   POST /api/creative-engine/projects/:id/phase/:phaseId     — executePhase
 *   POST /api/creative-engine/projects/:id/generate           — generateAsset
 *   POST /api/creative-engine/projects/:id/assemble           — assembleScene
 *   POST /api/creative-engine/projects/:id/build              — buildOutput (final export)
 *   GET  /api/creative-engine/projects/:id/assets             — list assets (optional ?type=)
 *   POST /api/creative-engine/projects/:id/characters         — createCharacter
 *   GET  /api/creative-engine/projects/:id/characters         — listCharacters
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

// Lazy-load orchestrator singleton so startup never crashes if a dep is missing
let _orch = null;
function getOrch() {
  if (!_orch) {
    try {
      const { getCreativeEngineOrchestrator } = require('~/server/services/Creative/CreativeEngineOrchestrator');
      _orch = getCreativeEngineOrchestrator();
    } catch (e) {
      _orch = _fallbackOrchestrator(e.message);
    }
  }
  return _orch;
}

// Lazy-load asset manager
let _am = null;
function getAM() {
  if (!_am) {
    try {
      const { getAssetManager } = require('~/server/services/Creative/AssetManager');
      _am = getAssetManager();
    } catch (e) {
      _am = {
        list: () => [],
        get : () => null,
      };
    }
  }
  return _am;
}

// Lazy-load character system
let _cs = null;
function getCS() {
  if (!_cs) {
    try {
      const { getCharacterSystem } = require('~/server/services/Creative/CharacterSystem');
      _cs = getCharacterSystem();
    } catch (e) {
      _cs = {
        createCharacter : () => ({ ok: false, error: 'CharacterSystem unavailable: ' + e.message }),
        listCharacters  : () => [],
      };
    }
  }
  return _cs;
}

/* ══════════════════════════════════════════════════════════════
   GET /status — engine health check
══════════════════════════════════════════════════════════════ */
router.get('/status', (req, res) => {
  try {
    res.json({ ok: true, ...getOrch().getStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /projects — create a new project
══════════════════════════════════════════════════════════════ */
router.post('/projects', (req, res) => {
  try {
    const { title, description, type } = req.body || {};
    if (!title) return res.status(400).json({ ok: false, error: 'title is required' });
    const result = getOrch().createProject({ title, description, type });
    if (!result.ok) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /projects — list all projects
══════════════════════════════════════════════════════════════ */
router.get('/projects', (req, res) => {
  try {
    res.json(getOrch().listProjects());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /projects/:id — get project + status
══════════════════════════════════════════════════════════════ */
router.get('/projects/:id', (req, res) => {
  try {
    const result = getOrch().getProject(req.params.id);
    if (!result.ok) return res.status(404).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /projects/:id/phase/:phaseId — execute a phase
══════════════════════════════════════════════════════════════ */
router.post('/projects/:id/phase/:phaseId', async (req, res) => {
  try {
    const { id, phaseId } = req.params;
    const opts = req.body || {};
    const result = await getOrch().executePhase(id, phaseId, opts);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /projects/:id/generate — generate an asset
══════════════════════════════════════════════════════════════ */
router.post('/projects/:id/generate', async (req, res) => {
  try {
    const { assetType, prompt, params } = req.body || {};
    if (!assetType) return res.status(400).json({ ok: false, error: 'assetType is required' });
    const result = await getOrch().generateAsset(req.params.id, { assetType, prompt, params: params || {} });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /projects/:id/assemble — assemble a scene from assets
══════════════════════════════════════════════════════════════ */
router.post('/projects/:id/assemble', (req, res) => {
  try {
    const { sceneId, assetIds } = req.body || {};
    if (!sceneId) return res.status(400).json({ ok: false, error: 'sceneId is required' });
    const result = getOrch().assembleScene(req.params.id, sceneId, assetIds || []);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /projects/:id/build — build final output
══════════════════════════════════════════════════════════════ */
router.post('/projects/:id/build', async (req, res) => {
  try {
    const result = await getOrch().buildOutput(req.params.id);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /projects/:id/assets — list project assets
══════════════════════════════════════════════════════════════ */
router.get('/projects/:id/assets', (req, res) => {
  try {
    const type   = req.query.type || null;
    const assets = getAM().list(req.params.id, type);
    res.json({ ok: true, assets, count: assets.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /projects/:id/characters — create a character
══════════════════════════════════════════════════════════════ */
router.post('/projects/:id/characters', (req, res) => {
  try {
    const { name, description, style, personality, traits, voiceType } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, error: 'name is required' });
    const result = getCS().createCharacter(req.params.id, { name, description, style, personality, traits, voiceType });
    if (!result.ok) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /projects/:id/characters — list characters
══════════════════════════════════════════════════════════════ */
router.get('/projects/:id/characters', (req, res) => {
  try {
    const characters = getCS().listCharacters(req.params.id);
    res.json({ ok: true, characters, count: characters.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   Fallback orchestrator — returned when the real one fails to load
══════════════════════════════════════════════════════════════ */
function _fallbackOrchestrator(reason) {
  const msg = `CreativeEngineOrchestrator unavailable: ${reason}`;
  return {
    getStatus      : () => ({ ok: false, error: msg, services: {} }),
    createProject  : () => ({ ok: false, error: msg }),
    getProject     : () => ({ ok: false, error: msg }),
    listProjects   : () => ({ ok: false, projects: [], error: msg }),
    executePhase   : async () => ({ ok: false, error: msg }),
    generateAsset  : async () => ({ ok: false, error: msg }),
    assembleScene  : () => ({ ok: false, error: msg }),
    buildOutput    : async () => ({ ok: false, error: msg }),
  };
}

module.exports = router;
