'use strict';

/**
 * SecurityScan routes — Face 11.
 * External security scanning tools: Semgrep, Trivy, Gitleaks, Grype, ZAP.
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { SystemCapabilities } = require('@librechat/data-schemas');

const requireAdmin = requireCapability(SystemCapabilities.ACCESS_ADMIN);

let _tools = null;
function getTools() {
  if (!_tools) _tools = require('~/server/services/SecurityScan/ExternalSecurityTools');
  return _tools;
}

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'SecurityScan' }));

/** GET /api/security-scan/availability — check which tools are installed */
router.get('/availability', requireJwtAuth, requireAdmin, async (req, res) => {
  try {
    const tools = getTools();
    const availability = await tools.checkAvailability();
    res.json({ availability });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/security-scan/scan — run a specific tool */
router.post('/scan', requireJwtAuth, requireAdmin, async (req, res) => {
  try {
    const { tool, target, opts } = req.body;
    if (!tool || !target) return res.status(400).json({ error: 'tool and target required' });
    const tools = getTools();
    const result = await tools.scan(tool, target, opts || {});
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/security-scan/scan-all — run all available tools */
router.post('/scan-all', requireJwtAuth, requireAdmin, async (req, res) => {
  try {
    const { target, opts } = req.body;
    if (!target) return res.status(400).json({ error: 'target required' });
    const tools = getTools();
    const results = await tools.scanAll(target, opts || {});
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RealityLab — Face 11 ──

let _realityLab = null;
function getRealityLab() {
  if (!_realityLab) {
    const { RealityLab } = require('~/server/services/SecurityScan/RealityLab');
    _realityLab = new RealityLab();
  }
  return _realityLab;
}

/** POST /api/security-scan/reality-lab/run — run code in isolation */
router.post('/reality-lab/run', requireJwtAuth, requireAdmin, async (req, res) => {
  try {
    const { code, language, timeoutMs } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const result = await getRealityLab().run(code, { language, timeoutMs });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/security-scan/reality-lab/runs */
router.get('/reality-lab/runs', requireJwtAuth, requireAdmin, (req, res) => {
  try { res.json({ runs: getRealityLab().listRuns() }); } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/security-scan/reality-lab/snapshots */
router.get('/reality-lab/snapshots', requireJwtAuth, requireAdmin, (req, res) => {
  try { res.json({ snapshots: getRealityLab().listSnapshots() }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ChaosRunner — Face 11 ──

let _chaos = null;
function getChaos() {
  if (!_chaos) {
    const { ChaosRunner } = require('~/server/services/SecurityScan/ChaosRunner');
    _chaos = new ChaosRunner();
  }
  return _chaos;
}

/** GET /api/security-scan/chaos/types */
router.get('/chaos/types', requireJwtAuth, requireAdmin, (req, res) => {
  try { res.json({ types: getChaos().listTypes() }); } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/security-scan/chaos/run */
router.post('/chaos/run', requireJwtAuth, requireAdmin, async (req, res) => {
  try {
    const { type, duration_ms, target, params, description } = req.body;
    if (!type) return res.status(400).json({ error: 'type required' });
    const result = await getChaos().run({ type, duration_ms, target, params, description });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/security-scan/chaos/experiments */
router.get('/chaos/experiments', requireJwtAuth, requireAdmin, (req, res) => {
  try {
    const { status } = req.query;
    res.json({ experiments: getChaos().list(status ? { status } : {}) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/security-scan/external/availability — which external tools are installed */
router.get('/external/availability', requireJwtAuth, requireAdmin, async (req, res) => {
  try {
    const { getExternalSecurityRunner } = require('~/server/services/SecurityScan/ExternalSecurityRunner');
    const runner = getExternalSecurityRunner();
    const availability = await runner.checkAvailability();
    res.json({ availability, supported_tools: runner.getSupportedTools() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/security-scan/external/run — run external security tools */
router.post('/external/run', requireJwtAuth, requireAdmin, async (req, res) => {
  try {
    const { targetPath, type } = req.body;
    if (!targetPath) return res.status(400).json({ error: 'targetPath required' });
    const { getExternalSecurityRunner } = require('~/server/services/SecurityScan/ExternalSecurityRunner');
    const runner = getExternalSecurityRunner();
    const result = await runner.run({ targetPath, type });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/security-scan/external/results — recent external scan results */
router.get('/external/results', requireJwtAuth, requireAdmin, (req, res) => {
  try {
    const { getExternalSecurityRunner } = require('~/server/services/SecurityScan/ExternalSecurityRunner');
    const runner = getExternalSecurityRunner();
    res.json(runner.getResults(parseInt(req.query.limit) || 10));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
