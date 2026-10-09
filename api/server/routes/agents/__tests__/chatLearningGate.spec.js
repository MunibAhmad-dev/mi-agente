'use strict';

const { understand } = require('../../../../server/services/CognitiveBehavior/QuestionUnderstanding');
const { buildContract, scoreAlignment } = require('../../../../server/services/CognitiveBehavior/AnswerContract');
const { LearningEvaluationGate } = require('../../../../server/services/Learning/LearningEvaluationGate');

describe('Chat learning gate wiring (Face 16)', () => {
  test('wireCognitiveBehavior pipeline: understand → contract → score → gate', () => {
    const prompt = 'What is the capital of France?';
    const response = 'The capital of France is Paris, a major city in Western Europe.';

    const profile = understand(prompt);
    expect(profile).toBeDefined();
    expect(profile.answer_type).toBeDefined();

    const contract = buildContract(profile);
    expect(contract.id).toMatch(/^ac_/);

    const alignment = scoreAlignment(response, contract);
    expect(typeof alignment.score).toBe('number');
    expect(alignment.score).toBeGreaterThanOrEqual(0);

    const gate = new LearningEvaluationGate();
    const gateResult = gate.gate({
      model_id: 'chat-model',
      baseline_score: 0,
      new_score: alignment.score / 100,
      metric: 'alignment',
    });
    expect(typeof gateResult.approved).toBe('boolean');
    expect(gateResult.model_id).toBe('chat-model');
  });

  test('empty response scores 0 and gate reflects it', () => {
    const profile = understand('Explain machine learning.');
    const contract = buildContract(profile);
    const alignment = scoreAlignment('', contract);
    expect(alignment.score).toBe(0);

    const gate = new LearningEvaluationGate();
    const gateResult = gate.gate({ model_id: 'test', baseline_score: 0.5, new_score: 0, metric: 'alignment' });
    expect(gateResult.approved).toBe(false);
  });

  test('high quality response passes learning gate', () => {
    const prompt = 'List three benefits of exercise.';
    const response = '1. Improves cardiovascular health. 2. Boosts mood through endorphin release. 3. Strengthens muscles and bones.';

    const profile = understand(prompt);
    const contract = buildContract(profile);
    const alignment = scoreAlignment(response, contract);
    expect(alignment.score).toBeGreaterThan(0);

    const gate = new LearningEvaluationGate();
    const gateResult = gate.gate({
      model_id: 'gpt-4',
      baseline_score: 0,
      new_score: alignment.score / 100,
      metric: 'alignment',
    });
    expect(typeof gateResult.approved).toBe('boolean');
  });

  test('LearningEvaluationGate evaluate() history accumulates', () => {
    const gate = new LearningEvaluationGate();
    gate.evaluate({ model_id: 'm1', before: { accuracy: 0.3 }, after: { accuracy: 0.7 } });
    gate.evaluate({ model_id: 'm1', before: { accuracy: 0.7 }, after: { accuracy: 0.8 } });
    const history = gate.getHistory('m1');
    expect(history.length).toBe(2);
  });

  test('getStats() reflects evaluate() calls', () => {
    const gate = new LearningEvaluationGate();
    gate.evaluate({ model_id: 'x', before: { accuracy: 0.2 }, after: { accuracy: 0.6 } });
    gate.evaluate({ model_id: 'x', before: { accuracy: 0.8 }, after: { accuracy: 0.5 } });
    const stats = gate.getStats();
    expect(stats.total).toBe(2);
    expect(typeof stats.approved).toBe('number');
    expect(typeof stats.rejected).toBe('number');
  });
});
