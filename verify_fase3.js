let passed = 0, failed = 0;
const _tests = [];
function test(name, fn) { _tests.push({ name, fn }); }

console.log('\n=== FASE 3 VERIFICATION ===\n');

test('WorkspaceManager', () => { const { WorkspaceManager } = require('./api/server/services/Harness/cognitive/WorkspaceManager'); const ws = new WorkspaceManager({ baseDir: './test-workspaces' }); const w = ws.create({ id: 'test-ws', name: 'Test' }); if (!w.id) throw new Error('Missing id'); ws.delete('test-ws'); });
test('DistributedTracer', () => { const { DistributedTracer } = require('./api/server/services/Harness/cognitive/DistributedTracer'); const t = new DistributedTracer(); const id = t.startTrace('test'); const span = t.startSpan(id, 'span1'); t.endSpan(id, span); t.endTrace(id); const s = t.getSummary(); if (s.totalTraces !== 1) throw new Error('Wrong trace count'); });
test('ModelEvaluator', () => { const { ModelEvaluator } = require('./api/server/services/Harness/cognitive/ModelEvaluator'); const me = new ModelEvaluator(); me.evaluate('gpt-4o', { type: 'coding' }, { success: true, quality: 90, latency: 1000 }); const stats = me.getStats(); if (Object.keys(stats).length !== 1) throw new Error('Wrong eval count'); });
test('RAGEvaluator', () => { const { RAGEvaluator } = require('./api/server/services/Harness/cognitive/RAGEvaluator'); const re = new RAGEvaluator(); const e = re.evaluate('test query', { chunks: [{ content: 'test content' }] }, 'test answer'); if (!e.overallScore) throw new Error('Missing score'); });
test('PeerReviewer', () => { const { PeerReviewer } = require('./api/server/services/Harness/cognitive/PeerReviewer'); const pr = new PeerReviewer(); const id = pr.requestReview('item1', { code: 'test' }, ['agent1', 'agent2']); if (!id) throw new Error('Missing review id'); });
test('AccessibilityTree', () => { const { AccessibilityTree } = require('./api/server/services/Harness/cognitive/AccessibilityTree'); const at = new AccessibilityTree(); const tree = at.parse(null); if (!tree.elements) throw new Error('Missing elements'); });
test('GhostDetector', () => { const { GhostDetector } = require('./api/server/services/Harness/cognitive/GhostDetector'); const gd = new GhostDetector(); const result = gd.scan(); if (!result.total && result.total !== 0) throw new Error('Missing total'); });
test('DuplicateDetector', () => { const { DuplicateDetector } = require('./api/server/services/Harness/cognitive/DuplicateDetector'); const dd = new DuplicateDetector(); const result = dd.scan('.'); if (!result.total && result.total !== 0) throw new Error('Missing total'); });
test('MicroVMManager', async () => { const { MicroVMManager } = require('./api/server/services/Harness/cognitive/MicroVMManager'); const mvm = new MicroVMManager(); const vm = await mvm.create(); if (!vm.id) throw new Error('Missing vm id'); mvm.destroy(vm.id); });
test('RemoteExecutor', async () => { const { RemoteExecutor } = require('./api/server/services/Harness/cognitive/RemoteExecutor'); const re = new RemoteExecutor(); const conn = await re.connect({ host: 'localhost' }); if (!conn.id) throw new Error('Missing connection id'); re.disconnect(conn.id); });
test('PromptManager', () => { const { PromptManager } = require('./api/server/services/Harness/cognitive/PromptManager'); const pm = new PromptManager(); const p = pm.create({ name: 'test', template: 'Hello {{name}}' }); const rendered = pm.render(p.id, { name: 'World' }); if (rendered !== 'Hello World') throw new Error('Render failed'); });
test('ContextualRetriever', () => { const { ContextualRetriever } = require('./api/server/services/Harness/cognitive/ContextualRetriever'); const cr = new ContextualRetriever(); const enhanced = cr.enhanceChunks([{ content: 'test chunk' }], 'line1\ntest chunk\nline3'); if (!enhanced[0].enhanced) throw new Error('Not enhanced'); });

test('cognitive/index.js loads all FASE 3', () => { const idx = require('./api/server/services/Harness/cognitive/index.js'); const required = ['WorkspaceManager','DistributedTracer','ModelEvaluator','RAGEvaluator','PeerReviewer','AccessibilityTree','GhostDetector','DuplicateDetector','MicroVMManager','RemoteExecutor','PromptManager','ContextualRetriever']; for (const r of required) { if (!idx[r]) throw new Error(`Missing ${r}`); } });

test('Total cognitive modules', () => { const idx = require('./api/server/services/Harness/cognitive/index.js'); const count = Object.keys(idx).length; console.log(`     → ${count} cognitive modules`); if (count < 50) throw new Error(`Expected 50+ modules, got ${count}`); });

(async () => {
  for (const t of _tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  ✅ ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`  ❌ ${t.name}: ${err.message}`);
    }
  }
  console.log(`\n${'='.repeat(50)}`);
  console.log(`FASE 3: ${passed}/${passed + failed} PASSED (${Math.round(passed / (passed + failed) * 100)}%)`);
  process.exit(failed > 0 ? 1 : 0);
})();
