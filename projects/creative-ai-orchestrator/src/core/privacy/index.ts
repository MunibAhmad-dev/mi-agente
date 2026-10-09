// ============================================================================
// Privacy & Data Classification
// ============================================================================
// Classifies data as public/project/private/sensitive.
// Enforces policies for data handling and sharing.
// ============================================================================

export type DataClassification = "public" | "project" | "private" | "sensitive";

export interface ClassificationRule {
  pattern: string;
  classification: DataClassification;
  description: string;
}

const DEFAULT_RULES: ClassificationRule[] = [
  { pattern: "*.safetensors", classification: "project", description: "AI model files" },
  { pattern: "*.ckpt", classification: "project", description: "AI model checkpoints" },
  { pattern: "*.lora", classification: "project", description: "LoRA model files" },
  { pattern: "*.png", classification: "project", description: "Generated images" },
  { pattern: "*.jpg", classification: "project", description: "Generated images" },
  { pattern: "*.mp4", classification: "project", description: "Generated videos" },
  { pattern: "*.wav", classification: "project", description: "Generated audio" },
  { pattern: "project.json", classification: "project", description: "Project configuration" },
  { pattern: "*.env", classification: "sensitive", description: "API keys and secrets" },
  { pattern: "caio.db", classification: "private", description: "System database" },
  { pattern: "*.key", classification: "sensitive", description: "Cryptographic keys" },
  { pattern: "workflow.json", classification: "public", description: "Workflow definitions" },
  { pattern: "README.md", classification: "public", description: "Documentation" },
];

export class PrivacyEngine {
  private rules: ClassificationRule[];

  constructor(rules?: ClassificationRule[]) {
    this.rules = rules || DEFAULT_RULES;
  }

  /**
   * Classify a file by its path/name.
   */
  classify(filePath: string): DataClassification {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;

    for (const rule of this.rules) {
      const pattern = rule.pattern.replace("*", ".*");
      if (new RegExp(`^${pattern}$`, "i").test(fileName)) {
        return rule.classification;
      }
    }

    return "project"; // Default classification
  }

  /**
   * Check if a file can be included in an export.
   */
  canExport(filePath: string, includePrivate: boolean = false): boolean {
    const classification = this.classify(filePath);
    if (classification === "public") return true;
    if (classification === "project") return true;
    if (classification === "private" && includePrivate) return true;
    if (classification === "sensitive") return false;
    return false;
  }

  /**
   * Check if a file can be sent to an external service.
   */
  canSendExternally(filePath: string): boolean {
    const classification = this.classify(filePath);
    return classification === "public";
  }

  /**
   * Get classification report for a directory.
   */
  getReport(files: string[]): Record<DataClassification, string[]> {
    const report: Record<DataClassification, string[]> = {
      public: [],
      project: [],
      private: [],
      sensitive: [],
    };

    for (const file of files) {
      const classification = this.classify(file);
      report[classification].push(file);
    }

    return report;
  }
}
