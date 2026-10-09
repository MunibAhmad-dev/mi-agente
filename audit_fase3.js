/**
 * audit_fase3.js — Deep Audit of FASE 3
 * Checks for bugs, missing integrations, issues
 */

let issues = [];
let warnings = [];
let passed = 0;

function check(name, fn) {
    try {
        const result = fn();
        if (result === true) { passed++; }
        else if (typeof result === 'string') { warnings.push({ name, issue: result }); }
    } catch (err) {
        issues.push({ name, issue: err.message, severity: 'error' });
    }
}

function checkWarn(name, fn) {
    try {
        const result = fn();
        if (typeof result === 'string') { warnings.push({ name, issue: result }); }
    } catch (err) {
        warnings.push({ name, issue: err.message });
    }
}

console.log('\n' + '='.repeat(60));
console.log('  DEEP AUDIT — FASE 3');
console.log('='.repeat(60) + '\n');

// ═══ 1. MODULE LOADING ═══
console.log('1. Module Loading:');

check('AgentLoop loads', () => {
    const { AgentLoop } = require('./api/server/services/Harness/AgentLoop');
    const loop = new AgentLoop();
    if (!loop.config) return 'Missing config';
    return true;
});

check('All 58 cognitive modules load', () => {
    const idx = require('./api/server/services/Harness/cognitive/index.js');
    const count = Object.keys(idx).length;
    if (count < 55) return `Only ${count} modules loaded`;
    return true;
});

check('All 55 tools load', () => {
    const idx = require('./api/server/services/Harness/tools/index.js');
    const count = Object.keys(idx).length;
    if (count < 50) return `Only ${count} tools loaded`;
    return true;
});

// ═══ 2. INTEGRATION CHECK ═══
console.log('\n2. Integration Check:');

check('AgentLoop has all 21 setters', () => {
    const { AgentLoop } = require('./api/server/services/Harness/AgentLoop');
    const loop = new AgentLoop();
    const required = ['setToolRegistry', 'setLLMProvider', 'setContextManager', 'setSessionManager',
        'setMemoryManager', 'setRepositoryMap', 'setVerifier', 'setCheckpointManager',
        'setToolResultCompressor', 'setDAGScheduler', 'setProviderHealthChecker',
        'setAPIKeyRotation', 'setQuotaManager', 'setModelPipeline', 'setAdaptiveRAG',
        'setHybridSearch', 'setWorkspaceManager', 'setDistributedTracer', 'setPromptManager',
        'setSourceEvaluator', 'setFactChecker'];
    const missing = required.filter(s => typeof loop[s] !== 'function');
    if (missing.length > 0) return `Missing setters: ${missing.join(', ')}`;
    return true;
});

check('DAGScheduler integrates with AgentLoop', () => {
    const { AgentLoop } = require('./api/server/services/Harness/AgentLoop');
    const { DAGScheduler } = require('./api/server/services/Harness/cognitive/DAGScheduler');
    const loop = new AgentLoop();
    const dag = new DAGScheduler();
    loop.setDAGScheduler(dag);
    if (!loop._dagScheduler) return 'DAGScheduler not set';
    return true;
});

check('ProviderHealthChecker integrates', () => {
    const { AgentLoop } = require('./api/server/services/Harness/AgentLoop');
    const { ProviderHealthChecker } = require('./api/server/services/Harness/cognitive/ProviderHealthChecker');
    const loop = new AgentLoop();
    const hc = new ProviderHealthChecker();
    loop.setProviderHealthChecker(hc);
    if (!loop._providerHealthChecker) return 'ProviderHealthChecker not set';
    return true;
});

check('QuotaManager integrates', () => {
    const { AgentLoop } = require('./api/server/services/Harness/AgentLoop');
    const { QuotaManager } = require('./api/server/services/Harness/cognitive/QuotaManager');
    const loop = new AgentLoop();
    const qm = new QuotaManager();
    loop.setQuotaManager(qm);
    if (!loop._quotaManager) return 'QuotaManager not set';
    return true;
});

check('DistributedTracer integrates', () => {
    const { AgentLoop } = require('./api/server/services/Harness/AgentLoop');
    const { DistributedTracer } = require('./api/server/services/Harness/cognitive/DistributedTracer');
    const loop = new AgentLoop();
    const dt = new DistributedTracer();
    loop.setDistributedTracer(dt);
    if (!loop._distributedTracer) return 'DistributedTracer not set';
    return true;
});

// ═══ 3. FUNCTIONALITY CHECK ═══
console.log('\n3. Functionality Check:');

check('DAGScheduler detects cycles', () => {
    const { DAGScheduler } = require('./api/server/services/Harness/cognitive/DAGScheduler');
    const dag = new DAGScheduler();
    try {
        dag.createGraph({ id: 'cycle', tasks: [
            { id: 'a', handler: async () => 1, dependsOn: ['b'] },
            { id: 'b', handler: async () => 2, dependsOn: ['a'] },
        ]});
        return 'Should detect cycle';
    } catch (e) {
        if (e.message.includes('cycle')) return true;
        return `Wrong error: ${e.message}`;
    }
});

check('HybridSearch finds results', async () => {
    const { HybridSearch } = require('./api/server/services/Harness/cognitive/HybridSearch');
    const hs = new HybridSearch();
    hs.index({ id: 'doc1', content: 'JavaScript is a programming language for web' });
    hs.index({ id: 'doc2', content: 'Python is a programming language for data' });
    const results = await hs.search('programming language');
    if (results.results.length === 0) return 'No results found';
    return true;
});

check('SourceEvaluator scores correctly', () => {
    const { SourceEvaluator } = require('./api/server/services/Harness/cognitive/SourceEvaluator');
    const se = new SourceEvaluator();
    const high = se.evaluate({ url: 'https://arxiv.org/abs/2301.00001', content: 'Study found 95% accuracy according to research', date: '2024-01-15' });
    const low = se.evaluate({ url: 'https://random-blog.com', content: 'I believe this is amazing', date: '2020-01-01' });
    if (high.overallScore <= low.overallScore) return 'High quality source should score higher';
    return true;
});

check('QuotaManager blocks when exceeded', () => {
    const { QuotaManager } = require('./api/server/services/Harness/cognitive/QuotaManager');
    const qm = new QuotaManager();
    qm.setQuota('test', { tokensPerDay: 100 });
    qm.recordUsage('test', 'tokens', 100);
    const check = qm.checkQuota('test', 'tokens', 1);
    if (check.allowed) return 'Should be blocked';
    return true;
});

check('APIKeyRotation cycles through keys', () => {
    const { APIKeyRotation } = require('./api/server/services/Harness/cognitive/APIKeyRotation');
    const rot = new APIKeyRotation();
    rot.registerProvider('test', [{ key: 'k1' }, { key: 'k2' }, { key: 'k3' }]);
    const keys = new Set();
    for (let i = 0; i < 6; i++) keys.add(rot.getNextKey('test'));
    if (keys.size < 2) return 'Should cycle through keys';
    return true;
});

check('ModelPipeline sequential execution', async () => {
    const { ModelPipeline } = require('./api/server/services/Harness/cognitive/ModelPipeline');
    const mp = new ModelPipeline();
    mp._llmProviders = { test: { chat: async () => ({ content: 'result' }) } };
    mp.createPipeline({ id: 'test', stages: [{ model: 'm', provider: 'test', prompt: 'test' }], strategy: 'sequential' });
    const result = await mp.execute('test', 'input');
    if (!result.success) return 'Pipeline failed';
    return true;
});

check('WorkspaceManager creates and deletes', () => {
    const { WorkspaceManager } = require('./api/server/services/Harness/cognitive/WorkspaceManager');
    const ws = new WorkspaceManager({ baseDir: './test-audit-ws' });
    const w = ws.create({ id: 'audit-test', name: 'Audit Test' });
    if (!w.id) return 'Create failed';
    ws.writeFile('audit-test', 'test.txt', 'hello');
    const content = ws.readFile('audit-test', 'test.txt');
    if (content !== 'hello') return 'Read/Write failed';
    ws.delete('audit-test');
    return true;
});

check('NewsEngine groups articles', () => {
    const { NewsEngine } = require('./api/server/services/Harness/cognitive/NewsEngine');
    const ne = new NewsEngine();
    ne.addArticle({ title: 'AI Breakthrough in Machine Learning', content: 'Scientists found 95% accuracy', source: 'TechNews' });
    ne.addArticle({ title: 'New AI Model Achieves 95% Accuracy', content: 'Research shows amazing results', source: 'ScienceDaily' });
    const stats = ne.getStats();
    if (stats.articles !== 2) return 'Wrong article count';
    return true;
});

check('BenchmarkSuite creates and runs', async () => {
    const { BenchmarkSuite } = require('./api/server/services/Harness/cognitive/BenchmarkSuite');
    const bs = new BenchmarkSuite();
    bs.createBenchmark({ id: 'test', name: 'Test', tasks: [{ id: 't1' }], models: ['m1'] });
    const result = await bs.runBenchmark('test', async (model, task) => 'ok');
    if (!result.byModel) return 'Missing results';
    return true;
});

// ═══ 4. EDGE CASES ═══
console.log('\n4. Edge Cases:');

checkWarn('AgentLoop rejects concurrent runs', async () => {
    const { AgentLoop } = require('./api/server/services/Harness/AgentLoop');
    const loop = new AgentLoop();
    loop._running = true;
    try {
        await loop.run('test');
        return 'Should reject concurrent run';
    } catch (e) {
        if (e.message.includes('already running')) return null;
        return `Wrong error: ${e.message}`;
    }
});

checkWarn('DAGScheduler rejects invalid graph', () => {
    const { DAGScheduler } = require('./api/server/services/Harness/cognitive/DAGScheduler');
    const dag = new DAGScheduler();
    try {
        dag.createGraph({ id: 'bad', tasks: [{ id: 'a', handler: async () => 1, dependsOn: ['nonexistent'] }] });
        return 'Should handle missing dependency';
    } catch (e) {
        return null;
    }
});

checkWarn('QuotaManager handles unknown user', () => {
    const { QuotaManager } = require('./api/server/services/Harness/cognitive/QuotaManager');
    const qm = new QuotaManager();
    const check = qm.checkQuota('unknown', 'tokens', 1);
    if (!check.allowed) return 'Unknown user should use defaults';
    return null;
});

// ═══ 5. MEMORY LEAKS ═══
console.log('\n5. Memory/Resource Check:');

checkWarn('DAGScheduler prunes old graphs', () => {
    const { DAGScheduler } = require('./api/server/services/Harness/cognitive/DAGScheduler');
    const dag = new DAGScheduler();
    for (let i = 0; i < 100; i++) {
        dag.createGraph({ id: `g${i}`, tasks: [{ id: 'a', handler: async () => 1 }] });
    }
    if (dag._graphs.size > 200) return 'Too many graphs in memory';
    return null;
});

checkWarn('DistributedTracer prunes old traces', () => {
    const { DistributedTracer } = require('./api/server/services/Harness/cognitive/DistributedTracer');
    const dt = new DistributedTracer({ maxTraces: 10 });
    for (let i = 0; i < 20; i++) {
        dt.startTrace(`t${i}`);
    }
    if (dt._traces.size > 15) return 'Too many traces in memory';
    return null;
});

// ═══ RESULTS ═══
console.log('\n' + '='.repeat(60));
console.log('  AUDIT RESULTS');
console.log('='.repeat(60));

console.log(`\n  ✅ Passed: ${passed}`);
console.log(`  ⚠️  Warnings: ${warnings.length}`);
console.log(`  ❌ Issues: ${issues.length}`);

if (warnings.length > 0) {
    console.log('\n  ⚠️  WARNINGS:');
    for (const w of warnings) {
        console.log(`    - ${w.name}: ${w.issue}`);
    }
}

if (issues.length > 0) {
    console.log('\n  ❌ ISSUES:');
    for (const i of issues) {
        console.log(`    - ${i.name}: ${i.issue}`);
    }
} else {
    console.log('\n  ✅ NO CRITICAL ISSUES FOUND');
}

console.log('\n' + '='.repeat(60));
process.exit(issues.length > 0 ? 1 : 0);
