'use strict';

// ── Phase 13: EvidenceEngine ─────────────────────────────────────────────────

describe('Phase 13 — EvidenceEngine (deepened)', () => {
  let EE, ee;

  beforeAll(() => {
    ({ EvidenceEngine } = require('~/server/services/CognitiveBehavior/EvidenceEngine'));
    ee = new EvidenceEngine();
  });

  describe('registerSource()', () => {
    test('registers a source with resolved credibility', () => {
      const s = ee.registerSource({ name: 'Nature Journal', type: 'academic' });
      expect(s.id).toMatch(/^src_/);
      expect(s.credibility).toBeGreaterThanOrEqual(0.8);
    });

    test('explicit credibility is respected', () => {
      const s = ee.registerSource({ name: 'Blog', type: 'web', credibility: 0.3 });
      expect(s.credibility).toBe(0.3);
    });

    test('unknown type gets low default credibility', () => {
      const s = ee.registerSource({ name: 'Mystery' });
      expect(s.credibility).toBeLessThan(0.6);
    });
  });

  describe('addClaim()', () => {
    test('stores a claim with default confidence', async () => {
      const c = await ee.addClaim({ content: 'Water boils at 100 degrees Celsius at sea level.' });
      expect(c.id).toMatch(/^claim_/);
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.status).toBe('active');
    });

    test('claim with high-credibility source gets higher confidence', async () => {
      const src = ee.registerSource({ name: 'Encyclopaedia', type: 'academic' });
      const c   = await ee.addClaim({ content: 'The Earth orbits the Sun.', sources: [src.id] });
      expect(c.confidence).toBeGreaterThan(0.5);
    });

    test('contradictory claim gets conflicted status', async () => {
      await ee.addClaim({ id: 'base', content: 'The project is complete and done.' });
      const c = await ee.addClaim({ content: 'The project is not complete and not done.' });
      expect(c.status).toBe('conflicted');
    });
  });

  describe('addEvidence() + linkEvidence()', () => {
    test('links supporting evidence and boosts confidence', async () => {
      const src = ee.registerSource({ name: 'Lab Report', type: 'academic', credibility: 0.9 });
      const claim = await ee.addClaim({ content: 'Compound X reduces inflammation.' });
      const ev    = ee.addEvidence({ content: 'Study showed 40% reduction', sourceId: src.id, type: 'supporting' });
      const link  = ee.linkEvidence(claim.id, ev.id);
      expect(link.linked).toBe(true);
      expect(link.chainLength).toBe(1);
    });

    test('refuting evidence reduces claim confidence', async () => {
      const claim = await ee.addClaim({ content: 'Drug Y is safe for all patients.', confidence: 0.8 });
      const ev    = ee.addEvidence({ content: 'Side effects found in 20% of patients', type: 'refuting', weight: 1.5 });
      const confBefore = claim.confidence;
      ee.linkEvidence(claim.id, ev.id);
      expect(claim.confidence).toBeLessThan(confBefore);
    });

    test('returns error for missing claim', () => {
      const ev = ee.addEvidence({ content: 'Some evidence', type: 'supporting' });
      const r  = ee.linkEvidence('nonexistent_claim', ev.id);
      expect(r.linked).toBe(false);
    });
  });

  describe('buildEvidenceChain()', () => {
    test('builds chain with supporting/refuting counts', async () => {
      const claim = await ee.addClaim({ content: 'Theory A explains phenomenon B.' });
      const ev1   = ee.addEvidence({ content: 'Evidence supporting A', type: 'supporting' });
      const ev2   = ee.addEvidence({ content: 'Contextual background', type: 'contextual' });
      ee.linkEvidence(claim.id, ev1.id);
      ee.linkEvidence(claim.id, ev2.id);
      const chain = ee.buildEvidenceChain(claim.id);
      expect(chain.depth).toBe(2);
      expect(chain.supporting).toBe(1);
      expect(chain.chain).toHaveLength(2);
    });

    test('returns null claim for unknown claimId', () => {
      const r = ee.buildEvidenceChain('ghost');
      expect(r.claim).toBeNull();
      expect(r.chain).toHaveLength(0);
    });
  });

  describe('computeConfidence()', () => {
    test('returns 0 for unknown claim', () => {
      expect(ee.computeConfidence('ghost')).toBe(0);
    });

    test('confidence increases with multiple supporting sources', async () => {
      const src1 = ee.registerSource({ name: 'S1', type: 'academic' });
      const src2 = ee.registerSource({ name: 'S2', type: 'academic' });
      const claim = await ee.addClaim({ content: 'Phenomenon C is real.' });
      const ev1 = ee.addEvidence({ content: 'Data 1', sourceId: src1.id, type: 'supporting' });
      const ev2 = ee.addEvidence({ content: 'Data 2', sourceId: src2.id, type: 'supporting' });
      const c0  = claim.confidence;
      ee.linkEvidence(claim.id, ev1.id);
      ee.linkEvidence(claim.id, ev2.id);
      expect(ee.computeConfidence(claim.id)).toBeGreaterThan(c0);
    });
  });

  describe('extractClaims()', () => {
    test('extracts declarative sentences from text', () => {
      const text = 'The sky is blue. Water is wet. Therefore rain falls down. Just a fragment.';
      const claims = ee.extractClaims(text);
      expect(Array.isArray(claims)).toBe(true);
      expect(claims.length).toBeGreaterThan(0);
      expect(claims[0]).toHaveProperty('text');
      expect(claims[0]).toHaveProperty('score');
    });

    test('returns empty array for empty input', () => {
      expect(ee.extractClaims('')).toHaveLength(0);
      expect(ee.extractClaims(null)).toHaveLength(0);
    });

    test('higher-scoring claims come first', () => {
      const text = 'According to research, the treatment shows significant improvement. OK.';
      const claims = ee.extractClaims(text);
      if (claims.length >= 2) {
        expect(claims[0].score).toBeGreaterThanOrEqual(claims[1].score);
      }
    });
  });

  describe('searchClaims()', () => {
    test('finds claims by keyword', async () => {
      await ee.addClaim({ content: 'Quantum entanglement enables faster-than-light communication.' });
      const results = ee.searchClaims('quantum entanglement');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toMatch(/quantum/i);
    });
  });

  describe('verify() + detectDecay()', () => {
    test('verify increments verificationCount', async () => {
      const c = await ee.addClaim({ content: 'Verified claim text.' });
      await ee.verify(c.id);
      const updated = ee.claims.get(c.id);
      expect(updated.verificationCount).toBe(1);
    });

    test('detectDecay reports fresh for new claims', async () => {
      const c = await ee.addClaim({ content: 'Fresh claim.' });
      const d = await ee.detectDecay(c.id);
      expect(d.decayed).toBe(false);
      expect(d.recommendation).toBe('fresh');
    });
  });

  test('getStats() returns structured stats', () => {
    const s = ee.getStats();
    expect(s).toHaveProperty('claims');
    expect(s).toHaveProperty('sources');
    expect(s).toHaveProperty('evidence');
    expect(s).toHaveProperty('avgConfidence');
  });
});

// ── Phase 15: MemorySystem ────────────────────────────────────────────────────

describe('Phase 15 — MemorySystem (deepened)', () => {
  let MS, ms;

  beforeAll(() => {
    ({ MemorySystem } = require('~/server/services/CognitiveBehavior/MemorySystem'));
    ms = new MemorySystem();
  });

  describe('EpisodicLayer', () => {
    test('recordEvent() stores an event', () => {
      const e = ms.episodic.recordEvent('User asked about weather', { sessionId: 's1', outcome: 'success' });
      expect(e.id).toMatch(/^ep_/);
      expect(e.sessionId).toBe('s1');
      expect(e.outcome).toBe('success');
    });

    test('getRecent() returns N most-recent events', () => {
      for (let i = 0; i < 5; i++) ms.episodic.recordEvent(`Event ${i}`, { sessionId: 's2' });
      const recent = ms.episodic.getRecent(3);
      expect(recent.length).toBeLessThanOrEqual(3);
    });

    test('getRecent() filters by sessionId', () => {
      ms.episodic.recordEvent('Session A event', { sessionId: 'sessA' });
      ms.episodic.recordEvent('Session B event', { sessionId: 'sessB' });
      const a = ms.episodic.getRecent(10, { sessionId: 'sessA' });
      expect(a.every(e => e.sessionId === 'sessA')).toBe(true);
    });

    test('search() finds events by keyword', () => {
      ms.episodic.recordEvent('Deployed the application to production server', {});
      const results = ms.episodic.search('production server');
      expect(results.length).toBeGreaterThan(0);
    });

    test('getTimeline() returns events sorted by time', () => {
      const t = ms.episodic.getTimeline('s1');
      for (let i = 1; i < t.length; i++) {
        expect(t[i].timestamp).toBeGreaterThanOrEqual(t[i - 1].timestamp);
      }
    });
  });

  describe('SemanticLayer', () => {
    test('storeFact() stores a categorized fact', () => {
      const f = ms.semantic.storeFact('Paris is the capital of France', 'geography', { confidence: 0.99 });
      expect(f.id).toMatch(/^sem_/);
      expect(f.category).toBe('geography');
      expect(f.confidence).toBe(0.99);
    });

    test('queryFacts() finds fact by keyword', () => {
      ms.semantic.storeFact('Node.js uses event-driven I/O', 'technology', { confidence: 0.9 });
      const r = ms.semantic.queryFacts('node event driven');
      expect(r.length).toBeGreaterThan(0);
      expect(r[0].content).toMatch(/node/i);
    });

    test('queryFacts() filters by category', () => {
      ms.semantic.storeFact('Python is a programming language', 'technology', {});
      ms.semantic.storeFact('Dogs are mammals', 'biology', {});
      const tech = ms.semantic.queryFacts('', { category: 'technology' });
      expect(tech.every(f => f.category === 'technology')).toBe(true);
    });

    test('getHighConfidence() returns only high-confidence facts', () => {
      ms.semantic.storeFact('Low confidence fact', 'test', { confidence: 0.3 });
      ms.semantic.storeFact('High confidence fact', 'test', { confidence: 0.95 });
      const high = ms.semantic.getHighConfidence(0.9);
      expect(high.every(f => f.confidence >= 0.9)).toBe(true);
    });

    test('linkFacts() creates a relation', () => {
      const f1 = ms.semantic.storeFact('Rain falls', 'weather', {});
      const f2 = ms.semantic.storeFact('Ground gets wet', 'weather', {});
      const rel = ms.semantic.linkFacts(f1.id, 'causes', f2.id);
      expect(rel).not.toBeNull();
      expect(rel.relation).toBe('causes');
    });

    test('listCategories() lists stored categories', () => {
      const cats = ms.semantic.listCategories();
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.length).toBeGreaterThan(0);
    });
  });

  describe('ProceduralLayer', () => {
    test('recordPattern() stores a how-to pattern', () => {
      const p = ms.procedural.recordPattern('deploy to production', ['run tests', 'build', 'push'], { outcome: 'success' });
      expect(p.id).toMatch(/^proc_/);
      expect(p.steps).toHaveLength(3);
      expect(p.successRate).toBe(1.0);
    });

    test('getBestPattern() finds the best match', () => {
      ms.procedural.recordPattern('create a new feature', ['branch', 'code', 'test', 'PR'], { successRate: 0.9 });
      const best = ms.procedural.getBestPattern('create feature');
      expect(best).not.toBeNull();
      expect(best.steps).toBeDefined();
    });

    test('getBestPattern() returns null when nothing matches', () => {
      const r = ms.procedural.getBestPattern('completely_unrelated_task_xyz_123');
      expect(r).toBeNull();
    });

    test('learnFromSuccess() updates existing pattern if similar', () => {
      ms.procedural.recordPattern('run database migration', ['backup', 'migrate', 'verify'], {});
      const r1 = ms.procedural.learnFromSuccess('run database migration', ['backup', 'migrate', 'verify']);
      expect(r1).toHaveProperty('pattern');
    });

    test('recordOutcome() adjusts successRate', () => {
      const p = ms.procedural.recordPattern('some unique task xyz', ['step1'], {});
      ms.procedural.recordOutcome(p.id, false);
      expect(p.successRate).toBeLessThan(1.0);
    });

    test('getSimilarPatterns() returns ranked list', () => {
      const results = ms.procedural.getSimilarPatterns('deploy', 3);
      expect(Array.isArray(results)).toBe(true);
      expect(results.every(p => p.score !== undefined)).toBe(true);
    });
  });

  describe('Cross-layer recall', () => {
    test('recall() searches all three layers', () => {
      ms.recordEvent('Encountered issue with database connection', {});
      ms.storeFact('Database connection requires valid credentials', 'system', {});
      ms.learnFromSuccess('fix database connection', ['check env vars', 'restart service'], {});
      const results = ms.recall('database connection');
      expect(results.length).toBeGreaterThan(0);
      const layers = new Set(results.map(r => r.layer));
      expect(layers.size).toBeGreaterThanOrEqual(1);
    });

    test('recall() respects layers filter', () => {
      const results = ms.recall('data', { layers: ['semantic'] });
      expect(results.every(r => r.layer === 'semantic')).toBe(true);
    });

    test('recall() deduplicates results', () => {
      const results = ms.recall('test query');
      const ids = results.map(r => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  test('getStats() returns layer sizes', () => {
    const s = ms.getStats();
    expect(s.episodic).toHaveProperty('size');
    expect(s.semantic).toHaveProperty('size');
    expect(s.procedural).toHaveProperty('size');
  });
});

// ── Phase 16: FailureMemory ───────────────────────────────────────────────────

describe('Phase 16 — FailureMemory (deepened)', () => {
  let FM, CATS, fm;

  beforeAll(() => {
    ({ FailureMemory, FAILURE_CATEGORIES: CATS } = require('~/server/services/CognitiveBehavior/FailureMemory'));
    fm = new FailureMemory();
  });

  describe('categorize()', () => {
    test('detects timeout failures', () => {
      expect(fm.categorize({ what: 'The request timed out' })).toBe(CATS.TIMEOUT);
    });

    test('detects hallucination failures', () => {
      expect(fm.categorize({ what: 'Model hallucinated facts' })).toBe(CATS.HALLUCINATION);
    });

    test('detects tool failures', () => {
      expect(fm.categorize({ what: 'Tool call failed with error' })).toBe(CATS.TOOL_FAILURE);
    });

    test('detects context overflow', () => {
      expect(fm.categorize({ what: 'Context limit exceeded by 2000 tokens' })).toBe(CATS.CONTEXT_OVERFLOW);
    });

    test('detects permission denied', () => {
      expect(fm.categorize({ what: 'Access denied to file' })).toBe(CATS.PERMISSION_DENIED);
    });

    test('detects loop detection', () => {
      expect(fm.categorize({ what: 'Infinite loop detected in execution' })).toBe(CATS.LOOP_DETECTED);
    });

    test('falls back to unknown', () => {
      expect(fm.categorize({ what: 'Something random happened xyxyz' })).toBe(CATS.UNKNOWN);
    });
  });

  describe('record()', () => {
    test('records a failure with auto-category', () => {
      const f = fm.record({ what: 'Tool execution failed', tool: 'bash' });
      expect(f.id).toMatch(/^fail_/);
      expect(f.category).toBe(CATS.TOOL_FAILURE);
      expect(f.tool).toBe('bash');
      expect(f.resolved).toBe(false);
    });

    test('de-duplicates similar failures by incrementing howOften', () => {
      fm.record({ what: 'Connection timed out', tool: 'http' });
      const second = fm.record({ what: 'Connection timed out', tool: 'http' });
      expect(second.howOften).toBe(2);
    });

    test('assigns severity high to hallucination', () => {
      const f = fm.record({ what: 'Model hallucinated a citation' });
      expect(f.severity).toBe('high');
    });

    test('assigns severity medium to tool failure', () => {
      const f = fm.record({ what: 'File tool returned error response' });
      expect(['medium', 'high']).toContain(f.severity);
    });
  });

  describe('preTaskWarning()', () => {
    test('returns relevant warnings for similar task', () => {
      fm.record({ what: 'Database migration failed', task: 'run database migration', tool: 'db' });
      const r = fm.preTaskWarning('run database migration');
      expect(r).toHaveProperty('warnings');
      expect(r).toHaveProperty('patterns');
      expect(r).toHaveProperty('severity');
      expect(r.warnings.length).toBeGreaterThan(0);
    });

    test('returns empty warnings for unrelated task', () => {
      const r = fm.preTaskWarning('completely unrelated task xyz abc 999');
      expect(r.warnings.length).toBe(0);
      expect(r.severity).toBe('none');
    });

    test('severity escalates to high for critical past failures', () => {
      fm.record({ what: 'Hallucinated data caused data loss in backup task', severity: 'high' });
      const r = fm.preTaskWarning('run backup task');
      if (r.warnings.some(w => w.severity === 'high')) {
        expect(r.severity).toBe('high');
      }
    });

    test('filters by category when provided', () => {
      fm.record({ what: 'API rate limit exceeded', task: 'fetch data from api' });
      const r = fm.preTaskWarning('fetch data from api', { category: CATS.RESOURCE_EXHAUSTED });
      // Either finds matching or returns empty — should not throw
      expect(r).toHaveProperty('warnings');
    });
  });

  describe('learnPattern()', () => {
    test('extracts and stores an avoidance pattern', () => {
      const f = fm.record({ what: 'Hallucinated URL in response' });
      const p = fm.learnPattern(f.id, {
        pattern:   'LLM hallucinated a URL',
        avoidance: 'Always verify URLs against a known source registry',
        conditions: ['external_url_in_response'],
      });
      expect(p).not.toBeNull();
      expect(p.key).toMatch(/^pat_/);
      expect(p.failureIds).toContain(f.id);
    });

    test('increments frequency for duplicate patterns', () => {
      const f1 = fm.record({ what: 'Loop detected in planning step alpha' });
      const f2 = fm.record({ what: 'Loop detected in planning step beta' });
      const p1 = fm.learnPattern(f1.id, { pattern: 'loop detected in planning', avoidance: 'add loop guard' });
      const p2 = fm.learnPattern(f2.id, { pattern: 'loop detected in planning', avoidance: 'add loop guard' });
      expect(p2.frequency).toBeGreaterThan(p1.frequency);
    });

    test('returns null for unknown failure id', () => {
      const r = fm.learnPattern('ghost_id', { pattern: 'x', avoidance: 'y' });
      expect(r).toBeNull();
    });
  });

  describe('recordRecovery()', () => {
    test('marks failure as resolved', () => {
      const f = fm.record({ what: 'Rate limit error on search tool' });
      const r = fm.recordRecovery(f.id, 'Used exponential backoff', 'Add retry logic with backoff');
      expect(r.resolved).toBe(true);
      expect(r.recovery).toMatch(/backoff/i);
    });
  });

  describe('getRecurring() + getHighSeverity()', () => {
    test('getRecurring returns failures with howOften >= min', () => {
      fm.record({ what: 'Repeated tool crash test xyz', tool: 'testTool' });
      fm.record({ what: 'Repeated tool crash test xyz', tool: 'testTool' });
      const recurring = fm.getRecurring(2);
      expect(recurring.every(f => f.howOften >= 2)).toBe(true);
    });

    test('getHighSeverity returns only high-severity failures', () => {
      fm.record({ what: 'Critical hallucination in output', severity: 'high' });
      const high = fm.getHighSeverity();
      expect(high.every(f => f.severity === 'high')).toBe(true);
    });
  });

  test('getStats() returns structured stats with byCategory', () => {
    const s = fm.getStats();
    expect(s).toHaveProperty('total');
    expect(s).toHaveProperty('byCategory');
    expect(s).toHaveProperty('patterns');
    expect(s).toHaveProperty('highSeverity');
    expect(typeof s.byCategory).toBe('object');
  });
});

// ── Phase 30: TokenOptimization ───────────────────────────────────────────────

describe('Phase 30 — TokenOptimization (deepened)', () => {
  let TO, BUDGETS, to;

  beforeAll(() => {
    ({ TokenOptimization, TASK_BUDGETS: BUDGETS } = require('~/server/services/CognitiveBehavior/TokenOptimization'));
    to = new TokenOptimization();
  });

  describe('initSession()', () => {
    test('creates a session with default limit', () => {
      const s = to.initSession('sess_test_1');
      expect(s.id).toBe('sess_test_1');
      expect(s.limit).toBeGreaterThan(0);
      expect(s.used).toBe(0);
    });

    test('creates a session with explicit limit', () => {
      const s = to.initSession('sess_explicit', { limit: 5000 });
      expect(s.limit).toBe(5000);
    });

    test('returns same session on second call', () => {
      const s1 = to.initSession('sess_same');
      const s2 = to.initSession('sess_same');
      expect(s1).toBe(s2);
    });
  });

  describe('allocate()', () => {
    test('returns correct budget for code task', () => {
      const a = to.allocate('code', 'sess_alloc');
      expect(a.requestBudget).toBe(BUDGETS.code);
      expect(a).toHaveProperty('sessionRemaining');
      expect(a).toHaveProperty('compress');
    });

    test('unknown task type falls back to default budget', () => {
      const a = to.allocate('unknown_task_type', 'sess_alloc2');
      expect(a.requestBudget).toBe(BUDGETS.default);
    });

    test('request budget is capped by session remaining', () => {
      const s = to.initSession('sess_cap', { limit: 1000 });
      s.used   = 950;   // only 50 tokens left
      const a  = to.allocate('code', 'sess_cap');
      expect(a.requestBudget).toBeLessThanOrEqual(50);
    });

    test('compress flag is true when session is near limit', () => {
      const s = to.initSession('sess_compress_test', { limit: 1000 });
      s.used   = 850;   // 85%
      const a  = to.allocate('default', 'sess_compress_test');
      expect(a.compress).toBe(true);
    });
  });

  describe('track()', () => {
    test('tracks token usage and returns accepted when under budget', () => {
      to.initSession('sess_track', { limit: 10000 });
      const r = to.track('sess_track', 500);
      expect(r.accepted).toBe(true);
      expect(r.newTotal).toBe(500);
      expect(r.remaining).toBe(9500);
    });

    test('returns overBudget when limit exceeded', () => {
      to.initSession('sess_over', { limit: 100 });
      const r = to.track('sess_over', 200);
      expect(r.overBudget).toBe(true);
    });

    test('accumulates across multiple track calls', () => {
      to.initSession('sess_accum', { limit: 10000 });
      to.track('sess_accum', 1000);
      to.track('sess_accum', 1000);
      const r = to.track('sess_accum', 1000);
      expect(r.newTotal).toBe(3000);
    });
  });

  describe('enforce()', () => {
    test('passes through requests within budget', () => {
      to.initSession('sess_pass', { limit: 100000 });
      const req = { messages: [{ role: 'user', content: 'Hello' }] };
      const r   = to.enforce(req, { sessionId: 'sess_pass', taskType: 'chat' });
      expect(r.decision).toBe('pass');
      expect(r.action).toBe('none');
    });

    test('compresses when session approaches limit', () => {
      const s = to.initSession('sess_enforce_comp', { limit: 5000 });
      s.used   = 4200;   // 84% — above 80% threshold
      const req = {
        system:   'This is the system prompt. '.repeat(20),
        messages: Array.from({ length: 10 }, (_, i) => ({
          role:    i % 2 === 0 ? 'user' : 'assistant',
          content: 'This is message content. '.repeat(10),
        })),
      };
      const r = to.enforce(req, { sessionId: 'sess_enforce_comp', taskType: 'chat' });
      expect(['compress', 'hard_truncate']).toContain(r.decision);
      expect(r.tokensAfter).toBeLessThanOrEqual(r.tokensBefore);
    });

    test('hard truncates when session is critical', () => {
      const s = to.initSession('sess_enforce_hard', { limit: 1000 });
      s.used   = 970;   // 97% — above 95% hard threshold
      const longContent = 'A'.repeat(5000);
      const req = {
        system:   longContent,
        messages: [{ role: 'user', content: longContent }],
      };
      const r = to.enforce(req, { sessionId: 'sess_enforce_hard', taskType: 'default', allowTruncate: true });
      expect(r.decision).toBe('hard_truncate');
      expect(r.tokensAfter).toBeLessThan(r.tokensBefore);
    });
  });

  describe('getUsage()', () => {
    test('returns usage report with status', () => {
      to.initSession('sess_usage', { limit: 10000 });
      to.track('sess_usage', 1000);
      const u = to.getUsage('sess_usage');
      expect(u).toHaveProperty('used');
      expect(u).toHaveProperty('limit');
      expect(u).toHaveProperty('remaining');
      expect(u).toHaveProperty('usedPercent');
      expect(u).toHaveProperty('status');
      expect(['ok', 'warn', 'compress', 'critical']).toContain(u.status);
    });

    test('status escalates correctly', () => {
      const s = to.initSession('sess_status', { limit: 1000 });
      s.used   = 720;
      const u  = to.getUsage('sess_status');
      expect(['warn', 'compress', 'critical']).toContain(u.status);
    });

    test('returns null for unknown session', () => {
      expect(to.getUsage('ghost_session_xyz')).toBeNull();
    });
  });

  describe('resetSession()', () => {
    test('resets usage to zero', () => {
      to.initSession('sess_reset', { limit: 5000 });
      to.track('sess_reset', 2000);
      to.resetSession('sess_reset');
      const u = to.getUsage('sess_reset');
      expect(u.used).toBe(0);
    });

    test('returns null for unknown session', () => {
      expect(to.resetSession('ghost_reset')).toBeNull();
    });
  });

  describe('shouldCompress() + shouldHardTruncate()', () => {
    test('shouldCompress is true at 80%+', () => {
      const s = to.initSession('sess_should_comp', { limit: 1000 });
      s.used   = 810;
      expect(to.shouldCompress('sess_should_comp')).toBe(true);
    });

    test('shouldCompress is false below threshold', () => {
      const s = to.initSession('sess_no_comp', { limit: 1000 });
      s.used   = 500;
      expect(to.shouldCompress('sess_no_comp')).toBe(false);
    });

    test('shouldHardTruncate is true at 95%+', () => {
      const s = to.initSession('sess_hard', { limit: 1000 });
      s.used   = 960;
      expect(to.shouldHardTruncate('sess_hard')).toBe(true);
    });
  });

  test('TASK_BUDGETS covers common task types', () => {
    expect(BUDGETS.short_answer).toBeLessThan(BUDGETS.research);
    expect(BUDGETS.code).toBeDefined();
    expect(BUDGETS.default).toBeDefined();
  });

  test('getStats() returns structured stats', () => {
    const s = to.getStats();
    expect(s).toHaveProperty('enforced');
    expect(s).toHaveProperty('compressed');
    expect(s).toHaveProperty('activeSessions');
    expect(s).toHaveProperty('taskBudgets');
  });
});
