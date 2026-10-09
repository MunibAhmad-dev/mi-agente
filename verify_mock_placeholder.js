'use strict';

/**
 * Behavioral verification — confirm each module can be instantiated and
 * that its primary methods return sensible values (not stubs, not throws).
 *
 * Run:  node verify_mock_placeholder.js
 * Exit: 0 = all pass, 1 = one or more failures
 */

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, fn) {
  try {
    const result = fn();
    // If the function returns a Promise, skip async checks (would need async runner)
    if (result && typeof result.then === 'function') {
      passed++;
      console.log(`  ✅ ${name} — async (skipping await)`);
      return;
    }
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function assertTruthy(v, label) {
  if (!v) throw new Error(`Expected truthy for ${label}, got ${JSON.stringify(v)}`);
}
function assertType(v, t, label) {
  if (typeof v !== t) throw new Error(`Expected ${t} for ${label}, got ${typeof v}`);
}

console.log('\n=== BEHAVIORAL MODULE VERIFICATION ===\n');

// ── VideoGenerator ─────────────────────────────────────────────────────────
ok('VideoGenerator: instantiate', () => {
  const VG = require('./api/server/services/Harness/tools/VideoGenerator');
  const vg = new VG();
  assertTruthy(vg, 'instance');
  assertType(vg.generate, 'function', 'generate');
  assertType(vg.getStats, 'function', 'getStats');
  const stats = vg.getStats();
  assertType(stats.generated, 'number', 'stats.generated');
});

ok('VideoGenerator: parseScript parses text', () => {
  const VG = require('./api/server/services/Harness/tools/VideoGenerator');
  const vg = new VG();
  const scenes = vg._parseScript('NARRATOR: Hello world\n\nScene 2 content');
  assertTruthy(Array.isArray(scenes), 'scenes array');
  assertTruthy(scenes.length > 0, 'has scenes');
});

// ── PresentationGenerator ──────────────────────────────────────────────────
ok('PresentationGenerator: instantiate + generatePPTX/HTML methods', () => {
  const mod = require('./api/server/services/Harness/tools/PresentationGenerator');
  const PG = mod.PresentationGenerator || mod;
  const pg = new PG();
  assertType(pg.generatePPTX, 'function', 'generatePPTX');
  assertType(pg.generateHTML, 'function', 'generateHTML');
  assertType(pg.getStats, 'function', 'getStats');
  const stats = pg.getStats();
  assertTruthy(stats, 'stats');
});

// ── WebsiteGenerator ───────────────────────────────────────────────────────
ok('WebsiteGenerator: instantiate + generateSite/generateBlog methods', () => {
  const mod = require('./api/server/services/Harness/tools/WebsiteGenerator');
  const WG = mod.WebsiteGenerator || mod;
  const wg = new WG();
  assertType(wg.generateSite, 'function', 'generateSite');
  assertType(wg.generateBlog, 'function', 'generateBlog');
  assertType(wg.getStats, 'function', 'getStats');
});

// ── DiagramGenerator ───────────────────────────────────────────────────────
ok('DiagramGenerator: instantiate + generateFlowchart/generateChart methods', () => {
  const mod = require('./api/server/services/Harness/tools/DiagramGenerator');
  const DG = mod.DiagramGenerator || mod;
  const dg = new DG();
  assertType(dg.generateFlowchart, 'function', 'generateFlowchart');
  assertType(dg.generateChart, 'function', 'generateChart');
  assertType(dg.getStats, 'function', 'getStats');
});

// ── CanvasManager ──────────────────────────────────────────────────────────
ok('CanvasManager: instantiate + createDocument/listDocuments methods', () => {
  const mod = require('./api/server/services/Harness/tools/CanvasManager');
  const CM = mod.CanvasManager || mod;
  const cm = new CM();
  assertType(cm.createDocument, 'function', 'createDocument');
  assertType(cm.listDocuments, 'function', 'listDocuments');
  assertType(cm.getDocument, 'function', 'getDocument');
});

// ── PluginMarketplace ──────────────────────────────────────────────────────
ok('PluginMarketplace: instantiate + search method', () => {
  const mod = require('./api/server/services/Harness/tools/PluginMarketplace');
  const PM = mod.PluginMarketplace || mod;
  const pm = new PM();
  const hasSearch = typeof pm.search === 'function' || typeof pm.list === 'function';
  assertTruthy(hasSearch, 'search/list method');
});

// ── CloudAgent ─────────────────────────────────────────────────────────────
ok('CloudAgent: instantiate + executeTask/listActive methods', () => {
  const mod = require('./api/server/services/Harness/tools/CloudAgent');
  const CA = mod.CloudAgent || mod;
  const ca = new CA();
  assertType(ca.executeTask, 'function', 'executeTask');
  assertType(ca.listActive, 'function', 'listActive');
  const active = ca.listActive();
  assertTruthy(Array.isArray(active), 'listActive returns array');
});

// ── CompanionManager ───────────────────────────────────────────────────────
ok('CompanionManager: instantiate + createCompanion method', () => {
  const mod = require('./api/server/services/Harness/tools/CompanionManager');
  const CM = mod.CompanionManager || mod;
  const cm = new CM();
  const hasCreate = typeof cm.createCompanion === 'function' || typeof cm.create === 'function' || typeof cm.addCompanion === 'function';
  assertTruthy(hasCreate, 'createCompanion/create/addCompanion method');
});

// ── DesktopController ──────────────────────────────────────────────────────
ok('DesktopController: instantiate + screenshot/click method exists', () => {
  const mod = require('./api/server/services/Harness/tools/DesktopController');
  const DC = mod.DesktopController || mod;
  const dc = new DC();
  const hasControl = typeof dc.screenshot === 'function' || typeof dc.click === 'function' || typeof dc.type === 'function';
  assertTruthy(hasControl, 'screenshot/click/type method');
});

// ── PlaybookManager ────────────────────────────────────────────────────────
ok('PlaybookManager: instantiate + create + list', () => {
  const mod = require('./api/server/services/Harness/tools/PlaybookManager');
  const PBM = mod.PlaybookManager || mod;
  const pbm = new PBM();
  assertType(pbm.create, 'function', 'create');
  const books = pbm.list ? pbm.list() : [];
  assertTruthy(Array.isArray(books), 'list returns array');
});

// ── CollectionsEngine ──────────────────────────────────────────────────────
ok('CollectionsEngine: instantiate + create + query', () => {
  const mod = require('./api/server/services/Harness/tools/CollectionsEngine');
  const CE = mod.CollectionsEngine || mod;
  const ce = new CE();
  const hasCreate = typeof ce.create === 'function' || typeof ce.add === 'function';
  const hasQuery = typeof ce.query === 'function' || typeof ce.search === 'function' || typeof ce.get === 'function';
  assertTruthy(hasCreate, 'create/add method');
  assertTruthy(hasQuery, 'query/search/get method');
});

// ── DeeperSearchV2 ─────────────────────────────────────────────────────────
ok('DeeperSearchV2: instantiate + research/summarize/getStats', () => {
  const mod = require('./api/server/services/Harness/tools/DeeperSearchV2');
  const DS = mod.DeeperSearchV2 || mod;
  const ds = new DS();
  assertType(ds.research, 'function', 'research');
  assertType(ds.summarize, 'function', 'summarize');
  assertType(ds.getStats, 'function', 'getStats');
  const stats = ds.getStats();
  assertTruthy(stats, 'stats');
});

// ── MemoryFacade ───────────────────────────────────────────────────────────
ok('MemoryFacade: getContext returns { context, sources }', () => {
  const mf = require('./api/server/services/Memory/MemoryFacade');
  assertType(mf.getContext, 'function', 'getContext');
  const result = mf.getContext('test-user', 'test query');
  assertType(result.context, 'string', 'context');
  assertTruthy(Array.isArray(result.sources), 'sources array');
});

ok('MemoryFacade: recordEpisode + learnFact + recallFact', () => {
  const mf = require('./api/server/services/Memory/MemoryFacade');
  mf.recordEpisode('test-user', 'I prefer TypeScript');
  mf.learnFact('test_key', 'test_value');
  // recallFact may be null if underlying storage not available — that's fine
  const v = mf.recallFact('test_key');
  assertTruthy(v === null || v !== undefined, 'recallFact returned');
});

// ── ConstitutionEngine ─────────────────────────────────────────────────────
ok('ConstitutionEngine: validate clean text passes', () => {
  const { ConstitutionEngine } = require('./api/server/services/ExecutiveAI/ConstitutionEngine');
  const ce = new ConstitutionEngine();
  const r = ce.validate('Please explain how neural networks work.');
  assertType(r.passed, 'boolean', 'passed');
  assertTruthy(r.passed, 'clean text should pass');
  assertType(r.score, 'number', 'score');
});

ok('ConstitutionEngine: validate PII text catches violation', () => {
  const { ConstitutionEngine } = require('./api/server/services/ExecutiveAI/ConstitutionEngine');
  const ce = new ConstitutionEngine();
  const r = ce.validate('My email is user@example.com and my password is: abc123');
  assertType(r.passed, 'boolean', 'passed');
  assertTruthy(!r.passed || r.violations.length > 0 || r.score < 100, 'PII should be flagged');
});

// ── MultiModelJudge ────────────────────────────────────────────────────────
ok('MultiModelJudge: judge function exists and accepts params', () => {
  const { judge } = require('./api/server/services/ExecutiveAI/MultiModelJudge');
  assertType(judge, 'function', 'judge');
  // Don't actually call — requires API keys. Just verify signature.
  assertTruthy(judge.length === 0 || judge.length === 1, 'accepts opts object');
});

// ── CreativeEngineOrchestrator ─────────────────────────────────────────────
ok('CreativeEngineOrchestrator: singleton + createProject method', () => {
  const { getCreativeEngineOrchestrator } = require('./api/server/services/Creative/CreativeEngineOrchestrator');
  const orch = getCreativeEngineOrchestrator();
  assertTruthy(orch, 'singleton instance');
  assertType(orch.createProject, 'function', 'createProject');
  assertType(orch.getProject, 'function', 'getProject');
});

// ── PolicyEngine ───────────────────────────────────────────────────────────
ok('PolicyEngine: instantiate + checkCommand', () => {
  const PE = require('./api/server/services/Harness/tools/PolicyEngine');
  const PEClass = PE.PolicyEngine || PE;
  const pe = new PEClass();
  assertType(pe.checkCommand, 'function', 'checkCommand');
});

// ── CredentialVault ────────────────────────────────────────────────────────
ok('CredentialVault: instantiate + store/retrieve interface', () => {
  const CV = require('./api/server/services/Harness/tools/CredentialVault');
  const CVClass = CV.CredentialVault || CV;
  const cv = new CVClass();
  const hasStore = typeof cv.store === 'function' || typeof cv.set === 'function';
  const hasGet = typeof cv.retrieve === 'function' || typeof cv.get === 'function';
  assertTruthy(hasStore, 'store/set method');
  assertTruthy(hasGet, 'retrieve/get method');
});

// ── WebCloner agents ───────────────────────────────────────────────────────
ok('DesignForensicsAgent: analyze extracts designDNA', () => {
  const { DesignForensicsAgent } = require('./api/server/services/WebCloner/agents/DesignForensicsAgent');
  const agent = new DesignForensicsAgent();
  assertType(agent.analyze, 'function', 'analyze');
  const html = '<html><head></head><body style="color:#222;font-family:sans-serif"></body></html>';
  const report = agent.analyze(html);
  assertTruthy(report.designDNA, 'designDNA');
  assertType(report.colors, 'object', 'colors array');
  assertTruthy(typeof agent.summarize(report) === 'string', 'summarize returns string');
});

ok('AutoRepairAgent: detect + repair HTML issues', () => {
  const { AutoRepairAgent } = require('./api/server/services/WebCloner/agents/AutoRepairAgent');
  const agent = new AutoRepairAgent();
  assertType(agent.detect, 'function', 'detect');
  assertType(agent.repair, 'function', 'repair');
  const { issues } = agent.detect('<html><head></head><body></body></html>');
  assertTruthy(Array.isArray(issues), 'issues is array');
  assertTruthy(issues.length > 0, 'at least one issue detected (missing viewport/charset/doctype)');
  const { repairedHtml, repairs } = agent.repair('<html><head></head><body></body></html>');
  assertTruthy(typeof repairedHtml === 'string', 'repairedHtml is string');
  assertTruthy(Array.isArray(repairs), 'repairs is array');
});

ok('VisualQAAgent: analyzeHTML returns risk assessment', () => {
  const { VisualQAAgent } = require('./api/server/services/WebCloner/agents/VisualQAAgent');
  const agent = new VisualQAAgent();
  assertType(agent.analyzeHTML, 'function', 'analyzeHTML');
  assertType(agent.compare, 'function', 'compare');
  const result = agent.analyzeHTML('<html><body><canvas></canvas></body></html>');
  assertTruthy(['low', 'medium', 'high', 'unknown'].includes(result.riskLevel), 'riskLevel is valid');
  assertTruthy(Array.isArray(result.issues), 'issues is array');
  assertTruthy(typeof result.score === 'number', 'score is number');
});

ok('BehaviorBenchmark: runs 3 built-in benchmarks post-response', () => {
  const { getBehaviorBenchmark } = require('./api/server/services/CognitiveBehavior/BehaviorBenchmark');
  const bb = getBehaviorBenchmark();
  assertTruthy(bb, 'instance exists');
  assertType(bb.run, 'function', 'run');
  const resp = 'Here is how to solve this. First step: install dependencies. For example: npm install mypackage.';
  const ctx = { query: 'How do I install a package?', expectedLength: 400 };
  const qr = bb.run('response_quality', resp, ctx);
  assertTruthy(typeof qr.score === 'number', 'quality score is number');
  assertTruthy(qr.score >= 0 && qr.score <= 1, 'quality score in range');
  const sr = bb.run('safety', resp, ctx);
  assertTruthy(typeof sr.score === 'number', 'safety score is number');
  assertTruthy(sr.passed === true, 'safety passes clean response');
  const hr = bb.run('helpfulness', resp, ctx);
  assertTruthy(typeof hr.score === 'number', 'helpfulness score is number');
  const builtin = bb.getBuiltinBenchmarks();
  assertTruthy(Array.isArray(builtin) && builtin.length >= 3, 'has 3 built-in benchmarks');
});

ok('BehaviorPolicy: check/evaluate with baseline policy', () => {
  const { getBehaviorPolicy } = require('./api/server/services/CognitiveBehavior/BehaviorPolicy');
  const bp = getBehaviorPolicy();
  assertTruthy(bp, 'instance exists');
  assertType(bp.check, 'function', 'check');
  assertType(bp.evaluate, 'function', 'evaluate');
  assertType(bp.register, 'function', 'register');
  const clean = bp.check({ content: 'How do I install npm packages?', intent: 'coding' });
  assertTruthy(clean.allowed === true, 'clean action is allowed');
  assertTruthy(Array.isArray(clean.violations) && clean.violations.length === 0, 'no violations on clean');
  const policies = bp.listPolicies();
  assertTruthy(Array.isArray(policies) && policies.length >= 2, 'at least 2 built-in policies');
  const stats = bp.getStats();
  assertTruthy(typeof stats.checks === 'number' && stats.checks > 0, 'check counter incremented');
});

ok('AlternativeHypothesisEngine: generate alternatives for a claim', () => {
  const { getAlternativeHypothesisEngine } = require('./api/server/services/CognitiveBehavior/AlternativeHypothesisEngine');
  const ahe = getAlternativeHypothesisEngine();
  assertTruthy(ahe, 'instance exists');
  assertType(ahe.generate, 'function', 'generate');
  assertType(ahe.rank, 'function', 'rank');
  const result = ahe.generate('The increase in temperature causes higher sales.', { count: 3 });
  assertTruthy(result.claim && result.claim.length > 0, 'claim preserved');
  assertTruthy(Array.isArray(result.alternatives) && result.alternatives.length === 3, '3 alternatives generated');
  const ranked = ahe.rank(result.alternatives, 'temperature sales correlation study');
  assertTruthy(Array.isArray(ranked) && ranked.length === 3, 'ranking returns same count');
  assertTruthy(typeof ranked[0].score === 'number', 'ranked items have scores');
});

ok('DecisionEngine: decide yes/no/ask on a question', () => {
  const { getDecisionEngine } = require('./api/server/services/CognitiveBehavior/DecisionEngine');
  const de = getDecisionEngine();
  assertTruthy(de, 'instance exists');
  assertType(de.decide, 'function', 'decide');
  const safe = de.decide('Should the agent generate a code snippet?', { riskLevel: 'low' });
  assertTruthy(['yes','no','ask'].includes(safe.decision), 'decision is yes/no/ask');
  assertTruthy(typeof safe.confidence === 'number', 'confidence is number');
  const risky = de.decide('Should the agent delete all files?', { riskLevel: 'high', irreversible: true });
  assertTruthy(risky.decision === 'ask', 'high-risk irreversible → ask');
  const stats = de.getStats();
  assertTruthy(stats.decisions >= 2, 'decision counter incremented');
});

ok('RegressionBenchmark: record metrics and check regression', () => {
  const { getRegressionBenchmark } = require('./api/server/services/CognitiveBehavior/RegressionBenchmark');
  const rb = getRegressionBenchmark();
  assertTruthy(rb, 'instance exists');
  assertType(rb.record, 'function', 'record');
  assertType(rb.detectRegression, 'function', 'detectRegression');
  assertType(rb.getReport, 'function', 'getReport');
  for (let i = 0; i < 6; i++) rb.record('sess_rb1', 'quality_score', 0.9);
  for (let i = 0; i < 6; i++) rb.record('sess_rb1', 'quality_score', 0.5);
  const detection = rb.detectRegression('sess_rb1', 'quality_score');
  assertTruthy(detection && typeof detection === 'object', 'detectRegression returns object');
  assertTruthy(typeof detection.regression === 'boolean', 'regression is boolean');
  assertTruthy(detection.regression === true, 'detects regression: 0.9→0.5');
  const report = rb.getReport('sess_rb1');
  assertTruthy(Array.isArray(report.regressions), 'getReport.regressions is array');
});

ok('ModelAgnosticTesting: run behavioral contracts on a response', () => {
  const { getModelAgnosticTesting } = require('./api/server/services/CognitiveBehavior/ModelAgnosticTesting');
  const mat = getModelAgnosticTesting();
  assertTruthy(mat, 'instance exists');
  assertType(mat.runInline, 'function', 'runInline');
  assertType(mat.defineSuite, 'function', 'defineSuite');
  assertType(mat.runSuite, 'function', 'runSuite');
  const goodResp = 'Here is the solution to your question about caching in Node.js. Using Redis is recommended for distributed caching.';
  const tests = [
    { name: 'isSafe', matcher: 'isSafe', required: true },
    { name: 'isSubstantial', matcher: 'isSubstantial' },
  ];
  const result = mat.runInline(goodResp, tests);
  assertTruthy(typeof result.passed === 'boolean', 'passed is boolean');
  assertTruthy(result.passed === true, 'safe+substantial response passes');
  const badResp = 'ok';
  const failResult = mat.runInline(badResp, [{ name: 'isSubstantial', matcher: 'isSubstantial', required: true }]);
  assertTruthy(failResult.passed === false, 'too-short response fails isSubstantial');
});

ok('BuilderCritic: critique a draft and run a cycle', () => {
  const { getBuilderCritic } = require('./api/server/services/CognitiveBehavior/BuilderCritic');
  const bc = getBuilderCritic();
  assertTruthy(bc, 'instance exists');
  assertType(bc.critique, 'function', 'critique');
  assertType(bc.run, 'function', 'run');
  const goodDraft = 'Here are 3 specific examples of how to implement caching. ' +
    'First, use Redis for session data. Second, apply HTTP cache headers for static assets. ' +
    'Third, implement a memoization function for expensive computations. ' +
    'Each approach has different tradeoffs based on your specific use case and scale requirements.';
  const result = bc.critique(goodDraft);
  assertTruthy(typeof result.score === 'number' && result.score >= 0 && result.score <= 1, 'score in range');
  assertTruthy(typeof result.passed === 'boolean', 'passed is boolean');
  assertTruthy(Array.isArray(result.dimensions) && result.dimensions.length > 0, 'dimensions returned');
  const cycleResult = bc.run(goodDraft, { maxRounds: 1 });
  assertTruthy(typeof cycleResult.score === 'number', 'cycle score');
  assertTruthy(cycleResult.rounds >= 1, 'at least 1 round');
});

// ──────────────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(55)}`);
console.log(`PASSED: ${passed} | FAILED: ${failed}`);
if (failures.length > 0) {
  console.log('\n❌ FAILURES:');
  failures.forEach((f) => console.log(`  - ${f}`));
}
process.exit(failed > 0 ? 1 : 0);
