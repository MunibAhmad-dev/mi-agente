'use strict';

/**
 * Creative Engine routes — Face 22-23.
 *
 * Video (FFmpeg + ImageRuntime):
 *   GET  /api/creative/video/status        — check FFmpeg availability
 *   POST /api/creative/video/generate      — generate video, stream MP4 back
 *   POST /api/creative/video/generate-info — generate video, return metadata JSON (no stream)
 *
 * Music (MusicGen / Suno):
 *   GET  /api/creative/music/providers     — list configured providers
 *   POST /api/creative/music/generate      — generate audio, stream back
 *   POST /api/creative/music/generate-info — generate audio, return metadata JSON (no stream)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

/* ════════════════════════════════════════
   VIDEO
════════════════════════════════════════ */

/** GET /api/creative/video/status */
router.get('/video/status', (req, res) => {
  try {
    const { isFFmpegAvailable } = require('~/server/services/Creative/VideoGenerationService');
    res.json({ ffmpeg: isFFmpegAvailable(), ready: isFFmpegAvailable() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/creative/video/generate
 * Body: { prompt, keyframes?, frameCount?, fps?, width?, height? }
 * Streams the generated MP4 file directly.
 */
router.post('/video/generate', async (req, res) => {
  try {
    const { generateVideo } = require('~/server/services/Creative/VideoGenerationService');
    const { prompt, keyframes, frameCount, fps, width, height } = req.body;

    if (!prompt && (!keyframes || !keyframes.length)) {
      return res.status(400).json({ error: 'prompt or keyframes required' });
    }

    const result = await generateVideo({ prompt, keyframes, frameCount, fps, width, height });

    const stat = fs.statSync(result.videoPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="generated-video-${Date.now()}.mp4"`);
    fs.createReadStream(result.videoPath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/creative/video/generate-info
 * Same as above but returns JSON with metadata instead of streaming the file.
 * The file stays on the server; caller can read it from videoPath.
 */
router.post('/video/generate-info', async (req, res) => {
  try {
    const { generateVideo } = require('~/server/services/Creative/VideoGenerationService');
    const { prompt, keyframes, frameCount, fps, width, height } = req.body;

    if (!prompt && (!keyframes || !keyframes.length)) {
      return res.status(400).json({ error: 'prompt or keyframes required' });
    }

    const result = await generateVideo({ prompt, keyframes, frameCount, fps, width, height });
    res.json({
      ok: true,
      videoPath: result.videoPath,
      duration: result.duration,
      fps: result.fps,
      frameCount: result.frameCount,
      workDir: result.workDir,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════
   MUSIC
════════════════════════════════════════ */

/** GET /api/creative/music/providers */
router.get('/music/providers', (req, res) => {
  try {
    const { getAvailableProviders } = require('~/server/services/Creative/MusicService');
    res.json({ providers: getAvailableProviders() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/creative/music/generate
 * Body: { prompt, durationSeconds?, genre?, provider? }
 * Streams the generated audio file (MP3 or FLAC).
 */
router.post('/music/generate', async (req, res) => {
  try {
    const { generateMusic } = require('~/server/services/Creative/MusicService');
    const { prompt, durationSeconds, genre, provider } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const result = await generateMusic({ prompt, durationSeconds, genre, provider });

    const stat = fs.statSync(result.audioPath);
    const ext = result.format || path.extname(result.audioPath).slice(1) || 'mp3';
    const mimeTypes = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg' };

    res.setHeader('Content-Type', mimeTypes[ext] || 'audio/mpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="generated-music-${Date.now()}.${ext}"`);
    fs.createReadStream(result.audioPath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/creative/music/generate-info
 * Same but returns JSON metadata; audio file stays on server at audioPath.
 */
router.post('/music/generate-info', async (req, res) => {
  try {
    const { generateMusic } = require('~/server/services/Creative/MusicService');
    const { prompt, durationSeconds, genre, provider } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const result = await generateMusic({ prompt, durationSeconds, genre, provider });
    res.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      format: result.format,
      prompt: result.prompt,
      duration: result.duration,
      audioPath: result.audioPath,
      ...(result.sunoClipId ? { sunoClipId: result.sunoClipId, sunoTitle: result.sunoTitle } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════
   AUTO-IMPROVEMENT PIPELINE — Face 12
════════════════════════════════════════ */

let _autoPipeline = null;
function getAutoPipeline() {
  if (!_autoPipeline) {
    try {
      const { AutoImprovementPipeline } = require('~/server/services/Creative/AutoImprovementPipeline');
      _autoPipeline = new AutoImprovementPipeline({ maxIterations: 3, targetScore: 0.8 });
    } catch (e) {
      _autoPipeline = null;
    }
  }
  return _autoPipeline;
}

/** GET /api/creative/auto-improvement/status */
router.get('/auto-improvement/status', (req, res) => {
  try {
    const pipeline = getAutoPipeline();
    if (!pipeline) return res.status(503).json({ error: 'AutoImprovementPipeline not available' });
    const history = pipeline.getHistory();
    res.json({ available: true, runs: history.length, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/creative/auto-improvement/run — run an improvement cycle */
router.post('/auto-improvement/run', async (req, res) => {
  try {
    const pipeline = getAutoPipeline();
    if (!pipeline) return res.status(503).json({ error: 'AutoImprovementPipeline not available' });
    const { params = {}, generatorFn } = req.body || {};
    const result = await pipeline.run(params);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/creative/auto-improvement/history — list past improvement runs */
router.get('/auto-improvement/history', (req, res) => {
  try {
    const pipeline = getAutoPipeline();
    if (!pipeline) return res.status(503).json({ error: 'AutoImprovementPipeline not available' });
    res.json({ history: pipeline.getHistory() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
