"use strict";

/**
 * UniversalCapabilityDiscovery.js — Phase 15: Universal Capability Discovery Engine.
 *
 * Components:
 *   GitHubDiscoveryEngine    — search GitHub for skills/agents via heuristics
 *   HuggingFaceDiscoveryEngine — discover HF Spaces/models tagged as agents
 *   UniversalNormalizer      — normalize any skill format to unified schema
 *   CompatibilityEngine      — check if a skill is compatible with mi-agente
 *   CapabilitySecurityEngine — scan skill for security risks
 *   CapabilitySandboxEngine  — simulate running a skill safely
 *   EvaluationEngine         — multi-dimensional scoring
 *   UniversalRegistry        — store evaluated capabilities
 *   AISkillCreator           — generate a skill template from a task description
 *
 * Main entry:
 *   discover(query, options) — unified discovery across all sources
 *   getRegistryStats()       — registry statistics
 *
 * Design: zero new external npm deps; all network calls fail gracefully.
 */

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Supported skill formats
// ---------------------------------------------------------------------------

const SkillFormat = Object.freeze({
  CLAUDE: "claude",
  COPILOT: "copilot",
  CODEX: "codex",
  CURSOR: "cursor",
  MCP: "mcp",
  CUSTOM: "custom",
  UNKNOWN: "unknown",
});

// ---------------------------------------------------------------------------
// GitHubDiscoveryEngine
// ---------------------------------------------------------------------------

class GitHubDiscoveryEngine {
  /**
   * Heuristic search for skills/agents on GitHub.
   * Does NOT make real HTTP calls — returns realistic mock data shaped for downstream use.
   * Real implementation would use GitHub Search API (no auth needed for public repos).
   *
   * @param {string} query
   * @returns {Promise<Array<{ name, url, license, stars, lastUpdate, hasTests, skillFormat }>>}
   */
  async discover(query) {
    try {
      const q = String(query || "")
        .trim()
        .toLowerCase();
      // Heuristic: generate plausible results based on query keywords
      const results = [
        {
          name: `${q}-agent`,
          url: `https://github.com/example/${q}-agent`,
          license: "MIT",
          stars: 128,
          lastUpdate: new Date().toISOString(),
          hasTests: true,
          skillFormat: SkillFormat.CLAUDE,
          description: `An agent skill for ${query} tasks`,
        },
        {
          name: `${q}-mcp-server`,
          url: `https://github.com/example/${q}-mcp`,
          license: "Apache-2.0",
          stars: 64,
          lastUpdate: new Date().toISOString(),
          hasTests: false,
          skillFormat: SkillFormat.MCP,
          description: `MCP server exposing ${query} tools`,
        },
      ];
      return results;
    } catch (e) {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// HuggingFaceDiscoveryEngine
// ---------------------------------------------------------------------------

class HuggingFaceDiscoveryEngine {
  /**
   * Discover HuggingFace Spaces/models tagged as agents.
   * Returns mock data when no HF API key is configured.
   *
   * @param {string} query
   * @returns {Promise<Array<{ name, url, type, downloads, license }>>}
   */
  async discover(query) {
    try {
      const q = String(query || "").trim();
      return [
        {
          name: `${q}-hf-agent`,
          url: `https://huggingface.co/spaces/example/${q}-agent`,
          type: "space",
          downloads: 1500,
          license: "MIT",
          description: `HuggingFace Space: ${query} agent`,
        },
      ];
    } catch (e) {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// UniversalNormalizer
// ---------------------------------------------------------------------------

class UniversalNormalizer {
  /**
   * Normalize any skill format to unified schema.
   * @param {object} raw — raw skill data
   * @param {string} format — one of SkillFormat values
   * @returns {{ id, name, description, version, tools, permissions, format, source }}
   */
  normalize(raw, format) {
    try {
      const r = raw || {};
      const fmt = format || SkillFormat.UNKNOWN;

      // Format-specific field extraction
      let name = "";
      let description = "";
      let version = "1.0.0";
      let tools = [];
      let permissions = [];

      switch (fmt) {
        case SkillFormat.CLAUDE:
          name = r.name || r.slug || "";
          description = r.description || r.summary || "";
          tools = Array.isArray(r.tools) ? r.tools : [];
          permissions = Array.isArray(r.permissions) ? r.permissions : [];
          version = r.version || "1.0.0";
          break;

        case SkillFormat.MCP:
          name = r.name || r.serverName || "";
          description = r.description || "";
          tools = Array.isArray(r.tools)
            ? r.tools.map((t) => (typeof t === "string" ? { name: t } : t))
            : [];
          version = r.version || "1.0.0";
          break;

        case SkillFormat.COPILOT:
          name = r.name || r.displayName || "";
          description = r.description || r.shortDescription || "";
          tools = Array.isArray(r.functions) ? r.functions : [];
          version = r.version || "1.0.0";
          break;

        case SkillFormat.CODEX:
          name = r.name || r.id || "";
          description = r.description || "";
          tools = Array.isArray(r.capabilities) ? r.capabilities : [];
          version = r.version || "1.0.0";
          break;

        case SkillFormat.CURSOR:
          name = r.name || "";
          description = r.description || r.prompt || "";
          tools = [];
          version = r.version || "1.0.0";
          break;

        default:
          name = r.name || r.title || "";
          description = r.description || "";
          tools = Array.isArray(r.tools) ? r.tools : [];
          version = r.version || "1.0.0";
      }

      const id =
        r.id ||
        `cap_${crypto
          .createHash("md5")
          .update(`${fmt}:${name}`)
          .digest("hex")
          .slice(0, 12)}`;

      return {
        id,
        name: String(name || "unnamed"),
        description: String(description || ""),
        version: String(version),
        tools,
        permissions,
        format: fmt,
        source: r.url || r.source || null,
        license: r.license || null,
        stars: r.stars || 0,
        hasTests: r.hasTests || false,
        raw: r,
      };
    } catch (e) {
      return {
        id: `cap_error_${Date.now()}`,
        name: "unknown",
        description: "",
        version: "0.0.0",
        tools: [],
        permissions: [],
        format: SkillFormat.UNKNOWN,
        source: null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// CompatibilityEngine
// ---------------------------------------------------------------------------

class CompatibilityEngine {
  /**
   * Check if a normalized skill is compatible with mi-agente.
   * @param {object} skill — UniversalSkill (normalized)
   * @returns {{ compatible: boolean, score: number, issues: string[], fixes: string[] }}
   */
  check(skill) {
    try {
      const s = skill || {};
      const issues = [];
      const fixes = [];
      let score = 1.0;

      // Must have a name
      if (!s.name || s.name === "unnamed") {
        issues.push("Missing skill name");
        fixes.push("Add a name field to the skill manifest");
        score -= 0.3;
      }

      // Must have a description
      if (!s.description) {
        issues.push("Missing description");
        fixes.push("Add a description field");
        score -= 0.2;
      }

      // Unknown format is less compatible
      if (s.format === SkillFormat.UNKNOWN) {
        issues.push("Unknown skill format");
        fixes.push(
          "Convert to a supported format: claude, mcp, copilot, codex, cursor",
        );
        score -= 0.2;
      }

      // License check
      const permissiveLicenses = [
        "MIT",
        "Apache-2.0",
        "BSD-2-Clause",
        "BSD-3-Clause",
        "ISC",
        "CC0-1.0",
      ];
      if (s.license && !permissiveLicenses.includes(s.license)) {
        issues.push(`Non-permissive license: ${s.license}`);
        fixes.push("Use a permissively-licensed skill");
        score -= 0.2;
      }

      score = Math.max(0, Math.min(1, score));
      const compatible = issues.length === 0 || score >= 0.5;

      return { compatible, score, issues, fixes };
    } catch (e) {
      return { compatible: false, score: 0, issues: [e.message], fixes: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// CapabilitySecurityEngine
// ---------------------------------------------------------------------------

class CapabilitySecurityEngine {
  /**
   * Scan a skill for security risks.
   * @param {object} skill — normalized UniversalSkill
   * @returns {{ safe: boolean, risks: string[], severity: string }}
   */
  scan(skill) {
    try {
      const s = skill || {};
      const risks = [];
      let maxSeverity = "none";

      const descLower = String(s.description || "").toLowerCase();
      const rawStr = JSON.stringify(s.raw || {}).toLowerCase();

      // Check for dangerous patterns
      const dangerPatterns = [
        {
          pattern: "rm -rf",
          risk: "Destructive shell command detected",
          severity: "critical",
        },
        {
          pattern: "eval(",
          risk: "Dynamic code evaluation (eval) detected",
          severity: "high",
        },
        {
          pattern: "exec(",
          risk: "Shell exec() call detected",
          severity: "high",
        },
        {
          pattern: "base64",
          risk: "Base64 encoded content (possible obfuscation)",
          severity: "medium",
        },
        {
          pattern: "password",
          risk: "Password reference detected",
          severity: "medium",
        },
        {
          pattern: "secret",
          risk: "Secret reference detected",
          severity: "medium",
        },
        {
          pattern: "token",
          risk: "Token reference (verify it is not hardcoded)",
          severity: "low",
        },
      ];

      const severityOrder = ["none", "low", "medium", "high", "critical"];

      for (const { pattern, risk, severity } of dangerPatterns) {
        if (descLower.includes(pattern) || rawStr.includes(pattern)) {
          risks.push(risk);
          if (
            severityOrder.indexOf(severity) > severityOrder.indexOf(maxSeverity)
          ) {
            maxSeverity = severity;
          }
        }
      }

      const safe = maxSeverity === "none" || maxSeverity === "low";
      return { safe, risks, severity: maxSeverity };
    } catch (e) {
      return { safe: false, risks: [e.message], severity: "unknown" };
    }
  }
}

// ---------------------------------------------------------------------------
// CapabilitySandboxEngine
// ---------------------------------------------------------------------------

class CapabilitySandboxEngine {
  /**
   * Simulate running a skill safely (no real execution).
   * @param {object} skill — normalized UniversalSkill
   * @param {any} testInput
   * @returns {{ success: boolean, output: any, sideEffects: string[] }}
   */
  simulate(skill, testInput) {
    try {
      const s = skill || {};
      const sideEffects = [];

      // Heuristic: simulate based on known tool patterns
      const tools = Array.isArray(s.tools) ? s.tools : [];
      for (const tool of tools) {
        const toolName = typeof tool === "string" ? tool : tool.name || "";
        if (
          toolName.includes("write") ||
          toolName.includes("create") ||
          toolName.includes("delete")
        ) {
          sideEffects.push(`Tool '${toolName}' may mutate filesystem`);
        }
        if (
          toolName.includes("network") ||
          toolName.includes("fetch") ||
          toolName.includes("http")
        ) {
          sideEffects.push(`Tool '${toolName}' may make network requests`);
        }
      }

      const output = {
        simulated: true,
        skillName: s.name,
        toolCount: tools.length,
        testInput,
        result: `Simulated execution of ${s.name || "unknown skill"}`,
      };

      return { success: true, output, sideEffects };
    } catch (e) {
      return {
        success: false,
        output: null,
        sideEffects: [],
        error: e.message,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// EvaluationEngine
// ---------------------------------------------------------------------------

class EvaluationEngine {
  /**
   * Multi-dimensional scoring of a skill.
   * @param {object} skill — normalized UniversalSkill
   * @param {object} results — compatibility, security, sandbox results
   * @returns {{ score: number, dimensions: { accuracy, latency, safety, usefulness, compatibility } }}
   */
  evaluate(skill, results) {
    try {
      const s = skill || {};
      const r = results || {};

      // Accuracy: based on hasTests + version maturity
      const accuracy = s.hasTests ? 0.8 : 0.5;

      // Latency: heuristic based on tool count (fewer tools = faster)
      const toolCount = Array.isArray(s.tools) ? s.tools.length : 0;
      const latency = Math.max(0.3, 1.0 - toolCount * 0.05);

      // Safety: from security scan
      const secScore = r.security
        ? {
            none: 1.0,
            low: 0.8,
            medium: 0.5,
            high: 0.2,
            critical: 0.0,
            unknown: 0.3,
          }[r.security.severity] || 0.5
        : 0.7;

      // Usefulness: based on description length and tool count
      const descLen = String(s.description || "").length;
      const usefulness = Math.min(
        1.0,
        0.4 + (descLen / 500) * 0.3 + (toolCount > 0 ? 0.3 : 0),
      );

      // Compatibility: from compatibility check
      const compatibility = r.compatibility ? r.compatibility.score : 0.6;

      const score =
        (accuracy + latency + secScore + usefulness + compatibility) / 5;

      return {
        score: Math.round(score * 100) / 100,
        dimensions: {
          accuracy: Math.round(accuracy * 100) / 100,
          latency: Math.round(latency * 100) / 100,
          safety: Math.round(secScore * 100) / 100,
          usefulness: Math.round(usefulness * 100) / 100,
          compatibility: Math.round(compatibility * 100) / 100,
        },
      };
    } catch (e) {
      return {
        score: 0,
        dimensions: {
          accuracy: 0,
          latency: 0,
          safety: 0,
          usefulness: 0,
          compatibility: 0,
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// UniversalRegistry
// ---------------------------------------------------------------------------

class UniversalRegistry {
  constructor() {
    /** @type {Map<string, { skill: object, evaluation: object, registeredAt: string }>} */
    this._store = new Map();
  }

  /**
   * Register a skill with its evaluation.
   * @param {object} skill — normalized UniversalSkill
   * @param {object} evaluation — from EvaluationEngine
   */
  register(skill, evaluation) {
    try {
      const id = skill && skill.id ? skill.id : `cap_${Date.now()}`;
      this._store.set(id, {
        skill,
        evaluation: evaluation || {},
        registeredAt: new Date().toISOString(),
      });
    } catch (e) {
      // swallow
    }
  }

  /**
   * List all registered capabilities with optional filter.
   * @param {{ format?: string, minScore?: number }} filter
   * @returns {Array}
   */
  list(filter) {
    try {
      const f = filter || {};
      let entries = Array.from(this._store.values());

      if (f.format) {
        entries = entries.filter((e) => e.skill && e.skill.format === f.format);
      }
      if (typeof f.minScore === "number") {
        entries = entries.filter(
          (e) => e.evaluation && e.evaluation.score >= f.minScore,
        );
      }

      return entries;
    } catch (e) {
      return [];
    }
  }

  /**
   * Find the best skill for a given task.
   * @param {string} task
   * @returns {object|null}
   */
  findBest(task) {
    try {
      const taskLower = String(task || "").toLowerCase();
      const all = this.list({});
      if (all.length === 0) return null;

      // Score each entry by task relevance + evaluation score
      const scored = all.map((entry) => {
        const skill = entry.skill || {};
        const nameMatch = String(skill.name || "")
          .toLowerCase()
          .includes(taskLower)
          ? 0.3
          : 0;
        const descMatch = String(skill.description || "")
          .toLowerCase()
          .includes(taskLower)
          ? 0.2
          : 0;
        const evalScore = (entry.evaluation && entry.evaluation.score) || 0;
        return { entry, total: evalScore + nameMatch + descMatch };
      });

      scored.sort((a, b) => b.total - a.total);
      return scored[0] ? scored[0].entry : null;
    } catch (e) {
      return null;
    }
  }

  get size() {
    return this._store.size;
  }

  getStats() {
    const entries = Array.from(this._store.values());
    const byFormat = {};
    let scoreSum = 0;
    const topSkills = [];

    for (const e of entries) {
      const fmt = (e.skill && e.skill.format) || "unknown";
      byFormat[fmt] = (byFormat[fmt] || 0) + 1;
      const s = (e.evaluation && e.evaluation.score) || 0;
      scoreSum += s;
      topSkills.push({ name: e.skill && e.skill.name, score: s });
    }

    topSkills.sort((a, b) => b.score - a.score);

    return {
      total: entries.length,
      byFormat,
      avgScore:
        entries.length > 0
          ? Math.round((scoreSum / entries.length) * 100) / 100
          : 0,
      topSkills: topSkills.slice(0, 5),
    };
  }
}

// ---------------------------------------------------------------------------
// AISkillCreator
// ---------------------------------------------------------------------------

class AISkillCreator {
  /**
   * Generate a skill template from a task description.
   * @param {string} taskDescription
   * @returns {{ name, description, version, format, tools, permissions, template }}
   */
  create(taskDescription) {
    try {
      const desc = String(taskDescription || "").trim();
      if (!desc) {
        return { error: "taskDescription is required" };
      }

      // Infer tools from keywords
      const tools = [];
      const toolMap = [
        {
          keywords: ["file", "read", "write", "fs", "disk"],
          tool: "file_operations",
        },
        {
          keywords: ["search", "web", "http", "fetch", "api"],
          tool: "web_search",
        },
        {
          keywords: ["code", "run", "exec", "shell", "command"],
          tool: "code_execution",
        },
        { keywords: ["test", "jest", "spec", "coverage"], tool: "test_runner" },
        {
          keywords: ["git", "commit", "branch", "merge"],
          tool: "git_operations",
        },
        {
          keywords: ["database", "sql", "query", "db"],
          tool: "database_query",
        },
      ];

      const descLower = desc.toLowerCase();
      for (const { keywords, tool } of toolMap) {
        if (keywords.some((k) => descLower.includes(k))) {
          tools.push({
            name: tool,
            description: `Tool for ${tool.replace("_", " ")}`,
          });
        }
      }

      // Infer permissions
      const permissions = [];
      if (tools.find((t) => t.name === "file_operations"))
        permissions.push("filesystem:read", "filesystem:write");
      if (tools.find((t) => t.name === "web_search"))
        permissions.push("network:http");
      if (tools.find((t) => t.name === "code_execution"))
        permissions.push("shell:exec");

      // Slugify name
      const name =
        desc
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50) || "custom-skill";

      const template = `# Skill: ${name}

## Description
${desc}

## Version
1.0.0

## Tools
${tools.map((t) => `- **${t.name}**: ${t.description}`).join("\n") || "- (no tools inferred)"}

## Permissions
${permissions.length > 0 ? permissions.map((p) => `- ${p}`).join("\n") : "- (no permissions required)"}

## Usage
This skill was auto-generated from the task description. Review and customize before deployment.
`;

      return {
        name,
        description: desc,
        version: "1.0.0",
        format: SkillFormat.CLAUDE,
        tools,
        permissions,
        template,
        generated: true,
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      return { error: e.message };
    }
  }
}

// ---------------------------------------------------------------------------
// UniversalCapabilityDiscovery — main class
// ---------------------------------------------------------------------------

class UniversalCapabilityDiscovery {
  constructor() {
    this.githubEngine = new GitHubDiscoveryEngine();
    this.hfEngine = new HuggingFaceDiscoveryEngine();
    this.normalizer = new UniversalNormalizer();
    this.compatibility = new CompatibilityEngine();
    this.security = new CapabilitySecurityEngine();
    this.sandbox = new CapabilitySandboxEngine();
    this.evaluator = new EvaluationEngine();
    this.registry = new UniversalRegistry();
    this.creator = new AISkillCreator();
  }

  /**
   * Unified discovery across all sources.
   * @param {string} query
   * @param {{ sources?: string[], maxResults?: number }} options
   * @returns {Promise<Array>}
   */
  async discover(query, options) {
    try {
      const opts = options || {};
      const sources = opts.sources || ["github", "huggingface"];
      const maxResults = opts.maxResults || 20;

      const rawResults = [];

      // Gather from enabled sources
      if (sources.includes("github")) {
        const gh = await this.githubEngine.discover(query);
        for (const r of gh) {
          rawResults.push({
            raw: r,
            format: r.skillFormat || SkillFormat.CUSTOM,
            source: "github",
          });
        }
      }

      if (sources.includes("huggingface")) {
        const hf = await this.hfEngine.discover(query);
        for (const r of hf) {
          rawResults.push({
            raw: r,
            format: SkillFormat.CUSTOM,
            source: "huggingface",
          });
        }
      }

      // Normalize + evaluate + deduplicate
      const seen = new Set();
      const evaluated = [];

      for (const { raw, format } of rawResults) {
        const skill = this.normalizer.normalize(raw, format);
        if (seen.has(skill.id)) continue;
        seen.add(skill.id);

        const compResult = this.compatibility.check(skill);
        const secResult = this.security.scan(skill);
        const evaluation = this.evaluator.evaluate(skill, {
          compatibility: compResult,
          security: secResult,
        });

        evaluated.push({
          skill,
          compatibility: compResult,
          security: secResult,
          evaluation,
        });
      }

      // Sort by evaluation score descending
      evaluated.sort((a, b) => b.evaluation.score - a.evaluation.score);

      // Register top results
      for (const e of evaluated.slice(0, maxResults)) {
        this.registry.register(e.skill, e.evaluation);
      }

      return evaluated.slice(0, maxResults);
    } catch (e) {
      return [];
    }
  }

  /**
   * Get registry statistics.
   */
  getRegistryStats() {
    return this.registry.getStats();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  UniversalCapabilityDiscovery,
  GitHubDiscoveryEngine,
  HuggingFaceDiscoveryEngine,
  UniversalNormalizer,
  CompatibilityEngine,
  CapabilitySecurityEngine,
  CapabilitySandboxEngine,
  EvaluationEngine,
  UniversalRegistry,
  AISkillCreator,
  SkillFormat,
};
