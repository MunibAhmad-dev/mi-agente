"use strict";

/**
 * AgentSelfLearningSystem.js — Phase 16: Full KV Learning Cycle.
 *
 * Components:
 *   EventDetector        — classify significant agent events
 *   LoopDetector         — detect repetitive patterns in task history
 *   KnowledgeGapDetector — identify knowledge gaps from task/response
 *   KnowledgeValidator   — validate knowledge: UNVERIFIED→PROVISIONAL→VERIFIED→HIGH_CONFIDENCE
 *   LessonObject         — structured lesson data model
 *   CausalMemory         — cause→effect relationship store
 *   SkillDistiller       — extract reusable skills from successful tasks
 *   ExperienceReplay     — replay past experiences to reinforce lessons
 *   RegressionMemory     — prevent forgetting what worked
 *   LearningBenchmark    — measure learning quality over time
 *
 * Main entry:
 *   learn(event, context) — detect → classify → extract → validate → store → distill
 *   getSystemStatus()     — full system stats
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KnowledgeStage = Object.freeze({
  UNVERIFIED: "UNVERIFIED",
  PROVISIONAL: "PROVISIONAL",
  VERIFIED: "VERIFIED",
  HIGH_CONFIDENCE: "HIGH_CONFIDENCE",
});

const EventType = Object.freeze({
  ERROR: "error",
  LOOP: "loop",
  SUCCESS: "success",
  TOOL_FAILURE: "tool_failure",
  UNEXPECTED_OUTPUT: "unexpected_output",
  KNOWLEDGE_GAP: "knowledge_gap",
  TASK_COMPLETE: "task_complete",
});

const Severity = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

// ---------------------------------------------------------------------------
// EventDetector
// ---------------------------------------------------------------------------

class EventDetector {
  /**
   * Classify an event from agent activity.
   * @param {object} event — raw event with at minimum { type, payload }
   * @returns {{ type: string, severity: string, needsLearning: boolean }}
   */
  classify(event) {
    try {
      const t = event && event.type ? String(event.type).toLowerCase() : "";
      const msg =
        event && event.message ? String(event.message).toLowerCase() : "";

      // Determine type
      let type = EventType.SUCCESS;
      if (
        t.includes("error") ||
        msg.includes("error") ||
        msg.includes("exception")
      ) {
        type = EventType.ERROR;
      } else if (t.includes("loop") || t.includes("repeat")) {
        type = EventType.LOOP;
      } else if (t.includes("tool_fail") || t.includes("tool failure")) {
        type = EventType.TOOL_FAILURE;
      } else if (t.includes("unexpected") || t.includes("mismatch")) {
        type = EventType.UNEXPECTED_OUTPUT;
      } else if (
        t.includes("gap") ||
        msg.includes("unknown") ||
        msg.includes("don't know")
      ) {
        type = EventType.KNOWLEDGE_GAP;
      } else if (
        t.includes("complete") ||
        t.includes("done") ||
        t.includes("success")
      ) {
        type = EventType.TASK_COMPLETE;
      }

      // Determine severity
      let severity = Severity.LOW;
      if (type === EventType.ERROR || type === EventType.TOOL_FAILURE) {
        severity = Severity.HIGH;
      } else if (type === EventType.LOOP) {
        severity = Severity.MEDIUM;
      } else if (
        type === EventType.UNEXPECTED_OUTPUT ||
        type === EventType.KNOWLEDGE_GAP
      ) {
        severity = Severity.MEDIUM;
      } else if (type === EventType.TASK_COMPLETE) {
        severity = Severity.LOW;
      }

      const needsLearning =
        severity !== Severity.LOW || type === EventType.KNOWLEDGE_GAP;

      return { type, severity, needsLearning };
    } catch (e) {
      return {
        type: EventType.ERROR,
        severity: Severity.LOW,
        needsLearning: false,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// LoopDetector
// ---------------------------------------------------------------------------

class LoopDetector {
  /**
   * Detect repetitive patterns in task history array.
   * @param {Array<{ action?: string, task?: string, tool?: string }>} history
   * @returns {{ isLoop: boolean, pattern: string|null, count: number }}
   */
  detect(history) {
    try {
      if (!Array.isArray(history) || history.length < 2) {
        return { isLoop: false, pattern: null, count: 0 };
      }

      // Build a fingerprint for each history entry
      const fingerprints = history.map((h) => {
        const parts = [h.action || "", h.task || "", h.tool || ""].join("|");
        return parts;
      });

      // Count occurrences of each fingerprint
      const counts = {};
      for (const fp of fingerprints) {
        counts[fp] = (counts[fp] || 0) + 1;
      }

      // Find most-repeated
      let maxPattern = null;
      let maxCount = 0;
      for (const [fp, cnt] of Object.entries(counts)) {
        if (cnt > maxCount) {
          maxCount = cnt;
          maxPattern = fp;
        }
      }

      const isLoop = maxCount >= 3;
      return { isLoop, pattern: isLoop ? maxPattern : null, count: maxCount };
    } catch (e) {
      return { isLoop: false, pattern: null, count: 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// KnowledgeGapDetector
// ---------------------------------------------------------------------------

class KnowledgeGapDetector {
  /**
   * Identify what the agent doesn't know.
   * @param {string} task
   * @param {string} response
   * @returns {{ gaps: Array<{ topic: string, confidence: number, reason: string }> }}
   */
  detect(task, response) {
    try {
      const gaps = [];
      const taskStr = String(task || "");
      const responseStr = String(response || "");

      // Indicators of knowledge gaps in response
      const gapPhrases = [
        {
          phrase: "i don't know",
          reason: "Agent explicitly stated lack of knowledge",
        },
        { phrase: "i'm not sure", reason: "Agent expressed uncertainty" },
        { phrase: "i cannot", reason: "Agent indicated inability" },
        { phrase: "unknown", reason: "Agent returned unknown result" },
        { phrase: "unclear", reason: "Topic was unclear to the agent" },
        {
          phrase: "not familiar",
          reason: "Agent is not familiar with the topic",
        },
        { phrase: "no information", reason: "No information available" },
      ];

      for (const { phrase, reason } of gapPhrases) {
        if (responseStr.toLowerCase().includes(phrase)) {
          // Extract a rough topic from the task
          const words = taskStr.split(/\s+/).slice(0, 5).join(" ");
          gaps.push({
            topic: words || "general",
            confidence: 0.3,
            reason,
          });
          break; // one gap per analysis is enough for now
        }
      }

      // If response is very short relative to task complexity → gap
      if (
        gaps.length === 0 &&
        taskStr.length > 100 &&
        responseStr.length < 50
      ) {
        gaps.push({
          topic: taskStr.split(/\s+/).slice(0, 5).join(" "),
          confidence: 0.5,
          reason: "Response too short for complex task",
        });
      }

      return { gaps };
    } catch (e) {
      return { gaps: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// KnowledgeValidator
// ---------------------------------------------------------------------------

class KnowledgeValidator {
  /**
   * Validate a fact through confidence stages.
   * @param {string} fact
   * @param {Array<string>} evidence — array of supporting evidence strings
   * @returns {string} — one of KnowledgeStage values
   */
  validate(fact, evidence) {
    try {
      if (!fact) return KnowledgeStage.UNVERIFIED;
      const ev = Array.isArray(evidence) ? evidence : [];
      const count = ev.filter((e) => e && String(e).trim().length > 0).length;

      if (count === 0) return KnowledgeStage.UNVERIFIED;
      if (count === 1) return KnowledgeStage.PROVISIONAL;
      if (count === 2) return KnowledgeStage.VERIFIED;
      return KnowledgeStage.HIGH_CONFIDENCE;
    } catch (e) {
      return KnowledgeStage.UNVERIFIED;
    }
  }
}

// ---------------------------------------------------------------------------
// CausalMemory
// ---------------------------------------------------------------------------

class CausalMemory {
  constructor() {
    /** @type {Map<string, Array<{ effect: string, context: any, timestamp: string }>>} */
    this._store = new Map();
  }

  /**
   * Add a cause→effect relationship.
   * @param {string} cause
   * @param {string} effect
   * @param {any} context
   */
  add(cause, effect, context) {
    try {
      const key = String(cause || "unknown");
      if (!this._store.has(key)) {
        this._store.set(key, []);
      }
      this._store.get(key).push({
        effect: String(effect || ""),
        context: context || null,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      // swallow
    }
  }

  /**
   * Query effects for a cause.
   * @param {string} cause
   * @returns {Array<{ effect: string, context: any, timestamp: string }>}
   */
  query(cause) {
    try {
      return this._store.get(String(cause || "unknown")) || [];
    } catch (e) {
      return [];
    }
  }

  getAll() {
    const result = {};
    for (const [cause, effects] of this._store.entries()) {
      result[cause] = effects;
    }
    return result;
  }

  get size() {
    return this._store.size;
  }
}

// ---------------------------------------------------------------------------
// SkillDistiller
// ---------------------------------------------------------------------------

class SkillDistiller {
  /**
   * Extract reusable skills from successful task completions.
   * @param {Array<{ task: string, action: string, result: string, success?: boolean }>} taskHistory
   * @returns {Array<{ id: string, name: string, description: string, pattern: string, successRate: number }>}
   */
  distill(taskHistory) {
    try {
      if (!Array.isArray(taskHistory)) return [];

      const successful = taskHistory.filter(
        (t) => t && t.success !== false && t.result,
      );
      if (successful.length === 0) return [];

      // Group by action pattern
      const byAction = {};
      for (const t of successful) {
        const action = String(t.action || "unknown");
        if (!byAction[action]) {
          byAction[action] = [];
        }
        byAction[action].push(t);
      }

      const skills = [];
      for (const [action, entries] of Object.entries(byAction)) {
        if (entries.length >= 1) {
          skills.push({
            id: `skill_${crypto.createHash("md5").update(action).digest("hex").slice(0, 8)}`,
            name: `skill_${action.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}`,
            description: `Reusable pattern for action: ${action}`,
            pattern: action,
            successRate: 1.0,
            examples: entries
              .slice(0, 3)
              .map((e) => ({ task: e.task, result: e.result })),
          });
        }
      }

      return skills;
    } catch (e) {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// ExperienceReplay
// ---------------------------------------------------------------------------

class ExperienceReplay {
  /**
   * @param {Map} lessonStore — reference to the lesson store
   */
  constructor(lessonStore) {
    this._lessons = lessonStore;
    this._replays = [];
  }

  /**
   * Replay a lesson to reinforce it.
   * @param {string} lessonId
   * @returns {{ success: boolean, reinforcement: string, applicationCount: number }}
   */
  replay(lessonId) {
    try {
      const lesson = this._lessons.get(lessonId);
      if (!lesson) {
        return {
          success: false,
          reinforcement: "lesson_not_found",
          applicationCount: 0,
        };
      }

      // Increment application count
      lesson.application_count = (lesson.application_count || 0) + 1;

      // Move toward higher confidence stage
      const stages = [
        KnowledgeStage.UNVERIFIED,
        KnowledgeStage.PROVISIONAL,
        KnowledgeStage.VERIFIED,
        KnowledgeStage.HIGH_CONFIDENCE,
      ];
      const idx = stages.indexOf(lesson.stage);
      if (idx >= 0 && idx < stages.length - 1) {
        lesson.stage = stages[idx + 1];
      }

      this._replays.push({ lessonId, timestamp: new Date().toISOString() });

      return {
        success: true,
        reinforcement: `Lesson reinforced. New stage: ${lesson.stage}`,
        applicationCount: lesson.application_count,
      };
    } catch (e) {
      return { success: false, reinforcement: e.message, applicationCount: 0 };
    }
  }

  get replayCount() {
    return this._replays.length;
  }
}

// ---------------------------------------------------------------------------
// RegressionMemory
// ---------------------------------------------------------------------------

class RegressionMemory {
  constructor() {
    /** @type {Map<string, { evidence: Array<string>, lastChecked: string, healthy: boolean }>} */
    this._records = new Map();
  }

  /**
   * Record that a skill works.
   * @param {string} skillName
   * @param {string[]} evidence
   */
  record(skillName, evidence) {
    try {
      const key = String(skillName || "unknown");
      const existing = this._records.get(key) || {
        evidence: [],
        lastChecked: null,
        healthy: true,
      };
      existing.evidence = [
        ...(existing.evidence || []),
        ...(Array.isArray(evidence) ? evidence : []),
      ];
      existing.healthy = true;
      existing.lastChecked = new Date().toISOString();
      this._records.set(key, existing);
    } catch (e) {
      // swallow
    }
  }

  /**
   * Check if a skill has regressed (evidence was removed or never recorded).
   * @param {string} skillName
   * @returns {boolean} true if regressed
   */
  checkRegression(skillName) {
    try {
      const rec = this._records.get(String(skillName || "unknown"));
      if (!rec) return true; // no record = possible regression
      return !rec.healthy || rec.evidence.length === 0;
    } catch (e) {
      return true;
    }
  }

  get size() {
    return this._records.size;
  }
}

// ---------------------------------------------------------------------------
// LearningBenchmark
// ---------------------------------------------------------------------------

class LearningBenchmark {
  /**
   * @param {Map} lessonStore
   */
  constructor(lessonStore) {
    this._lessons = lessonStore;
    this._snapshots = [];
  }

  /**
   * Calculate current learning quality score.
   * @returns {{ recall: number, precision: number, improvement_rate: number, total: number }}
   */
  score() {
    try {
      const lessons = Array.from(this._lessons.values());
      const total = lessons.length;

      if (total === 0) {
        return { recall: 0, precision: 0, improvement_rate: 0, total: 0 };
      }

      // Recall: fraction of lessons that reached at least PROVISIONAL
      const recalled = lessons.filter(
        (l) =>
          l.stage === KnowledgeStage.PROVISIONAL ||
          l.stage === KnowledgeStage.VERIFIED ||
          l.stage === KnowledgeStage.HIGH_CONFIDENCE,
      ).length;
      const recall = recalled / total;

      // Precision: fraction with HIGH_CONFIDENCE
      const precise = lessons.filter(
        (l) => l.stage === KnowledgeStage.HIGH_CONFIDENCE,
      ).length;
      const precision = precise / total;

      // Improvement rate: average application_count normalized
      const avgApplications =
        lessons.reduce((acc, l) => acc + (l.application_count || 0), 0) / total;
      const improvement_rate = Math.min(1, avgApplications / 5);

      const result = { recall, precision, improvement_rate, total };
      this._snapshots.push({ ...result, timestamp: new Date().toISOString() });
      return result;
    } catch (e) {
      return { recall: 0, precision: 0, improvement_rate: 0, total: 0 };
    }
  }

  get snapshotCount() {
    return this._snapshots.length;
  }
}

// ---------------------------------------------------------------------------
// LessonObject factory
// ---------------------------------------------------------------------------

function createLesson({
  trigger,
  context,
  root_cause,
  lesson,
  confidence,
  stage,
  evidence,
}) {
  return {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex"),
    trigger: trigger || "unknown",
    context: context || null,
    root_cause: root_cause || null,
    lesson: lesson || "",
    confidence: typeof confidence === "number" ? confidence : 0.5,
    stage: stage || KnowledgeStage.UNVERIFIED,
    created_at: new Date().toISOString(),
    evidence: Array.isArray(evidence) ? evidence : [],
    application_count: 0,
  };
}

// ---------------------------------------------------------------------------
// AgentSelfLearningSystem — main class
// ---------------------------------------------------------------------------

class AgentSelfLearningSystem {
  constructor(options) {
    const opts = options || {};
    this._persistPath = opts.persistPath || null; // e.g. 'data/self-learning-store.json'

    // Core stores
    /** @type {Map<string, object>} */
    this._lessons = new Map();
    /** @type {Array<object>} */
    this._skills = [];

    // Sub-components
    this.eventDetector = new EventDetector();
    this.loopDetector = new LoopDetector();
    this.gapDetector = new KnowledgeGapDetector();
    this.validator = new KnowledgeValidator();
    this.causalMemory = new CausalMemory();
    this.distiller = new SkillDistiller();
    this.replay = new ExperienceReplay(this._lessons);
    this.regressionMemory = new RegressionMemory();
    this.benchmark = new LearningBenchmark(this._lessons);

    // Load persisted state if path given
    this._loadFromDisk();
  }

  // -------------------------------------------------------------------------
  // Main entry: learn
  // -------------------------------------------------------------------------

  /**
   * Full learning cycle: detect → classify → extract lesson → validate → store → distill.
   * @param {object} event — { type, message, payload }
   * @param {object} context — { task, response, taskHistory, userId }
   * @returns {{ lesson: object|null, classified: object, gaps: object, stage: string }}
   */
  learn(event, context) {
    try {
      const ctx = context || {};

      // 1. Classify event
      const classified = this.eventDetector.classify(event);

      // 2. Detect loops
      const loopResult = ctx.taskHistory
        ? this.loopDetector.detect(ctx.taskHistory)
        : { isLoop: false, pattern: null, count: 0 };

      // 3. Detect knowledge gaps
      const gapResult = this.gapDetector.detect(
        ctx.task || "",
        ctx.response || "",
      );

      // 4. Only create a lesson if event needs learning
      if (!classified.needsLearning && gapResult.gaps.length === 0) {
        return {
          lesson: null,
          classified,
          gaps: gapResult,
          stage: KnowledgeStage.UNVERIFIED,
        };
      }

      // 5. Build evidence from context
      const evidence = [];
      if (event && event.message) evidence.push(String(event.message));
      if (ctx.response) evidence.push(String(ctx.response).slice(0, 200));
      if (loopResult.isLoop)
        evidence.push(`loop_detected:${loopResult.pattern}`);

      // 6. Validate knowledge
      const stage = this.validator.validate(event && event.message, evidence);

      // 7. Create lesson object
      const lesson = createLesson({
        trigger: classified.type,
        context: ctx.task || null,
        root_cause: loopResult.isLoop
          ? `loop: ${loopResult.pattern}`
          : (event && event.message) || null,
        lesson:
          gapResult.gaps.length > 0
            ? `Knowledge gap in: ${gapResult.gaps[0].topic}`
            : `Learned from ${classified.type}: ${(event && event.message) || "(no message)"}`,
        confidence: classified.severity === Severity.CRITICAL ? 0.9 : 0.5,
        stage,
        evidence,
      });

      // 8. Store lesson
      this._lessons.set(lesson.id, lesson);

      // 9. Record causal relationship
      if (classified.type !== EventType.SUCCESS) {
        const cause =
          event && event.message
            ? String(event.message).slice(0, 100)
            : classified.type;
        const effect = lesson.lesson;
        this.causalMemory.add(cause, effect, { lessonId: lesson.id });
      }

      // 10. Distill skills from task history if provided
      if (ctx.taskHistory && ctx.taskHistory.length > 0) {
        const newSkills = this.distiller.distill(ctx.taskHistory);
        for (const skill of newSkills) {
          if (!this._skills.find((s) => s.id === skill.id)) {
            this._skills.push(skill);
            this.regressionMemory.record(skill.name, [
              `distilled_from_${lesson.id}`,
            ]);
          }
        }
      }

      // 11. Persist to disk
      this._saveToDisk();

      return { lesson, classified, gaps: gapResult, stage };
    } catch (e) {
      return {
        lesson: null,
        classified: {
          type: EventType.ERROR,
          severity: Severity.LOW,
          needsLearning: false,
        },
        gaps: { gaps: [] },
        stage: KnowledgeStage.UNVERIFIED,
        error: e.message,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Query helpers
  // -------------------------------------------------------------------------

  getLessons() {
    return Array.from(this._lessons.values());
  }

  getLesson(id) {
    return this._lessons.get(id) || null;
  }

  getSkills() {
    return this._skills.slice();
  }

  // -------------------------------------------------------------------------
  // System status
  // -------------------------------------------------------------------------

  /**
   * Return full system status.
   */
  getSystemStatus() {
    try {
      const lessons = this.getLessons();
      const byStage = {
        [KnowledgeStage.UNVERIFIED]: 0,
        [KnowledgeStage.PROVISIONAL]: 0,
        [KnowledgeStage.VERIFIED]: 0,
        [KnowledgeStage.HIGH_CONFIDENCE]: 0,
      };
      for (const l of lessons) {
        if (byStage[l.stage] !== undefined) byStage[l.stage]++;
      }

      return {
        lessons: {
          total: lessons.length,
          byStage,
        },
        skills: {
          total: this._skills.length,
        },
        causalMemory: {
          causes: this.causalMemory.size,
        },
        regressionMemory: {
          records: this.regressionMemory.size,
        },
        experienceReplay: {
          replays: this.replay.replayCount,
        },
        benchmark: this.benchmark.score(),
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  _saveToDisk() {
    if (!this._persistPath) return;
    try {
      const dir = path.dirname(this._persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        lessons: Array.from(this._lessons.entries()),
        skills: this._skills,
        causalMemory: this.causalMemory.getAll(),
      };
      fs.writeFileSync(
        this._persistPath,
        JSON.stringify(data, null, 2),
        "utf8",
      );
    } catch (e) {
      // Non-fatal
    }
  }

  _loadFromDisk() {
    if (!this._persistPath) return;
    try {
      if (!fs.existsSync(this._persistPath)) return;
      const raw = fs.readFileSync(this._persistPath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.lessons)) {
        for (const [k, v] of data.lessons) {
          this._lessons.set(k, v);
        }
      }
      if (Array.isArray(data.skills)) {
        this._skills = data.skills;
      }
      if (data.causalMemory) {
        for (const [cause, effects] of Object.entries(data.causalMemory)) {
          for (const eff of effects) {
            this.causalMemory.add(cause, eff.effect, eff.context);
          }
        }
      }
    } catch (e) {
      // Non-fatal; start fresh
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  AgentSelfLearningSystem,
  EventDetector,
  LoopDetector,
  KnowledgeGapDetector,
  KnowledgeValidator,
  CausalMemory,
  SkillDistiller,
  ExperienceReplay,
  RegressionMemory,
  LearningBenchmark,
  KnowledgeStage,
  EventType,
  Severity,
  createLesson,
};
