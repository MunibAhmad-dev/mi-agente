/**
 * AI Creative OS - Workflow Manager
 * §99: Shows Workflow, Provider, Models, VRAM, RAM, Tasks, License, Version, Health
 */

import type { UniqueId, Score } from "../types/index.js";
import { Logger, EventBus, generateId } from "../core/index.js";

export interface ManagedWorkflow {
  id: UniqueId;
  name: string;
  provider: string;
  models: string[];
  vramRequired: number;
  ramRequired: number;
  license: string;
  version: string;
  health: "healthy" | "degraded" | "broken" | "unknown";
  status: "registered" | "validated" | "ready" | "running" | "error";
  tasksCompleted: number;
  tasksFailed: number;
  avgExecutionTime: number;
  lastRun?: number;
}

export class WorkflowManager {
  private logger = new Logger("WorkflowManager");
  private eventBus: EventBus;
  private workflows = new Map<UniqueId, ManagedWorkflow>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  register(workflow: Omit<ManagedWorkflow, "id" | "tasksCompleted" | "tasksFailed" | "avgExecutionTime">): ManagedWorkflow {
    const entry: ManagedWorkflow = { ...workflow, id: generateId(), tasksCompleted: 0, tasksFailed: 0, avgExecutionTime: 0 };
    this.workflows.set(entry.id, entry);
    return entry;
  }

  get(id: UniqueId): ManagedWorkflow | undefined { return this.workflows.get(id); }
  getAll(): ManagedWorkflow[] { return [...this.workflows.values()]; }

  recordExecution(id: UniqueId, duration: number, success: boolean): void {
    const wf = this.workflows.get(id);
    if (!wf) return;
    if (success) {
      wf.tasksCompleted++;
      wf.avgExecutionTime = (wf.avgExecutionTime * (wf.tasksCompleted - 1) + duration) / wf.tasksCompleted;
    } else {
      wf.tasksFailed++;
    }
    wf.lastRun = Date.now();
    wf.status = success ? "ready" : "error";
  }

  getStats(): { total: number; healthy: number; broken: number; totalTasks: number; successRate: number } {
    const all = this.getAll();
    const totalTasks = all.reduce((s, w) => s + w.tasksCompleted + w.tasksFailed, 0);
    const successTasks = all.reduce((s, w) => s + w.tasksCompleted, 0);
    return {
      total: all.length,
      healthy: all.filter((w) => w.health === "healthy").length,
      broken: all.filter((w) => w.health === "broken").length,
      totalTasks,
      successRate: totalTasks > 0 ? Math.round(successTasks / totalTasks * 100) : 0,
    };
  }
}
