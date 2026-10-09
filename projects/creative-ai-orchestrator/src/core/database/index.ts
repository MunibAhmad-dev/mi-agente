// ============================================================================
// Database Layer - SQLite via sql.js (pure JavaScript)
// ============================================================================
// Zero native dependencies. SQLite handles everything until the scale
// genuinely demands PostgreSQL (if ever).
// ============================================================================

import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    path TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS runtimes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    adapter_id TEXT NOT NULL,
    version TEXT,
    path TEXT,
    status TEXT NOT NULL DEFAULT 'not_installed',
    port INTEGER,
    config TEXT NOT NULL DEFAULT '{}',
    capabilities TEXT NOT NULL DEFAULT '{}',
    installed_at TEXT,
    last_health_check TEXT
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    source_provider TEXT,
    source_url TEXT,
    source_author TEXT,
    license_name TEXT,
    license_url TEXT,
    license_spdx TEXT,
    license_commercial INTEGER NOT NULL DEFAULT 1,
    license_modification INTEGER NOT NULL DEFAULT 1,
    license_redistribution INTEGER NOT NULL DEFAULT 1,
    license_copyleft INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    hash TEXT,
    format TEXT,
    vram_estimate_mb INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    installed INTEGER NOT NULL DEFAULT 0,
    installed_path TEXT,
    installed_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL DEFAULT '1.0.0',
    nodes TEXT NOT NULL DEFAULT '[]',
    links TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    workflow_id TEXT,
    runtime_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    progress REAL DEFAULT 0,
    current_step TEXT,
    inputs TEXT NOT NULL DEFAULT '{}',
    outputs TEXT NOT NULL DEFAULT '[]',
    error TEXT,
    resource_usage TEXT NOT NULL DEFAULT '{}',
    duration_ms INTEGER,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    variables TEXT NOT NULL DEFAULT '{}',
    workflow_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    quality_score REAL,
    result TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS memory (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    relevance REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    project_id TEXT,
    runtime_id TEXT,
    data TEXT NOT NULL DEFAULT '{}',
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    label TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS discovery_cache (
    key TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    query TEXT NOT NULL,
    result TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dependency_licenses (
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    repository TEXT,
    license_name TEXT NOT NULL,
    license_url TEXT,
    license_spdx TEXT,
    commercial_use INTEGER NOT NULL DEFAULT 1,
    modification_allowed INTEGER NOT NULL DEFAULT 1,
    redistribution_allowed INTEGER NOT NULL DEFAULT 1,
    copyleft INTEGER NOT NULL DEFAULT 0,
    additional_terms TEXT,
    PRIMARY KEY (name, version)
  );

  CREATE TABLE IF NOT EXISTS hardware_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// Database class
// ---------------------------------------------------------------------------

export class CaioDatabase {
  private db: SqlJsDatabase;
  private dbPath: string;
  private dbDir: string;

  private constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
    this.dbDir = path.dirname(dbPath);
  }

  /**
   * Async factory — sql.js needs to load the WASM module first.
   */
  static async create(dataDir: string): Promise<CaioDatabase> {
    const SQL = await initSqlJs();
    const dbPath = path.join(dataDir, "caio.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    let db: SqlJsDatabase;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    const instance = new CaioDatabase(db, dbPath);
    instance.initialize();
    return instance;
  }

  private initialize(): void {
    this.db.run(SCHEMA_SQL);
  }

  /**
   * Persist the database to disk.
   */
  save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /**
   * Run a statement (INSERT, UPDATE, DELETE, CREATE, etc.)
   */
  run(sql: string, ...params: unknown[]): { changes: number } {
    this.db.run(sql, params);
    // Auto-save after writes
    this.save();
    return { changes: this.db.getRowsModified() };
  }

  /**
   * Get a single row, or undefined.
   */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as any);
    if (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      const row: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        row[columns[i]!] = values[i];
      }
      stmt.free();
      return row as T;
    }
    stmt.free();
    return undefined;
  }

  /**
   * Get all matching rows.
   */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    const results: T[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params as any);
    while (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      const row: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        row[columns[i]!] = values[i];
      }
      results.push(row as T);
    }
    stmt.free();
    return results;
  }

  /**
   * Close the database.
   */
  close(): void {
    this.save();
    this.db.close();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: CaioDatabase | undefined;

export async function initDatabase(dataDir: string): Promise<CaioDatabase> {
  if (_instance) {
    _instance.close();
  }
  _instance = await CaioDatabase.create(dataDir);
  return _instance;
}

export function getDatabase(): CaioDatabase {
  if (!_instance) {
    throw new Error("Database not initialized. Call initDatabase(dataDir) first.");
  }
  return _instance;
}
