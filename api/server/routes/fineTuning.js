/**
 * Fine-tuning routes — Face 15-16: Auto-learning & Self-Improvement.
 *
 * GET  /api/fine-tuning/status        — current job + system availability
 * GET  /api/fine-tuning/dataset/stats — dataset quality stats
 * POST /api/fine-tuning/dataset/export — export training data (alpaca/sharegpt)
 * POST /api/fine-tuning/start         — launch a real LoRA training job
 * GET  /api/fine-tuning/jobs          — list training jobs
 * GET  /api/fine-tuning/jobs/:id      — job detail + progress
 */
const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { exportShareGPT, exportAlpaca, getDatasetStats } = require('~/server/services/Training/DatasetBuilder');

const router = express.Router();
router.use(requireJwtAuth, requireCapability(SystemCapabilities.ACCESS_ADMIN));

let _ftManager = null;
function getFineTuningManager() {
  if (!_ftManager) {
    const { FineTuningManager } = require('~/server/services/Harness/cognitive/llm/FineTuningManager');
    _ftManager = new FineTuningManager();
  }
  return _ftManager;
}

/** GET /api/fine-tuning/status */
router.get('/status', async (req, res) => {
  try {
    const manager = getFineTuningManager();
    const available = typeof manager.checkAvailability === 'function'
      ? await manager.checkAvailability()
      : { unsloth: false, llamacpp: false };
    const current = manager._currentJob || null;
    res.json({ available, currentJob: current, totalJobs: manager._jobs?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/fine-tuning/dataset/stats */
router.get('/dataset/stats', async (req, res) => {
  try {
    const stats = await getDatasetStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/fine-tuning/dataset/export */
router.post('/dataset/export', async (req, res) => {
  try {
    const { format = 'sharegpt', minScore, limit, since } = req.body;
    const opts = { minScore, limit, since: since ? new Date(since) : undefined };
    const result = format === 'alpaca'
      ? await exportAlpaca(opts)
      : await exportShareGPT(opts);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/fine-tuning/backend — detect best available training backend */
router.get('/backend', async (req, res) => {
  try {
    const manager = getFineTuningManager();
    const backend = await manager.detectBackend();
    const availability = await manager.checkAvailability();
    res.json({ backend, availability, ready: !!backend });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/fine-tuning/start — create a training job (does not run it yet) */
router.post('/start', async (req, res) => {
  try {
    const { preset = 'quick', modelId, datasetPath, data, format, jobName } = req.body;

    const manager = getFineTuningManager();

    const result = await manager.startJob({
      preset,
      baseModel: modelId,
      datasetPath,
      data: Array.isArray(data) ? data : [],
      format: format || 'chat',
      jobName,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ job: result.job, command: result.command });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/fine-tuning/run/:jobId — execute the training script in the background.
 * Omit :jobId to run the current job.
 */
// Two routes: with and without jobId (path-to-regexp v8+ dropped optional ? param syntax)
async function handleRun(req, res) {
  try {
    const manager = getFineTuningManager();
    const result = await manager.runJob(req.params.jobId || undefined);
    if (!result.started) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
router.post('/run', handleRun);
router.post('/run/:jobId', async (req, res) => {
  try {
    const manager = getFineTuningManager();
    const result = await manager.runJob(req.params.jobId || undefined);
    if (!result.started) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/fine-tuning/jobs */
router.get('/jobs', (req, res) => {
  try {
    const manager = getFineTuningManager();
    res.json({ jobs: manager._jobs || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/fine-tuning/jobs/:id */
router.get('/jobs/:id', (req, res) => {
  try {
    const manager = getFineTuningManager();
    const job = (manager._jobs || []).find((j) => j.id === req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ job });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
