'use strict';

/**
 * Face 29 — ClaimExtractor (plan §21).
 *
 * Extracts ATOMIC claims: one sentence may yield several claims (C1 "X
 * occurred", C2 "X occurred in 2025", C3 "X caused Y"). Each claim keeps its
 * quote span for provenance. Claims are propositions, not truth — status
 * starts UNVERIFIED regardless of the source's reputation (plan §2).
 */

const { uid, nowIso } = require('../core/ids');
const { sentences, normalize, truncate } = require('../core/text');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');

const CLAIMS = () => collection('claims');

const YEAR = /\b(19|20)\d{2}\b/;
const MODALITY_HINTS = {
  speculation: ['maybe', 'perhaps', 'possibly', 'quizá', 'quizas', 'tal vez', 'podría', 'podria', 'could', 'might'],
  rumor: ['rumor', 'rumor has it', 'se dice', 'se rumorea', 'allegedly', 'presumably', 'presuntamente'],
  hypothesis: ['hypothesis', 'hipótesis', 'hipotesis', 'we hypothesize', 'suggests that', 'sugiere que'],
  inference: ['therefore', 'so', 'it follows', 'por lo tanto', 'se deduce', 'implies', 'implica'],
};

function splitAtomic(sentence) {
  const atoms = [];
  // temporal clause splitting: "X happened. X happened in 2025."
  const timeMatch = sentence.match(/^(.*?)(?:\s+(?:in|en)\s+((19|20)\d{2}))([.!]?)/i);
  if (timeMatch && timeMatch[1] && timeMatch[1].split(' ').length > 3) {
    atoms.push({ text: timeMatch[1].trim(), time: null });
    atoms.push({ text: `${timeMatch[1].trim()} in ${timeMatch[2]}`, time: timeMatch[2] });
  } else {
    atoms.push({ text: sentence, time: null });
  }
  // causal clause splitting "X caused/because Y"
  const causal = atoms[0].text.match(/^(.{15,}?)\s+(?:caused|causó|causo|led to|debido a|porque)\s+(.{10,})$/i);
  if (causal) {
    atoms.push({ text: `${causal[1].trim()} caused ${causal[2].trim()}`, time: atoms[0].time });
  }
  return atoms;
}

function detectModality(sentence) {
  const n = ' ' + normalize(sentence) + ' ';
  for (const [mod, words] of Object.entries(MODALITY_HINTS)) {
    if (words.some((w) => n.includes(w))) return mod;
  }
  return 'assertive';
}

function decompose(sentence) {
  const n = sentence;
  const subjectMatch = n.match(/^(?:the\s+|la\s+|el\s+|los\s+|las\s+)?([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ-]*(?:\s+[\wÁÉÍÓÚÑáéíóúñ-]+){0,3}?)/u);
  const subject = subjectMatch ? subjectMatch[1] : null;
  let predicate = null;
  let object = null;
  const verbs = ['is', 'are', 'was', 'were', 'occurred', 'happened', 'caused', 'has', 'have', 'launched', 'released', 'won', 'announced', 'es', 'fue', 'son', 'ocurrió', 'ocurrio', 'ganó', 'gano', 'anunció', 'anuncio'];
  for (const v of verbs) {
    const idx = n.toLowerCase().indexOf(v);
    if (idx > 0) { predicate = v; break; }
  }
  if (predicate) {
    const after = n.slice(n.toLowerCase().indexOf(predicate) + predicate.length).trim();
    object = after ? after.replace(/[.!?]+$/, '').trim() : null;
  }
  return { subject, predicate, object };
}

/**
 * @param {object} doc — { id, canonical_url, source_id, content, video }
 * @returns { claims: Claim[] }
 */
function extract(doc) {
  const text = doc.content || doc.text || '';
  const claims = [];
  for (const sentence of sentences(text)) {
    for (const atom of splitAtomic(sentence)) {
      if (atom.text.split(' ').length < 4) continue;
      const { subject, predicate, object } = decompose(atom.text);
      claims.push({
        id: uid('clm'),
        doc_id: doc.id || null,
        source_id: doc.source_id || null,
        text: atom.text.trim(),
        quote_span: { sentence: truncate(sentence, 400), doc_id: doc.id || null },
        subject,
        predicate,
        object: object ? truncate(object, 200) : null,
        time: atom.time || (YEAR.test(atom.text) ? atom.text.match(YEAR)[0] : null),
        location: null,
        modality: detectModality(atom.text),
        source_ids: [doc.source_id].filter(Boolean),
        evidence_ids: [],
        confidence: 0,
        status: 'UNVERIFIED',
        video_ts: doc.video ? null : undefined,
        created_at: nowIso(),
      });
    }
  }
  return claims;
}

/**
 * Bulk insert claims for a document and wire video timestamps where present.
 */
async function extractForDoc(docRecord, chunkRecords) {
  const claims = extract({ id: docRecord.id, source_id: docRecord.source_id, content: docRecord.content, video: docRecord.video });
  const saved = [];
  for (const c of claims) {
    // attach video timestamp: find the chunk containing this claim
    if (docRecord.video && chunkRecords) {
      const chunk = chunkRecords.find((ch) => ch.video && ch.text && c.text && ch.text.includes(c.text.slice(0, 40)));
      if (chunk) c.video_ts = chunk.video.timestamp;
    }
    const rec = await CLAIMS().insert(c);
    saved.push(rec);
  }
  if (saved.length) {
    eventbus.emit('ClaimExtracted', { doc_id: docRecord.id, count: saved.length, session_id: docRecord.session_id || (docRecord.metadata && docRecord.metadata.session_id) || null });
  }
  return saved;
}

module.exports = { extract, extractForDoc, splitAtomic, detectModality, decompose, collection: CLAIMS };
