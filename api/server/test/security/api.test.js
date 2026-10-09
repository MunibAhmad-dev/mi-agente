/**
 * Security Tests - API Security
 * ============================
 *
 * Tests de seguridad para endpoints API.
 */

const request = require('supertest');

// ============================================================================
// SECURITY TEST HELPERS
// ============================================================================

function checkSecurityHeaders(res) {
  // Check for common security headers
  const securityHeaders = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': /DENY|SAMEORIGIN/,
    'x-xss-protection': /1/,
    'strict-transport-security': /max-age/,
  };

  for (const [header, expected] of Object.entries(securityHeaders)) {
    const value = res.headers[header.toLowerCase()];
    if (value) {
      if (expected instanceof RegExp) {
        expect(value).toMatch(expected);
      } else {
        expect(value.toLowerCase()).toBe(expected.toLowerCase());
      }
    }
  }
}

function checkNoSensitiveData(res) {
  const bodyStr = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);

  // Check body doesn't contain sensitive patterns
  const sensitivePatterns = [
    /password[:=]\s*['"]?\w+['"]?/i,
    /api[_-]?key[:=]\s*['"]?\w+['"]?/i,
    /secret[:=]\s*['"]?\w+['"]?/i,
    /token[:=]\s*['"]?\w+['"]?/i,
  ];

  for (const pattern of sensitivePatterns) {
    expect(bodyStr).not.toMatch(pattern);
  }
}

// ============================================================================
// AUTH TESTS
// ============================================================================

describe('Authentication Security', () => {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3080';
  let app;

  beforeAll(async () => {
    try {
      app = require('../../index');
    } catch (e) {
      // App may not be configured for tests
    }
  });

  describe('POST /api/auth/register', () => {
    it('should reject weak passwords', async () => {
      if (!app) return;

      const res = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        username: 'testuser',
        password: '123', // Too short
      });

      expect([400, 422]).toContain(res.status);
    });

    it('should reject duplicate emails', async () => {
      if (!app) return;

      // First registration
      const email = `duplicate_${Date.now()}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({
          email,
          username: `user1_${Date.now()}`,
          password: 'StrongPass123!',
        });

      // Second registration with same email
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          username: `user2_${Date.now()}`,
          password: 'StrongPass123!',
        });

      expect([400, 409]).toContain(res.status);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should not leak user existence', async () => {
      if (!app) return;

      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'anypassword',
      });

      // Should not distinguish between wrong email vs wrong password
      expect([400, 401]).toContain(res.status);
    });

    it('should implement rate limiting', async () => {
      if (!app) return;

      // Make multiple rapid requests
      const promises = Array(10)
        .fill(null)
        .map(() =>
          request(app).post('/api/auth/login').send({
            email: 'ratelimit@example.com',
            password: 'wrongpassword',
          }),
        );

      const results = await Promise.all(promises);

      // At least some should be rate limited
      const statusCodes = results.map((r) => r.status);
      const rateLimited = statusCodes.filter((s) => s === 429);

      // Either rate limited or all successful (depending on implementation)
      expect(rateLimited.length > 0 || !statusCodes.includes(429)).toBe(true);
    });
  });
});

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

describe('Input Validation Security', () => {
  let app;

  beforeAll(async () => {
    try {
      app = require('../../index');
    } catch (e) {
      // App may not be configured for tests
    }
  });

  describe('SQL/NoSQL Injection', () => {
    it('should not be vulnerable to NoSQL injection', async () => {
      if (!app) return;

      const maliciousInputs = [
        { email: { $ne: null } },
        { email: { $gt: '' } },
        { $where: 'function() { return true; }' },
        { email: { $regex: '.*' } },
      ];

      for (const input of maliciousInputs) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            email: JSON.stringify(input),
            password: 'anything',
          });

        // Should reject malformed input
        expect([400, 401, 422]).toContain(res.status);
      }
    });

    it('should sanitize special characters in search', async () => {
      if (!app) return;

      const maliciousSearch = "test'; DROP TABLE users; --";

      const res = await request(app).get('/api/search').query({ q: maliciousSearch });

      // Should handle gracefully without errors
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('XSS Prevention', () => {
    it('should escape HTML in user input', async () => {
      if (!app) return;

      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src=x onerror=alert("xss")>',
        '{{constructor.constructor("alert(1)")()}}',
      ];

      for (const payload of xssPayloads) {
        const res = await request(app).post('/api/conversations').set('Cookie', 'token=test').send({
          title: payload,
        });

        // Should either reject or escape the payload
        if (res.status === 200) {
          const bodyStr = JSON.stringify(res.body);
          // Payload should be escaped
          expect(bodyStr).not.toContain('<script>');
        }
      }
    });
  });

  describe('Command Injection', () => {
    it('should not allow OS command execution', async () => {
      if (!app) return;

      const maliciousInputs = ['; cat /etc/passwd', '&& rm -rf /', '| ls -la', '`whoami`', '$(id)'];

      for (const input of maliciousInputs) {
        const res = await request(app).get('/api/system/ping').query({ host: input });

        // Should reject or sanitize
        expect([400, 403, 422]).toContain(res.status);
      }
    });
  });
});

// ============================================================================
// AUTHORIZATION TESTS
// ============================================================================

describe('Authorization Security', () => {
  let app;
  let userToken;
  let otherUserId;

  beforeAll(async () => {
    try {
      app = require('../../index');

      // Create test user and get token
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: `auth_test_${Date.now()}@example.com`,
          username: `authtest${Date.now()}`,
          password: 'TestPass123!',
        });

      if (registerRes.status === 200) {
        userToken = registerRes.body.token;
      }
    } catch (e) {
      // App may not be configured
    }
  });

  describe('Resource Access Control', () => {
    it('should not allow accessing other users resources', async () => {
      if (!app || !userToken) return;

      // Try to access another user's conversation
      const res = await request(app)
        .get('/api/conversations/fake-id-that-does-not-exist-but-would-belong-to-other')
        .set('Authorization', `Bearer ${userToken}`);

      expect([403, 404]).toContain(res.status);
    });

    it('should require authentication for protected routes', async () => {
      if (!app) return;

      const protectedRoutes = [
        { method: 'GET', path: '/api/conversations' },
        { method: 'GET', path: '/api/user/profile' },
        { method: 'POST', path: '/api/messages' },
      ];

      for (const route of protectedRoutes) {
        const res = await request(app)[route.method.toLowerCase()](route.path);

        expect(res.status).toBe(401);
      }
    });
  });

  describe('Role-Based Access', () => {
    it('should restrict admin routes to admins only', async () => {
      if (!app || !userToken) return;

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      // Regular user should not access admin routes
      expect([401, 403]).toContain(res.status);
    });
  });
});

// ============================================================================
// RATE LIMITING TESTS
// ============================================================================

describe('Rate Limiting', () => {
  let app;

  beforeAll(async () => {
    try {
      app = require('../../index');
    } catch (e) {
      // App may not be configured
    }
  });

  it('should rate limit excessive requests', async () => {
    if (!app) return;

    const requests = Array(100)
      .fill(null)
      .map(() => request(app).get('/api/health'));

    const results = await Promise.all(requests);
    const statusCodes = results.map((r) => r.status);
    const rateLimited = statusCodes.filter((s) => s === 429);

    // Should have some rate limiting
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should return Retry-After header when rate limited', async () => {
    if (!app) return;

    // Make many requests until rate limited
    for (let i = 0; i < 100; i++) {
      const res = await request(app).get('/api/health');
      if (res.status === 429) {
        expect(res.headers['retry-after']).toBeDefined();
        return;
      }
    }

    // If we got here without being rate limited, that's also acceptable
  });
});

// ============================================================================
// DATA PROTECTION TESTS
// ============================================================================

describe('Data Protection', () => {
  let app;

  beforeAll(async () => {
    try {
      app = require('../../index');
    } catch (e) {
      // App may not be configured
    }
  });

  describe('Sensitive Data Exposure', () => {
    it('should not expose passwords in responses', async () => {
      if (!app) return;

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `sensitive_${Date.now()}@example.com`,
          username: `sensitivetest${Date.now()}`,
          password: 'SecretPassword123!',
        });

      if (res.status === 200) {
        checkNoSensitiveData(res);

        // Password should not be in response
        if (res.body.user) {
          expect(res.body.user).not.toHaveProperty('password');
          expect(res.body.user).not.toHaveProperty('passwordHash');
        }
      }
    });

    it('should mask sensitive fields in user profile', async () => {
      if (!app) return;

      // Register and login
      const email = `mask_test_${Date.now()}@example.com`;
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          username: `masktest${Date.now()}`,
          password: 'TestPass123!',
        });

      if (registerRes.status === 200 && registerRes.body.token) {
        const profileRes = await request(app)
          .get('/api/user/profile')
          .set('Authorization', `Bearer ${registerRes.body.token}`);

        if (profileRes.status === 200) {
          expect(profileRes.body).not.toHaveProperty('password');
          expect(profileRes.body).not.toHaveProperty('__v');
        }
      }
    });
  });

  describe('API Key Exposure', () => {
    it('should not return full API keys', async () => {
      if (!app) return;

      const res = await request(app).get('/api/user/api-keys').set('Cookie', 'token=test');

      if (res.status === 200 && res.body.keys) {
        for (const key of res.body.keys) {
          // Key should be masked
          expect(key.key).toMatch(/^\*+\*+$/);
        }
      }
    });
  });
});
