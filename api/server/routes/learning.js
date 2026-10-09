/**
 * Learning API routes — Face 9: Agent Training & Learning from Experience.
 *
 * GET  /api/learning/experiences  — recent experience replay records
 * POST /api/learning/experiences  — store a new experience manually
 * GET  /api/learning/stats        — aggregated stats per task type
 * POST /api/learning/reflect      — trigger a reflection on a given experience
 */
const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { saveExperience, getExperiences, getLearningStats } = require('~/models/ExperienceReplay');
const { LearningEngine } = require('~/server/services/Harness/cognitive/learning/LearningEngine');

const router = express.Router();
router.use(requireJwtAuth);

const engine = new LearningEngine();

/** GET /api/learning/experiences */
router.get('/experiences', async (req, res) => {
  try {
    const { taskType, outcome, limit = 20, skip = 0 } = req.query;
    const experiences = await getExperiences({
      taskType,
      outcome,
      limit: Number(limit),
      skip: Number(skip),
    });
    res.json({ experiences });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/learning/experiences */
router.post('/experiences', async (req, res) => {
  try {
    const doc = await saveExperience({ ...req.body, userId: req.user?.id });
    res.json({ experience: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/learning/stats */
router.get('/stats', async (req, res) => {
  try {
    const [dbStats, engineStats] = await Promise.all([
      getLearningStats(),
      Promise.resolve(engine.getStats()),
    ]);
    res.json({ dbStats, engineStats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/learning/reflect — trigger LearningEngine.reflect() on a given experience object */
router.post('/reflect', async (req, res) => {
  try {
    const reflection = await engine.reflect(req.body);
    res.json({ reflection });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/learning/replay — get recent experiences for replay, optionally filtered */
router.get('/replay', async (req, res) => {
  try {
    const { taskType, outcome, n = 10 } = req.query;
    const replay = await engine.experienceReplay(Number(n), { taskType, outcome });
    res.json({ replay });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/learning/patterns
 * Aggregate experiences by taskType + outcome and return failure counts.
 * Useful as a quick dashboard of where the agent struggles most.
 */
router.get('/patterns', async (req, res) => {
  try {
    const all = await getExperiences({ limit: 200, skip: 0 });
    const map = {};
    for (const exp of all) {
      const key = `${exp.taskType || 'unknown'}::${exp.outcome || 'unknown'}`;
      if (!map[key]) map[key] = { taskType: exp.taskType || 'unknown', outcome: exp.outcome || 'unknown', count: 0 };
      map[key].count++;
    }
    const patterns = Object.values(map).sort((a, b) => b.count - a.count);
    res.json({ patterns, total: all.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/learning/improve
 * Analyze recent failed/partial experiences and surface concrete improvement rules.
 * Face 16: f16-1 — self-improvement loop.
 *
 * body: { limit?, taskType? }
 * Returns: { improvements: Array<{ rule, pattern, frequency, examples }>, totalFailures }
 */
router.post('/improve', async (req, res) => {
  try {
    const { limit = 50, taskType } = req.body;
    const failures = await getExperiences({
      outcome: 'failure',
      taskType,
      limit: Number(limit),
      skip: 0,
    });

    // Group failures by task type and collect improvement signals
    const byType = {};
    for (const exp of failures) {
      const type = exp.taskType || 'unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(exp);
    }

    const improvements = [];
    for (const [type, exps] of Object.entries(byType)) {
      // Collect per-experience improvement suggestions from the engine
      const signals = [];
      for (const exp of exps) {
        try {
          const reflection = await engine.reflect(exp);
          if (reflection?.improvements?.length) {
            signals.push(...reflection.improvements);
          }
        } catch {
          // skip if reflection fails for one experience
        }
      }

      // Aggregate: count frequency of each unique rule
      const freq = {};
      for (const s of signals) {
        freq[s] = (freq[s] || 0) + 1;
      }

      for (const [rule, count] of Object.entries(freq)) {
        improvements.push({
          rule,
          pattern: type,
          frequency: count,
          affectedExperiences: exps.length,
        });
      }
    }

    // Sort by frequency descending
    improvements.sort((a, b) => b.frequency - a.frequency);

    res.json({
      improvements,
      totalFailures: failures.length,
      analyzedTypes: Object.keys(byType),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/learning/schedule-retraining — Face 15: start periodic auto-retraining.
 * body: { intervalMs?, thresholdExperiences?, ftOpts? }
 */
router.post('/schedule-retraining', async (req, res) => {
  try {
    const { intervalMs, thresholdExperiences, ftOpts } = req.body || {};
    const result = engine.scheduleRetraining(
      typeof intervalMs === 'number' ? intervalMs : undefined,
      typeof thresholdExperiences === 'number' ? thresholdExperiences : undefined,
      ftOpts || {},
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/learning/stop-retraining — Face 15: cancel scheduled auto-retraining.
 */
router.post('/stop-retraining', (req, res) => {
  try {
    res.json(engine.stopRetraining());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
