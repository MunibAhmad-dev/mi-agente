// ============================================================================
// Feedback Learning
// ============================================================================
// Learns from user feedback (thumbs up/down, comments) to improve
// future recommendations and workflow selection.
// ============================================================================

import type { CaioDatabase, ProjectId } from "../core/types/index.js";
import { newId } from "../core/types/index.js";

export interface FeedbackEntry {
  id: string;
  projectId?: ProjectId;
  executionId?: string;
  rating: "good" | "bad" | "neutral";
  comment?: string;
  tags: string[];
  createdAt: Date;
}

export interface FeedbackInsight {
  category: string;
  sentiment: "positive" | "negative" | "mixed";
  count: number;
  examples: string[];
}

export class FeedbackSystem {
  constructor(private db: CaioDatabase) {}

  /**
   * Record user feedback.
   */
  record(entry: Omit<FeedbackEntry, "id" | "createdAt">): FeedbackEntry {
    const id = newId();
    this.db.run(
      `INSERT INTO memory (id, project_id, type, category, content, metadata, relevance, created_at)
       VALUES (?, ?, 'short_term', 'user_feedback', ?, ?, ?, datetime('now'))`,
      id,
      entry.projectId || null,
      entry.comment || `Rating: ${entry.rating}`,
      JSON.stringify({ executionId: entry.executionId, rating: entry.rating, tags: entry.tags }),
      entry.rating === "good" ? 0.8 : entry.rating === "bad" ? 0.3 : 0.5
    );
    return { ...entry, id, createdAt: new Date() };
  }

  /**
   * Get feedback insights for a project.
   */
  getInsights(projectId: ProjectId): FeedbackInsight[] {
    const rows = this.db.all<{ category: string; content: string; metadata: string }>(
      "SELECT category, content, metadata FROM memory WHERE project_id = ? AND category = 'user_feedback' ORDER BY created_at DESC LIMIT 50",
      projectId
    );

    const byTag = new Map<string, { positive: number; negative: number; examples: string[] }>();

    for (const row of rows) {
      const meta = JSON.parse(row.metadata);
      const tags = meta.tags || ["general"];
      const rating = meta.rating || "neutral";

      for (const tag of tags) {
        if (!byTag.has(tag)) byTag.set(tag, { positive: 0, negative: 0, examples: [] });
        const stats = byTag.get(tag)!;
        if (rating === "good") stats.positive++;
        else if (rating === "bad") stats.negative++;
        if (stats.examples.length < 3 && row.content) stats.examples.push(row.content);
      }
    }

    return [...byTag.entries()].map(([tag, stats]) => ({
      category: tag,
      sentiment: stats.positive > stats.negative ? "positive" : stats.negative > stats.positive ? "negative" : "mixed",
      count: stats.positive + stats.negative,
      examples: stats.examples,
    }));
  }

  /**
   * Get overall satisfaction score.
   */
  getSatisfactionScore(projectId: ProjectId): number {
    const row = this.db.get<{ total: number; good: number }>(
      `SELECT COUNT(*) as total,
       SUM(CASE WHEN json_extract(metadata, '$.rating') = 'good' THEN 1 ELSE 0 END) as good
       FROM memory WHERE project_id = ? AND category = 'user_feedback'`,
      projectId
    );
    if (!row || row.total === 0) return 0.5;
    return row.good / row.total;
  }
}
