let passed = 0, failed = 0;
const _tests = [];
function test(name, fn) { _tests.push({ name, fn }); }

console.log('\n=== FASE 4 VERIFICATION ===\n');

test('NewsEngine', () => { const { NewsEngine } = require('./api/server/services/Harness/cognitive/NewsEngine'); const ne = new NewsEngine(); ne.addFeed('tech', 'https://example.com/rss'); ne.addArticle({ title: 'AI Breakthrough', content: 'Scientists found 95% accuracy in new model', source: 'TechNews' }); const stats = ne.getStats(); if (stats.articles !== 1) throw new Error('Wrong article count'); });
test('EditorialAnalyzer', () => { const { EditorialAnalyzer } = require('./api/server/services/Harness/cognitive/EditorialAnalyzer'); const ea = new EditorialAnalyzer(); const result = ea.analyze({ content: 'The shocking crisis threatens our future. According to research, progressive policies show 95% effectiveness.' }); if (!result.orientation) throw new Error('Missing orientation'); if (!result.emotionalScore && result.emotionalScore !== 0) throw new Error('Missing emotional score'); });
test('GPUManager', () => { const { GPUManager } = require('./api/server/services/Harness/cognitive/GPUManager'); const gm = new GPUManager(); const gpus = gm.detect(); if (!Array.isArray(gpus)) throw new Error('Should return array'); });
test('BenchmarkSuite', () => { const { BenchmarkSuite } = require('./api/server/services/Harness/cognitive/BenchmarkSuite'); const bs = new BenchmarkSuite(); const bench = bs.createBenchmark({ name: 'test', tasks: [{ id: 't1' }], models: ['gpt-4o'] }); if (!bench.id) throw new Error('Missing benchmark id'); });
test('CodebaseForensics', () => { const { CodebaseForensics } = require('./api/server/services/Harness/cognitive/CodebaseForensics'); const cf = new CodebaseForensics({ workingDir: '.' }); const result = cf.analyze(); if (!result.files) throw new Error('Missing files count'); });
test('cognitive/index.js loads all FASE 4', () => { const idx = require('./api/server/services/Harness/cognitive/index.js'); const required = ['NewsEngine','EditorialAnalyzer','GPUManager','BenchmarkSuite','CodebaseForensics']; for (const r of required) { if (!idx[r]) throw new Error(`Missing ${r}`); } });
test('Total cognitive modules', () => { const idx = require('./api/server/services/Harness/cognitive/index.js'); const count = Object.keys(idx).length; console.log(`     → ${count} cognitive modules`); if (count < 55) throw new Error(`Expected 55+ modules, got ${count}`); });

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
  console.log(`FASE 4: ${passed}/${passed + failed} PASSED (${Math.round(passed / (passed + failed) * 100)}%)`);
  process.exit(failed > 0 ? 1 : 0);
})();
