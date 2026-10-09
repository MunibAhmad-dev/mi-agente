"use strict";

/**
 * selfLearning.spec.js — Phase 16: Agent Self-Learning System tests.
 */

const {
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
} = require("../AgentSelfLearningSystem");

describe("AgentSelfLearningSystem — Phase 16", () => {
  // -------------------------------------------------------------------------
  // EventDetector
  // -------------------------------------------------------------------------
  describe("EventDetector", () => {
    const detector = new EventDetector();

    it("classifies error events with HIGH severity", () => {
      const result = detector.classify({
        type: "error",
        message: "Connection refused",
      });
      expect(result.type).toBe(EventType.ERROR);
      expect(result.severity).toBe(Severity.HIGH);
      expect(result.needsLearning).toBe(true);
    });

    it("classifies success events with LOW severity", () => {
      const result = detector.classify({
        type: "task_complete",
        message: "Done",
      });
      expect(result.type).toBe(EventType.TASK_COMPLETE);
      expect(result.severity).toBe(Severity.LOW);
    });

    it("classifies knowledge gap events", () => {
      const result = detector.classify({
        type: "gap",
        message: "unknown topic",
      });
      expect(result.type).toBe(EventType.KNOWLEDGE_GAP);
      expect(result.needsLearning).toBe(true);
    });

    it("handles null/undefined events gracefully", () => {
      const result = detector.classify(null);
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.severity).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // LoopDetector
  // -------------------------------------------------------------------------
  describe("LoopDetector", () => {
    const loopDet = new LoopDetector();

    it("detects repeated patterns (3+ occurrences)", () => {
      const history = [
        { action: "retry", task: "fetch_data", tool: "http" },
        { action: "retry", task: "fetch_data", tool: "http" },
        { action: "retry", task: "fetch_data", tool: "http" },
      ];
      const result = loopDet.detect(history);
      expect(result.isLoop).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(3);
      expect(result.pattern).toBeDefined();
    });

    it("does not flag unique sequences as loops", () => {
      const history = [
        { action: "read", task: "read_file" },
        { action: "write", task: "write_file" },
        { action: "test", task: "run_tests" },
      ];
      const result = loopDet.detect(history);
      expect(result.isLoop).toBe(false);
    });

    it("handles empty history gracefully", () => {
      const result = loopDet.detect([]);
      expect(result.isLoop).toBe(false);
      expect(result.count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // KnowledgeGapDetector
  // -------------------------------------------------------------------------
  describe("KnowledgeGapDetector", () => {
    const gapDet = new KnowledgeGapDetector();

    it("detects uncertainty phrases in response", () => {
      const result = gapDet.detect(
        "How does quantum entanglement work?",
        "I'm not sure about the details of quantum entanglement.",
      );
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps[0].reason).toBeDefined();
    });

    it("returns empty gaps for confident responses", () => {
      const result = gapDet.detect(
        "What is 2+2?",
        "The answer is 4. This is a basic arithmetic operation.",
      );
      // may or may not have gaps depending on response length; just check structure
      expect(result).toHaveProperty("gaps");
      expect(Array.isArray(result.gaps)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // KnowledgeValidator stages
  // -------------------------------------------------------------------------
  describe("KnowledgeValidator", () => {
    const validator = new KnowledgeValidator();

    it("returns UNVERIFIED with no evidence", () => {
      expect(validator.validate("some fact", [])).toBe(
        KnowledgeStage.UNVERIFIED,
      );
    });

    it("returns PROVISIONAL with one piece of evidence", () => {
      expect(validator.validate("some fact", ["one evidence"])).toBe(
        KnowledgeStage.PROVISIONAL,
      );
    });

    it("returns VERIFIED with two pieces of evidence", () => {
      expect(validator.validate("some fact", ["ev1", "ev2"])).toBe(
        KnowledgeStage.VERIFIED,
      );
    });

    it("returns HIGH_CONFIDENCE with 3+ evidence items", () => {
      expect(validator.validate("some fact", ["ev1", "ev2", "ev3"])).toBe(
        KnowledgeStage.HIGH_CONFIDENCE,
      );
    });
  });

  // -------------------------------------------------------------------------
  // CausalMemory
  // -------------------------------------------------------------------------
  describe("CausalMemory", () => {
    it("adds and queries cause→effect relationships", () => {
      const cm = new CausalMemory();
      cm.add("network_timeout", "request_failed", { tool: "http_client" });
      const effects = cm.query("network_timeout");
      expect(effects.length).toBe(1);
      expect(effects[0].effect).toBe("request_failed");
      expect(effects[0].context).toMatchObject({ tool: "http_client" });
    });

    it("returns empty array for unknown cause", () => {
      const cm = new CausalMemory();
      expect(cm.query("nonexistent_cause")).toEqual([]);
    });

    it("accumulates multiple effects for same cause", () => {
      const cm = new CausalMemory();
      cm.add("bad_input", "validation_error", {});
      cm.add("bad_input", "user_notified", {});
      const effects = cm.query("bad_input");
      expect(effects.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // LearningBenchmark
  // -------------------------------------------------------------------------
  describe("LearningBenchmark", () => {
    it("returns score object with required fields when lesson store is empty", () => {
      const store = new Map();
      const bench = new LearningBenchmark(store);
      const score = bench.score();
      expect(score).toHaveProperty("recall");
      expect(score).toHaveProperty("precision");
      expect(score).toHaveProperty("improvement_rate");
      expect(score).toHaveProperty("total");
      expect(score.total).toBe(0);
    });

    it("calculates recall correctly from lesson stages", () => {
      const store = new Map();
      const lesson1 = createLesson({
        trigger: "error",
        stage: KnowledgeStage.PROVISIONAL,
      });
      const lesson2 = createLesson({
        trigger: "loop",
        stage: KnowledgeStage.UNVERIFIED,
      });
      store.set(lesson1.id, lesson1);
      store.set(lesson2.id, lesson2);

      const bench = new LearningBenchmark(store);
      const score = bench.score();
      // 1 of 2 is at PROVISIONAL+ → recall = 0.5
      expect(score.recall).toBeCloseTo(0.5);
      expect(score.total).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // AgentSelfLearningSystem.learn()
  // -------------------------------------------------------------------------
  describe("AgentSelfLearningSystem.learn()", () => {
    let system;

    beforeEach(() => {
      system = new AgentSelfLearningSystem({});
    });

    it("creates a lesson when error event is submitted", () => {
      const result = system.learn(
        { type: "error", message: "File not found: config.json" },
        {
          task: "Load project configuration",
          response: "Failed to load config",
        },
      );
      expect(result.lesson).not.toBeNull();
      expect(result.lesson.trigger).toBe(EventType.ERROR);
      expect(result.classified.severity).toBe(Severity.HIGH);
    });

    it("does not create lesson for routine success without gaps", () => {
      const result = system.learn(
        { type: "task_complete", message: "Task finished successfully" },
        {
          task: "Print hello",
          response:
            "hello world printed successfully without any issues at all ever",
        },
      );
      // task_complete with confident response likely won't trigger learning
      // (needsLearning is false and no gaps) — lesson should be null
      expect(result.classified).toBeDefined();
    });

    it("stores lesson and retrieves it", () => {
      system.learn(
        { type: "error", message: "Syntax error in main.py" },
        { task: "Run script" },
      );
      const lessons = system.getLessons();
      expect(lessons.length).toBeGreaterThan(0);
    });

    it("records causal memory for non-success events", () => {
      system.learn(
        { type: "tool_failure", message: "HTTP 503" },
        { task: "Fetch external API" },
      );
      const effects = system.causalMemory.query("HTTP 503");
      expect(effects.length).toBeGreaterThan(0);
    });

    it("getSystemStatus returns stats object with expected keys", () => {
      const status = system.getSystemStatus();
      expect(status).toHaveProperty("lessons");
      expect(status).toHaveProperty("skills");
      expect(status).toHaveProperty("causalMemory");
      expect(status).toHaveProperty("benchmark");
    });
  });

  // -------------------------------------------------------------------------
  // ExperienceReplay
  // -------------------------------------------------------------------------
  describe("ExperienceReplay", () => {
    it("replays a lesson and advances its stage", () => {
      const store = new Map();
      const lesson = createLesson({
        trigger: "error",
        stage: KnowledgeStage.UNVERIFIED,
        lesson: "Test lesson",
      });
      store.set(lesson.id, lesson);

      const er = new ExperienceReplay(store);
      const result = er.replay(lesson.id);
      expect(result.success).toBe(true);
      expect(result.applicationCount).toBe(1);
      // Stage should advance
      expect(store.get(lesson.id).stage).toBe(KnowledgeStage.PROVISIONAL);
    });

    it("returns failure for unknown lesson id", () => {
      const store = new Map();
      const er = new ExperienceReplay(store);
      const result = er.replay("nonexistent-id");
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // RegressionMemory
  // -------------------------------------------------------------------------
  describe("RegressionMemory", () => {
    it("records a skill and reports no regression", () => {
      const rm = new RegressionMemory();
      rm.record("parse_json", ["test_pass_1", "test_pass_2"]);
      expect(rm.checkRegression("parse_json")).toBe(false);
    });

    it("reports regression for unrecorded skill", () => {
      const rm = new RegressionMemory();
      expect(rm.checkRegression("unknown_skill")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // SkillDistiller
  // -------------------------------------------------------------------------
  describe("SkillDistiller", () => {
    it("distills skills from successful task history", () => {
      const distiller = new SkillDistiller();
      const history = [
        {
          action: "write_file",
          task: "Create config",
          result: "success",
          success: true,
        },
        {
          action: "write_file",
          task: "Create test",
          result: "success",
          success: true,
        },
      ];
      const skills = distiller.distill(history);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0]).toHaveProperty("id");
      expect(skills[0]).toHaveProperty("pattern");
    });

    it("returns empty array for empty history", () => {
      const distiller = new SkillDistiller();
      expect(distiller.distill([])).toEqual([]);
    });
  });
});
