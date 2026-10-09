"use strict";

const {
  AutonomousLearningEngine,
  TaskUnderstanding,
  KnowledgeConfidenceEngine,
  HypothesisEngine,
  ExperimentEngine,
  LearningEngine,
  CapabilityGraph,
  MetaLearningEngine,
  AICouncil,
  getAutonomousLearningEngine,
} = require("../AutonomousLearningEngine");

describe("AutonomousLearningEngine", () => {
  let engine;

  beforeEach(() => {
    engine = new AutonomousLearningEngine({
      registryPath: "/tmp/test-learning-registry.json",
    });
  });

  // ── Test 1: Instantiation ───────────────────────────────────────────────────
  test("instantiates without throwing", () => {
    expect(engine).toBeInstanceOf(AutonomousLearningEngine);
    expect(engine.taskUnderstanding).toBeInstanceOf(TaskUnderstanding);
    expect(engine.confidenceEngine).toBeInstanceOf(KnowledgeConfidenceEngine);
    expect(engine.council).toBeInstanceOf(AICouncil);
    expect(engine.hypothesisEngine).toBeInstanceOf(HypothesisEngine);
    expect(engine.experimentEngine).toBeInstanceOf(ExperimentEngine);
    expect(engine.learningEngine).toBeInstanceOf(LearningEngine);
    expect(engine.capabilityGraph).toBeInstanceOf(CapabilityGraph);
    expect(engine.metaLearning).toBeInstanceOf(MetaLearningEngine);
  });

  // ── Test 2: learn() stores a lesson ─────────────────────────────────────────
  test("learn() stores a lesson and returns expected shape", () => {
    const result = engine.learn({
      type: "debugging",
      description: "Fixed a null pointer exception by adding guard clause",
      success: true,
      meta: { duration: 120, approach: "defensive-programming" },
    });

    expect(result).toBeDefined();
    expect(result.lessonId).toBeDefined();
    expect(typeof result.lesson).toBe("string");
    expect(result.lesson.length).toBeGreaterThan(0);
    expect(Array.isArray(result.generalizations)).toBe(true);
    expect(typeof result.skill).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);

    // Lesson count should increase
    const stats = engine.getLearningStats();
    expect(stats.lessonsLearned).toBe(1);
  });

  // ── Test 3: learn() captures failure lessons too ─────────────────────────────
  test("learn() stores failure lessons with lower confidence", () => {
    const success = engine.learn({
      type: "testing",
      description: "Wrote unit tests that covered all paths",
      success: true,
    });
    const failure = engine.learn({
      type: "testing",
      description: "Missed edge case in integration test",
      success: false,
    });

    expect(success.confidence).toBeGreaterThan(failure.confidence);
    expect(failure.lesson).toMatch(/fail/i);
  });

  // ── Test 4: KnowledgeConfidenceEngine returns 0–1 score ─────────────────────
  test("KnowledgeConfidenceEngine.score() returns value in [0, 1]", () => {
    const ce = new KnowledgeConfidenceEngine();

    // Known topic
    const jsScore = ce.score("javascript");
    expect(jsScore).toBeGreaterThanOrEqual(0);
    expect(jsScore).toBeLessThanOrEqual(1);

    // Unknown topic — baseline
    const unknownScore = ce.score("obscure-framework-xyz-123");
    expect(unknownScore).toBeGreaterThanOrEqual(0);
    expect(unknownScore).toBeLessThanOrEqual(1);

    // Update confidence and verify it changes
    ce.update("topic-test", 0.3);
    const afterScore = ce.score("topic-test");
    expect(afterScore).toBeGreaterThan(0.3); // 0.3 baseline + 0.3 delta
  });

  // ── Test 5: HypothesisEngine returns array of hypotheses ────────────────────
  test("HypothesisEngine.generate() returns array of ranked hypotheses", () => {
    const he = new HypothesisEngine();

    const hypotheses = he.generate("performance bottleneck in the API");
    expect(Array.isArray(hypotheses)).toBe(true);
    expect(hypotheses.length).toBeGreaterThan(0);

    // Each hypothesis should have expected fields
    for (const h of hypotheses) {
      expect(typeof h.hypothesis).toBe("string");
      expect(typeof h.plausibility).toBe("number");
      expect(h.plausibility).toBeGreaterThanOrEqual(0);
      expect(h.plausibility).toBeLessThanOrEqual(1);
      expect(typeof h.rationale).toBe("string");
    }

    // Should be sorted by plausibility descending
    for (let i = 1; i < hypotheses.length; i++) {
      expect(hypotheses[i - 1].plausibility).toBeGreaterThanOrEqual(
        hypotheses[i].plausibility,
      );
    }
  });

  // ── Test 6: HypothesisEngine handles empty topic gracefully ─────────────────
  test("HypothesisEngine.generate() returns empty array for empty topic", () => {
    const he = new HypothesisEngine();
    expect(he.generate("")).toEqual([]);
    expect(he.generate(null)).toEqual([]);
  });

  // ── Test 7: CapabilityGraph.add() + query() ──────────────────────────────────
  test("CapabilityGraph.add() and query() work correctly", () => {
    const cg = new CapabilityGraph();

    cg.add("cap-1", "Test Writing", "Write automated tests", []);
    cg.add("cap-2", "Coverage Analysis", "Analyze test coverage", ["cap-1"]);

    // Query by name
    const results = cg.query("test");
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === "cap-1")).toBe(true);

    // Query by id
    const byId = cg.query("cap-2");
    expect(byId.length).toBeGreaterThan(0);

    // Get all
    const all = cg.query();
    expect(all.length).toBe(2);

    // Gaps: cap-1 is defined, cap-2 depends on cap-1 (defined) → no gaps
    expect(cg.findGaps()).toEqual([]);

    // Add node with undefined dep → gap
    cg.add("cap-3", "Mutation Testing", "Mutation tests", ["undefined-cap"]);
    expect(cg.findGaps()).toContain("undefined-cap");

    // toJSON
    const json = cg.toJSON();
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(Array.isArray(json.edges)).toBe(true);
  });

  // ── Test 8: getLearningStats() returns stats object ──────────────────────────
  test("getLearningStats() returns a complete stats object", () => {
    // Add a lesson first
    engine.learn({
      type: "research",
      description: "Found key paper on autonomous learning",
      success: true,
    });

    const stats = engine.getLearningStats();
    expect(stats).toBeDefined();
    expect(typeof stats.lessonsLearned).toBe("number");
    expect(stats.lessonsLearned).toBeGreaterThan(0);
    expect(typeof stats.confidenceScores).toBe("object");
    expect(typeof stats.capabilityCount).toBe("number");
    expect(stats.capabilityCount).toBeGreaterThan(0); // seeded capabilities
    expect(Array.isArray(stats.capabilityGaps)).toBe(true);
    expect(typeof stats.experiments).toBe("number");
    expect(stats.metaLearning).toBeDefined();
    expect(typeof stats.uptimeSeconds).toBe("number");
  });

  // ── Test 9: ExperimentEngine design + record round-trip ──────────────────────
  test("ExperimentEngine can design and record experiments", () => {
    const ee = new ExperimentEngine();

    const id = ee.design({
      hypothesis: "Caching reduces response time by 50%",
      steps: ["Measure baseline", "Enable cache", "Measure again"],
      expectedOutcome: "response time reduced",
    });

    expect(typeof id).toBe("string");

    const exp = ee.get(id);
    expect(exp).toBeDefined();
    expect(exp.status).toBe("designed");
    expect(exp.hypothesis).toContain("Caching");

    // Record result
    const completed = ee.record(
      id,
      "response time reduced by 52%",
      "hypothesis-confirmed",
    );
    expect(completed.status).toBe("completed");
    expect(completed.actualOutcome).toContain("52%");
    expect(completed.conclusion).toBe("hypothesis-confirmed");
  });

  // ── Test 10: AICouncil deliberates with 3 perspectives ───────────────────────
  test("AICouncil.deliberate() returns perspectives and consensus", () => {
    const council = new AICouncil();

    const result = council.deliberate(
      "Autonomous learning will always converge to optimal solutions",
    );
    expect(result).toBeDefined();
    expect(Array.isArray(result.perspectives)).toBe(true);
    expect(result.perspectives.length).toBe(3);
    expect(["test-and-validate", "reject"]).toContain(result.consensus);
    expect(Array.isArray(result.dissent)).toBe(true);
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  // ── Test 11: engine.hypothesize() delegates to HypothesisEngine ─────────────
  test("engine.hypothesize() returns hypotheses for a topic", () => {
    const hypotheses = engine.hypothesize("why is the learning system slow");
    expect(Array.isArray(hypotheses)).toBe(true);
    expect(hypotheses.length).toBeGreaterThan(0);
  });

  // ── Test 12: getAutonomousLearningEngine() returns singleton ──────────────────
  test("getAutonomousLearningEngine() returns the same singleton", () => {
    const a = getAutonomousLearningEngine();
    const b = getAutonomousLearningEngine();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(AutonomousLearningEngine);
  });

  // ── Test 13: CapabilityGraph reinforcement updates strength ───────────────────
  test("CapabilityGraph.reinforce() updates node strength", () => {
    const cg = new CapabilityGraph();
    cg.add("skill-x", "Skill X", "Test skill", []);

    const before = cg.query("skill-x")[0].strength;
    cg.reinforce("skill-x", 0.2);
    const after = cg.query("skill-x")[0].strength;

    expect(after).toBeGreaterThan(before);
  });

  // ── Test 14: learn() throws on invalid event ─────────────────────────────────
  test("learn() throws when event is not an object", () => {
    expect(() => engine.learn(null)).toThrow();
    expect(() => engine.learn("string")).toThrow();
  });
});
