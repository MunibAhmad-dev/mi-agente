// ============================================================================
// Capability Graph Tests
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CapabilityGraph } from "../graph.js";

describe("CapabilityGraph", () => {
  const graph = new CapabilityGraph();

  it("lists goals", () => {
    const goals = graph.listGoals();
    assert.ok(goals.length > 0);
    assert.ok(goals.some((g) => g.name === "Image Generation"));
    assert.ok(goals.some((g) => g.name === "Video Generation"));
  });

  it("gets capabilities for a goal", () => {
    const caps = graph.getCapabilitiesForGoal("goal_image_gen");
    assert.ok(caps.length > 0);
    assert.ok(caps.some((c) => c.name === "Text-to-Image"));
  });

  it("gets models for a capability", () => {
    const models = graph.getModelsForCapability("cap_txt2img");
    assert.ok(models.length > 0);
    assert.ok(models.some((m) => m.name === "Checkpoint Model"));
  });

  it("gets nodes for a capability", () => {
    const nodes = graph.getNodesForCapability("cap_txt2img");
    assert.ok(nodes.length > 0);
    assert.ok(nodes.some((n) => n.name === "KSampler"));
  });

  it("gets full implementation path", () => {
    const path = graph.getImplementationPath("goal_image_gen");
    assert.ok(path.goals.length > 0);
    assert.ok(path.capabilities.length > 0);
    assert.ok(path.models.length > 0);
    assert.ok(path.nodes.length > 0);
  });

  it("finds goal by fuzzy name", () => {
    const goal = graph.findGoal("video");
    assert.ok(goal);
    assert.equal(goal.name, "Video Generation");
  });

  it("returns undefined for unknown goal", () => {
    const goal = graph.findGoal("nonexistent_xyz");
    assert.equal(goal, undefined);
  });

  it("adds custom nodes", () => {
    graph.addNode({ id: "custom_test", type: "capability", name: "Test Capability", metadata: {} });
    const caps = graph.getCapabilitiesForGoal("goal_image_gen");
    // Should still work after adding
    assert.ok(caps.length > 0);
  });
});
