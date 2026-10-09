/**
 * FASE 2 Tests - Core Orchestration
 */

const {
  StrategyEngine,
  StrategyContext,
  StrategyResult,
  FixedStrategy,
  PriorityStrategy,
  LatencyStrategy,
  CostStrategy,
  CapabilityOrchestrator,
  ExecutionModes,
  Strategies,
} = require('../index');

describe('FASE 2 - Core Orchestration', () => {
  describe('StrategyEngine', () => {
    let engine;

    beforeEach(() => {
      engine = new StrategyEngine({ defaultStrategy: 'priority' });
    });

    test('Should have default strategies', () => {
      const strategies = engine.listStrategies();
      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies.find((s) => s.name === 'priority')).toBeDefined();
    });

    test('Should select with priority strategy', () => {
      const result = engine.select('priority', {
        candidates: [
          { modelId: 'model-a', matchScore: 0.8, model: { status: 'active' } },
          { modelId: 'model-b', matchScore: 0.9, model: { status: 'active' } },
        ],
        config: {
          activeModels: [
            { modelId: 'model-a', priority: 50 },
            { modelId: 'model-b', priority: 100 },
          ],
        },
      });

      expect(result.primaryModel).toBeDefined();
      expect(result.strategy).toBe('priority');
    });

    test('Should select with latency strategy', () => {
      const result = engine.select('latency', {
        candidates: [
          { modelId: 'fast', estimatedLatency: 100, model: { status: 'active' } },
          { modelId: 'slow', estimatedLatency: 500, model: { status: 'active' } },
        ],
      });

      expect(result.primaryModel.modelId).toBe('fast');
    });

    test('Should select with cost strategy', () => {
      const result = engine.select('cost', {
        candidates: [
          { modelId: 'expensive', estimatedCost: 0.01, model: { status: 'active' } },
          { modelId: 'cheap', estimatedCost: 0.001, model: { status: 'active' } },
        ],
      });

      expect(result.primaryModel.modelId).toBe('cheap');
    });

    test('Should fallback to default strategy', () => {
      const result = engine.select('nonexistent', {
        candidates: [{ modelId: 'model-a', matchScore: 0.8, model: { status: 'active' } }],
      });

      expect(result.strategy).toBe('priority'); // Default
    });
  });

  describe('PriorityStrategy', () => {
    const strategy = new PriorityStrategy();

    test('Should select highest priority', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'a', matchScore: 0.8, model: { status: 'active' } },
          { modelId: 'b', matchScore: 0.9, model: { status: 'active' } },
        ],
        config: {
          activeModels: [
            { modelId: 'a', priority: 50 },
            { modelId: 'b', priority: 100 },
          ],
        },
      });

      expect(result.primaryModel.modelId).toBe('b');
    });
  });

  describe('LatencyStrategy', () => {
    const strategy = new LatencyStrategy();

    test('Should select lowest latency', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'slow', estimatedLatency: 500, model: { status: 'active' } },
          { modelId: 'fast', estimatedLatency: 100, model: { status: 'active' } },
        ],
      });

      expect(result.primaryModel.modelId).toBe('fast');
    });
  });

  describe('CostStrategy', () => {
    const strategy = new CostStrategy();

    test('Should select cheapest', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'expensive', estimatedCost: 0.01, model: { status: 'active' } },
          { modelId: 'cheap', estimatedCost: 0.001, model: { status: 'active' } },
        ],
      });

      expect(result.primaryModel.modelId).toBe('cheap');
    });

    test('Should prefer free models', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'paid', estimatedCost: 0.01, model: { status: 'active' } },
          { modelId: 'free', estimatedCost: 0, model: { status: 'active' } },
        ],
      });

      expect(result.primaryModel.modelId).toBe('free');
    });
  });

  describe('CapabilityOrchestrator', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = new CapabilityOrchestrator({
        modelRegistry: {
          findByCapabilities: () => [
            { modelId: 'test/model', matchScore: 1, model: { name: 'Test' } },
          ],
          getModel: () => ({
            modelId: 'test/model',
            name: 'Test Model',
            provider: 'test',
            capabilities: { capabilities: ['chat'] },
            metrics: { avgLatency: 100, totalRequests: 0 },
          }),
          updateMetrics: () => {},
          getStats: () => ({ byStatus: { active: 1 } }),
        },
        capabilityRegistry: {
          listCapabilities: () => [{ name: 'chat' }],
        },
        configService: {
          getConfig: () => ({ mode: 'simple', strategy: 'priority', activeModels: [] }),
          getPrimaryModel: () => null,
          getRole: () => null,
        },
      });
    });

    test('Should initialize', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.services.modelRegistry).toBeDefined();
    });

    test('Should check availability', async () => {
      const available = await orchestrator.isAvailable();
      expect(available).toBe(true);
    });

    test('Should list capabilities', () => {
      const caps = orchestrator.listCapabilities();
      expect(caps.length).toBeGreaterThan(0);
    });
  });

  describe('ExecutionModes', () => {
    test('Should have all modes defined', () => {
      expect(ExecutionModes.SIMPLE).toBe('simple');
      expect(ExecutionModes.SPECIALIZED).toBe('specialized');
      expect(ExecutionModes.INTELLIGENT).toBe('intelligent');
    });
  });

  describe('Strategies', () => {
    test('Should have all strategies defined', () => {
      expect(Strategies.FIXED).toBe('fixed');
      expect(Strategies.PRIORITY).toBe('priority');
      expect(Strategies.LATENCY).toBe('latency');
      expect(Strategies.COST).toBe('cost');
      expect(Strategies.AUTO).toBe('auto');
    });
  });
});

console.log('✅ FASE 2 orchestration tests defined');
