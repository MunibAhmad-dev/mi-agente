import { describe, it, expect, beforeEach } from "vitest";
import {
  CapabilityRegistry, CapabilityEquivalenceEngine, CapabilityResolver,
  createBuiltinCapabilities, createCapability,
} from "../src/capability-engine/index.js";
import { EventBus } from "../src/core/index.js";
import type { Provider, Capability } from "../src/types/index.js";

describe("CapabilityEngine", () => {
  let registry: CapabilityRegistry;
  let equivalence: CapabilityEquivalenceEngine;
  let resolver: CapabilityResolver;

  beforeEach(() => {
    registry = new CapabilityRegistry("TestRegistry");
    equivalence = new CapabilityEquivalenceEngine();
    resolver = new CapabilityResolver(registry, equivalence);

    for (const cap of createBuiltinCapabilities()) {
      registry.register(cap);
    }
  });

  describe("CapabilityRegistry", () => {
    it("should register built-in capabilities", () => {
      expect(registry.count()).toBeGreaterThan(20);
    });

    it("should find capabilities by domain", () => {
      const editingCaps = registry.getByDomain("editing");
      expect(editingCaps.length).toBeGreaterThan(0);
      for (const cap of editingCaps) {
        expect(cap.domain).toBe("editing");
      }
    });

    it("should search capabilities by name", () => {
      const results = registry.search("color");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.name.toLowerCase().includes("color"))).toBe(true);
    });

    it("should register custom capabilities", () => {
      const custom = createCapability(
        "cap.test", "Test Cap", "editing", "A test capability",
        ["feature1", "feature2"], { gpu: false },
      );
      registry.register(custom);
      expect(registry.has("cap.test")).toBe(true);
      expect(registry.get("cap.test")?.name).toBe("Test Cap");
    });
  });

  describe("CapabilityEquivalenceEngine", () => {
    it("should evaluate capability coverage for a matching provider", () => {
      const cap = registry.get("cap.timeline_editing")!;
      const provider = createTestProvider(["cap.timeline_editing"], 90);
      const result = equivalence.evaluateCapabilityCoverage(cap, provider);
      expect(result.matchType).not.toBe("none");
      expect(result.score).toBeGreaterThan(0);
    });

    it("should return low score for non-matching provider", () => {
      const cap = registry.get("cap.timeline_editing")!;
      const provider = createTestProvider(["cap.color_grading"], 90);
      const result = equivalence.evaluateCapabilityCoverage(cap, provider);
      expect(result.matchType).not.toBe("exact");
      expect(result.score).toBeLessThan(50);
    });

    it("should compare two providers", () => {
      const cap = registry.get("cap.timeline_editing")!;
      const providerA = createTestProvider(["cap.timeline_editing"], 95);
      const providerB = createTestProvider(["cap.timeline_editing"], 70);
      const comparison = equivalence.compareProviders(cap, providerA, providerB);
      expect(comparison.winner).toBe(providerA.id);
      expect(comparison.margin).toBeGreaterThan(0);
    });
  });

  describe("CapabilityResolver", () => {
    it("should resolve providers for a capability", () => {
      const providers = [
        createTestProvider(["cap.timeline_editing"], 90),
        createTestProvider(["cap.timeline_editing"], 70),
        createTestProvider(["cap.color_grading"], 90),
      ];
      const candidates = resolver.resolve("cap.timeline_editing", providers);
      expect(candidates.length).toBeGreaterThanOrEqual(2); // At least matching providers
      expect(candidates[0].provider.quality).toBeGreaterThanOrEqual(candidates[1].provider.quality);
    });

    it("should return null when no providers available", () => {
      const candidates = resolver.resolve("cap.timeline_editing", []);
      expect(candidates.length).toBe(0);
    });

    it("should resolve best provider", () => {
      const providers = [
        createTestProvider(["cap.timeline_editing"], 60),
        createTestProvider(["cap.timeline_editing"], 95),
      ];
      const best = resolver.resolveBest("cap.timeline_editing", providers);
      expect(best).not.toBeNull();
      expect(best!.provider.quality).toBe(95);
    });
  });
});

function createTestProvider(capabilities: string[], quality: number): Provider {
  return {
    id: `test-provider-${Math.random().toString(36).slice(2)}`,
    name: `Test Provider (Q${quality})`,
    version: "1.0.0",
    source: ["cli"],
    license: {
      softwareLicense: "MIT",
      softwareLicenseScope: "permissive",
      commercialUse: true,
      redistribution: true,
      modification: true,
    },
    capabilities,
    installation: { installed: true, autoInstallable: false },
    hardware: {},
    quality,
    speed: 80,
    automationScore: 75,
    stability: 85,
    maintenanceScore: 80,
    fallbacks: [],
    dependencies: [],
    status: "available",
    health: "healthy",
  };
}
