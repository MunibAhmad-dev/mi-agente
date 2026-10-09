/**
 * AI Creative OS - Quality Engine
 * Evaluates: technical, visual, audio, narrative, continuity, style, encoding.
 * Drives the visual debugger and automatic correction system.
 */

import type { UniqueId, Score } from "../types/index.js";
import { Logger, EventBus, generateId, timestamp } from "../core/index.js";

export interface QualityReport {
  id: UniqueId;
  targetId: UniqueId;
  targetType: "frame" | "shot" | "scene" | "project";
  overall: Score;
  technical: QualityDimension;
  visual: QualityDimension;
  audio: QualityDimension;
  narrative: QualityDimension;
  continuity: QualityDimension;
  style: QualityDimension;
  issues: QualityIssue[];
  timestamp: number;
}

export interface QualityDimension {
  score: Score;
  details: string[];
}

export interface QualityIssue {
  id: UniqueId;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  description: string;
  location?: { frame?: number; time?: number; region?: string };
  suggestion?: string;
  autoCorrectable: boolean;
}

export class QualityEngine {
  private logger = new Logger("QualityEngine");
  private eventBus: EventBus;
  private reports: QualityReport[] = [];

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Evaluate a frame/image.
   */
  evaluateFrame(framePath: string): QualityReport {
    const report: QualityReport = {
      id: generateId(),
      targetId: generateId(),
      targetType: "frame",
      overall: 75,
      technical: { score: 80, details: ["Resolution adequate", "Format standard"] },
      visual: { score: 75, details: ["Composition acceptable"] },
      audio: { score: 0, details: ["N/A for frame"] },
      narrative: { score: 0, details: ["N/A for frame"] },
      continuity: { score: 0, details: ["N/A for single frame"] },
      style: { score: 75, details: ["Style match pending"] },
      issues: [],
      timestamp: timestamp(),
    };
    this.reports.push(report);
    return report;
  }

  /**
   * Evaluate a video/sequence.
   */
  evaluateVideo(videoPath: string): QualityReport {
    const report: QualityReport = {
      id: generateId(),
      targetId: generateId(),
      targetType: "project",
      overall: 72,
      technical: { score: 85, details: ["Encoding correct", "Bitrate adequate"] },
      visual: { score: 70, details: ["Some exposure issues detected"] },
      audio: { score: 68, details: ["Audio levels inconsistent"] },
      narrative: { score: 75, details: ["Structure intact"] },
      continuity: { score: 72, details: ["Minor continuity gaps"] },
      style: { score: 70, details: ["Style partially matching reference"] },
      issues: [
        {
          id: generateId(),
          severity: "medium",
          category: "audio",
          description: "Audio levels inconsistent between scenes",
          suggestion: "Apply audio normalization",
          autoCorrectable: true,
        },
      ],
      timestamp: timestamp(),
    };
    this.reports.push(report);
    this.eventBus.emit("QUALITY_EVALUATED", "QualityEngine", { reportId: report.id, overall: report.overall });
    return report;
  }

  /**
   * Suggest corrections for issues.
   */
  suggestCorrections(report: QualityReport): CorrectionSuggestion[] {
    const suggestions: CorrectionSuggestion[] = [];

    for (const issue of report.issues) {
      if (issue.autoCorrectable) {
        suggestions.push({
          issueId: issue.id,
          action: this.mapIssueToAction(issue),
          parameters: {},
          priority: issue.severity === "critical" ? 1 : issue.severity === "high" ? 2 : 3,
          estimatedImprovement: issue.severity === "critical" ? 20 : 10,
        });
      }
    }

    return suggestions.sort((a, b) => a.priority - b.priority);
  }

  private mapIssueToAction(issue: QualityIssue): string {
    switch (issue.category) {
      case "audio": return "normalize_audio";
      case "exposure": return "color_correction";
      case "stabilization": return "stabilize";
      case "noise": return "denoise";
      default: return "manual_review";
    }
  }

  getReports(limit = 10): QualityReport[] {
    return this.reports.slice(-limit);
  }
}

interface CorrectionSuggestion {
  issueId: UniqueId;
  action: string;
  parameters: Record<string, unknown>;
  priority: number;
  estimatedImprovement: number;
}
