/**
 * AI Creative OS - Resource Scheduler
 * Manages GPU, VRAM, RAM, CPU, Disk resources.
 * Supports multi-GPU allocation and parallel scene processing.
 */

import type { UniqueId, Bytes, HardwareProfile } from "../types/index.js";
import { Logger, EventBus, generateId } from "../core/index.js";

export interface ScheduledTask {
  id: UniqueId;
  name: string;
  requiredVRAM: Bytes;
  requiredRAM: Bytes;
  requiredCPUCores: number;
  gpuPreferred?: number; // GPU index
  priority: number;
  status: "queued" | "running" | "completed" | "failed";
  assignedGPU?: number;
  startedAt?: number;
  completedAt?: number;
}

export class ResourceScheduler {
  private logger = new Logger("ResourceScheduler");
  private eventBus: EventBus;
  private taskQueue: ScheduledTask[] = [];
  private runningTasks: ScheduledTask[] = [];
  private hardwareProfile: HardwareProfile | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  setHardwareProfile(profile: HardwareProfile): void {
    this.hardwareProfile = profile;
  }

  /**
   * Schedule a task for execution.
   */
  schedule(task: Omit<ScheduledTask, "id" | "status">): ScheduledTask {
    const full: ScheduledTask = {
      ...task,
      id: generateId(),
      status: "queued",
    };
    this.taskQueue.push(full);
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    return full;
  }

  /**
   * Check if a task can be executed with available resources.
   */
  canExecute(task: ScheduledTask): { possible: boolean; reason?: string } {
    if (!this.hardwareProfile) return { possible: false, reason: "Hardware profile not set" };

    const totalVRAM = this.hardwareProfile.gpus.reduce((sum, g) => sum + g.vram, 0);
    const usedVRAM = this.runningTasks.reduce((sum, t) => sum + t.requiredVRAM, 0);
    const availableVRAM = totalVRAM - usedVRAM;

    if (task.requiredVRAM > availableVRAM) {
      return { possible: false, reason: `Insufficient VRAM: need ${task.requiredVRAM}, have ${availableVRAM}` };
    }

    if (task.requiredRAM > this.hardwareProfile.availableRAM) {
      return { possible: false, reason: `Insufficient RAM: need ${task.requiredRAM}` };
    }

    return { possible: true };
  }

  /**
   * Get the next task that can execute.
   */
  getNextReady(): ScheduledTask | null {
    for (const task of this.taskQueue) {
      const check = this.canExecute(task);
      if (check.possible) return task;
    }
    return null;
  }

  /**
   * Start executing a task.
   */
  startTask(taskId: UniqueId): boolean {
    const task = this.taskQueue.find((t) => t.id === taskId);
    if (!task) return false;

    const check = this.canExecute(task);
    if (!check.possible) return false;

    task.status = "running";
    task.startedAt = Date.now();
    task.assignedGPU = this.selectBestGPU(task);

    this.taskQueue = this.taskQueue.filter((t) => t.id !== taskId);
    this.runningTasks.push(task);

    this.eventBus.emit("TASK_STARTED", "Scheduler", { taskId, gpu: task.assignedGPU });
    return true;
  }

  /**
   * Complete a running task.
   */
  completeTask(taskId: UniqueId): void {
    const task = this.runningTasks.find((t) => t.id === taskId);
    if (task) {
      task.status = "completed";
      task.completedAt = Date.now();
      this.runningTasks = this.runningTasks.filter((t) => t.id !== taskId);
      this.eventBus.emit("TASK_COMPLETED", "Scheduler", { taskId });
    }
  }

  /**
   * Get resource usage summary.
   */
  getResourceUsage(): { vram: { used: number; total: number; percentage: number }; ram: { used: number; total: number; percentage: number }; gpuCount: number; runningTasks: number; queuedTasks: number } {
    const totalVRAM = this.hardwareProfile?.gpus.reduce((sum, g) => sum + g.vram, 0) ?? 0;
    const usedVRAM = this.runningTasks.reduce((sum, t) => sum + t.requiredVRAM, 0);
    const totalRAM = this.hardwareProfile?.totalRAM ?? 0;
    const usedRAM = this.runningTasks.reduce((sum, t) => sum + t.requiredRAM, 0);

    return {
      vram: { used: usedVRAM, total: totalVRAM, percentage: totalVRAM > 0 ? Math.round((usedVRAM / totalVRAM) * 100) : 0 },
      ram: { used: usedRAM, total: totalRAM, percentage: totalRAM > 0 ? Math.round((usedRAM / totalRAM) * 100) : 0 },
      gpuCount: this.hardwareProfile?.gpus.length ?? 0,
      runningTasks: this.runningTasks.length,
      queuedTasks: this.taskQueue.length,
    };
  }

  private selectBestGPU(task: ScheduledTask): number {
    if (task.gpuPreferred !== undefined) return task.gpuPreferred;
    // Simple: assign to GPU with most free VRAM
    const gpuUsage = new Map<number, number>();
    for (let i = 0; i < (this.hardwareProfile?.gpus.length ?? 1); i++) gpuUsage.set(i, 0);
    for (const t of this.runningTasks) {
      if (t.assignedGPU !== undefined) {
        gpuUsage.set(t.assignedGPU, (gpuUsage.get(t.assignedGPU) ?? 0) + t.requiredVRAM);
      }
    }
    let bestGPU = 0;
    let bestUsage = Infinity;
    for (const [gpu, usage] of gpuUsage) {
      if (usage < bestUsage) { bestUsage = usage; bestGPU = gpu; }
    }
    return bestGPU;
  }
}
