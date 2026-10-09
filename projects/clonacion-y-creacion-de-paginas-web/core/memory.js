// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Persistent Memory System (SQLite/sql.js)
// ═══════════════════════════════════════════════════════════════════════════════

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createLogger } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const log = createLogger('memory');

// ─── SQLite Database (sql.js — pure WASM, no native compilation) ───────────

const MEMORY_DIR = join(PROJECT_ROOT, 'memory', 'data');
if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

const DB_PATH = join(MEMORY_DIR, 'memory.db');
const SQL_JS = await import('sql.js');
const initSqlJs = SQL_JS.default;

// ─── MemoryStore ────────────────────────────────────────────────────────────

export class MemoryStore {
  constructor() {
    this.db = null;
    this._ready = this._init();
  }

  async _init() {
    const SQL = await initSqlJs();

    // Load existing DB or create new
    if (existsSync(DB_PATH)) {
      const buffer = readFileSync(DB_PATH);
      this.db = new SQL.Database(buffer);
      log.info('SQLite memory loaded from disk');
    } else {
      this.db = new SQL.Database();
      log.info('SQLite memory created fresh');
    }

    this._createTables();
    this._migrateFromJSON();
    this._save();
    log.info('SQLite memory initialized: ' + DB_PATH);
  }

  async ready() {
    await this._ready;
    return this;
  }

  // ─── Schema ─────────────────────────────────────────────────────────────

  _createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        input TEXT,
        config TEXT,
        status TEXT DEFAULT 'created',
        scores TEXT DEFAULT '[]',
        iterations INTEGER DEFAULT 0,
        design_dna TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        category TEXT DEFAULT 'general',
        content TEXT NOT NULL,
        source TEXT DEFAULT 'unknown',
        confidence REAL DEFAULT 0.5,
        timestamp TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        context TEXT,
        options TEXT DEFAULT '[]',
        chosen TEXT,
        reasoning TEXT,
        outcome TEXT DEFAULT 'pending',
        timestamp TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS errors (
        id TEXT PRIMARY KEY,
        error TEXT NOT NULL,
        root_cause TEXT DEFAULT '',
        solution TEXT DEFAULT '',
        component TEXT DEFAULT '',
        skill TEXT DEFAULT '',
        tool TEXT DEFAULT '',
        timestamp TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS solutions (
        id TEXT PRIMARY KEY,
        problem TEXT NOT NULL,
        approach TEXT DEFAULT '',
        result TEXT DEFAULT '',
        confidence REAL DEFAULT 0.5,
        reusable INTEGER DEFAULT 1,
        timestamp TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS benchmarks (
        id TEXT PRIMARY KEY,
        target TEXT,
        score REAL DEFAULT 0,
        pixel_score REAL DEFAULT 0,
        iteration INTEGER DEFAULT 1,
        duration INTEGER DEFAULT 0,
        input_type TEXT DEFAULT 'url',
        timestamp TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS repair_history (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        iteration INTEGER DEFAULT 0,
        score_before REAL DEFAULT 0,
        score_after REAL DEFAULT 0,
        repairs TEXT DEFAULT '[]',
        timestamp TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS design_dna (
        id TEXT PRIMARY KEY,
        project_id TEXT UNIQUE,
        version TEXT DEFAULT '1.0.0',
        colors TEXT DEFAULT '{}',
        typography TEXT DEFAULT '{}',
        components INTEGER DEFAULT 0,
        full_dna TEXT,
        timestamp TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS skill_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT,
        success INTEGER DEFAULT 1,
        duration INTEGER DEFAULT 0,
        timestamp TEXT
      );
    `);
  }

  // ─── JSON Migration ────────────────────────────────────────────────────

  _migrateFromJSON() {
    const MEMORY_FILE = join(MEMORY_DIR, 'memory.json');
    if (!existsSync(MEMORY_FILE)) return;

    try {
      const data = JSON.parse(readFileSync(MEMORY_FILE, 'utf-8'));
      const count = this.db.exec('SELECT COUNT(*) as c FROM projects')[0]?.values[0]?.[0] || 0;
      if (count > 0) return; // Already migrated

      log.info('Migrating JSON memory to SQLite...');

      for (const p of data.projects || []) {
        this.db.run('INSERT OR IGNORE INTO projects (id, name, input, config, status, scores, iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.id, p.name, JSON.stringify(p.input), JSON.stringify(p.config), p.status, JSON.stringify(p.scores || []), p.iterations || 0, p.createdAt, p.updatedAt]);
      }
      for (const l of data.lessons || []) {
        this.db.run('INSERT OR IGNORE INTO lessons VALUES (?, ?, ?, ?, ?, ?)',
          [l.id, l.category, l.content, l.source, l.confidence, l.timestamp]);
      }
      for (const b of data.benchmarks || []) {
        this.db.run('INSERT OR IGNORE INTO benchmarks VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [b.id, b.target, b.score, b.pixelScore || 0, b.iteration || 1, b.duration || 0, b.inputType || 'url', b.timestamp]);
      }
      for (const d of data.designDNA || []) {
        this.db.run('INSERT OR IGNORE INTO design_dna (id, project_id, version, components, timestamp) VALUES (?, ?, ?, ?, ?)',
          [d.id, d.projectId, d.version, d.components, d.timestamp]);
      }

      this._save();
      log.info('JSON → SQLite migration complete');
    } catch (e) {
      log.warn('Migration skipped: ' + e.message);
    }
  }

  // ─── Persistence ───────────────────────────────────────────────────────

  _save() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      writeFileSync(DB_PATH, buffer);
    } catch (e) {
      log.error('Failed to save DB: ' + e.message);
    }
  }

  // ─── Query Helpers ─────────────────────────────────────────────────────

  _all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  _get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  _run(sql, params = []) {
    this.db.run(sql, params);
    this._save();
  }

  // ─── Project CRUD ──────────────────────────────────────────────────────

  saveProject(project) {
    this._run(
      'INSERT OR REPLACE INTO projects (id, name, input, config, status, scores, iterations, design_dna, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [project.id, project.name, JSON.stringify(project.input), JSON.stringify(project.config),
       project.status || 'created', JSON.stringify(project.scores || []),
       project.currentIteration || 0, project.designDNA ? JSON.stringify(project.designDNA) : null,
       project.createdAt || new Date().toISOString(), new Date().toISOString()]
    );
    log.info(`Project saved: ${project.id}`);
    return project;
  }

  getProject(projectId) {
    const row = this._get('SELECT * FROM projects WHERE id = ?', [projectId]);
    return row ? this._parseProject(row) : null;
  }

  listProjects(limit = 50) {
    return this._all('SELECT * FROM projects ORDER BY updated_at DESC LIMIT ?', [limit]).map(r => this._parseProject(r));
  }

  _parseProject(row) {
    return {
      id: row.id, name: row.name,
      input: this._j(row.input), config: this._j(row.config),
      status: row.status, scores: this._j(row.scores),
      iterations: row.iterations, designDNA: this._j(row.design_dna),
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  // ─── Lessons ───────────────────────────────────────────────────────────

  addLesson(lesson) {
    const id = `lesson-${Date.now()}`;
    const ts = new Date().toISOString();
    this._run('INSERT INTO lessons (id, category, content, source, confidence, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [id, lesson.category || 'general', lesson.content, lesson.source || 'unknown', lesson.confidence || 0.5, ts]);
    log.info(`Lesson added: ${lesson.category || 'general'}`);
    return { id, category: lesson.category || 'general', content: lesson.content, source: lesson.source, confidence: lesson.confidence, timestamp: ts };
  }

  getLessons(category = null) {
    if (category) return this._all('SELECT * FROM lessons WHERE category = ? ORDER BY timestamp DESC', [category]);
    return this._all('SELECT * FROM lessons ORDER BY timestamp DESC');
  }

  // ─── Decisions ─────────────────────────────────────────────────────────

  addDecision(decision) {
    const id = `decision-${Date.now()}`;
    const ts = new Date().toISOString();
    this._run('INSERT INTO decisions (id, context, options, chosen, reasoning, outcome, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, decision.context, JSON.stringify(decision.options || []), decision.chosen, decision.reasoning || '', decision.outcome || 'pending', ts]);
    log.info(`Decision recorded: ${decision.chosen}`);
    return { id, ...decision, timestamp: ts };
  }

  getDecisions(limit = 50) {
    return this._all('SELECT * FROM decisions ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  // ─── Errors & Solutions ────────────────────────────────────────────────

  addError(error) {
    const id = `error-${Date.now()}`;
    const ts = new Date().toISOString();
    this._run('INSERT INTO errors (id, error, root_cause, solution, component, skill, tool, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, error.error, error.rootCause || '', error.solution || '', error.component || '', error.skill || '', error.tool || '', ts]);
    log.info(`Error recorded: ${error.error}`);
    return { id, ...error, timestamp: ts };
  }

  findSimilarErrors(pattern) {
    const p = `%${pattern.toLowerCase()}%`;
    return this._all('SELECT * FROM errors WHERE LOWER(error) LIKE ? OR LOWER(root_cause) LIKE ?', [p, p]);
  }

  addSolution(solution) {
    const id = `solution-${Date.now()}`;
    const ts = new Date().toISOString();
    this._run('INSERT INTO solutions (id, problem, approach, result, confidence, reusable, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, solution.problem, solution.approach || '', solution.result || '', solution.confidence || 0.5, solution.reusable !== false ? 1 : 0, ts]);
    log.info(`Solution recorded: ${solution.problem}`);
    return { id, ...solution, timestamp: ts };
  }

  findSolutions(problemPattern) {
    return this._all('SELECT * FROM solutions WHERE LOWER(problem) LIKE ? AND reusable = 1', [`%${problemPattern.toLowerCase()}%`]);
  }

  // ─── Benchmarks ────────────────────────────────────────────────────────

  addBenchmark(benchmark) {
    const id = `bench-${Date.now()}`;
    const ts = new Date().toISOString();
    this._run('INSERT INTO benchmarks (id, target, score, pixel_score, iteration, duration, input_type, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, benchmark.target, benchmark.score, benchmark.pixelScore || 0, benchmark.iteration || 1, benchmark.duration || 0, benchmark.inputType || 'url', ts]);
    log.info(`Benchmark recorded: ${benchmark.target} → ${benchmark.score}%`);
    return { id, ...benchmark, timestamp: ts };
  }

  getBenchmarks(limit = 100) {
    return this._all('SELECT * FROM benchmarks ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  getAverageScore() {
    const row = this._get('SELECT AVG(score) as avg_score FROM benchmarks');
    return row?.avg_score ? Math.round(row.avg_score * 100) / 100 : 0;
  }

  getBestScore() {
    const row = this._get('SELECT MAX(score) as best FROM benchmarks');
    return row?.best || 0;
  }

  getScoreTrend(limit = 20) {
    return this._all('SELECT score, pixel_score, iteration, target, timestamp FROM benchmarks ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  // ─── Repair History ────────────────────────────────────────────────────

  addRepair(repair) {
    const id = `repair-${Date.now()}`;
    const ts = new Date().toISOString();
    this._run('INSERT INTO repair_history (id, project_id, iteration, score_before, score_after, repairs, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, repair.projectId, repair.iteration || 0, repair.scoreBefore || 0, repair.scoreAfter || 0, JSON.stringify(repair.repairs || []), ts]);
    log.info(`Repair recorded: ${repair.scoreBefore}% → ${repair.scoreAfter}%`);
    return { id, ...repair, timestamp: ts };
  }

  getRepairHistory(limit = 50) {
    return this._all('SELECT * FROM repair_history ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  // ─── Design DNA ────────────────────────────────────────────────────────

  saveDesignDNA(projectId, dna) {
    const id = `dna-${projectId}`;
    const ts = new Date().toISOString();
    this._run('INSERT OR REPLACE INTO design_dna (id, project_id, version, colors, typography, components, full_dna, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, projectId, dna.version || '1.0.0', JSON.stringify(dna.colors || {}), JSON.stringify(dna.typography || {}),
       (dna.components || []).length, JSON.stringify(dna), ts]);
    log.info(`Design DNA saved: ${projectId}`);
    return { id, projectId, version: dna.version, components: (dna.components || []).length, timestamp: ts };
  }

  getDesignDNA(projectId) {
    const row = this._get('SELECT full_dna FROM design_dna WHERE project_id = ?', [projectId]);
    return row ? this._j(row.full_dna) : null;
  }

  listDesignDNA(limit = 50) {
    return this._all('SELECT id, project_id, version, components, timestamp FROM design_dna ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  // ─── Skill History ─────────────────────────────────────────────────────

  recordSkillUse(skillId, result) {
    const ts = new Date().toISOString();
    this._run('INSERT INTO skill_history (skill_id, success, duration, timestamp) VALUES (?, ?, ?, ?)',
      [skillId, result.success !== false ? 1 : 0, result.duration || 0, ts]);
    // Trim to 1000 per skill
    this.db.run(`DELETE FROM skill_history WHERE skill_id = '${skillId}' AND id NOT IN (SELECT id FROM skill_history WHERE skill_id = '${skillId}' ORDER BY timestamp DESC LIMIT 1000)`);
    this._save();
    return { skillId, success: result.success !== false, duration: result.duration, timestamp: ts };
  }

  getSkillStats(skillId = null) {
    const where = skillId ? 'WHERE skill_id = ?' : '';
    const params = skillId ? [skillId] : [];
    const total = this._get(`SELECT COUNT(*) as c FROM skill_history ${where}`, params)?.c || 0;
    const success = this._get(`SELECT COUNT(*) as c FROM skill_history ${where} ${where ? 'AND' : 'WHERE'} success = 1`, params)?.c || 0;
    const avgDur = this._get(`SELECT AVG(duration) as avg FROM skill_history ${where}`, params)?.avg || 0;
    return { total, success, failed: total - success, avgDuration: Math.round(avgDur), rate: total > 0 ? Math.round(success / total * 100) : 0 };
  }

  // ─── Stats ─────────────────────────────────────────────────────────────

  getStats() {
    const tables = ['projects', 'lessons', 'decisions', 'errors', 'solutions', 'benchmarks', 'repair_history', 'design_dna', 'skill_history'];
    const stats = {};
    for (const t of tables) {
      stats[t === 'repair_history' ? 'repairs' : t === 'design_dna' ? 'designDNA' : t === 'skill_history' ? 'skillHistory' : t] =
        this._get(`SELECT COUNT(*) as c FROM ${t}`)?.c || 0;
    }

    let dbSize = 'unknown';
    try {
      const stat = statSync(DB_PATH);
      dbSize = `${(stat.size / 1024).toFixed(1)} KB`;
    } catch {}

    return {
      ...stats,
      averageScore: this.getAverageScore(),
      bestScore: this.getBestScore(),
      dbSize,
      engine: 'sqlite',
    };
  }

  // ─── Export/Import ─────────────────────────────────────────────────────

  exportMemory() {
    const tables = ['projects', 'lessons', 'decisions', 'errors', 'solutions', 'benchmarks', 'repair_history', 'design_dna', 'skill_history'];
    const data = {};
    for (const t of tables) {
      data[t] = this._all(`SELECT * FROM ${t}`);
    }
    data.exportedAt = new Date().toISOString();
    data.engine = 'sqlite';
    return JSON.stringify(data, null, 2);
  }

  importMemory(jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      for (const p of data.projects || []) {
        this._run('INSERT OR REPLACE INTO projects (id, name, input, config, status, scores, iterations, design_dna, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.id, p.name, typeof p.input === 'string' ? p.input : JSON.stringify(p.input), typeof p.config === 'string' ? p.config : JSON.stringify(p.config), p.status, typeof p.scores === 'string' ? p.scores : JSON.stringify(p.scores || []), p.iterations || p.currentIteration || 0, p.design_dna || (p.designDNA ? JSON.stringify(p.designDNA) : null), p.created_at || p.createdAt, p.updated_at || p.updatedAt]);
      }
      log.info('Memory imported successfully');
      return true;
    } catch (e) {
      log.error('Import failed: ' + e.message);
      return false;
    }
  }

  // ─── Utility ───────────────────────────────────────────────────────────

  _j(str) {
    if (!str) return str;
    try { return JSON.parse(str); } catch { return str; }
  }

  close() {
    if (this.db) {
      this._save();
      this.db.close();
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance = null;

export async function getMemoryStore() {
  if (!instance) {
    instance = new MemoryStore();
    await instance.ready();
  }
  return instance;
}

// For backward compat (sync access after first await)
export function getMemoryStoreSync() {
  return instance;
}
