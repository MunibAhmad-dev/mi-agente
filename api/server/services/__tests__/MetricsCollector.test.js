/**
 * Tests para MetricsCollector
 */

const { MetricsCollector, getMetricsCollector } = require('../MetricsCollector');

describe('MetricsCollector', () => {
  let metricsCollector;

  beforeEach(() => {
    // Crear nueva instancia para cada test
    metricsCollector = new MetricsCollector({
      enableSystemMetrics: false,
      maxMetricsAge: 60000,
    });
  });

  describe('Constructor', () => {
    test('debe crear una instancia con config por defecto', () => {
      const mc = new MetricsCollector();
      expect(mc).toBeDefined();
      expect(mc.metrics).toBeInstanceOf(Map);
      expect(mc.config.enableSystemMetrics).toBe(true);
    });

    test('debe aceptar configuración personalizada', () => {
      const mc = new MetricsCollector({ enableSystemMetrics: false });
      expect(mc.config.enableSystemMetrics).toBe(false);
    });
  });

  describe('incrementCounter', () => {
    test('debe incrementar un contador existente', () => {
      metricsCollector.incrementCounter('requests', 'total');
      metricsCollector.incrementCounter('requests', 'total');

      const counter = metricsCollector.getCounter('requests', 'total');
      expect(counter.value).toBe(2);
    });

    test('debe crear contador si no existe', () => {
      metricsCollector.incrementCounter('new_counter', 'metric');

      const counter = metricsCollector.getCounter('new_counter', 'metric');
      expect(counter).toBeDefined();
      expect(counter.value).toBe(1);
    });

    test('debe incrementar con labels', () => {
      metricsCollector.incrementCounter('requests', 'by_status', { status: '200' });
      metricsCollector.incrementCounter('requests', 'by_status', { status: '200' });
      metricsCollector.incrementCounter('requests', 'by_status', { status: '500' });

      const counter200 = metricsCollector.getCounter('requests', 'by_status', { status: '200' });
      const counter500 = metricsCollector.getCounter('requests', 'by_status', { status: '500' });

      expect(counter200.value).toBe(2);
      expect(counter500.value).toBe(1);
    });
  });

  describe('recordHistogram', () => {
    test('debe registrar valores en histograma', () => {
      metricsCollector.recordHistogram('latency', 'request', 100);
      metricsCollector.recordHistogram('latency', 'request', 200);
      metricsCollector.recordHistogram('latency', 'request', 300);

      const histogram = metricsCollector.getHistogram('latency', 'request');
      expect(histogram.values.length).toBe(3);
    });

    test('debe calcular percentiles correctamente', () => {
      for (let i = 1; i <= 100; i++) {
        metricsCollector.recordHistogram('latency', 'test', i);
      }

      const histogram = metricsCollector.getHistogram('latency', 'test');
      expect(histogram.percentiles.p50).toBe(50);
      expect(histogram.percentiles.p90).toBe(90);
      expect(histogram.percentiles.p99).toBe(99);
    });
  });

  describe('setGauge', () => {
    test('debe establecer el valor de un gauge', () => {
      metricsCollector.setGauge('memory', 'used', 1024);

      const gauge = metricsCollector.getGauge('memory', 'used');
      expect(gauge.value).toBe(1024);
    });

    test('debe actualizar gauge existente', () => {
      metricsCollector.setGauge('cpu', 'usage', 50);
      metricsCollector.setGauge('cpu', 'usage', 75);

      const gauge = metricsCollector.getGauge('cpu', 'usage');
      expect(gauge.value).toBe(75);
    });
  });

  describe('getSummary', () => {
    test('debe devolver resumen con métricas', () => {
      metricsCollector.incrementCounter('requests', 'total');
      metricsCollector.recordHistogram('latency', 'request', 100);
      metricsCollector.setGauge('memory', 'used', 512);

      const summary = metricsCollector.getSummary();

      expect(summary).toBeDefined();
      expect(summary.timestamp).toBeDefined();
    });
  });

  describe('exportPrometheus', () => {
    test('debe exportar en formato Prometheus', () => {
      metricsCollector.incrementCounter('requests', 'total');
      metricsCollector.setGauge('memory', 'used', 1024);

      const prometheusOutput = metricsCollector.exportPrometheus();

      expect(prometheusOutput).toContain('# HELP');
      expect(prometheusOutput).toContain('# TYPE');
      expect(prometheusOutput).toContain('requests_total');
      expect(prometheusOutput).toContain('memory_used');
    });
  });

  describe('getAll', () => {
    test('debe devolver todas las métricas', () => {
      metricsCollector.incrementCounter('test', 'counter1');
      metricsCollector.setGauge('test', 'gauge1', 100);

      const allMetrics = metricsCollector.getAll();

      expect(allMetrics).toBeInstanceOf(Array);
      expect(allMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    test('debe limpiar métricas antiguas', () => {
      // Crear métricas con timestamps antiguos
      metricsCollector.incrementCounter('old', 'metric');
      metricsCollector.metrics.get('old').metric.timestamp = Date.now() - 120000;

      metricsCollector.cleanup();

      const oldMetric = metricsCollector.getCounter('old', 'metric');
      expect(oldMetric).toBeUndefined();
    });
  });
});
