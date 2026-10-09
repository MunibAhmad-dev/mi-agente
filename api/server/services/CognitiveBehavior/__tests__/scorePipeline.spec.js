'use strict';

const { understand } = require('../QuestionUnderstanding');
const { buildContract, scoreAlignment } = require('../AnswerContract');
const { LearningEvaluationGate } = require('../../Learning/LearningEvaluationGate');

describe('CognitiveBehavior score-pipeline (Face 16 + 17)', () => {
  test('understand → buildContract → scoreAlignment pipeline produces valid result', () => {
    const prompt = 'What is the capital of France?';
    const response = 'The capital of France is Paris. It is a major European city and the cultural hub of the country.';

    const profile = understand(prompt);
    expect(profile.answer_type).toBeDefined();

    const contract = buildContract(profile);
    expect(contract.id).toMatch(/^ac_/);
    expect(contract.expected_format).toBeDefined();

    const alignment = scoreAlignment(response, contract);
    expect(typeof alignment.score).toBe('number');
    expect(alignment.score).toBeGreaterThanOrEqual(0);
    expect(alignment.score).toBeLessThanOrEqual(100);
    expect(typeof alignment.passed).toBe('boolean');
  });

  test('scoreAlignment returns 0 for empty response', () => {
    const profile = understand('What is AI?');
    const contract = buildContract(profile);
    const alignment = scoreAlignment('', contract);
    expect(alignment.score).toBe(0);
    expect(alignment.passed).toBe(false);
  });

  test('LearningEvaluationGate.gate works with alignment score', () => {
    const gate = new LearningEvaluationGate();
    const result = gate.gate({ model_id: 'test-model', baseline_score: 0.5, new_score: 0.75, metric: 'alignment' });
    expect(result.approved).toBe(true);
    expect(result.delta).toBeCloseTo(0.25);
  });

  test('LearningEvaluationGate.gate rejects regression', () => {
    const gate = new LearningEvaluationGate();
    const result = gate.gate({ model_id: 'test-model', baseline_score: 0.8, new_score: 0.4, metric: 'alignment' });
    expect(result.approved).toBe(false);
    expect(result.delta).toBeLessThan(0);
  });

  test('full pipeline: prompt → alignment score → learning gate', () => {
    const prompt = 'Explain photosynthesis in simple terms';
    const response = 'Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to produce oxygen and energy in the form of glucose.';

    const profile = understand(prompt);
    const contract = buildContract(profile);
    const alignment = scoreAlignment(response, contract);
    const normalizedScore = alignment.score / 100;

    const gate = new LearningEvaluationGate();
    const gateResult = gate.gate({ model_id: 'gpt-4', baseline_score: 0.3, new_score: normalizedScore, metric: 'alignment' });

    expect(typeof gateResult.approved).toBe('boolean');
    expect(gateResult.model_id).toBe('gpt-4');
  });
});
