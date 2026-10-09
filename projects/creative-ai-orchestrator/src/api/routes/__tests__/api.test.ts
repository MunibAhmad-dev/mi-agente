// ============================================================================
// API Integration Tests
// ============================================================================
// Tests core API endpoints using the HTTP server.
// Run with: node --import tsx --test src/api/routes/__tests__/api.test.ts
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:3456";

let serverProcess: any;

async function api(method: string, path: string, body?: any): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

describe("CAIO API", () => {
  before(async () => {
    // Start server
    const { execSync, spawn } = await import("node:child_process");
    serverProcess = spawn("node", ["dist/index.js"], {
      env: { ...process.env, PORT: "3456" },
      stdio: "pipe",
    });
    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  after(() => {
    if (serverProcess) serverProcess.kill();
  });

  it("GET / returns system info", async () => {
    const res = await api("GET", "/");
    assert.equal(res.name, "Creative AI Orchestrator");
    assert.equal(res.status, "running");
  });

  it("GET /api/health returns hardware info", async () => {
    const res = await api("GET", "/api/health");
    assert.equal(res.success, true);
    assert.ok(res.data.hardware);
    assert.ok(res.data.hardware.os);
  });

  it("POST /api/projects creates a project", async () => {
    const res = await api("POST", "/api/projects", {
      name: "Test Project",
      description: "Integration test",
    });
    assert.equal(res.success, true);
    assert.ok(res.data.id);
    assert.equal(res.data.name, "Test Project");
  });

  it("GET /api/projects lists projects", async () => {
    const res = await api("GET", "/api/projects");
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.data));
  });

  it("GET /api/models lists models", async () => {
    const res = await api("GET", "/api/models");
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.data));
  });

  it("GET /api/workflows lists workflows", async () => {
    const res = await api("GET", "/api/workflows");
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.data));
  });

  it("POST /api/workflows/import imports a workflow", async () => {
    const workflow = {
      name: "Test Workflow",
      nodes: [
        { id: "1", type: "KSampler", inputs: { steps: 20 } },
        { id: "2", type: "SaveImage", inputs: {} },
      ],
      links: [{ fromNode: "1", fromOutput: "0", toNode: "2", toInput: "0" }],
    };
    const res = await api("POST", "/api/workflows/import", workflow);
    assert.equal(res.success, true);
    assert.ok(res.data.id);
    assert.equal(res.data.name, "Test Workflow");
  });

  it("GET /api/models/search searches models", async () => {
    const res = await api("GET", "/api/models/search?q=test");
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.data));
  });
});
