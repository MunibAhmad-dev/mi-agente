"use strict";
/**
 * ExecutiveAISystem — cohesive Executive AI orchestrator (Phase 8)
 *
 * Unifies all executive components under one authority:
 * Executive Director → World Model → Task Graph → Policy Engine →
 * Simulation Before Action → Agent Fabric → Checkpoint & Recovery →
 * Multi-Model Judge → Event Sourcing → Observability
 *
 * Works in degraded mode if any component is unavailable.
 */

const crypto = require("crypto");
const EventEmitter = require("events");

// ── TaskGraph ─────────────────────────────────────────────────────────────────
class TaskGraph {
  constructor() {
    this.nodes = new Map(); // id → {id, task, status, deps, result, startedAt, completedAt}
    this.edges = new Map(); // id → Set<childId>
  }

  addNode(task, deps = []) {
    const id = crypto.randomBytes(6).toString("hex");
    this.nodes.set(id, {
      id,
      task,
      status: "pending",
      deps,
      result: null,
      startedAt: null,
      completedAt: null,
    });
    this.edges.set(id, new Set());
    deps.forEach((dep) => {
      if (this.edges.has(dep)) {
        this.edges.get(dep).add(id);
      }
    });
    return id;
  }

  setStatus(id, status, result = null) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.status = status;
    node.result = result;
    if (status === "running") node.startedAt = new Date().toISOString();
    if (status === "done" || status === "failed")
      node.completedAt = new Date().toISOString();
  }

  getReady() {
    const ready = [];
    for (const [id, node] of this.nodes) {
      if (node.status !== "pending") continue;
      const allDepsDone = node.deps.every((dep) => {
        const d = this.nodes.get(dep);
        return d && d.status === "done";
      });
      if (allDepsDone) ready.push(node);
    }
    return ready;
  }

  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.entries()).map(([id, children]) => ({
        from: id,
        to: Array.from(children),
      })),
    };
  }
}

// ── ExecutionTrace ────────────────────────────────────────────────────────────
class ExecutionTrace {
  constructor(maxEntries = 200) {
    this.entries = [];
    this.maxEntries = maxEntries;
  }

  record(phase, detail, meta = {}) {
    this.entries.push({
      ts: new Date().toISOString(),
      phase,
      detail,
      ...meta,
    });
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  recent(n = 20) {
    return this.entries.slice(-n);
  }

  clear() {
    this.entries = [];
  }
}

// ── ConfidenceRiskScorer ──────────────────────────────────────────────────────
class ConfidenceRiskScorer {
  score(task, context = {}) {
    const text = (
      typeof task === "string" ? task : JSON.stringify(task)
    ).toLowerCase();
    let risk = 0;
    let confidence = 1.0;

    const riskPatterns = [
      {
        pattern: /\bdelete\b|\bdrop\b|\btruncate\b/,
        score: 3,
        label: "destructive",
      },
      { pattern: /\bprod(uction)?\b|\blive\b/, score: 2, label: "production" },
      {
        pattern: /\bpassword\b|\bsecret\b|\bkey\b/,
        score: 2,
        label: "credentials",
      },
      { pattern: /\ball\b.*\buser(s)?\b/, score: 2, label: "mass-user" },
      { pattern: /\bdeploy\b|\bpush\b|\bmerge\b/, score: 1, label: "deploy" },
      { pattern: /\boverwrite\b|\breplace\b/, score: 1, label: "overwrite" },
    ];

    for (const { pattern, score, label } of riskPatterns) {
      if (pattern.test(text)) {
        risk += score;
      }
    }

    if (context.unverifiedInput) confidence -= 0.2;
    if (context.externalSource) confidence -= 0.1;
    if (risk >= 4) confidence -= 0.3;

    return {
      risk: Math.min(10, risk),
      confidence: Math.max(0, Math.min(1, confidence)),
      requiresApproval: risk >= 4,
      requiresSimulation: risk >= 2,
    };
  }
}

// ── ExecutiveAISystem ─────────────────────────────────────────────────────────
class ExecutiveAISystem extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.trace = new ExecutionTrace();
    this.taskGraph = new TaskGraph();
    this.scorer = new ConfidenceRiskScorer();
    this.executionHistory = [];

    // Lazily loaded subsystems
    this._worldModel = null;
    this._director = null;
    this._agentFabric = null;
    this._policyEngine = null;
    this._simulation = null;
    this._checkpoint = null;
    this._multiModelJudge = null;
    this._eventSourcing = null;

    this.initialized = false;
    this.status = "idle";
  }

  async initialize() {
    this.trace.record("init", "ExecutiveAISystem initializing");

    const subsystems = [
      [
        "WorldModel",
        () => require("../CognitiveBehavior/WorldModel").WorldModel,
        "_worldModel",
      ],
      [
        "Director",
        () => require("../CognitiveBehavior/Director").Director,
        "_director",
      ],
      [
        "AgentFabric",
        () => require("../CognitiveBehavior/AgentFabric").AgentFabric,
        "_agentFabric",
      ],
      [
        "SimulationBeforeAction",
        () =>
          require("../CognitiveBehavior/SimulationBeforeAction")
            .SimulationBeforeAction,
        "_simulation",
      ],
      [
        "MultiModelJudge",
        () => require("../CognitiveBehavior/MultiModelJudge").MultiModelJudge,
        "_multiModelJudge",
      ],
    ];

    for (const [name, loader, prop] of subsystems) {
      try {
        const Cls = loader();
        this[prop] = new Cls({ sessionId: "executive", ...this.config });
        this.trace.record("init", `${name} loaded`, { status: "ok" });
      } catch (e) {
        this.trace.record("init", `${name} unavailable — degraded mode`, {
          error: e.message,
        });
      }
    }

    // PolicyEngine
    try {
      const { PolicyEvaluator } = require("../PolicyEngine/PolicyEvaluator");
      this._policyEngine = new PolicyEvaluator();
      this.trace.record("init", "PolicyEngine loaded");
    } catch (e) {
      this.trace.record("init", "PolicyEngine unavailable", {
        error: e.message,
      });
    }

    // EventSourcing
    try {
      const { EventSourcing } = require("../CognitiveBehavior/EventSourcing");
      this._eventSourcing = new EventSourcing({ sessionId: "executive" });
      this.trace.record("init", "EventSourcing loaded");
    } catch (e) {
      this.trace.record("init", "EventSourcing unavailable", {
        error: e.message,
      });
    }

    // Checkpoint
    try {
      this._checkpoint = require("../AgentRuntime/SessionManager/Checkpoint");
      this.trace.record("init", "Checkpoint loaded");
    } catch (e) {
      this.trace.record("init", "Checkpoint unavailable", { error: e.message });
    }

    this.initialized = true;
    this.status = "ready";
    this.trace.record("init", "ExecutiveAISystem ready");
    return this;
  }

  /**
   * Main orchestrated execution pipeline:
   * Understand → Score → Simulate → Plan → Execute → Verify → Record
   */
  async execute(task, context = {}) {
    if (!this.initialized) await this.initialize();

    const execId = crypto.randomBytes(8).toString("hex");
    const startedAt = Date.now();
    this.status = "executing";
    this.trace.record(
      "execute",
      `Starting task: ${typeof task === "string" ? task.slice(0, 100) : JSON.stringify(task).slice(0, 100)}`,
      { execId },
    );

    const result = {
      execId,
      task,
      phases: {},
      approved: false,
      output: null,
      error: null,
      duration: 0,
    };

    try {
      // Phase 1: UNDERSTAND — classify intent
      result.phases.understand = await this._phaseUnderstand(task, context);

      // Phase 2: SCORE — risk + confidence
      result.phases.score = this.scorer.score(task, context);
      this.trace.record(
        "score",
        `risk=${result.phases.score.risk} confidence=${result.phases.score.confidence}`,
      );

      // Phase 3: SIMULATE — check if safe to proceed
      result.phases.simulate = await this._phaseSimulate(
        task,
        context,
        result.phases.score,
      );
      if (!result.phases.simulate.allowed) {
        result.output = {
          blocked: true,
          reason: result.phases.simulate.reason,
        };
        this.trace.record(
          "blocked",
          `Task blocked: ${result.phases.simulate.reason}`,
        );
        return result;
      }

      // Phase 4: POLICY — enforce policies
      result.phases.policy = await this._phasePolicy(task, context);
      if (result.phases.policy.blocked) {
        result.output = { blocked: true, reason: result.phases.policy.reason };
        return result;
      }

      // Phase 5: PLAN — add to task graph
      const nodeId = this.taskGraph.addNode(task);
      this.taskGraph.setStatus(nodeId, "running");
      result.phases.plan = {
        nodeId,
        ready: this.taskGraph.getReady().map((n) => n.id),
      };

      // Phase 6: EXECUTE — delegate to Director + AgentFabric
      result.phases.dispatch = await this._phaseDispatch(
        task,
        context,
        result.phases.understand,
      );

      // Phase 7: VERIFY — judge output quality
      result.phases.verify = await this._phaseVerify(
        task,
        result.phases.dispatch,
        context,
      );

      // Phase 8: RECORD — persist to EventSourcing + memory
      await this._phaseRecord(task, result, context);

      this.taskGraph.setStatus(nodeId, "done", result.phases.dispatch);
      result.approved = true;
      result.output = result.phases.dispatch;
    } catch (e) {
      result.error = e.message;
      this.trace.record("error", e.message, { execId });
    } finally {
      result.duration = Date.now() - startedAt;
      this.status = "ready";
      this.executionHistory.push({
        execId,
        task: String(task).slice(0, 80),
        duration: result.duration,
        error: result.error,
      });
      if (this.executionHistory.length > 100) this.executionHistory.shift();
    }

    return result;
  }

  async _phaseUnderstand(task, context) {
    try {
      const {
        QuestionUnderstanding,
      } = require("../CognitiveBehavior/QuestionUnderstanding");
      return QuestionUnderstanding.classify(
        typeof task === "string" ? task : JSON.stringify(task),
        context,
      );
    } catch {
      return { intent: "unknown", confidence: 0.5, complexity: "medium" };
    }
  }

  async _phaseSimulate(task, context, score) {
    if (!score.requiresSimulation) return { allowed: true, reason: "low-risk" };
    try {
      if (this._simulation) {
        return this._simulation.simulate(
          typeof task === "string" ? task : JSON.stringify(task),
          context,
        );
      }
    } catch {
      /* ignore */
    }
    return {
      allowed: score.risk < 8,
      reason: score.risk >= 8 ? "high-risk-auto-blocked" : "accepted",
    };
  }

  async _phasePolicy(task, context) {
    if (!this._policyEngine) return { blocked: false };
    try {
      const decision = await this._policyEngine.evaluate(
        { action: "execute", resource: "task", task },
        context,
      );
      return {
        blocked: decision && decision.decision === "DENY",
        reason: decision && decision.reason,
      };
    } catch {
      return { blocked: false };
    }
  }

  async _phaseDispatch(task, context, understanding) {
    const intent = (understanding && understanding.intent) || "general";
    try {
      if (this._director && this._agentFabric) {
        const worldContext = this._worldModel
          ? this._worldModel.getContextSummary()
          : "";
        const directive = this._director.decide(intent, {
          ...context,
          worldContext,
        });
        const personas = await this._agentFabric.selectPersonas(
          intent,
          directive,
        );
        return { directive, personas, intent, dispatched: true };
      }
    } catch {
      /* ignore */
    }
    return {
      intent,
      dispatched: false,
      message: "Director/AgentFabric unavailable — task acknowledged",
    };
  }

  async _phaseVerify(task, output, context) {
    if (!this._multiModelJudge) return { score: 1.0, verified: false };
    try {
      return await this._multiModelJudge.judge(
        typeof task === "string" ? task : JSON.stringify(task),
        JSON.stringify(output),
        context,
      );
    } catch {
      return { score: 1.0, verified: false };
    }
  }

  async _phaseRecord(task, result, context) {
    if (this._eventSourcing) {
      try {
        this._eventSourcing.append("executive_execution", {
          task: typeof task === "string" ? task.slice(0, 200) : null,
          execId: result.execId,
          duration: result.duration,
          approved: result.approved,
        });
      } catch {
        /* ignore */
      }
    }
    if (this._worldModel) {
      try {
        await this._worldModel.upsertEntity("last_execution", {
          execId: result.execId,
          task: typeof task === "string" ? task.slice(0, 100) : null,
          approved: result.approved,
        });
      } catch {
        /* ignore */
      }
    }
  }

  getStatus() {
    const subsystems = {
      worldModel: !!this._worldModel,
      director: !!this._director,
      agentFabric: !!this._agentFabric,
      policyEngine: !!this._policyEngine,
      simulation: !!this._simulation,
      checkpoint: !!this._checkpoint,
      multiModelJudge: !!this._multiModelJudge,
      eventSourcing: !!this._eventSourcing,
    };
    const available = Object.values(subsystems).filter(Boolean).length;
    const total = Object.keys(subsystems).length;

    return {
      status: this.status,
      initialized: this.initialized,
      subsystems,
      health: `${available}/${total} subsystems available`,
      taskGraph: {
        total: this.taskGraph.nodes.size,
        pending: [...this.taskGraph.nodes.values()].filter(
          (n) => n.status === "pending",
        ).length,
        done: [...this.taskGraph.nodes.values()].filter(
          (n) => n.status === "done",
        ).length,
        failed: [...this.taskGraph.nodes.values()].filter(
          (n) => n.status === "failed",
        ).length,
      },
      recentExecutions: this.executionHistory.slice(-5),
      trace: this.trace.recent(10),
    };
  }

  getTaskGraph() {
    return this.taskGraph.toJSON();
  }

  async simulate(action, context = {}) {
    const score = this.scorer.score(action, context);
    const simulation = await this._phaseSimulate(action, context, score);
    return { action, score, simulation };
  }

  getTrace(n = 50) {
    return this.trace.recent(n);
  }
}

// Singleton
let _instance = null;

function getExecutiveAISystem(config) {
  if (!_instance) {
    _instance = new ExecutiveAISystem(config || {});
  }
  return _instance;
}

module.exports = {
  ExecutiveAISystem,
  TaskGraph,
  ConfidenceRiskScorer,
  ExecutionTrace,
  getExecutiveAISystem,
};
