'use strict';

/**
 * Face 38 — HTTP API (plan §88). Zero-dependency node http server so the
 * branch is self-contained. Every route calls the REAL engines — no fake data.
 *
 *   POST /api/research-os/research                  { question, mode?, budget?, answers? }
 *   GET  /api/research-os/research/:id
 *   POST /api/research-os/research/:id/continue
 *   POST /api/research-os/research/:id/verify
 *   GET  /api/research-os/research/:id/sources
 *   GET  /api/research-os/research/:id/claims
 *   GET  /api/research-os/research/:id/evidence
 *   GET  /api/research-os/research/:id/graph
 *   GET  /api/research-os/research/:id/timeline
 *   GET  /api/research-os/research/:id/report
 *   POST /api/research-os/research/:id/experiment
 *   POST /api/research-os/rag/query                 { query, contested_claim_id? }
 *   GET  /api/research-os/knowledge
 *   POST /api/research-os/knowledge/consolidate     { session_id, topic }
 *   GET  /api/research-os/compression/stats
 *   GET  /api/research-os/metrics/:id
 *   POST /api/research-os/heuristics                (19A.24 user rules, gated)
 *   GET  /api/research-os/events/:session_id
 */

const http = require('http');
const { URL } = require('url');
const Orchestrator = require('../orchestrator/ResearchOrchestrator');
const HybridRAG = require('../rag/HybridRAG');
const KnowledgeConsolidator = require('../knowledge/KnowledgeConsolidator');
const FreshnessManager = require('../knowledge/FreshnessManager');
const ResourceGovernor = require('../router/ResourceGovernor');
const eventbus = require('../core/eventbus');
const store = require('../core/store');
const { config } = require('../core/config');
const { truncate } = require('../core/text');

function json(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { if (data.length < 1e6) data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({ _parse_error: true }); }
    });
  });
}

async function routeHandler(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname.replace(/\/+$/, '');
  const m = req.method;

  if (p === '/health') return json(res, 200, { ok: true, service: 'research-os', time: new Date().toISOString() });

  const rm = p.match(/^\/api\/research-os\/research$/);
  if (rm && m === 'POST') {
    const body = await readBody(req);
    if (!body.question) return json(res, 400, { error: 'question required' });
    try {
      const result = await Orchestrator.research(body.question, {
        mode: body.mode, budget: body.budget, answers: body.answers,
        skipClarification: body.skip_clarification,
        offline: body.offline === true, injectDocs: body.docs || [],
      });
      return json(res, 200, result);
    } catch (err) {
      return json(res, 500, { error: err.message, session_id: err.session_id, resume_from: err.resume_from });
    }
  }

  const rid = p.match(/^\/api\/research-os\/research\/([^/]+)(\/([a-z]+))?$/);
  if (rid) {
    const [, id, , action] = rid;
    const session = await store.collection('research_sessions').get(id);
    if (!session) return json(res, 404, { error: 'session not found' });

    if (!action) return json(res, 200, session);

    if (action === 'sources') {
      const docs = await store.collection('documents').find((d) => d.metadata && d.metadata.session_id === id);
      const relations = await store.collection('source_relations').all();
      return json(res, 200, { sources: docs.map((d) => ({ id: d.id, url: d.canonical_url, title: d.title, hash: d.content_hash })), dependencies: relations });
    }
    if (action === 'claims') {
      const claims = await store.collection('claims').find((c) => (session.answer ? session.answer.claims.some((ac) => ac.claim === c.text) : true));
      return json(res, 200, { claims });
    }
    if (action === 'evidence') {
      const ev = await store.collection('evidence').all();
      return json(res, 200, { evidence: ev });
    }
    if (action === 'graph') {
      const deps = await store.collection('source_relations').all();
      const ents = await store.collection('entities').all();
      const ctrs = await store.collection('contradictions').all();
      return json(res, 200, { dependency_graph: deps, entities: ents, contradictions: ctrs });
    }
    if (action === 'timeline') {
      return json(res, 200, { timeline: eventbus.eventsFor(id) });
    }
    if (action === 'report') {
      return json(res, 200, ResourceGovernor.report(id));
    }
    if (action === 'continue' && m === 'POST') {
      const resume = await Orchestrator.resume(id);
      return json(res, 200, resume);
    }
    if (action === 'verify' && m === 'POST') {
      const claims = await store.collection('claims').find(() => true);
      const EvidenceEngine = require('../claims/EvidenceEngine');
      const summaries = [];
      for (const c of claims.slice(0, 20)) summaries.push(await EvidenceEngine.summarize(c.id));
      return json(res, 200, { verifications: summaries });
    }
    if (action === 'experiment' && m === 'POST') {
      const body = await readBody(req);
      const ExperimentEngine = require('../experiment/ExperimentEngine');
      const HypothesisEngine = require('../experiment/HypothesisEngine');
      const hyps = body.hypothesis_id
        ? [await store.collection('hypotheses').get(body.hypothesis_id)].filter(Boolean)
        : await store.collection('hypotheses').find((h) => h.session_id === id);
      if (!hyps.length) return json(res, 400, { error: 'no hypotheses for session; pass hypothesis_id or generate first' });
      const results = [];
      for (const h of hyps.slice(0, config.MAX_EXPERIMENTS)) {
        results.push(await ExperimentEngine.runExperiment({ session_id: id, hypothesis: h, code: body.code, timeout_ms: body.timeout_ms || 3000 }));
      }
      return json(res, 200, { experiments: results });
    }
  }

  if (p === '/api/research-os/rag/query' && m === 'POST') {
    const body = await readBody(req);
    if (!body.query) return json(res, 400, { error: 'query required' });
    const out = await HybridRAG.retrieve(body);
    return json(res, 200, out);
  }

  if (p === '/api/research-os/knowledge' && m === 'GET') {
    return json(res, 200, { knowledge: await store.collection('knowledge').all() });
  }
  if (p === '/api/research-os/knowledge/consolidate' && m === 'POST') {
    const body = await readBody(req);
    const out = await KnowledgeConsolidator.consolidate(body);
    return json(res, out.ok ? 200 : 400, out);
  }
  if (p === '/api/research-os/compression/stats' && m === 'GET') {
    return json(res, 200, { runs: await store.collection('compression_runs').all() });
  }
  if (p.startsWith('/api/research-os/metrics/')) {
    const id = p.split('/').pop();
    const gov = ResourceGovernor.report(id);
    const evals = await store.collection('evaluation_runs').find((e) => e.session_id === id);
    return json(res, 200, { resources: gov, evaluation: evals });
  }
  if (p === '/api/research-os/heuristics' && m === 'POST') {
    const body = await readBody(req);
    const DomainPolicies = require('../orchestrator/DomainPolicies');
    const decision = DomainPolicies.userHeuristic(body);
    return json(res, decision.accepted ? 200 : 422, decision);
  }
  if (p.startsWith('/api/research-os/events/')) {
    const sid = p.split('/').pop();
    return json(res, 200, { events: eventbus.eventsFor(sid) });
  }

  return json(res, 404, { error: 'not_found', path: p });
}

function start(port = 0, cb) {
  const server = http.createServer((req, res) => {
    routeHandler(req, res).catch((err) => json(res, 500, { error: err.message }));
  });
  return server.listen(port, () => cb && cb(server.address().port));
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3210);
  start(port, (p) => console.log(`[ResearchOS:api] listening on http://localhost:${p}`));
}

module.exports = { start, routeHandler };
