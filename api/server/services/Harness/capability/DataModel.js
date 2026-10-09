'use strict';

/**
 * DataModel - Universal schema for all capabilities.
 * Every resource from any ecosystem is normalized to this model.
 */

const CapabilityTypes = [
  'agent', 'skill', 'plugin', 'instruction', 'hook', 'workflow',
  'mcp_server', 'mcp_tool', 'tool', 'subagent', 'command',
  'orchestration', 'gui', 'ide_integration', 'monitoring',
  'observability', 'proxy', 'gateway', 'memory', 'context_system',
  'rag_component', 'browser_automation', 'connector', 'extension',
  'template', 'agent_framework', 'learning_resource', 'canvas',
  'agentic_workflow', 'other',
];

const SecurityLevels = ['trusted', 'verified', 'safe', 'unknown', 'suspicious', 'dangerous'];
const QualityTiers = ['S', 'A', 'B', 'C', 'D', 'F'];
const CompatibilityStates = ['verified', 'likely', 'partial', 'unknown', 'incompatible'];
const Platforms = ['claude_code', 'copilot', 'codex', 'gemini_cli', 'cursor', 'windsurf', 'opencode', 'openclaw', 'manus', 'mcp', 'general'];
const Licenses = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'MPL-2.0', 'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'ISC', 'Unlicense', 'Proprietary', 'Unknown'];

/**
 * Create a normalized capability object.
 */
function createCapability(raw, source) {
  return {
    // Identity
    id: generateId(raw),
    name: raw.name || raw.title || 'Unknown',
    type: raw.type || 'other',
    subtype: raw.subtype || null,
    description: raw.description || '',
    
    // Source
    source: {
      provider: source?.provider || 'unknown', // github, huggingface, marketplace, manual
      repository: source?.repository || null,
      url: source?.url || null,
      commit: source?.commit || null,
      version: source?.version || '0.0.0',
      branch: source?.branch || 'main',
      path: source?.path || null,
    },
    
    // Metadata
    license: raw.license || 'Unknown',
    authors: raw.authors || [],
    created: raw.created || new Date().toISOString(),
    updated: raw.updated || new Date().toISOString(),
    
    // Platform compatibility
    platforms: raw.platforms || [],
    agents: raw.agents || [],
    
    // Dependencies & Requirements
    dependencies: raw.dependencies || [],
    requirements: raw.requirements || {
      node: null,
      python: null,
      os: [],
      apiKeys: [],
      envVars: [],
    },
    
    // Capabilities provided
    tools: raw.tools || [],
    mcp: raw.mcp || [],
    skills: raw.skills || [],
    hooks: raw.hooks || [],
    agents_provided: raw.agents_provided || [],
    instructions: raw.instructions || [],
    
    // Files
    files: raw.files || {
      manifest: null,
      readme: null,
      skillMd: null,
      scripts: [],
      references: [],
      templates: [],
      tests: [],
    },
    
    // Categorization
    categories: raw.categories || [],
    tags: raw.tags || [],
    
    // Security
    security: {
      level: 'unknown', // trusted, verified, safe, unknown, suspicious, dangerous
      score: null, // 0-100
      scanDate: null,
      findings: [],
      permissions: {
        filesystem: false,
        network: false,
        subprocess: false,
        credentials: false,
        envVars: false,
      },
      risks: [],
    },
    
    // Evaluation
    evaluation: {
      quality: {
        overall: null,
        functional: null,
        accuracy: null,
        reliability: null,
        documentation: null,
        maintainability: null,
        reproducibility: null,
      },
      compatibility: {}, // { platform: state }
      tokenEfficiency: null,
      latency: null,
      lastBenchmark: null,
      tier: null, // S, A, B, C, D, F
    },
    
    // Popularity (separate from quality)
    popularity: {
      stars: 0,
      forks: 0,
      downloads: 0,
      installs: 0,
      contributors: 0,
      recentActivity: null,
    },
    
    // Maintenance
    maintenance: {
      lastCommit: null,
      lastRelease: null,
      openIssues: 0,
      openPRs: 0,
      maintainers: [],
      ci: false,
      tests: false,
    },
    
    // Installation
    installation: {
      method: null, // git, npm, pip, manual, zip, skill
      command: null,
      steps: [],
      autoConfigurable: false,
      snapshotBeforeInstall: false,
    },
    
    // Configuration
    configuration: {
      required: [],
      optional: [],
      defaults: {},
    },
    
    // Provenance
    provenance: {
      sourceUrl: source?.url || null,
      repository: source?.repository || null,
      commitSha: source?.commit || null,
      release: source?.version || null,
      importDate: new Date().toISOString(),
      importSource: source?.provider || 'unknown',
    },
    
    // Versioning
    versioning: {
      current: source?.version || '0.0.0',
      versions: [],
      benchmarkHistory: [],
      securityHistory: [],
      qualityHistory: [],
    },
    
    // Status
    status: 'discovered', // discovered, analyzed, verified, installed, enabled, disabled, quarantined, deprecated
    enabled: false,
    
    // Timestamps
    timestamps: {
      discovered: new Date().toISOString(),
      analyzed: null,
      verified: null,
      installed: null,
      lastChecked: null,
    },
  };
}

function generateId(raw) {
  const name = (raw.name || raw.title || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const source = raw.source?.repository || raw.source?.url || 'local';
  const hash = simpleHash(source + (raw.name || ''));
  return `${name}-${hash.slice(0, 8)}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

module.exports = {
  createCapability,
  generateId,
  CapabilityTypes,
  SecurityLevels,
  QualityTiers,
  CompatibilityStates,
  Platforms,
  Licenses,
};
