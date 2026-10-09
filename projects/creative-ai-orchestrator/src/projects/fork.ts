// ============================================================================
// Fork & Improve
// ============================================================================
// Discover → Import → Analyze → Execute → Evaluate → Modify → Compare → Save
// ============================================================================

import type { CaioDatabase, ProjectId, DiscoveredResource } from "../core/types/index.js";
import { newId } from "../core/types/index.js";
import { VisionEngine } from "../vision/engine/index.js";
import { WorkflowEngine } from "../workflows/engine/index.js";

export interface ForkResult {
  projectId: ProjectId;
  originalSource: string;
  improvements: string[];
  qualityDelta: number;
}

export class ForkImprove {
  private vision: VisionEngine;
  private workflowEngine: WorkflowEngine;

  constructor(private db: CaioDatabase) {
    this.vision = new VisionEngine(db);
    this.workflowEngine = new WorkflowEngine(db);
  }

  /**
   * Import a discovered resource as a new project.
   */
  async importAsProject(
    resource: DiscoveredResource,
    projectName: string
  ): Promise<ProjectId> {
    const id = newId() as ProjectId;

    this.db.run(
      `INSERT INTO projects (id, name, description, path, config, tags)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      projectName,
      `Forked from ${resource.url}`,
      `data/projects/${id}`,
      JSON.stringify({ mode: "balanced", autonomyLevel: "assisted", networkPolicy: "normal", customSettings: {} }),
      JSON.stringify(resource.tags)
    );

    // Store the source reference
    this.db.run(
      `INSERT INTO memory (id, project_id, type, category, content, metadata, relevance)
       VALUES (?, ?, 'long_term', 'fork_source', ?, ?, 0.9)`,
      newId(),
      id,
      `Forked from: ${resource.url}`,
      JSON.stringify({ source: resource.url, name: resource.name, license: resource.license })
    );

    return id;
  }

  /**
   * Analyze a project output and suggest improvements.
   */
  async analyzeAndSuggest(
    outputPath: string,
    projectId: ProjectId
  ): Promise<{
    analysis: any;
    suggestions: string[];
    improvementPlan: string[];
  }> {
    const analysis = await this.vision.analyzeImage(outputPath);
    const suggestions = this.vision.suggestImprovements(analysis);

    // Map suggestions to workflow modifications
    const improvementPlan: string[] = [];
    for (const s of suggestions) {
      if (s.includes("sharpen")) improvementPlan.push("Add sharpening node (ImageSharpen or similar)");
      if (s.includes("denois")) improvementPlan.push("Add denoising node (ImageDenoise or similar)");
      if (s.includes("upscale")) improvementPlan.push("Add upscaler node (UpscaleModelLoader)");
      if (s.includes("contrast")) improvementPlan.push("Adjust contrast in post-processing");
      if (s.includes("brightness")) improvementPlan.push("Adjust brightness/exposure");
      if (s.includes("color")) improvementPlan.push("Add color correction node");
      if (s.includes("face")) improvementPlan.push("Add face restoration node (FaceRestoreModelLoader)");
    }

    // Store analysis in memory
    this.db.run(
      `INSERT INTO memory (id, project_id, type, category, content, metadata, relevance)
       VALUES (?, ?, 'project', 'fork_analysis', ?, ?, ?)`,
      newId(),
      projectId,
      `Quality: ${analysis.overallQuality}/100. Suggestions: ${suggestions.join("; ")}`,
      JSON.stringify({ quality: analysis.overallQuality, suggestions, improvementPlan }),
      analysis.overallQuality / 100
    );

    return { analysis, suggestions, improvementPlan };
  }

  /**
   * Compare original vs improved output.
   */
  async compareOutputs(originalPath: string, improvedPath: string) {
    return this.vision.compareImages(originalPath, improvedPath);
  }
}
