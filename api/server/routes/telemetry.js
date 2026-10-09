/**
 * Telemetry Routes - Endpoints API para logging y tracing
 */

const express = require('express');
const router = express.Router();

let telemetry = null;

function setInstances(tel) {
  telemetry = tel;
}

// Función para cargar instancia automáticamente
function loadInstances() {
  try {
    const { getTelemetry } = require('../services/Telemetry');
    telemetry = getTelemetry();
  } catch (e) {
    console.log('[TelemetryRoutes] Instances not ready:', e.message);
  }
}

/**
 * GET /api/telemetry/health
 * Estado de salud del sistema
 */
router.get('/health', (req, res) => {
  try {
    loadInstances();
    if (!telemetry) {
      return res.status(503).json({ error: 'Telemetry not initialized' });
    }

    const health = telemetry.getHealthStatus();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/telemetry/logs
 * Logs recientes
 */
router.get('/logs', (req, res) => {
  try {
    loadInstances();
    if (!telemetry) {
      return res.status(503).json({ error: 'Telemetry not initialized' });
    }

    const limit = parseInt(req.query.limit) || 100;
    const logs = telemetry.logs.slice(-limit).map((l) => (l.toJSON ? l.toJSON() : l));
    res.json({ logs, count: logs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/telemetry/alerts
 * Alertas activas
 */
router.get('/alerts', (req, res) => {
  try {
    loadInstances();
    if (!telemetry) {
      return res.status(503).json({ error: 'Telemetry not initialized' });
    }

    const alerts = telemetry.alerts
      .filter((a) => a.status === 'active')
      .map((a) => (a.toJSON ? a.toJSON() : a));
    res.json({ alerts, count: alerts.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/telemetry/alerts
 * Crear una alerta manualmente
 */
router.post('/alerts', (req, res) => {
  try {
    loadInstances();
    if (!telemetry) {
      return res.status(503).json({ error: 'Telemetry not initialized' });
    }

    const { type, message, severity, metadata } = req.body;

    if (!type || !message) {
      return res.status(400).json({ error: 'type and message are required' });
    }

    const alert = telemetry.createAlert(type, message, severity || 'warning', metadata || {});
    res.json(alert ? alert.toJSON() : { error: 'Alerts disabled' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/telemetry/alerts/:id
 * Resolver una alerta
 */
router.delete('/alerts/:id', (req, res) => {
  try {
    loadInstances();
    if (!telemetry) {
      return res.status(503).json({ error: 'Telemetry not initialized' });
    }

    const alert = telemetry.resolveAlert(req.params.id);
    res.json(alert ? alert.toJSON() : { error: 'Alert not found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/telemetry/traces
 * Traces recientes
 */
router.get('/traces', (req, res) => {
  try {
    loadInstances();
    if (!telemetry) {
      return res.status(503).json({ error: 'Telemetry not initialized' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const traces = Array.from(telemetry.traces.values())
      .slice(-limit)
      .map((t) => (t.toJSON ? t.toJSON() : t));
    res.json({ traces, count: traces.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, setInstances };
