/**
 * AI Creative OS - Plugin System
 * Allows adding: Provider, Model, Workflow, Adapter, Capability, Analyzer, Template, Style Pack
 * without modifying Core.
 */

import type { UniqueId, FeatureStatus } from "../types/index.js";
import { Logger, EventBus, Registry, generateId } from "../core/index.js";

export interface Plugin {
  id: UniqueId;
  name: string;
  version: string;
  author: string;
  description: string;
  type: "provider" | "model" | "workflow" | "adapter" | "capability" | "analyzer" | "template" | "style_pack";
  enabled: boolean;
  status: FeatureStatus;
  entryPoint: string;
  dependencies: string[];
  config?: Record<string, unknown>;
}

export class PluginEngine extends Registry<Plugin> {
  private logger = new Logger("PluginEngine");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    super("PluginEngine");
    this.eventBus = eventBus;
  }

  /**
   * Install and register a plugin.
   */
  async install(plugin: Plugin): Promise<{ success: boolean; error?: string }> {
    // Validate plugin
    if (this.has(plugin.id)) {
      return { success: false, error: "Plugin already installed" };
    }

    // Check dependencies
    for (const dep of plugin.dependencies) {
      if (!this.find((p) => p.name === dep && p.enabled)) {
        return { success: false, error: `Missing dependency: ${dep}` };
      }
    }

    this.register(plugin);
    plugin.status = "integrated";
    this.logger.info(`Plugin installed: ${plugin.name} v${plugin.version}`);
    await this.eventBus.emit("PLUGIN_INSTALLED", "PluginEngine", { pluginId: plugin.id });
    return { success: true };
  }

  /**
   * Enable/disable a plugin.
   */
  toggle(pluginId: UniqueId, enabled: boolean): boolean {
    const plugin = this.get(pluginId);
    if (!plugin) return false;
    plugin.enabled = enabled;
    this.eventBus.emit("PLUGIN_TOGGLED", "PluginEngine", { pluginId, enabled });
    return true;
  }

  /**
   * Uninstall a plugin.
   */
  uninstall(pluginId: UniqueId): boolean {
    const plugin = this.get(pluginId);
    if (!plugin) return false;

    // Check if other plugins depend on this one
    const dependents = this.filter((p) => p.dependencies.includes(plugin.name) && p.id !== pluginId);
    if (dependents.length > 0) {
      this.logger.error(`Cannot uninstall: ${dependents.map((d) => d.name).join(", ")} depend on ${plugin.name}`);
      return false;
    }

    this.unregister(pluginId);
    this.eventBus.emit("PLUGIN_UNINSTALLED", "PluginEngine", { pluginId });
    return true;
  }

  getEnabled(): Plugin[] {
    return this.filter((p) => p.enabled);
  }

  getByType(type: Plugin["type"]): Plugin[] {
    return this.filter((p) => p.type === type);
  }
}
