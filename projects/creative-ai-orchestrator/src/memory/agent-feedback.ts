// ============================================================================
// Agent Feedback Loop
// ============================================================================
// Learns from user feedback (thumbs up/down, comments) to improve
// future recommendations, workflow selection, and parameter choices.
// ============================================================================

import type { CaioDatabase, ProjectId } from "../core/types/index.js";
import { newId } from "../core/types/index.js";

export interface FeedbackSignal {
  type: "good" | "bad" | "improve" | "keep" | "rollback" | "try_again";
  context: {
    workflowType?: string;
    model?: string;
    parameters?: Record<string, unknown>;
    preset?: string;
    profile?: string;
  };
  comment?: string;
}

export interface LearningPattern {
  pattern: string;
  sentiment: "positive" | "negative";
  count: number;
  confidence: number;
}

export class AgentFeedbackLoop {
  constructor(private db: CaioDatabase) {}

  /**
   * Record feedback signal.
   */
  record(projectId: ProjectId, signal: FeedbackSignal): void {
    this.db.run(
      `INSERT INTO memory (id, project_id, type, category, content, metadata, relevance)
       VALUES (?, ?, 'short_term', 'agent_feedback', ?, ?, ?)`,
      newId(),
      projectId,
      `${signal.type}: ${signal.comment || "no comment"}`,
      JSON.stringify({ signal: signal.type, context: signal.context, comment: signal.comment }),
      signal.type === "good" || signal.type === "keep" ? 0.9 : 0.3
    );
  }

  /**
   * Get learning patterns for the agent.
   */
  getPatterns(projectId?: ProjectId, limit: number = 50): LearningPattern[] {
    let sql = "SELECT content, metadata FROM memory WHERE category = 'agent_feedback'";
    const params: unknown[] = [];

    if (projectId) {
      sql += " AND (project_id = ? OR project_id IS NULL)";
      params.push(projectId);
    }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.all<{ content: string; metadata: string }>(sql, ...params);

    // Analyze patterns
    const patternCounts = new Map<string, { positive: number; negative: number }>();

    for (const row of rows) {
      const meta = JSON.parse(row.metadata);
      const signal = meta.signal;
      const ctx = meta.context || {};

      // Build pattern key from context
      const parts: string[] = [];
      if (ctx.workflowType) parts.push(`workflow:${ctx.workflowType}`);
      if (ctx.model) parts.push(`model:${ctx.model}`);
      if (ctx.preset) parts.push(`preset:${ctx.preset}`);
      if (ctx.profile) parts.push(`profile:${ctx.profile}`);

      if (parts.length === 0) continue;

      const patternKey = parts.join("|");
      if (!patternCounts.has(patternKey)) patternCounts.set(patternKey, { positive: 0, negative: 0 });

      const stats = patternCounts.get(patternKey)!;
      if (signal === "good" || signal === "keep") stats.positive++;
      else if (signal === "bad" || signal === "rollback") stats.negative++;
    }

    return [...patternCounts.entries()]
      .map(([pattern, stats]) => ({
        pattern,
        sentiment: stats.positive > stats.negative ? "positive" as const : "negative" as const,
        count: stats.positive + stats.negative,
        confidence: Math.min(1, (stats.positive + stats.negative) / 10),
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get recommendations based on learned patterns.
   */
  getRecommendations(projectId?: ProjectId): string[] {
    const patterns = this.getPatterns(projectId, 30);
    const recommendations: string[] = [];

    for (const p of patterns) {
      if (p.confidence >= 0.5 && p.sentiment === "positive") {
        recommendations.push(`Use ${p.pattern.replace(/\|/g, ", ")} (positive feedback, ${p.count} times)`);
      }
      if (p.confidence >= 0.5 && p.sentiment === "negative") {
        recommendations.push(`Avoid ${p.pattern.replace(/\|/g, ", ")} (negative feedback, ${p.count} times)`);
      }
    }

    return recommendations;
  }
}
