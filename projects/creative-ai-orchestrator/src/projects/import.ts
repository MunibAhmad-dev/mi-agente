// ============================================================================
// Project Import — License-Aware
// ============================================================================
// Imports projects from JSON/ZIP/folder with license scanning,
// security scanning, and dependency resolution.
// ============================================================================

import type { CaioDatabase, ProjectId, LicenseInfo } from "../core/types/index.js";
import { newId } from "../core/types/index.js";
import { LicenseEngine } from "../discovery/license/engine.js";
import { SecurityScanner } from "../security/index.js";
import fs from "node:fs";
import path from "node:path";

export interface ImportResult {
  success: boolean;
  projectId?: ProjectId;
  warnings: string[];
  errors: string[];
  licenseIssues: string[];
  securityIssues: string[];
}

export class ProjectImporter {
  private licenseEngine: LicenseEngine;
  private securityScanner: SecurityScanner;

  constructor(private db: CaioDatabase) {
    this.licenseEngine = new LicenseEngine();
    this.securityScanner = new SecurityScanner();
  }

  /**
   * Import a project from a JSON manifest.
   */
  async importFromJSON(data: Record<string, any>): Promise<ImportResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const licenseIssues: string[] = [];
    const securityIssues: string[] = [];

    // Validate structure
    if (!data.project && !data.name) {
      errors.push("Invalid project manifest: missing project/name");
      return { success: false, warnings, errors, licenseIssues, securityIssues };
    }

    const projectData = data.project || data;

    // Scan models for license issues
    if (data.models) {
      for (const model of data.models) {
        if (model.license && !model.included) {
          licenseIssues.push(`Model "${model.name}": ${model.reason || "License restriction"}`);
        }
      }
    }

    // Scan for security issues in workflows
    if (data.workflows) {
      for (const wf of data.workflows) {
        if (wf.nodes) {
          for (const node of wf.nodes) {
            const nodeType = (node.type || "").toLowerCase();
            if (nodeType.includes("exec") || nodeType.includes("script") || nodeType.includes("shell")) {
              securityIssues.push(`Potentially dangerous node type: ${node.type}`);
            }
          }
        }
      }
    }

    // Check for required models
    if (data.workflows) {
      for (const wf of data.workflows) {
        if (wf.metadata?.requiredModels) {
          for (const model of wf.metadata.requiredModels) {
            const installed = this.db.get<{ id: string }>(
              "SELECT id FROM models WHERE name = ? AND installed = 1", model.name
            );
            if (!installed) {
              warnings.push(`Required model not installed: ${model.name}`);
            }
          }
        }
      }
    }

    // Create project
    const projectId = newId() as ProjectId;
    this.db.run(
      `INSERT INTO projects (id, name, description, path, config, tags)
       VALUES (?, ?, ?, ?, ?, ?)`,
      projectId,
      projectData.name || "Imported Project",
      projectData.description || `Imported from ${data.metadata?.source || "JSON"}`,
      `data/projects/${projectId}`,
      JSON.stringify(projectData.config || { mode: "balanced", autonomyLevel: "assisted", networkPolicy: "normal", customSettings: {} }),
      JSON.stringify(projectData.tags || [])
    );

    // Import workflows
    if (data.workflows) {
      for (const wf of data.workflows) {
        this.db.run(
          `INSERT INTO workflows (id, project_id, name, version, nodes, links, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          newId(),
          projectId,
          wf.name || "Imported Workflow",
          wf.version || "1.0.0",
          JSON.stringify(wf.nodes || []),
          JSON.stringify(wf.links || []),
          JSON.stringify(wf.metadata || { tags: [], requiredNodes: [], requiredModels: [] })
        );
      }
    }

    // Record import source
    if (data.metadata?.source) {
      this.db.run(
        `INSERT INTO memory (id, project_id, type, category, content, metadata, relevance)
         VALUES (?, ?, 'long_term', 'import_source', ?, ?, 0.9)`,
        newId(),
        projectId,
        `Imported from: ${data.metadata.source}`,
        JSON.stringify(data.metadata)
      );
    }

    return {
      success: true,
      projectId,
      warnings,
      errors,
      licenseIssues,
      securityIssues,
    };
  }

  /**
   * Import from a local directory.
   */
  async importFromDirectory(dirPath: string): Promise<ImportResult> {
    const manifestPath = path.join(dirPath, "project.json");

    if (fs.existsSync(manifestPath)) {
      const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      return this.importFromJSON(data);
    }

    // Try to find workflow files
    const workflowFiles = fs.readdirSync(dirPath).filter((f) => f.endsWith(".json") && f !== "package.json");

    if (workflowFiles.length > 0) {
      const data = {
        project: { name: path.basename(dirPath) },
        workflows: workflowFiles.map((f) => JSON.parse(fs.readFileSync(path.join(dirPath, f), "utf-8"))),
      };
      return this.importFromJSON(data);
    }

    return {
      success: false,
      warnings: [],
      errors: ["No project.json or workflow files found in directory"],
      licenseIssues: [],
      securityIssues: [],
    };
  }
}
