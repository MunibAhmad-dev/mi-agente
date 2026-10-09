/**
 * Tests para Metrics Routes
 */

const express = require('express');

// Mock the services before requiring the router
jest.mock('../services/MetricsCollector', () => {
  const mockInstance = {
    getSummary: jest.fn(() => ({
      system: { cpu: { usage: '45%' } },
      requests: { total: 100 },
      errors: { total: 5 },
    })),
    getAll: jest.fn(() => [{ name: 'requests_total', type: 'counter', value: 100 }]),
    exportPrometheus: jest.fn(
      () =>
        '# HELP requests_total Total requests\n# TYPE requests_total counter\nrequests_total 100',
    ),
    getDashboardData: jest.fn(() => ({
      system: {},
      requests: {},
      errors: {},
      health: { status: 'healthy' },
      alerts: [],
    })),
  };

  return {
    getMetricsCollector: jest.fn(() => mockInstance),
    MetricsCollector: jest.fn(() => mockInstance),
  };
});

jest.mock('../services/Telemetry', () => {
  const mockInstance = {
    getHealthStatus: jest.fn(() => ({ status: 'healthy', uptime: 3600 })),
    logs: [{ toJSON: () => ({ level: 1, message: 'Test log', timestamp: Date.now() }) }],
    alerts: [
      {
        toJSON: () => ({
          id: 'alert_1',
          message: 'Test alert',
          severity: 'warning',
          status: 'active',
        }),
      },
    ],
    traces: new Map([['trace_1', { toJSON: () => ({ id: 'trace_1', operationName: 'test' }) }]]),
  };

  return {
    getTelemetry: jest.fn(() => mockInstance),
    Telemetry: jest.fn(() => mockInstance),
  };
});

const { router: metricsRouter } = require('../routes/metrics');
const { router: telemetryRouter } = require('../routes/telemetry');
const { router: systemRouter } = require('../routes/system');

describe('Metrics Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/metrics', metricsRouter);
  });

  describe('GET /api/metrics/summary', () => {
    test('debe devolver resumen de métricas', async () => {
      const mockReq = {
        method: 'GET',
        url: '/api/metrics/summary',
      };

      // Simular request/response
      const req = { method: 'GET', url: '/api/metrics/summary', query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        set: jest.fn(),
      };

      // Call the route handler directly
      const handler = metricsRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/summary',
      );

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.json).toHaveBeenCalled();
      }
    });

    test('debe manejar errores cuando MetricsCollector no está disponible', async () => {
      // Reset mocks to return null
      const { getMetricsCollector } = require('../services/MetricsCollector');
      getMetricsCollector.mockReturnValueOnce(null);

      const req = { method: 'GET', url: '/api/metrics/summary', query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        set: jest.fn(),
      };

      const handler = metricsRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/summary',
      );

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.status).toHaveBeenCalledWith(503);
      }
    });
  });

  describe('GET /api/metrics/dashboard', () => {
    test('debe devolver datos del dashboard', async () => {
      const req = { method: 'GET', url: '/api/metrics/dashboard', query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        set: jest.fn(),
      };

      const handler = metricsRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/dashboard',
      );

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.json).toHaveBeenCalled();
      }
    });
  });

  describe('GET /api/metrics', () => {
    test('debe devolver métricas en formato JSON por defecto', async () => {
      const req = { method: 'GET', url: '/api/metrics', query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        set: jest.fn(),
      };

      const handler = metricsRouter.stack.find((layer) => layer.route && layer.route.path === '/');

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ metrics: expect.any(Array) }),
        );
      }
    });

    test('debe devolver métricas en formato Prometheus', async () => {
      const req = { method: 'GET', url: '/api/metrics', query: { format: 'prometheus' } };
      const res = {
        send: jest.fn(),
        set: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      const handler = metricsRouter.stack.find((layer) => layer.route && layer.route.path === '/');

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
        expect(res.send).toHaveBeenCalled();
      }
    });
  });
});

describe('Telemetry Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/telemetry', telemetryRouter);
  });

  describe('GET /api/telemetry/health', () => {
    test('debe devolver estado de salud', async () => {
      const req = { method: 'GET', url: '/api/telemetry/health', query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      const handler = telemetryRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/health',
      );

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.json).toHaveBeenCalled();
      }
    });
  });

  describe('GET /api/telemetry/logs', () => {
    test('debe devolver logs con límite', async () => {
      const req = { method: 'GET', url: '/api/telemetry/logs', query: { limit: '50' } };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      const handler = telemetryRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/logs',
      );

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            logs: expect.any(Array),
            count: expect.any(Number),
          }),
        );
      }
    });
  });

  describe('GET /api/telemetry/alerts', () => {
    test('debe devolver alertas activas', async () => {
      const req = { method: 'GET', url: '/api/telemetry/alerts', query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      const handler = telemetryRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/alerts',
      );

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.json).toHaveBeenCalled();
      }
    });
  });
});

describe('System Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', systemRouter);
  });

  describe('GET /api/health', () => {
    test('debe devolver estado de salud del sistema', async () => {
      const req = { method: 'GET', url: '/api/health', query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      const handler = systemRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/health',
      );

      if (handler) {
        handler.route.stack[0].handle(req, res);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: expect.any(String),
            timestamp: expect.any(Number),
            uptime: expect.any(Number),
            version: expect.any(String),
          }),
        );
      }
    });
  });
});
