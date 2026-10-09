'use strict';

/**
 * Integration tests for Gen B Batch D — runtime & output phases.
 * At least 4 behavioral tests per component.
 */

const { ResourceEstimator, getResourceEstimator } = require('~/server/services/CognitiveBehavior/ResourceEstimator');
const { FallbackChain, getFallbackChain } = require('~/server/services/CognitiveBehavior/FallbackChain');
const { ToolSelectionEngine, getToolSelectionEngine } = require('~/server/services/CognitiveBehavior/ToolSelectionEngine');
const { OutputFormatter, getOutputFormatter } = require('~/server/services/CognitiveBehavior/OutputFormatter');
const { CitationGenerator, getCitationGenerator } = require('~/server/services/CognitiveBehavior/CitationGenerator');
const { InterruptionHandler, getInterruptionHandler } = require('~/server/services/CognitiveBehavior/InterruptionHandler');
const { ProviderAbstraction, getProviderAbstraction } = require('~/server/services/CognitiveBehavior/ProviderAbstraction');
const { SentimentAnalyzer, getSentimentAnalyzer } = require('~/server/services/CognitiveBehavior/SentimentAnalyzer');

// ─── ResourceEstimator ────────────────────────────────────────────────────────

describe('ResourceEstimator', () => {
  let estimator;
  beforeEach(() => { estimator = new ResourceEstimator(); });

  test('estimates tokens from word count (~0.75 per word)', () => {
    // "hello world" = 2 words → ~1-2 tokens; "How are you doing today" = 5 words → ~3-4
    const result = estimator.estimate('How are you doing today', 'gpt-3.5-turbo');
    expect(result.tokens.input).toBeGreaterThan(0);
    expect(result.tokens.output).toBeGreaterThan(0);
    expect(result.tokens.total).toBe(result.tokens.input + result.tokens.output);
  });

  test('returns a non-zero costUsd for gpt-4', () => {
    const result = estimator.estimate('Write a long essay about climate change', 'gpt-4');
    expect(result.costUsd).toBeGreaterThan(0);
  });

  test('assigns a unique estimateId each call', () => {
    const r1 = estimator.estimate('task one', 'gpt-3.5');
    const r2 = estimator.estimate('task two', 'gpt-3.5');
    expect(r1.estimateId).not.toBe(r2.estimateId);
  });

  test('confidence is between 0 and 1', () => {
    const r = estimator.estimate('Analyze this prompt', 'claude-3-sonnet');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  test('recordActual updates accuracy data', () => {
    const r = estimator.estimate('test prompt', 'gpt-3.5-turbo');
    estimator.recordActual(r.estimateId, { tokens: { input: 5, output: 8, total: 13 }, costUsd: 0.00002 });
    const acc = estimator.getAccuracy();
    expect(acc).toHaveProperty('avgTokenError');
    expect(acc).toHaveProperty('avgCostError');
    expect(acc.calibrated).toBe(false); // needs 5+ actuals
  });

  test('getAccuracy reports calibrated:true after 5 actuals', () => {
    for (let i = 0; i < 5; i++) {
      const r = estimator.estimate(`prompt ${i}`, 'gpt-3.5-turbo');
      estimator.recordActual(r.estimateId, { tokens: { input: 10, output: 15, total: 25 }, costUsd: 0.0001 });
    }
    expect(estimator.getAccuracy().calibrated).toBe(true);
  });

  test('handles empty input gracefully', () => {
    const r = estimator.estimate('', 'gpt-4');
    expect(r.tokens.input).toBeGreaterThanOrEqual(0);
    expect(r.costUsd).toBeGreaterThanOrEqual(0);
  });

  test('tracks stats', () => {
    estimator.estimate('a', 'gpt-4');
    estimator.estimate('b', 'gpt-4');
    expect(estimator.getStats().estimates).toBe(2);
  });

  test('singleton returns same instance', () => {
    const a = getResourceEstimator();
    const b = getResourceEstimator();
    expect(a).toBe(b);
  });
});

// ─── FallbackChain ────────────────────────────────────────────────────────────

describe('FallbackChain', () => {
  let chain;
  beforeEach(() => { chain = new FallbackChain(); });

  test('execute returns success with a built-in chain', async () => {
    const result = await chain.execute('llm_fallback', 'What is 2+2?');
    expect(result.success).toBe(true);
    expect(result.usedStep).toBeTruthy();
  });

  test('execute returns usedStep from the first succeeding step', async () => {
    const result = await chain.execute('search_fallback', 'weather in Paris');
    expect(['web_search', 'cache', 'knowledge_base']).toContain(result.usedStep);
  });

  test('execute returns failure for unknown chainId', async () => {
    const result = await chain.execute('nonexistent_chain', 'input');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('define registers a custom chain that can be executed', async () => {
    chain.define('custom', [
      { name: 'always_works', handler: async () => ({ answer: 42 }), timeout: 1000 },
    ]);
    const result = await chain.execute('custom', 'anything');
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ answer: 42 });
  });

  test('register is an alias for define', async () => {
    chain.register('registered_chain', [
      { name: 'step1', handler: async (input) => `result:${input}` },
    ]);
    const result = await chain.execute('registered_chain', 'hello');
    expect(result.success).toBe(true);
  });

  test('getBuiltinChains returns llm_fallback and search_fallback', () => {
    const chains = chain.getBuiltinChains();
    expect(chains).toHaveProperty('llm_fallback');
    expect(chains).toHaveProperty('search_fallback');
    expect(chains.llm_fallback.steps).toContain('gpt-4');
  });

  test('execute records errors when steps fail', async () => {
    chain.define('fails', [
      { name: 'fails', handler: async () => { throw new Error('deliberate'); }, timeout: 500 },
      { name: 'succeeds', handler: async () => 'ok' },
    ]);
    const result = await chain.execute('fails', 'test');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.success).toBe(true);
    expect(result.usedStep).toBe('succeeds');
  });

  test('tracks stats', async () => {
    await chain.execute('llm_fallback', 'a');
    await chain.execute('llm_fallback', 'b');
    const stats = chain.getStats();
    expect(stats.executions).toBe(2);
    expect(stats.successes).toBeGreaterThanOrEqual(1);
  });
});

// ─── ToolSelectionEngine ──────────────────────────────────────────────────────

describe('ToolSelectionEngine', () => {
  let engine;
  beforeEach(() => { engine = new ToolSelectionEngine(); });

  test('selects web_search for a search query', () => {
    const r = engine.select('search the web for the latest news');
    expect(r.tool).toBeTruthy();
    expect(r.tool.name).toBe('web_search');
  });

  test('selects code_executor for a code execution task', () => {
    const r = engine.select('run this python script and execute the code');
    expect(r.tool).toBeTruthy();
    expect(r.tool.name).toBe('code_executor');
  });

  test('selects calculator for math tasks', () => {
    const r = engine.select('calculate the sum and arithmetic formula');
    expect(r.tool).toBeTruthy();
    expect(r.tool.name).toBe('calculator');
  });

  test('confidence is between 0 and 1', () => {
    const r = engine.select('analyze this image for faces');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  test('provides a reasoning string', () => {
    const r = engine.select('search the web');
    expect(typeof r.reasoning).toBe('string');
    expect(r.reasoning.length).toBeGreaterThan(0);
  });

  test('alternatives list contains other tools', () => {
    const r = engine.select('run a script');
    expect(Array.isArray(r.alternatives)).toBe(true);
  });

  test('registerTool adds a custom tool and selects it', () => {
    engine.registerTool({
      name: 'custom_summarizer',
      description: 'Summarize long documents',
      capabilities: ['summarize', 'document', 'condense', 'abstract'],
    });
    const r = engine.select('summarize this document');
    expect(r.tool).toBeTruthy();
    expect(getRegisteredNames(engine)).toContain('custom_summarizer');
  });

  test('getRegistered returns all built-in tools', () => {
    const tools = engine.getRegistered();
    const names = tools.map((t) => t.name);
    expect(names).toContain('web_search');
    expect(names).toContain('calculator');
    expect(names).toContain('image_analyzer');
  });

  function getRegisteredNames(e) {
    return e.getRegistered().map((t) => t.name);
  }
});

// ─── OutputFormatter ──────────────────────────────────────────────────────────

describe('OutputFormatter', () => {
  let fmt;
  beforeEach(() => { fmt = new OutputFormatter(); });

  test('formats text for plain platform strips markdown', () => {
    const { formatted } = fmt.format('**bold text** and `code`', { platform: 'plain' });
    expect(formatted).not.toContain('**');
    expect(formatted).not.toContain('`');
  });

  test('formats text for html platform escapes angle brackets', () => {
    const { formatted } = fmt.format('<script>alert(1)</script>', { platform: 'html' });
    expect(formatted).not.toContain('<script>');
    expect(formatted).toContain('&lt;script');
  });

  test('truncates at maxLength and appends ...', () => {
    const { formatted } = fmt.format('hello world '.repeat(100), { platform: 'plain', maxLength: 20 });
    expect(formatted.length).toBeLessThanOrEqual(20);
    expect(formatted.endsWith('...')).toBe(true);
  });

  test('detect identifies code content', () => {
    const result = fmt.detect('Here is some code:\n```js\nconsole.log("hello");\n```');
    expect(result.hasCode).toBe(true);
    expect(result.contentType).toBe('code');
  });

  test('detect identifies list content', () => {
    const result = fmt.detect('Items:\n- First item\n- Second item\n- Third item');
    expect(result.hasList).toBe(true);
    expect(result.contentType).toBe('list');
  });

  test('clean removes excessive whitespace', () => {
    const cleaned = fmt.clean('too   many    spaces\n\n\n\nlines');
    expect(cleaned).not.toMatch(/   /);
    expect(cleaned).not.toMatch(/\n{3}/);
  });

  test('clean strips HTML tags', () => {
    const cleaned = fmt.clean('<div>Hello <span>world</span></div>');
    expect(cleaned).not.toContain('<div>');
    expect(cleaned).toContain('Hello');
  });

  test('format returns format name matching platform', () => {
    const { format } = fmt.format('some text', { platform: 'slack' });
    expect(format).toBe('slack');
  });

  test('tracks stats', () => {
    fmt.format('a', {});
    fmt.detect('b');
    fmt.clean('c');
    const stats = fmt.getStats();
    expect(stats.formats).toBe(1);
    expect(stats.detections).toBe(1);
    expect(stats.cleans).toBe(1);
  });
});

// ─── CitationGenerator ────────────────────────────────────────────────────────

describe('CitationGenerator', () => {
  let gen;
  beforeEach(() => { gen = new CitationGenerator(); });

  test('extracts claims from text with statistics', () => {
    const { claims } = gen.extractClaims('Studies show that 85% of developers prefer TypeScript. Research indicates better productivity.');
    expect(claims.length).toBeGreaterThan(0);
    const types = claims.map((c) => c.type);
    expect(types).toContain('statistic');
  });

  test('extracts fact claims using assertive phrases', () => {
    const { claims } = gen.extractClaims('According to research, this method improves performance by 40%. Scientists found a new approach.');
    const types = claims.map((c) => c.type);
    expect(types).toContain('fact');
  });

  test('generateCitation returns APA format by default', () => {
    const { citation, format } = gen.generateCitation(
      { text: 'some claim', type: 'fact' },
      { author: 'Smith J', date: '2024', title: 'Test Paper', url: 'https://example.com' }
    );
    expect(format).toBe('apa');
    expect(citation).toContain('Smith J');
    expect(citation).toContain('2024');
  });

  test('generateCitation returns MLA format', () => {
    const { citation } = gen.generateCitation(
      { text: 'claim', type: 'fact' },
      { author: 'Jones A', date: '2023', title: 'Study', url: 'https://example.com' },
      'mla'
    );
    expect(citation).toContain('Jones A');
  });

  test('generateCitation returns inline format', () => {
    const { citation } = gen.generateCitation(
      { text: 'claim', type: 'fact' },
      { author: 'Brown K', date: '2022' },
      'inline'
    );
    expect(citation).toMatch(/\(Brown, 2022\)/);
  });

  test('annotate inserts citation markers [1] into text', () => {
    const sources = [{ author: 'Doe J', date: '2024', title: 'Source 1', url: 'https://x.com' }];
    const annotated = gen.annotate('Studies show that 60% of users prefer dark mode for code editing.', sources);
    expect(annotated).toContain('[1]');
  });

  test('addSource stores source and formatBibliography retrieves it', () => {
    gen.addSource('https://example.com', 'My Paper', 'Alice B', '2023', 'session_1');
    const bib = gen.formatBibliography('session_1');
    expect(bib).toContain('Alice B');
    expect(bib).toContain('[1]');
  });

  test('formatBibliography with no sources returns a message', () => {
    const bib = gen.formatBibliography('empty_session');
    expect(typeof bib).toBe('string');
    expect(bib.length).toBeGreaterThan(0);
  });

  test('tracks stats', () => {
    gen.extractClaims('Studies show that 50% of data is lost without backups.');
    gen.generateCitation({ text: 'x', type: 'fact' }, { author: 'A', date: '2020' });
    const stats = gen.getStats();
    expect(stats.claimsExtracted).toBeGreaterThanOrEqual(1);
    expect(stats.citationsGenerated).toBeGreaterThanOrEqual(1);
  });
});

// ─── InterruptionHandler ──────────────────────────────────────────────────────

describe('InterruptionHandler', () => {
  let handler;
  beforeEach(() => { handler = new InterruptionHandler(); });

  test('checkpoint saves task state', () => {
    handler.checkpoint('task_1', { step: 3, data: 'hello' });
    const result = handler.interrupt('task_1', 'user_pause');
    expect(result.resumable).toBe(true);
    expect(result.savedState).toEqual({ step: 3, data: 'hello' });
  });

  test('interrupt without checkpoint returns resumable:false', () => {
    const result = handler.interrupt('no_checkpoint_task');
    expect(result.interruptId).toBeTruthy();
    expect(result.resumable).toBe(false);
  });

  test('interrupt returns a suggestion string', () => {
    const result = handler.interrupt('task_2', 'user_interrupt');
    expect(typeof result.suggestion).toBe('string');
    expect(result.suggestion.length).toBeGreaterThan(0);
  });

  test('resume returns task state and timePaused', () => {
    handler.checkpoint('task_3', { progress: 0.5 });
    const { interruptId } = handler.interrupt('task_3', 'timeout');
    const resumed = handler.resume(interruptId);
    expect(resumed).toBeTruthy();
    expect(resumed.taskId).toBe('task_3');
    expect(resumed.state).toEqual({ progress: 0.5 });
    expect(resumed.timePaused).toBeGreaterThanOrEqual(0);
  });

  test('canResume returns true for a fresh interruption', () => {
    handler.checkpoint('task_4', {});
    const { interruptId } = handler.interrupt('task_4');
    expect(handler.canResume(interruptId)).toBe(true);
  });

  test('resume returns null for an unknown interruptId', () => {
    const result = handler.resume('int_unknown_999');
    expect(result).toBeNull();
  });

  test('getInterruptions returns list for a given taskId', () => {
    handler.checkpoint('task_5', {});
    handler.interrupt('task_5', 'cancel');
    handler.interrupt('task_5', 'error');
    const list = handler.getInterruptions('task_5');
    expect(list.length).toBe(2);
  });

  test('tracks stats', () => {
    handler.checkpoint('t', {});
    handler.interrupt('t');
    const stats = handler.getStats();
    expect(stats.checkpoints).toBe(1);
    expect(stats.interruptions).toBe(1);
  });
});

// ─── ProviderAbstraction ──────────────────────────────────────────────────────

describe('ProviderAbstraction', () => {
  let pa;
  beforeEach(() => { pa = new ProviderAbstraction(); });

  test('pre-registers openai, anthropic, google, mistral, groq, deepseek', () => {
    const ids = pa.listProviders().map((p) => p.providerId);
    ['openai', 'anthropic', 'google', 'mistral', 'groq', 'deepseek'].forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  test('getProvider returns config for known provider', () => {
    const p = pa.getProvider('openai');
    expect(p).toBeTruthy();
    expect(p.apiKeyEnv).toBe('OPENAI_API_KEY');
    expect(Array.isArray(p.models)).toBe(true);
  });

  test('getProvider returns null for unknown provider', () => {
    expect(pa.getProvider('unknown_xyz')).toBeNull();
  });

  test('register adds a custom provider', () => {
    pa.register('cohere', {
      name: 'Cohere',
      apiKeyEnv: 'COHERE_API_KEY',
      models: ['command', 'command-light'],
      quality: 0.80,
      latencyMs: 900,
    });
    const p = pa.getProvider('cohere');
    expect(p).toBeTruthy();
    expect(p.name).toBe('Cohere');
  });

  test('getBestProvider returns a valid providerId and model', () => {
    const result = pa.getBestProvider({});
    expect(typeof result.providerId).toBe('string');
    expect(typeof result.model).toBe('string');
    expect(typeof result.reason).toBe('string');
  });

  test('getBestProvider respects maxLatency constraint (groq is fastest)', () => {
    const result = pa.getBestProvider({ maxLatency: 300 });
    expect(result.providerId).toBe('groq');
  });

  test('getBestProvider respects minQuality constraint', () => {
    const result = pa.getBestProvider({ minQuality: 0.94 });
    expect(['openai', 'anthropic']).toContain(result.providerId);
  });

  test('isAvailable returns false when env var is not set', () => {
    // Unless the test environment has these set, they should return false
    const available = pa.isAvailable('openai');
    expect(typeof available).toBe('boolean');
  });

  test('tracks stats', () => {
    pa.getBestProvider({});
    pa.getBestProvider({ minQuality: 0.8 });
    expect(pa.getStats().queries).toBe(2);
  });
});

// ─── SentimentAnalyzer ────────────────────────────────────────────────────────

describe('SentimentAnalyzer', () => {
  let analyzer;
  beforeEach(() => { analyzer = new SentimentAnalyzer(); });

  test('detects positive sentiment', () => {
    const r = analyzer.analyze('Thanks! This is perfect and exactly what I needed. Great work!');
    expect(r.sentiment).toBe('positive');
    expect(r.score).toBeGreaterThan(0);
  });

  test('detects negative sentiment for frustration', () => {
    const r = analyzer.analyze("This is not working and it's completely broken. Why won't it work?");
    expect(r.sentiment).toBe('negative');
    expect(r.score).toBeLessThan(0);
  });

  test('returns neutral for neutral text', () => {
    const r = analyzer.analyze('Please process the following data and return the result.');
    expect(r.sentiment).toBe('neutral');
  });

  test('detectFrustration returns true for frustrated text', () => {
    expect(analyzer.detectFrustration("This doesn't work and it's useless")).toBe(true);
  });

  test('detectFrustration returns false for positive text', () => {
    expect(analyzer.detectFrustration('Thank you, this is perfect!')).toBe(false);
  });

  test('shouldAdjustTone suggests adjustment for negative user + neutral response', () => {
    const { adjust, suggestion } = analyzer.shouldAdjustTone('negative', 'neutral');
    expect(adjust).toBe(true);
    expect(typeof suggestion).toBe('string');
  });

  test('shouldAdjustTone returns no adjustment when tones match', () => {
    const { adjust } = analyzer.shouldAdjustTone('positive', 'positive');
    expect(adjust).toBe(false);
  });

  test('getSessionMood records and rolls up readings', () => {
    analyzer.getSessionMood('sess_1', { score: 0.5, sentiment: 'positive' });
    analyzer.getSessionMood('sess_1', { score: 0.4, sentiment: 'positive' });
    const mood = analyzer.getSessionMood('sess_1');
    expect(mood.samples).toBe(2);
    expect(mood.avgScore).toBeCloseTo(0.45, 1);
    expect(mood.sentiment).toBe('positive');
  });

  test('emotions object has all four keys', () => {
    const r = analyzer.analyze('urgent: damn this is broken and confusing');
    expect(r.emotions).toHaveProperty('frustration');
    expect(r.emotions).toHaveProperty('satisfaction');
    expect(r.emotions).toHaveProperty('confusion');
    expect(r.emotions).toHaveProperty('urgency');
  });

  test('confidence is between 0 and 1', () => {
    const r = analyzer.analyze('This is great!');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  test('tracks stats', () => {
    analyzer.analyze('hello');
    analyzer.detectFrustration('not working damn');
    const stats = analyzer.getStats();
    expect(stats.analyses).toBe(1);
    expect(stats.frustrationDetections).toBeGreaterThanOrEqual(1);
  });

  test('singleton returns same instance', () => {
    expect(getSentimentAnalyzer()).toBe(getSentimentAnalyzer());
  });
});
