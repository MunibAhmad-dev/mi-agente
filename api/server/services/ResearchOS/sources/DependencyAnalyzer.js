'use strict';

/**
 * Face 28 — DependencyAnalyzer (plan §23, §24, §41).
 *
 * Detects: copied_from, derived_from, cites, same_original_source,
 * same_document, same_wording, syndicated. Converts "20 apparent sources"
 * into "3 independent sources, 1 primary source". repetition ≠ corroboration.
 */

const { uid, nowIso } = require('../core/ids');
const { collection } = require('../core/store');
const { config } = require('../core/config');
const { shingleSimilarity, jaccard, contentWords, normalize } = require('../core/text');

const RELATIONS = () => collection('source_relations');

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Union-find over source ids to compute connected components. */
function _find(parent, x) {
  while (parent.get(x) !== x) {
    parent.set(x, parent.get(parent.get(x))); // path halving
    x = parent.get(x);                        // advance toward the root
  }
  return x;
}
function _union(parent, a, b) {
  const ra = _find(parent, a);
  const rb = _find(parent, b);
  if (ra !== rb) parent.set(rb, ra);
}

/**
 * @param {Array} docs — documents with { id, canonical_url, title, text,
 *   content_hash, publisher, fetched_at, links? }
 * @returns { graph } with nodes, edges and independence summary
 */
async function analyze(docs) {
  // accept both canonical_url and url
  const norm = docs.map((d) => ({ ...d, canonical_url: d.canonical_url || d.url || '' }));
  const nodes = norm.map((d) => ({
    id: d.id,
    host: hostOf(d.canonical_url || ''),
    hash: d.content_hash,
    title: d.title || '',
  }));
  const edges = [];
  const parent = new Map(nodes.map((n) => [n.id, n.id]));

  const hasCopiedFrom = new Set();

  for (let i = 0; i < norm.length; i += 1) {
    for (let j = i + 1; j < docs.length; j += 1) {
      const A = norm[i];
      const B = norm[j];
      if (!A.text || !B.text) continue;

      // 1) exact duplicate
      if (A.content_hash && A.content_hash === B.content_hash) {
        edges.push({ from: B.id, to: A.id, relation: 'copied_from', similarity: 1, evidence: 'identical_content_hash' });
        hasCopiedFrom.add(B.id);
        _union(parent, B.id, A.id);
        continue;
      }

      // 2) same wording / syndication
      const sim = shingleSimilarity(A.text, B.text);
      if (sim >= config.DUPLICATE_SHINGLE_SIM) {
        const older = Date.parse(A.fetched_at || 0) <= Date.parse(B.fetched_at || 0) ? A : B;
        const newer = older === A ? B : A;
        edges.push({ from: newer.id, to: older.id, relation: 'syndicated', similarity: sim, evidence: `shingle_${sim.toFixed(2)}` });
        hasCopiedFrom.add(newer.id);
        _union(parent, newer.id, older.id);
        continue;
      }
      if (sim >= config.SAME_WORDING_SIM) {
        edges.push({ from: B.id, to: A.id, relation: 'same_wording', similarity: sim, evidence: 'high_shingle_overlap' });
        // suspicious but not automatic copy — keep checking citations below
      }

      // 3) cites: either document links to the other's URL (usually the
      // later-fetched doc cites the earlier one).
      const aUrl = (A.canonical_url || '').split('#')[0];
      const bUrl = (B.canonical_url || '').split('#')[0];
      if (bUrl && (A.links || []).some((l) => l && l.split('#')[0] === bUrl)) {
        edges.push({ from: A.id, to: B.id, relation: 'cites', similarity: sim, evidence: 'outgoing_link' });
      } else if (aUrl && (B.links || []).some((l) => l && l.split('#')[0] === aUrl)) {
        edges.push({ from: B.id, to: A.id, relation: 'cites', similarity: sim, evidence: 'outgoing_link' });
      }
    }
  }

  // same_original_source: ALL dependency edges join components — copying,
  // syndication AND citation chains (spec §23-24: A cites B cites C is one
  // independent source, not three).
  for (const e of edges) {
    if (['copied_from', 'syndicated', 'cites'].includes(e.relation)) _union(parent, e.from, e.to);
  }

  const components = new Map();
  for (const n of nodes) {
    const root = _find(parent, n.id);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(n.id);
  }

  const independent_sources = components.size;
  const original_sources = nodes.length - hasCopiedFrom.size;

  for (const e of edges) {
    await RELATIONS().insert({
      from_doc: e.from, to_doc: e.to, relation: e.relation,
      similarity: Math.round(e.similarity * 100) / 100,
      evidence: e.evidence, session_id: docs[0] && docs[0].session_id || null,
      created_at: nowIso(),
    });
  }

  return {
    graph_id: uid('dpg'),
    nodes,
    edges,
    summary: {
      apparent_sources: nodes.length,
      independent_sources,
      original_sources,
      note: independent_sources < nodes.length
        ? `${nodes.length - independent_sources} apparent sources are dependent on others (repetition ≠ corroboration)`
        : 'all sources independent so far',
    },
  };
}

/**
 * Root component of a doc inside a dependency graph (proper union-find over
 * all dependency edges). Used by EvidenceEngine for independence checks.
 */
function componentOf(graph, id) {
  const parent = new Map();
  for (const n of graph.nodes) parent.set(n.id, n.id);
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  for (const e of graph.edges) {
    if (['copied_from', 'syndicated', 'cites'].includes(e.relation)) union(e.from, e.to);
  }
  return parent.has(id) ? find(id) : id; // unknown doc = own component
}

module.exports = { analyze, hostOf, componentOf };
