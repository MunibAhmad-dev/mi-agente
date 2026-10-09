/**
 * QueryOptimizer - Optimización de consultas a base de datos
 */

class QueryOptimizer {
  constructor() {
    this.queryCache = new Map();
    this.queryStats = new Map();
    this.slowQueryThreshold = 1000; // ms
  }

  /**
   * Analizar y optimizar consulta
   */
  optimize(query, options = {}) {
    const { addPagination = true, addProjection = true, addIndexHints = true } = options;

    let optimized = { ...query };

    // Agregar paginación si no existe
    if (addPagination && !query.limit) {
      optimized.limit = query.limit || 100;
      optimized.skip = query.skip || 0;
    }

    // Agregar proyección para reducir transferencia
    if (addProjection && query.select) {
      optimized.projection = this.parseProjection(query.select);
    }

    // Detectar y sugerir índices
    if (addIndexHints) {
      optimized.suggestedIndexes = this.suggestIndexes(query);
    }

    return optimized;
  }

  /**
   * Parsear proyección de campos
   */
  parseProjection(selectStr) {
    if (!selectStr) return {};

    const projection = {};
    const fields = selectStr.split(' ');

    for (const field of fields) {
      if (field.startsWith('-')) {
        projection[field.substring(1)] = 0;
      } else {
        projection[field] = 1;
      }
    }

    return projection;
  }

  /**
   * Sugerir índices basados en la consulta
   */
  suggestIndexes(query) {
    const indexes = [];

    // Detectar campos usados en where
    if (query.where) {
      for (const field of Object.keys(query.where)) {
        if (!indexes.find((i) => i.field === field)) {
          indexes.push({
            field,
            type: query.where[field]?.constructor?.name === 'String' ? 'text' : 'ascending',
            reason: 'Used in WHERE clause',
          });
        }
      }
    }

    // Detectar campos para ORDER BY
    if (query.sort) {
      for (const field of Object.keys(query.sort)) {
        if (!indexes.find((i) => i.field === field)) {
          indexes.push({
            field,
            type: query.sort[field] === -1 ? 'descending' : 'ascending',
            reason: 'Used in ORDER BY',
          });
        }
      }
    }

    return indexes;
  }

  /**
   * Registrar tiempo de ejecución de query
   */
  recordQueryTime(collection, queryType, duration, query) {
    const key = `${collection}.${queryType}`;

    if (!this.queryStats.has(key)) {
      this.queryStats.set(key, {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        avgDuration: 0,
        slowQueries: 0,
      });
    }

    const stats = this.queryStats.get(key);
    stats.count++;
    stats.totalDuration += duration;
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.avgDuration = stats.totalDuration / stats.count;

    if (duration > this.slowQueryThreshold) {
      stats.slowQueries++;
      console.warn(`[QueryOptimizer] Slow query detected: ${key} took ${duration}ms`);
      console.warn(`[QueryOptimizer] Query:`, JSON.stringify(query).substring(0, 200));
    }
  }

  /**
   * Obtener estadísticas de queries
   */
  getStats() {
    const stats = {};

    for (const [key, data] of this.queryStats.entries()) {
      stats[key] = {
        ...data,
        avgDuration: Math.round(data.avgDuration),
        slowQueryRate: ((data.slowQueries / data.count) * 100).toFixed(2) + '%',
      };
    }

    return {
      totalQueries: Array.from(this.queryStats.values()).reduce((sum, s) => sum + s.count, 0),
      totalSlowQueries: Array.from(this.queryStats.values()).reduce(
        (sum, s) => sum + s.slowQueries,
        0,
      ),
      byCollection: stats,
    };
  }

  /**
   * Obtener queries lentas
   */
  getSlowQueries(limit = 10) {
    const queries = [];

    for (const [key, data] of this.queryStats.entries()) {
      if (data.slowQueries > 0) {
        queries.push({
          key,
          ...data,
          avgDuration: Math.round(data.avgDuration),
        });
      }
    }

    return queries.sort((a, b) => b.avgDuration - a.avgDuration).slice(0, limit);
  }

  /**
   * Sugerir queries que necesitan optimización
   */
  suggestOptimizations() {
    const suggestions = [];

    for (const [key, data] of this.queryStats.entries()) {
      // Queries sin índices suggestidos
      if (data.avgDuration > 500 && data.count > 10) {
        suggestions.push({
          priority: 'high',
          query: key,
          issue: `Average query time is ${Math.round(data.avgDuration)}ms`,
          suggestion: 'Consider adding indexes or caching',
        });
      }

      // Queries con alta tasa de queries lentas
      const slowRate = data.slowQueries / data.count;
      if (slowRate > 0.1) {
        suggestions.push({
          priority: 'critical',
          query: key,
          issue: `${(slowRate * 100).toFixed(1)}% of queries are slow`,
          suggestion: 'Review query structure and add appropriate indexes',
        });
      }
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Limpiar estadísticas
   */
  resetStats() {
    this.queryStats.clear();
    this.queryCache.clear();
  }
}

// Singleton
let instance = null;

function getQueryOptimizer() {
  if (!instance) {
    instance = new QueryOptimizer();
  }
  return instance;
}

module.exports = { QueryOptimizer, getQueryOptimizer };
