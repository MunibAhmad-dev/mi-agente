/**
 * AI Creative OS - Project Engine
 * Manages projects with versioning, checkpoints, reproducibility.
 */

import type {
  UniversalProject, ProjectStatus, UniqueId, Timestamp, CreativeDNA,
} from "../types/index.js";
import { Logger, EventBus, StorageEngine, generateId, timestamp } from "../core/index.js";

export interface ProjectVersion {
  version: number;
  timestamp: Timestamp;
  snapshot: UniversalProject;
  styleDNA?: CreativeDNA;
  providers: UniqueId[];
  workflows: UniqueId[];
  hardware: string;
  seeds?: Record<string, number>;
}

export interface ProjectCheckpoint {
  id: UniqueId;
  projectId: UniqueId;
  version: number;
  description: string;
  timestamp: Timestamp;
  snapshot: UniversalProject;
}

export class ProjectEngine {
  private logger = new Logger("ProjectEngine");
  private eventBus: EventBus;
  private storage: StorageEngine;
  private projects = new Map<UniqueId, UniversalProject>();
  private versions = new Map<UniqueId, ProjectVersion[]>();
  private checkpoints = new Map<UniqueId, ProjectCheckpoint[]>();

  constructor(eventBus: EventBus, storage: StorageEngine) {
    this.eventBus = eventBus;
    this.storage = storage;
    this.load();
  }

  /**
   * Create a new project.
   */
  create(params: {
    name: string;
    description?: string;
    platform?: UniversalProject["platform"];
    aspectRatio?: UniversalProject["aspectRatio"];
    resolution?: { width: number; height: number };
    fps?: number;
  }): UniversalProject {
    const project: UniversalProject = {
      id: generateId(),
      name: params.name,
      description: params.description,
      status: "draft",
      createdAt: timestamp(),
      updatedAt: timestamp(),
      version: 1,
      sequences: [],
      assets: [],
      metadata: {},
      platform: params.platform ?? "generic",
      aspectRatio: params.aspectRatio ?? "16:9",
      resolution: params.resolution ?? { width: 1920, height: 1080 },
      fps: params.fps ?? 30,
    };

    this.projects.set(project.id, project);
    this.saveVersion(project.id, project);
    this.save();

    this.eventBus.emit("PROJECT_CREATED", "ProjectEngine", { projectId: project.id });
    this.logger.info(`Project created: ${project.name} (${project.id})`);
    return project;
  }

  /**
   * Get a project by ID.
   */
  get(id: UniqueId): UniversalProject | undefined {
    return this.projects.get(id);
  }

  /**
   * List all projects.
   */
  list(filters?: { status?: ProjectStatus }): UniversalProject[] {
    let results = [...this.projects.values()];
    if (filters?.status) results = results.filter((p) => p.status === filters.status);
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Update a project.
   */
  update(id: UniqueId, changes: Partial<UniversalProject>): boolean {
    const project = this.projects.get(id);
    if (!project) return false;
    Object.assign(project, changes, { updatedAt: timestamp(), version: project.version + 1 });
    this.saveVersion(id, project);
    this.save();
    return true;
  }

  /**
   * Save a checkpoint.
   */
  saveCheckpoint(projectId: UniqueId, description: string): ProjectCheckpoint | null {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const checkpoint: ProjectCheckpoint = {
      id: generateId(),
      projectId,
      version: project.version,
      description,
      timestamp: timestamp(),
      snapshot: JSON.parse(JSON.stringify(project)),
    };

    const existing = this.checkpoints.get(projectId) ?? [];
    existing.push(checkpoint);
    this.checkpoints.set(projectId, existing);
    this.save();

    return checkpoint;
  }

  /**
   * Restore from a checkpoint.
   */
  restoreCheckpoint(checkpointId: UniqueId): boolean {
    for (const [, checks] of this.checkpoints) {
      const checkpoint = checks.find((c) => c.id === checkpointId);
      if (checkpoint) {
        const project = this.projects.get(checkpoint.projectId);
        if (project) {
          Object.assign(project, checkpoint.snapshot, { updatedAt: timestamp() });
          this.save();
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get version history for a project.
   */
  getVersionHistory(projectId: UniqueId): ProjectVersion[] {
    return this.versions.get(projectId) ?? [];
  }

  /**
   * Reproduce a specific version.
   */
  getReproducibilityInfo(projectId: UniqueId, version: number): ProjectVersion | undefined {
    const versions = this.versions.get(projectId) ?? [];
    return versions.find((v) => v.version === version);
  }

  delete(id: UniqueId): boolean {
    const deleted = this.projects.delete(id);
    if (deleted) this.save();
    return deleted;
  }

  private saveVersion(projectId: UniqueId, snapshot: UniversalProject): void {
    const versions = this.versions.get(projectId) ?? [];
    versions.push({
      version: snapshot.version,
      timestamp: timestamp(),
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      providers: [],
      workflows: [],
      hardware: "",
    });
    this.versions.set(projectId, versions);
  }

  private save(): void {
    this.storage.write("projects/index.json", [...this.projects.values()]);
  }

  private load(): void {
    try {
      const data = this.storage.read<UniversalProject[]>("projects/index.json");
      if (data) {
        for (const p of data) this.projects.set(p.id, p);
      }
    } catch {}
  }

  getStats(): { total: number; byStatus: Record<string, number> } {
    const byStatus: Record<string, number> = {};
    for (const p of this.projects.values()) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    }
    return { total: this.projects.size, byStatus };
  }
}
