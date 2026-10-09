/**
 * verify_all_modules.js — Comprehensive Module Verification
 * Tests all 60+ modules in the project
 */

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        failures.push({ name, error: err.message });
        console.log(`  ❌ ${name}: ${err.message}`);
    }
}

console.log('\n=== COMPREHENSIVE MODULE VERIFICATION ===\n');

// ── Core Modules ──────────────────────────────────────
console.log('📁 Core Modules:');

test('MCPServer', () => {
    const MCPServer = require('./api/server/services/Harness/MCPServer');
    const mcp = new MCPServer();
    const status = mcp.getStatus();
    if (!status.serverName) throw new Error('Missing serverName');
    if (status.tools !== 0) throw new Error('Initial tools should be 0');
});

test('MCPClient', () => {
    const MCPClient = require('./api/server/services/Harness/MCPClient');
    const client = new MCPClient();
    const status = client.getStatus();
    // SDK availability is optional - client works with fallback
    if (status.connections !== 0) throw new Error('Initial connections should be 0');
});

test('AgentLoop', () => {
    const { AgentLoop } = require('./api/server/services/Harness/AgentLoop');
    const loop = new AgentLoop();
    if (!loop.config) throw new Error('Missing config');
    if (loop.config.maxIterations !== 20) throw new Error('Wrong default maxIterations');
});

// ── Tools ──────────────────────────────────────
console.log('\n🛠️ Tools:');

test('FilesystemTools', () => {
    const { FilesystemTools } = require('./api/server/services/Harness/tools/FilesystemTools');
    const fsTools = new FilesystemTools();
    if (!fsTools.execute) throw new Error('Missing execute');
    if (!fsTools.readFile) throw new Error('Missing readFile');
});

test('ShellTool', () => {
    const { ShellTool } = require('./api/server/services/Harness/tools/ShellTool');
    const shell = new ShellTool();
    if (!shell.execute) throw new Error('Missing execute');
});

test('SearchTools', () => {
    const { SearchTools } = require('./api/server/services/Harness/tools/SearchTools');
    const search = new SearchTools();
    if (!search.grep) throw new Error('Missing grep');
    if (!search.glob) throw new Error('Missing glob');
});

test('CodeExecutor', () => {
    const { CodeExecutor } = require('./api/server/services/Harness/tools/CodeExecutor');
    const executor = new CodeExecutor();
    if (!executor.executeCode) throw new Error('Missing executeCode');
});

test('GitIntegration', () => {
    const GitIntegration = require('./api/server/services/Harness/tools/GitIntegration');
    const git = new GitIntegration();
    if (!git.status) throw new Error('Missing status');
});

test('GitWorktreeManager', () => {
    const { GitWorktreeManager } = require('./api/server/services/Harness/tools/GitWorktreeManager');
    const wt = new GitWorktreeManager();
    if (!wt.createWorktree) throw new Error('Missing createWorktree');
});

test('GitRollback', () => {
    const { GitRollback } = require('./api/server/services/Harness/tools/GitRollback');
    const rollback = new GitRollback();
    if (!rollback.rollback) throw new Error('Missing rollback');
});

test('DockerSandbox', () => {
    const { DockerSandbox } = require('./api/server/services/Harness/tools/DockerSandbox');
    const sandbox = new DockerSandbox();
    if (!sandbox.execute) throw new Error('Missing execute');
});

test('BrowserManager', () => {
    const BrowserManager = require('./api/server/services/Harness/tools/BrowserManager');
    const browser = new BrowserManager();
    if (!browser.navigate) throw new Error('Missing navigate');
});

test('ComputerUseVision', () => {
    const { ComputerUseVision } = require('./api/server/services/Harness/tools/ComputerUseVision');
    const cuv = new ComputerUseVision();
    if (!cuv.execute) throw new Error('Missing execute');
    if (!cuv.screenshotAndAnalyze) throw new Error('Missing screenshotAndAnalyze');
});

test('WebScraper', () => {
    const WebScraper = require('./api/server/services/Harness/tools/WebScraper');
    const scraper = new WebScraper();
    if (!scraper.scrape) throw new Error('Missing scrape');
});

test('EmailManager', () => {
    const { EmailManager } = require('./api/server/services/Harness/tools/EmailManager');
    const email = new EmailManager();
    if (!email.connect) throw new Error('Missing connect');
});

test('CalendarManager', () => {
    const { CalendarManager } = require('./api/server/services/Harness/tools/CalendarManager');
    const cal = new CalendarManager();
    if (!cal.connect) throw new Error('Missing connect');
});

test('DriveManager', () => {
    const { DriveManager } = require('./api/server/services/Harness/tools/DriveManager');
    const drive = new DriveManager();
    if (!drive.addAccount) throw new Error('Missing addAccount');
});

test('SocialScraper', () => {
    const { SocialScraper } = require('./api/server/services/Harness/tools/SocialScraper');
    const social = new SocialScraper();
    if (!social.searchTwitter) throw new Error('Missing searchTwitter');
});

test('RSSAggregator', () => {
    const { RSSAggregator } = require('./api/server/services/Harness/tools/RSSAggregator');
    const rss = new RSSAggregator();
    if (!rss.addFeed) throw new Error('Missing addFeed');
});

// ── Cognitive Modules ──────────────────────────────────────
console.log('\n🧠 Cognitive Modules:');

test('ContextCompactor', () => {
    const { ContextCompactor } = require('./api/server/services/Harness/cognitive/ContextCompactor');
    const cc = new ContextCompactor();
    if (!cc.compact) throw new Error('Missing compact');
});

test('IntelligentRouter', () => {
    const { IntelligentRouter } = require('./api/server/services/Harness/cognitive/llm/IntelligentRouter');
    const router = new IntelligentRouter();
    if (!router.route) throw new Error('Missing route');
});

test('CriticAgent', () => {
    const { CriticAgent } = require('./api/server/services/Harness/cognitive/CriticAgent');
    const critic = new CriticAgent();
    if (!critic.evaluate) throw new Error('Missing evaluate');
});

test('ParallelExecutor', () => {
    const { ParallelExecutor } = require('./api/server/services/Harness/cognitive/ParallelExecutor');
    const pe = new ParallelExecutor();
    if (!pe.executeParallel) throw new Error('Missing executeParallel');
});

test('AskUserModule', () => {
    const { AskUserModule } = require('./api/server/services/Harness/cognitive/AskUserModule');
    const ask = new AskUserModule();
    if (!ask.askQuestion) throw new Error('Missing askQuestion');
    if (!ask.confirm) throw new Error('Missing confirm');
    if (!ask.createExpressRouter) throw new Error('Missing createExpressRouter');
});

test('ResourceProfiles', () => {
    const { ResourceProfiles } = require('./api/server/services/Harness/cognitive/ResourceProfiles');
    const rp = new ResourceProfiles();
    const profile = rp.autoDetectProfile();
    if (!profile) throw new Error('Missing autoDetectProfile result');
});

test('PromptCache', () => {
    const { PromptCache } = require('./api/server/services/Harness/cognitive/PromptCache');
    const pc = new PromptCache();
    if (!pc.get) throw new Error('Missing get');
    if (!pc.set) throw new Error('Missing set');
});

test('ExperienceReplay', () => {
    const { ExperienceReplay } = require('./api/server/services/Harness/cognitive/ExperienceReplay');
    const er = new ExperienceReplay();
    if (!er.store) throw new Error('Missing store');
    if (!er.replay) throw new Error('Missing replay');
});

test('CrossSessionMemory', () => {
    const { CrossSessionMemory } = require('./api/server/services/Harness/cognitive/CrossSessionMemory');
    const csm = new CrossSessionMemory();
    if (!csm.saveSession) throw new Error('Missing saveSession');
    if (!csm.getContext) throw new Error('Missing getContext');
});

test('DynamicWorkflows', () => {
    const { DynamicWorkflows } = require('./api/server/services/Harness/cognitive/DynamicWorkflows');
    const dw = new DynamicWorkflows();
    if (!dw.create) throw new Error('Missing create');
});

test('PlanMode', () => {
    const { PlanMode } = require('./api/server/services/Harness/cognitive/PlanMode');
    const pm = new PlanMode();
    if (!pm.createPlan) throw new Error('Missing createPlan');
});

test('HookSystem', () => {
    const { HookSystem } = require('./api/server/services/Harness/cognitive/HookSystem');
    const hs = new HookSystem();
    if (!hs.register) throw new Error('Missing register');
    if (!hs.executePreToolHooks) throw new Error('Missing executePreToolHooks');
});

test('SkillsSystem', () => {
    const { SkillsSystem } = require('./api/server/services/Harness/cognitive/SkillsSystem');
    const ss = new SkillsSystem();
    const stats = ss.getStats();
    if (stats.total < 10) throw new Error(`Expected 10+ skills, got ${stats.total}`);
});

test('ToolResultCompressor', () => {
    const { ToolResultCompressor } = require('./api/server/services/Harness/cognitive/ToolResultCompressor');
    const trc = new ToolResultCompressor();
    const result = trc.compress('test', 'hello world');
    if (result !== 'hello world') throw new Error('Compression failed');
});

test('FileIndexer', () => {
    const { FileIndexer } = require('./api/server/services/Harness/cognitive/FileIndexer');
    const fi = new FileIndexer();
    if (!fi.buildIndex) throw new Error('Missing buildIndex');
});

test('ApprovalGates', () => {
    const { ApprovalGates } = require('./api/server/services/Harness/cognitive/ApprovalGates');
    const ag = new ApprovalGates();
    if (!ag.check) throw new Error('Missing check');
});

test('CheckpointManager', () => {
    const { CheckpointManager } = require('./api/server/services/Harness/cognitive/CheckpointManager');
    const cm = new CheckpointManager();
    const result = cm.save('test-session', { data: 'test' });
    if (!result.success) throw new Error('Save failed');
});

// ── Verification Modules ──────────────────────────────────────
console.log('\n✅ Verification Modules:');

test('DeterministicVerifier', () => {
    const { DeterministicVerifier } = require('./api/server/services/Harness/Verification/DeterministicVerifier');
    const dv = new DeterministicVerifier();
    if (!dv.execute) throw new Error('Missing execute');
    if (!dv.verifySyntax) throw new Error('Missing verifySyntax');
});

test('IsolatedSubAgent', () => {
    const { IsolatedSubAgent } = require('./api/server/services/SubAgents/IsolatedSubAgent');
    const isa = new IsolatedSubAgent();
    if (!isa.execute) throw new Error('Missing execute');
});

// ── Multi-Modal ──────────────────────────────────────
console.log('\n🎨 Multi-Modal Modules:');

test('MultiModalLocal', () => {
    const { MultiModalLocal } = require('./api/server/services/Harness/tools/MultiModalLocal');
    const mm = new MultiModalLocal();
    if (!mm.analyzeImage) throw new Error('Missing analyzeImage');
});

// ── Tools Index ──────────────────────────────────────
console.log('\n📦 Tools Index:');

test('tools/index.js loads all tools', () => {
    const toolsIndex = require('./api/server/services/Harness/tools/index.js');
    const toolNames = Object.keys(toolsIndex);
    if (toolNames.length < 50) throw new Error(`Expected 50+ tools, got ${toolNames.length}`);
    console.log(`     → ${toolNames.length} tools loaded`);
});

test('cognitive/index.js loads all modules', () => {
    const cognitiveIndex = require('./api/server/services/Harness/cognitive/index.js');
    const moduleNames = Object.keys(cognitiveIndex);
    if (moduleNames.length < 30) throw new Error(`Expected 30+ modules, got ${moduleNames.length}`);
    console.log(`     → ${moduleNames.length} modules loaded`);
});

// ── Results ──────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed}/${passed + failed} PASSED (${Math.round(passed / (passed + failed) * 100)}%)`);

if (failures.length > 0) {
    console.log(`\n❌ FAILURES:`);
    for (const f of failures) {
        console.log(`  - ${f.name}: ${f.error}`);
    }
}

process.exit(failed > 0 ? 1 : 0);
