'use strict';

const { understand, CARDINALITY } = require('../QuestionUnderstanding');
const { buildContract, scoreAlignment } = require('../AnswerContract');
const { getPersonality, registerPersonality, listPersonalities, toSystemPromptFragment } = require('../PersonalityLayer');
const { register, activate, deactivate, list, buildSystemPromptFromActivePacks } = require('../BehaviorRegistry');
const { AdaptiveVerbosity, LEVELS } = require('../AdaptiveVerbosity');
const { getMode, listModes, buildFullSystemPrompt } = require('../ModePrompts');
const { SemanticCache } = require('../SemanticCache');

describe('QuestionUnderstanding', () => {
  test('detects factual question', () => {
    const profile = understand('What is the capital of France?');
    expect(profile.answer_type).toBe('factual');
    expect(profile.is_question).toBe(true);
    expect(profile.subject).toBeTruthy();
  });

  test('detects code question', () => {
    const profile = understand('Write a function to reverse a string');
    expect(['code', 'creative', 'procedural']).toContain(profile.answer_type);
  });

  test('detects complexity', () => {
    const short = understand('Yes?');
    const long = understand('Can you explain, in detail, the implications of quantum entanglement for computing, especially when combined with machine learning, considering the current state of hardware?');
    expect(short.complexity).toBe('low');
    expect(long.complexity).toBe('high');
  });

  test('extracts entities', () => {
    const profile = understand('Tell me about `axios` and the `React` library');
    expect(profile.entities.length).toBeGreaterThan(0);
  });

  test('handles empty input gracefully', () => {
    const profile = understand('');
    expect(profile.answer_type).toBe('unknown');
  });
});

describe('AnswerContract', () => {
  test('builds a contract from a profile', () => {
    const profile = understand('How do I reverse a string in Python?');
    const contract = buildContract(profile);
    expect(contract.id).toMatch(/^ac_/);
    expect(contract.expected_format).toBeTruthy();
  });

  test('scores a good response higher than a bad one', () => {
    const profile = understand('How do I reverse a string?');
    const contract = buildContract(profile);
    const goodScore = scoreAlignment('To reverse a string, you can use the slice notation `[::-1]`. For example: `s[::-1]`. This works because Python lists support negative step slicing. The steps are: 1. Take your string. 2. Apply `[::-1]`.', contract);
    const badScore = scoreAlignment('yes', contract);
    expect(goodScore.score).toBeGreaterThan(badScore.score);
  });

  test('detects code block presence', () => {
    const profile = understand('Write code to sort a list');
    const contract = buildContract(profile);
    const withCode = scoreAlignment('Here is the code:\n```python\nlist.sort()\n```\nThis sorts in place.', contract);
    expect(withCode.breakdown).toBeDefined();
  });
});

describe('PersonalityLayer', () => {
  test('returns default personality', () => {
    const p = getPersonality('default');
    expect(p.id).toBe('default');
    expect(p.traits.length).toBeGreaterThan(0);
  });

  test('registers custom personality', () => {
    const p = registerPersonality({ id: 'test-persona', name: 'Test', tone: 'sarcastic', traits: ['witty'] });
    expect(p.id).toBe('test-persona');
    expect(getPersonality('test-persona').tone).toBe('sarcastic');
  });

  test('builds system prompt fragment', () => {
    const fragment = toSystemPromptFragment('expert');
    expect(fragment.length).toBeGreaterThan(10);
    expect(fragment).toMatch(/Tone:|Style:/);
  });

  test('lists personalities includes built-ins', () => {
    const all = listPersonalities();
    expect(all.some((p) => p.id === 'default')).toBe(true);
    expect(all.some((p) => p.id === 'expert')).toBe(true);
  });
});

describe('BehaviorRegistry', () => {
  test('lists built-in packs', () => {
    const packs = list();
    expect(packs.some((p) => p.id === 'coding-assistant')).toBe(true);
  });

  test('activates and deactivates a pack', () => {
    const r = activate('research-mode');
    expect(r.active_packs).toContain('research-mode');
    const r2 = deactivate('research-mode');
    expect(r2.active_packs).not.toContain('research-mode');
  });

  test('builds system prompt from active packs', () => {
    activate('chat-mode');
    const prompt = buildSystemPromptFromActivePacks();
    expect(typeof prompt).toBe('string');
  });

  test('registers a custom pack', () => {
    const pack = register({ id: 'test-pack', name: 'Test Pack' });
    expect(pack.id).toBe('test-pack');
  });
});

describe('AdaptiveVerbosity', () => {
  test('starts at moderate', () => {
    const av = new AdaptiveVerbosity();
    expect(av.getCurrentLevel('session-1')).toBe('moderate');
  });

  test('adjusts shorter on signal', () => {
    const av = new AdaptiveVerbosity();
    const result = av.processMessage('session-2', 'keep it brief please');
    expect(result.adjusted).toBe(true);
    expect(result.direction).toBe('shorter');
  });

  test('adjusts longer on signal', () => {
    const av = new AdaptiveVerbosity();
    const result = av.processMessage('session-3', 'can you elaborate more?');
    expect(result.adjusted).toBe(true);
    expect(result.direction).toBe('longer');
  });

  test('setLevel validates input', () => {
    const av = new AdaptiveVerbosity();
    expect(() => av.setLevel('s', 'invalid')).toThrow();
    expect(av.setLevel('s', 'terse').level).toBe('terse');
  });
});

describe('ModePrompts', () => {
  test('returns chat mode', () => {
    const mode = getMode('chat');
    expect(mode.system.length).toBeGreaterThan(20);
  });

  test('lists all built-in modes', () => {
    const modes = listModes();
    expect(modes.some((m) => m.id === 'coding')).toBe(true);
    expect(modes.some((m) => m.id === 'research')).toBe(true);
  });

  test('builds full system prompt', () => {
    const full = buildFullSystemPrompt('coding', 'Extra: cite sources.', 'Tone: direct.');
    expect(full).toContain('Extra: cite sources.');
    expect(full).toContain('Tone: direct.');
  });
});

describe('SemanticCache', () => {
  test('returns null for empty cache', () => {
    const cache = new SemanticCache({ threshold: 0.5 });
    expect(cache.get('What is 2+2?')).toBeNull();
  });

  test('stores and retrieves exact match', () => {
    const cache = new SemanticCache({ threshold: 0.9 });
    cache.set('What is the capital of France?', 'Paris');
    const hit = cache.get('What is the capital of France?');
    expect(hit).not.toBeNull();
    expect(hit.response).toBe('Paris');
  });

  test('misses on dissimilar question', () => {
    const cache = new SemanticCache({ threshold: 0.9 });
    cache.set('What is the capital of France?', 'Paris');
    const miss = cache.get('How do I bake a cake?');
    expect(miss).toBeNull();
  });

  test('getStats returns correct counts', () => {
    const cache = new SemanticCache({ threshold: 0.9 });
    cache.set('What is the capital of France?', 'Paris');
    cache.get('What is the capital of France?');
    cache.get('How does photosynthesis work in plants?');
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });
});
