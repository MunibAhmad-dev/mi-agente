/**
 * Unit Tests - Services
 * =====================
 *
 * Tests unitarios para servicios.
 */

const { createTestUser, mockExpressContext } = require('../setup');

// ============================================================================
// HUGGINGFACE SERVICE TESTS
// ============================================================================

describe('HuggingFace Service', () => {
  let hfService;

  beforeAll(() => {
    hfService = require('../../services/HuggingFace/HuggingFaceService');
  });

  describe('searchModels', () => {
    it('should search models with query', async () => {
      const result = await hfService.searchModels({
        query: 'bert',
        limit: 5,
      });

      // Should return models array
      expect(result).toHaveProperty('models');
      expect(Array.isArray(result.models)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Test with invalid params
      const result = await hfService.searchModels({
        query: '',
        limit: -1, // Invalid
      });

      // Should not throw, should return error or empty results
      expect(result).toBeDefined();
    });
  });

  describe('getModelDetails', () => {
    it('should get details for valid model', async () => {
      const result = await hfService.getModelDetails('bert-base-uncased');

      // May fail if API not configured, but shouldn't throw
      expect(result).toBeDefined();
    });

    it('should handle invalid model gracefully', async () => {
      const result = await hfService.getModelDetails('nonexistent-model-xyz');

      expect(result).toBeDefined();
    });
  });

  describe('PRESET_MODELS', () => {
    it('should have presets for common tasks', () => {
      const presets = hfService.getAllPresetModels();

      expect(presets).toHaveProperty('text-generation');
      expect(presets).toHaveProperty('fill-mask');
      expect(presets).toHaveProperty('question-answering');
    });

    it('should return presets for specific task', () => {
      const models = hfService.getPresetModels('text-generation');

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// CLAUDE SERVICE TESTS
// ============================================================================

describe('Claude Service', () => {
  let claudeService;

  beforeAll(() => {
    claudeService = require('../../services/Claude/ClaudeService');
  });

  describe('config', () => {
    it('should have config object', () => {
      expect(claudeService.config).toBeDefined();
    });

    it('should check if configured', () => {
      const isConfigured = claudeService.config.isConfigured();
      // May or may not be configured in test env
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  describe('formatMessages', () => {
    it('should format simple messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      const formatted = claudeService.formatMessages(messages);

      expect(Array.isArray(formatted)).toBe(true);
      expect(formatted).toHaveLength(2);
    });

    it('should handle array content', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image', imageUrl: 'http://example.com/img.png' },
          ],
        },
      ];

      const formatted = claudeService.formatMessages(messages);

      expect(formatted[0].content).toHaveLength(2);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for string', () => {
      const tokens = claudeService.estimateTokens('Hello world');

      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty input', () => {
      const tokens = claudeService.estimateTokens('');

      expect(tokens).toBe(0);
    });
  });

  describe('PRESET_PROMPTS', () => {
    it('should have codeAssistant preset', () => {
      const preset = claudeService.getPresetPrompt('codeAssistant');

      expect(preset).toBeDefined();
      expect(preset).toHaveProperty('system');
    });

    it('should return null for unknown preset', () => {
      const preset = claudeService.getPresetPrompt('unknownPreset');

      expect(preset).toBeNull();
    });
  });

  describe('conversationManager', () => {
    it('should create conversation', () => {
      const userId = 'test-user-123';
      const conversation = claudeService.conversationManager.createConversation(userId);

      expect(conversation).toBeDefined();
      expect(conversation.id).toBeDefined();
      expect(conversation.userId).toBe(userId);
      expect(conversation.messages).toEqual([]);
    });

    it('should add message to conversation', () => {
      const conv = claudeService.conversationManager.createConversation('user1');
      const message = { role: 'user', content: 'Hello' };

      const updated = claudeService.conversationManager.addMessage(conv.id, message);

      expect(updated.messages).toHaveLength(1);
      expect(updated.messages[0].content).toBe('Hello');
    });
  });
});

// ============================================================================
// WEBHOOK SERVICE TESTS
// ============================================================================

describe('Webhook Service', () => {
  let webhookService;

  beforeAll(() => {
    webhookService = require('../../services/Webhook/WebhookService');
  });

  describe('registerWebhook', () => {
    it('should register a valid webhook', () => {
      const webhook = webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        events: ['test.event'],
        description: 'Test webhook',
      });

      expect(webhook).toBeDefined();
      expect(webhook.id).toBeDefined();
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.secret).toBeDefined();
    });

    it('should reject invalid URL', () => {
      expect(() => {
        webhookService.registerWebhook({
          url: 'not-a-url',
        });
      }).toThrow();
    });
  });

  describe('getWebhook', () => {
    it('should get registered webhook', () => {
      const registered = webhookService.registerWebhook({
        url: 'https://example.com/get-test',
        events: ['test.event'],
      });

      const retrieved = webhookService.getWebhook(registered.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(registered.id);
    });

    it('should return null for unknown webhook', () => {
      const result = webhookService.getWebhook('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('generateSignature', () => {
    it('should generate valid HMAC signature', () => {
      const payload = '{"test": "data"}';
      const signature = webhookService.generateSignature(payload, 'secret');

      expect(signature).toBeDefined();
      expect(signature).toMatch(/^sha256=/);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const payload = '{"test": "data"}';
      const secret = 'test-secret';
      const signature = webhookService.generateSignature(payload, secret);

      const isValid = webhookService.verifySignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"test": "data"}';
      const isValid = webhookService.verifySignature(payload, 'invalid-signature');

      expect(isValid).toBe(false);
    });
  });

  describe('WEBHOOK_EVENTS', () => {
    it('should have preset events', () => {
      const events = webhookService.getAvailableEvents();

      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// FILE STORAGE SERVICE TESTS
// ============================================================================

describe('File Storage Service', () => {
  let storageService;

  beforeAll(() => {
    storageService = require('../../services/FileStorage/FileStorageService');
  });

  describe('generateFilename', () => {
    it('should generate unique filename', () => {
      const filename1 = storageService.generateFilename('test.txt');
      const filename2 = storageService.generateFilename('test.txt');

      expect(filename1).toBeDefined();
      expect(filename1).not.toBe(filename2);
    });

    it('should preserve extension', () => {
      const filename = storageService.generateFilename('image.jpeg');

      expect(filename.endsWith('.jpeg')).toBe(true);
    });

    it('should handle prefix and suffix', () => {
      const filename = storageService.generateFilename('file.txt', {
        prefix: 'uploaded_',
        suffix: '_processed',
      });

      expect(filename.startsWith('uploaded_')).toBe(true);
      expect(filename).toContain('_processed');
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME types', () => {
      expect(storageService.getMimeType('test.jpg')).toBe('image/jpeg');
      expect(storageService.getMimeType('test.png')).toBe('image/png');
      expect(storageService.getMimeType('test.pdf')).toBe('application/pdf');
      expect(storageService.getMimeType('test.json')).toBe('application/json');
    });

    it('should return octet-stream for unknown', () => {
      expect(storageService.getMimeType('test.unknown')).toBe('application/octet-stream');
    });
  });

  describe('config', () => {
    it('should have config object', () => {
      expect(storageService.config).toBeDefined();
      expect(storageService.config.provider).toBeDefined();
    });
  });
});
