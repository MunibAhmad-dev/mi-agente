// ============================================================================
// Memory Search (FTS5)
// ============================================================================
// Full-text search over memory entries using SQLite FTS5.
// Provides semantic-like recall without external vector DB.
// ============================================================================

import type { CaioDatabase, MemoryEntry, ProjectId } from "../core/types/index.js";

export class MemorySearch {
  constructor(private db: CaioDatabase) {
    this.ensureFTS();
  }

  private ensureFTS(): void {
    try {
      this.db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          id, category, content, metadata,
          content=memory,
          content_rowid=rowid
        )
      `);
      // Populate from existing memory
      this.db.run(`
        INSERT INTO memory_fts(rowid, id, category, content, metadata)
        SELECT rowid, id, category, content, metadata FROM memory
        WHERE rowid NOT IN (SELECT rowid FROM memory_fts)
      `);
    } catch {
      // FTS5 not available — fall back to LIKE search
    }
  }

  /**
   * Index a memory entry into FTS.
   */
  indexEntry(entry: MemoryEntry): void {
    try {
      this.db.run(
        `INSERT INTO memory_fts(id, category, content, metadata) VALUES (?, ?, ?, ?)`,
        entry.id,
        entry.category,
        entry.content,
        JSON.stringify(entry.metadata)
      );
    } catch {
      // FTS5 not available
    }
  }

  /**
   * Search memory using FTS5 with ranking.
   */
  search(query: string, projectId?: ProjectId, limit: number = 10): MemoryEntry[] {
    try {
      // FTS5 search with BM25 ranking
      let sql: string;
      let params: unknown[];

      if (projectId) {
        sql = `SELECT m.* FROM memory m
               JOIN memory_fts f ON m.id = f.id
               WHERE memory_fts MATCH ? AND m.project_id = ?
               ORDER BY rank LIMIT ?`;
        params = [query, projectId, limit];
      } else {
        sql = `SELECT m.* FROM memory m
               JOIN memory_fts f ON m.id = f.id
               WHERE memory_fts MATCH ?
               ORDER BY rank LIMIT ?`;
        params = [query, limit];
      }

      const rows = this.db.all<{
        id: string; project_id: string | null; type: string; category: string;
        content: string; metadata: string; relevance: number;
        created_at: string; expires_at: string | null;
      }>(sql, ...params);

      return rows.map((r) => ({
        id: r.id,
        projectId: r.project_id as ProjectId | undefined,
        type: r.type as MemoryEntry["type"],
        category: r.category,
        content: r.content,
        metadata: JSON.parse(r.metadata),
        relevance: r.relevance,
        createdAt: new Date(r.created_at),
        expiresAt: r.expires_at ? new Date(r.expires_at) : undefined,
      }));
    } catch {
      // Fallback to LIKE search
      return this.fallbackSearch(query, projectId, limit);
    }
  }

  /**
   * Fallback LIKE-based search when FTS5 is not available.
   */
  private fallbackSearch(query: string, projectId?: ProjectId, limit: number = 10): MemoryEntry[] {
    let sql = "SELECT * FROM memory WHERE (content LIKE ? OR category LIKE ?)";
    const pattern = `%${query}%`;
    const params: unknown[] = [pattern, pattern];

    if (projectId) {
      sql += " AND (project_id = ? OR project_id IS NULL)";
      params.push(projectId);
    }

    sql += " ORDER BY relevance DESC, created_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.all<{
      id: string; project_id: string | null; type: string; category: string;
      content: string; metadata: string; relevance: number;
      created_at: string; expires_at: string | null;
    }>(sql, ...params);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id as ProjectId | undefined,
      type: r.type as MemoryEntry["type"],
      category: r.category,
      content: r.content,
      metadata: JSON.parse(r.metadata),
      relevance: r.relevance,
      createdAt: new Date(r.created_at),
      expiresAt: r.expires_at ? new Date(r.expires_at) : undefined,
    }));
  }

  /**
   * Rebuild FTS index from memory table.
   */
  rebuildIndex(): void {
    try {
      this.db.run("INSERT INTO memory_fts(memory_fts) VALUES('rebuild')");
    } catch {
      // Not available
    }
  }
}
