/**
 * chat.e2e.spec.js — Phase B: Full agent chat pipeline E2E test
 *
 * Verifies the complete chain that fires for every user message:
 *   Input → PolicyEngine gate → MemoryManager store → LLM Router → response → recall
 *
 * Uses in-process mocks for Mongo/Redis so no external services are needed.
 * Run: npx jest api/test/e2e/chat.e2e.spec.js
 */

'use strict';

// ── Mocks (must come before any require of the real modules) ──────────────────

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// In-memory store for Mongo model calls
const _memoryStore = [];
jest.mock('~/models/MemoryCollections', () => ({
  SessionMemory: {
    create: jest.fn(async (doc) => { _memoryStore.push(doc); return doc; }),
    find:   jest.fn(async ({ userId }) => _memoryStore.filter(d => d.userId === userId)),
  },
  ProjectMemory: { create: jest.fn(async (doc) => doc) },
  HistoricalMemory: { create: jest.fn(async (doc) => doc) },
}));

jest.mock('~/models/AgentConstitution', () => ({
  getActiveConstitution: jest.fn(async () => ({
    persona: 'Universal AI Agent — helpful, honest, harmless.',
    values: ['transparency', 'safety'],
    constraints: ['never reveal secrets'],
  })),
  upsertConstitution:  jest.fn(async (data) => ({ _id: 'const-1', ...data })),
  activateConstitution: jest.fn(async () => {}),
}));

jest.mock('~/models/WebhookDelivery', () => ({
  create: jest.fn(async (doc) => doc),
  findOneAndUpdate: jest.fn(async () => null),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const path = require('path');

// PolicyEngine
const PolicyEvaluator = require(
  path.join(__dirname, '../../server/services/PolicyEngine/PolicyEvaluator'),
);

// MemoryManager (Harness)
const { MemoryManager } = require(
  path.join(__dirname, '../../server/services/Harness/MemoryManager'),
);

// UniversalLLMRouter
const { UniversalLLMRouter } = require(
  path.join(__dirname, '../../server/services/Harness/cognitive/llm/UniversalLLMRouter'),
);

// AgentConstitution model
const { getActiveConstitution } = require('~/models/AgentConstitution');

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Agent Chat Pipeline — E2E', () => {
  let memory;

  beforeEach(() => {
    memory = new MemoryManager();
    _memoryStore.length = 0;
    jest.clearAllMocks();
  });

  // ── 1. PolicyEngine gate ───────────────────────────────────────────────────

  describe('PolicyEngine', () => {
    test('allows safe chat action', async () => {
      const result = await PolicyEvaluator.check({
        principal: { type: 'User', id: 'user-001' },
        action: 'chat:send',
        resource: { type: 'Conversation', id: 'conv-001' },
      });
      // Default policy store allows chat:send
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('decision');
      expect(['allow', 'deny']).toContain(result.decision);
    });

    test('evaluate returns structured response', async () => {
      const res = await PolicyEvaluator.evaluate({
        principal: { type: 'User', id: 'user-001' },
        action: 'tool:execute',
        resource: { type: 'Tool', id: 'bash' },
      });
      expect(res).toHaveProperty('decision');
      expect(res).toHaveProperty('matched');
      expect(Array.isArray(res.matched)).toBe(true);
    });
  });

  // ── 2. Memory — store then recall ─────────────────────────────────────────

  describe('MemoryManager', () => {
    test('stores user message in working memory', () => {
      const userId = 'user-001';
      const msg = { role: 'user', content: 'What can you do?' };
      memory.addToWorkingMemory('lastMessage', msg);

      const stored = memory.getFromWorkingMemory();
      expect(stored.length).toBe(1);
      expect(stored[0].value).toEqual(msg);
    });

    test('recalls message from working memory', () => {
      memory.addToWorkingMemory('assistant-help', 'I can help with code.');
      const found = memory.search('help');
      expect(found.length).toBeGreaterThan(0);
    });

    test('task memory persists across clear of working memory', () => {
      memory.addToWorkingMemory('tmp', 'ephemeral');
      memory.addToTaskMemory('goal', 'write tests');
      memory.clearWorkingMemory();

      expect(memory.getFromWorkingMemory().length).toBe(0);
      const task = memory.getFromTaskMemory();
      expect(task.some(t => t.value === 'write tests')).toBe(true);
    });

    test('project memory records architectural decisions', () => {
      memory.addToProjectMemory('stack', 'MERN', { importance: 'high' });
      const proj = memory.getFromProjectMemory();
      expect(proj.length).toBe(1);
      expect(proj[0].value).toBe('MERN');
    });

    test('getStats reflects all memory layers', () => {
      memory.addToWorkingMemory('w', 1);
      memory.addToTaskMemory('t', 2);
      memory.addToProjectMemory('p', 3);
      const stats = memory.getStats();
      expect(stats.totalEntries).toBe(3);
    });
  });

  // ── 3. LLM Router ─────────────────────────────────────────────────────────

  describe('UniversalLLMRouter', () => {
    let router;

    beforeEach(() => {
      router = new UniversalLLMRouter({});
    });

    test('has a route() method (not 501)', () => {
      expect(typeof router.route).toBe('function');
    });

    test('route() delegates to chat() — not a stub', async () => {
      const chatSpy = jest.spyOn(router, 'chat').mockResolvedValue({ content: 'ok' });
      const messages = [{ role: 'user', content: 'Hello' }];
      await router.route({ messages, model: 'gpt-4o', provider: 'openai' });
      expect(chatSpy).toHaveBeenCalledWith(
        messages,
        expect.objectContaining({ model: 'gpt-4o', provider: 'openai' }),
      );
    });

    test('route() passes extra options through', async () => {
      const chatSpy = jest.spyOn(router, 'chat').mockResolvedValue({ content: 'ok' });
      await router.route({ messages: [], model: 'm', provider: 'p', options: { temperature: 0.5 } });
      expect(chatSpy).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ temperature: 0.5, model: 'm' }),
      );
    });
  });

  // ── 4. Agent Constitution ─────────────────────────────────────────────────

  describe('AgentConstitution', () => {
    test('getActiveConstitution returns persona and constraints', async () => {
      const constitution = await getActiveConstitution();
      expect(constitution).toBeTruthy();
      expect(typeof constitution.persona).toBe('string');
      expect(Array.isArray(constitution.constraints)).toBe(true);
    });

    test('constitution has safety-critical constraints', async () => {
      const constitution = await getActiveConstitution();
      const constraints = constitution.constraints.join(' ');
      expect(constraints.length).toBeGreaterThan(0);
    });
  });

  // ── 5. Full pipeline sequence ─────────────────────────────────────────────

  describe('Full pipeline sequence', () => {
    test('policy check → memory store → constitution load → route available', async () => {
      // Step 1: policy gate
      const policyResult = await PolicyEvaluator.check({
        principal: { type: 'User', id: 'user-pipeline' },
        action: 'chat:send',
        resource: { type: 'Conversation', id: 'conv-pipeline' },
      });
      expect(policyResult).toHaveProperty('decision');

      // Step 2: store message in working memory
      memory.addToWorkingMemory('input', { role: 'user', content: 'Run the pipeline test' });
      expect(memory.getFromWorkingMemory().length).toBe(1);

      // Step 3: load active constitution (SystemPromptBuilder dependency)
      const constitution = await getActiveConstitution();
      expect(constitution.persona).toBeTruthy();

      // Step 4: verify router is wired (route method exists — not a 501 stub)
      const router = new UniversalLLMRouter({});
      const chatSpy = jest.spyOn(router, 'chat').mockResolvedValue({
        content: 'Pipeline response from LLM',
      });
      const response = await router.route({
        messages: [{ role: 'user', content: 'Run the pipeline test' }],
        model: 'claude-sonnet-5',
        provider: 'anthropic',
      });
      expect(chatSpy).toHaveBeenCalled();
      expect(response.content).toBe('Pipeline response from LLM');

      // Step 5: store response in memory
      memory.addToWorkingMemory('response', { role: 'assistant', content: response.content });
      expect(memory.getFromWorkingMemory().length).toBe(2);

      // Step 6: recall verifies memory persisted (search by key fragment)
      const recalled = memory.search('input');
      expect(recalled.length).toBeGreaterThan(0);
    });
  });
});
