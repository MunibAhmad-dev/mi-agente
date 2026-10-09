/**
 * VectorStore — Embedded vector storage with sqlite-vec (MIT) backend.
 *
 * Stores embeddings alongside metadata in a SQLite database with vector
 * similarity search via the sqlite-vec extension. Falls back to in-memory
 * brute-force cosine similarity when sqlite-vec is not installed.
 *
 * Architecture:
 *   - Primary: sqlite-vec extension on SQLite (37 MB / 100k vectors)
 *   - Fallback: in-memory Map with cosine similarity (no persistence)
 *   - Supports: insert, search (kNN), delete, count
 *
 * License: MIT (sqlite-vec)
 */

const fs = require('fs');
const path = require('path');

let _db = null;
let _initialized = false;
const _memoryStore = []; // fallback: [{ id, vector, metadata }]
let _useFallback = false;

/**
 * Initialize the vector store. Tries sqlite-vec, falls back to in-memory.
 * @param {string} [dbPath]
 * @returns {Promise<boolean>}
 */
async function init(dbPath) {
  if (_initialized) return !_useFallback;
  _initialized = true;
  const finalPath = dbPath || path.join(process.cwd(), 'data', 'vector_store.db');
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
  try {
    const Database = require('better-sqlite3');
    _db = new Database(finalPath);
    _db.loadExtension('vec0');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        content TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
    _db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
        embedding float[${process.env.VECTOR_DIM || 768}]
      );
    `);
  } catch {
    _useFallback = true;
    _db = null;
  }
  return !_useFallback;
}

/**
 * Insert a vector with metadata.
 * @param {string} id
 * @param {number[]} vector
 * @param {string} content
 * @param {object} metadata
 * @returns {Promise<boolean>}
 */
async function insert(id, vector, content, metadata = {}) {
  if (!_initialized) await init();
  if (_useFallback) {
    _memoryStore.push({ id, vector, content, metadata });
    return true;
  }
  try {
    const stmt = _db.prepare(
      'INSERT OR REPLACE INTO embeddings (id, content, metadata) VALUES (?, ?, ?)',
    );
    stmt.run(id, content, JSON.stringify(metadata));
    const vecStmt = _db.prepare(
      'INSERT OR REPLACE INTO vec_embeddings (rowid, embedding) VALUES (?, ?)',
    );
    const rowid = _db.prepare('SELECT rowid FROM embeddings WHERE id = ?').get(id);
    if (rowid) {
      vecStmt.run(rowid.rowid, new Float32Array(vector));
    }
    return true;
  } catch {
    _memoryStore.push({ id, vector, content, metadata });
    return true;
  }
}

/**
 * Cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search for k nearest neighbors.
 * @param {number[]} queryVector
 * @param {number} [k=5]
 * @param {object} [filter]
 * @returns {Promise<Array<{id: string, score: number, content: string, metadata: object}>>}
 */
async function search(queryVector, k = 5, _filter = null) {
  if (!_initialized) await init();
  if (_useFallback) {
    const scored = _memoryStore.map((item) => ({
      id: item.id,
      score: cosineSimilarity(queryVector, item.vector),
      content: item.content,
      metadata: item.metadata,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
  try {
    const stmt = _db.prepare(`
      SELECT e.id, e.content, e.metadata, v.distance
      FROM vec_embeddings v
      JOIN embeddings e ON e.rowid = v.rowid
      WHERE v.embedding MATCH ?
      ORDER BY v.distance
      LIMIT ?
    `);
    const results = stmt.all(new Float32Array(queryVector), k);
    return results.map((r) => ({
      id: r.id,
      score: 1 - r.distance,
      content: r.content,
      metadata: JSON.parse(r.metadata || '{}'),
    }));
  } catch {
    const scored = _memoryStore.map((item) => ({
      id: item.id,
      score: cosineSimilarity(queryVector, item.vector),
      content: item.content,
      metadata: item.metadata,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

/**
 * Delete a vector by id.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function remove(id) {
  if (!_initialized) await init();
  if (_useFallback) {
    const idx = _memoryStore.findIndex((e) => e.id === id);
    if (idx >= 0) _memoryStore.splice(idx, 1);
    return true;
  }
  try {
    _db.prepare('DELETE FROM embeddings WHERE id = ?').run(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Count stored vectors.
 * @returns {Promise<number>}
 */
async function count() {
  if (!_initialized) await init();
  if (_useFallback) return _memoryStore.length;
  try {
    const r = _db.prepare('SELECT COUNT(*) as c FROM embeddings').get();
    return r.c;
  } catch {
    return _memoryStore.length;
  }
}

/**
 * Close the database connection.
 */
function close() {
  if (_db) {
    try {
      _db.close();
    } catch {
      // ignore
    }
  }
  _db = null;
  _initialized = false;
}

module.exports = {
  init,
  insert,
  search,
  remove,
  count,
  close,
};
