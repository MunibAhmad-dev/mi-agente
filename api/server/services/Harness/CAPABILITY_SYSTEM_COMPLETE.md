# UNIVERSAL AGENT CAPABILITY SYSTEM — COMPLETE

## Architecture

```
User Request: "I need to scan my API for security vulnerabilities"
                    │
                    ▼
            ┌─────────────────┐
            │  CognitiveEngine │
            │  └─ CapabilityManager
            │      │
            │  ┌───┴───────────────┐
            │  │ DiscoveryEngine   │ ← GitHub, HuggingFace, Marketplaces
            │  │ SecurityEngine    │ ← Malware, permissions, risks
            │  │ EvaluationEngine  │ ← Quality, compatibility, maintenance
            │  │ CapabilityRegistry│ ← Central storage + search + indexes
            │  │ InstallationEngine│ ← Install, update, uninstall, rollback
            │  └───────────────────┘
            │         │
            │    Recommendations
            │    1. MCP Security Scanner (Score: 61, Tier: B)
            │    2. Browser Automation Pro (Score: 61, Tier: B)
            └─────────────────┘
```

## Components Built (11 files)

| Component | File | Purpose |
|-----------|------|---------|
| **DataModel** | `DataModel.js` | Universal schema for all capabilities |
| **GitHubDiscovery** | `discovery/GitHubDiscovery.js` | Discovers from GitHub (Events, Code Search, repos) |
| **HuggingFaceDiscovery** | `discovery/HuggingFaceDiscovery.js` | Discovers from HuggingFace Hub |
| **MarketplaceDiscovery** | `discovery/MarketplaceDiscovery.js` | Discovers from ClaudeMarket, SkillsCat, etc. |
| **DiscoveryEngine** | `discovery/DiscoveryEngine.js` | Orchestrates all discovery sources |
| **SecurityEngine** | `security/SecurityEngine.js` | Scans for malware, risky patterns, permissions |
| **EvaluationEngine** | `evaluation/EvaluationEngine.js` | Multi-dimensional scoring (quality, security, maintenance) |
| **CapabilityRegistry** | `registry/CapabilityRegistry.js` | Central storage with search, indexes, persistence |
| **InstallationEngine** | `installation/InstallationEngine.js` | Install, update, uninstall with rollback |
| **CapabilityManager** | `CapabilityManager.js` | Main orchestrator connecting all components |
| **index** | `index.js` | Module exports |

## Capability Data Model

Each capability is normalized to:
- **Identity**: id, name, type, description
- **Source**: provider, repository, url, version
- **Metadata**: license, authors, timestamps
- **Platforms**: claude_code, copilot, codex, cursor, etc.
- **Security**: level, score, findings, permissions, risks
- **Evaluation**: quality, compatibility, maintenance, tier
- **Popularity**: stars, forks, downloads
- **Installation**: method, command, steps, snapshot

## Capability Types (30)

agent, skill, plugin, instruction, hook, workflow, mcp_server, mcp_tool, tool, subagent, command, orchestration, gui, ide_integration, monitoring, observability, proxy, gateway, memory, context_system, rag_component, browser_automation, connector, extension, template, agent_framework, learning_resource, canvas, agentic_workflow, other

## Platforms Supported

claude_code, copilot, codex, gemini_cli, cursor, windsurf, opencode, openclaw, manus, mcp, general

## Discovery Sources

| Source | Type | What it finds |
|--------|------|--------------|
| GitHub Search | API | Skills, plugins, MCP, agents, hooks, workflows |
| GitHub Events | API | Recently updated capabilities |
| HuggingFace Hub | API | Models, datasets, agents, tools |
| SkillsCat | Web | MCP servers, skills, plugins |
| ClaudeMarket | Web | Skills, plugins, MCP |
| TonsofSkills | Web | Plugins, agents, skills |
| Skill Marketplace | Web | Skills, plugins |

## Security Scanning

Detects:
- Code execution (eval, exec)
- Subprocess usage (child_process, spawn)
- Network access (fetch, URLs)
- Filesystem access (fs operations)
- Credential access (API keys, secrets)
- Privilege escalation (sudo)
- Remote code execution (curl | bash)
- Obfuscation (atob, hex encoding)

Score: 0-100 (0=dangerous, 100=safe)

## Evaluation Dimensions

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Functional Quality | 30% | Has description, tags, files, structure |
| Documentation | 15% | README, description length, instructions |
| Reliability | 15% | Tests, CI, recent activity |
| Security | 15% | Security scan score |
| Compatibility | 8% | Platform support |
| Token Efficiency | 7% | Token usage (untested until benchmarked) |
| Maintenance | 4% | Last commit, issues, CI, tests |
| Popularity | 4% | Stars, forks, downloads |

Quality Tiers: S (≥90), A (≥75), B (≥60), C (≥40), D (≥20), F (<20)

## Usage

```javascript
const brain = new CognitiveEngine({ userId: 'user1' });

// Discover capabilities
await brain.discoverCapabilities();

// Search for capabilities
const results = brain.searchCapabilities('security scanner', { type: 'tool' });

// Find capabilities for a task
const recs = await brain.findCapabilitiesForTask('I need to automate browser testing');

// Install a capability
await brain.installCapability(capabilityId);

// Get top capabilities
const top = brain.getTopCapabilities(10);

// Get statistics
const stats = brain.getCapabilityStats();
```

## Files count: 96 total JS files
- Harness core: 36
- Cognitive engines: 27
- Token optimization: 16
- LLM integration: 6
- Capability system: 11
