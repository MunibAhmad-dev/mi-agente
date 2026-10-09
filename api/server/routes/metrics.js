/**
 * Metrics Routes - Endpoints API para métricas y dashboard
 */

const express = require('express');
const router = express.Router();

let metricsCollector = null;
let telemetry = null;

function setInstances(metrics, tel) {
  metricsCollector = metrics;
  telemetry = tel;
}

// Función para cargar instancias automáticamente
function loadInstances() {
  try {
    const { getMetricsCollector } = require('../services/MetricsCollector');
    const { getTelemetry } = require('../services/Telemetry');
    metricsCollector = getMetricsCollector();
    telemetry = getTelemetry();
  } catch (e) {
    console.log('[MetricsRoutes] Instances not ready:', e.message);
  }
}

/**
 * GET /api/metrics/summary
 * Resumen de todas las métricas
 */
router.get('/summary', (req, res) => {
  try {
    loadInstances();
    if (!metricsCollector) {
      return res.status(503).json({ error: 'MetricsCollector not initialized' });
    }

    const summary = metricsCollector.getSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/dashboard
 * Datos completos del dashboard
 */
router.get('/dashboard', (req, res) => {
  try {
    loadInstances();
    if (!telemetry) {
      return res.status(503).json({ error: 'Telemetry not initialized' });
    }

    const dashboard = telemetry.getDashboardData();
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics
 * Métricas en formato Prometheus
 */
router.get('/', (req, res) => {
  try {
    loadInstances();
    if (!metricsCollector) {
      return res.status(503).json({ error: 'MetricsCollector not initialized' });
    }

    if (req.query.format === 'prometheus') {
      res.set('Content-Type', 'text/plain');
      res.send(metricsCollector.exportPrometheus());
    } else {
      const metrics = metricsCollector.getAll();
      res.json({ metrics, count: metrics.length });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, setInstances };
