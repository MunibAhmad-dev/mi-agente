'use strict';

/**
 * Ingestion routes — Face 21: Mass Document Ingestion + Knowledge Base Search.
 *
 * POST /api/ingestion/file     — ingest an on-disk file (path already on server)
 * POST /api/ingestion/url      — ingest a web page
 * POST /api/ingestion/youtube  — ingest a YouTube video transcript
 * GET  /api/ingestion/jobs     — list recent ingestion jobs
 * GET  /api/ingestion/jobs/:id — poll a specific job for status/progress
 * GET  /api/ingestion/search   — semantic search across the knowledge base
 */

const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const {
  ingestFile,
  ingestUrl,
  ingestYouTube,
  searchKnowledge,
  getJob,
  listJobs,
} = require('~/server/services/Ingestion/IngestionPipeline');

const router = express.Router();
router.use(requireJwtAuth);

/** POST /api/ingestion/file — ingest a file already on the server */
router.post('/file', async (req, res) => {
  try {
    const { filePath, collection, metadata } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });
    const result = await ingestFile(filePath, { collection, userId: req.user?.id, metadata });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/ingestion/url — fetch and ingest a web page */
router.post('/url', async (req, res) => {
  try {
    const { url, collection, metadata } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const result = await ingestUrl(url, { collection, userId: req.user?.id, metadata });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/ingestion/youtube — ingest a YouTube transcript */
router.post('/youtube', async (req, res) => {
  try {
    const { url, collection, metadata } = req.body;
    if (!url) return res.status(400).json({ error: 'url (YouTube video URL) required' });
    const result = await ingestYouTube(url, { collection, userId: req.user?.id, metadata });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/ingestion/jobs — list recent jobs */
router.get('/jobs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json({ jobs: listJobs(limit) });
});

/** GET /api/ingestion/jobs/:id — poll a specific job */
router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

/**
 * GET /api/ingestion/search?q=...&collection=...&limit=10&threshold=0.25
 * Semantic search across all ingested documents.
 * Returns results with source attribution and confidence score (0-100).
 */
router.get('/search', async (req, res) => {
  try {
    const { q, collection, limit, threshold } = req.query;
    if (!q) return res.status(400).json({ error: 'q (query) required' });
    const result = await searchKnowledge(q, {
      collection,
      limit: parseInt(limit) || 10,
      threshold: parseFloat(threshold) || 0.25,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
