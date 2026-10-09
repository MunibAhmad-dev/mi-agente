/**
 * Performance Routes
 * Endpoints para monitoreo y optimización de rendimiento
 */

const express = require('express');
const { getPerformanceMonitor } = require('../services/Performance/PerformanceMonitor');
const { getResponseCache } = require('../services/Performance/ResponseCache');
const { getQueryOptimizer } = require('../services/Performance/QueryOptimizer');
const { BenchmarkTool } = require('../services/Performance/BenchmarkTool');

const router = express.Router();

// Services
let performanceMonitor;
let responseCache;
let queryOptimizer;

/**
 * GET /api/performance/summary
 * Resumen de rendimiento del sistema
 */
router.get('/summary', (req, res) => {
  try {
    if (!performanceMonitor) {
      performanceMonitor = getPerformanceMonitor();
    }

    const summary = performanceMonitor.getSummary();
    const cacheStats = responseCache?.getStats() || {};
    const queryStats = queryOptimizer?.getStats() || {};

    res.json({
      status: summary.status,
      timestamp: Date.now(),
      system: {
        requests: summary.requests,
        latency: summary.latency,
        memory: summary.memory,
      },
      cache: cacheStats,
      queries: queryStats,
      recommendations: generateRecommendations(summary, cacheStats, queryStats),
    });
  } catch (error) {
    console.error('[Performance] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get performance summary' });
  }
});

/**
 * GET /api/performance/metrics
 * Métricas detalladas de rendimiento
 */
router.get('/metrics', (req, res) => {
  try {
    if (!performanceMonitor) {
      performanceMonitor = getPerformanceMonitor();
    }

    const snapshot = performanceMonitor.getSnapshot();

    res.json({
      timestamp: Date.now(),
      requests: {
        total: snapshot.requests.total,
        success: snapshot.requests.success,
        errors: snapshot.requests.errors,
        byStatus: snapshot.requests.byStatus,
      },
      latency: snapshot.latency,
      memory: snapshot.memory,
      endpoints: snapshot.endpoints,
      slowEndpoints: snapshot.slowEndpoints,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * GET /api/performance/history
 * Historial de métricas
 */
router.get('/history', (req, res) => {
  try {
    if (!performanceMonitor) {
      performanceMonitor = getPerformanceMonitor();
    }

    const limit = parseInt(req.query.limit) || 60;
    const history = performanceMonitor.history.slice(-limit);

    res.json({
      count: history.length,
      history,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get history' });
  }
});

/**
 * GET /api/performance/cache/stats
 * Estadísticas del caché de respuestas
 */
router.get('/cache/stats', (req, res) => {
  try {
    if (!responseCache) {
      responseCache = getResponseCache();
    }

    res.json(responseCache.getStats());
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

/**
 * POST /api/performance/cache/clear
 * Limpiar el caché de respuestas
 */
router.post('/cache/clear', (req, res) => {
  try {
    if (!responseCache) {
      responseCache = getResponseCache();
    }

    const stats = responseCache.getStats();
    responseCache.clear();

    res.json({
      success: true,
      clearedEntries: stats.size,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

/**
 * GET /api/performance/queries/stats
 * Estadísticas de queries
 */
router.get('/queries/stats', (req, res) => {
  try {
    if (!queryOptimizer) {
      queryOptimizer = getQueryOptimizer();
    }

    res.json(queryOptimizer.getStats());
  } catch (error) {
    res.status(500).json({ error: 'Failed to get query stats' });
  }
});

/**
 * GET /api/performance/queries/slow
 * Queries lentas
 */
router.get('/queries/slow', (req, res) => {
  try {
    if (!queryOptimizer) {
      queryOptimizer = getQueryOptimizer();
    }

    const limit = parseInt(req.query.limit) || 10;
    const slowQueries = queryOptimizer.getSlowQueries(limit);

    res.json({
      count: slowQueries.length,
      slowQueries,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get slow queries' });
  }
});

/**
 * GET /api/performance/queries/optimizations
 * Sugerencias de optimización
 */
router.get('/queries/optimizations', (req, res) => {
  try {
    if (!queryOptimizer) {
      queryOptimizer = getQueryOptimizer();
    }

    const suggestions = queryOptimizer.suggestOptimizations();

    res.json({
      count: suggestions.length,
      suggestions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get optimization suggestions' });
  }
});

/**
 * POST /api/performance/benchmark
 * Ejecutar benchmark
 */
router.post('/benchmark', async (req, res) => {
  try {
    const {
      endpoints = [{ path: '/api/health', method: 'GET' }],
      concurrency = 10,
      duration = 10000,
    } = req.body;

    const tool = new BenchmarkTool({
      baseUrl: req.headers.origin || 'http://localhost:3001',
      concurrency,
      duration,
    });

    const results = await tool.benchmark(endpoints);
    const report = tool.generateReport(results);

    res.json({
      success: true,
      results,
      report,
    });
  } catch (error) {
    console.error('[Performance] Benchmark error:', error);
    res.status(500).json({ error: 'Failed to run benchmark' });
  }
});

/**
 * GET /api/performance/benchmark/quick
 * Benchmark rápido de un endpoint
 */
router.get('/benchmark/quick', async (req, res) => {
  try {
    const { path = '/api/health', iterations = 100 } = req.query;

    const tool = new BenchmarkTool({
      baseUrl: req.headers.origin || 'http://localhost:3001',
    });

    const results = await tool.quickBenchmark(path, parseInt(iterations));

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to run quick benchmark' });
  }
});

/**
 * Generar recomendaciones basadas en métricas
 */
function generateRecommendations(performanceSummary, cacheStats, queryStats) {
  const recommendations = [];

  // Latencia
  if (performanceSummary.latency.p99 > 2000) {
    recommendations.push({
      priority: 'high',
      category: 'latency',
      issue: 'p99 latency is above 2000ms',
      suggestion: 'Consider adding response caching or optimizing slow endpoints',
    });
  }

  // Tasa de errores
  if (parseFloat(performanceSummary.requests.errorRate) > 5) {
    recommendations.push({
      priority: 'critical',
      category: 'errors',
      issue: 'Error rate is above 5%',
      suggestion: 'Investigate error logs and fix failing endpoints',
    });
  }

  // Caché
  const hitRate = parseFloat(cacheStats.hitRate);
  if (hitRate < 50 && cacheStats.size > 100) {
    recommendations.push({
      priority: 'medium',
      category: 'cache',
      issue: `Cache hit rate is only ${hitRate}%`,
      suggestion: 'Consider adjusting cache TTL or cache key strategy',
    });
  }

  // Memoria
  if (performanceSummary.memory.heapUsed > 800) {
    recommendations.push({
      priority: 'medium',
      category: 'memory',
      issue: 'Memory usage is high',
      suggestion: 'Consider increasing Node.js heap size or optimizing memory usage',
    });
  }

  // Queries lentas
  if (queryStats.totalSlowQueries > 10) {
    recommendations.push({
      priority: 'high',
      category: 'database',
      issue: `${queryStats.totalSlowQueries} slow queries detected`,
      suggestion: 'Review slow queries and add appropriate indexes',
    });
  }

  return recommendations;
}

module.exports = { router };
