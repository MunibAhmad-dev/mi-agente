/**
 * AI Creative OS - Provider Engine
 * 
 * Discovers, registers, routes, and manages all external tools (providers).
 * No provider is hardcoded — everything is resolved dynamically through the Capability Engine.
 */

import {
  Provider, ProviderStatus, ProviderScore, HealthStatus, UniqueId,
  CapabilityRequirements, LicenseInfo, HardwareRequirements, Score,
  Platform, LicenseType,
} from "../types/index.js";
import {
  EventBus, Logger, Registry, commandExists, execCommand, generateId, getPlatform,
} from "../core/index.js";

// ─── Provider Registry ───────────────────────────────────────────────────────

export class ProviderRegistry extends Registry<Provider> {
  private logger = new Logger("ProviderRegistry");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    super("ProviderRegistry");
    this.eventBus = eventBus;
  }

  register(provider: Provider): void {
    super.register(provider);
    this.logger.info(`Registered provider: ${provider.name} (${provider.id})`);
    this.eventBus.emit("PROVIDER_REGISTERED", "ProviderRegistry", { providerId: provider.id, name: provider.name });
  }

  getAvailable(): Provider[] {
    return this.filter((p) => p.status === "available" || p.status === "installed");
  }

  getHealthy(): Provider[] {
    return this.filter((p) => p.health === "healthy" && (p.status === "available" || p.status === "installed"));
  }

  getByCapability(capabilityId: UniqueId): Provider[] {
    return this.filter((p) =>
      p.capabilities.includes(capabilityId) &&
      (p.status === "available" || p.status === "installed"),
    );
  }

  updateStatus(id: UniqueId, status: ProviderStatus): void {
    const provider = this.get(id);
    if (provider) {
      provider.status = status;
      provider.lastHealthCheck = Date.now();
    }
  }

  updateHealth(id: UniqueId, health: HealthStatus, details?: string): void {
    const provider = this.get(id);
    if (provider) {
      provider.health = health;
      provider.healthDetails = details;
      provider.lastHealthCheck = Date.now();
    }
  }
}

// ─── Provider Router ─────────────────────────────────────────────────────────

export interface RouteResult {
  provider: Provider;
  score: ProviderScore;
  fallbacks: Provider[];
  warnings: string[];
}

export class ProviderRouter {
  private registry: ProviderRegistry;
  private logger = new Logger("ProviderRouter");

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  /**
   * Find the best provider for a given capability, considering:
   * - Capability coverage
   * - Quality
   * - Speed
   * - Resource efficiency
   * - Automation capabilities
   * - Stability
   * - License compatibility
   * - Hardware compatibility
   */
  route(
    capabilityId: UniqueId,
    requirements: CapabilityRequirements = {},
    options: {
      preferOpenSource?: boolean;
      maxVRAM?: number;
      preferSpeed?: boolean;
      preferQuality?: boolean;
      excludeIds?: UniqueId[];
    } = {},
  ): RouteResult | null {
    const candidates = this.registry
      .getAvailable()
      .filter((p) => !options.excludeIds?.includes(p.id));

    if (candidates.length === 0) {
      this.logger.warn(`No available providers for capability: ${capabilityId}`);
      return null;
    }

    const scored: { provider: Provider; score: ProviderScore; warnings: string[] }[] = [];

    for (const provider of candidates) {
      const score = this.scoreProvider(provider, capabilityId, requirements, options);
      if (score.overall > 0) {
        const warnings: string[] = [];
        if (provider.health !== "healthy") warnings.push(`Health: ${provider.health}`);
        if (provider.status === "installed" && !provider.health) warnings.push("Not health-checked");
        scored.push({ provider, score, warnings });
      }
    }

    if (scored.length === 0) return null;

    scored.sort((a, b) => b.score.overall - a.score.overall);

    const best = scored[0];
    const fallbacks = scored.slice(1, 4).map((s) => s.provider);

    this.logger.info(
      `Best provider for ${capabilityId}: ${best.provider.name} (score: ${best.score.overall})`,
    );

    return {
      provider: best.provider,
      score: best.score,
      fallbacks,
      warnings: best.warnings,
    };
  }

  /**
   * Score a provider for a specific capability.
   */
  scoreProvider(
    provider: Provider,
    capabilityId: UniqueId,
    requirements: CapabilityRequirements,
    options: {
      preferOpenSource?: boolean;
      maxVRAM?: number;
      preferSpeed?: boolean;
      preferQuality?: boolean;
    } = {},
  ): ProviderScore {
    const hasCap = provider.capabilities.includes(capabilityId);
    const capability = hasCap ? 100 : 0;

    // Quality
    const quality = provider.quality;

    // Speed
    const speed = provider.speed;

    // Resource efficiency (inverted: lower requirement = better score)
    const minVRAM = requirements.minVRAM ?? provider.hardware.minVRAM ?? 0;
    const resource = options.maxVRAM
      ? Math.round(Math.max(0, 100 - (minVRAM / options.maxVRAM) * 100))
      : provider.score?.resource ?? 75;

    // Automation
    const automation = provider.automationScore;

    // Stability
    const stability = provider.stability;

    // License (prefer open-source if requested)
    let licenseScore = provider.score?.license ?? 80;
    if (options.preferOpenSource && provider.license.softwareLicenseScope === "proprietary") {
      licenseScore = Math.max(20, licenseScore - 30);
    }
    if (provider.license.commercialUse === false) licenseScore = Math.max(10, licenseScore - 40);

    // Maintenance
    const maintenance = provider.maintenanceScore;

    // Compatibility (OS match)
    const currentOS = getPlatform();
    const osMatch = !provider.hardware.os || provider.hardware.os.includes(currentOS) ? 100 : 30;

    // Weighted overall
    const weights = {
      capability: 0.30,
      quality: options.preferQuality ? 0.25 : 0.15,
      speed: options.preferSpeed ? 0.25 : 0.10,
      resource: 0.15,
      automation: 0.10,
      stability: 0.08,
      license: 0.05,
      maintenance: 0.02,
    };

    const overall = Math.round(
      capability * weights.capability +
      quality * weights.quality +
      speed * weights.speed +
      resource * weights.resource +
      automation * weights.automation +
      stability * weights.stability +
      licenseScore * weights.license +
      maintenance * weights.maintenance
    );

    return {
      capability,
      quality,
      speed,
      resource,
      automation,
      stability,
      license: licenseScore,
      maintenance,
      compatibility: osMatch,
      overall,
    };
  }

  /**
   * Get all providers ranked for a set of capabilities.
   */
  rankForCapabilities(
    capabilityIds: UniqueId[],
  ): { provider: Provider; totalScore: number }[] {
    const providers = this.registry.getAvailable();
    const ranked = providers.map((provider) => {
      let total = 0;
      let count = 0;
      for (const capId of capabilityIds) {
        if (provider.capabilities.includes(capId)) {
          total += provider.quality;
          count++;
        }
      }
      return {
        provider,
        totalScore: count > 0 ? total / count : 0,
      };
    });
    return ranked.filter((r) => r.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore);
  }
}

// ─── Provider Discovery ──────────────────────────────────────────────────────

export interface DiscoveryResult {
  providerId: UniqueId;
  found: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export class ProviderDiscovery {
  private logger = new Logger("ProviderDiscovery");

  /**
   * Auto-detect which software is installed on the system.
   */
  async discoverAll(): Promise<DiscoveryResult[]> {
    const checks = [
      { id: "ffmpeg", command: "ffmpeg -version" },
      { id: "ffprobe", command: "ffprobe -version" },
      { id: "opencv", command: "python3 -c \"import cv2; print(cv2.__version__)\" 2>/dev/null || python -c \"import cv2; print(cv2.__version__)\" 2>/dev/null" },
      { id: "blender", command: "blender --version" },
      { id: "python3", command: "python3 --version 2>/dev/null || python --version 2>/dev/null" },
    ];

    const results: DiscoveryResult[] = [];

    for (const check of checks) {
      const result = this.checkCommand(check.id, check.command);
      results.push(result);
      if (result.found) {
        this.logger.debug(`Discovered: ${check.id} at ${result.path} (v${result.version})`);
      }
    }

    return results;
  }

  private checkCommand(id: UniqueId, command: string): DiscoveryResult {
    try {
      const result = execCommand(command, { timeout: 5000 });
      if (result.exitCode === 0 && result.stdout) {
        const version = this.extractVersion(result.stdout);
        return { providerId: id, found: true, version };
      }
      return { providerId: id, found: false };
    } catch {
      return { providerId: id, found: false, error: "Command failed" };
    }
  }

  private extractVersion(output: string): string | undefined {
    const match = output.match(/(\d+\.\d+[\.\d]*)/);
    return match?.[1];
  }
}

// ─── Provider Health Monitor ─────────────────────────────────────────────────

export class ProviderHealthMonitor {
  private registry: ProviderRegistry;
  private logger = new Logger("ProviderHealth");
  private eventBus: EventBus;

  constructor(registry: ProviderRegistry, eventBus: EventBus) {
    this.registry = registry;
    this.eventBus = eventBus;
  }

  /**
   * Run health checks on all registered providers.
   */
  async checkAll(): Promise<Map<UniqueId, HealthStatus>> {
    const results = new Map<UniqueId, HealthStatus>();
    for (const provider of this.registry.getAll()) {
      const status = await this.check(provider);
      results.set(provider.id, status);
    }
    return results;
  }

  /**
   * Check health of a single provider.
   */
  async check(provider: Provider): Promise<HealthStatus> {
    try {
      if (!provider.installation.installed) {
        this.registry.updateHealth(provider.id, "missing", "Not installed");
        return "missing";
      }

      // Run test command if available
      if (provider.installation.testCommand) {
        const result = execCommand(provider.installation.testCommand, { timeout: 10000 });
        if (result.exitCode === 0) {
          this.registry.updateHealth(provider.id, "healthy");
          this.eventBus.emit("PROVIDER_HEALTH_CHECK", "HealthMonitor", {
            providerId: provider.id, status: "healthy",
          });
          return "healthy";
        } else {
          this.registry.updateHealth(provider.id, "broken", result.stderr);
          return "broken";
        }
      }

      // No test command — assume healthy if installed
      this.registry.updateHealth(provider.id, "healthy");
      return "healthy";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.registry.updateHealth(provider.id, "broken", msg);
      return "broken";
    }
  }
}

// ─── Provider Factory ────────────────────────────────────────────────────────

export function createProvider(overrides: Partial<Provider> & { id: string; name: string }): Provider {
  return {
    version: "0.0.0",
    source: [],
    license: {
      softwareLicense: "unknown",
      softwareLicenseScope: LicenseScope_Unknown,
      commercialUse: true,
      redistribution: false,
      modification: false,
    },
    capabilities: [],
    installation: { installed: false, autoInstallable: false },
    hardware: {},
    quality: 50,
    speed: 50,
    automationScore: 50,
    stability: 50,
    maintenanceScore: 50,
    fallbacks: [],
    dependencies: [],
    status: "missing" as ProviderStatus,
    health: "unknown" as HealthStatus,
    ...overrides,
  } as Provider;
}

// Helper constant for unknown license scope
import { LicenseScope } from "../types/index.js";
const LicenseScope_Unknown = "unknown";
