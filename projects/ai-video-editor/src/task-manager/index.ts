/**
 * AI Creative OS - Task Manager
 * §101: Shows Queued, Running, Paused, Completed, Failed, Recovering tasks
 */

import type { UniqueId, Timestamp } from "../types/index.js";
import { Logger, EventBus, generateId } from "../core/index.js";

export interface ManagedTask {
  id: UniqueId;
  name: string;
  type: string;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "recovering" | "cancelled";
  priority: number;
  provider?: string;
  workflowId?: UniqueId;
  progress: number; // 0-100
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  duration?: number;
  error?: string;
  retries: number;
  maxRetries: number;
  vramUsed?: number;
  ramUsed?: number;
  gpuIndex?: number;
}

export class TaskManager {
  private logger = new Logger("TaskManager");
  private eventBus: EventBus;
  private tasks = new Map<UniqueId, ManagedTask>();
  private maxConcurrent = 4;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  submit(task: Omit<ManagedTask, "id" | "status" | "progress" | "retries">): ManagedTask {
    const entry: ManagedTask = { ...task, id: generateId(), status: "queued", progress: 0, retries: 0 };
    this.tasks.set(entry.id, entry);
    this.eventBus.emit("TASK_QUEUED", "TaskManager", { taskId: entry.id, name: entry.name });
    this.tryStartNext();
    return entry;
  }

  start(taskId: UniqueId): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "queued") return false;
    const running = this.getRunning();
    if (running.length >= this.maxConcurrent) return false;
    task.status = "running";
    task.startedAt = Date.now();
    this.eventBus.emit("TASK_STARTED", "TaskManager", { taskId });
    return true;
  }

  complete(taskId: UniqueId): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "completed";
    task.progress = 100;
    task.completedAt = Date.now();
    task.duration = task.completedAt - (task.startedAt ?? task.completedAt);
    this.eventBus.emit("TASK_COMPLETED", "TaskManager", { taskId, duration: task.duration });
    this.tryStartNext();
  }

  fail(taskId: UniqueId, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.retries++;
    if (task.retries < task.maxRetries) {
      task.status = "recovering";
      task.error = error;
      setTimeout(() => {
        task.status = "queued";
        this.tryStartNext();
      }, 2000 * task.retries);
    } else {
      task.status = "failed";
      task.error = error;
      task.completedAt = Date.now();
    }
    this.eventBus.emit("TASK_FAILED", "TaskManager", { taskId, error, retries: task.retries });
  }

  pause(taskId: UniqueId): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return false;
    task.status = "paused";
    return true;
  }

  resume(taskId: UniqueId): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "paused") return false;
    task.status = "running";
    return true;
  }

  cancel(taskId: UniqueId): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = "cancelled";
    task.completedAt = Date.now();
    return true;
  }

  getQueued(): ManagedTask[] { return [...this.tasks.values()].filter((t) => t.status === "queued"); }
  getRunning(): ManagedTask[] { return [...this.tasks.values()].filter((t) => t.status === "running"); }
  getCompleted(): ManagedTask[] { return [...this.tasks.values()].filter((t) => t.status === "completed"); }
  getFailed(): ManagedTask[] { return [...this.tasks.values()].filter((t) => t.status === "failed"); }
  getAll(): ManagedTask[] { return [...this.tasks.values()]; }

  getStats(): { total: number; queued: number; running: number; completed: number; failed: number; paused: number; avgDuration: number } {
    const all = this.getAll();
    const completed = all.filter((t) => t.status === "completed" && t.duration);
    const avgDuration = completed.length > 0
      ? completed.reduce((s, t) => s + (t.duration ?? 0), 0) / completed.length
      : 0;
    return {
      total: all.length,
      queued: all.filter((t) => t.status === "queued").length,
      running: all.filter((t) => t.status === "running").length,
      completed: all.filter((t) => t.status === "completed").length,
      failed: all.filter((t) => t.status === "failed").length,
      paused: all.filter((t) => t.status === "paused").length,
      avgDuration,
    };
  }

  private tryStartNext(): void {
    const running = this.getRunning();
    if (running.length >= this.maxConcurrent) return;
    const queued = this.getQueued().sort((a, b) => b.priority - a.priority);
    if (queued.length > 0) this.start(queued[0].id);
  }
}
