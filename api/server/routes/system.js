/**
 * System Routes - Endpoints de sistema y salud
 */

const express = require('express');
const os = require('os');
const router = express.Router();

let integrationManager = null;
let metricsCollector = null;
let telemetry = null;

function setInstances(manager, metrics, tel) {
  integrationManager = manager;
  metricsCollector = metrics;
  telemetry = tel;
}

/**
 * GET /api/health
 * Health check del sistema
 *
 * (D7) El estado es HONESTO y usa la API real del IntegrationManager:
 * `healthCheck()` (boolean) + `getStatus()` (uptime/componentes). Si la
 * arquitectura enterprise está deshabilitada, el manager no se inicializa por
 * diseño y el sistema sigue "healthy". Solo se reporta "degraded" si
 * enterprise está HABILITADA pero el manager no pudo inicializarse.
 */
router.get('/health', async (req, res) => {
  try {
    const { shouldUseNewArchitecture } = require('~/server/services/ExecutionBridge');
    const enterpriseEnabled = shouldUseNewArchitecture();

    const managerInitialized = integrationManager ? await integrationManager.healthCheck() : false;

    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: '3.0.0',
      environment: process.env.NODE_ENV || 'development',
      integrationManager: {
        initialized: managerInitialized,
        enabled: enterpriseEnabled,
      },
    };

    // Componente crítico: enterprise habilitada pero manager no inicializado.
    if (enterpriseEnabled && !managerInitialized) {
      health.status = 'degraded';
      health.message = 'IntegrationManager not initialized (ENABLE_ENTERPRISE_ARCHITECTURE=true)';
    }

    if (telemetry) {
      const telHealth = telemetry.getHealthStatus();
      if (telHealth.status === 'critical') {
        health.status = 'degraded';
        health.message = telHealth.message || 'Telemetry critical';
      }
    }

    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/status (compat) y /api/system/status (ruta del Panel Enterprise)
 * Estado general del sistema (datos reales via getStatus())
 */
function systemStatus() {
  const status =
    integrationManager && typeof integrationManager.getStatus === 'function'
      ? integrationManager.getStatus()
      : null;

  return {
    integrationManager: status
      ? {
          initialized: status.initialized,
          uptime: status.uptime,
          components: status.components || {},
        }
      : null,
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      cpu: os.cpus().length,
    },
    timestamp: Date.now(),
  };
}

router.get('/status', (req, res) => {
  try {
    res.json(systemStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// (D5) El Panel Enterprise llama a /api/system/status; el router montado en
// /api servía /status. Alias para la ruta que el panel realmente usa.
router.get('/system/status', (req, res) => {
  try {
    res.json(systemStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/runtimes
 * Lista de runtimes registrados (RuntimeRegistry.list() + getStatus())
 */
router.get('/runtimes', (req, res) => {
  try {
    if (!integrationManager || !integrationManager.runtimeRegistry) {
      return res.status(503).json({ error: 'RuntimeRegistry not available' });
    }

    const registry = integrationManager.runtimeRegistry;
    const runtimes = typeof registry.list === 'function' ? registry.list() : [];
    const status = typeof registry.getStatus === 'function' ? registry.getStatus() : {};

    res.json({
      runtimes: runtimes.map((r) => ({
        name: r.name,
        status: r.status,
        capabilities: r.capabilities || [],
      })),
      count: runtimes.length,
      registry: {
        initialized: status.initialized || false,
        healthy: status.healthy || 0,
        unhealthy: status.unhealthy || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/runtimes/:name/status
 * Estado de un runtime específico
 */
router.get('/runtimes/:name/status', (req, res) => {
  try {
    if (!integrationManager || !integrationManager.runtimeRegistry) {
      return res.status(503).json({ error: 'RuntimeRegistry not available' });
    }

    const registry = integrationManager.runtimeRegistry;
    const runtime = typeof registry.get === 'function' ? registry.get(req.params.name) : null;
    if (!runtime) {
      return res.status(404).json({ error: 'Runtime not found' });
    }

    res.json({
      name: req.params.name,
      status: runtime.status || 'unknown',
      capabilities: runtime.capabilities || [],
      error: runtime.error || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, setInstances };
