/**
 * SQLiteStore — Persistent storage for social intelligence data
 * ==============================================================
 * Stores signals, evidence, and contents in SQLite for persistence across restarts.
 * Zero configuration — just works with a local file.
 */

const Database = require('better-sqlite3');
const path = require('path');
const { createLogger } = require('../logger');

const logger = createLogger('SQLiteStore');

class SQLiteStore {
  constructor(dbPath) {
    this.dbPath = dbPath || process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'social_intelligence.db');
    this._db = null;
    this._initialized = false;
  }

  _ensureDb() {
    if (this._db) return this._db;
    try {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      const fs = require('fs');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      this._db = new Database(this.dbPath);
      this._db.pragma('journal_mode = WAL');
      this._db.pragma('synchronous = NORMAL');
      this._createTables();
      this._initialized = true;
      logger.info('SQLite database initialized', { path: this.dbPath });
      return this._db;
    } catch (err) {
      logger.error('Failed to initialize SQLite', { error: err.message });
      return null;
    }
  }

  _createTables() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS contents (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        author TEXT,
        authorUrl TEXT,
        text TEXT,
        url TEXT,
        title TEXT,
        language TEXT,
        publishedAt TEXT,
        engagementScore REAL DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        rawJson TEXT
      );

      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        confidence REAL DEFAULT 0,
        source TEXT,
        contentId TEXT,
        description TEXT,
        metadata TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        signalId TEXT,
        source TEXT,
        contentId TEXT,
        description TEXT,
        strength REAL DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS segments (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        accountCount INTEGER DEFAULT 0,
        contentCount INTEGER DEFAULT 0,
        avgEngagement REAL DEFAULT 0,
        topKeywords TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        type TEXT,
        title TEXT,
        description TEXT,
        score REAL DEFAULT 0,
        signalIds TEXT,
        contentIds TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ingest_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT,
        sources TEXT,
        contentsFound INTEGER DEFAULT 0,
        signalsFound INTEGER DEFAULT 0,
        durationMs INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
      CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source);
      CREATE INDEX IF NOT EXISTS idx_contents_source ON contents(source);
      CREATE INDEX IF NOT EXISTS idx_contents_publishedAt ON contents(publishedAt);
      CREATE INDEX IF NOT EXISTS idx_evidence_signalId ON evidence(signalId);
      CREATE INDEX IF NOT EXISTS idx_ingest_log_createdAt ON ingest_log(createdAt);
    `);
  }

  // ─── CONTENTS ────────────────────────────────────────────

  saveContents(contents) {
    const db = this._ensureDb();
    if (!db) return 0;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO contents (id, source, author, authorUrl, text, url, title, language, publishedAt, engagementScore, rawJson)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const tx = db.transaction((items) => {
      for (const c of items) {
        try {
          // Normalize author field (can be object or string)
          const authorName = typeof c.author === 'object' ? (c.author.displayName || c.author.username || '') : (c.author || '');
          const authorUrl = typeof c.author === 'object' ? (c.author.url || '') : '';

          stmt.run(
            c.id || `${c.source}_${Date.now()}_${count}`,
            c.source || 'unknown',
            authorName,
            authorUrl,
            c.text || c.body || '',
            c.url || null,
            c.title || null,
            c.language || null,
            c.publishedAt || c.createdAt || null,
            c.engagementScore || (c.metrics ? (c.metrics.likes || 0) + (c.metrics.comments || 0) : 0),
            JSON.stringify(c)
          );
          count++;
        } catch (err) {
          // Skip duplicates silently
        }
      }
    });

    try {
      tx(contents);
    } catch (err) {
      logger.error('Failed to save contents', { error: err.message });
    }
    return count;
  }

  getContents(limit = 100, offset = 0) {
    const db = this._ensureDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM contents ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(limit, offset);
  }

  getContentsBySource(source, limit = 50) {
    const db = this._ensureDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM contents WHERE source = ? ORDER BY createdAt DESC LIMIT ?').all(source, limit);
  }

  countContents() {
    const db = this._ensureDb();
    if (!db) return 0;
    return db.prepare('SELECT COUNT(*) as count FROM contents').get().count;
  }

  // ─── SIGNALS ─────────────────────────────────────────────

  saveSignals(signals) {
    const db = this._ensureDb();
    if (!db) return 0;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO signals (id, type, confidence, source, contentId, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const tx = db.transaction((items) => {
      for (const s of items) {
        try {
          const contentId = s.contentId || (s.content ? s.content.id : null);
          const description = s.description || s.text || (s.content ? s.content.title : null);
          stmt.run(
            s.id || `sig_${Date.now()}_${count}`,
            s.type || 'unknown',
            s.confidence || 0,
            s.source || null,
            contentId,
            description,
            JSON.stringify(s)
          );
          count++;
        } catch (err) {}
      }
    });

    try { tx(signals); } catch (err) {
      logger.error('Failed to save signals', { error: err.message });
    }
    return count;
  }

  getSignals(limit = 100, offset = 0) {
    const db = this._ensureDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM signals ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(limit, offset);
  }

  getSignalsByType(type, limit = 50) {
    const db = this._ensureDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM signals WHERE type = ? ORDER BY createdAt DESC LIMIT ?').all(type, limit);
  }

  countSignals() {
    const db = this._ensureDb();
    if (!db) return 0;
    return db.prepare('SELECT COUNT(*) as count FROM signals').get().count;
  }

  getSignalCountsByType() {
    const db = this._ensureDb();
    if (!db) return {};
    const rows = db.prepare('SELECT type, COUNT(*) as count FROM signals GROUP BY type').all();
    const result = {};
    for (const row of rows) result[row.type] = row.count;
    return result;
  }

  // ─── EVIDENCE ────────────────────────────────────────────

  saveEvidence(evidenceItems) {
    const db = this._ensureDb();
    if (!db) return 0;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO evidence (id, signalId, source, contentId, description, strength)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const tx = db.transaction((items) => {
      for (const e of items) {
        try {
          stmt.run(
            e.id || `ev_${Date.now()}_${count}`,
            e.signalId || null,
            e.source || null,
            e.contentId || null,
            e.description || null,
            e.strength || 0
          );
          count++;
        } catch (err) {}
      }
    });

    try { tx(evidenceItems); } catch (err) {
      logger.error('Failed to save evidence', { error: err.message });
    }
    return count;
  }

  getEvidence(limit = 100, offset = 0) {
    const db = this._ensureDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM evidence ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(limit, offset);
  }

  countEvidence() {
    const db = this._ensureDb();
    if (!db) return 0;
    return db.prepare('SELECT COUNT(*) as count FROM evidence').get().count;
  }

  // ─── SEGMENTS ────────────────────────────────────────────

  saveSegments(segments) {
    const db = this._ensureDb();
    if (!db) return 0;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO segments (id, name, type, accountCount, contentCount, avgEngagement, topKeywords)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const tx = db.transaction((items) => {
      for (const s of items) {
        try {
          stmt.run(
            s.id || `seg_${Date.now()}_${count}`,
            s.name || null,
            s.type || null,
            s.accountCount || 0,
            s.contentCount || 0,
            s.avgEngagement || 0,
            JSON.stringify(s.topKeywords || [])
          );
          count++;
        } catch (err) {}
      }
    });

    try { tx(segments); } catch (err) {}
    return count;
  }

  countSegments() {
    const db = this._ensureDb();
    if (!db) return 0;
    return db.prepare('SELECT COUNT(*) as count FROM segments').get().count;
  }

  // ─── OPPORTUNITIES ───────────────────────────────────────

  saveOpportunities(opportunities) {
    const db = this._ensureDb();
    if (!db) return 0;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO opportunities (id, type, title, description, score, signalIds, contentIds)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const tx = db.transaction((items) => {
      for (const o of items) {
        try {
          stmt.run(
            o.id || `opp_${Date.now()}_${count}`,
            o.type || null,
            o.title || null,
            o.description || null,
            o.score || 0,
            JSON.stringify(o.signalIds || []),
            JSON.stringify(o.contentIds || [])
          );
          count++;
        } catch (err) {}
      }
    });

    try { tx(opportunities); } catch (err) {}
    return count;
  }

  countOpportunities() {
    const db = this._ensureDb();
    if (!db) return 0;
    return db.prepare('SELECT COUNT(*) as count FROM opportunities').get().count;
  }

  // ─── INGEST LOG ──────────────────────────────────────────

  logIngest(query, sources, contentsFound, signalsFound, durationMs) {
    const db = this._ensureDb();
    if (!db) return;
    try {
      db.prepare('INSERT INTO ingest_log (query, sources, contentsFound, signalsFound, durationMs) VALUES (?, ?, ?, ?, ?)')
        .run(query, JSON.stringify(sources), contentsFound, signalsFound, durationMs);
    } catch (err) {}
  }

  getIngestLog(limit = 50) {
    const db = this._ensureDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM ingest_log ORDER BY createdAt DESC LIMIT ?').all(limit);
  }

  // ─── STATS ───────────────────────────────────────────────

  getStats() {
    return {
      contents: this.countContents(),
      signals: this.countSignals(),
      evidence: this.countEvidence(),
      segments: this.countSegments(),
      opportunities: this.countOpportunities(),
      signalTypes: this.getSignalCountsByType(),
      recentIngests: this.getIngestLog(10),
    };
  }

  // ─── CLEANUP ─────────────────────────────────────────────

  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}

// Singleton
let _instance = null;
function getSQLiteStore(dbPath) {
  if (!_instance) _instance = new SQLiteStore(dbPath);
  return _instance;
}

module.exports = { SQLiteStore, getSQLiteStore };
