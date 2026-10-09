// ============================================================================
// Project Export / Sharing
// ============================================================================
// Exports projects with license-aware asset exclusion.
// Respects redistribution restrictions on models.
// ============================================================================

import type { ProjectId, CaioDatabase } from "../core/types/index.js";
import { LicenseEngine } from "../discovery/license/engine.js";

export interface ExportManifest {
  version: string;
  exportedAt: string;
  project: {
    name: string;
    description?: string;
    config: Record<string, unknown>;
    tags: string[];
  };
  workflows: Array<{
    name: string;
    version: string;
    nodes: unknown[];
    links: unknown[];
    metadata: Record<string, unknown>;
  }>;
  models: Array<{
    name: string;
    source: string;
    license: string;
    included: boolean;
    reason?: string;
  }>;
  licenseWarnings: string[];
}

export class ProjectExporter {
  private licenseEngine: LicenseEngine;

  constructor(private db: CaioDatabase) {
    this.licenseEngine = new LicenseEngine();
  }

  /**
   * Export a project as a license-aware manifest.
   * Models with redistribution restrictions are excluded with explanation.
   */
  exportProject(projectId: ProjectId): ExportManifest | null {
    const project = this.db.get<{
      id: string; name: string; description: string | null; config: string; tags: string;
    }>("SELECT * FROM projects WHERE id = ?", projectId);

    if (!project) return null;

    const workflows = this.db.all<{
      name: string; version: string; nodes: string; links: string; metadata: string;
    }>("SELECT * FROM workflows WHERE project_id = ?", projectId);

    const models = this.db.all<{
      name: string; source_url: string | null; license_name: string | null;
      license_redistribution: number;
    }>(
      "SELECT DISTINCT m.name, m.source_url, m.license_name, m.license_redistribution FROM models m"
    );

    const licenseWarnings: string[] = [];
    const exportModels = models.map((m) => {
      const included = !!m.license_redistribution;
      if (!included) {
        licenseWarnings.push(`Model "${m.name}" excluded: redistribution not permitted (${m.license_name || "unknown license"})`);
      }
      return {
        name: m.name,
        source: m.source_url || "",
        license: m.license_name || "Unknown",
        included,
        reason: included ? undefined : "License does not permit redistribution",
      };
    });

    return {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        description: project.description || undefined,
        config: JSON.parse(project.config),
        tags: JSON.parse(project.tags),
      },
      workflows: workflows.map((w) => ({
        name: w.name,
        version: w.version,
        nodes: JSON.parse(w.nodes),
        links: JSON.parse(w.links),
        metadata: JSON.parse(w.metadata),
      })),
      models: exportModels,
      licenseWarnings,
    };
  }
}
