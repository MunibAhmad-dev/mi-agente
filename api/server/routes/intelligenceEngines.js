'use strict';

/**
 * IntelligenceEngines routes — Face 7.
 * Timeline, Investigation, Dossier, SourceCatalog.
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

let _svc = null;
function getSvc() {
  if (!_svc) _svc = require('~/server/services/IntelligenceEngines');
  return _svc;
}

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'IntelligenceEngines' }));

// ── Timelines ──
router.post('/timelines', requireJwtAuth, (req, res) => {
  const { TimelineEngine } = getSvc();
  res.status(201).json(TimelineEngine.createTimeline(req.body.id).export());
});
router.get('/timelines', requireJwtAuth, (req, res) => {
  const { TimelineEngine } = getSvc();
  res.json(TimelineEngine.listTimelines());
});
router.get('/timelines/:id', requireJwtAuth, (req, res) => {
  const { TimelineEngine } = getSvc();
  const tl = TimelineEngine.getTimeline(req.params.id);
  tl ? res.json(tl.export()) : res.status(404).json({ error: 'Not found' });
});
router.post('/timelines/:id/events', requireJwtAuth, (req, res) => {
  try {
    const { TimelineEngine } = getSvc();
    const tl = TimelineEngine.getTimeline(req.params.id);
    if (!tl) return res.status(404).json({ error: 'Timeline not found' });
    res.json(tl.addEvent(req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Investigations ──
router.post('/investigations', requireJwtAuth, (req, res) => {
  const { InvestigationEngine } = getSvc();
  res.status(201).json(InvestigationEngine.create(req.body).toJSON());
});
router.get('/investigations', requireJwtAuth, (req, res) => {
  const { InvestigationEngine } = getSvc();
  res.json(InvestigationEngine.list());
});
router.get('/investigations/:id', requireJwtAuth, (req, res) => {
  const { InvestigationEngine } = getSvc();
  const inv = InvestigationEngine.get(req.params.id);
  inv ? res.json(inv) : res.status(404).json({ error: 'Not found' });
});
router.post('/investigations/:id/evidence', requireJwtAuth, (req, res) => {
  try {
    const { InvestigationEngine } = getSvc();
    const inv = InvestigationEngine.get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    res.json(inv.addEvidence(req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Dossiers ──
router.post('/dossiers', requireJwtAuth, (req, res) => {
  try {
    const { DossierEngine } = getSvc();
    res.status(201).json(DossierEngine.create(req.body).toJSON());
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/dossiers', requireJwtAuth, (req, res) => {
  const { DossierEngine } = getSvc();
  res.json(DossierEngine.list());
});
router.get('/dossiers/:id', requireJwtAuth, (req, res) => {
  const { DossierEngine } = getSvc();
  const d = DossierEngine.get(req.params.id);
  d ? res.json(d.toJSON()) : res.status(404).json({ error: 'Not found' });
});

// ── Source Catalog ──
router.get('/sources', requireJwtAuth, (req, res) => {
  const { SourceCatalog } = getSvc();
  res.json(SourceCatalog.getSourceCatalog().list());
});
router.post('/sources', requireJwtAuth, (req, res) => {
  try {
    const { SourceCatalog } = getSvc();
    res.status(201).json(SourceCatalog.getSourceCatalog().add(req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Contradiction Engine — Face 7 ──
router.post('/contradictions/analyse', requireJwtAuth, (req, res) => {
  try {
    const { ContradictionEngine } = getSvc();
    const engine = new ContradictionEngine();
    const contradictions = engine.analyse(req.body.claims || []);
    res.json({ contradictions, count: contradictions.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/contradictions/cross-check', requireJwtAuth, (req, res) => {
  try {
    const { ContradictionEngine } = getSvc();
    const engine = new ContradictionEngine();
    const contradictions = engine.crossCheckEvidence(req.body.evidence || []);
    res.json({ contradictions, count: contradictions.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Unified investigation pipeline — Face 7 E2E ──────────────────────────────
// Orchestrates all 5 engines (Timeline → Investigation → Dossier → SourceCatalog
// → ContradictionEngine) into a single pipeline call.
router.post('/pipeline/investigate', requireJwtAuth, async (req, res) => {
  try {
    const { subject, query, claims = [], evidenceItems = [] } = req.body;
    const topic = subject || query;
    if (!topic) return res.status(400).json({ error: 'subject or query required' });

    const { TimelineEngine, InvestigationEngine, DossierEngine, SourceCatalog, ContradictionEngine } = getSvc();

    const inv = InvestigationEngine.create({ subject: topic, description: `Automated pipeline investigation: ${topic}` });
    const tl = TimelineEngine.createTimeline();
    for (const ev of (evidenceItems || []).slice(0, 20)) {
      try { tl.addEvent({ title: ev.title || 'Evidence', description: ev.content || '', source: ev.source || 'input', confidence: ev.confidence ?? 0.5 }); } catch { /* skip invalid */ }
    }
    const dossier = DossierEngine.create({ name: topic, type: 'person', aliases: [] });
    const contradictions = new ContradictionEngine().analyse(
      claims.length ? claims : [{ text: topic, source: 'pipeline_input', timestamp: new Date().toISOString() }],
    );
    const sources = SourceCatalog.getSourceCatalog().list().slice(0, 10);

    res.json({
      pipeline_id: `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      subject: topic,
      investigation: inv.toJSON(),
      timeline: tl.export(),
      dossier: dossier.getSummary ? dossier.getSummary() : dossier.toJSON(),
      contradictions: { count: contradictions.length, items: contradictions },
      sources: { count: sources.length, items: sources },
      generated_at: new Date().toISOString(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
