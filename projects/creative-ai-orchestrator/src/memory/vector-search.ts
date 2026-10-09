// ============================================================================
// Vector Search — Semantic Memory using @xenova/transformers
// ============================================================================
// Uses all-MiniLM-L6-v2 for embedding generation.
// Downloads model on first use, caches in data dir.
// Falls back to TF-IDF-like hash embeddings if model unavailable.
// ============================================================================

import path from "node:path";
import type { CaioDatabase, MemoryEntry, ProjectId } from "../core/types/index.js";
import { newId } from "../core/types/index.js";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

export class VectorSearch {
  private embedder: any = null;
  private modelReady = false;
  private modelLoading = false;
  private modelLoadError: string | null = null;
  private embeddingDim = 384;

  constructor(private db: CaioDatabase, private dataDir?: string) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS vector_store (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        project_id TEXT,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  /**
   * Initialize the embedding model with retry and download.
   */
  private async initModel(): Promise<void> {
    if (this.modelReady || this.modelLoading) return;
    this.modelLoading = true;

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { pipeline, env } = await import("@xenova/transformers");

        // Configure cache directory
        if (this.dataDir) {
          env.cacheDir = path.join(this.dataDir, "model-cache");
        }

        // Disable remote model checking for faster startup
        env.allowLocalModels = true;

        this.embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          progress_callback: (progress: any) => {
            if (progress.status === "downloading") {
              console.log(`Vector model: downloading ${progress.progress || 0}%`);
            }
          },
        });

        this.modelReady = true;
        this.modelLoading = false;
        console.log("Vector search model loaded successfully");
        return;
      } catch (err: any) {
        this.modelLoadError = err.message;
        console.warn(`Vector model load attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    this.modelLoading = false;
    console.warn("Vector search: model unavailable, using hash fallback");
  }

  /**
   * Generate embedding for text.
   */
  async embed(text: string): Promise<number[]> {
    await this.initModel();
    if (this.embedder) {
      try {
        const output = await this.embedder(text, { pooling: "mean", normalize: true });
        return Array.from(output.data) as number[];
      } catch (err: any) {
        console.warn(`Embedding failed, using fallback: ${err.message}`);
      }
    }
    return this.hashEmbedding(text);
  }

  /**
   * Index a memory entry with vector embedding.
   */
  async indexEntry(entry: MemoryEntry): Promise<void> {
    const embedding = await this.embed(entry.content);
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    this.db.run(
      `INSERT OR REPLACE INTO vector_store (id, entry_id, project_id, text, embedding)
       VALUES (?, ?, ?, ?, ?)`,
      newId(),
      entry.id,
      entry.projectId || null,
      entry.content,
      embeddingBuffer
    );
  }

  /**
   * Semantic search.
   */
  async search(query: string, projectId?: ProjectId, limit: number = 10): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    const queryEmbedding = await this.embed(query);

    let sql = "SELECT id, entry_id, project_id, text, embedding FROM vector_store";
    const params: unknown[] = [];
    if (projectId) {
      sql += " WHERE project_id = ?";
      params.push(projectId);
    }

    const rows = this.db.all<{
      id: string; entry_id: string; project_id: string | null;
      text: string; embedding: Buffer;
    }>(sql, ...params);

    const results: Array<{ entryId: string; text: string; score: number }> = [];
    for (const row of rows) {
      const storedEmbedding = Array.from(new Float32Array(row.embedding.buffer));
      const score = cosineSimilarity(queryEmbedding, storedEmbedding);
      results.push({ entryId: row.entry_id, text: row.text, score });
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);
    const entries: Array<{ entry: MemoryEntry; score: number }> = [];

    for (const r of topResults) {
      const memRow = this.db.get<Record<string, any>>(
        "SELECT * FROM memory WHERE id = ?", r.entryId
      );
      if (memRow) {
        entries.push({
          entry: {
            id: memRow.id,
            projectId: memRow.project_id || undefined,
            type: memRow.type,
            category: memRow.category,
            content: memRow.content,
            metadata: JSON.parse(memRow.metadata || "{}"),
            relevance: memRow.relevance || 0.5,
            createdAt: new Date(memRow.created_at),
            expiresAt: memRow.expires_at ? new Date(memRow.expires_at) : undefined,
          },
          score: r.score,
        });
      }
    }

    return entries;
  }

  /**
   * Hybrid search — combines vector similarity with keyword match.
   */
  async hybridSearch(query: string, projectId?: ProjectId, limit: number = 10): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    const vectorResults = await this.search(query, projectId, limit * 2);

    let sql = "SELECT id FROM memory WHERE (content LIKE ? OR category LIKE ?)";
    const pattern = `%${query}%`;
    const params: unknown[] = [pattern, pattern];
    if (projectId) {
      sql += " AND (project_id = ? OR project_id IS NULL)";
      params.push(projectId);
    }
    sql += " LIMIT ?";
    params.push(limit);
    const keywordIds = new Set(this.db.all<{ id: string }>(sql, ...params).map((r) => r.id));

    const merged = vectorResults.map((r) => ({
      entry: r.entry,
      score: r.score + (keywordIds.has(r.entry.id) ? 0.2 : 0),
    }));

    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, limit);
  }

  /**
   * Simple hash-based fallback embedding.
   */
  private hashEmbedding(text: string, dims: number = 384): number[] {
    const vec = new Array(dims).fill(0);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      vec[i % dims] += c / 1000;
      vec[(i * 7 + 13) % dims] += c / 2000;
      vec[(i * 11 + 29) % dims] += Math.sin(c) * 0.1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vec.map((v) => v / norm) : vec;
  }

  isAvailable(): boolean { return this.modelReady; }
  getLoadError(): string | null { return this.modelLoadError; }
  getIndexSize(): number {
    return this.db.get<{ count: number }>("SELECT COUNT(*) as count FROM vector_store")?.count || 0;
  }
}
