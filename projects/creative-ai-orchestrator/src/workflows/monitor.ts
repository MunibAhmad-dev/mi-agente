// ============================================================================
// Workflow Monitor — Real-time Execution Tracking
// ============================================================================
// Monitors workflow execution progress via WebSocket.
// Tracks step completion, resource usage, and errors in real time.
// ============================================================================

import type { ExecutionId, ExecutionStatus, CaioEvent } from "../core/types/index.js";
import { EventType } from "../core/types/index.js";
import { EventBus } from "../core/events/index.js";

export interface ExecutionProgress {
  executionId: string;
  state: "pending" | "running" | "completed" | "failed" | "cancelled";
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  percentage: number;
  estimatedTimeRemaining: number;
  resourceUsage: {
    vramMb: number;
    ramMb: number;
  };
  startTime: Date;
  logs: string[];
}

export class WorkflowMonitor {
  private active = new Map<string, ExecutionProgress>();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    // Listen for agent step events
    this.eventBus.on(EventType.AgentStepStarted, (event) => {
      const execId = event.data.executionId as string;
      if (this.active.has(execId)) {
        const progress = this.active.get(execId)!;
        progress.currentStep = (event.data.stepType as string) || "working";
        progress.stepIndex++;
        progress.percentage = Math.round((progress.stepIndex / progress.totalSteps) * 100);
        this.broadcast(execId);
      }
    });

    this.eventBus.on(EventType.AgentStepCompleted, (event) => {
      const execId = event.data.executionId as string;
      if (this.active.has(execId)) {
        const progress = this.active.get(execId)!;
        const duration = (event.data.duration as number) || 0;
        progress.logs.push(`Step completed in ${duration}ms`);
        progress.percentage = Math.round((progress.stepIndex / progress.totalSteps) * 100);
        this.broadcast(execId);
      }
    });

    this.eventBus.on(EventType.AgentStepFailed, (event) => {
      const execId = event.data.executionId as string;
      if (this.active.has(execId)) {
        const progress = this.active.get(execId)!;
        progress.state = "failed";
        progress.logs.push(`Error: ${event.data.error}`);
        this.broadcast(execId);
      }
    });

    this.eventBus.on(EventType.WorkflowExecuted, (event) => {
      const execId = event.data.executionId as string;
      if (this.active.has(execId)) {
        const progress = this.active.get(execId)!;
        progress.state = "completed";
        progress.percentage = 100;
        progress.logs.push("Execution completed");
        this.broadcast(execId);
      }
    });

    this.eventBus.on(EventType.WorkflowFailed, (event) => {
      const execId = event.data.executionId as string;
      if (this.active.has(execId)) {
        const progress = this.active.get(execId)!;
        progress.state = "failed";
        progress.logs.push(`Failed: ${event.data.error}`);
        this.broadcast(execId);
      }
    });
  }

  /**
   * Start tracking an execution.
   */
  startTracking(executionId: string, totalSteps: number = 1): ExecutionProgress {
    const progress: ExecutionProgress = {
      executionId,
      state: "running",
      currentStep: "starting",
      stepIndex: 0,
      totalSteps,
      percentage: 0,
      estimatedTimeRemaining: 0,
      resourceUsage: { vramMb: 0, ramMb: 0 },
      startTime: new Date(),
      logs: [],
    };
    this.active.set(executionId, progress);
    return progress;
  }

  /**
   * Get current progress.
   */
  getProgress(executionId: string): ExecutionProgress | null {
    return this.active.get(executionId) || null;
  }

  /**
   * Get all active executions.
   */
  getActive(): ExecutionProgress[] {
    return [...this.active.values()];
  }

  /**
   * Update resource usage.
   */
  updateResources(executionId: string, vramMb: number, ramMb: number): void {
    const progress = this.active.get(executionId);
    if (progress) {
      progress.resourceUsage.vramMb = vramMb;
      progress.resourceUsage.ramMb = ramMb;
      this.broadcast(executionId);
    }
  }

  /**
   * Add a log entry.
   */
  addLog(executionId: string, message: string): void {
    const progress = this.active.get(executionId);
    if (progress) {
      progress.logs.push(`[${new Date().toISOString()}] ${message}`);
      if (progress.logs.length > 100) progress.logs.shift();
      this.broadcast(executionId);
    }
  }

  /**
   * Cancel an execution.
   */
  cancel(executionId: string): void {
    const progress = this.active.get(executionId);
    if (progress) {
      progress.state = "cancelled";
      progress.logs.push("Cancelled by user");
      this.broadcast(executionId);
    }
  }

  /**
   * Clean up completed executions older than 1 hour.
   */
  cleanup(): void {
    const cutoff = Date.now() - 3600000;
    for (const [id, progress] of this.active) {
      if (progress.state === "completed" || progress.state === "failed" || progress.state === "cancelled") {
        if (progress.startTime.getTime() < cutoff) {
          this.active.delete(id);
        }
      }
    }
  }

  private broadcast(executionId: string): void {
    const progress = this.active.get(executionId);
    if (progress) {
      this.eventBus.emit({
        type: EventType.SystemHealthChanged,
        data: {
          category: "execution_progress",
          executionId,
          progress: { ...progress, logs: progress.logs.slice(-10) },
        },
      });
    }
  }
}
