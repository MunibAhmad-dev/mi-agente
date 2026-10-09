/**
 * Security routes — Face 11: Security, Testing & Self-Repair.
 *
 * POST /api/security/scan         — scan code content for secrets/SAST/deps
 * POST /api/security/repair       — run repair loop on verification failures
 * GET  /api/security/firewall     — get agent firewall status
 */
const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');

const router = express.Router();
router.use(requireJwtAuth);

const requireAdmin = requireCapability(SystemCapabilities.ACCESS_ADMIN);

/** POST /api/security/scan — scan code for security issues */
router.post('/scan', requireAdmin, async (req, res) => {
  try {
    const { content, fileName, scanSecrets = true, scanSAST = true, scanDeps = false } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }
    const { scanContent } = require('~/server/services/SecurityScanner/ScanOrchestrator');
    const result = await scanContent(content, { fileName, scanSecrets, scanSAST, scanDeps });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/security/repair — classify verification failures and return repair recommendations.
 * The full repairLoop requires a live verifyFn callback (internal use only).
 * This endpoint classifies failures and returns the recommended action per failure.
 */
router.post('/repair', requireAdmin, async (req, res) => {
  try {
    const { results } = req.body; // array of verification result objects
    if (!Array.isArray(results)) {
      return res.status(400).json({ error: 'results (array) required' });
    }
    const {
      FailureCategory,
      RepairAction,
      classifyFailure,
      decideRepairAction,
    } = require('~/server/services/Repair/repairService');

    const classified = results.map((r, i) => {
      const category = classifyFailure(r);
      const action = category ? decideRepairAction(category, 0) : null;
      return { index: i, result: r, category, recommendedAction: action };
    });

    const needsRepair = classified.filter((c) => c.category !== null);
    res.json({
      classified,
      needsRepair: needsRepair.length,
      canAutoRepair: needsRepair.some(
        (c) => c.recommendedAction !== RepairAction.ESCALATE,
      ),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/security/firewall — agent firewall status */
router.get('/firewall', requireAdmin, async (req, res) => {
  try {
    const agentFirewall = require('~/server/services/Security/agentFirewall');
    const status = typeof agentFirewall.getStatus === 'function'
      ? agentFirewall.getStatus()
      : { enabled: true, rules: agentFirewall.RULES || [] };
    res.json({ firewall: status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/security/scanners — list available scanners and their status */
router.get('/scanners', requireAdmin, async (req, res) => {
  try {
    const scanners = [
      { name: 'SecretsScanner', description: 'Detects hardcoded secrets and credentials', enabled: true },
      { name: 'SASTScanner', description: 'Detects dangerous code patterns (eval, injection)', enabled: true },
      { name: 'DependencyScanner', description: 'Detects vulnerable dependencies', enabled: true },
      { name: 'AgentFirewall', description: 'Pre/post tool call security enforcement', enabled: true },
    ];
    res.json({ scanners });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/security/status
 * Returns which binary-backed scanners are available on this host.
 * Face 11: f11-2 — scanner availability dashboard.
 */
router.get('/status', requireAdmin, (req, res) => {
  try {
    const { getScannerStatus } = require('~/server/services/SecurityScanner/ScanOrchestrator');
    const availability = getScannerStatus();
    res.json({
      available: true,
      scanners: availability,
      summary: {
        allReady: Object.values(availability).every(Boolean),
        readyCount: Object.values(availability).filter(Boolean).length,
        total: Object.values(availability).length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/security/scan-dir
 * Scan an entire directory for secrets, SAST issues and vulnerable deps.
 * body: { dirPath: string }
 * Face 11: f11-3 — directory-level security scan.
 */
router.post('/scan-dir', requireAdmin, async (req, res) => {
  const { dirPath } = req.body;
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ error: 'dirPath is required' });
  }
  try {
    const { scanDirectory } = require('~/server/services/SecurityScanner/ScanOrchestrator');
    const result = await scanDirectory(dirPath);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
