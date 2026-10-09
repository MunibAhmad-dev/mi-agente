/**
 * Reputation Monitoring & Case Intelligence routes — Face 19-20.
 *
 * GET    /api/reputation/targets              — list monitored targets
 * POST   /api/reputation/targets              — add a new target
 * PATCH  /api/reputation/targets/:id         — update target settings
 * DELETE /api/reputation/targets/:id          — remove a target
 * POST   /api/reputation/targets/:id/scan     — run manual scan now
 * GET    /api/reputation/targets/:id/scans    — history of scans for a target
 * POST   /api/reputation/targets/:id/claims   — extract & classify claims from latest scan
 * POST   /api/reputation/targets/:id/actions  — generate action templates
 * GET    /api/reputation/scans/latest         — latest scan for each target
 * POST   /api/reputation/scan-due             — scan all targets that are due (cron use)
 */
const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { ReputationTarget, ReputationScan } = require('~/models/ReputationMonitor');
const {
  runScan,
  scanDueTargets,
  extractClaims,
  generateActions,
} = require('~/server/services/ReputationMonitor/ReputationMonitorService');

const router = express.Router();
router.use(requireJwtAuth);

/** Verify the requesting user owns the target. Returns lean target or sends 403/404. */
async function requireTargetOwnership(req, res, targetId) {
  const target = await ReputationTarget.findOne({ _id: targetId, createdBy: req.user?.id }).lean();
  if (!target) {
    res.status(404).json({ error: 'Target not found' });
    return null;
  }
  return target;
}

/** List all targets for the current user */
router.get('/targets', async (req, res) => {
  try {
    const targets = await ReputationTarget.find({ createdBy: req.user?.id }).sort({ createdAt: -1 }).lean();
    res.json({ targets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Add a target */
router.post('/targets', async (req, res) => {
  try {
    const { name, keywords, language, sources, scanIntervalHours } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const target = await ReputationTarget.create({
      name, keywords, language, sources, scanIntervalHours,
      createdBy: req.user?.id,
    });
    res.json({ target });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Update target settings */
router.patch('/targets/:id', async (req, res) => {
  try {
    const { keywords, language, sources, scanIntervalHours, isActive } = req.body;
    const target = await ReputationTarget.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user?.id },
      { $set: { keywords, language, sources, scanIntervalHours, isActive } },
      { new: true },
    );
    if (!target) return res.status(404).json({ error: 'Target not found' });
    res.json({ target });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Delete a target */
router.delete('/targets/:id', async (req, res) => {
  try {
    await ReputationTarget.findOneAndDelete({ _id: req.params.id, createdBy: req.user?.id });
    await ReputationScan.deleteMany({ targetId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Manual scan now */
router.post('/targets/:id/scan', async (req, res) => {
  try {
    const target = await ReputationTarget.findOne({ _id: req.params.id, createdBy: req.user?.id });
    if (!target) return res.status(404).json({ error: 'Target not found' });
    const scan = await runScan(target);
    res.json({ scan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Scan history for a target */
router.get('/targets/:id/scans', async (req, res) => {
  try {
    const target = await requireTargetOwnership(req, res, req.params.id);
    if (!target) return;
    const scans = await ReputationScan.find({ targetId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ scans });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Extract & classify claims from the latest scan using LLM */
router.post('/targets/:id/claims', async (req, res) => {
  try {
    const target = await requireTargetOwnership(req, res, req.params.id);
    if (!target) return;
    const scan = await ReputationScan.findOne({ targetId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();
    if (!scan) return res.status(404).json({ error: 'No scans found for this target. Run a scan first.' });
    const claims = await extractClaims(scan);
    res.json({ claims, scanId: scan._id, targetName: scan.targetName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Generate action templates (correction request, report, takedown, public response) */
router.post('/targets/:id/actions', async (req, res) => {
  try {
    const { claims = [] } = req.body;
    const target = await ReputationTarget.findOne({ _id: req.params.id, createdBy: req.user?.id }).lean();
    if (!target) return res.status(404).json({ error: 'Target not found' });
    const actions = generateActions(target.name, claims);
    res.json({ actions, targetName: target.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Latest scan per target (for the current user's targets) */
router.get('/scans/latest', async (req, res) => {
  try {
    const userTargets = await ReputationTarget.find({ createdBy: req.user?.id }).select('_id').lean();
    const ids = userTargets.map((t) => t._id);
    const latest = await ReputationScan.aggregate([
      { $match: { targetId: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$targetId', scan: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$scan' } },
    ]);
    res.json({ scans: latest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Scan all due targets (called by scheduler cron) */
router.post('/scan-due', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const results = await scanDueTargets();
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─── Face 19-20: Advanced Reputation Intelligence ────────────────────────────

let _repSvc = null;
function getRepSvc() {
  if (!_repSvc) {
    try { _repSvc = require('~/server/services/DigitalReputation'); } catch { _repSvc = null; }
  }
  return _repSvc;
}

/** GET /api/reputation/health */
router.get('/health', (req, res) => res.json({ status: 'ok' }));

/** POST /api/reputation/sentiment — ML sentiment analysis */
router.post('/sentiment', async (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'DigitalReputation services not available' });
    const { text, texts } = req.body;
    if (texts && Array.isArray(texts)) {
      const results = await svc.MLSentiment.analyzeBatch(texts);
      return res.json({ results, aggregate: svc.MLSentiment.aggregate(results) });
    }
    if (!text) return res.status(400).json({ error: 'text or texts required' });
    res.json(await svc.MLSentiment.analyze(text));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/reputation/disputes — list disputes */
router.get('/disputes', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    res.json(svc.DisputePlatform.getDisputePlatform().list(req.query));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/reputation/disputes — create dispute */
router.post('/disputes', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    res.status(201).json(svc.DisputePlatform.getDisputePlatform().create(req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** GET /api/reputation/disputes/:id */
router.get('/disputes/:id', (req, res) => {
  const svc = getRepSvc();
  if (!svc) return res.status(503).json({ error: 'Services not available' });
  const d = svc.DisputePlatform.getDisputePlatform().get(req.params.id);
  d ? res.json(d) : res.status(404).json({ error: 'Not found' });
});

/** POST /api/reputation/disputes/:id/evidence — add evidence */
router.post('/disputes/:id/evidence', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    res.json(svc.DisputePlatform.getDisputePlatform().addEvidence(req.params.id, req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** PATCH /api/reputation/disputes/:id/status */
router.patch('/disputes/:id/status', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    res.json(svc.DisputePlatform.getDisputePlatform().updateStatus(req.params.id, req.body.status, req.body.notes));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** GET /api/reputation/alerts — get alerts */
router.get('/alerts', (req, res) => {
  const svc = getRepSvc();
  if (!svc) return res.status(503).json({ error: 'Services not available' });
  res.json(svc.AlertSystem.getAlertSystem().getAlerts(req.query));
});

/** POST /api/reputation/alerts/rules — add alert rule */
router.post('/alerts/rules', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    res.json(svc.AlertSystem.getAlertSystem().addRule(req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** GET /api/reputation/cases — list cases */
router.get('/cases', (req, res) => {
  const svc = getRepSvc();
  if (!svc) return res.status(503).json({ error: 'Services not available' });
  res.json(svc.CaseManager.getCaseManager().list(req.query));
});

/** POST /api/reputation/cases — create case */
router.post('/cases', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    res.status(201).json(svc.CaseManager.getCaseManager().create(req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** GET /api/reputation/evidence-chains — list chains */
router.get('/evidence-chains', (req, res) => {
  const svc = getRepSvc();
  if (!svc) return res.status(503).json({ error: 'Services not available' });
  res.json(svc.EvidenceChain.listChains());
});

/** POST /api/reputation/evidence-chains — create chain */
router.post('/evidence-chains', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    res.status(201).json(svc.EvidenceChain.createChain(req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** POST /api/reputation/evidence-chains/:id/items — add item to chain */
router.post('/evidence-chains/:id/items', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    const chain = svc.EvidenceChain.getChain(req.params.id);
    if (!chain) return res.status(404).json({ error: 'Chain not found' });
    res.json(chain.addItem(req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** POST /api/reputation/evidence-chains/:id/verify — verify chain integrity */
router.post('/evidence-chains/:id/verify', (req, res) => {
  try {
    const svc = getRepSvc();
    if (!svc) return res.status(503).json({ error: 'Services not available' });
    const chain = svc.EvidenceChain.getChain(req.params.id);
    if (!chain) return res.status(404).json({ error: 'Chain not found' });
    res.json(chain.verify());
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
