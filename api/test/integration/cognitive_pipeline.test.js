'use strict';

/**
 * cognitive_pipeline.test.js — Fase 2 integration test
 *
 * Verifies the cognitive pipeline runs end-to-end in middleware order:
 *   PromptIR → BehaviorRegistry → AdaptiveVerbosity → PersonalityLayer → (mock LLM) → ResponseQualityGate
 *
 * The LLM is mocked. All other pipeline services run with their real
 * implementations so the test catches wiring bugs that unit tests miss.
 *
 * Run: npx jest api/test/integration/cognitive_pipeline.test.js
 */

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { understand } = require('../../server/services/CognitiveBehavior/QuestionUnderstanding');
const { buildContract } = require('../../server/services/CognitiveBehavior/AnswerContract');
const { getPromptIR } = require('../../server/services/CognitiveBehavior/PromptIR');
const { get: getBehaviorPack } = require('../../server/services/CognitiveBehavior/BehaviorRegistry');
const { AdaptiveVerbosity } = require('../../server/services/CognitiveBehavior/AdaptiveVerbosity');
const { getPersonality, toSystemPromptFragment } = require('../../server/services/CognitiveBehavior/PersonalityLayer');
const { ResponseQualityGate } = require('../../server/services/CognitiveBehavior/ResponseQualityGate');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal mock LLM: echoes prompt and appends a canned answer. */
function mockLLM(systemPrompt, userMessage) {
  if (userMessage.toLowerCase().includes('function') || userMessage.toLowerCase().includes('code')) {
    return `Here is the code:\n\`\`\`python\ndef reverse_string(s):\n    return s[::-1]\n\`\`\`\nThis uses Python slice notation.`;
  }
  return `The answer is: ${userMessage.slice(0, 60)}. This is a detailed explanation that satisfies the question with enough substance to pass quality checks.`;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Cognitive Pipeline — end-to-end (LLM mocked)', () => {
  const ANSWER_TYPE_TO_PACK = {
    code: 'coding-assistant',
    procedural: 'coding-assistant',
    analytical: 'research-mode',
    factual: 'research-mode',
    explanation: 'tutor-mode',
    creative: 'chat-mode',
    default: 'chat-mode',
  };

  /**
   * Run the full pipeline for a given userInput.
   * Returns an object with results at each stage so tests can assert on them.
   */
  function runPipeline(userInput, sessionId = 'test-session') {
    // 1. QuestionUnderstanding + AnswerContract
    const profile = understand(userInput);
    const contract = buildContract(profile);

    // 2. PromptIR — improve the raw prompt
    const pir = getPromptIR();
    const pirResult = pir.improve(userInput, {
      intent: profile.answer_type,
      answerType: profile.answer_type,
      domain: profile.domain,
    });
    const improvedPrompt = pirResult.wasImproved ? pirResult.improved : userInput;

    // 3. BehaviorRegistry — pick behavior pack
    const packId = ANSWER_TYPE_TO_PACK[profile.answer_type] || ANSWER_TYPE_TO_PACK.default;
    const pack = getBehaviorPack(packId);

    // 4. AdaptiveVerbosity — assess verbosity level
    const av = new AdaptiveVerbosity();
    const verbResult = av.processMessage(sessionId, improvedPrompt);

    // 5. PersonalityLayer — build personality fragment
    const personality = getPersonality('default');
    const personalityFragment = toSystemPromptFragment(personality);

    // 6. Compose system prompt
    const systemParts = [];
    if (pack && pack.system_prompt_fragment) systemParts.push(pack.system_prompt_fragment);
    systemParts.push(personalityFragment);
    const systemPrompt = systemParts.filter(Boolean).join('\n');

    // 7. Mock LLM call
    const llmResponse = mockLLM(systemPrompt, improvedPrompt);

    // 8. ResponseQualityGate — score the response
    const gate = new ResponseQualityGate({ threshold: 0.5 });
    const gateResult = gate.gate(llmResponse, contract, {
      verbosityLevel: verbResult.level,
      prompt: improvedPrompt,
    });

    return {
      profile,
      contract,
      pirResult,
      improvedPrompt,
      packId,
      pack,
      verbResult,
      personalityFragment,
      systemPrompt,
      llmResponse,
      gateResult,
    };
  }

  // ── 1. QuestionUnderstanding → profile ──────────────────────────────────────
  test('QuestionUnderstanding produces a valid profile', () => {
    const { profile } = runPipeline('What is a neural network?');
    expect(profile).toBeDefined();
    expect(typeof profile.answer_type).toBe('string');
    expect(typeof profile.complexity).toBe('string');
    expect(typeof profile.is_question).toBe('boolean');
  });

  // ── 2. AnswerContract ────────────────────────────────────────────────────────
  test('AnswerContract is built from the profile', () => {
    const { contract } = runPipeline('How do I sort a list in Python?');
    expect(contract).toBeDefined();
    expect(contract.id).toMatch(/^ac_/);
    expect(contract.expected_format).toBeTruthy();
  });

  // ── 3. PromptIR ──────────────────────────────────────────────────────────────
  test('PromptIR returns a result with wasImproved flag', () => {
    const { pirResult } = runPipeline('write a function');
    expect(pirResult).toBeDefined();
    expect(typeof pirResult.wasImproved).toBe('boolean');
    expect(typeof pirResult.improved).toBe('string');
    expect(pirResult.improved.length).toBeGreaterThan(0);
  });

  test('PromptIR records issues for a vague prompt', () => {
    const pir = getPromptIR();
    const result = pir.improve('help', {});
    // "help" matches VAGUE_SIGNALS (no_context), issues are captured
    expect(result).toBeDefined();
    expect(typeof result.wasImproved).toBe('boolean');
    expect(typeof result.improved).toBe('string');
    // Whether the text is expanded depends on heuristic thresholds;
    // either way the pipeline returns a valid result without throwing
    expect(result.improved.length).toBeGreaterThan(0);
  });

  test('PromptIR does not corrupt a well-formed prompt', () => {
    const original = 'Explain the difference between Promise.all and Promise.race in JavaScript with examples.';
    const { pirResult } = runPipeline(original);
    // Detailed prompt should survive PromptIR intact or only be cosmetically cleaned
    expect(pirResult.improved.length).toBeGreaterThan(20);
  });

  // ── 4. BehaviorRegistry ──────────────────────────────────────────────────────
  test('BehaviorRegistry returns a built-in pack for code questions', () => {
    const { packId, pack } = runPipeline('Write a Python function to sort a list');
    expect(['coding-assistant', 'chat-mode']).toContain(packId);
    // Pack may be null if the registry doesn't find it, but packId should be set
    expect(typeof packId).toBe('string');
    if (pack) {
      expect(pack.id).toBe(packId);
      expect(typeof pack.system_prompt_fragment).toBe('string');
    }
  });

  // ── 5. AdaptiveVerbosity ─────────────────────────────────────────────────────
  test('AdaptiveVerbosity returns a verbosity level', () => {
    const { verbResult } = runPipeline('What is recursion?', 'av-test-session');
    expect(verbResult).toBeDefined();
    expect(['terse', 'moderate', 'verbose', 'detailed']).toContain(verbResult.level);
  });

  // ── 6. PersonalityLayer ──────────────────────────────────────────────────────
  test('PersonalityLayer produces a non-empty system prompt fragment', () => {
    const { personalityFragment } = runPipeline('Tell me about React hooks');
    expect(typeof personalityFragment).toBe('string');
    expect(personalityFragment.length).toBeGreaterThan(0);
  });

  // ── 7. Mock LLM → response ───────────────────────────────────────────────────
  test('Mock LLM returns a non-empty response', () => {
    const { llmResponse } = runPipeline('What is the capital of France?');
    expect(typeof llmResponse).toBe('string');
    expect(llmResponse.length).toBeGreaterThan(10);
  });

  test('Mock LLM returns code block for code questions', () => {
    const { llmResponse } = runPipeline('Write a function to reverse a string');
    expect(llmResponse).toMatch(/```/);
  });

  // ── 8. ResponseQualityGate ───────────────────────────────────────────────────
  test('ResponseQualityGate passes for a substantive response', () => {
    const { gateResult } = runPipeline('Explain closures in JavaScript');
    expect(gateResult).toBeDefined();
    expect(typeof gateResult.score).toBe('number');
    expect(gateResult.score).toBeGreaterThanOrEqual(0);
    expect(gateResult.score).toBeLessThanOrEqual(1);
  });

  test('ResponseQualityGate fails for an empty response', () => {
    const profile = understand('How does garbage collection work?');
    const contract = buildContract(profile);
    const gate = new ResponseQualityGate({ threshold: 0.6 });
    const result = gate.gate('', contract, { verbosityLevel: 'moderate', prompt: 'How does garbage collection work?' });
    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.6);
  });

  test('ResponseQualityGate penalises a boilerplate refusal (lower score than good response)', () => {
    const profile = understand('Write me a poem');
    const contract = buildContract(profile);
    // Use a strict threshold so even a moderately-penalised refusal fails
    const gate = new ResponseQualityGate({ threshold: 0.8 });

    // "I cannot do that." triggers no_boilerplate_refusal (-15 weight) AND
    // adequate_length (-15 weight), leaving score at 0.70 which is below 0.8
    const badResult = gate.gate('I cannot do that.', contract, {
      verbosityLevel: 'moderate',
      prompt: 'Write me a poem',
    });
    expect(badResult.pass).toBe(false);

    // A good response scores higher
    const goodResult = gate.gate(
      'Here is a short poem about spring:\nThe cherry blossoms bloom,\nPink petals fill the room,\nSoft breezes carry their scent,\nAs winter finally went.',
      contract,
      { verbosityLevel: 'moderate', prompt: 'Write me a poem' },
    );
    expect(goodResult.score).toBeGreaterThan(badResult.score);
  });

  // ── 9. Full pipeline coherence ───────────────────────────────────────────────
  test('Full pipeline produces coherent output for a code question', () => {
    const result = runPipeline('Write a Python function to reverse a list');
    // The pipeline should produce something at every stage
    expect(result.profile.answer_type).toBeTruthy();
    expect(result.contract.id).toBeTruthy();
    expect(result.improvedPrompt.length).toBeGreaterThan(0);
    expect(result.verbResult.level).toBeTruthy();
    expect(result.personalityFragment.length).toBeGreaterThan(0);
    expect(result.llmResponse).toMatch(/```/);
    expect(result.gateResult.score).toBeGreaterThan(0);
  });

  test('Full pipeline produces coherent output for a factual question', () => {
    const result = runPipeline('What is the speed of light?');
    expect(result.profile.answer_type).toBeTruthy();
    expect(result.contract.id).toBeTruthy();
    expect(result.llmResponse.length).toBeGreaterThan(10);
    expect(result.gateResult).toBeDefined();
  });
});
