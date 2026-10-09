/**
 * Test Setup
 * ==========
 *
 * Configuración global para tests.
 */

const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const testConfig = {
  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/librechat_test',
  },

  // Redis
  redis: {
    host: process.env.REDIS_TEST_HOST || 'localhost',
    port: process.env.REDIS_TEST_PORT || 6379,
  },

  // Timeouts
  timeouts: {
    default: 5000,
    slow: 30000,
  },
};

// ============================================================================
// GLOBAL SETUP/TEARDOWN
// ============================================================================

beforeAll(async () => {
  // Connect to test database
  try {
    await mongoose.connect(testConfig.mongodb.uri, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('[Test] Connected to MongoDB');
  } catch (error) {
    logger.warn('[Test] MongoDB not available, some tests may be skipped');
  }
});

afterAll(async () => {
  // Disconnect
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    logger.info('[Test] Disconnected from MongoDB');
  }
});

// ============================================================================
// GLOBAL HOOKS
// ============================================================================

beforeEach(() => {
  // Reset any mocks
  jest.clearAllMocks();
});

// ============================================================================
// CUSTOM MATCHERS
// ============================================================================

expect.extend({
  // To be valid MongoDB ObjectId
  toBeValidObjectId(received) {
    const pass = mongoose.Types.ObjectId.isValid(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be a valid ObjectId`
          : `Expected ${received} to be a valid ObjectId`,
    };
  },

  // To be within range
  toBeWithinRange(received, min, max) {
    const pass = received >= min && received <= max;
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be within range ${min}-${max}`
          : `Expected ${received} to be within range ${min}-${max}`,
    };
  },

  // To contain similar object
  toContainSimilarObject(received, expected, threshold = 0.8) {
    const similarity = calculateSimilarity(received, expected);
    const pass = similarity >= threshold;
    return {
      pass,
      message: () =>
        `Objects are ${(similarity * 100).toFixed(1)}% similar (threshold: ${threshold * 100}%)`,
    };
  },
});

// ============================================================================
// HELPERS
// ============================================================================

function calculateSimilarity(obj1, obj2) {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  const commonKeys = keys1.filter((k) => keys2.includes(k));

  if (commonKeys.length === 0) return 0;

  let matches = 0;
  for (const key of commonKeys) {
    if (JSON.stringify(obj1[key]) === JSON.stringify(obj2[key])) {
      matches++;
    }
  }

  return matches / Math.max(keys1.length, keys2.length);
}

/**
 * Crea un usuario de test
 */
async function createTestUser(overrides = {}) {
  const User = require('../services/Database/schemas').User;

  const defaultUser = {
    email: `test_${Date.now()}@example.com`,
    username: `testuser_${Date.now()}`,
    password: 'testpassword123',
    emailVerified: true,
  };

  const user = new User({ ...defaultUser, ...overrides });
  await user.save();

  return user;
}

/**
 * Crea una conversación de test
 */
async function createTestConversation(userId, overrides = {}) {
  const Conversation = require('../services/Database/schemas').Conversation;

  const defaultConversation = {
    conversationId: `conv_${Date.now()}`,
    userId,
    model: 'gpt-4',
    title: 'Test Conversation',
    status: 'active',
  };

  const conversation = new Conversation({ ...defaultConversation, ...overrides });
  await conversation.save();

  return conversation;
}

/**
 * Crea un mensaje de test
 */
async function createTestMessage(conversationId, userId, overrides = {}) {
  const Message = require('../services/Database/schemas').Message;

  const defaultMessage = {
    conversationId,
    userId,
    role: 'user',
    content: [{ type: 'text', text: 'Test message' }],
    status: 'completed',
  };

  const message = new Message({ ...defaultMessage, ...overrides });
  await message.save();

  return message;
}

/**
 * Limpia las colecciones de test
 */
async function cleanDatabase() {
  const collections = mongoose.connection.collections;

  for (const name in collections) {
    await collections[name].deleteMany({});
  }
}

/**
 * Mock de req/res para Express
 */
function mockExpressContext(overrides = {}) {
  const req = {
    method: 'GET',
    path: '/api/test',
    params: {},
    query: {},
    body: {},
    headers: {},
    user: null,
    ...overrides.req,
  };

  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function (data) {
      this.body = data;
      return this;
    }),
    send: jest.fn(function (data) {
      this.body = data;
      return this;
    }),
    ...overrides.res,
  };

  const next = jest.fn();

  return { req, res, next };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  testConfig,
  createTestUser,
  createTestConversation,
  createTestMessage,
  cleanDatabase,
  mockExpressContext,
};
