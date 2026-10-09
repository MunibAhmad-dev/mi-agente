/**
 * Capability Orchestrator - Tests Unitarios
 *
 * Tests básicos para verificar que los componentes funcionan
 */

const assert = require('assert');

// Mock mongoose para evitar conexión real
jest.mock('mongoose', () => ({
  Schema: class MockSchema {
    constructor(definition) {
      this.definition = definition;
    }
    index() {}
    pre() {}
    methods() {}
    statics() {}
  },
  model: () =>
    class MockModel {
      static findOne() {
        return Promise.resolve(null);
      }
      static findOneAndUpdate() {
        return Promise.resolve({ toObject: () => ({}) });
      }
      static find() {
        return { sort: () => ({ limit: () => Promise.resolve([]) }) };
      }
      static deleteOne() {
        return Promise.resolve({});
      }
      static countDocuments() {
        return Promise.resolve(0);
      }
    },
}));

describe('CapabilityOrchestrator - Foundation Tests', () => {
  describe('Types.js', () => {
    const Types = require('../constants/Types');

    test('Should have all capability constants', () => {
      expect(Types.Capabilities.CHAT).toBe('chat');
      expect(Types.Capabilities.CODE).toBe('code');
      expect(Types.Capabilities.REASONING).toBe('reasoning');
      expect(Types.Capabilities.VISION).toBe('vision');
    });

    test('Should have all execution modes', () => {
      expect(Types.ExecutionModes.SIMPLE).toBe('simple');
      expect(Types.ExecutionModes.SPECIALIZED).toBe('specialized');
      expect(Types.ExecutionModes.INTELLIGENT).toBe('intelligent');
    });

    test('Should have all strategies', () => {
      expect(Types.Strategies.FIXED).toBe('fixed');
      expect(Types.Strategies.PRIORITY).toBe('priority');
      expect(Types.Strategies.LATENCY).toBe('latency');
      expect(Types.Strategies.COST).toBe('cost');
      expect(Types.Strategies.AUTO).toBe('auto');
    });

    test('Should have all service lifecycles', () => {
      expect(Types.ServiceLifecycle.SINGLETON).toBe('singleton');
      expect(Types.ServiceLifecycle.TRANSIENT).toBe('transient');
      expect(Types.ServiceLifecycle.SCOPED).toBe('scoped');
    });
  });

  describe('ServiceContainer', () => {
    const { ServiceContainer } = require('../container/ServiceContainer');

    test('Should register and resolve singleton', () => {
      const container = new ServiceContainer();
      const service = { name: 'test', value: 42 };

      container.registerSingleton('TestService', () => service);
      const resolved = container.resolve('TestService');

      expect(resolved).toBe(service);
      expect(resolved.name).toBe('test');
    });

    test('Should resolve singleton as same instance', () => {
      const container = new ServiceContainer();
      let instanceCount = 0;

      container.registerSingleton('Counter', () => ({ count: ++instanceCount }));

      const first = container.resolve('Counter');
      const second = container.resolve('Counter');

      expect(first).toBe(second);
      expect(first.count).toBe(1);
    });

    test('Should resolve transient as different instances', () => {
      const container = new ServiceContainer();
      let instanceCount = 0;

      container.registerTransient('Counter', () => ({ count: ++instanceCount }));

      const first = container.resolve('Counter');
      const second = container.resolve('Counter');

      expect(first).not.toBe(second);
      expect(first.count).toBe(1);
      expect(second.count).toBe(2);
    });

    test('Should throw on unknown service in strict mode', () => {
      const container = new ServiceContainer({ strictMode: true });

      expect(() => container.resolve('Unknown')).toThrow('Service not registered');
    });

    test('Should resolve with dependencies', () => {
      const container = new ServiceContainer();

      container.registerSingleton('Logger', () => ({ log: () => 'logged' }));
      container.registerSingleton(
        'Service',
        (logger) => ({
          name: 'MyService',
          logger,
        }),
        ['Logger'],
      );

      const service = container.resolve('Service');

      expect(service.name).toBe('MyService');
      expect(service.logger.log()).toBe('logged');
    });

    test('Should create and dispose scope', () => {
      const container = new ServiceContainer();
      let disposed = false;

      container.registerScoped('Disposable', () => ({
        dispose: () => {
          disposed = true;
        },
      }));

      const scope = container.createScope();
      const instance = scope.resolve('Disposable');

      expect(instance).toBeDefined();

      scope.dispose();

      expect(disposed).toBe(true);
    });
  });

  describe('CapabilityRegistry', () => {
    const { CapabilityRegistry } = require('../models/CapabilityRegistry');
    const { Capabilities } = require('../constants/Types');

    test('Should initialize with default capabilities', () => {
      const registry = new CapabilityRegistry();

      expect(registry.has(Capabilities.CHAT)).toBe(true);
      expect(registry.has(Capabilities.CODE)).toBe(true);
      expect(registry.has(Capabilities.REASONING)).toBe(true);
    });

    test('Should register custom capability', () => {
      const registry = new CapabilityRegistry();

      registry.register('custom_capability', {
        description: 'A custom capability',
        category: 'custom',
      });

      expect(registry.has('custom_capability')).toBe(true);
      expect(registry.get('custom_capability').category).toBe('custom');
    });

    test('Should expand capabilities with implications', () => {
      const registry = new CapabilityRegistry();

      // CHAT implica REASONING por defecto
      const expanded = registry.expandCapabilities([Capabilities.CHAT]);

      expect(expanded).toContain(Capabilities.CHAT);
      expect(expanded).toContain(Capabilities.REASONING);
    });

    test('Should find models by capability intersection', () => {
      const registry = new CapabilityRegistry();

      registry.registerModelCapabilities('model-a', [Capabilities.CHAT, Capabilities.CODE]);
      registry.registerModelCapabilities('model-b', [Capabilities.CHAT, Capabilities.VISION]);
      registry.registerModelCapabilities('model-c', [Capabilities.CODE]);

      // Buscar modelos que soporten CHAT Y CODE
      const models = registry.getModelsByCapabilitiesIntersection([
        Capabilities.CHAT,
        Capabilities.CODE,
      ]);

      expect(models).toContain('model-a');
      expect(models).not.toContain('model-b');
      expect(models).not.toContain('model-c');
    });
  });

  describe('ModelRegistry', () => {
    const { ModelRegistry } = require('../models/ModelRegistry');
    const { Capabilities } = require('../constants/Types');

    test('Should register and retrieve model', async () => {
      const registry = new ModelRegistry();

      await registry.registerModel({
        provider: 'openai',
        model: 'gpt-4o',
        name: 'GPT-4o',
        capabilities: { capabilities: [Capabilities.CHAT, Capabilities.CODE] },
      });

      const model = registry.getModel('openai/gpt-4o');

      expect(model).toBeDefined();
      expect(model.name).toBe('GPT-4o');
    });

    test('Should find models by capabilities', async () => {
      const registry = new ModelRegistry();

      await registry.registerModel({
        provider: 'openai',
        model: 'gpt-4o',
        capabilities: { capabilities: [Capabilities.CHAT, Capabilities.CODE] },
      });

      await registry.registerModel({
        provider: 'anthropic',
        model: 'claude-3',
        capabilities: { capabilities: [Capabilities.CHAT, Capabilities.VISION] },
      });

      const candidates = registry.findByCapabilities([Capabilities.CODE]);

      expect(candidates.length).toBe(1);
      expect(candidates[0].modelId).toBe('openai/gpt-4o');
    });

    test('Should filter by latency', async () => {
      const registry = new ModelRegistry();

      await registry.registerModel({
        provider: 'fast',
        model: 'fast-model',
        capabilities: { capabilities: [Capabilities.CHAT] },
        metrics: { avgLatency: 100 },
      });

      await registry.registerModel({
        provider: 'slow',
        model: 'slow-model',
        capabilities: { capabilities: [Capabilities.CHAT] },
        metrics: { avgLatency: 500 },
      });

      const candidates = registry.findByCapabilities([Capabilities.CHAT], {
        maxLatency: 200,
      });

      expect(candidates.length).toBe(1);
      expect(candidates[0].modelId).toBe('fast/fast-model');
    });

    test('Should update model metrics', async () => {
      const registry = new ModelRegistry();

      await registry.registerModel({
        provider: 'test',
        model: 'test-model',
        capabilities: { capabilities: [Capabilities.CHAT] },
      });

      registry.updateMetrics('test/test-model', {
        avgLatency: 150,
        totalRequests: 10,
      });

      const model = registry.getModel('test/test-model');

      expect(model.metrics.avgLatency).toBe(150);
      expect(model.metrics.totalRequests).toBe(10);
    });
  });

  describe('Profiles', () => {
    const { PROFILES, getProfile, listProfiles } = require('../constants/Profiles');

    test('Should have all predefined profiles', () => {
      expect(PROFILES.development).toBeDefined();
      expect(PROFILES.research).toBeDefined();
      expect(PROFILES.cost_effective).toBeDefined();
      expect(PROFILES.high_quality).toBeDefined();
      expect(PROFILES.local).toBeDefined();
      expect(PROFILES.hybrid).toBeDefined();
    });

    test('Should have correct mode for each profile', () => {
      expect(PROFILES.development.mode).toBe('specialized');
      expect(PROFILES.research.mode).toBe('intelligent');
      expect(PROFILES.cost_effective.mode).toBe('specialized');
    });

    test('Should get profile by id', () => {
      const profile = getProfile('development');

      expect(profile).toBeDefined();
      expect(profile.name).toBe('Desarrollo');
    });

    test('Should list all profiles', () => {
      const profiles = listProfiles();

      expect(profiles.length).toBeGreaterThan(0);
      expect(profiles[0]).toHaveProperty('id');
      expect(profiles[0]).toHaveProperty('name');
    });
  });
});

console.log('✅ All foundation tests defined');
