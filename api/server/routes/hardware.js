'use strict';

/**
 * Hardware Requirements API — Face 13.
 * Exposes the HardwareRequirementsCenter for the React model browser.
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { HardwareRequirementsCenter } = require('~/server/services/HardwareCenter/HardwareRequirementsCenter');

const router = express.Router();
router.use(requireJwtAuth);

let _center = null;
function getCenter() {
  if (!_center) _center = new HardwareRequirementsCenter();
  return _center;
}

// GET /api/hardware/models — all model specs
router.get('/models', (_req, res) => {
  try {
    res.json({ models: getCenter().listAll() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/hardware/ranked — models ranked by viability for current system (best-effort)
router.get('/ranked', (req, res) => {
  try {
    const center = getCenter();
    // Try to detect system from query or env
    const { vram_gb, ram_gb, cpu_cores, has_gpu, disk_free_gb } = req.query;
    if (vram_gb || ram_gb || cpu_cores) {
      center.setSystem({
        vram_gb: parseFloat(vram_gb) || 8,
        ram_gb: parseFloat(ram_gb) || 16,
        cpu_cores: parseInt(cpu_cores) || 8,
        has_gpu: has_gpu === 'true',
        disk_free_gb: parseFloat(disk_free_gb) || 100,
      });
    } else {
      // Default mid-range system if not set
      if (!center._system) {
        center.setSystem({ vram_gb: 8, ram_gb: 16, cpu_cores: 8, has_gpu: false, disk_free_gb: 100 });
      }
    }
    const models = center.rankByViability();
    res.json({ models, system: center._system });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/hardware/viability/:modelId
router.get('/viability/:modelId', (req, res) => {
  try {
    const center = getCenter();
    if (!center._system) {
      center.setSystem({ vram_gb: 8, ram_gb: 16, cpu_cores: 8, has_gpu: false, disk_free_gb: 100 });
    }
    const result = center.checkViability(req.params.modelId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/hardware/system — register system specs
router.post('/system', (req, res) => {
  try {
    const { vram_gb = 0, ram_gb = 8, cpu_cores = 4, has_gpu = false, disk_free_gb = 100 } = req.body;
    const system = getCenter().setSystem({ vram_gb, ram_gb, cpu_cores, has_gpu, disk_free_gb });
    res.json({ system });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/hardware/tiers/:tier
router.get('/tiers/:tier', (req, res) => {
  try {
    res.json({ models: getCenter().getByTier(req.params.tier) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
