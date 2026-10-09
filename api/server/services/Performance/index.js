/**
 * Performance Services
 * ===================
 *
 * Export performance services
 */

const PerformanceMonitor = require('./PerformanceMonitor');
const CacheService = require('./CacheService');
const HealthService = require('./HealthService');
const { ResponseCache, getResponseCache } = require('./ResponseCache');
const { QueryOptimizer, getQueryOptimizer } = require('./QueryOptimizer');

module.exports = {
  PerformanceMonitor,
  CacheService,
  HealthService,
  ResponseCache,
  getResponseCache,
  QueryOptimizer,
  getQueryOptimizer,
};
module.exports.default = {
  PerformanceMonitor,
  CacheService,
  HealthService,
  ResponseCache,
  getResponseCache,
  QueryOptimizer,
  getQueryOptimizer,
};
