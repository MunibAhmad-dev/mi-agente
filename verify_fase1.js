const path = require('path');

let passed = 0;
let failed = 0;
const _tests = [];

function test(name, fn) {
    _tests.push({ name, fn });
}

console.log('\n=== FASE 1 VERIFICATION ===\n');

test('DAGScheduler', () => {
    const { DAGScheduler } = require('./api/server/services/Harness/cognitive/DAGScheduler');
    const dag = new DAGScheduler();
    const graph = dag.createGraph({
        id: 'test',
        tasks: [
            { id: 'a', handler: async () => 'a' },
            { id: 'b', handler: async () => 'b', dependsOn: ['a'] },
            { id: 'c', handler: async () => 'c', dependsOn: ['a'] },
            { id: 'd', handler: async () => 'd', dependsOn: ['b', 'c'] },
        ]
    });
    if (graph.totalCount !== 4) throw new Error('Wrong task count');
    if (graph.levels.length !== 3) throw new Error('Wrong level count');
});

test('DAGScheduler execute', async () => {
    const { DAGScheduler } = require('./api/server/services/Harness/cognitive/DAGScheduler');
    const dag = new DAGScheduler();
    const graph = dag.createGraph({
        id: 'test2',
        tasks: [
            { id: 'a', handler: async () => 1 },
            { id: 'b', handler: async () => 2, dependsOn: ['a'] },
        ]
    });
    const result = await dag.execute('test2');
    if (!result.success) throw new Error('Execution failed');
    if (result.completed !== 2) throw new Error('Wrong completion count');
});

test('ProviderHealthChecker', () => {
    const { ProviderHealthChecker } = require('./api/server/services/Harness/cognitive/ProviderHealthChecker');
    const hc = new ProviderHealthChecker();
    hc.registerProvider('openai', { healthCheckFn: async () => true });
    hc.registerProvider('grok', { healthCheckFn: async () => true });
    const stats = hc.getAllStatus();
    if (Object.keys(stats).length !== 2) throw new Error('Wrong provider count');
});

test('APIKeyRotation', () => {
    const { APIKeyRotation } = require('./api/server/services/Harness/cognitive/APIKeyRotation');
    const rot = new APIKeyRotation();
    rot.registerProvider('openai', [
        { key: 'key1', priority: 0 },
        { key: 'key2', priority: 1 },
    ]);
    const key1 = rot.getNextKey('openai');
    const key2 = rot.getNextKey('openai');
    if (key1 === key2) throw new Error('Keys should rotate');
    const stats = rot.getStats('openai');
    if (stats.totalKeys !== 2) throw new Error('Wrong key count');
});

test('QuotaManager', () => {
    const { QuotaManager } = require('./api/server/services/Harness/cognitive/QuotaManager');
    const qm = new QuotaManager();
    qm.setQuota('user1', { tokensPerDay: 1000 });
    const check = qm.checkQuota('user1', 'tokens', 100);
    if (!check.allowed) throw new Error('Should be allowed');
    qm.recordUsage('user1', 'tokens', 900);
    const check2 = qm.checkQuota('user1', 'tokens', 200);
    if (check2.allowed) throw new Error('Should be exceeded');
    const usage = qm.getUsage('user1');
    if (usage.tokens.today !== 900) throw new Error('Wrong usage');
});

test('Dashboard HTML exists', () => {
    const fs = require('fs');
    if (!fs.existsSync('./client/dashboard.html')) throw new Error('Dashboard not found');
    const content = fs.readFileSync('./client/dashboard.html', 'utf8');
    if (!content.includes('Universal AI Agent')) throw new Error('Dashboard content wrong');
});

test('cognitive/index.js loads new modules', () => {
    const idx = require('./api/server/services/Harness/cognitive/index.js');
    if (!idx.DAGScheduler) throw new Error('Missing DAGScheduler');
    if (!idx.ProviderHealthChecker) throw new Error('Missing ProviderHealthChecker');
    if (!idx.APIKeyRotation) throw new Error('Missing APIKeyRotation');
    if (!idx.QuotaManager) throw new Error('Missing QuotaManager');
});

test('All cognitive modules count', () => {
    const idx = require('./api/server/services/Harness/cognitive/index.js');
    const count = Object.keys(idx).length;
    if (count < 25) throw new Error(`Expected 25+ modules, got ${count}`);
    console.log(`     → ${count} cognitive modules`);
});

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
  console.log(`FASE 1: ${passed}/${passed + failed} PASSED (${Math.round(passed / (passed + failed) * 100)}%)`);
  process.exit(failed > 0 ? 1 : 0);
})();
