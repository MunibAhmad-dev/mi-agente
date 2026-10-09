'use strict';

const { AICouncil, COUNCIL_MODES } = require('../AICouncil');

describe('AICouncil', () => {
  let council;
  beforeEach(() => { council = new AICouncil(); });

  test('convene returns a decision with confidence when no models available', async () => {
    const origKey = process.env.OPENAI_API_KEY;
    const origAnth = process.env.ANTHROPIC_API_KEY;
    const origGem = process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await council.convene({ question: 'Should we deploy now?', options: ['yes', 'no'] });
    expect(result.decision).toBeDefined();
    expect(typeof result.confidence).toBe('number');
    expect(Array.isArray(result.dissent)).toBe(true);

    process.env.OPENAI_API_KEY = origKey;
    process.env.ANTHROPIC_API_KEY = origAnth;
    process.env.GEMINI_API_KEY = origGem;
  });

  test('localDeliberation picks first option', () => {
    const result = council._localDeliberation('question', ['option_a', 'option_b'], '');
    expect(result.decision).toBe('option_a');
    expect(result.confidence).toBe(0.3);
    expect(result.consensus).toBe(false);
  });

  test('_synthesize picks most voted option', () => {
    const opinions = [
      { model: 'm1', opinion: 'yes deploy', confidence: 0.9, reasoning: 'looks good' },
      { model: 'm2', opinion: 'yes deploy', confidence: 0.8, reasoning: 'stable' },
      { model: 'm3', opinion: 'no deploy', confidence: 0.4, reasoning: 'risky' },
    ];
    const result = council._synthesize(opinions, ['yes deploy', 'no deploy'], 0.6);
    expect(result.decision).toBe('yes deploy');
    expect(result.confidence).toBeCloseTo(2 / 3, 1);
  });

  test('_synthesize returns no consensus for empty opinions', () => {
    const result = council._synthesize([], ['a', 'b'], 0.6);
    expect(result.decision).toBe('no consensus');
    expect(result.confidence).toBe(0);
  });

  test('getSessions returns empty initially', () => {
    expect(council.getSessions()).toEqual([]);
  });

  test('COUNCIL_MODES are defined', () => {
    expect(COUNCIL_MODES.INDEPENDENT).toBe('independent');
    expect(COUNCIL_MODES.DEBATE).toBe('debate');
  });
});
