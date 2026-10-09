/**
 * BenchmarkTool - Herramienta de benchmarking para rendimiento
 */

const http = require('http');
const https = require('https');
const { logger } = require('@librechat/data-schemas');

class BenchmarkTool {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3001';
    this.concurrency = options.concurrency || 10;
    this.duration = options.duration || 10000; // 10 segundos
    this.requests = options.requests || 100;
  }

  /**
   * Hacer request HTTP
   */
  async makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const url = new URL(path, this.baseUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const reqOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = protocol.request(reqOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const duration = Date.now() - start;
          resolve({
            status: res.statusCode,
            duration,
            headers: res.headers,
            body: data.substring(0, 1000), // Limitar tamaño
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          status: 0,
          duration: Date.now() - start,
          error: err.message,
        });
      });

      req.setTimeout(30000, () => {
        req.destroy();
        resolve({
          status: 0,
          duration: Date.now() - start,
          error: 'Timeout',
        });
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * Ejecutar benchmark de endpoints
   */
  async benchmark(endpoints, options = {}) {
    const results = {};
    const { concurrency = this.concurrency, duration = this.duration } = options;

    logger.info(`[Benchmark] Starting benchmark...`);
    logger.info(`[Benchmark] URL: ${this.baseUrl}`);
    logger.info(`[Benchmark] Concurrency: ${concurrency}`);
    logger.info(`[Benchmark] Duration: ${duration}ms`);
    logger.info(`[Benchmark] Endpoints: ${endpoints.length}`);

    for (const endpoint of endpoints) {
      logger.info(`\n[Benchmark] Testing: ${endpoint.method} ${endpoint.path}`);

      const endpointResults = {
        method: endpoint.method,
        path: endpoint.path,
        requests: [],
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: [],
        statusCodes: {},
      };

      // Función para ejecutar requests concurrentes
      const runBatch = async () => {
        const batch = [];
        for (let i = 0; i < concurrency; i++) {
          batch.push(
            this.makeRequest(endpoint.path, {
              method: endpoint.method,
              body: endpoint.body,
            }).then((result) => {
              endpointResults.totalRequests++;
              endpointResults.durations.push(result.duration);
              endpointResults.totalDuration += result.duration;
              endpointResults.minDuration = Math.min(endpointResults.minDuration, result.duration);
              endpointResults.maxDuration = Math.max(endpointResults.maxDuration, result.duration);

              if (result.status >= 200 && result.status < 400) {
                endpointResults.successfulRequests++;
              } else {
                endpointResults.failedRequests++;
              }

              endpointResults.statusCodes[result.status] =
                (endpointResults.statusCodes[result.status] || 0) + 1;
            }),
          );
        }

        await Promise.all(batch);
      };

      // Ejecutar por duración o número de requests
      const endTime = Date.now() + duration;
      let batchCount = 0;

      while (Date.now() < endTime) {
        await runBatch();
        batchCount++;
      }

      // Calcular estadísticas
      endpointResults.avgDuration =
        endpointResults.totalRequests > 0
          ? endpointResults.totalDuration / endpointResults.totalRequests
          : 0;
      endpointResults.requestsPerSecond =
        endpointResults.totalDuration > 0
          ? (endpointResults.totalRequests / endpointResults.totalDuration) * 1000
          : 0;

      // Calcular percentiles
      endpointResults.percentiles = this.calculatePercentiles(endpointResults.durations);

      // Calcular percentil de error
      endpointResults.errorRate =
        endpointResults.totalRequests > 0
          ? ((endpointResults.failedRequests / endpointResults.totalRequests) * 100).toFixed(2) +
            '%'
          : '0%';

      logger.info(`[Benchmark] Results for ${endpoint.path}:`);
      logger.info(`  Total Requests: ${endpointResults.totalRequests}`);
      logger.info(`  Successful: ${endpointResults.successfulRequests}`);
      logger.info(`  Failed: ${endpointResults.failedRequests}`);
      logger.info(`  Avg Duration: ${Math.round(endpointResults.avgDuration)}ms`);
      logger.info(`  Requests/sec: ${endpointResults.requestsPerSecond.toFixed(2)}`);
      logger.info(`  p50: ${endpointResults.percentiles.p50}ms`);
      logger.info(`  p90: ${endpointResults.percentiles.p90}ms`);
      logger.info(`  p99: ${endpointResults.percentiles.p99}ms`);

      results[`${endpoint.method}:${endpoint.path}`] = endpointResults;
    }

    return results;
  }

  /**
   * Calcular percentiles
   */
  calculatePercentiles(durations) {
    if (durations.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: Math.round(sorted[Math.floor(len * 0.5)]),
      p90: Math.round(sorted[Math.floor(len * 0.9)]),
      p95: Math.round(sorted[Math.floor(len * 0.95)]),
      p99: Math.round(sorted[Math.floor(len * 0.99)]),
    };
  }

  /**
   * Benchmark rápido de un endpoint
   */
  async quickBenchmark(path, iterations = 100) {
    logger.info(`[Benchmark] Quick benchmark: ${iterations} requests to ${path}`);

    const durations = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < iterations; i++) {
      const result = await this.makeRequest(path);

      durations.push(result.duration);

      if (result.status >= 200 && result.status < 400) {
        successCount++;
      } else {
        errorCount++;
      }

      if ((i + 1) % 10 === 0) {
        process.stdout.write('.');
      }
    }

    logger.info('\n');

    return {
      path,
      iterations,
      successCount,
      errorCount,
      errorRate: ((errorCount / iterations) * 100).toFixed(2) + '%',
      avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      percentiles: this.calculatePercentiles(durations),
      requestsPerSecond: (iterations / (durations.reduce((a, b) => a + b, 0) / 1000)).toFixed(2),
    };
  }

  /**
   * Comparar dos URLs
   */
  async compare(url1, url2, path = '/api/health') {
    logger.info('[Benchmark] Comparing two URLs...\n');

    const originalUrl = this.baseUrl;

    // Benchmark URL 1
    this.baseUrl = url1;
    const results1 = await this.quickBenchmark(path, 50);

    // Benchmark URL 2
    this.baseUrl = url2;
    const results2 = await this.quickBenchmark(path, 50);

    // Restaurar URL original
    this.baseUrl = originalUrl;

    // Comparar resultados
    const comparison = {
      url1: { ...results1, url: url1 },
      url2: { ...results2, url: url2 },
      winner: results1.avgDuration < results2.avgDuration ? 'url1' : 'url2',
      difference: {
        avgDuration: Math.abs(results1.avgDuration - results2.avgDuration),
        rps: Math.abs(
          parseFloat(results1.requestsPerSecond) - parseFloat(results2.requestsPerSecond),
        ),
      },
    };

    logger.info('\n=== COMPARISON RESULTS ===');
    logger.info(
      `URL 1 (${url1}): ${results1.avgDuration}ms avg, ${results1.requestsPerSecond} req/s`,
    );
    logger.info(
      `URL 2 (${url2}): ${results2.avgDuration}ms avg, ${results2.requestsPerSecond} req/s`,
    );
    logger.info(`Winner: ${comparison.winner}`);

    return comparison;
  }

  /**
   * Generar reporte de benchmarking
   */
  generateReport(results) {
    let report = '# 📊 Benchmark Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Base URL: ${this.baseUrl}\n\n`;

    for (const [key, result] of Object.entries(results)) {
      report += `## ${key}\n\n`;
      report += `| Metric | Value |\n`;
      report += `|--------|-------|\n`;
      report += `| Total Requests | ${result.totalRequests} |\n`;
      report += `| Successful | ${result.successfulRequests} |\n`;
      report += `| Failed | ${result.failedRequests} |\n`;
      report += `| Error Rate | ${result.errorRate} |\n`;
      report += `| Avg Duration | ${Math.round(result.avgDuration)}ms |\n`;
      report += `| Min Duration | ${result.minDuration}ms |\n`;
      report += `| Max Duration | ${result.maxDuration}ms |\n`;
      report += `| p50 | ${result.percentiles.p50}ms |\n`;
      report += `| p90 | ${result.percentiles.p90}ms |\n`;
      report += `| p95 | ${result.percentiles.p95}ms |\n`;
      report += `| p99 | ${result.percentiles.p99}ms |\n`;
      report += `| Requests/sec | ${result.requestsPerSecond.toFixed(2)} |\n\n`;
    }

    return report;
  }
}

module.exports = { BenchmarkTool };
