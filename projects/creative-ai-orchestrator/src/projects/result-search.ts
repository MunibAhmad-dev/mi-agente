// ============================================================================
// Result Search
// ============================================================================
// Search outputs by quality, date, project, model, user rating.
// ============================================================================

import type { CaioDatabase, ProjectId } from "../core/types/index.js";

export interface SearchResult {
  executionId: string;
  projectId?: string;
  workflowName?: string;
  outputPath: string;
  qualityScore?: number;
  userRating?: string;
  createdAt: string;
  duration?: number;
}

export class ResultSearch {
  constructor(private db: CaioDatabase) {}

  /**
   * Search results by criteria.
   */
  search(opts: {
    projectId?: ProjectId;
    minQuality?: number;
    maxQuality?: number;
    type?: string;
    limit?: number;
    offset?: number;
  }): SearchResult[] {
    let sql = `SELECT e.id as executionId, e.project_id as projectId, e.outputs, e.resource_usage,
               e.duration_ms, e.started_at as createdAt, w.name as workflowName
               FROM executions e
               LEFT JOIN workflows w ON e.workflow_id = w.id
               WHERE e.status = 'completed'`;
    const params: unknown[] = [];

    if (opts.projectId) {
      sql += " AND e.project_id = ?";
      params.push(opts.projectId);
    }

    sql += " ORDER BY e.started_at DESC";
    sql += ` LIMIT ? OFFSET ?`;
    params.push(opts.limit || 20, opts.offset || 0);

    const rows = this.db.all<{
      executionId: string; projectId: string | null; outputs: string;
      duration_ms: number | null; createdAt: string; workflowName: string | null;
    }>(sql, ...params);

    const results: SearchResult[] = [];
    for (const row of rows) {
      const outputs = JSON.parse(row.outputs || "[]");
      for (const output of outputs) {
        results.push({
          executionId: row.executionId,
          projectId: row.projectId || undefined,
          workflowName: row.workflowName || undefined,
          outputPath: output.path || "",
          qualityScore: output.qualityScore,
          createdAt: row.createdAt,
          duration: row.duration_ms || undefined,
        });
      }
    }

    // Filter by quality
    if (opts.minQuality !== undefined) {
      return results.filter((r) => (r.qualityScore || 0) >= opts.minQuality!);
    }
    if (opts.maxQuality !== undefined) {
      return results.filter((r) => (r.qualityScore || 0) <= opts.maxQuality!);
    }

    return results;
  }

  /**
   * Get best results.
   */
  getBest(projectId?: ProjectId, limit: number = 10): SearchResult[] {
    return this.search({ projectId, limit, minQuality: 0 })
      .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
      .slice(0, limit);
  }
}
