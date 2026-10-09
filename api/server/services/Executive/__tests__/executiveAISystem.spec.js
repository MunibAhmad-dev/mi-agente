"use strict";

const {
  ExecutiveAISystem,
  TaskGraph,
  ConfidenceRiskScorer,
  ExecutionTrace,
  getExecutiveAISystem,
} = require("../ExecutiveAISystem");

describe("ExecutiveAISystem", () => {
  let system;

  beforeEach(() => {
    system = new ExecutiveAISystem({ test: true });
  });

  describe("initialization", () => {
    it("starts in idle status", () => {
      expect(system.status).toBe("idle");
      expect(system.initialized).toBe(false);
    });

    it("initializes without external services (degraded mode)", async () => {
      await system.initialize();
      expect(system.initialized).toBe(true);
      expect(system.status).toBe("ready");
    });
  });

  describe("execute()", () => {
    it("executes a low-risk task and returns a result", async () => {
      const result = await system.execute("list all files in the repo");
      expect(result).toHaveProperty("execId");
      expect(result).toHaveProperty("phases");
      expect(result.error).toBeNull();
    });

    it("returns phases.score with risk/confidence", async () => {
      const result = await system.execute("show me the user list");
      expect(result.phases.score).toHaveProperty("risk");
      expect(result.phases.score).toHaveProperty("confidence");
      expect(typeof result.phases.score.risk).toBe("number");
    });

    it("records duration in result", async () => {
      const result = await system.execute("simple task");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("handles empty/falsy task gracefully", async () => {
      const result = await system.execute("");
      expect(result.error).toBeNull();
    });
  });

  describe("getStatus()", () => {
    it("returns initialized status after initialize()", async () => {
      await system.initialize();
      const status = system.getStatus();
      expect(status.initialized).toBe(true);
      expect(status).toHaveProperty("subsystems");
      expect(status).toHaveProperty("taskGraph");
      expect(status).toHaveProperty("health");
    });
  });

  describe("getTaskGraph()", () => {
    it("returns nodes and edges", async () => {
      await system.execute("task A");
      const graph = system.getTaskGraph();
      expect(graph).toHaveProperty("nodes");
      expect(graph).toHaveProperty("edges");
      expect(Array.isArray(graph.nodes)).toBe(true);
    });
  });

  describe("simulate()", () => {
    it("returns score and simulation for a low-risk action", async () => {
      const result = await system.simulate("read the README file");
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("simulation");
      expect(result.simulation).toHaveProperty("allowed");
    });

    it("flags high-risk actions", async () => {
      const result = await system.simulate(
        "delete all production users permanently",
      );
      expect(result.score.risk).toBeGreaterThan(5);
      expect(result.score.requiresApproval).toBe(true);
    });
  });

  describe("getTrace()", () => {
    it("returns trace entries after execution", async () => {
      await system.execute("trace test task");
      const trace = system.getTrace(10);
      expect(Array.isArray(trace)).toBe(true);
      expect(trace.length).toBeGreaterThan(0);
    });
  });

  describe("getExecutiveAISystem() singleton", () => {
    it("returns the same instance on multiple calls", () => {
      const a = getExecutiveAISystem();
      const b = getExecutiveAISystem();
      expect(a).toBe(b);
    });
  });
});

describe("TaskGraph", () => {
  let graph;

  beforeEach(() => {
    graph = new TaskGraph();
  });

  it("adds nodes and tracks status", () => {
    const id = graph.addNode("task A");
    expect(graph.nodes.has(id)).toBe(true);
    expect(graph.nodes.get(id).status).toBe("pending");
  });

  it("returns ready nodes (no deps)", () => {
    graph.addNode("task A");
    const ready = graph.getReady();
    expect(ready.length).toBe(1);
  });

  it("does not return nodes with unresolved deps", () => {
    const a = graph.addNode("task A");
    graph.addNode("task B", [a]);
    const ready = graph.getReady();
    expect(ready.length).toBe(1);
    expect(ready[0].task).toBe("task A");
  });

  it("setStatus updates node correctly", () => {
    const id = graph.addNode("task A");
    graph.setStatus(id, "done", { output: "result" });
    expect(graph.nodes.get(id).status).toBe("done");
    expect(graph.nodes.get(id).completedAt).not.toBeNull();
  });

  it("toJSON serializes properly", () => {
    graph.addNode("task A");
    const json = graph.toJSON();
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(Array.isArray(json.edges)).toBe(true);
  });
});

describe("ConfidenceRiskScorer", () => {
  let scorer;

  beforeEach(() => {
    scorer = new ConfidenceRiskScorer();
  });

  it("scores a safe task with low risk", () => {
    const result = scorer.score("read the readme file");
    expect(result.risk).toBe(0);
    expect(result.confidence).toBe(1.0);
    expect(result.requiresApproval).toBe(false);
    expect(result.requiresSimulation).toBe(false);
  });

  it("scores a destructive task with high risk", () => {
    const result = scorer.score("delete all users in production");
    expect(result.risk).toBeGreaterThan(4);
    expect(result.requiresApproval).toBe(true);
    expect(result.requiresSimulation).toBe(true);
  });

  it("reduces confidence for unverified input", () => {
    const safe = scorer.score("list files", {});
    const unverified = scorer.score("list files", { unverifiedInput: true });
    expect(unverified.confidence).toBeLessThan(safe.confidence);
  });
});

describe("ExecutionTrace", () => {
  it("records and retrieves entries", () => {
    const trace = new ExecutionTrace(10);
    trace.record("test", "detail A");
    trace.record("test", "detail B");
    const recent = trace.recent(5);
    expect(recent.length).toBe(2);
    expect(recent[0].detail).toBe("detail A");
  });

  it("respects maxEntries limit", () => {
    const trace = new ExecutionTrace(3);
    for (let i = 0; i < 5; i++) trace.record("x", `entry ${i}`);
    expect(trace.entries.length).toBe(3);
  });

  it("clear() empties all entries", () => {
    const trace = new ExecutionTrace();
    trace.record("x", "test");
    trace.clear();
    expect(trace.entries.length).toBe(0);
  });
});
