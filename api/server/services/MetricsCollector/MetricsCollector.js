/**
 * Metrics Collector - Recopilación de Métricas del Sistema (JavaScript)
 *
 * Recopila métricas de todos los componentes del sistema:
 * - Runtimes (requests, latency, errors)
 * - Providers (usage, health)
 * - System (CPU, memory, uptime)
 * - Events (count by type)
 */

const EventEmitter = require('events');
const os = require('os');

const logger = {
  debug: (...args) => console.log('[MetricsCollector]', ...args),
  info: (...args) => console.log('[MetricsCollector]', ...args),
  warn: (...args) => console.warn('[MetricsCollector]', ...args),
  error: (...args) => console.error('[MetricsCollector]', ...args),
};

// Tipos de métricas
const MetricType = {
  COUNTER: 'counter', // Incrementa/decrementa
  GAUGE: 'gauge', // Valor actual
  HISTOGRAM: 'histogram', // Distribución de valores
  SUMMARY: 'summary', // Resumen de percentiles
};

// Categorías de métricas
const MetricCategory = {
  RUNTIME: 'runtime',
  PROVIDER: 'provider',
  SYSTEM: 'system',
  REQUEST: 'request',
  ERROR: 'error',
  CUSTOM: 'custom',
};

/**
 * Métrica Individual
 */
class Metric {
  constructor(name, type, category, description = '') {
    this.name = name;
    this.type = type;
    this.category = category;
    this.description = description;
    this.value = 0;
    this.values = []; // Para histogram/summary
    this.createdAt = Date.now();
    this.lastUpdated = Date.now();
  }

  increment(amount = 1) {
    this.value += amount;
    this.lastUpdated = Date.now();
  }

  decrement(amount = 1) {
    this.value -= amount;
    this.lastUpdated = Date.now();
  }

  set(value) {
    this.value = value;
    if (this.type === MetricType.HISTOGRAM || this.type === MetricType.SUMMARY) {
      this.values.push(value);
      if (this.values.length > 1000) this.values.shift(); // Keep last 1000
    }
    this.lastUpdated = Date.now();
  }

  record(value) {
    this.values.push(value);
    if (this.values.length > 1000) this.values.shift();
    this.value = value;
    this.lastUpdated = Date.now();
  }

  getPercentile(p) {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * p);
    return sorted[index] || sorted[sorted.length - 1];
  }

  getStats() {
    if (this.values.length === 0) {
      return {
        current: this.value,
        count: 0,
      };
    }

    const sum = this.values.reduce((a, b) => a + b, 0);
    return {
      current: this.value,
      count: this.values.length,
      sum,
      avg: sum / this.values.length,
      min: Math.min(...this.values),
      max: Math.max(...this.values),
      p50: this.getPercentile(0.5),
      p90: this.getPercentile(0.9),
      p95: this.getPercentile(0.95),
      p99: this.getPercentile(0.99),
    };
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      category: this.category,
      description: this.description,
      ...this.getStats(),
      createdAt: this.createdAt,
      lastUpdated: this.lastUpdated,
    };
  }
}

/**
 * Metrics Collector - Clase Principal
 */
class MetricsCollector extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      retentionPeriod: config.retentionPeriod || 3600000, // 1 hora
      maxMetrics: config.maxMetrics || 1000,
      collectionInterval: config.collectionInterval || 60000, // 1 minuto
      enableSystemMetrics: config.enableSystemMetrics !== false,
      ...config,
    };

    this.metrics = new Map();
    this.startTime = Date.now();
    this.collectionInterval = null;

    // Métricas predefinidas del sistema
    this.initializeSystemMetrics();

    // Iniciar colección si está configurado
    if (this.config.enableSystemMetrics) {
      this.startCollection();
    }
  }

  /**
   * Inicializar métricas del sistema
   */
  initializeSystemMetrics() {
    // CPU
    this.register(
      'system_cpu_usage',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'CPU usage percentage',
    );
    this.register(
      'system_cpu_cores',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'Number of CPU cores',
    );

    // Memoria
    this.register(
      'system_memory_total',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'Total system memory (bytes)',
    );
    this.register(
      'system_memory_used',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'Used system memory (bytes)',
    );
    this.register(
      'system_memory_free',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'Free system memory (bytes)',
    );

    // Uptime
    this.register(
      'system_uptime',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'System uptime (seconds)',
    );

    // Proceso
    this.register(
      'process_memory_heap_used',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'Heap used memory',
    );
    this.register(
      'process_memory_heap_total',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'Heap total memory',
    );
    this.register(
      'process_cpu_usage',
      MetricType.GAUGE,
      MetricCategory.SYSTEM,
      'Process CPU usage',
    );

    // Requests
    this.register('requests_total', MetricType.COUNTER, MetricCategory.REQUEST, 'Total requests');
    this.register(
      'requests_success',
      MetricType.COUNTER,
      MetricCategory.REQUEST,
      'Successful requests',
    );
    this.register('requests_failed', MetricType.COUNTER, MetricCategory.REQUEST, 'Failed requests');
    this.register(
      'requests_latency',
      MetricType.HISTOGRAM,
      MetricCategory.REQUEST,
      'Request latency (ms)',
    );

    // Errors
    this.register('errors_total', MetricType.COUNTER, MetricCategory.ERROR, 'Total errors');
  }

  /**
   * Registrar una métrica
   */
  register(name, type, category, description) {
    if (this.metrics.has(name)) {
      return this.metrics.get(name);
    }

    const metric = new Metric(name, type, category, description);
    this.metrics.set(name, metric);
    return metric;
  }

  /**
   * Obtener o crear métrica
   */
  getOrCreate(name, type = MetricType.COUNTER, category = MetricCategory.CUSTOM, description = '') {
    if (this.metrics.has(name)) {
      return this.metrics.get(name);
    }
    return this.register(name, type, category, description);
  }

  /**
   * Incrementar contador
   */
  incrementCounter(name, amount = 1, category = MetricCategory.CUSTOM) {
    const metric = this.getOrCreate(name, MetricType.COUNTER, category);
    metric.increment(amount);
    this.emit('metric.updated', metric);
    return metric;
  }

  /**
   * Establecer gauge
   */
  setGauge(name, value, category = MetricCategory.CUSTOM) {
    const metric = this.getOrCreate(name, MetricType.GAUGE, category);
    metric.set(value);
    this.emit('metric.updated', metric);
    return metric;
  }

  /**
   * Registrar latencia
   */
  recordLatency(name, value, category = MetricCategory.REQUEST) {
    const metric = this.getOrCreate(name, MetricType.HISTOGRAM, category);
    metric.record(value);
    this.emit('metric.updated', metric);
    return metric;
  }

  /**
   * Obtener métrica
   */
  get(name) {
    return this.metrics.get(name);
  }

  /**
   * Obtener todas las métricas
   */
  getAll() {
    return Array.from(this.metrics.values()).map((m) => m.toJSON());
  }

  /**
   * Obtener métricas por categoría
   */
  getByCategory(category) {
    return Array.from(this.metrics.values())
      .filter((m) => m.category === category)
      .map((m) => m.toJSON());
  }

  /**
   * Recopilar métricas del sistema
   */
  collectSystemMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // CPU
    let idleSum = 0;
    let totalSum = 0;
    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalSum += cpu.times[type];
      }
      idleSum += cpu.times.idle;
    });

    const cpuUsage = (1 - idleSum / totalSum) * 100;
    this.setGauge('system_cpu_usage', cpuUsage, MetricCategory.SYSTEM);
    this.setGauge('system_cpu_cores', cpus.length, MetricCategory.SYSTEM);

    // Memoria
    this.setGauge('system_memory_total', totalMem, MetricCategory.SYSTEM);
    this.setGauge('system_memory_used', usedMem, MetricCategory.SYSTEM);
    this.setGauge('system_memory_free', freeMem, MetricCategory.SYSTEM);

    // Uptime
    this.setGauge('system_uptime', Math.floor(process.uptime()), MetricCategory.SYSTEM);

    // Memoria del proceso
    const memUsage = process.memoryUsage();
    this.setGauge('process_memory_heap_used', memUsage.heapUsed, MetricCategory.SYSTEM);
    this.setGauge('process_memory_heap_total', memUsage.heapTotal, MetricCategory.SYSTEM);
  }

  /**
   * Iniciar colección automática
   */
  startCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.emit('collection.tick', this.getSummary());
    }, this.config.collectionInterval);

    logger.info(`[MetricsCollector] Collection started: every ${this.config.collectionInterval}ms`);
  }

  /**
   * Detener colección automática
   */
  stopCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }

  /**
   * Obtener resumen de métricas
   */
  getSummary() {
    return {
      total: this.metrics.size,
      byCategory: this.getCategoriesSummary(),
      system: {
        uptime: Math.floor(process.uptime()),
        memory: this.getMemoryInfo(),
        cpu: this.getCPUInfo(),
      },
      requests: this.getRequestsSummary(),
      errors: this.getErrorsSummary(),
      timestamp: Date.now(),
    };
  }

  /**
   * Resumen por categoría
   */
  getCategoriesSummary() {
    const categories = {};
    for (const metric of this.metrics.values()) {
      if (!categories[metric.category]) {
        categories[metric.category] = { count: 0, metrics: [] };
      }
      categories[metric.category].count++;
      categories[metric.category].metrics.push(metric.name);
    }
    return categories;
  }

  /**
   * Información de memoria
   */
  getMemoryInfo() {
    const mem = process.memoryUsage();
    const sysMem = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
    };

    return {
      heapUsed: this.formatBytes(mem.heapUsed),
      heapTotal: this.formatBytes(mem.heapTotal),
      rss: this.formatBytes(mem.rss),
      systemTotal: this.formatBytes(sysMem.total),
      systemFree: this.formatBytes(sysMem.free),
      systemUsed: this.formatBytes(sysMem.used),
    };
  }

  /**
   * Información de CPU
   */
  getCPUInfo() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return {
      cores: cpus.length,
      usage: ((1 - totalIdle / totalTick) * 100).toFixed(2) + '%',
      load: os.loadavg(),
    };
  }

  /**
   * Resumen de requests
   */
  getRequestsSummary() {
    const total = this.get('requests_total');
    const success = this.get('requests_success');
    const failed = this.get('requests_failed');
    const latency = this.get('requests_latency');

    return {
      total: total?.value || 0,
      success: success?.value || 0,
      failed: failed?.value || 0,
      latency: latency?.getStats() || {},
    };
  }

  /**
   * Resumen de errores
   */
  getErrorsSummary() {
    const errors = this.get('errors_total');
    return {
      total: errors?.value || 0,
    };
  }

  /**
   * Formatear bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Exportar métricas para Prometheus
   */
  exportPrometheus() {
    let output = '';

    for (const metric of this.metrics.values()) {
      const name = metric.name.replace(/-/g, '_');

      if (metric.type === MetricType.COUNTER) {
        output += `# TYPE ${name} counter\n`;
        output += `${name} ${metric.value}\n`;
      } else if (metric.type === MetricType.GAUGE) {
        output += `# TYPE ${name} gauge\n`;
        output += `${name} ${metric.value}\n`;
      } else if (metric.type === MetricType.HISTOGRAM) {
        const stats = metric.getStats();
        output += `# TYPE ${name} histogram\n`;
        output += `${name}_count ${stats.count}\n`;
        output += `${name}_sum ${stats.sum}\n`;
        output += `${name}_avg ${stats.avg}\n`;
        output += `${name}_p50 ${stats.p50}\n`;
        output += `${name}_p90 ${stats.p90}\n`;
        output += `${name}_p99 ${stats.p99}\n`;
      }
    }

    return output;
  }

  /**
   * Limpiar métricas antiguas
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [name, metric] of this.metrics) {
      if (now - metric.lastUpdated > this.config.retentionPeriod) {
        this.metrics.delete(name);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`[MetricsCollector] Cleaned ${cleaned} old metrics`);
    }
  }

  /**
   * Resetear métricas
   */
  reset() {
    for (const metric of this.metrics.values()) {
      metric.value = 0;
      metric.values = [];
    }
    logger.info('[MetricsCollector] All metrics reset');
  }
}

// Singleton
let collectorInstance = null;

function getMetricsCollector(config) {
  if (!collectorInstance) {
    collectorInstance = new MetricsCollector(config);
  }
  return collectorInstance;
}

function createMetricsCollector(config) {
  collectorInstance = new MetricsCollector(config);
  return collectorInstance;
}

module.exports = {
  MetricsCollector,
  Metric,
  MetricType,
  MetricCategory,
  getMetricsCollector,
  createMetricsCollector,
};
