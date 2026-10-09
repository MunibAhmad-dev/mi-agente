// ============================================================================
// Multi-Instance Runtime Manager
// ============================================================================
// Manages multiple runtime instances with isolated environments.
// Each instance has its own port, config, nodes, and logs.
// ============================================================================

import type { RuntimeAdapter, RuntimeInfo, RuntimeId, CaioDatabase } from "../core/types/index.js";
import { newId } from "../core/types/index.js";

export interface RuntimeInstance {
  id: string;
  name: string;
  adapterId: string;
  port: number;
  status: "stopped" | "starting" | "running" | "error";
  path: string;
  pythonPath?: string;
  pid?: number;
  config: Record<string, unknown>;
}

export class MultiInstanceManager {
  private instances = new Map<string, RuntimeInstance>();

  constructor(private db: CaioDatabase) {
    // Load saved instances from database
    const rows = this.db.all<{ id: string; name: string; adapter_id: string; port: number; status: string; path: string; config: string }>(
      "SELECT * FROM runtimes"
    );
    for (const row of rows) {
      this.instances.set(row.id, {
        id: row.id,
        name: row.name,
        adapterId: row.adapter_id,
        port: row.port,
        status: row.status as RuntimeInstance["status"],
        path: row.path,
        config: JSON.parse(row.config || "{}"),
      });
    }
  }

  /**
   * Create a new runtime instance.
   */
  createInstance(opts: {
    name: string;
    adapterId: string;
    port: number;
    path: string;
    pythonPath?: string;
    config?: Record<string, unknown>;
  }): RuntimeInstance {
    const id = newId();

    // Check port availability
    for (const inst of this.instances.values()) {
      if (inst.port === opts.port && inst.status === "running") {
        throw new Error(`Port ${opts.port} is already in use by instance "${inst.name}"`);
      }
    }

    const instance: RuntimeInstance = {
      id,
      name: opts.name,
      adapterId: opts.adapterId,
      port: opts.port,
      status: "stopped",
      path: opts.path,
      pythonPath: opts.pythonPath,
      config: opts.config || {},
    };

    this.instances.set(id, instance);

    this.db.run(
      `INSERT INTO runtimes (id, name, adapter_id, port, status, path, config) VALUES (?, ?, ?, ?, 'stopped', ?, ?)`,
      id, opts.name, opts.adapterId, opts.port, opts.path, JSON.stringify(opts.config || {})
    );

    return instance;
  }

  /**
   * List all instances.
   */
  listInstances(): RuntimeInstance[] {
    return [...this.instances.values()];
  }

  /**
   * Get an instance by ID.
   */
  getInstance(id: string): RuntimeInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * Delete an instance.
   */
  deleteInstance(id: string): boolean {
    const inst = this.instances.get(id);
    if (!inst) return false;
    if (inst.status === "running") throw new Error("Cannot delete running instance. Stop it first.");

    this.instances.delete(id);
    this.db.run("DELETE FROM runtimes WHERE id = ?", id);
    return true;
  }

  /**
   * Update instance status.
   */
  updateStatus(id: string, status: RuntimeInstance["status"], pid?: number): void {
    const inst = this.instances.get(id);
    if (inst) {
      inst.status = status;
      inst.pid = pid;
      this.db.run("UPDATE runtimes SET status = ? WHERE id = ?", status, id);
    }
  }

  /**
   * Get the next available port for a new instance.
   */
  getNextPort(basePort: number = 8188): number {
    const usedPorts = new Set([...this.instances.values()].map((i) => i.port));
    let port = basePort;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }
}
