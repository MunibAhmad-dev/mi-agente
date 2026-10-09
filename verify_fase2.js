const path = require('path');

let passed = 0;
let failed = 0;
const _tests = [];

function test(name, fn) {
    _tests.push({ name, fn });
}

console.log('\n=== FASE 2 VERIFICATION ===\n');

test('ModelPipeline', () => {
    const { ModelPipeline } = require('./api/server/services/Harness/cognitive/ModelPipeline');
    const pipeline = new ModelPipeline();
    const p = pipeline.createPipeline({
        id: 'test',
        stages: [
            { id: 's1', model: 'gpt-4o', provider: 'openai', prompt: 'Step 1:' },
            { id: 's2', model: 'grok-2', provider: 'xai', prompt: 'Step 2:' },
        ],
        strategy: 'sequential'
    });
    if (p.stages.length !== 2) throw new Error('Wrong stage count');
    if (p.strategy !== 'sequential') throw new Error('Wrong strategy');
});

test('SourceEvaluator', () => {
    const { SourceEvaluator } = require('./api/server/services/Harness/cognitive/SourceEvaluator');
    const se = new SourceEvaluator();
    const result = se.evaluate({
        url: 'https://arxiv.org/abs/2301.00001',
        title: 'Research Paper',
        content: 'This study found that the algorithm achieves 95% accuracy. According to the results, the method outperforms existing approaches.',
        date: '2024-01-15'
    });
    if (result.authority < 50) throw new Error('Authority too low for arxiv');
    if (!result.sourceType) throw new Error('Missing source type');
    if (!result.overallScore) throw new Error('Missing overall score');
});

test('FactChecker', () => {
    const { FactChecker, Verdict } = require('./api/server/services/Harness/cognitive/FactChecker');
    const fc = new FactChecker();
    const claims = fc.extractClaims('The population is 330 million. The study found 95% accuracy. This causes diabetes.');
    if (claims.length < 2) throw new Error('Should extract claims');
});

test('AdaptiveRAG', () => {
    const { AdaptiveRAG, QueryType, RAGStrategy } = require('./api/server/services/Harness/cognitive/AdaptiveRAG');
    const ar = new AdaptiveRAG();
    const stats = ar.getStats();
    if (stats.queries !== 0) throw new Error('Initial queries should be 0');
});

test('HybridSearch', () => {
    const { HybridSearch } = require('./api/server/services/Harness/cognitive/HybridSearch');
    const hs = new HybridSearch();
    hs.index({ id: 'doc1', content: 'The quick brown fox jumps over the lazy dog' });
    hs.index({ id: 'doc2', content: 'A fast red fox leaps over a sleepy cat' });
    const stats = hs.getStats();
    if (stats.documents !== 2) throw new Error('Wrong document count');
    if (stats.terms === 0) throw new Error('No terms indexed');
});

test('HybridSearch search', async () => {
    const { HybridSearch } = require('./api/server/services/Harness/cognitive/HybridSearch');
    const hs = new HybridSearch();
    hs.index({ id: 'doc1', content: 'JavaScript is a programming language used for web development' });
    hs.index({ id: 'doc2', content: 'Python is a programming language used for data science' });
    hs.index({ id: 'doc3', content: 'HTML is a markup language for web pages' });
    const results = await hs.search('programming language web');
    if (results.results.length === 0) throw new Error('Should find results');
    if (results.results[0].id !== 'doc1') throw new Error('First result should be doc1');
});

test('cognitive/index.js loads FASE 2 modules', () => {
    const idx = require('./api/server/services/Harness/cognitive/index.js');
    if (!idx.ModelPipeline) throw new Error('Missing ModelPipeline');
    if (!idx.SourceEvaluator) throw new Error('Missing SourceEvaluator');
    if (!idx.FactChecker) throw new Error('Missing FactChecker');
    if (!idx.AdaptiveRAG) throw new Error('Missing AdaptiveRAG');
    if (!idx.HybridSearch) throw new Error('Missing HybridSearch');
});

test('All cognitive modules count', () => {
    const idx = require('./api/server/services/Harness/cognitive/index.js');
    const count = Object.keys(idx).length;
    if (count < 40) throw new Error(`Expected 40+ modules, got ${count}`);
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
  console.log(`FASE 2: ${passed}/${passed + failed} PASSED (${Math.round(passed / (passed + failed) * 100)}%)`);
  process.exit(failed > 0 ? 1 : 0);
})();
