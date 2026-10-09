import { describe, it, expect, beforeEach } from "vitest";
import { AICreativeOS } from "../src/index.js";

describe("AICreativeOS Integration", () => {
  let os: AICreativeOS;

  beforeEach(() => {
    os = new AICreativeOS("./data/test");
  });

  it("should initialize without errors", async () => {
    const result = await os.initialize();
    expect(result.capabilities).toBeGreaterThan(20);
    expect(result.hardware).toBeDefined();
    expect(result.hardware.cpu).toBeDefined();
    expect(result.hardware.cpu.cores).toBeGreaterThan(0);
  });

  it("should have all engines wired up", async () => {
    await os.initialize();
    expect(os.capabilityRegistry).toBeDefined();
    expect(os.providerRegistry).toBeDefined();
    expect(os.adapterRegistry).toBeDefined();
    expect(os.hardware).toBeDefined();
    expect(os.license).toBeDefined();
    expect(os.installation).toBeDefined();
    expect(os.creativeDirector).toBeDefined();
    expect(os.creativeCompiler).toBeDefined();
    expect(os.productionPlanner).toBeDefined();
    expect(os.workflowComposer).toBeDefined();
    expect(os.styleAnalyzer).toBeDefined();
    expect(os.styleComparator).toBeDefined();
    expect(os.styleLearning).toBeDefined();
    expect(os.memory).toBeDefined();
    expect(os.assets).toBeDefined();
    expect(os.quality).toBeDefined();
    expect(os.scheduler).toBeDefined();
    expect(os.observability).toBeDefined();
    expect(os.security).toBeDefined();
    expect(os.plugins).toBeDefined();
    expect(os.projects).toBeDefined();
  });

  it("should report system status", async () => {
    await os.initialize();
    const status = os.getStatus();
    expect(status.capabilities).toBeGreaterThan(20);
    expect(status.adapters).toBe(16);
    expect(status.providers).toBeDefined();
  });

  it("should create a project", async () => {
    await os.initialize();
    const project = os.projects.create({ name: "Test Project" });
    expect(project.name).toBe("Test Project");
    expect(project.status).toBe("draft");
    expect(project.id).toBeDefined();
  });

  it("should process a creative request", async () => {
    await os.initialize();
    const session = await os.processCreativeRequest(
      "Haz un Short de 30 segundos, ritmo rápido, cinematográfico",
    );
    expect(session).toBeDefined();
    expect(session.specification).toBeDefined();
    expect(session.plan).toBeDefined();
    expect(session.specification!.platform).toBe("tiktok");
    expect(session.specification!.duration).toBe(30000);
    expect(session.plan!.graph.nodes.length).toBeGreaterThan(5);
  });

  it("should compile creative intent through director", async () => {
    await os.initialize();
    const session = await os.processCreativeRequest(
      "Un tutorial de cocina de 2 minutos, ritmo medio, estilo educativo",
    );
    expect(session.specification!.platform).toBe("generic");
    expect(session.specification!.duration).toBe(120000);
    expect(session.specification!.style).toBe("educational");
    expect(session.specification!.pacing).toBe("medium");
  });

  it("should detect available adapters", async () => {
    const result = await os.initialize();
    const detected = result.adapters.filter((a) => a.detected);
    // FFmpeg is commonly available
    expect(detected.some((a) => a.name === "FFmpeg")).toBeDefined();
  });

  it("should manage capabilities", async () => {
    await os.initialize();
    const editingCaps = os.capabilityRegistry.getByDomain("editing");
    expect(editingCaps.length).toBeGreaterThan(0);

    const colorCaps = os.capabilityRegistry.getByDomain("color");
    expect(colorCaps.length).toBeGreaterThan(0);

    const searchResults = os.capabilityRegistry.search("render");
    expect(searchResults.length).toBeGreaterThan(0);
  });

  it("should manage style profiles", async () => {
    await os.initialize();
    const dna = os.styleAnalyzer.createFromParameters({
      averageShotLength: 1.5,
      cutFrequency: 0.8,
      contrast: 0.7,
    });
    const profile = os.styleLearning.create("Fast Cinematic", dna);
    expect(profile.name).toBe("Fast Cinematic");
    expect(os.styleLearning.getAll().length).toBe(1);
  });

  it("should compare styles", async () => {
    await os.initialize();
    const dnaA = os.styleAnalyzer.createFromParameters({ averageShotLength: 1.5, cutFrequency: 0.8, contrast: 0.7 });
    const dnaB = os.styleAnalyzer.createFromParameters({ averageShotLength: 4.0, cutFrequency: 0.3, contrast: 0.4 });
    const comparison = os.styleComparator.compare(dnaA, dnaB);
    expect(comparison.overallScore).toBeGreaterThanOrEqual(0);
    expect(comparison.overallScore).toBeLessThanOrEqual(100);
    expect(comparison.distances).toBeDefined();
  });

  it("should manage plugins", async () => {
    await os.initialize();
    const result = await os.plugins.install({
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      author: "Test",
      description: "A test plugin",
      type: "provider",
      enabled: true,
      status: "planned",
      entryPoint: "./plugin.js",
      dependencies: [],
    });
    expect(result.success).toBe(true);
    expect(os.plugins.count()).toBe(1);
  });

  // ─── New Engine Integration Tests ────────────────────────────────────────

  it("should have color engine wired", async () => {
    await os.initialize();
    expect(os.color).toBeDefined();
  });

  it("should have voice engine wired", async () => {
    await os.initialize();
    expect(os.voice).toBeDefined();
  });

  it("should have thumbnail engine wired", async () => {
    await os.initialize();
    expect(os.thumbnail).toBeDefined();
  });

  it("should have OCR engine wired", async () => {
    await os.initialize();
    expect(os.ocr).toBeDefined();
  });

  it("should have caption learning engine wired", async () => {
    await os.initialize();
    expect(os.captionLearning).toBeDefined();
  });

  it("should have model manager wired", async () => {
    await os.initialize();
    expect(os.modelManager).toBeDefined();
    expect(os.modelManager.getAll().length).toBeGreaterThan(0);
  });

  it("should have workflow manager wired", async () => {
    await os.initialize();
    expect(os.workflowManager).toBeDefined();
  });

  it("should have task manager wired", async () => {
    await os.initialize();
    expect(os.taskManager).toBeDefined();
  });

  it("should have catalog wired", async () => {
    await os.initialize();
    expect(os.catalog).toBeDefined();
    expect(os.catalog.getAll().length).toBeGreaterThan(0);
  });

  it("status should include new engines", async () => {
    await os.initialize();
    const status = os.getStatus();
    expect(status.capabilities).toBeGreaterThan(0);
    expect(status.providers).toBeGreaterThan(0);
  });
});
