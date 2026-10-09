'use strict';

/**
 * Face 36 — KnowledgeConsolidator (plan §40, §41, §46).
 *
 * 1000 documents → entities/claims/facts/relationships/summaries. Semantic
 * dedup. RAW is never deleted. Storage levels L0 RAW → L1 CLEAN → L2 DEDUP →
 * L3 STRUCTURED → L4 KNOWLEDGE → L5 SUMMARY with MEASURED byte sizes (never
 * invented ratios).
 */

const { uid, nowIso, sha1 } = require('../core/ids');
const { collection } = require('../core/store');
const { jaccard, contentWords, truncate } = require('../core/text');

const DOCS = () => collection('documents');
const KNOWLEDGE = () => collection('knowledge');
const ENTITIES = () => collection('entities');
const RUNS = () => collection('compression_runs');

/** Entity extraction: capitalized n-grams + alias merging ("RTX 5090" = "NVIDIA GeForce RTX 5090"). */
function extractEntities(docs) {
  const counts = new Map();
  for (const d of docs) {
    const text = d.content || '';
    for (const m of text.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3})\b/g) || []) {
      const key = m.trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  // alias resolution: merge shorter names contained in longer ones
  const names = [...counts.keys()].sort((a, b) => b.length - a.length);
  const canonical = [];
  for (const n of names) {
    const parent = canonical.find((c) => c.includes(n));
    if (parent) {
      counts.set(parent, (counts.get(parent) || 0) + counts.get(n));
    } else canonical.push(n);
  }
  return canonical.slice(0, 30).map((name) => ({ name, mentions: counts.get(name) || 0, aliases: names.filter((n) => n !== name && name.includes(n)).slice(0, 5) }));
}

/** Semantic dedup: exact hash + jaccard near-duplicate detection. */
function dedup(docs) {
  const seenHash = new Set();
  const kept = [];
  const dropped = [];
  const reps = docs.map((d) => new Set(contentWords(d.content || '').slice(0, 200)));
  docs.forEach((d, i) => {
    if (d.content_hash && seenHash.has(d.content_hash)) { dropped.push({ doc: d.id, reason: 'exact_duplicate' }); return; }
    let nearDup = false;
    for (let j = 0; j < kept.length; j += 1) {
      const k = kept[j].index;
      const sim = jaccard(reps[i], reps[k]);
      if (sim >= 0.8) { nearDup = true; dropped.push({ doc: d.id, reason: `near_duplicate_of_${docs[k].id} (${sim.toFixed(2)})` }); break; }
    }
    if (!nearDup) { kept.push({ index: i, doc: d }); seenHash.add(d.content_hash); }
  });
  return { kept: kept.map((k) => k.doc), dropped };
}

/**
 * Consolidate a session's documents into knowledge.
 * @param {object} input { session_id, topic }
 */
async function consolidate(input) {
  const { session_id, topic } = input;
  const docs = (await DOCS().find((d) => d.metadata && d.metadata.session_id === session_id));
  if (!docs.length) return { ok: false, reason: 'no_documents' };

  const bytes = (arr) => arr.reduce((a, d) => a + Buffer.byteLength(d.content || '', 'utf8'), 0);

  // L0 RAW
  const l0 = bytes(docs);
  // L1 CLEAN
  const clean = docs.map((d) => ({ ...d, content: (d.content || '').replace(/\s+/g, ' ').trim() }));
  const l1 = bytes(clean);
  // L2 DEDUP
  const { kept, dropped } = dedup(clean);
  const l2 = bytes(kept);
  // L3 STRUCTURED — claims + entities. Claim set may live in the claims
  // collection OR on the documents themselves (extract-only runs).
  let claims = await collection('claims').find((c) => docs.some((d) => d.id === c.doc_id));
  if (!claims.length) {
    const ClaimExtractor = require('../claims/ClaimExtractor');
    for (const d of kept) {
      claims.push(...ClaimExtractor.extract({ id: d.id, source_id: d.source_id, content: d.content }));
    }
  }
  const ents = extractEntities(kept);
  const structured = JSON.stringify({ claims: claims.map((c) => ({ t: c.text, s: c.status })), entities: ents });
  const l3 = Buffer.byteLength(structured, 'utf8');
  // L4 KNOWLEDGE — consolidated statements (dedup by content-word key)
  const knowledgeList = buildStatements(claims);
  const l4 = Buffer.byteLength(JSON.stringify(knowledgeList), 'utf8');
  // L5 SUMMARY
  const summary = `${topic || 'Topic'}: ${knowledgeList.length} consolidated statements from ${docs.length} documents (${kept.length} after dedup). Key entities: ${ents.slice(0, 5).map((e) => e.name).join(', ')}.`;
  const l5 = Buffer.byteLength(summary, 'utf8');

  for (const e of ents) {
    const existing = ENTITIES().find((x) => x.name === e.name)[0];
    if (!existing) await ENTITIES().insert({ name: e.name, mentions: e.mentions, aliases: e.aliases, relations: [], first_seen: nowIso() });
  }

  const rec = await KNOWLEDGE().insert({
    id: uid('knw'),
    session_id,
    topic: topic || 'general',
    statements: knowledgeList.slice(0, 50),
    entities: ents.slice(0, 10),
    summary,
    created_at: nowIso(),
  });

  const run = await RUNS().insert({
    id: uid('cmp'),
    session_id,
    dataset: 'session_documents',
    input_docs: docs.length,
    dedup_dropped: dropped.length,
    levels: {
      L0_raw_bytes: l0, L1_clean_bytes: l1, L2_dedup_bytes: l2,
      L3_structured_bytes: l3, L4_knowledge_bytes: l4, L5_summary_bytes: l5,
    },
    ratios: {
      clean_vs_raw: l0 ? Math.round(l1 / l0 * 1000) / 1000 : 0,
      dedup_vs_raw: l0 ? Math.round(l2 / l0 * 1000) / 1000 : 0,
      structured_vs_raw: l0 ? Math.round(l3 / l0 * 1000) / 1000 : 0,
      knowledge_vs_raw: l0 ? Math.round(l4 / l0 * 1000) / 1000 : 0,
      summary_vs_raw: l0 ? Math.round(l5 / l0 * 1000) / 1000 : 0,
    },
    measured: true, // ratios are computed from real data — never invented (§46)
    created_at: nowIso(),
  });

  return { ok: true, knowledge: rec, compression_run: run, dropped_duplicates: dropped.length };
}

/** Deduplicate claims into knowledge statements keyed by content words. */
function buildStatements(claims) {
  const statements = {};
  for (const c of claims) {
    const key = sha1(contentWords(c.text || '').sort().join('-')).slice(0, 10);
    if (!key) continue;
    if (!statements[key] || (c.status !== 'UNVERIFIED' && statements[key].status === 'UNVERIFIED')) {
      statements[key] = { statement: truncate(c.text || '', 240), status: c.status, sources: c.source_ids, evidence: (c.evidence_ids || []).length };
    }
  }
  return Object.values(statements);
}

module.exports = { consolidate, extractEntities, dedup };
