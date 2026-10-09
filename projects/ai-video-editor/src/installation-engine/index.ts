/**
 * AI Creative OS - Installation Engine
 * Detect, install, configure, test, update, and remove providers.
 */

import type { Provider, UniqueId, FilePath } from "../types/index.js";
import { Logger, EventBus, execCommand, commandExists, generateId } from "../core/index.js";

export interface InstallStep {
  id: string;
  name: string;
  command?: string;
  checkCommand?: string;
  skipIf?: () => boolean;
  required: boolean;
}

export interface InstallResult {
  success: boolean;
  providerId: UniqueId;
  steps: { step: string; success: boolean; output?: string; error?: string }[];
  duration: number;
}

export class InstallationEngine {
  private logger = new Logger("InstallationEngine");
  private eventBus: EventBus;
  private installHistory: Map<UniqueId, InstallResult> = new Map();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Get installation status for a provider.
   */
  getStatus(provider: Provider): "installed" | "missing" | "broken" | "outdated" | "incompatible" {
    if (!provider.installation.installed) return "missing";
    if (provider.health === "broken") return "broken";
    if (provider.status === "incompatible") return "incompatible";
    if (provider.status === "outdated") return "outdated";
    return "installed";
  }

  /**
   * Build a dependency graph for a provider.
   */
  buildDependencyGraph(providers: Provider[], targetId: UniqueId): DependencyNode[] {
    const visited = new Set<UniqueId>();
    const result: DependencyNode[] = [];

    const traverse = (id: UniqueId, depth: number) => {
      if (visited.has(id)) return;
      visited.add(id);
      const provider = providers.find((p) => p.id === id);
      if (!provider) return;

      result.push({
        providerId: id,
        name: provider.name,
        depth,
        installed: provider.installation.installed,
        optional: false,
      });

      for (const dep of provider.dependencies) {
        traverse(dep.providerId, depth + 1);
      }
    };

    traverse(targetId, 0);
    return result;
  }

  /**
   * Install a provider by executing its installation steps.
   */
  async install(
    provider: Provider,
    steps: InstallStep[],
    options: { userApproval?: boolean; dryRun?: boolean } = {},
  ): Promise<InstallResult> {
    const startTime = Date.now();
    const stepResults: InstallResult["steps"] = [];

    this.logger.info(`Installing ${provider.name}...`);
    this.eventBus.emit("INSTALLATION_STARTED", "InstallationEngine", { providerId: provider.id });

    for (const step of steps) {
      if (step.skipIf?.()) {
        stepResults.push({ step: step.name, success: true, output: "Skipped (already satisfied)" });
        continue;
      }

      if (!step.command) {
        stepResults.push({ step: step.name, success: false, error: "No command defined" });
        if (step.required) break;
        continue;
      }

      if (options.dryRun) {
        stepResults.push({ step: step.name, success: true, output: `[DRY RUN] Would execute: ${step.command}` });
        continue;
      }

      this.logger.debug(`Executing step: ${step.name}`);
      const result = execCommand(step.command, { timeout: 300000 });

      stepResults.push({
        step: step.name,
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      });

      if (result.exitCode !== 0 && step.required) {
        this.logger.error(`Installation step failed: ${step.name}`);
        break;
      }
    }

    const success = stepResults.every((s) => s.success);
    const installResult: InstallResult = {
      success,
      providerId: provider.id,
      steps: stepResults,
      duration: Date.now() - startTime,
    };

    this.installHistory.set(provider.id, installResult);
    this.eventBus.emit(
      success ? "INSTALLATION_COMPLETED" : "INSTALLATION_FAILED",
      "InstallationEngine",
      { providerId: provider.id, success },
    );

    return installResult;
  }

  /**
   * Verify package integrity.
   */
  async verifyIntegrity(
    filePath: FilePath,
    expectedChecksum?: string,
  ): Promise<{ verified: boolean; actualChecksum?: string; error?: string }> {
    try {
      const result = execCommand(`certutil -hashfile "${filePath}" SHA256 2>/dev/null || sha256sum "${filePath}" 2>/dev/null`);
      if (result.exitCode !== 0) {
        return { verified: false, error: "Could not compute checksum" };
      }

      const actualChecksum = result.stdout.trim().split(/\s+/)[0];
      if (!expectedChecksum) {
        return { verified: true, actualChecksum };
      }

      return {
        verified: actualChecksum === expectedChecksum,
        actualChecksum,
      };
    } catch (err) {
      return { verified: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

interface DependencyNode {
  providerId: UniqueId;
  name: string;
  depth: number;
  installed: boolean;
  optional: boolean;
}
