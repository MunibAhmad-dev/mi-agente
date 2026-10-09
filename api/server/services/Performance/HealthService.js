/**
 * Health Service
 * ==============
 *
 * Sistema de health checks para monitoreo de servicios.
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// HEALTH CHECK STATUS
// ============================================================================

const STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
};

// ============================================================================
// HEALTH CHECK REGISTRY
// ============================================================================

const checks = new Map();

// Register a health check
function registerCheck(name, checkFn, options = {}) {
  const { timeout = 5000, critical = false, tags = [] } = options;

  checks.set(name, {
    name,
    checkFn,
    timeout,
    critical,
    tags,
    lastCheck: null,
    lastStatus: null,
    lastDuration: null,
    lastError: null,
  });
}

// ============================================================================
// PRESET CHECKS
// ============================================================================

// MongoDB
registerCheck(
  'mongodb',
  async () => {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    if (state !== 1) {
      throw new Error(`MongoDB ${states[state]}`);
    }

    // Ping
    await mongoose.connection.db.admin().ping();

    return { state: states[state] };
  },
  { critical: true, tags: ['database'] },
);

// Redis (if available)
registerCheck(
  'redis',
  async () => {
    try {
      const redis = require('redis');
      const client = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
      });

      await client.connect();
      await client.ping();
      await client.quit();

      return { state: 'connected' };
    } catch (error) {
      // Redis is optional
      return { state: 'not_configured' };
    }
  },
  { critical: false, tags: ['cache'] },
);

// Memory
registerCheck(
  'memory',
  async () => {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;

    if (heapUsedPercent > 0.95) {
      throw new Error(`Memory critical: ${(heapUsedPercent * 100).toFixed(1)}%`);
    }

    return {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      heapPercent: (heapUsedPercent * 100).toFixed(1) + '%',
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
    };
  },
  { critical: true, tags: ['system'] },
);

// Disk
registerCheck(
  'disk',
  async () => {
    // This would require fsPromises but we'll stub it
    return { state: 'unknown' };
  },
  { critical: false, tags: ['system'] },
);

// External APIs
registerCheck(
  'openai',
  async () => {
    const axios = require('axios');

    try {
      // Just check if key is configured
      if (!process.env.OPENAI_API_KEY) {
        return { state: 'not_configured' };
      }

      return { state: 'configured' };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  },
  { critical: false, tags: ['api'] },
);

// ComfyUI
registerCheck(
  'comfyui',
  async () => {
    const comfyuiUrl = process.env.COMFYUI_URL || 'http://localhost:8188';

    try {
      const axios = require('axios');
      const response = await axios.get(`${comfyuiUrl}/system_stats`, {
        timeout: 3000,
      });

      return {
        state: 'connected',
        stats: response.data,
      };
    } catch (error) {
      return { state: 'unavailable', error: error.message };
    }
  },
  { critical: false, tags: ['service'] },
);

// Claude
registerCheck(
  'claude',
  async () => {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
      return { state: 'not_configured' };
    }

    return { state: 'configured' };
  },
  { critical: false, tags: ['api'] },
);

// HuggingFace
registerCheck(
  'huggingface',
  async () => {
    if (!process.env.HUGGINGFACE_API_TOKEN) {
      return { state: 'not_configured' };
    }

    return { state: 'configured' };
  },
  { critical: false, tags: ['api'] },
);

// ============================================================================
// HEALTH CHECKER
// ============================================================================

class HealthChecker {
  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Ejecuta todos los health checks
   */
  async check(options = {}) {
    const { includeTags = [], excludeTags = [], timeout = 30000 } = options;

    const results = {};
    let overallStatus = STATUS.HEALTHY;
    const startTime = Date.now();

    const checkPromises = Array.from(checks.entries()).map(async ([name, check]) => {
      // Filter by tags
      if (includeTags.length > 0) {
        if (!check.tags.some((t) => includeTags.includes(t))) {
          return;
        }
      }

      if (excludeTags.length > 0) {
        if (check.tags.some((t) => excludeTags.includes(t))) {
          return;
        }
      }

      // Run check with timeout
      try {
        const result = await this.runCheck(check, timeout);
        results[name] = result;

        // Update overall status
        if (result.status === STATUS.UNHEALTHY) {
          if (check.critical) {
            overallStatus = STATUS.UNHEALTHY;
          } else if (overallStatus !== STATUS.UNHEALTHY) {
            overallStatus = STATUS.DEGRADED;
          }
        } else if (result.status === STATUS.DEGRADED && overallStatus === STATUS.HEALTHY) {
          overallStatus = STATUS.DEGRADED;
        }
      } catch (error) {
        results[name] = {
          status: STATUS.UNHEALTHY,
          error: error.message,
          duration: 0,
        };

        if (check.critical) {
          overallStatus = STATUS.UNHEALTHY;
        } else if (overallStatus !== STATUS.UNHEALTHY) {
          overallStatus = STATUS.DEGRADED;
        }
      }
    });

    await Promise.all(checkPromises);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      duration: Date.now() - startTime,
      checks: results,
    };
  }

  /**
   * Ejecuta un check individual
   */
  async runCheck(check, globalTimeout) {
    const checkWithTimeout = Promise.race([
      check.checkFn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Check timeout')), check.timeout),
      ),
    ]);

    const startTime = Date.now();

    try {
      const result = await checkWithTimeout;
      const duration = Date.now() - startTime;

      // Update check metadata
      check.lastCheck = new Date();
      check.lastStatus = STATUS.HEALTHY;
      check.lastDuration = duration;
      check.lastError = null;

      return {
        status: STATUS.HEALTHY,
        duration,
        data: result,
        tags: check.tags,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      check.lastCheck = new Date();
      check.lastStatus = STATUS.UNHEALTHY;
      check.lastDuration = duration;
      check.lastError = error.message;

      return {
        status: STATUS.UNHEALTHY,
        duration,
        error: error.message,
        tags: check.tags,
      };
    }
  }

  /**
   * Health check simple (para /health)
   */
  async simpleCheck() {
    const mongoCheck = checks.get('mongodb');
    const memoryCheck = checks.get('memory');

    try {
      const mongoResult = await this.runCheck(mongoCheck, 3000);
      const memoryResult = await this.runCheck(memoryCheck, 1000);

      const isHealthy =
        mongoResult.status === STATUS.HEALTHY && memoryResult.status === STATUS.HEALTHY;

      return {
        status: isHealthy ? STATUS.HEALTHY : STATUS.UNHEALTHY,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
      };
    } catch (error) {
      return {
        status: STATUS.UNHEALTHY,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        error: error.message,
      };
    }
  }

  /**
   * Liveness check (para k8s)
   */
  async liveness() {
    return {
      status: STATUS.HEALTHY,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness check (para k8s)
   */
  async readiness() {
    const result = await this.simpleCheck();

    return {
      ...result,
      ready: result.status === STATUS.HEALTHY,
    };
  }
}

// Singleton
const healthChecker = new HealthChecker();

// ============================================================================
// EXPRESS ROUTES
// ============================================================================

function setupHealthRoutes(app) {
  // Basic health
  app.get('/health', async (req, res) => {
    const result = await healthChecker.simpleCheck();
    const status = result.status === STATUS.HEALTHY ? 200 : 503;
    res.status(status).json(result);
  });

  // Detailed health
  app.get('/health/detailed', async (req, res) => {
    const result = await healthChecker.check({
      includeTags: req.query.tags?.split(','),
      excludeTags: req.query.exclude?.split(','),
    });

    const status = result.status === STATUS.HEALTHY ? 200 : 503;
    res.status(status).json(result);
  });

  // Kubernetes probes
  app.get('/health/live', async (req, res) => {
    const result = await healthChecker.liveness();
    res.json(result);
  });

  app.get('/health/ready', async (req, res) => {
    const result = await healthChecker.readiness();
    const status = result.ready ? 200 : 503;
    res.status(status).json(result);
  });

  logger.info('[Health] Routes registered');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Status constants
  STATUS,

  // Checker
  healthChecker,

  // Registration
  registerCheck,

  // Routes
  setupHealthRoutes,

  // Helpers
  check: (options) => healthChecker.check(options),
  simpleCheck: () => healthChecker.simpleCheck(),
  liveness: () => healthChecker.liveness(),
  readiness: () => healthChecker.readiness(),
};
