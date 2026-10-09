'use strict';

/**
 * Face 34 — ResearchOrchestrator (plan §5, §34).
 *
 * Decides WHAT to do, WHEN, WHICH tool, HOW MUCH to search, WHEN to stop,
 * VERIFY or EXPERIMENT — combining rules + heuristics + confidence + budgets
 * + domain policy. Persists checkpoints at every stage so failures degrade to
 * "resume", never "lose everything".
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');
const { config } = require('../core/config');
const { truncate } = require('../core/text');

const ResearchProfile = require('../intent/ResearchProfile');
const ComplexityRouter = require('../router/ComplexityRouter');
const ResourceGovernor = require('../router/ResourceGovernor');
const AcquisitionCascade = require('../acquisition/AcquisitionCascade');
const providers = require('../acquisition/providers');
const ContentPipeline = require('../content/ContentPipeline');
const SourceProfiler = require('../sources/SourceProfiler');
const DependencyAnalyzer = require('../sources/DependencyAnalyzer');
const ClaimExtractor = require('../claims/ClaimExtractor');
const EvidenceEngine = require('../claims/EvidenceEngine');
const ContradictionEngine = require('../claims/ContradictionEngine');
const BiasForensics = require('../bias/BiasForensics');
const OrientationClassifier = require('../bias/OrientationClassifier');
const PerspectiveEngine = require('../perspectives/PerspectiveEngine');
const AdversarialEngine = require('../perspectives/AdversarialEngine');
const GapEngine = require('../research/GapEngine');
const StopEngine = require('../research/StopEngine');
const ConfidenceEngine = require('../research/ConfidenceEngine');
const CheckpointManager = require('./CheckpointManager');
const DomainPolicies = require('./DomainPolicies');

const SESSIONS = () => collection('research_sessions');

/**
 * Run a full research session for a question.
 * @param {object} opts { mode, budget, skipClarification, answers, maxRounds, offline }
 */
async function research(question, opts = {}) {
  const offline = opts.offline === true; // tests inject docs instead of fetching

  // 1) Profile (Face 24)
  const { profile, assessment } = await ResearchProfile.create(question, opts);
  eventbus.emit('ResearchStarted', { session_id: profile.id, question: truncate(question, 120), mode: profile.mode });

  // 2) Mode + budgets (Face 25)
  const route = ComplexityRouter.routingTable(profile);
  const sessionRec = await SESSIONS().insert({
    id: profile.id,
    question,
    profile_id: profile.id,
    mode: route.mode,
    status: 'RUNNING',
    round: 0,
    checkpoints: [],
    created_at: nowIso(),
  });

  // 3) Domain policy (Face 34)
  const policy = DomainPolicies.forDomain(profile.domain);

  try {
    // 4) Acquisition rounds (Faces 26-27)
    let docs = [];
    if (!offline) {
      const search = await _acquire(profile, route, policy, sessionRec.id);
      docs = search.docs;
    } else if (Array.isArray(opts.injectDocs)) {
      for (const d of opts.injectDocs) await ContentPipeline.ingest({ ...d, session_id: sessionRec.id });
      docs = await collection('documents').find((x) => x.metadata && x.metadata.session_id === sessionRec.id);
    }
    await CheckpointManager.save(sessionRec.id, 'SOURCES_COLLECTED', { doc_ids: docs.map((d) => d.id) });

    // 5) Dependency analysis (Face 28)
    const dependencyGraph = await DependencyAnalyzer.analyze(docs);

    // 6) Claims (Face 29)
    const claims = [];
    for (const doc of docs) {
      const chunks = await ContentPipeline.chunksFor(doc.id);
      const cs = await ClaimExtractor.extractForDoc(doc, chunks);
      claims.push(...cs);
    }
    await CheckpointManager.save(sessionRec.id, 'CLAIMS_EXTRACTED', { claim_ids: claims.map((c) => c.id) });

    // 7) Evidence + contradictions (Face 29)
    for (const doc of docs) {
      for (const claim of claims) {
        if (claim.doc_id !== doc.id) {
          const rel = EvidenceEngine.relevance(doc.content || '', claim.text);
          if (rel >= 0.1) await EvidenceEngine.add({ claim, doc, relation: 'SUPPORTS', dependency_graph: dependencyGraph });
        } else {
          await EvidenceEngine.add({ claim, doc, relation: 'SUPPORTS', dependency_graph: dependencyGraph });
        }
      }
    }
    const contradictions = await ContradictionEngine.scan(claims);
    await CheckpointManager.save(sessionRec.id, 'EVIDENCE_BUILT', { evidence_count: (await collection('evidence').all()).length });

    // 8) Bias forensics (Face 30) — context only
    for (const doc of docs) {
      const orientation = OrientationClassifier.classify({ text: doc.content, publisher: doc.publisher });
      const articleBias = BiasForensics.analyzeArticle(doc);
      const framing = BiasForensics.framingProfile(doc, docs);
      if (doc.source_id) await SourceProfiler.attachOrientation(doc.source_id, { orientation: orientation.orientation, confidence: orientation.confidence, bias: articleBias.metrics, bias_confidence: orientation.confidence });
    }

    // 9) Adversarial tasks for the strongest claims (Face 31)
    const keyClaims = claims.slice(0, 5);
    for (const claim of keyClaims) {
      await AdversarialEngine.createTasks(claim, { political: profile.political_analysis });
    }

    // 10) Evidence summaries → confidence (Faces 29, 32)
    const summaries = [];
    for (const claim of claims) summaries.push(await EvidenceEngine.summarize(claim.id));
    for (const s of summaries) {
      await ConfidenceEngine.record(sessionRec.id, s.claim_id, 0, s.confidence, 'initial evidence aggregation');
    }

    // 11) Gap detection + stop decision (Face 32)
    const round = 1;
    const gapResult = await GapEngine.detect({ session: sessionRec, docs, claims, contradictions, evidenceSummaries: summaries, round });
    const stop = StopEngine.shouldStop({
      round, mode: route.mode, docs, claims,
      evidenceSummaries: summaries,
      contradictions,
      budgetUsed: docs.length, budgetMax: route.source_budget,
    });

    await CheckpointManager.save(sessionRec.id, 'VERIFICATION_COMPLETED', { summaries, stop });
    const devilTask = await AdversarialEngine.challengeMode(sessionRec, Math.max(0, ...summaries.map((s) => s.confidence)), config.CHALLENGE_THRESHOLD);

    // 12) Final answer (provisional synthesis from verified claims)
    const answer = _synthesize(profile, claims, summaries, contradictions, dependencyGraph, stop, gapResult);

    await CheckpointManager.save(sessionRec.id, 'ANSWER_GENERATED', { answer });
    await SESSIONS().update(sessionRec.id, {
      status: stop.stop ? 'COMPLETED' : 'COMPLETED_WITH_GAPS',
      answer,
      dependency_summary: dependencyGraph.summary,
      stop_reasons: stop.reasons,
      gaps: gapResult.gaps,
    });
    eventbus.emit('ResearchCompleted', { session_id: sessionRec.id, status: stop.stop ? 'COMPLETED' : 'COMPLETED_WITH_GAPS', claims: claims.length });

    return { session_id: sessionRec.id, profile, route, answer, claims, summaries, contradictions, dependency_summary: dependencyGraph.summary, gaps: gapResult.gaps, stop, devil_task: devilTask };
  } catch (err) {
    await SESSIONS().update(sessionRec.id, { status: 'FAILED', error: err.message });
    const last = await CheckpointManager.latestValid(sessionRec.id);
    throw Object.assign(err, { session_id: sessionRec.id, resume_from: last ? last.checkpoint.stage : null });
  }
}

/** Multi-provider search + fetch + ingest; dedupes URLs, respects budgets. */
async function _acquire(profile, route, policy, sessionId) {
  const seen = new Set();
  const docs = [];
  const searchProviders = profile.source_types.filter((t) => providers.REGISTRY[t]);
  const queries = [profile.question, ...profile.entities.slice(0, 2).map((e) => `${e} ${profile.domain}`)];

  eventbus.emit('SearchStarted', { session_id: sessionId, providers: searchProviders, queries: queries.length });

  for (const providerName of searchProviders) {
    if (docs.length >= route.source_budget) break;
    const fn = providers.REGISTRY[providerName];
    const isFeed = providerName === 'news';
    for (const q of queries) {
      if (docs.length >= route.source_budget) break;
      let res;
      try {
        res = isFeed ? await fn('https://feeds.bbci.co.uk/news/world/rss.xml', { limit: 5 }) : await fn(q, { limit: 6 });
      } catch { res = { results: [], access_status: 'ACCESS_LIMITED' }; }

      eventbus.emit('SourceFound', { session_id: sessionId, provider: providerName, results: (res.results || []).length, access_status: res.access_status || 'OK' });
      if (res.access_status === 'ACCESS_LIMITED') continue;

      for (const r of res.results) {
        if (docs.length >= route.source_budget) break;
        if (!r.url || seen.has(r.url)) continue;
        seen.add(r.url);
        const fetched = await AcquisitionCascade.fetchUrl(r.url, { session_id: sessionId, allowBrowser: false });
        if (!fetched.doc) continue;
        const ing = await ContentPipeline.ingest({
          url: fetched.doc.canonical_url || r.url,
          title: fetched.doc.title || r.title,
          text: fetched.doc.text,
          source_id: `${providerName}:${r.url.slice(0, 60)}`,
          publisher: r.provider,
          extraction_method: fetched.doc.extraction_method,
          session_id: sessionId,
        });
        if (ing.ok) {
          const prof = await SourceProfiler.profile({ url: ing.doc.canonical_url, publisher: r.provider || providerName, fetched_via: fetched.level });
          ing.doc.source_id = prof.source.source_id;
          docs.push(ing.doc);
        }
      }
    }
  }
  return { docs };
}

/** Provisional synthesis — claims with their evidence, uncertainties visible. */
function _synthesize(profile, claims, summaries, contradictions, dependencyGraph, stop, gapResult) {
  const byId = new Map(summaries.map((s) => [s.claim_id, s]));
  const ranked = claims
    .map((c) => ({ claim: c, summary: byId.get(c.id) }))
    .sort((a, b) => ((b.summary && b.summary.confidence) || 0) - ((a.summary && a.summary.confidence) || 0));

  const top = ranked.slice(0, 6).map(({ claim, summary }) => ({
    claim: truncate(claim.text, 200),
    status: summary ? summary.status : 'UNVERIFIED',
    confidence: summary ? summary.confidence : 0,
    evidence: summary ? summary.evidence : null,
    source_doc: claim.doc_id,
    video_ts: claim.video_ts || null,
  }));

  const enough = top.some((t) => ['TRUE', 'MOSTLY_TRUE', 'EXPERIMENTALLY_VERIFIED'].includes(t.status));

  return {
    conclusion: enough
      ? `Best-supported answer (evidence-ranked, audit below): ${top[0] ? top[0].claim : 'n/a'}`
      : (top.length ? 'NOT ENOUGH EVIDENCE to conclude. Best candidates (unverified):' : 'NOT ENOUGH EVIDENCE. No claims could be extracted.'),
    claims: top,
    uncertainties: {
      contradictions: contradictions.map((c) => ({ type: c.type, detail: c.detail, resolved: c.resolved })),
      open_gaps: gapResult.gaps.map((g) => ({ type: g.type, detail: g.detail })),
      dependent_sources: dependencyGraph.summary,
      note: 'transparency rule (plan §106): uncertainty is never hidden',
    },
    hypotheses: profile.explicit_hypotheses || [],
    generated_at: nowIso(),
  };
}

/** Resume a failed session from its last valid checkpoint. */
async function resume(sessionId) {
  const session = await SESSIONS().get(sessionId);
  if (!session) throw new Error('session not found');
  const last = await CheckpointManager.latestValid(sessionId);
  return {
    session_id: sessionId,
    resumable: Boolean(last),
    from_stage: last ? last.checkpoint.stage : null,
    state: last ? last.state : null,
  };
}

module.exports = { research, resume, _synthesize };
