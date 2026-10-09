// ============================================================================
// Memory System
// ============================================================================
// Short-term context, project memory, long-term knowledge, experiment memory.
// Only loads relevant memory into each prompt — not everything.
// ============================================================================

import type { MemoryEntry, ProjectId, CaioDatabase } from "../core/types/index.js";
import { newId } from "../core/types/index.js";

export class MemorySystem {
  constructor(private db: CaioDatabase) {}

  /**
   * Store a memory entry.
   */
  store(entry: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
    const id = newId();

    this.db.run(
      `INSERT INTO memory (id, project_id, type, category, content, metadata, relevance, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
      id,
      entry.projectId || null,
      entry.type,
      entry.category,
      entry.content,
      JSON.stringify(entry.metadata),
      entry.relevance,
      entry.expiresAt?.toISOString() || null
    );

    return {
      ...entry,
      id,
      createdAt: new Date(),
    };
  }

  /**
   * Recall relevant memories for a query and context.
   */
  recall(query: string, projectId?: ProjectId, type?: MemoryEntry["type"], limit: number = 10): MemoryEntry[] {
    let sql = "SELECT * FROM memory WHERE 1=1";
    const params: unknown[] = [];

    if (projectId) {
      sql += " AND (project_id = ? OR project_id IS NULL)";
      params.push(projectId);
    }
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    // Simple relevance: text match + recency + stored relevance
    // For production, use FTS5 or vector search
    sql += " AND (content LIKE ? OR category LIKE ?)";
    const pattern = `%${query}%`;
    params.push(pattern, pattern);

    sql += " ORDER BY relevance DESC, created_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.all<{
      id: string; project_id: string | null; type: string; category: string;
      content: string; metadata: string; relevance: number; created_at: string; expires_at: string | null;
    }>(sql, ...params);

    return rows
      .filter((r) => {
        if (r.expires_at && new Date(r.expires_at) < new Date()) return false;
        return true;
      })
      .map((r) => ({
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
   * Store experiment result.
   */
  storeExperimentResult(
    projectId: ProjectId,
    experimentId: string,
    params: Record<string, unknown>,
    result: Record<string, unknown>
  ): void {
    this.store({
      projectId,
      type: "experiment",
      category: "experiment_result",
      content: JSON.stringify({ experimentId, params, result }),
      metadata: { experimentId },
      relevance: result.success ? 0.8 : 0.3,
    });
  }

  /**
   * Store successful workflow pattern.
   */
  storeWorkflowSuccess(
    projectId: ProjectId,
    workflowType: string,
    parameters: Record<string, unknown>,
    qualityScore: number
  ): void {
    this.store({
      projectId,
      type: "project",
      category: "workflow_success",
      content: `Successful workflow: ${workflowType} with score ${qualityScore}`,
      metadata: { workflowType, parameters, qualityScore },
      relevance: qualityScore / 100,
    });
  }

  /**
   * Store user feedback.
   */
  storeFeedback(
    projectId: ProjectId,
    executionId: string,
    rating: "good" | "bad",
    comment?: string
  ): void {
    this.store({
      projectId,
      type: "short_term",
      category: "user_feedback",
      content: comment || `User rated execution ${executionId} as ${rating}`,
      metadata: { executionId, rating },
      relevance: rating === "good" ? 0.7 : 0.4,
    });
  }

  /**
   * Get relevant context for the creative agent.
   */
  getAgentContext(projectId: ProjectId): {
    successfulWorkflows: MemoryEntry[];
    failedWorkflows: MemoryEntry[];
    userPreferences: MemoryEntry[];
    experimentResults: MemoryEntry[];
  } {
    return {
      successfulWorkflows: this.recall("success", projectId, "project", 5),
      failedWorkflows: this.recall("fail", projectId, "project", 3),
      userPreferences: this.recall("", projectId, "short_term", 5),
      experimentResults: this.recall("experiment", projectId, "experiment", 10),
    };
  }

  /**
   * Clean expired memories.
   */
  cleanup(): number {
    const result = this.db.run("DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at < datetime('now')");
    return result.changes;
  }
}
