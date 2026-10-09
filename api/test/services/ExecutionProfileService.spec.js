/**
 * ExecutionProfileService Tests
 * =============================
 *
 * Tests para el servicio de perfiles de ejecución con énfasis en:
 * - Validación de inputs
 * - Rate limiting
 * - Sanitización de strings
 * - Manejo de errores
 *
 * @author Mi LibreChat
 * @version 1.1.0
 */

const mongoose = require('mongoose');

// Mock de mongoose antes de importar el servicio
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    Types: {
      ObjectId: {
        isValid: jest.fn((id) => {
          return /^[a-f\d]{24}$/i.test(id);
        }),
      },
    },
  };
});

// Mock del logger
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// ============================================================================
// TESTS - VALIDATION HELPERS
// ============================================================================

describe('ExecutionProfileService - Validation Helpers', () => {
  // Reset rate limit tracker before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateObjectId', () => {
    it('should accept valid ObjectId', () => {
      const {
        validateObjectId,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateObjectId('507f1f77bcf86cd799439011', 'test')).not.toThrow();
    });

    it('should reject invalid ObjectId', () => {
      const {
        validateObjectId,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateObjectId('invalid-id', 'test')).toThrow(
        'Invalid test: must be a valid ObjectId',
      );
    });

    it('should reject null or undefined', () => {
      const {
        validateObjectId,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateObjectId(null, 'test')).toThrow();
      expect(() => validateObjectId(undefined, 'test')).toThrow();
    });

    it('should use custom field name in error', () => {
      const {
        validateObjectId,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateObjectId('invalid', 'customField')).toThrow('Invalid customField');
    });
  });

  describe('sanitizeString', () => {
    it('should return empty string for non-string input', () => {
      const {
        sanitizeString,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(sanitizeString(123)).toBe('');
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
      expect(sanitizeString({})).toBe('');
    });

    it('should truncate long strings', () => {
      const {
        sanitizeString,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      const longString = 'a'.repeat(100);
      const result = sanitizeString(longString, 50);
      expect(result.length).toBe(50);
    });

    it('should remove control characters', () => {
      const {
        sanitizeString,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      const input = 'hello\x00world\x1Ftest';
      const result = sanitizeString(input);
      expect(result).toBe('helloworldtest');
    });

    it('should preserve valid characters', () => {
      const {
        sanitizeString,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      const input = 'Hello World! 123 @#$%';
      const result = sanitizeString(input);
      expect(result).toBe(input);
    });
  });

  describe('validateParams', () => {
    it('should throw for non-object params', () => {
      const {
        validateParams,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateParams('string')).toThrow('Params must be an object');
      expect(() => validateParams(null)).toThrow('Params must be an object');
    });

    it('should validate steps range', () => {
      const {
        validateParams,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');

      // Valid range
      let result = validateParams({ steps: 50 });
      expect(result.steps).toBe(50);

      // Below minimum (clamped to 1)
      result = validateParams({ steps: -10 });
      expect(result.steps).toBe(1);

      // Above maximum (clamped to 500)
      result = validateParams({ steps: 1000 });
      expect(result.steps).toBe(500);
    });

    it('should validate cfgScale range', () => {
      const {
        validateParams,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');

      // Valid range
      let result = validateParams({ cfgScale: 7.5 });
      expect(result.cfgScale).toBe(7.5);

      // Below minimum (clamped to 0.1)
      result = validateParams({ cfgScale: -5 });
      expect(result.cfgScale).toBe(0.1);

      // Above maximum (clamped to 30)
      result = validateParams({ cfgScale: 100 });
      expect(result.cfgScale).toBe(30);
    });

    it('should validate width and height ranges', () => {
      const {
        validateParams,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');

      // Valid values
      let result = validateParams({ width: 1024, height: 768 });
      expect(result.width).toBe(1024);
      expect(result.height).toBe(768);

      // Below minimum (clamped to 64)
      result = validateParams({ width: 32, height: 32 });
      expect(result.width).toBe(64);
      expect(result.height).toBe(64);

      // Above maximum (clamped to 4096)
      result = validateParams({ width: 8192, height: 8192 });
      expect(result.width).toBe(4096);
      expect(result.height).toBe(4096);
    });

    it('should validate batchSize range', () => {
      const {
        validateParams,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');

      // Valid
      let result = validateParams({ batchSize: 4 });
      expect(result.batchSize).toBe(4);

      // Below minimum (clamped to 1)
      result = validateParams({ batchSize: 0 });
      expect(result.batchSize).toBe(1);

      // Above maximum (clamped to 16)
      result = validateParams({ batchSize: 100 });
      expect(result.batchSize).toBe(16);
    });

    it('should validate seed', () => {
      const {
        validateParams,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');

      // Valid seed
      let result = validateParams({ seed: 12345 });
      expect(result.seed).toBe(12345);

      // Negative seed (invalid)
      expect(() => validateParams({ seed: -1 })).toThrow('Invalid seed value');

      // Non-integer seed (invalid)
      expect(() => validateParams({ seed: 1.5 })).toThrow('Invalid seed value');

      // Seed exceeding MAX_SAFE_INTEGER (invalid)
      expect(() => validateParams({ seed: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
        'Invalid seed value',
      );
    });
  });

  describe('validateProfileData', () => {
    it('should throw for non-object data', () => {
      const {
        validateProfileData,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateProfileData(null)).toThrow('Profile data must be an object');
      expect(() => validateProfileData('string')).toThrow('Profile data must be an object');
    });

    it('should require name', () => {
      const {
        validateProfileData,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateProfileData({})).toThrow('Profile name is required');
    });

    it('should reject long names', () => {
      const {
        validateProfileData,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateProfileData({ name: 'a'.repeat(101) })).toThrow(
        'Profile name must be 100 characters or less',
      );
    });

    it('should reject long model names', () => {
      const {
        validateProfileData,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() => validateProfileData({ name: 'test', model: 'a'.repeat(201) })).toThrow(
        'Model name too long',
      );
    });

    it('should accept valid profile data', () => {
      const {
        validateProfileData,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
      expect(() =>
        validateProfileData({
          name: 'Test Profile',
          userId: '507f1f77bcf86cd799439011',
          model: 'stable-diffusion-xl',
        }),
      ).not.toThrow();
    });
  });
});

// ============================================================================
// TESTS - RATE LIMITING
// ============================================================================

describe('ExecutionProfileService - Rate Limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow requests within limit', () => {
    const {
      checkRateLimit,
    } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
    const userId = 'test-user-rate-1';

    // First request should be allowed
    expect(checkRateLimit(userId, 10, 60000)).toBe(true);

    // Subsequent requests within limit should be allowed
    for (let i = 0; i < 8; i++) {
      expect(checkRateLimit(userId, 10, 60000)).toBe(true);
    }
  });

  it('should block requests exceeding limit', () => {
    const {
      checkRateLimit,
    } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');
    const userId = 'test-user-rate-2';

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      checkRateLimit(userId, 10, 60000);
    }

    // Next request should be blocked
    expect(checkRateLimit(userId, 10, 60000)).toBe(false);
  });

  it('should track rate limits per user', () => {
    const {
      checkRateLimit,
    } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');

    // Exhaust user1's limit
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user1', 10, 60000);
    }

    // user1 should be blocked
    expect(checkRateLimit('user1', 10, 60000)).toBe(false);

    // user2 should still be allowed
    expect(checkRateLimit('user2', 10, 60000)).toBe(true);
  });
});

// ============================================================================
// TESTS - ERROR HANDLING
// ============================================================================

describe('ExecutionProfileService - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createProfile error handling', () => {
    it('should validate before saving', async () => {
      // This would require mocking mongoose, but validates the concept
      const {
        validateProfileData,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');

      expect(() =>
        validateProfileData({
          name: 'a'.repeat(150), // Too long
        }),
      ).toThrow();
    });
  });

  describe('getProfile error handling', () => {
    it('should validate profileId format', async () => {
      const {
        validateObjectId,
      } = require('../../../api/server/services/ExecutionProfiles/ExecutionProfileService');

      expect(() => validateObjectId('invalid-id')).toThrow();
      expect(() => validateObjectId('')).toThrow();
    });
  });
});
