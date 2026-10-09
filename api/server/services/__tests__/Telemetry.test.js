/**
 * Tests para Telemetry Service
 */

const { Telemetry, getTelemetry } = require('../Telemetry');

describe('Telemetry', () => {
  let telemetry;

  beforeEach(() => {
    telemetry = new Telemetry({
      serviceName: 'test-service',
      enableAlerts: true,
      maxLogs: 100,
    });
  });

  describe('Constructor', () => {
    test('debe crear una instancia con config', () => {
      expect(telemetry).toBeDefined();
      expect(telemetry.serviceName).toBe('test-service');
      expect(telemetry.logs).toBeInstanceOf(Array);
      expect(telemetry.alerts).toBeInstanceOf(Array);
      expect(telemetry.traces).toBeInstanceOf(Map);
    });

    test('debe usar valores por defecto', () => {
      const tel = new Telemetry();
      expect(tel.serviceName).toBe('app');
      expect(tel.maxLogs).toBe(1000);
    });
  });

  describe('Logging', () => {
    test('debe registrar log de debug', () => {
      telemetry.debug('Test debug message', { key: 'value' });

      expect(telemetry.logs.length).toBe(1);
      expect(telemetry.logs[0].level).toBe(0);
      expect(telemetry.logs[0].message).toBe('Test debug message');
      expect(telemetry.logs[0].context).toEqual({ key: 'value' });
    });

    test('debe registrar log de info', () => {
      telemetry.info('Test info message');

      expect(telemetry.logs[0].level).toBe(1);
      expect(telemetry.logs[0].message).toBe('Test info message');
    });

    test('debe registrar log de warn', () => {
      telemetry.warn('Test warn message');

      expect(telemetry.logs[0].level).toBe(2);
    });

    test('debe registrar log de error', () => {
      telemetry.error('Test error message');

      expect(telemetry.logs[0].level).toBe(3);
    });

    test('debe registrar log de fatal', () => {
      telemetry.fatal('Test fatal message');

      expect(telemetry.logs[0].level).toBe(4);
    });

    test('debe limitar logs a maxLogs', () => {
      const tel = new Telemetry({ maxLogs: 5 });

      for (let i = 0; i < 10; i++) {
        tel.info(`Log ${i}`);
      }

      expect(tel.logs.length).toBe(5);
      expect(tel.logs[0].message).toBe('Log 5'); // Los más recientes
    });
  });

  describe('Tracing', () => {
    test('debe crear un trace', () => {
      const trace = telemetry.startTrace('test-operation');

      expect(trace).toBeDefined();
      expect(trace.traceId).toBeDefined();
      expect(trace.id).toBeDefined();
      expect(trace.operationName).toBe('test-operation');
      expect(trace.status).toBe('running');
    });

    test('debe completar un trace', () => {
      const trace = telemetry.startTrace('test-op');
      telemetry.endTrace(trace.id);

      const completedTrace = telemetry.traces.get(trace.id);
      expect(completedTrace.status).toBe('ok');
      expect(completedTrace.endTime).toBeDefined();
    });

    test('debe marcar trace como error', () => {
      const trace = telemetry.startTrace('test-op');
      telemetry.endTrace(trace.id, 'error');

      const completedTrace = telemetry.traces.get(trace.id);
      expect(completedTrace.status).toBe('error');
    });

    test('debe crear span dentro de trace', () => {
      const trace = telemetry.startTrace('parent-op');
      const span = telemetry.startSpan('child-span', trace.id);

      expect(span).toBeDefined();
      expect(span.parentId).toBe(trace.id);
    });

    test('debe completar span', () => {
      const trace = telemetry.startTrace('parent');
      const span = telemetry.startSpan('child', trace.id);
      telemetry.endSpan(span.id);

      const completedSpan = trace.spans.find((s) => s.id === span.id);
      expect(completedSpan.status).toBe('ok');
    });
  });

  describe('Alerts', () => {
    test('debe crear una alerta', () => {
      const alert = telemetry.createAlert('test_type', 'Test alert', 'warning');

      expect(alert).toBeDefined();
      expect(alert.id).toBeDefined();
      expect(alert.type).toBe('test_type');
      expect(alert.message).toBe('Test alert');
      expect(alert.severity).toBe('warning');
      expect(alert.status).toBe('active');
    });

    test('debe crear alerta crítica automáticamente para logs FATAL', () => {
      telemetry.fatal('Critical error occurred');

      const criticalAlerts = telemetry.alerts.filter((a) => a.severity === 'critical');
      expect(criticalAlerts.length).toBeGreaterThan(0);
    });

    test('debe resolver una alerta', () => {
      const alert = telemetry.createAlert('test', 'Test', 'warning');
      const resolved = telemetry.resolveAlert(alert.id);

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).toBeDefined();
    });

    test('debe ignorar alertas si están deshabilitadas', () => {
      const tel = new Telemetry({ enableAlerts: false });
      const alert = tel.createAlert('test', 'Test', 'warning');

      expect(alert).toBeNull();
    });
  });

  describe('Health Status', () => {
    test('debe devolver estado saludable', () => {
      telemetry.info('Normal operation');

      const health = telemetry.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.uptime).toBeGreaterThan(0);
    });

    test('debe detectar sistema degradado por errores', () => {
      for (let i = 0; i < 10; i++) {
        telemetry.error('Error ' + i);
      }

      const health = telemetry.getHealthStatus();
      expect(health.status).toBe('degraded');
    });

    test('debe detectar sistema crítico', () => {
      telemetry.fatal('System down');

      const health = telemetry.getHealthStatus();
      expect(health.status).toBe('critical');
    });
  });

  describe('Dashboard Data', () => {
    test('debe devolver datos completos del dashboard', () => {
      telemetry.info('Test log');
      telemetry.createAlert('test', 'Alert', 'info');
      telemetry.startTrace('test-trace');

      const dashboard = telemetry.getDashboardData();

      expect(dashboard).toBeDefined();
      expect(dashboard.system).toBeDefined();
      expect(dashboard.logs).toBeDefined();
      expect(dashboard.alerts).toBeDefined();
      expect(dashboard.traces).toBeDefined();
    });
  });

  describe('getLogStats', () => {
    test('debe devolver estadísticas de logs', () => {
      telemetry.debug('Debug log');
      telemetry.info('Info log');
      telemetry.info('Another info');
      telemetry.warn('Warning log');
      telemetry.error('Error log');

      const stats = telemetry.getLogStats();

      expect(stats.total).toBe(5);
      expect(stats.byLevel.debug).toBe(1);
      expect(stats.byLevel.info).toBe(2);
      expect(stats.byLevel.warn).toBe(1);
      expect(stats.byLevel.error).toBe(1);
    });
  });
});
