/**
 * Load Test Configuration - k6
 * ==========================
 *
 * Tests de carga usando k6.
 *
 * Usage:
 *   k6 run test/load/load_test.js
 *   k6 run --env TARGET=https://api.example.com test/load/load_test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ============================================================================
// CUSTOM METRICS
// ============================================================================

const successRate = new Rate('success_rate');
const apiLatency = new Trend('api_latency');
const errorCounter = new Counter('errors');

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = __ENV.TARGET || 'http://localhost:3080';
const API_KEY = __ENV.API_KEY || 'test-api-key';
const TEST_USER_EMAIL = `loadtest_${Date.now()}@example.com`;
const TEST_USER_PASSWORD = 'LoadTest123!';

// ============================================================================
// TEST OPTIONS
// ============================================================================

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp up
    { duration: '1m', target: 50 }, // Steady load
    { duration: '30s', target: 100 }, // Spike
    { duration: '1m', target: 100 }, // Hold
    { duration: '30s', target: 0 }, // Ramp down
  ],

  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
    http_req_failed: ['rate<0.01'], // Less than 1% failures
    success_rate: ['rate>0.95'], // 95% success rate
  },
};

// ============================================================================
// SETUP
// ============================================================================

export function setup() {
  // Register test user
  const registerRes = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({
      email: TEST_USER_EMAIL,
      username: `loadtest_${Date.now()}`,
      password: TEST_USER_PASSWORD,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );

  let token = null;
  if (registerRes.status === 200) {
    const body = JSON.parse(registerRes.body);
    token = body.token || body.data?.token;
  }

  return {
    token,
    email: TEST_USER_EMAIL,
  };
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

export default function (data) {
  const token = data.token;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };

  // Scenario 1: Health Check
  group('Health Checks', () => {
    const res = http.get(`${BASE_URL}/health`);

    check(res, {
      'health check status 200': (r) => r.status === 200,
      'health check has status field': (r) => JSON.parse(r.body).status !== undefined,
    });

    apiLatency.add(res.timings.duration);
    successRate.add(res.status === 200);
  });

  sleep(0.5);

  // Scenario 2: List Conversations
  group('Conversations', () => {
    const res = http.get(`${BASE_URL}/api/conversations`, { headers });

    check(res, {
      'conversations list status': (r) => r.status === 200 || r.status === 401,
    });

    apiLatency.add(res.timings.duration);
    successRate.add(res.status === 200);
  });

  sleep(0.5);

  // Scenario 3: Search
  group('Search', () => {
    const res = http.get(`${BASE_URL}/api/search?q=test`, { headers });

    check(res, {
      'search status': (r) => r.status === 200 || r.status === 401,
    });

    apiLatency.add(res.timings.duration);
    successRate.add(res.status === 200);
  });

  sleep(0.5);

  // Scenario 4: HuggingFace API (if configured)
  group('HuggingFace', () => {
    const res = http.get(`${BASE_URL}/api/huggingface/status`, { headers });

    check(res, {
      'hf status status': (r) => r.status === 200,
    });

    apiLatency.add(res.timings.duration);
    successRate.add(res.status === 200);
  });

  sleep(0.5);

  // Scenario 5: Message Generation (mock)
  group('Message Generation', () => {
    const payload = JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello, this is a load test' }],
      stream: false,
    });

    const res = http.post(`${BASE_URL}/api/messages`, payload, { headers });

    check(res, {
      'message status': (r) => [200, 401, 429].includes(r.status),
    });

    apiLatency.add(res.timings.duration);

    if (res.status !== 200 && res.status !== 401) {
      errorCounter.add(1);
    }
  });

  sleep(1);
}

// ============================================================================
// TEARDOWN
// ============================================================================

export function teardown(data) {
  // Cleanup test data if needed
  console.log('Load test completed');
  console.log(`Success rate: ${(successRate.rate * 100).toFixed(2)}%`);
}

// ============================================================================
// HANDLERS
// ============================================================================

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let output = '\n' + indent + '='.repeat(60) + '\n';
  output += indent + '  LOAD TEST RESULTS\n';
  output += indent + '='.repeat(60) + '\n\n';

  output += indent + `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  output +=
    indent + `Request Duration (avg): ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  output +=
    indent +
    `Request Duration (p95): ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  output +=
    indent +
    `Request Duration (p99): ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
  output +=
    indent + `Failure Rate: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
  output +=
    indent +
    `Success Rate: ${((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2)}%\n`;

  output += '\n' + indent + '-'.repeat(60) + '\n';

  return output;
}
