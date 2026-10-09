'use strict';

/**
 * GET /api/capabilities
 * Returns a full manifest of every mounted API surface and its purpose.
 * No auth required — acts as a public service discovery endpoint.
 */
const express = require('express');

const router = express.Router();

const CAPABILITY_MANIFEST = {
  version: '1.0.0',
  generated: new Date().toISOString(),
  description: 'mi-agente Universal AI OS — complete API surface',
  categories: {
    'Model Management': {
      description: 'Discover, install, compare and manage LLM models (local + cloud)',
      endpoints: [
        { path: '/api/models',           method: 'GET',  purpose: 'List all configured models' },
        { path: '/api/local-models',     method: 'GET',  purpose: 'Discover locally installed Ollama models' },
        { path: '/api/model-catalog',    method: 'GET',  purpose: 'Full catalog: cloud + local + HuggingFace' },
        { path: '/api/model-router',     method: 'POST', purpose: 'Route a task to the best available model' },
        { path: '/api/huggingface',      method: 'GET',  purpose: 'Search and download HuggingFace models' },
        { path: '/api/hardware',         method: 'GET',  purpose: 'GPU/RAM requirements per model' },
        { path: '/api/webllm',           method: 'GET',  purpose: 'WebLLM in-browser inference status' },
        { path: '/api/ollama-proxy',     method: 'POST', purpose: 'Proxy to local Ollama instance' },
        { path: '/api/ai-runtimes',      method: 'GET',  purpose: 'List available AI runtimes (Ollama, llama.cpp, vLLM)' },
      ],
    },
    'Agent & Harness': {
      description: 'Agent loop, tool execution, HarnessManager, multi-agent orchestration',
      endpoints: [
        { path: '/api/harness/tools/list',   method: 'GET',  purpose: 'List all 41 registered tools' },
        { path: '/api/harness/tools/invoke', method: 'POST', purpose: 'Execute any tool live' },
        { path: '/api/harness/status',       method: 'GET',  purpose: 'HarnessManager initialization state' },
        { path: '/api/harness/scaffold',     method: 'POST', purpose: 'Scaffold a new agent session' },
        { path: '/api/harness/checkpoint',   method: 'POST', purpose: 'Save session checkpoint' },
        { path: '/api/harness/resume',       method: 'POST', purpose: 'Resume from checkpoint' },
        { path: '/api/harness/goal',         method: 'POST', purpose: 'Register a long-running goal' },
        { path: '/api/agent-runtime',        method: '*',    purpose: 'F5-F15 agent runtime services' },
        { path: '/api/agent-engine',         method: '*',    purpose: 'DSH agent engine entry point' },
        { path: '/api/agent',                method: '*',    purpose: 'Universal agent: base API' },
        { path: '/api/agent/reasoning',      method: '*',    purpose: 'Reasoning + planning tools' },
        { path: '/api/agent/safety',         method: '*',    purpose: 'Safety + constitution checks' },
        { path: '/api/agent/memory',         method: '*',    purpose: 'Memory read/write per agent' },
        { path: '/api/agent/runtime',        method: '*',    purpose: 'Runtime lifecycle management' },
        { path: '/api/agent/advanced',       method: '*',    purpose: 'Advanced orchestration' },
        { path: '/api/agent/knowledge',      method: '*',    purpose: 'Knowledge retrieval + RAG' },
        { path: '/api/multiagent',           method: '*',    purpose: 'Multi-agent controller' },
      ],
    },
    'Cognitive Pipeline (Gen B)': {
      description: '34+ Gen B cognitive phases wired into every chat request',
      endpoints: [
        { path: '/api/cognitive',           method: '*',    purpose: 'Classification, AskVsAct, Director, WorldModel' },
        { path: '/api/cognitive/behavior',  method: '*',    purpose: 'Behavior benchmarks, regression detection, MAT' },
        { path: '/api/executive-loop',      method: '*',    purpose: 'Executive Director + World Model updates' },
        { path: '/api/intelligence',        method: '*',    purpose: 'Investigation, Evidence, Contradiction engines' },
      ],
    },
    'Memory & Knowledge': {
      description: 'Multi-layer memory, RAG, knowledge graph, vector search',
      endpoints: [
        { path: '/api/rag',         method: '*', purpose: 'RAG pipeline: index + retrieve' },
        { path: '/api/ingestion',   method: '*', purpose: 'Document ingestion into knowledge base' },
        { path: '/api/memories',    method: '*', purpose: 'Episodic + semantic memory CRUD' },
        { path: '/api/context',     method: '*', purpose: 'Context assembly + compression' },
        { path: '/api/harness/rag', method: '*', purpose: 'Knowledge audit, dedup, compression, web ingest' },
      ],
    },
    'Research OS': {
      description: '6-level research engine with claim verification, source tracking, RAG',
      endpoints: [
        { path: '/api/research-os/health',                    method: 'GET',  purpose: 'Check API keys and initialization status' },
        { path: '/api/research-os/research',                  method: 'POST', purpose: 'Start a research session' },
        { path: '/api/research-os/research/:id',              method: 'GET',  purpose: 'Get session state' },
        { path: '/api/research-os/research/:id/continue',     method: 'POST', purpose: 'Continue research' },
        { path: '/api/research-os/research/:id/verify',       method: 'POST', purpose: 'Verify claims' },
        { path: '/api/research-os/research/:id/report',       method: 'GET',  purpose: 'Generate final report' },
        { path: '/api/research-os/rag/query',                 method: 'POST', purpose: 'Query RAG knowledge base' },
        { path: '/api/research',                              method: '*',    purpose: 'Research session management' },
      ],
    },
    'Website Cloning & Reverse Engineering': {
      description: 'Clone, analyze, repair and compare websites with multi-agent pipeline',
      endpoints: [
        { path: '/api/cloner/health',           method: 'GET',  purpose: 'Playwright status and available endpoints' },
        { path: '/api/cloner/clone',            method: 'POST', purpose: 'Full website clone → editable scaffold' },
        { path: '/api/cloner/analyze',          method: 'POST', purpose: 'Analyze structure (no Playwright needed)' },
        { path: '/api/cloner/full-analysis',    method: 'POST', purpose: 'Multi-agent: repair + forensics + visual QA' },
        { path: '/api/cloner/design-forensics', method: 'POST', purpose: 'Extract design tokens and CSS DNA' },
        { path: '/api/cloner/auto-repair',      method: 'POST', purpose: 'Detect and fix cloned HTML issues' },
        { path: '/api/cloner/visual-qa',        method: 'POST', purpose: 'Pixel-diff original vs clone' },
        { path: '/api/cloner/history',          method: 'GET',  purpose: 'Recent clone operations' },
      ],
    },
    'Security': {
      description: 'Agent firewall, SAST, secrets scanning, shell command validation',
      endpoints: [
        { path: '/api/security',          method: '*', purpose: 'Agent Firewall policy checks' },
        { path: '/api/security-scan',     method: '*', purpose: 'SAST (ast-grep) + secrets (Gitleaks) + OSV' },
        { path: '/api/provider-keys',     method: '*', purpose: 'Encrypted API key management' },
      ],
    },
    'Learning & Self-Improvement': {
      description: 'Autonomous learning loop, experience replay, skill improvement',
      endpoints: [
        { path: '/api/learning',          method: '*', purpose: 'LearningEngine: curriculum + evaluation' },
        { path: '/api/self-improvement',  method: '*', purpose: 'SelfImprovementLoop + ReputationMonitor' },
        { path: '/api/reputation',        method: '*', purpose: 'Agent reputation tracking' },
      ],
    },
    'Visual Intelligence': {
      description: 'Computer use, visual QA, screenshot analysis',
      endpoints: [
        { path: '/api/visual-intelligence', method: '*', purpose: 'Screenshot, OCR, visual QA, regression' },
        { path: '/api/vision',              method: '*', purpose: 'Image analysis via vision LLM' },
      ],
    },
    'Social & Creative': {
      description: 'Social intelligence, creative engine, image/video generation',
      endpoints: [
        { path: '/api/social-intelligence', method: '*', purpose: 'Social media analysis + monitoring' },
        { path: '/api/creative',            method: '*', purpose: 'Creative project management' },
        { path: '/api/creative-engine',     method: '*', purpose: 'Story, music, visual content generation' },
        { path: '/api/comfyui',             method: '*', purpose: 'Image + video generation (ComfyUI)' },
      ],
    },
    'Skills & Plugins': {
      description: 'Skill discovery, installation, and management',
      endpoints: [
        { path: '/api/config/skills-registry', method: '*', purpose: 'Browse + install skills from 16 curated registries' },
        { path: '/api/skills',                 method: '*', purpose: 'User skill management' },
        { path: '/api/discovery',              method: '*', purpose: 'Capability discovery engine' },
        { path: '/api/marketplace',            method: '*', purpose: 'Plugin marketplace' },
      ],
    },
    'Infrastructure': {
      description: 'Metrics, performance, scheduling, MCP, tools',
      endpoints: [
        { path: '/api/metrics',           method: '*', purpose: 'Runtime metrics and token consumption' },
        { path: '/api/performance',       method: '*', purpose: 'Latency and throughput monitoring' },
        { path: '/api/scheduler',         method: '*', purpose: 'Job scheduling and management' },
        { path: '/api/tools',             method: '*', purpose: 'LibreChat native tool management' },
        { path: '/api/economy',           method: '*', purpose: 'Token economics and cost tracking' },
        { path: '/api/integration',       method: '*', purpose: 'Third-party integration facade' },
        { path: '/api/capability',        method: '*', purpose: 'Role-based capability management' },
        { path: '/api/workflows',         method: '*', purpose: 'Multi-step workflow automation' },
      ],
    },
  },
  totals: {
    route_files: 108,
    mounted_prefixes: 85,
    tool_count: 41,
    gen_b_phases: 34,
    services: 90,
  },
};

router.get('/', (req, res) => {
  res.json(CAPABILITY_MANIFEST);
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'capability-manifest',
    route_files: CAPABILITY_MANIFEST.totals.route_files,
    mounted_prefixes: CAPABILITY_MANIFEST.totals.mounted_prefixes,
    tool_count: CAPABILITY_MANIFEST.totals.tool_count,
    gen_b_phases: CAPABILITY_MANIFEST.totals.gen_b_phases,
    note: 'GET /api/capabilities for full manifest with every endpoint and its purpose',
  });
});

module.exports = router;
