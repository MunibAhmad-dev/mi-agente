'use strict';

/**
 * IngestionPipeline — Face 21: Mass Document Ingestion.
 *
 * Wires: FileProcessor → chunk → RAGService.indexDocuments
 * Sources: local file path, web URL, YouTube transcript
 *
 * Jobs run in the background (setImmediate); callers poll GET /api/ingestion/jobs/:id.
 */

const path = require('path');
const crypto = require('crypto');

const logger = {
  info: (...a) => console.log('[IngestionPipeline]', ...a),
  warn: (...a) => console.warn('[IngestionPipeline]', ...a),
  error: (...a) => console.error('[IngestionPipeline]', ...a),
};

// In-memory job store (sufficient for MVP; replace with DB for multi-process deployments)
const _jobs = new Map();

function _createJob(type, source) {
  const id = crypto.randomUUID();
  const job = { id, type, source, status: 'pending', progress: 0, chunks: 0, docId: null, error: null, createdAt: new Date(), updatedAt: new Date() };
  _jobs.set(id, job);
  return job;
}

function _updateJob(id, patch) {
  const job = _jobs.get(id);
  if (job) Object.assign(job, patch, { updatedAt: new Date() });
}

// Lazy loaders — avoid circular requires at module load time
function _rag() {
  const { getRAGService } = require('~/server/services/RAG/RAGService');
  return getRAGService();
}

function _fp() {
  const { FileProcessor } = require('~/server/services/Harness/FileProcessor');
  return new FileProcessor();
}

/**
 * Split text into overlapping word-based chunks.
 */
function _chunkText(text, size = 512, overlap = 64) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + size).join(' '));
    i += Math.max(1, size - overlap);
  }
  return chunks;
}

/**
 * Build RAG document array from chunks + metadata.
 */
function _buildDocs(jobId, chunks, metadata) {
  return chunks.map((content, i) => ({
    id: `${jobId}-chunk-${i}`,
    content,
    metadata: { ...metadata, chunkIndex: i, totalChunks: chunks.length },
  }));
}

/* ──────────────────────────────────────────────────────────
   Public API
────────────────────────────────────────────────────────── */

/**
 * Ingest a file from disk into RAG.
 * The file must already be on the server (e.g. uploaded via /api/files).
 *
 * @param {string} filePath - absolute path
 * @param {{ collection?, userId?, metadata? }} opts
 * @returns {{ jobId: string, collection: string }}
 */
async function ingestFile(filePath, opts = {}) {
  const collection = opts.collection || 'default';
  const job = _createJob('file', filePath);

  setImmediate(async () => {
    try {
      _updateJob(job.id, { status: 'extracting', progress: 10 });

      const result = await _fp().processFile(filePath);
      const text = (result.text || result.content || '').trim();

      if (!text) {
        _updateJob(job.id, { status: 'failed', error: 'No text extracted from file' });
        return;
      }

      _updateJob(job.id, { status: 'chunking', progress: 40 });
      const chunks = _chunkText(text);

      _updateJob(job.id, { status: 'indexing', progress: 65 });
      const rag = _rag();
      await rag.indexDocuments(collection, _buildDocs(job.id, chunks, {
        source: path.basename(filePath),
        filePath,
        type: result.type || 'document',
        userId: opts.userId,
        ...opts.metadata,
      }));

      _updateJob(job.id, { status: 'completed', progress: 100, chunks: chunks.length, docId: `file-${job.id}` });
      logger.info(`File "${path.basename(filePath)}" → ${chunks.length} chunks → collection "${collection}"`);
    } catch (e) {
      logger.error('ingestFile failed:', e.message);
      _updateJob(job.id, { status: 'failed', error: e.message });
    }
  });

  return { jobId: job.id, collection };
}

/**
 * Ingest a web page URL into RAG.
 *
 * @param {string} url
 * @param {{ collection?, userId?, metadata? }} opts
 */
async function ingestUrl(url, opts = {}) {
  const collection = opts.collection || 'default';
  const job = _createJob('url', url);

  setImmediate(async () => {
    try {
      _updateJob(job.id, { status: 'fetching', progress: 10 });

      let text = '';
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mi-agente-ingestor/1.0)' },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      } catch (fetchErr) {
        _updateJob(job.id, { status: 'failed', error: `Fetch failed: ${fetchErr.message}` });
        return;
      }

      if (!text) {
        _updateJob(job.id, { status: 'failed', error: 'No text extracted from URL' });
        return;
      }

      _updateJob(job.id, { status: 'chunking', progress: 50 });
      const chunks = _chunkText(text);

      _updateJob(job.id, { status: 'indexing', progress: 70 });
      const rag = _rag();
      await rag.indexDocuments(collection, _buildDocs(job.id, chunks, {
        source: url,
        type: 'web',
        userId: opts.userId,
        ...opts.metadata,
      }));

      _updateJob(job.id, { status: 'completed', progress: 100, chunks: chunks.length, docId: `url-${job.id}` });
      logger.info(`URL "${url}" → ${chunks.length} chunks → collection "${collection}"`);
    } catch (e) {
      logger.error('ingestUrl failed:', e.message);
      _updateJob(job.id, { status: 'failed', error: e.message });
    }
  });

  return { jobId: job.id, collection };
}

/**
 * Ingest a YouTube video transcript into RAG.
 *
 * Strategy:
 *   1. Try `youtube-transcript` npm package (if installed)
 *   2. Fall back to scraping YouTube's caption XML directly
 *
 * @param {string} videoUrl - full YouTube URL or youtu.be short URL
 * @param {{ collection?, userId?, metadata? }} opts
 */
async function ingestYouTube(videoUrl, opts = {}) {
  const collection = opts.collection || 'default';
  const job = _createJob('youtube', videoUrl);

  setImmediate(async () => {
    try {
      const videoId = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
      if (!videoId) {
        _updateJob(job.id, { status: 'failed', error: 'Cannot extract YouTube video ID from URL' });
        return;
      }

      _updateJob(job.id, { status: 'fetching-transcript', progress: 10 });

      let transcript = '';

      // Strategy 1: youtube-transcript package
      try {
        const { YoutubeTranscript } = require('youtube-transcript');
        const segs = await YoutubeTranscript.fetchTranscript(videoId);
        transcript = segs.map((s) => s.text).join(' ');
        logger.info(`Transcript via youtube-transcript package (${segs.length} segments)`);
      } catch {
        // Strategy 2: scrape caption XML from YouTube page
        try {
          const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(15_000),
          });
          const html = await pageRes.text();
          const captionMatch = html.match(/"captionTracks":\[(.*?)\]/s);
          if (captionMatch) {
            const tracks = JSON.parse(`[${captionMatch[1]}]`);
            const track = tracks.find((t) => t.languageCode === 'en') || tracks[0];
            if (track?.baseUrl) {
              const xmlRes = await fetch(track.baseUrl, { signal: AbortSignal.timeout(10_000) });
              const xml = await xmlRes.text();
              transcript = xml
                .replace(/<[^>]+>/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\s{2,}/g, ' ')
                .trim();
              logger.info(`Transcript via caption XML scrape (${transcript.length} chars)`);
            }
          }
        } catch (scrapeErr) {
          _updateJob(job.id, { status: 'failed', error: `Transcript unavailable: ${scrapeErr.message}` });
          return;
        }
      }

      if (!transcript.trim()) {
        _updateJob(job.id, { status: 'failed', error: 'No transcript available for this video' });
        return;
      }

      _updateJob(job.id, { status: 'chunking', progress: 50 });
      const chunks = _chunkText(transcript);

      _updateJob(job.id, { status: 'indexing', progress: 70 });
      const rag = _rag();
      await rag.indexDocuments(collection, _buildDocs(job.id, chunks, {
        source: videoUrl,
        videoId,
        type: 'youtube',
        userId: opts.userId,
        ...opts.metadata,
      }));

      _updateJob(job.id, { status: 'completed', progress: 100, chunks: chunks.length, docId: `yt-${videoId}-${job.id}` });
      logger.info(`YouTube "${videoId}" → ${chunks.length} chunks → collection "${collection}"`);
    } catch (e) {
      logger.error('ingestYouTube failed:', e.message);
      _updateJob(job.id, { status: 'failed', error: e.message });
    }
  });

  return { jobId: job.id, collection };
}

/**
 * Search across the knowledge base with semantic similarity.
 * Returns results with source attribution and confidence score (0-100).
 */
async function searchKnowledge(query, opts = {}) {
  const rag = _rag();
  const searchResult = await rag.search(query, {
    collection: opts.collection,
    maxResults: opts.limit || 10,
    threshold: opts.threshold ?? 0.25,
  });

  const raw = searchResult?.results || searchResult || [];
  return {
    query,
    collection: opts.collection || 'default',
    results: raw.map((r) => ({
      id: r.id,
      snippet: (r.content || '').slice(0, 300),
      score: +(r.score ?? r.similarity ?? 0).toFixed(4),
      confidence: Math.round((r.score ?? r.similarity ?? 0) * 100),
      source: r.metadata?.source || 'unknown',
      type: r.metadata?.type || 'document',
      chunkIndex: r.metadata?.chunkIndex,
      metadata: r.metadata,
    })),
  };
}

/** Get a single job by ID. */
function getJob(jobId) {
  return _jobs.get(jobId) || null;
}

/** List recent ingestion jobs, newest first. */
function listJobs(limit = 50) {
  return Array.from(_jobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

module.exports = { ingestFile, ingestUrl, ingestYouTube, searchKnowledge, getJob, listJobs };
