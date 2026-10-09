// ============================================================================
// Project Manager
// ============================================================================
// Manages project lifecycle: create, import, export, clone, version.
// ============================================================================

import type {
  Project,
  ProjectId,
  ProjectConfig,
  ProjectVersion,
  SnapshotId,
  CaioDatabase,
  OperationMode,
  AutonomyLevel,
  NetworkPolicy,
} from "../../core/types/index.js";
import { newId } from "../../core/types/index.js";
import fs from "node:fs";
import path from "node:path";

export class ProjectManager {
  constructor(
    private db: CaioDatabase,
    private projectsDir: string
  ) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }

  /**
   * Create a new project.
   */
  create(name: string, description?: string, config?: Partial<ProjectConfig>): Project {
    const id = newId();
    const projectPath = path.join(this.projectsDir, id);
    const defaultConfig: ProjectConfig = {
      mode: "balanced" as OperationMode,
      autonomyLevel: "assisted" as AutonomyLevel,
      networkPolicy: "normal" as NetworkPolicy,
      customSettings: {},
      ...config,
    };

    // Create project directory structure
    const dirs = ["workflows", "models", "nodes", "outputs", "experiments", "memory", "logs", "config"];
    for (const dir of dirs) {
      fs.mkdirSync(path.join(projectPath, dir), { recursive: true });
    }

    // Create project.json
    const projectData = {
      id,
      name,
      description,
      config: defaultConfig,
      tags: [],
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(projectPath, "project.json"), JSON.stringify(projectData, null, 2));

    // Store in database
    this.db.run(
      `INSERT INTO projects (id, name, description, path, config, tags) VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      name,
      description || null,
      projectPath,
      JSON.stringify(defaultConfig),
      "[]"
    );

    return {
      id: id as ProjectId,
      name,
      description,
      path: projectPath,
      workflowIds: [],
      modelRefs: [],
      config: defaultConfig,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      versions: [],
    };
  }

  /**
   * Get a project by ID.
   */
  get(id: ProjectId): Project | null {
    const row = this.db.get<{
      id: string; name: string; description: string | null; path: string;
      config: string; tags: string; created_at: string; updated_at: string;
    }>("SELECT * FROM projects WHERE id = ?", id);

    if (!row) return null;

    // Get associated workflows
    const workflows = this.db.all<{ id: string }>(
      "SELECT id FROM workflows WHERE project_id = ?", id
    );

    return {
      id: row.id as ProjectId,
      name: row.name,
      description: row.description || undefined,
      path: row.path,
      workflowIds: workflows.map((w) => w.id as any),
      modelRefs: [],
      config: JSON.parse(row.config),
      tags: JSON.parse(row.tags),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      versions: this.getVersions(id),
    };
  }

  /**
   * List all projects.
   */
  list(): Project[] {
    const rows = this.db.all<{
      id: string; name: string; description: string | null; path: string;
      config: string; tags: string; created_at: string; updated_at: string;
    }>("SELECT * FROM projects ORDER BY updated_at DESC");

    return rows.map((row) => ({
      id: row.id as ProjectId,
      name: row.name,
      description: row.description || undefined,
      path: row.path,
      workflowIds: [],
      modelRefs: [],
      config: JSON.parse(row.config),
      tags: JSON.parse(row.tags),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      versions: [],
    }));
  }

  /**
   * Search projects by name or tag.
   */
  search(query: string): Project[] {
    const sql = "SELECT * FROM projects WHERE name LIKE ? OR tags LIKE ? ORDER BY updated_at DESC";
    const pattern = `%${query}%`;
    return this.db.all<Record<string, any>>(sql, pattern, pattern).map((row) => ({
      id: row.id as ProjectId,
      name: row.name,
      description: row.description || undefined,
      path: row.path,
      workflowIds: [],
      modelRefs: [],
      config: JSON.parse(row.config),
      tags: JSON.parse(row.tags),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      versions: [],
    }));
  }

  /**
   * Save a version snapshot.
   */
  saveVersion(projectId: ProjectId, label: string): ProjectVersion {
    const snapshotId = newId() as SnapshotId;
    const project = this.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const snapshot = {
      workflowIds: project.workflowIds,
      config: project.config,
      tags: project.tags,
    };

    this.db.run(
      `INSERT INTO snapshots (id, entity_type, entity_id, label, data) VALUES (?, 'project', ?, ?, ?)`,
      snapshotId,
      projectId,
      label,
      JSON.stringify(snapshot)
    );

    return {
      id: snapshotId,
      label,
      timestamp: new Date(),
      workflows: project.workflowIds,
      models: [],
      snapshot,
    };
  }

  /**
   * Get versions for a project.
   */
  private getVersions(projectId: ProjectId): ProjectVersion[] {
    const rows = this.db.all<{ id: string; label: string; data: string; created_at: string }>(
      "SELECT * FROM snapshots WHERE entity_type = 'project' AND entity_id = ? ORDER BY created_at DESC",
      projectId
    );

    return rows.map((row) => ({
      id: row.id as SnapshotId,
      label: row.label,
      timestamp: new Date(row.created_at),
      workflows: JSON.parse(row.data).workflowIds || [],
      models: [],
      snapshot: JSON.parse(row.data),
    }));
  }

  /**
   * Export a project as a JSON manifest.
   */
  exportProject(projectId: ProjectId): Record<string, any> | null {
    const project = this.get(projectId);
    if (!project) return null;

    return {
      metadata: {
        id: project.id,
        name: project.name,
        description: project.description,
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
      },
      config: project.config,
      tags: project.tags,
      workflows: project.workflowIds.map((wId) => {
        const wfRow = this.db.get<{ name: string; version: string; nodes: string; links: string; metadata: string }>(
          "SELECT * FROM workflows WHERE id = ?", wId
        );
        return wfRow ? { id: wId, name: wfRow.name, version: wfRow.version, nodes: JSON.parse(wfRow.nodes), links: JSON.parse(wfRow.links), metadata: JSON.parse(wfRow.metadata) } : null;
      }).filter(Boolean),
    };
  }

  /**
   * Import a project from JSON manifest.
   */
  importProject(data: Record<string, any>): Project {
    const meta = data.metadata || {};
    const project = this.create(
      meta.name || "Imported Project",
      meta.description,
      data.config
    );

    if (data.tags) {
      this.db.run("UPDATE projects SET tags = ? WHERE id = ?", JSON.stringify(data.tags), project.id);
    }

    return project;
  }

  /**
   * Clone a project.
   */
  clone(projectId: ProjectId, newName?: string): Project | null {
    const original = this.get(projectId);
    if (!original) return null;

    const cloned = this.create(
      newName || `${original.name} (Clone)`,
      original.description,
      original.config
    );

    return cloned;
  }

  /**
   * Delete a project.
   */
  delete(projectId: ProjectId): void {
    this.db.run("DELETE FROM workflows WHERE project_id = ?", projectId);
    this.db.run("DELETE FROM experiments WHERE project_id = ?", projectId);
    this.db.run("DELETE FROM memory WHERE project_id = ?", projectId);
    this.db.run("DELETE FROM projects WHERE id = ?", projectId);

    const projectPath = path.join(this.projectsDir, projectId);
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  }
}
