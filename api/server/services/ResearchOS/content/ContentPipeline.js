'use strict';

/**
 * Face 27 — ContentPipeline (plan §15, §16, §17).
 *
 * RAW → NORMALIZE → EXTRACT → SEGMENT → METADATA → (embeddings later in RAG).
 * Produces UniversalDocument records persisted in `documents` +
 * `document_chunks`. Video-derived content MUST carry video_id + timestamp +
 * transcript_segment (enforced here, not by convention).
 */

const { uid, nowIso, sha1 } = require('../core/ids');
const { sentences, truncate } = require('../core/text');
const { collection } = require('../core/store');
const eventbus = require('../core/eventbus');
const VectorStore = require('../rag/VectorStore');
const KeywordStore = require('../rag/KeywordStore');

const DOCUMENTS = () => collection('documents');
const CHUNKS = () => collection('document_chunks');

const CHUNK_TARGET = 800;
const CHUNK_OVERLAP_SENTENCES = 1;

function language(text) {
  const t = ' ' + String(text || '').slice(0, 3000).toLowerCase() + ' ';
  const es = (t.match(/\b(que|de|el|la|los|una|para|con|por|como|más|pero|sus|ya|fue)\b/g) || []).length;
  const en = (t.match(/\b(the|and|of|to|is|that|for|with|this|from|have|was|are)\b/g) ?? []).length;
  if (es > en * 1.3) return 'es';
  if (en > es * 1.3) return 'en';
  return es || en ? (es >= en ? 'es' : 'en') : 'unknown';
}

function normalizeText(text) {
  return String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function segment(text) {
  const sents = sentences(text);
  const chunks = [];
  let cur = [];
  let len = 0;
  for (const s of sents) {
    cur.push(s);
    len += s.length;
    if (len >= CHUNK_TARGET) {
      chunks.push(cur.join(' '));
      cur = cur.slice(Math.max(0, cur.length - CHUNK_OVERLAP_SENTENCES));
      len = cur.join(' ').length;
    }
  }
  if (cur.length) chunks.push(cur.join(' '));
  return chunks.filter((c) => c.length >= 40);
}

/**
 * Create a UniversalDocument from extracted content.
 * @param {object} input { url, title, text, source_id, publisher, author,
 *   published_at, extraction_method, media, video: {id, segments:[{ts,text}]} }
 */
async function ingest(input) {
  const content = normalizeText(input.text);
  if (!content) return { ok: false, reason: 'empty_content' };

  const doc = {
    id: uid('doc'),
    _id: undefined,
    canonical_url: input.url || null,
    source_id: input.source_id || null,
    author: input.author || null,
    publisher: input.publisher || null,
    title: input.title || (content.slice(0, 80)),
    content,
    links: input.links || [],  // outbound citations — used by DependencyAnalyzer
    media: input.media || [],
    language: input.language || language(content),
    created_at: nowIso(),
    published_at: input.published_at || null,
    fetched_at: nowIso(),
    extraction_method: input.extraction_method || 'unknown',
    session_id: input.session_id || null,
    content_hash: sha1(content),
    metadata: { ...(input.metadata || {}), session_id: input.session_id || null },
    video: null,
  };

  // Video knowledge (plan §17): provenance down to timestamp.
  if (input.video && input.video.id) {
    doc.video = {
      video_id: input.video.id,
      timestamps: input.video.segments.map((s) => s.ts),
      transcript_segments: input.video.segments.length,
    };
  }

  const saved = await DOCUMENTS().insert(doc);
  saved._id = saved._id || saved.id;

  // Segmentation — video segments keep their timestamps on the chunk.
  const chunkRecords = [];
  if (input.video && input.video.id && input.video.segments.length) {
    for (const seg of input.video.segments) {
      const text = normalizeText(seg.text);
      if (!text) continue;
      chunkRecords.push({
        _id: uid('chk'),
        doc_id: saved.id,
        idx: chunkRecords.length,
        text,
        video: { video_id: input.video.id, timestamp: seg.ts, segment: seg.label || null },
        claim_refs: [],
        embedding: null,
      });
    }
  } else {
    const parts = segment(content);
    parts.forEach((text, idx) => chunkRecords.push({
      _id: uid('chk'),
      doc_id: saved.id,
      idx,
      text,
      video: null,
      claim_refs: [],
      embedding: null,
    }));
  }
  for (const c of chunkRecords) {
    await CHUNKS().insert(c);
    // index chunk into both retrieval legs (hybrid RAG needs it searchable)
    await VectorStore.upsert(c._id, c.text, { doc_id: c.doc_id, video: c.video });
    await KeywordStore.index(c._id, c.text, { doc_id: c.doc_id, video: c.video });
  }

  eventbus.emit('DocumentIngested', { doc_id: saved.id, url: saved.canonical_url, chunks: chunkRecords.length, session_id: input.session_id || null });
  return { ok: true, doc: saved, chunks: chunkRecords };
}

/** Ingest a video transcript with enforced provenance. */
async function ingestVideoTranscript(videoId, segments, meta = {}) {
  if (!Array.isArray(segments) || !segments.length) return { ok: false, reason: 'no_segments' };
  const text = segments.map((s) => `[${s.ts}] ${s.text}`).join(' ');
  return ingest({
    url: meta.url || `video://${videoId}`,
    title: meta.title || `Video ${videoId}`,
    text,
    source_id: meta.source_id || 'video',
    extraction_method: 'transcript',
    video: { id: videoId, segments },
    session_id: meta.session_id,
  });
}

async function chunksFor(docId) {
  return CHUNKS().find((c) => c.doc_id === docId);
}

async function get(docId) {
  return DOCUMENTS().get(docId);
}

module.exports = { ingest, ingestVideoTranscript, chunksFor, get, segment, language, normalizeText };
