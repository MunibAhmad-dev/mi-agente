# Testing Guide

## 📋 Overview

This directory contains all test files for Mi LibreChat API.

## 📁 Structure

```
test/
├── unit/                 # Unit tests
│   └── services.test.js
├── integration/          # Integration tests
├── security/             # Security tests
│   └── api.test.js
├── load/                # Load tests (k6)
│   └── load_test.js
├── mocks/               # Mock data
├── setup.js             # Test setup
└── README.md            # This file
```

## 🚀 Running Tests

### Prerequisites

```bash
# Install dev dependencies
npm install --save-dev jest supertest

# Install k6 for load testing
# macOS
brew install k6
# Linux
sudo apt install k6
```

### Run All Tests

```bash
# From api/server directory
npm test

# With coverage
npm run test:coverage
```

### Run Specific Test Types

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Security tests only
npm run test:security

# Watch mode
npm run test:watch
```

### Run Load Tests

```bash
# Basic load test
k6 run test/load/load_test.js

# With custom target
k6 run --env TARGET=https://api.example.com test/load/load_test.js

# With API key
k6 run --env TARGET=https://api.example.com --env API_KEY=your-key test/load/load_test.js
```

## 📝 Writing Tests

### Unit Test Template

```javascript
const { describe, it, expect, beforeAll } = require('@jest/globals');

describe('ServiceName', () => {
  let service;
  
  beforeAll(() => {
    service = require('../../services/ServiceName');
  });
  
  describe('methodName', () => {
    it('should do something', async () => {
      const result = await service.methodName(param);
      expect(result).toBeDefined();
    });
  });
});
```

### Integration Test Template

```javascript
const request = require('supertest');

describe('API Endpoint', () => {
  let app;
  
  beforeAll(async () => {
    app = require('../../index');
  });
  
  it('should handle valid request', async () => {
    const res = await request(app)
      .get('/api/resource')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
  });
});
```

### Security Test Template

```javascript
describe('Security', () => {
  it('should prevent SQL injection', async () => {
    const res = await request(app)
      .get('/api/search')
      .query({ q: "' OR '1'='1" });
    
    expect(res.status).toBe(400);
  });
});
```

## 🔒 Security Tests

Security tests check for:
- SQL/NoSQL injection
- XSS prevention
- Command injection
- Authentication bypass
- Authorization flaws
- Rate limiting
- Sensitive data exposure

Run security tests:
```bash
npm run test:security
```

## ⚡ Load Tests

Load tests use k6 to simulate realistic traffic.

### Configuration

Edit `load/load_test.js` to customize:
- Test duration
- Virtual users (VUs)
- Request patterns
- Thresholds

### Metrics

The load test collects:
- Request duration (p50, p95, p99)
- Success rate
- Error rate
- Custom API latency trends

### Interpret Results

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| p95 Latency | <500ms | 500-1000ms | >1000ms |
| Error Rate | <1% | 1-5% | >5% |
| Success Rate | >95% | 90-95% | <90% |

## 📊 CI/CD Integration

Add to your CI pipeline:

```yaml
# GitHub Actions
- name: Run Tests
  run: |
    npm ci
    npm run test:unit
    npm run test:security

- name: Load Test
  run: k6 run test/load/load_test.js
```

## 🎯 Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Clean up test data in `afterAll`
3. **Mock External**: Mock external APIs when possible
4. **Descriptive**: Use clear test names
5. **Coverage**: Aim for meaningful coverage, not 100%
6. **Fast**: Keep unit tests fast (<1s each)
7. **Deterministic**: Tests should produce same results

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs)
- [Supertest](https://github.com/visionmedia/supertest)
- [k6 Documentation](https://k6.io/docs/)
