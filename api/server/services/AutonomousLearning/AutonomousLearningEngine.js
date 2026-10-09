"use strict";

/**
 * AutonomousLearningEngine — Phase 10
 *
 * Full autonomous learning cycle:
 *   TaskUnderstanding → KnowledgeConfidence → AICouncil → HypothesisEngine
 *   → ExperimentEngine → LearningEngine (experience→generalization→skill→registry)
 *   → CapabilityGraph → MetaLearningEngine → Skill Regression → learn() entrypoint
 *
 * Zero external npm dependencies — uses only Node.js built-ins.
 * All components are self-contained and work without any external service.
 * Optional file persistence to data/learning-registry.json.
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

// ── 1. TaskUnderstanding ──────────────────────────────────────────────────────

class TaskUnderstanding {
  /**
   * Classify task complexity (0–100), extract required skills, identify knowledge gaps.
   * @param {string} task
   * @returns {{ complexity: number, requiredSkills: string[], knowledgeGaps: string[], taskType: string }}
   */
  classify(task) {
    if (!task || typeof task !== "string") {
      return {
        complexity: 0,
        requiredSkills: [],
        knowledgeGaps: [],
        taskType: "unknown",
      };
    }

    const lower = task.toLowerCase();
    const wordCount = task.split(/\s+/).length;

    // Complexity heuristics (0-100)
    let complexity = Math.min(100, wordCount * 2);
    if (/implement|architect|design|refactor|optimize/i.test(lower))
      complexity = Math.min(100, complexity + 30);
    if (/simple|quick|just|only|basic/i.test(lower))
      complexity = Math.max(0, complexity - 20);
    if (/multiple|several|all|entire|complete system/i.test(lower))
      complexity = Math.min(100, complexity + 20);
    if (/debug|fix|error|bug|issue/i.test(lower))
      complexity = Math.min(100, complexity + 15);

    // Extract required skills from keywords
    const requiredSkills = [];
    const skillKeywords = {
      programming: /code|function|class|api|algorithm|script|module/i,
      database: /database|sql|query|schema|table|collection|index/i,
      testing: /test|spec|coverage|assert|mock|unit|integration/i,
      security: /security|auth|permission|encrypt|token|credential/i,
      devops: /deploy|ci\/cd|docker|container|cloud|kubernetes|pipeline/i,
      analysis: /analyze|analyse|research|investigate|review|audit/i,
      writing: /write|document|explain|describe|summarize|report/i,
    };
    for (const [skill, pattern] of Object.entries(skillKeywords)) {
      if (pattern.test(lower)) requiredSkills.push(skill);
    }

    // Identify knowledge gaps (simple heuristic)
    const knowledgeGaps = [];
    if (complexity > 70 && requiredSkills.length > 2) {
      knowledgeGaps.push("Deep domain expertise required");
    }
    if (/latest|recent|new|2025|2026/i.test(lower)) {
      knowledgeGaps.push("Recent information may be outdated");
    }
    if (/specific|particular|exact|precise/i.test(lower)) {
      knowledgeGaps.push("Highly specific context may be missing");
    }

    // Task type
    let taskType = "general";
    if (/code|implement|build|create.*function/i.test(lower))
      taskType = "coding";
    else if (/research|find.*information|learn about|explain/i.test(lower))
      taskType = "research";
    else if (/fix|debug|error|issue|bug/i.test(lower)) taskType = "debugging";
    else if (/test|verify|check|validate/i.test(lower)) taskType = "testing";
    else if (/analyze|review|audit/i.test(lower)) taskType = "analysis";

    return { complexity, requiredSkills, knowledgeGaps, taskType };
  }
}

// ── 2. KnowledgeConfidenceEngine ─────────────────────────────────────────────

class KnowledgeConfidenceEngine {
  constructor() {
    /** @type {Map<string, {score: number, evidence: string[], updatedAt: number}>} */
    this._scores = new Map();
  }

  /**
   * Score confidence (0–1) for a topic based on stored evidence.
   * @param {string} topic
   * @returns {number} 0.0 – 1.0
   */
  score(topic) {
    if (!topic) return 0;
    const key = topic.toLowerCase().trim();
    const stored = this._scores.get(key);
    if (stored) return Math.min(1, Math.max(0, stored.score));
    // Heuristic: well-known topics start with modest confidence
    if (/javascript|python|sql|html|css|git|node|react/i.test(key)) return 0.7;
    if (/docker|kubernetes|aws|azure|gcp/i.test(key)) return 0.5;
    return 0.3; // unknown topic baseline
  }

  /**
   * Update confidence for a topic.
   * @param {string} topic
   * @param {number} delta - positive or negative adjustment
   * @param {string} [evidence]
   */
  update(topic, delta, evidence = "") {
    const key = topic.toLowerCase().trim();
    const current = this._scores.get(key) || {
      score: 0.3,
      evidence: [],
      updatedAt: Date.now(),
    };
    current.score = Math.min(1, Math.max(0, current.score + delta));
    if (evidence) current.evidence.push(evidence.slice(0, 100));
    current.updatedAt = Date.now();
    this._scores.set(key, current);
  }

  /**
   * Get all stored confidence scores.
   * @returns {object}
   */
  getAll() {
    const result = {};
    for (const [topic, data] of this._scores) {
      result[topic] = data.score;
    }
    return result;
  }
}

// ── 3. AICouncil — synthetic multi-perspective debate ─────────────────────────

class AICouncil {
  /**
   * Simulate a 3-perspective council debate (skeptic / optimist / pragmatist).
   * @param {string} hypothesis
   * @param {object} [context]
   * @returns {{ perspectives: object[], consensus: string, dissent: string[], confidence: number }}
   */
  deliberate(hypothesis, context = {}) {
    if (!hypothesis) {
      return {
        perspectives: [],
        consensus: "no-hypothesis",
        dissent: [],
        confidence: 0,
      };
    }

    const h = hypothesis.toLowerCase();

    // Skeptic: focuses on risks and what could go wrong
    const skepticConcerns = [];
    if (/always|never|guaranteed|perfect|certainly/i.test(hypothesis)) {
      skepticConcerns.push("Absolute claims are rarely valid");
    }
    if (/fast|quick|simple|easy/i.test(h)) {
      skepticConcerns.push("Underestimation of complexity is common");
    }
    const skepticView = skepticConcerns.length
      ? `Skeptic: Concerns — ${skepticConcerns.join("; ")}`
      : "Skeptic: Insufficient evidence to accept hypothesis without testing";

    // Optimist: focuses on potential and upside
    const optimistView = `Optimist: This hypothesis has merit — if validated, it could ${
      /improve|optimize|speed|better/i.test(h)
        ? "significantly improve outcomes"
        : "expand capabilities"
    }`;

    // Pragmatist: balanced, actionable
    const pragmatistView = `Pragmatist: Test this hypothesis with a small experiment first; measure results before broad adoption`;

    const perspectives = [
      { role: "skeptic", view: skepticView, vote: "reject" },
      { role: "optimist", view: optimistView, vote: "accept" },
      { role: "pragmatist", view: pragmatistView, vote: "test" },
    ];

    // Consensus: 2/3 say test or accept → "test-and-validate"
    const acceptVotes = perspectives.filter(
      (p) => p.vote === "accept" || p.vote === "test",
    ).length;
    const consensus = acceptVotes >= 2 ? "test-and-validate" : "reject";
    const dissent = perspectives
      .filter((p) =>
        consensus === "test-and-validate"
          ? p.vote === "reject"
          : p.vote !== "reject",
      )
      .map((p) => `${p.role}: ${p.view}`);

    const confidence = acceptVotes / perspectives.length;

    return { perspectives, consensus, dissent, confidence };
  }
}

// ── 4. HypothesisEngine ───────────────────────────────────────────────────────

class HypothesisEngine {
  /**
   * Generate ranked hypotheses for an unknown topic.
   * @param {string} topic
   * @param {object} [context]
   * @returns {Array<{hypothesis: string, plausibility: number, rationale: string}>}
   */
  generate(topic, context = {}) {
    if (!topic) return [];

    const lower = topic.toLowerCase();

    // Generate hypotheses based on topic signals
    const hypotheses = [];

    if (/performance|slow|latency/i.test(lower)) {
      hypotheses.push({
        hypothesis: `${topic} might be caused by inefficient data access patterns`,
        plausibility: 0.8,
        rationale:
          "Database and I/O bottlenecks are the most common performance root causes",
      });
      hypotheses.push({
        hypothesis: `${topic} is related to insufficient caching`,
        plausibility: 0.7,
        rationale: "Caching misses often explain repeated slow operations",
      });
      hypotheses.push({
        hypothesis: `${topic} is due to resource contention under load`,
        plausibility: 0.6,
        rationale: "Concurrency issues manifest as latency spikes",
      });
    } else if (/error|fail|bug|broken/i.test(lower)) {
      hypotheses.push({
        hypothesis: `${topic} is caused by an unhandled edge case`,
        plausibility: 0.75,
        rationale:
          "Most bugs are edge cases that were not considered during design",
      });
      hypotheses.push({
        hypothesis: `${topic} is a race condition in concurrent code`,
        plausibility: 0.55,
        rationale: "Race conditions are hard to reproduce and often overlooked",
      });
    } else if (/learn|improve|optimize/i.test(lower)) {
      hypotheses.push({
        hypothesis: `${topic} benefits most from increased data quality over quantity`,
        plausibility: 0.72,
        rationale:
          "Data quality typically has higher marginal returns than volume",
      });
      hypotheses.push({
        hypothesis: `${topic} can be accelerated with feedback loops`,
        plausibility: 0.68,
        rationale: "Rapid feedback allows faster convergence",
      });
    } else {
      hypotheses.push({
        hypothesis: `${topic} follows established domain patterns`,
        plausibility: 0.65,
        rationale: "Most problems in established domains have known solutions",
      });
      hypotheses.push({
        hypothesis: `${topic} requires empirical validation before conclusions`,
        plausibility: 0.8,
        rationale:
          "Assumptions without data are the primary source of incorrect decisions",
      });
      hypotheses.push({
        hypothesis: `${topic} can be simplified by decomposing into smaller sub-problems`,
        plausibility: 0.7,
        rationale: "Divide-and-conquer reliably reduces complexity",
      });
    }

    // Sort by plausibility descending
    return hypotheses.sort((a, b) => b.plausibility - a.plausibility);
  }
}

// ── 5. ExperimentEngine ───────────────────────────────────────────────────────

class ExperimentEngine {
  constructor() {
    /** @type {Map<string, object>} */
    this._experiments = new Map();
  }

  /**
   * Design and record a new experiment.
   * @param {object} opts
   * @param {string} opts.hypothesis
   * @param {string[]} opts.steps
   * @param {string} opts.expectedOutcome
   * @returns {string} experimentId
   */
  design({ hypothesis, steps, expectedOutcome }) {
    const id = `exp_${crypto.randomUUID().slice(0, 8)}`;
    this._experiments.set(id, {
      id,
      hypothesis: hypothesis || "",
      steps: steps || [],
      expectedOutcome: expectedOutcome || "",
      actualOutcome: null,
      conclusion: null,
      status: "designed",
      createdAt: Date.now(),
    });
    return id;
  }

  /**
   * Record the result of a completed experiment.
   * @param {string} id
   * @param {string} actualOutcome
   * @param {string} [conclusion]
   */
  record(id, actualOutcome, conclusion = "") {
    const exp = this._experiments.get(id);
    if (!exp) throw new Error(`Experiment ${id} not found`);
    exp.actualOutcome = actualOutcome;
    exp.conclusion =
      conclusion || this._deriveConclusion(exp.expectedOutcome, actualOutcome);
    exp.status = "completed";
    exp.completedAt = Date.now();
    return exp;
  }

  _deriveConclusion(expected, actual) {
    if (!expected || !actual) return "inconclusive";
    const expLower = expected.toLowerCase();
    const actLower = actual.toLowerCase();
    if (expLower === actLower) return "hypothesis-confirmed";
    // Check for partial overlap
    const expWords = expLower.split(/\s+/);
    const matches = expWords.filter(
      (w) => w.length > 3 && actLower.includes(w),
    );
    if (matches.length >= expWords.length * 0.5) return "partially-confirmed";
    return "hypothesis-refuted";
  }

  getAll() {
    return Array.from(this._experiments.values());
  }

  get(id) {
    return this._experiments.get(id) || null;
  }
}

// ── 6. LearningEngine — experience → generalization → skill → registry ────────

class LearningEngine {
  constructor() {
    /** @type {Map<string, {lesson: string, generalizations: string[], skill: string, confidence: number, learnedAt: number}>} */
    this._lessons = new Map();
  }

  /**
   * Full learning cycle: experience → generalization → skill extraction → registry write.
   * @param {object} event
   * @param {string} event.type - event type/category
   * @param {string} event.description - what happened
   * @param {boolean} event.success - did it work?
   * @param {object} [event.meta]
   * @returns {{ lessonId, lesson, generalizations, skill, confidence }}
   */
  learn(event) {
    const {
      type = "general",
      description = "",
      success = false,
      meta = {},
    } = event;

    const lessonId = `lesson_${crypto.randomUUID().slice(0, 8)}`;

    // Extract lesson
    const lesson = success
      ? `When handling "${type}", the approach "${description.slice(0, 80)}" succeeded`
      : `When handling "${type}", the approach "${description.slice(0, 80)}" failed — avoid this pattern`;

    // Generalize
    const generalizations = this._generalize(type, description, success);

    // Extract a transferable skill
    const skill = this._extractSkill(type, success);

    // Confidence based on outcome and repetition
    const repeats = Array.from(this._lessons.values()).filter(
      (l) =>
        l.lesson.includes(type) && Math.abs(l.learnedAt - Date.now()) < 3600000,
    ).length;
    const confidence = success
      ? Math.min(0.95, 0.5 + repeats * 0.1)
      : Math.max(0.1, 0.4 - repeats * 0.05);

    const record = {
      lessonId,
      lesson,
      generalizations,
      skill,
      confidence,
      learnedAt: Date.now(),
      type,
      success,
    };
    this._lessons.set(lessonId, record);

    return record;
  }

  _generalize(type, description, success) {
    const generalizations = [];
    if (success) {
      generalizations.push(
        `${type} tasks respond well to structured approaches`,
      );
      if (/step|plan|systematic/i.test(description)) {
        generalizations.push(
          "Step-by-step decomposition improves success rate",
        );
      }
    } else {
      generalizations.push(
        `${type} tasks can fail when assumptions are unvalidated`,
      );
      if (/fast|quick|shortcut/i.test(description)) {
        generalizations.push(
          "Shortcuts in complex domains increase error probability",
        );
      }
    }
    return generalizations;
  }

  _extractSkill(type, success) {
    if (success)
      return `skill:handle_${type.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
    return `skill:avoid_${type.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}_antipattern`;
  }

  getLessons() {
    return Array.from(this._lessons.values());
  }

  getLessonCount() {
    return this._lessons.size;
  }
}

// ── 7. CapabilityGraph ────────────────────────────────────────────────────────

class CapabilityGraph {
  constructor() {
    /** @type {Map<string, {id:string, name:string, description:string, deps:string[], strength:number, addedAt:number}>} */
    this._nodes = new Map();
    /** @type {Set<string>} edges as "from→to" */
    this._edges = new Set();
  }

  /**
   * Add a capability to the graph.
   * @param {string} id
   * @param {string} name
   * @param {string} [description]
   * @param {string[]} [deps] - capability ids this depends on
   */
  add(id, name, description = "", deps = []) {
    this._nodes.set(id, {
      id,
      name,
      description,
      deps,
      strength: 0.5,
      addedAt: Date.now(),
    });
    for (const dep of deps) {
      this._edges.add(`${dep}→${id}`);
    }
    return this;
  }

  /**
   * Query capabilities — by id prefix, name, or all.
   * @param {string} [query]
   * @returns {object[]}
   */
  query(query) {
    if (!query) return Array.from(this._nodes.values());
    const lower = query.toLowerCase();
    return Array.from(this._nodes.values()).filter(
      (n) =>
        n.id.toLowerCase().includes(lower) ||
        n.name.toLowerCase().includes(lower) ||
        n.description.toLowerCase().includes(lower),
    );
  }

  /**
   * Find gaps: capabilities referenced as deps but not yet defined.
   * @returns {string[]}
   */
  findGaps() {
    const gaps = [];
    for (const node of this._nodes.values()) {
      for (const dep of node.deps) {
        if (!this._nodes.has(dep)) {
          gaps.push(dep);
        }
      }
    }
    return [...new Set(gaps)];
  }

  /**
   * Update strength of a capability (e.g. after successful exercise).
   * @param {string} id
   * @param {number} delta
   */
  reinforce(id, delta) {
    const node = this._nodes.get(id);
    if (node) {
      node.strength = Math.min(1, Math.max(0, node.strength + delta));
    }
  }

  toJSON() {
    return {
      nodes: Array.from(this._nodes.values()),
      edges: Array.from(this._edges),
    };
  }

  size() {
    return this._nodes.size;
  }
}

// ── 8. MetaLearningEngine ─────────────────────────────────────────────────────

class MetaLearningEngine {
  constructor() {
    this._observations = [];
  }

  /**
   * Record an observation about learning effectiveness.
   * @param {{ type: string, success: boolean, duration: number, approach: string }}
   */
  observe(observation) {
    this._observations.push({ ...observation, ts: Date.now() });
    if (this._observations.length > 500) this._observations.shift();
  }

  /**
   * Analyze learning patterns and suggest strategy changes.
   * @returns {{ patterns: string[], suggestions: string[], learningRate: number }}
   */
  analyze() {
    const total = this._observations.length;
    if (total === 0) {
      return {
        patterns: [],
        suggestions: ["Gather more data before meta-analysis"],
        learningRate: 0,
      };
    }

    const successes = this._observations.filter((o) => o.success).length;
    const successRate = successes / total;

    const patterns = [];
    const suggestions = [];

    // Pattern: success rate trend
    if (successRate > 0.75) {
      patterns.push(
        `High success rate (${Math.round(successRate * 100)}%) — current strategy is working well`,
      );
    } else if (successRate > 0.5) {
      patterns.push(
        `Moderate success rate (${Math.round(successRate * 100)}%) — room for improvement`,
      );
      suggestions.push(
        "Consider adding more verification steps before execution",
      );
    } else {
      patterns.push(
        `Low success rate (${Math.round(successRate * 100)}%) — strategy needs revision`,
      );
      suggestions.push("Increase simulation and planning phases");
      suggestions.push("Review failed cases for common patterns");
    }

    // Pattern: approach diversity
    const approaches = new Set(
      this._observations.map((o) => o.approach).filter(Boolean),
    );
    if (approaches.size <= 1) {
      patterns.push("Only one approach in use — limited exploration");
      suggestions.push(
        "Experiment with alternative strategies to find better fits",
      );
    }

    // Learning rate: rate of improvement over recent vs. older observations
    const halfPoint = Math.floor(total / 2);
    if (halfPoint > 0) {
      const olderSuccessRate =
        this._observations.slice(0, halfPoint).filter((o) => o.success).length /
        halfPoint;
      const recentSuccessRate =
        this._observations.slice(halfPoint).filter((o) => o.success).length /
        (total - halfPoint);
      const improvement = recentSuccessRate - olderSuccessRate;
      patterns.push(
        `Learning trend: ${improvement >= 0 ? "+" : ""}${Math.round(improvement * 100)}% vs. earlier period`,
      );
    }

    const learningRate = Math.min(
      1,
      successRate + (suggestions.length === 0 ? 0.1 : -0.05),
    );

    return { patterns, suggestions, learningRate };
  }
}

// ── Main AutonomousLearningEngine ─────────────────────────────────────────────

class AutonomousLearningEngine {
  constructor(opts = {}) {
    this._opts = opts;
    this._startedAt = Date.now();

    this.taskUnderstanding = new TaskUnderstanding();
    this.confidenceEngine = new KnowledgeConfidenceEngine();
    this.council = new AICouncil();
    this.hypothesisEngine = new HypothesisEngine();
    this.experimentEngine = new ExperimentEngine();
    this.learningEngine = new LearningEngine();
    this.capabilityGraph = new CapabilityGraph();
    this.metaLearning = new MetaLearningEngine();

    // Seed the capability graph with baseline capabilities
    this._seedCapabilities();

    // Optional file persistence
    this._registryPath =
      opts.registryPath ||
      path.join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "data",
        "learning-registry.json",
      );
  }

  _seedCapabilities() {
    this.capabilityGraph
      .add(
        "reasoning",
        "Logical Reasoning",
        "Deductive and inductive reasoning",
        [],
      )
      .add("code_generation", "Code Generation", "Write and modify code", [
        "reasoning",
      ])
      .add("code_review", "Code Review", "Review and analyze code quality", [
        "code_generation",
      ])
      .add("testing", "Test Writing", "Write automated tests", [
        "code_generation",
      ])
      .add("debugging", "Debugging", "Find and fix bugs", [
        "code_generation",
        "reasoning",
      ])
      .add("research", "Research", "Gather and synthesize information", [
        "reasoning",
      ])
      .add("planning", "Task Planning", "Break tasks into executable steps", [
        "reasoning",
      ])
      .add(
        "security_analysis",
        "Security Analysis",
        "Identify security vulnerabilities",
        ["code_review", "research"],
      );
  }

  // ── learn(event) — main entry point ──────────────────────────────────────────

  /**
   * Main learning entry: classify event → extract lesson → update confidence
   * → update capability graph → write to registry.
   *
   * @param {object} event
   * @param {string} event.type - event type/category
   * @param {string} event.description - what happened
   * @param {boolean} [event.success] - did it succeed?
   * @param {object} [event.meta]
   * @returns {{ lessonId, lesson, generalizations, skill, confidence, capabilityUpdated }}
   */
  learn(event) {
    if (!event || typeof event !== "object") {
      throw new Error("event must be an object with type and description");
    }
    const {
      type = "general",
      description = "",
      success = false,
      meta = {},
    } = event;

    // 1. Task understanding on the event description
    const understanding = this.taskUnderstanding.classify(description);

    // 2. Core learning cycle
    const lesson = this.learningEngine.learn({
      type,
      description,
      success,
      meta,
    });

    // 3. Update confidence for the event type
    const confidenceDelta = success ? +0.05 : -0.03;
    this.confidenceEngine.update(
      type,
      confidenceDelta,
      description.slice(0, 80),
    );

    // 4. Update capability graph
    let capabilityUpdated = false;
    for (const skill of understanding.requiredSkills) {
      if (this.capabilityGraph.query(skill).length > 0) {
        this.capabilityGraph.reinforce(skill, success ? 0.05 : -0.02);
        capabilityUpdated = true;
      }
    }

    // 5. Meta-learning observation
    this.metaLearning.observe({
      type,
      success,
      duration: meta.duration || 0,
      approach: meta.approach || "default",
    });

    // 6. Persist to file (best-effort, never throws)
    this._persistToFile();

    return { ...lesson, capabilityUpdated, understanding };
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  /**
   * Generate hypotheses for a topic.
   * @param {string} topic
   * @param {object} [context]
   * @returns {Array<{hypothesis, plausibility, rationale}>}
   */
  hypothesize(topic, context = {}) {
    return this.hypothesisEngine.generate(topic, context);
  }

  /**
   * Submit an experiment result.
   * @param {string} experimentId
   * @param {string} actualOutcome
   * @param {string} [conclusion]
   * @returns {object}
   */
  recordExperiment(experimentId, actualOutcome, conclusion = "") {
    return this.experimentEngine.record(
      experimentId,
      actualOutcome,
      conclusion,
    );
  }

  /**
   * Design a new experiment.
   * @param {{ hypothesis, steps, expectedOutcome }}
   * @returns {string} experimentId
   */
  designExperiment({ hypothesis, steps, expectedOutcome }) {
    return this.experimentEngine.design({ hypothesis, steps, expectedOutcome });
  }

  /**
   * Get confidence score for a topic (0–1).
   * @param {string} topic
   * @returns {number}
   */
  getConfidence(topic) {
    return this.confidenceEngine.score(topic);
  }

  /**
   * Get full learning stats.
   * @returns {object}
   */
  getLearningStats() {
    const metaAnalysis = this.metaLearning.analyze();
    return {
      lessonsLearned: this.learningEngine.getLessonCount(),
      confidenceScores: this.confidenceEngine.getAll(),
      capabilityCount: this.capabilityGraph.size(),
      capabilityGaps: this.capabilityGraph.findGaps(),
      experiments: this.experimentEngine.getAll().length,
      metaLearning: metaAnalysis,
      uptimeSeconds: Math.round((Date.now() - this._startedAt) / 1000),
    };
  }

  // ── File persistence ──────────────────────────────────────────────────────────

  _persistToFile() {
    try {
      const dir = path.dirname(this._registryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const registry = {
        updatedAt: new Date().toISOString(),
        lessons: this.learningEngine.getLessons().slice(-200), // cap at 200
        confidenceScores: this.confidenceEngine.getAll(),
        capabilities: this.capabilityGraph.toJSON().nodes,
      };
      fs.writeFileSync(
        this._registryPath,
        JSON.stringify(registry, null, 2),
        "utf8",
      );
    } catch {
      /* file system unavailable — non-fatal */
    }
  }

  /**
   * Load registry from file on startup (optional).
   */
  loadFromFile() {
    try {
      if (!fs.existsSync(this._registryPath)) return false;
      const raw = fs.readFileSync(this._registryPath, "utf8");
      const registry = JSON.parse(raw);

      // Restore confidence scores
      if (registry.confidenceScores) {
        for (const [topic, score] of Object.entries(
          registry.confidenceScores,
        )) {
          this.confidenceEngine.update(
            topic,
            score - this.confidenceEngine.score(topic),
          );
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

let _instance = null;

function getAutonomousLearningEngine() {
  if (!_instance) {
    _instance = new AutonomousLearningEngine();
    _instance.loadFromFile();
  }
  return _instance;
}

module.exports = {
  AutonomousLearningEngine,
  TaskUnderstanding,
  KnowledgeConfidenceEngine,
  AICouncil,
  HypothesisEngine,
  ExperimentEngine,
  LearningEngine,
  CapabilityGraph,
  MetaLearningEngine,
  getAutonomousLearningEngine,
};
