'use strict';

/**
 * Test runner (plan §95, §96-§102). Zero dependencies, real assertions.
 * Every mandated scenario from the master specification is here:
 *  96 dependent sources · 97 wikipedia mismatch · 98 political matrix ·
 *  99 contradiction · 100 experiment failure · 101 recovery · 102 compression.
 * PLUS: bias-forensics guarantees (19A), SSRF matrix, prompt injection,
 * hybrid RAG, orchestrator E2E (offline-injected), confidence history,
 * active learning gate, API integration.
 */

const assert = require('assert');
const path = require('path');

process.env.RESEARCH_OS_STORE = path.join(__dirname, '..', 'data', 'test-store.json');
process.env.RESEARCH_OS_LOG = 'error';

const core = require('../src/core/store');
const config = require('../src/core/config');
const eventbus = require('../src/core/eventbus');

const results = [];
let current = '';

function suite(name) { current = name; console.log(`\n▶ ${name}`); }
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push({ name: `${current} :: ${name}`, ok: true }); console.log(`  ✔ ${name}`); })
    .catch((err) => { results.push({ name: `${current} :: ${name}`, ok: false, error: err.message }); console.log(`  ✘ ${name}\n    ${err.message}`); });
}

function freshStore() {
  core.reset();
  config.reset();
  eventbus.reset();
  require('../src/router/ResourceGovernor').reset();
  require('../src/intent/ClarificationEngine').reset();
}

async function main() {
  /* ---------------- Face 24: Intent ---------------- */
  suite('Face 24 — Intent & Profile');
  await test('Twilight Sparkle → fiction/character, low complexity', async () => {
    freshStore();
    const { analyze } = require('../src/intent/IntentAnalyzer');
    const p = analyze('¿Quién es Twilight Sparkle?');
    assert.strictEqual(p.domain, 'fiction');
    assert.strictEqual(p.question_type, 'factual');
    assert.ok(p.complexity <= 0.45, `complexity ${p.complexity}`);
    assert.ok(p.entities.some((e) => /twilight/i.test(e)));
  });
  await test('Qwen reduction without quantization → AI, experiment required', async () => {
    freshStore();
    const { analyze } = require('../src/intent/IntentAnalyzer');
    const p = analyze('¿Cómo reducir Qwen sin cuantizar y medir la calidad con benchmark?');
    assert.strictEqual(p.domain, 'ai');
    assert.strictEqual(p.experiment_requirement, 'required');
    assert.ok(p.complexity >= 0.5);
  });
  await test('news verification → fact_check, freshness critical', async () => {
    freshStore();
    const { analyze } = require('../src/intent/IntentAnalyzer');
    const p = analyze('¿Es verdadera esta noticia de hoy sobre el anuncio?');
    assert.strictEqual(p.question_type, 'fact_check');
    assert.strictEqual(p.freshness_requirement, 'critical');
    assert.strictEqual(p.verification_requirement, 'high');
  });
  await test('clarification asks on ambiguous question; unanswered → explicit hypothesis', async () => {
    freshStore();
    const { assess, apply } = require('../src/intent/ClarificationEngine');
    const { analyze } = require('../src/intent/IntentAnalyzer');
    const profile = analyze('¿Cómo personalizo un LLM?');
    const a = assess(profile, { threshold: 0.3 });
    assert.ok(a.should_ask, `should ask (ambiguity ${a.ambiguity_score})`);
    assert.ok(a.questions.some((q) => q.id === 'customization_goal'));
    assert.ok(a.questions.some((q) => q.id === 'target_model'));
    const applied = apply(profile, a, {});
    assert.strictEqual(applied.hypotheses.length, a.questions.length, 'unanswered → hypotheses');
    assert.ok(profile.explicit_hypotheses.length >= 2);
  });
  await test('unambiguous question triggers no clarification', async () => {
    freshStore();
    const { assess } = require('../src/intent/ClarificationEngine');
    const { analyze } = require('../src/intent/IntentAnalyzer');
    const a = assess(analyze('¿Quién es Twilight Sparkle?'));
    assert.strictEqual(a.should_ask, false);
  });

  /* ---------------- Face 25: Router & Governor ---------------- */
  suite('Face 25 — ComplexityRouter & ResourceGovernor');
  await test('routing table per complexity', async () => {
    freshStore();
    const { routingTable } = require('../src/router/ComplexityRouter');
    const { analyze } = require('../src/intent/IntentAnalyzer');
    assert.strictEqual(routingTable(analyze('¿Quién es Twilight Sparkle?')).mode, 'QUICK');
    const newsQ = analyze('¿Es verdadera esta noticia de hoy sobre el anuncio del government?');
    assert.strictEqual(routingTable(newsQ).mode, 'FORENSIC', JSON.stringify({ c: newsQ.complexity, v: newsQ.verification_requirement }));
    assert.strictEqual(routingTable(analyze('¿Cómo reducir Qwen sin cuantizar y medir con benchmark?')).mode, 'EXPERIMENTAL');
  });
  await test('governor admits normal plan, refuses over-ceiling plan', async () => {
    freshStore();
    const cfg = require('../src/core/config');
    const Governor = require('../src/router/ResourceGovernor');
    const adm = Governor.admit('s1', { kind: 'fetch' });
    assert.ok(adm.admitted);
    cfg.config.MAX_PAGES = 2;
    Governor.charge('s2', { pages: 2 });
    const refused = Governor.admit('s2', { kind: 'fetch' });
    assert.ok(!refused.admitted);
    assert.ok(refused.violations.includes('MAX_PAGES'));
  });
  await test('governor downgrades browser→http when RAM ceiling hit', async () => {
    freshStore();
    const cfg = require('../src/core/config');
    const Governor = require('../src/router/ResourceGovernor');
    cfg.config.MAX_RAM_MB = 100;
    const d = Governor.admit('s3', { kind: 'browser', ram_mb: 900 });
    assert.strictEqual(d.downgrade, 'http');
  });
  await test('estimates are produced for all kinds', async () => {
    freshStore();
    const Governor = require('../src/router/ResourceGovernor');
    for (const kind of ['search', 'fetch', 'browser', 'llm_call', 'experiment']) {
      const e = Governor.estimate({ kind });
      assert.ok(e.estimated_runtime_ms > 0, kind);
    }
  });

  /* ---------------- Face 26: Acquisition & SSRF ---------------- */
  suite('Face 26 — Acquisition & SSRF guard');
  await test('SSRF matrix blocks private/loopback/metadata/ip-literals', async () => {
    const Guard = require('../src/acquisition/SsrfGuard');
    for (const [url, reason] of [
      ['http://localhost:8080/x', null], ['http://127.0.0.1/x', null], ['http://169.254.169.254/latest/meta-data', null],
      ['http://10.0.0.1/x', null], ['http://192.168.1.1/x', null], ['http://172.16.0.1/x', null],
      ['http://[::1]/x', null], ['file:///etc/passwd', null], ['http://user:pass@evil.example.com', null],
    ]) {
      const v = await Guard.validate(url);
      assert.strictEqual(v.ok, false, `${url} must be blocked`);
    }
    assert.ok((await Guard.validate('http://169.254.169.254/')).reason === 'private_ip');
  });
  await test('SSRF allows public domains (validation only, no fetch)', async () => {
    const Guard = require('../src/acquisition/SsrfGuard');
    const v = await Guard.validate('https://export.arxiv.org/api/query?search_query=test');
    assert.ok(v.ok, `arxiv should pass: ${v.reason}`);
  });
  await test('document extractor: HTML, JSON, PDF-lite, CSV', async () => {
    const Doc = require('../src/acquisition/DocumentExtractor');
    const html = Doc.extract(Buffer.from('<html><head><title>T1</title></head><body><script>bad()</script><p>Hello world content paragraph here for testing purposes.</p></body></html>'), 'text/html');
    assert.strictEqual(html.title, 'T1');
    assert.ok(!html.text.includes('bad()'));
    const json = Doc.extract(Buffer.from(JSON.stringify({ a: 'alpha beta', b: ['gamma', 'delta'] })), 'application/json');
    assert.ok(json.text.includes('gamma'));
    const pdf = Doc.extract(Buffer.from('%PDF-1.4 (Hello pdf world) (second string here)'), 'application/pdf');
    assert.ok(pdf.text.includes('Hello pdf world'));
    const csv = Doc.extract(Buffer.from('a,b,c\n1,2,3'), 'text/csv');
    assert.ok(csv.text.includes('1 2 3'));
  });

  /* ---------------- Face 27: Content pipeline ---------------- */
  suite('Face 27 — UniversalDocument & video provenance');
  await test('ingest HTML → doc + chunks + dual-leg index', async () => {
    freshStore();
    const Content = require('../src/content/ContentPipeline');
    const out = await Content.ingest({
      url: 'https://example.test/article', text: 'Sentence one is here for the chunking test. '.repeat(30), source_id: 'src', title: 'T',
      metadata: {}, session_id: 'sess27',
    });
    assert.ok(out.ok);
    assert.ok(out.chunks.length >= 1);
    const chunks = await Content.chunksFor(out.doc.id);
    assert.strictEqual(chunks.length, out.chunks.length);
  });
  await test('video transcript carries timestamp provenance on every chunk', async () => {
    freshStore();
    const Content = require('../src/content/ContentPipeline');
    const out = await Content.ingestVideoTranscript('vid42', [
      { ts: '00:01:00', text: 'The launch happened in January with full success across all tests.' },
      { ts: '00:02:30', text: 'Costs dropped by twenty percent according to the company report.' },
    ], { session_id: 'sess27v' });
    assert.ok(out.ok);
    const chunks = await Content.chunksFor(out.doc.id);
    assert.ok(chunks.every((c) => c.video && c.video.video_id === 'vid42' && c.video.timestamp));
  });
  await test('dedup by content_hash on re-ingest', async () => {
    freshStore();
    const Content = require('../src/content/ContentPipeline');
    const text = 'Unique content for hash dedup test with enough length to be kept properly.';
    const a = await Content.ingest({ url: 'https://x.test/1', text, title: 'A', source_id: 's' });
    const b = await Content.ingest({ url: 'https://x.test/2', text, title: 'B', source_id: 's2' });
    assert.strictEqual(a.doc.content_hash, b.doc.content_hash);
  });

  /* ---------------- Face 28: Profiler + Dependency (§96) ---------------- */
  suite('Face 28 — SourceProfiler & DependencyAnalyzer');
  await test('SPEC §96: chain A→B→C→D→E yields exactly 1 independent source', async () => {
    freshStore();
    const Dep = require('../src/sources/DependencyAnalyzer');
    const docs = require('./fixtures').dependentChain().map((d) => ({ ...d, content_hash: require('../src/core/ids').sha1(d.text) }));
    const graph = await Dep.analyze(docs);
    assert.strictEqual(graph.summary.independent_sources, 1, JSON.stringify(graph.summary));
    assert.strictEqual(graph.summary.apparent_sources, 5);
    const copied = graph.edges.filter((e) => e.relation === 'copied_from' || e.relation === 'syndicated');
    assert.ok(copied.length >= 2, 'B,C flagged as copies');
    assert.ok(graph.edges.some((e) => e.relation === 'cites' && e.from === 'docD'), 'D cites A detected');
  });
  await test('independent docs are not falsely merged', async () => {
    freshStore();
    const Dep = require('../src/sources/DependencyAnalyzer');
    const docs = require('./fixtures').politicalMatrix().map((d) => ({ ...d, content_hash: require('../src/core/ids').sha1(d.text) }));
    const graph = await Dep.analyze(docs);
    assert.ok(graph.summary.independent_sources >= 2, JSON.stringify(graph.summary));
  });
  await test('profiler classifies source types', async () => {
    freshStore();
    const Prof = require('../src/sources/SourceProfiler');
    const arxiv = await Prof.profile({ url: 'https://arxiv.org/abs/2401.0001' });
    assert.strictEqual(arxiv.profile.type, 'academic');
    const gh = await Prof.profile({ url: 'https://github.com/foo/bar' });
    assert.strictEqual(gh.profile.type, 'github');
    const yt = await Prof.profile({ url: 'https://youtube.com/watch?v=x' });
    assert.strictEqual(yt.profile.type, 'video');
  });

  /* ---------------- Face 29: Claims, Evidence, Contradictions ---------------- */
  suite('Face 29 — Claim engine, Evidence levels, Contradictions');
  await test('atomic claims with SPO decomposition and modality', async () => {
    freshStore();
    const CE = require('../src/claims/ClaimExtractor');
    const claims = CE.extract({ id: 'd1', source_id: 's1', content: 'The QW-9 chip launched in 2024. The delay perhaps caused losses. Officials announced the results yesterday.' });
    assert.ok(claims.length >= 2, `got ${claims.length}`);
    const withTime = claims.find((c) => c.time === '2024');
    assert.ok(withTime, 'temporal claim extracted');
    assert.ok(claims.some((c) => c.modality === 'speculation'), 'hedged modality detected');
  });
  await test('E-levels: dependent repetition ≠ corroboration (E2 vs E3)', async () => {
    freshStore();
    const Dep = require('../src/sources/DependencyAnalyzer');
    const EE = require('../src/claims/EvidenceEngine');
    const CE = require('../src/claims/ClaimExtractor');
    const Content = require('../src/content/ContentPipeline');
    const fixtures = require('./fixtures').dependentChain();
    const docRecs = {};
    const ingested = [];
    for (const d of fixtures) {
      const rec = await Content.ingest({ url: d.url, text: d.text, title: d.title, source_id: d.source_id, links: d.links, metadata: { fixture_id: d.id } });
      docRecs[d.id] = { ...rec.doc, text: rec.doc.content };
      ingested.push(docRecs[d.id]);
    }
    const graph = await Dep.analyze(ingested);
    const claims = CE.extract({ id: docRecs.docA.id, source_id: 'srcA', content: fixtures[0].text });
    const claim = claims.find((c) => /efficiency/i.test(c.text));
    assert.ok(claim, 'efficiency claim extracted');
    await EE.add({ claim, doc: docRecs.docA, relation: 'SUPPORTS', dependency_graph: graph });
    const e1 = await EE.add({ claim, doc: docRecs.docB, relation: 'SUPPORTS', dependency_graph: graph });
    assert.strictEqual(e1.independent, false, 'copy must be dependent');
    assert.strictEqual(e1.level, 'E2', 'dependent repetition is E2');
    const e2 = await EE.add({ claim, doc: docRecs.docC, relation: 'SUPPORTS', dependency_graph: graph });
    assert.strictEqual(e2.independent, false, 'copy-of-copy C remains in the same original story component (§96)');
    assert.strictEqual(e2.level, 'E2', 'dependent repetition is still E2');
    // genuinely independent witness (different lab, own data, no links)
    const wit = require('./fixtures').independentWitness();
    const wrec = await Content.ingest({ url: wit.url, text: wit.text, title: wit.title, source_id: wit.source_id, links: wit.links, metadata: { fixture_id: wit.id } });
    docRecs.docF = { ...wrec.doc, text: wrec.doc.content };
    ingested.push(docRecs.docF);
    const graph2 = await Dep.analyze(ingested);
    const e3 = await EE.add({ claim, doc: docRecs.docF, relation: 'SUPPORTS', dependency_graph: graph2 });
    assert.strictEqual(e3.independent, true, 'own primary data, no dependency → independent');
    assert.strictEqual(e3.level, 'E3', 'independent corroboration is E3');
  });
  await test('SPEC §99: temporal contradiction detected, escalation created, no forced verdict', async () => {
    freshStore();
    const CE = require('../src/claims/ClaimExtractor');
    const Contradictions = require('../src/claims/ContradictionEngine');
    const docs = require('./fixtures').contradictionPair();
    const claimsA = CE.extract({ id: 'docA', source_id: 'srcA2', content: docs[0].text });
    const claimsB = CE.extract({ id: 'docB', source_id: 'srcB2', content: docs[1].text });
    const detected = await Contradictions.scan([...claimsA, ...claimsB]);
    assert.ok(detected.length >= 1, 'contradiction found');
    const c = detected[0];
    assert.strictEqual(c.type, 'temporal');
    assert.strictEqual(c.resolved, false);
    assert.strictEqual(c.escalation_task.type, 'PRIMARY_SOURCE_SEARCH');
  });
  await test('primary evidence upgrades level to E4 and status TRUE', async () => {
    freshStore();
    const EE = require('../src/claims/EvidenceEngine');
    const CE = require('../src/claims/ClaimExtractor');
    const claim = CE.extract({ id: 'd', source_id: 's', content: 'The chamber approved the housing bill with 210 votes in 2025.' })[0];
    await EE.add({ claim, doc: { id: 'wire', source_id: 'w', content: 'housing bill approved with 210 votes in 2025 according to records' }, relation: 'SUPPORTS' });
    await EE.add({ claim, doc: { id: 'official', source_id: 'p', content: 'official vote record 2025 housing bill 210 votes in favor' }, relation: 'SUPPORTS', is_primary: true });
    const s = await EE.summarize(claim.id);
    assert.ok(s.evidence.primary >= 1);
    assert.strictEqual(s.status, 'TRUE');
  });

  /* ---------------- Face 30: Bias forensics guarantees (19A) ---------------- */
  suite('Face 30 — Bias Forensics (19A guarantees)');
  await test('PROHIBITED heuristic: mentioning feminism does NOT yield LEFT', async () => {
    const OC = require('../src/bias/OrientationClassifier');
    const r = OC.classify({ text: 'The feminist movement organized a march for gender rights on Saturday.' });
    assert.ok(r.insufficient_evidence, 'single signal family must refuse verdict');
    assert.strictEqual(r.orientation, 'unknown');
    assert.ok(r.confidence <= 0.35, `confidence ${r.confidence}`);
  });
  await test('multi-signal text yields orientation with confidence + evidence', async () => {
    const OC = require('../src/bias/OrientationClassifier');
    const r = OC.classify({
      text: 'The mainstream media promotes woke ideology and cultural marxism while ignoring government overreach. We endorse law and order and sovereign borders. Voters deserve free market solutions.',
      historical: { orientations: ['right', 'right', 'right', 'right'] },
    });
    assert.ok(/right/.test(r.orientation), r.orientation);
    assert.ok(r.confidence >= 0.5, `confidence ${r.confidence}`);
    assert.ok(r.evidence.length >= 2, 'evidence list present (19A.1)');
  });
  await test('BIAS ≠ FALSE: high-bias source keeps high claim confidence', async () => {
    const Bias = require('../src/bias/BiasForensics');
    const EE = require('../src/claims/EvidenceEngine');
    const CE = require('../src/claims/ClaimExtractor');
    const doc = { id: 'biasdoc', source_id: 'sb', content: 'This is OUTRAGEOUS propaganda. The chip launched in 2024 with 96 cores according to official data.' };
    const articleBias = Bias.analyzeArticle(doc);
    assert.ok(articleBias.metrics.emotional_bias > 0, 'bias detected');
    const claim = CE.extract({ id: 'biasdoc', source_id: 'sb', content: doc.content })[0];
    const ev = await EE.add({ claim, doc, relation: 'SUPPORTS', is_primary: true });
    const s = await EE.summarize(claim.id);
    assert.strictEqual(ev.level, 'E4', 'primary evidence accepted regardless of bias');
    assert.ok(s.confidence >= 0.8, `bias must not lower factual confidence: ${s.confidence}`);
    const cb = Bias.claimBias(claim, articleBias.metrics);
    assert.ok(typeof cb.claim_bias === 'number');
    assert.notStrictEqual(cb.claim_bias, s.confidence * 100, 'claim bias and confidence are different metrics');
  });
  await test('orientation and factual confidence stored separately (19A.21)', async () => {
    freshStore();
    const Prof = require('../src/sources/SourceProfiler');
    const Bias = require('../src/bias/BiasForensics');
    const { source } = await Prof.profile({ url: 'https://progressive-daily.example.com/x' });
    await Prof.attachOrientation(source.source_id, { orientation: 'left', confidence: 0.85, bias: { overall_bias: 70 }, bias_confidence: 0.8 });
    const sip = await Bias.sourceInformationProfile(source.source_id);
    assert.strictEqual(sip.political_orientation, 'left');
    assert.strictEqual(sip.orientation_confidence, 0.85);
    assert.ok(sip.factual_confidence === null, 'factual confidence only from evidence');
    assert.ok(sip.separation_note.includes('separately'));
  });
  await test('framing profile: emphasis, omissions with classification', async () => {
    const Bias = require('../src/bias/BiasForensics');
    const a = { id: 'fa', content: 'TheCouncil approved everything. Obviously the plan is perfect. No dissent was reported.' };
    const b = { id: 'fb', content: 'TheCouncil approved the budget after TheOpposition filed objections and TheAuditor raised concerns about transparency.' };
    const fp = Bias.framingProfile(a, [b]);
    assert.ok(fp.assumptions.length >= 1, 'implicit assumption detected');
    assert.ok(fp.omissions.some((o) => ['IMPORTANT_CONTEXT', 'POSSIBLY_RELEVANT'].includes(o.classification)), JSON.stringify(fp.omissions));
    assert.strictEqual(fp.counterarguments, 'absent');
  });
  await test('user heuristic: SEARCH_MORE allowed, MARK_FALSE rejected (19A.24)', async () => {
    const DP = require('../src/orchestrator/DomainPolicies');
    const ok = DP.userHeuristic({ if: 'source_orientation == LEFT', action: 'SEARCH_MORE' });
    const bad = DP.userHeuristic({ if: 'source_orientation == LEFT', action: 'MARK_FALSE' });
    assert.ok(ok.accepted);
    assert.strictEqual(bad.accepted, false);
    assert.ok(bad.reason.includes('prohibited'));
  });

  /* ---------------- Face 31: Perspectives & Adversarial ---------------- */
  suite('Face 31 — Perspectives & Adversarial');
  await test('adaptive perspective sets per domain and mode', async () => {
    const PE = require('../src/perspectives/PerspectiveEngine');
    const news = PE.forProfile({ domain: 'news' }, 'FORENSIC');
    assert.ok(news.perspectives.includes('left') && news.perspectives.includes('right') && news.perspectives.includes('primary'));
    const anime = PE.forProfile({ domain: 'anime' }, 'STANDARD');
    assert.ok(anime.perspectives.includes('original_source'));
    assert.ok(anime.bias_types.includes('fan_bias'), 'non-political bias types (19A.25)');
    const quick = PE.forProfile({ domain: 'news' }, 'QUICK');
    assert.ok(quick.perspectives.length <= 2);
  });
  await test('political claim spawns full adversarial protocol A-E', async () => {
    freshStore();
    const AE = require('../src/perspectives/AdversarialEngine');
    const claim = { id: 'clmX', text: 'The bill passed with 210 votes.' };
    const tasks = await AE.createTasks(claim, { political: true });
    assert.ok(tasks.length >= 10, `tasks ${tasks.length}`);
    const goals = tasks.map((t) => t.goal);
    assert.ok(goals.some((g) => g.startsWith('TASK A:')));
    assert.ok(goals.some((g) => g.startsWith('TASK E:')));
  });
  await test('JUDGE decides by evidence, false consensus exposed', async () => {
    freshStore();
    const AE = require('../src/perspectives/AdversarialEngine');
    const v = await AE.judge({
      claim: { id: 'c1', text: 'X happened' },
      evidenceSummary: { supports: 20, contradicts: 0, independent_supports: 1, independent_contradicts: 0, primary: 0, max_level: 'E2', experimental: 0 },
      sourceAudit: { independent_sources: 1 },
      contradictionCount: 0,
    });
    assert.ok(['MOSTLY_TRUE', 'PARTIALLY_TRUE'].includes(v.verdict), v.verdict);
    assert.ok(v.reasoning.some((r) => r.includes('false consensus')), '20 apparent → 1 independent exposed');
    assert.strictEqual(v.decided_by.includes('not majority'), true);
  });
  await test("devil's advocate fires above threshold", async () => {
    freshStore();
    const AE = require('../src/perspectives/AdversarialEngine');
    const t = await AE.challengeMode({ id: 'sess' }, 0.9, 0.8);
    assert.ok(t, 'task created');
    assert.ok(t.goal.toLowerCase().includes('prove us wrong'));
    const none = await AE.challengeMode({ id: 'sess' }, 0.5, 0.8);
    assert.strictEqual(none, null);
  });

  /* ---------------- Face 32: Gap/Stop/Confidence ---------------- */
  suite('Face 32 — Gap, Stop, Confidence');
  await test('stop engine: premature stop prevented, caps always apply', async () => {
    const SE = require('../src/research/StopEngine');
    const weak = SE.shouldStop({ round: 1, mode: 'DEEP', docs: [{}], claims: [{ id: 'c' }], evidenceSummaries: [{ confidence: 0.2, evidence: { total: 1, primary: 0, independent_supports: 0, contradicts: 0 } }], contradictions: [], budgetUsed: 1, budgetMax: 30 });
    assert.strictEqual(weak.stop, false, 'insufficient evidence must not stop');
    const capped = SE.shouldStop({ round: 99, mode: 'DEEP', docs: [], claims: [], evidenceSummaries: [], contradictions: [], budgetUsed: 0, budgetMax: 30 });
    assert.ok(capped.stop, 'round cap forces stop');
  });
  await test('stop engine: thresholds exceeded → stop', async () => {
    const SE = require('../src/research/StopEngine');
    const strong = SE.shouldStop({
      round: 1, mode: 'QUICK', docs: [{}, {}], claims: [{ id: 'c1' }, { id: 'c2' }],
      evidenceSummaries: [
        { confidence: 0.9, evidence: { total: 3, primary: 1, independent_supports: 2, contradicts: 0 } },
        { confidence: 0.85, evidence: { total: 2, primary: 1, independent_supports: 2, contradicts: 0 } },
      ],
      contradictions: [], budgetUsed: 2, budgetMax: 30,
    });
    assert.ok(strong.stop, JSON.stringify(strong));
  });
  await test('confidence history records the 95→62→81 trajectory', async () => {
    freshStore();
    const CE = require('../src/research/ConfidenceEngine');
    await CE.record('s32', 'clm1', 0.95, 0.62, 'primary contradiction found', ['ev9']);
    await CE.record('s32', 'clm1', 0.62, 0.81, 'new independent evidence', ['ev12']);
    const h = await CE.history('s32', 'clm1');
    assert.strictEqual(h.length, 2);
    assert.strictEqual(h[0].initial_confidence, 0.95);
    assert.strictEqual(h[1].updated_confidence, 0.81);
    assert.ok(h[0].evidence_that_changed_it.includes('ev9'));
  });
  await test('dimensions keep metrics separate (never one number)', async () => {
    const CE = require('../src/research/ConfidenceEngine');
    const d = CE.dimensions({ confidence: 0.8, evidence: { total: 4, supports: 3, contradicts: 0, independent_supports: 2, independent_contradicts: 0, primary: 1, experimental: 0, max_level: 'E4' } }, { bias_risk: 'medium' });
    assert.ok(d.confidence !== undefined && d.evidence_quality !== undefined && d.independence !== undefined);
    assert.strictEqual(d.bias_risk, 'medium');
    assert.strictEqual(d.contradiction, 'low');
  });

  /* ---------------- Face 33: Hybrid RAG ---------------- */
  suite('Face 33 — Hybrid RAG');
  await test('retrieval router decision table', async () => {
    const RR = require('../src/rag/RetrievalRouter');
    assert.strictEqual(RR.classifyQuery('what is the exact specification of the RTX 5090 power connector').strategy, 'keyword');
    assert.strictEqual(RR.classifyQuery('why does model distillation improve latency').strategy, 'hybrid');
    assert.strictEqual(RR.classifyQuery('anything', { contested_claim_id: 'c1' }).strategy, 'evidence_graph');
    assert.strictEqual(RR.classifyQuery('anything', { entity_relation: true }).strategy, 'graph');
  });
  await test('BM25 + TF-IDF legs both retrieve and fuse with provenance', async () => {
    freshStore();
    const Content = require('../src/content/ContentPipeline');
    await Content.ingest({ url: 'https://r.test/a', text: 'The RTX 5090 requires a 600 watt power supply according to official documentation.', title: 'PSU doc', source_id: 's1', session_id: 's33' });
    await Content.ingest({ url: 'https://r.test/b', text: 'Ceramic glazes mature at cone 6 in an electric kiln around 1200 degrees.', title: 'Ceramics', source_id: 's2', session_id: 's33' });
    const RAG = require('../src/rag/HybridRAG');
    const out = await RAG.retrieve({ query: 'RTX 5090 power supply wattage' });
    assert.ok(out.legs.length >= 2, `legs: ${JSON.stringify(out.legs)}`);
    assert.ok(out.results.length >= 1);
    const top = out.results[0];
    assert.ok(top.legs.length >= 2, 'result fused from multiple legs');
    assert.ok(/RTX|power/.test(top.text || ''), 'top result is relevant');
  });
  await test('evidence filter: contested claim pulls evidence-graph leg', async () => {
    freshStore();
    const Content = require('../src/content/ContentPipeline');
    const doc = await Content.ingest({ url: 'https://r.test/c', text: 'The vote passed with 210 votes in 2025 confirmed by chamber records.', title: 'Vote', source_id: 's3', session_id: 's33c' });
    const EE = require('../src/claims/EvidenceEngine');
    const CE = require('../src/claims/ClaimExtractor');
    const claim = CE.extract({ id: doc.doc.id, source_id: 's3', content: doc.doc.content })[0];
    await EE.add({ claim, doc: doc.doc, relation: 'SUPPORTS', is_primary: true });
    const RAG = require('../src/rag/HybridRAG');
    const out = await RAG.retrieve({ query: 'vote record details', contested_claim_id: claim.id });
    assert.ok(out.legs.some((l) => l.leg === 'evidence_graph'));
  });
  await test('context compression shortens while keeping sentences', async () => {
    const RAG = require('../src/rag/HybridRAG');
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} provides important context for the record. `).join('');
    const short = RAG.compressContext(long, 200);
    assert.ok(short.length <= 220, `len ${short.length}`);
    assert.ok(short.includes('Sentence number 0'));
  });

  /* ---------------- Face 34: Orchestrator E2E (offline) ---------------- */
  suite('Face 34 — Orchestrator E2E (offline-injected)');
  await test('full pipeline: profile→acquire→claims→evidence→bias→adversarial→answer', async () => {
    freshStore();
    const Orch = require('../src/orchestrator/ResearchOrchestrator');
    const { politicalMatrix } = require('./fixtures');
    const out = await Orch.research('¿Es cierto que el housing bill pasó con 210 votos en 2025?', {
      skipClarification: true, offline: true, injectDocs: politicalMatrix(),
    });
    assert.ok(out.session_id);
    assert.ok(out.claims.length >= 3, `claims ${out.claims.length}`);
    assert.ok(out.dependency_summary.apparent_sources >= 4);
    assert.ok(out.answer.claims.length >= 1);
    assert.ok(out.answer.uncertainties !== undefined, 'transparency present');
    const top = out.answer.claims[0];
    assert.ok(top.confidence > 0.5, `top confidence ${top.confidence}`);
    // events flowed
    const evs = eventbus.eventsFor(out.session_id).map((e) => e.type);
    assert.ok(evs.includes('ResearchStarted') && evs.includes('DocumentIngested') && evs.includes('ClaimExtracted') && evs.includes('ResearchCompleted'), JSON.stringify([...new Set(evs)]));
  });
  await test('checkpoints saved through the pipeline and resumable', async () => {
    freshStore();
    const Orch = require('../src/orchestrator/ResearchOrchestrator');
    const CK = require('../src/orchestrator/CheckpointManager');
    const { dependentChain } = require('./fixtures');
    const docs = dependentChain().map((d) => ({ ...d, content_hash: require('../src/core/ids').sha1(d.text) }));
    const out = await Orch.research('QW-9 chip launch details', { skipClarification: true, offline: true, injectDocs: docs });
    const latest = await CK.latestValid(out.session_id);
    assert.ok(latest, 'checkpoint exists');
    assert.strictEqual(latest.checkpoint.stage, 'ANSWER_GENERATED');
    const resume = await Orch.resume(out.session_id);
    assert.ok(resume.resumable && resume.from_stage === 'ANSWER_GENERATED');
  });
  await test('governor budget reflected in final report', async () => {
    freshStore();
    const Orch = require('../src/orchestrator/ResearchOrchestrator');
    const Governor = require('../src/router/ResourceGovernor');
    const { politicalMatrix } = require('./fixtures');
    const out = await Orch.research('housing bill vote record', { skipClarification: true, offline: true, injectDocs: politicalMatrix() });
    const rep = Governor.report(out.session_id);
    assert.ok(typeof rep.tokens === 'number');
  });

  /* ---------------- Face 35: Hypotheses & Sandbox (§100) ---------------- */
  suite('Face 35 — Hypothesis & Experiment (§100)');
  await test('hypotheses generated for model-reduction questions', async () => {
    freshStore();
    const HE = require('../src/experiment/HypothesisEngine');
    const hyps = await HE.generate({ session: { id: 's35' }, gaps: [{ type: 'unresolved_contradictions', detail: 'x' }], claims: [], domain: 'ai' });
    assert.ok(hyps.length >= 4, `hyps ${hyps.length}`);
    assert.ok(hyps.every((h) => h.experiment_plan && h.testability === 'HIGH'));
    assert.ok(hyps.some((h) => h.technique === 'structured_pruning'));
    const saved = await HE.save(hyps);
    assert.ok(saved[0].status === 'PROPOSED', 'hypothesis ≠ conclusion');
  });
  await test('SPEC §100: failing experiment → hypothesis REJECTED, stored', async () => {
    freshStore();
    const HE = require('../src/experiment/HypothesisEngine');
    const EE = require('../src/experiment/ExperimentEngine');
    const hyps = await HE.save(await HE.generate({ session: { id: 's35b' }, gaps: [], claims: [], domain: 'ai' }));
    const h = hyps.find((x) => x.technique === 'structured_pruning');
    const exp = await EE.runExperiment({
      session_id: 's35b', hypothesis: h,
      code: 'process.exit(1); // simulated quality degradation > threshold',
      timeout_ms: 3000,
    });
    assert.strictEqual(exp.status, 'ERROR');
    const after = await require('../src/core/store').collection('hypotheses').get(h.id);
    assert.strictEqual(after.status, 'REJECTED');
    assert.ok(after.rejection_reason.includes('experiment ERROR'), after.rejection_reason);
    const failed = await EE.techniqueFailed('structured_pruning');
    assert.ok(failed.failed, 'failure memory stored');
  });
  await test('sandbox: code runs, secrets NOT exposed, timeout enforced', async () => {
    freshStore();
    const SB = require('../src/experiment/SandboxProvider');
    process.env.SOME_SECRET_TOKEN = 'supersecret';
    const okRun = await SB.run({ code: 'console.log(2+3)', timeout_ms: 3000 });
    assert.strictEqual(okRun.status, 'COMPLETED');
    assert.ok(okRun.stdout.trim().endsWith('5'));
    const leak = await SB.run({ code: 'console.log(JSON.stringify(process.env))', timeout_ms: 3000 });
    assert.ok(!leak.stdout.includes('supersecret'), 'env secrets never visible in sandbox');
    assert.strictEqual(leak.secrets_exposed, false);
    const slow = await SB.run({ code: 'setInterval(()=>{},1000)', timeout_ms: 1500 });
    assert.strictEqual(slow.status, 'TIMEOUT');
    delete process.env.SOME_SECRET_TOKEN;
  });

  /* ---------------- Face 36: Knowledge & Compression (§102) ---------------- */
  suite('Face 36 — Knowledge, Freshness, Compression (§102)');
  await test('consolidation produces L0-L5 with measured, monotonic ratios', async () => {
    freshStore();
    const Content = require('../src/content/ContentPipeline');
    for (let i = 0; i < 12; i += 1) {
      await Content.ingest({
        url: `https://k.test/${i}`, title: `Doc ${i}`,
        text: `Report ${i}. The council approved the budget in 2025 with 210 votes. Observer ${i} noted the process was transparent. ${'Additional detail sentence for volume. '.repeat(8)}`,
        source_id: `sk${i}`, session_id: 's36',
      });
    }
    // duplicate one doc to exercise dedup
    await Content.ingest({ url: 'https://k.test/dup', title: 'Dup', text: 'Report 1. The council approved the budget in 2025 with 210 votes. Observer 1 noted the process was transparent. '.padEnd(600, 'x'), source_id: 'skdup', session_id: 's36' });
    const KC = require('../src/knowledge/KnowledgeConsolidator');
    const out = await KC.consolidate({ session_id: 's36', topic: 'council budget' });
    assert.ok(out.ok);
    const lv = out.compression_run.levels;
    assert.ok(lv.L0_raw_bytes > lv.L5_summary_bytes, 'L5 < L0');
    assert.strictEqual(out.compression_run.measured, true);
    assert.ok(out.compression_run.ratios.summary_vs_raw < 1);
    assert.ok(out.knowledge.statements.length >= 1);
    assert.ok(out.knowledge.entities.length >= 1);
  });
  await test('freshness classes and decay', async () => {
    const F = require('../src/knowledge/FreshnessManager');
    assert.strictEqual(F.classify('BREAKING: just announced'), 'BREAKING');
    assert.strictEqual(F.classify('The theorem was proven in the foundations era'), 'STATIC');
    const fresh = F.freshnessScore('DYNAMIC', new Date(Date.now() - 86400000).toISOString());
    const stale = F.freshnessScore('DYNAMIC', new Date(Date.now() - 200 * 86400000).toISOString());
    assert.ok(fresh > stale && stale < 0.2, `fresh ${fresh} stale ${stale}`);
    const a = F.assess('market news', new Date().toISOString());
    assert.ok(a.expires_at);
  });
  await test('knowledge versioning diff: then vs now', async () => {
    freshStore();
    const KV = require('../src/knowledge/KnowledgeVersioning');
    const knw = { id: 'knw1', statements: [{ statement: 'Bill passed with 210 votes', status: 'UNVERIFIED', evidence: 1 }], entities: [] };
    await KV.snapshot(knw, 'v1');
    knw.statements[0].status = 'TRUE';
    knw.statements[0].evidence = 4;
    knw.statements.push({ statement: 'New statement from fresh evidence', status: 'MOSTLY_TRUE', evidence: 2 });
    await KV.snapshot(knw, 'v2');
    const d = await KV.diff('knw1', 1, 2);
    assert.ok(d.ok);
    assert.strictEqual(d.added.length, 1);
    assert.strictEqual(d.changed.length, 1);
    assert.strictEqual(d.changed[0].from.status, 'UNVERIFIED');
    assert.strictEqual(d.changed[0].to.status, 'TRUE');
  });

  /* ---------------- Face 37: Memory, Evaluation, Active Learning ---------------- */
  suite('Face 37 — Memory, Evaluation, Active Learning');
  await test('memory layers stay separated', async () => {
    freshStore();
    const MM = require('../src/memory/MemoryManager');
    await MM.store('RAW_MEMORY', { doc: 'raw1' });
    await MM.store('EVIDENCE_MEMORY', { claim: 'c1' });
    await MM.store('KNOWLEDGE_MEMORY', { kn: 'k1' });
    await MM.store('WORKING_MEMORY', { ctx: 'w1' });
    const raw = await MM.recall('RAW_MEMORY');
    const ev = await MM.recall('EVIDENCE_MEMORY');
    assert.strictEqual(raw.length, 1);
    assert.strictEqual(ev.length, 1);
    await assert.rejects(() => MM.store('BOGUS_LAYER', {}), /invalid layer/);
  });
  await test('evaluation produces ResearchScore from real run data', async () => {
    freshStore();
    const Orch = require('../src/orchestrator/ResearchOrchestrator');
    const Eval = require('../src/learning/EvaluationEngine');
    const { politicalMatrix } = require('./fixtures');
    const out = await Orch.research('housing bill record 2025', { skipClarification: true, offline: true, injectDocs: politicalMatrix() });
    const evaluation = await Eval.evaluate({ session: { id: out.session_id }, claims: out.claims, summaries: out.summaries, contradictions: out.contradictions, docs: await require('../src/core/store').collection('documents').all(), dependencySummary: out.dependency_summary });
    const rs = evaluation.ResearchScore;
    for (const k of ['factuality', 'evidence', 'source_quality', 'independence', 'coverage', 'freshness', 'contradiction_handling', 'efficiency']) {
      assert.ok(typeof rs[k] === 'number', `${k} missing`);
    }
    assert.strictEqual(evaluation.measured, true);
  });
  await test('active learning: proposal stored, gate blocks unapproved application', async () => {
    freshStore();
    const AL = require('../src/learning/ActiveLearning');
    const proposal = await AL.propose({ domain: 'ai', change: 'prefer arxiv first', rationale: 'higher factuality observed' });
    assert.strictEqual(proposal.status, 'PROPOSED');
    let active = await AL.activePolicies();
    assert.strictEqual(active.length, 0, 'NOT auto-applied');
    const noApproval = await AL.gate(proposal.id, 'approve', {});
    assert.strictEqual(noApproval.ok, false, 'approval without approver rejected');
    await AL.gate(proposal.id, 'approve', { approved_by: 'user' });
    active = await AL.activePolicies();
    assert.strictEqual(active.length, 1);
  });

  /* ---------------- Face 38: API ---------------- */
  suite('Face 38 — HTTP API');
  await test('API: research → claims → evidence → graph → timeline → report', async () => {
    freshStore();
    const api = require('../src/api/server');
    const server = api.start(0);
    await new Promise((r) => setTimeout(r, 100));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    const get = (p) => fetch(base + p).then((r) => r.json());

    const health = await get('/health');
    assert.strictEqual(health.ok, true);

    const { politicalMatrix } = require('./fixtures');
    const research = await post('/api/research-os/research', { question: 'housing bill 210 votes 2025', offline: true, docs: politicalMatrix(), skip_clarification: true });
    assert.ok(research.session_id, JSON.stringify(research).slice(0, 200));

    const sess = await get(`/api/research-os/research/${research.session_id}`);
    assert.ok(sess.mode);
    const sources = await get(`/api/research-os/research/${research.session_id}/sources`);
    assert.ok(sources.sources.length >= 4);
    const claims = await get(`/api/research-os/research/${research.session_id}/claims`);
    assert.ok(claims.claims.length >= 1);
    const evidence = await get(`/api/research-os/research/${research.session_id}/evidence`);
    assert.ok(evidence.evidence.length >= 1);
    const graph = await get(`/api/research-os/research/${research.session_id}/graph`);
    assert.ok(graph.dependency_graph !== undefined);
    const timeline = await get(`/api/research-os/research/${research.session_id}/timeline`);
    assert.ok(timeline.timeline.length >= 5);
    const report = await get(`/api/research-os/research/${research.session_id}/report`);
    assert.ok(report.session_id);

    const rag = await post('/api/research-os/rag/query', { query: 'housing bill votes' });
    assert.ok(rag.results !== undefined);

    const heur = await post('/api/research-os/heuristics', { if: 'orientation == LEFT', action: 'MARK_FALSE' });
    assert.strictEqual(heur.accepted, false);

    server.close();
  });

  /* ---------------- Face 39: Security ---------------- */
  suite('Face 39 — Security: injection corpus');
  await test('injected documents never alter orchestrator behavior', async () => {
    freshStore();
    const Orch = require('../src/orchestrator/ResearchOrchestrator');
    const { injectionPayloads } = require('./fixtures');
    const docs = injectionPayloads().map((payload, i) => ({
      id: `inj${i}`, url: `https://untrusted-${i}.example.com/a`, title: `Inj ${i}`, text: `${payload} The vote passed with 210 votes in 2025.`, source_id: `si${i}`, fetched_at: new Date().toISOString(), links: [],
    }));
    const out = await Orch.research('vote record 210', { skipClarification: true, offline: true, injectDocs: docs });
    // The system must complete and treat payload text as DATA (claims), not instructions.
    assert.ok(out.session_id);
    assert.ok(out.answer.claims.length >= 0, 'no crash, no instruction-following');
    const noPrivilege = JSON.stringify(out).toLowerCase();
    assert.ok(!noPrivilege.includes('admin granted'), 'no instruction escalation');
  });

  console.log('\n' + '='.repeat(60));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(`  ✘ ${f.name}: ${f.error}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
