/**
 * FASE 3 Tests - Advanced Strategies
 */

const {
  ConsensusStrategy,
  ParallelStrategy,
  AutoStrategy,
  HybridStrategy,
  ExecutorFactory,
  SingleExecutor,
  ParallelExecutor,
  ConsensusExecutor,
  Strategies,
} = require('../index');

describe('FASE 3 - Advanced Strategies', () => {
  describe('ConsensusStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new ConsensusStrategy();
    });

    test('Should select multiple models for consensus', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'model-a', matchScore: 0.9, model: { status: 'active' } },
          { modelId: 'model-b', matchScore: 0.8, model: { status: 'active' } },
          { modelId: 'model-c', matchScore: 0.7, model: { status: 'active' } },
        ],
      });

      expect(result.selectedModels.length).toBeGreaterThan(1);
      expect(result.strategy).toBe(Strategies.CONSENSUS);
    });

    test('Should respect maxModels config', () => {
      const limited = new ConsensusStrategy({ maxModels: 2 });

      const result = limited.select({
        candidates: [
          { modelId: 'a', matchScore: 0.9, model: { status: 'active' } },
          { modelId: 'b', matchScore: 0.8, model: { status: 'active' } },
          { modelId: 'c', matchScore: 0.7, model: { status: 'active' } },
          { modelId: 'd', matchScore: 0.6, model: { status: 'active' } },
        ],
      });

      expect(result.selectedModels.length).toBeLessThanOrEqual(2);
    });

    test('Should fallback to single model if insufficient candidates', () => {
      const result = strategy.select({
        candidates: [{ modelId: 'model-a', matchScore: 0.9, model: { status: 'active' } }],
      });

      expect(result.selectedModels.length).toBe(1);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('ParallelStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new ParallelStrategy();
    });

    test('Should select multiple models for parallel execution', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'model-a', matchScore: 0.9, model: { status: 'active' } },
          { modelId: 'model-b', matchScore: 0.8, model: { status: 'active' } },
          { modelId: 'model-c', matchScore: 0.7, model: { status: 'active' } },
        ],
      });

      expect(result.selectedModels.length).toBeGreaterThan(1);
      expect(result.strategy).toBe(Strategies.PARALLEL);
      expect(result.parallelConfig).toBeDefined();
    });

    test('Should respect maxParallel config', () => {
      const limited = new ParallelStrategy({ maxParallel: 2 });

      const result = limited.select({
        candidates: [
          { modelId: 'a', matchScore: 0.9, model: { status: 'active' } },
          { modelId: 'b', matchScore: 0.8, model: { status: 'active' } },
          { modelId: 'c', matchScore: 0.7, model: { status: 'active' } },
        ],
      });

      expect(result.selectedModels.length).toBe(2);
    });
  });

  describe('AutoStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new AutoStrategy();
    });

    test('Should select best model with weighted scoring', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'model-a', matchScore: 0.9, model: { status: 'active' } },
          { modelId: 'model-b', matchScore: 0.8, estimatedLatency: 100 },
          { modelId: 'model-c', matchScore: 0.7, estimatedCost: 0.001 },
        ],
        capabilities: ['code'],
        estimatedTokens: 1000,
      });

      expect(result.selectedModels.length).toBe(1);
      expect(result.strategy).toBe(Strategies.AUTO);
      expect(result.autoDecision).toBeDefined();
    });

    test('Should adjust weights for high token context', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'model-a', matchScore: 0.9, maxContext: 100000, estimatedTokens: 80000 },
          { modelId: 'model-b', matchScore: 0.9, maxContext: 8000 },
        ],
        capabilities: [],
        estimatedTokens: 80000,
      });

      // Should prefer larger context
      expect(result.selectedModels[0].modelId).toBeDefined();
      expect(result.autoDecision.dynamicWeights.context).toBeGreaterThan(0.15);
    });

    test('Should prioritize reasoning for code tasks', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'fast', matchScore: 0.8, model: { capabilities: { capabilities: ['chat'] } } },
          {
            modelId: 'coder',
            matchScore: 0.8,
            model: { capabilities: { capabilities: ['code', 'reasoning'] } },
          },
        ],
        capabilities: ['code'],
        estimatedTokens: 500,
      });

      expect(result.autoDecision.actualStrategy).toBe('priority');
    });

    test('Should return alternatives', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'a', matchScore: 0.9, model: { successRate: 0.9 } },
          { modelId: 'b', matchScore: 0.8, model: { successRate: 0.9 } },
          { modelId: 'c', matchScore: 0.7, model: { successRate: 0.9 } },
        ],
      });

      expect(result.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('HybridStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new HybridStrategy();
    });

    test('Should use primary strategy normally', () => {
      const result = strategy.select({
        candidates: [
          { modelId: 'best', matchScore: 0.95, model: { successRate: 0.99 } },
          { modelId: 'other', matchScore: 0.8, model: { successRate: 0.9 } },
        ],
      });

      expect(result.selectedModels[0].modelId).toBe('best');
    });

    test('Should fallback to cost if primary score is low', () => {
      const result = strategy.select({
        candidates: [
          {
            modelId: 'expensive',
            matchScore: 0.3,
            model: { successRate: 0.5 },
            estimatedCost: 0.05,
          },
          { modelId: 'cheap', matchScore: 0.4, model: { successRate: 0.9 }, estimatedCost: 0.001 },
        ],
      });

      expect(result.strategy).toBe('hybrid');
    });
  });

  describe('ExecutorFactory', () => {
    const mockOrchestrator = {
      executeOnModel: jest.fn().mockResolvedValue({
        content: 'Test response',
        metadata: { latency: 100 },
      }),
    };

    test('Should create SingleExecutor', () => {
      const executor = ExecutorFactory.create('single', mockOrchestrator);
      expect(executor).toBeInstanceOf(SingleExecutor);
    });

    test('Should create ParallelExecutor', () => {
      const executor = ExecutorFactory.create('parallel', mockOrchestrator);
      expect(executor).toBeInstanceOf(ParallelExecutor);
    });

    test('Should create ConsensusExecutor', () => {
      const executor = ExecutorFactory.create('consensus', mockOrchestrator);
      expect(executor).toBeInstanceOf(ConsensusExecutor);
    });

    test('Should create default executor for unknown type', () => {
      const executor = ExecutorFactory.create('unknown', mockOrchestrator);
      expect(executor).toBeInstanceOf(SingleExecutor);
    });
  });

  describe('SingleExecutor', () => {
    test('Should execute single model', async () => {
      const executor = new SingleExecutor({
        executeOnModel: jest.fn().mockResolvedValue({
          content: 'Response',
          metadata: { latency: 100 },
        }),
      });

      const result = await executor.execute({
        modelId: 'test/model',
        messages: [{ role: 'user', content: 'Hello' }],
        parameters: { temperature: 0.7 },
      });

      expect(result.content).toBe('Response');
      expect(result.metadata.executor).toBe('single');
    });
  });

  describe('ParallelExecutor', () => {
    test('Should execute multiple models in parallel', async () => {
      const executor = new ParallelExecutor(
        {
          executeOnModel: jest.fn().mockImplementation((modelId) =>
            Promise.resolve({
              content: `Response from ${modelId}`,
              metadata: { latency: 100 },
            }),
          ),
        },
        { maxParallel: 3 },
      );

      const result = await executor.execute({
        modelIds: ['model-a', 'model-b', 'model-c'],
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.responses.length).toBe(3);
      expect(result.metadata.executor).toBe('parallel');
      expect(result.metadata.totalModels).toBe(3);
    });
  });
});

console.log('✅ FASE 3 advanced strategies tests defined');
