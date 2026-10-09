'use strict';

/**
 * OpenTelemetry bootstrap — MUST be required before any other module.
 *
 * Wires the already-installed OTel packages (@opentelemetry/sdk-node,
 * instrumentations, etc.) to an OTLP HTTP exporter so spans are sent
 * to a real collector (Jaeger, Grafana Tempo, Honeycomb, etc.).
 *
 * Env vars:
 *   OTEL_ENABLED=true                   — enable tracing (default: false)
 *   OTEL_SERVICE_NAME=mi-agente         — service name in traces
 *   OTEL_EXPORTER_OTLP_ENDPOINT         — OTLP endpoint (default: http://localhost:4318)
 *   OTEL_EXPORTER_OTLP_HEADERS          — comma-separated "key=value" auth headers
 *
 * When OTEL_ENABLED is not "true" this file is a no-op so development
 * environments don't need any collector running.
 */

if (process.env.OTEL_ENABLED !== 'true') {
  // Export a no-op tracer so callers can always do require('./tracing').tracer
  const { trace } = require('@opentelemetry/api');
  module.exports = { tracer: trace.getTracer('noop') };
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { MongooseInstrumentation } = require('@opentelemetry/instrumentation-mongoose');
const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');
const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');
const { trace, SpanStatusCode } = require('@opentelemetry/api');

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const serviceName = process.env.OTEL_SERVICE_NAME || 'mi-agente';
const serviceVersion = process.env.npm_package_version || '1.0.0';

// Parse optional auth headers: "Authorization=Bearer token,X-Custom=value"
function parseHeaders(raw) {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(',').map((pair) => pair.trim().split('=').map((s) => s.trim())),
  );
}

const exporter = new OTLPTraceExporter({
  url: `${endpoint}/v1/traces`,
  headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  traceExporter: exporter,
  instrumentations: [
    new HttpInstrumentation({
      // Don't trace health-check and metrics endpoints — they'd flood the collector
      ignoreIncomingRequestHook: (req) => {
        const url = req.url || '';
        return url.includes('/health') || url.includes('/metrics') || url.includes('/api/health');
      },
    }),
    new ExpressInstrumentation(),
    new MongoDBInstrumentation({ enhancedDatabaseReporting: false }),
    new MongooseInstrumentation(),
    new IORedisInstrumentation(),
    new UndiciInstrumentation(),
  ],
});

sdk.start();

// Flush spans and shut down cleanly on process exit
process.on('SIGTERM', () => sdk.shutdown().catch(() => {}));
process.on('SIGINT',  () => sdk.shutdown().catch(() => {}));

console.log(`[OTel] Tracing enabled → ${endpoint} (service: ${serviceName})`);

const tracer = trace.getTracer(serviceName, serviceVersion);

/**
 * Convenience helper: wrap an async function in a named span.
 *
 * Usage:
 *   const result = await withSpan('myOperation', async (span) => {
 *     span.setAttribute('key', 'value');
 *     return doWork();
 *   });
 */
async function withSpan(name, fn, attrs = {}) {
  return tracer.startActiveSpan(name, async (span) => {
    Object.entries(attrs).forEach(([k, v]) => span.setAttribute(k, v));
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}

module.exports = { tracer, withSpan, sdk };
