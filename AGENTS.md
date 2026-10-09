See CLAUDE.md.

When adding or changing code that mutates user documents, invalidate the auth user document cache for affected users. This includes single-user updates and bulk role/user mutations; otherwise OpenID JWT request burst caching can serve a stale `req.user` until its TTL expires.

## Agent Runtime (transformation "Mi LibreChat → AI Coding Agent")

15-phase plan. Phases 5-15 implemented as standalone services under `api/server/services/`, each with tests + doc + commit. Docs in `docs/agent-runtime/PHASE{N}_*.md`; roadmap in `AGENT_RUNTIME_GAP_ANALYSIS.md`.

### Implemented services (phases 5-15)
- **CodeIntelligence** (F5): symbol index + dep graph + blast radius. Lightweight regex parser (no native deps). `codeIntelligence.js`, `blastRadius.js`.
- **Verification** (F7): orchestrates checks by risk level (LOW→lint+compile; MED→+typecheck+tests; HIGH→+build; CRITICAL→+blast_radius). `verificationService.js`.
- **Repair** (F8): classify failures + repair actions (REWIND/RETRY_LINT_FIX/REVERT_FILE/ESCALATE) + repairLoop. Reuses checkpointer.rewind. `Repair/repairService.js`.
- **Security** (F9): Agent Firewall — policy engine granular (filesystem/shell/git/secrets/deployment). 3 presets (restricted/standard/full). `Security/agentFirewall.js`. `check()`/`enforce()`.
- **Memory** (F10): 5 layers (SHORT/SESSION/PROJECT/HISTORICAL/ARTIFACT) + retrieval by relevance. Distinct from contextLayers (F4 = context assembly; F10 = persistent memory). `Memory/memoryService.js`.
- **Subagents** (F11): 6 roles (Explorer/Researcher/Coder/Tester/Reviewer/Security) with independent contexts, shared DeepSeek. `Subagents/subagentService.js`.
- **Adaptive Router** (F12): layer over ModelRegistry.findByCapabilities; reorders by runtime metrics (latency/success/cost) + override + cooldown. `AgentArchitect/adaptiveRouter.js`.
- **Observability** (F13): Agent Trace (model/tokens/tools/RAM/VRAM/errors/retries) + Agent Replay. `Observability/observabilityService.js`.
- **Evaluation** (F14): benchmark levels 1-10, 3 configs (CLAUDE_CODE/DEEPSEEK_HARNESS/RUNTIME_FULL), metrics, compare + score. `Evaluation/evaluationService.js`.
- **Optimization** (F15): tuner of 6 dimensions (RAM/VRAM/tokens/latency/context/parallelism). Non-destructive (recommend/validate/apply). `Optimization/optimizationService.js`.

### AI Coding Agent (Fases 1-8 — transformation GPT/Grok/Claude Code)
Implemented as standalone services under `api/server/services/`. Each with ESLint clean (0 errors), syntax verified, runtime-tested. Open-source, installable projects only (no APIs, no LLM/video/image — those go in selector).

- **Code Intelligence** (Fase 1): `CodeIntelligence/CodebaseMemoryAdapter.js` — adapter for Codebase-Memory-MCP (tree-sitter + Hybrid LSP) with fallback to regex-based CodeIntelligenceService.
- **Context Intelligence** (Fase 2): `ContextIntelligence/` — `TokenCounter.js` (gpt-tokenizer), `VectorStore.js` (sqlite-vec + in-memory fallback), `CompressionService.js` (Headroom), `TokenBudgetService.js` (budget enforcement).
- **Web Search** (Fase 3): `SearchRuntime/SearchRuntime.js` (WhoogleProvider added, MIT/ISC), `UniversalSearch/WhoogleAdapter.js`, `app/clients/tools/structured/WebSearch.js`.
- **Security Scanner** (Fase 4): `SecurityScanner/` — `SecretsScanner.js` (Gitleaks, MIT), `SASTScanner.js` (ast-grep, MIT), `DependencyScanner.js` (OSV-Scanner, Apache + OSV.dev API), `ScanOrchestrator.js`. Regex heuristic fallbacks when binaries absent.
- **Policy Engine** (Fase 5): `PolicyEngine/` — `CedarEngine.js` (Cedar, Apache-2.0 + JS fallback), `PolicyStore.js` (11 default policies), `PolicyEvaluator.js`. Policies in `api/server/policies/default-policies.json`.
- **Process Manager** (Fase 6): `ProcessManager/` — `PtyManager.js` (node-pty, MIT + child_process fallback), `BackgroundProcess.js` (streaming via EventBus), `OutputStreamer.js`, `JobQueue.js` (retry + priority + concurrency).
- **Sub-agents + Plan Mode** (Fase 7): `SubAgents/` — 4 strategies (`CodeReviewerStrategy.js`, `DebuggerStrategy.js`, `TestWriterStrategy.js`, `SecurityAuditorStrategy.js`) with prompt builders + output parsers. `PlanMode/PlanMode.js` — deliberate planning before execution (parse plan, approval gate).
- **Agent Tools** (Fase 8): `app/clients/tools/structured/` — `WebSearch.js` (Fase 3), `ApplyPatch.js` (string-based patching, no deps), `BackgroundExec.js`, `MonitorProcess.js`.
- **runtimeHooks integration** (Fase 9): `AgentRuntime/runtimeHooks.js` — `onPreWriteScan` hook (SecurityScanner pre-write gate), PolicyEngine gate in `onToolExecute`, `getServices()` exposes PolicyEngine + SecurityScanner. Feature-flagged via `AGENT_RUNTIME_WIRED=true`.
- **Skills Discovery** (Fase 10): `SkillsDiscovery/` — sistema completo de descubrimiento, conversión e instalación de skills/plugins/MCP. Componentes:
  - `CuratedRegistry.js` + `curated-registry.json` — 16 proyectos permisivos verificados (MIT/Apache-2.0), separados por tipo (skills/plugin/mcp-registry/marketplace/library/harness/discovery/toolkit) y categoría (engineering/memory/ml-ai/full-stack/mcp/governance/dev-framework/agents-rag/agents/catalog/multi-domain/discovery/coding-agent). Blacklist de proyectos no permisivos con alternativas.
  - `DiscoveryProviders/` — 4 providers: `GitHubProvider` (repos con SKILL.md), `HuggingFaceProvider` (Spaces con agents=true), `MCPRegistryProvider` (registry.modelcontextprotocol.io + reference servers), `ARDProvider` (Agentic Resource Discovery, federado).
  - `SkillConverter/` — 6 adapters: `ClaudeSkillAdapter`, `CopilotAdapter`, `CodexAdapter`, `CursorAdapter`, `MCPToSkillAdapter`, `UniversalFormatter`. Convierte skills de Claude/Copilot/Codex/Cursor/MCP al formato universal SKILL.md (Agent Skills Open Standard). Parser YAML sin dependencias externas.
  - `SkillInstaller.js` — instala via `git clone`, `npm install`, `hf download`, `npx` + symlinks a `~/.claude/skills/` y `~/.codex/skills/` si existen. Lista y desinstala skills.
  - `AutoSkillMatcher.js` — IA conectada al LLM que analiza la tarea del usuario, recomienda skills, las busca en el CuratedRegistry, las instala y configura. Incluye `buildSkillSelectionPrompt`, `heuristicMatch` (fallback sin LLM), `parseSkillRecommendation`.
  - Route `/api/config/skills-registry` (GET: ver registry separado por tipo/categoría, POST search, POST install, DELETE uninstall, POST auto-match). Visible en Settings → Skills Registry.
  - `runtimeHooks.onRunStartSkillMatch` — hook que invoca AutoSkillMatcher al iniciar un run. Feature-flagged via `AGENT_RUNTIME_WIRED=true`.

### Conventions
- Tests: Jest, run from `api/` dir. Each service has `__tests__/<name>.spec.js`.
- Lint: ESLint (0 errors expected; `--fix` then re-check).
- tsc baseline: 33 preexisting type errors (unrelated to runtime services) — do not regress.
- No new external deps. tree-sitter installed but API incompatible; used lightweight regex parser instead.
- Each phase gated: impl + tests pass + lint clean + doc + commit before next phase.
- Services are standalone (not wired end-to-end to codingTools/routes yet) — consistent with F5-8 approach.

## ComfyUI Integration (image + video generation)

ComfyUI (MIT-licensed, open-source, uncensored) powers image and video generation. Connected via `/api/comfyui` route + structured agent tools.

### Architecture
- **Route** (`api/server/routes/comfyui.js`): REST proxy — `/health`, `/prompt`, `/history/:id`, `/view/:file` (public), `/video`, `/models`, `/loras`.
- **Service** (`api/server/services/ComfyUI/`): `ComfyUIService.js` (singleton, registered in `api/config/index.js` as `getComfyUI`), `WorkflowBuilder.js` (txt2img, img2img, txt2vid), `ComfyUIWebSocket.js`.
- **Docker** (`docker-compose.override.yml`): `comfyui` service (port 8188), volumes `comfyui-models`, `comfyui-output`.

### Agent tools (structured)
- **`image_generator`** (`structured/ImageGenerator.js`): ComfyUI txt2img, checkpoint `sd-v1-5-tiny` (low-RAM), markdown output.
- **`video_generator`** (`structured/VideoGenerator.js`): ComfyUI txt2vid (AnimateDiff/SVD), `SaveAnimatedWEBP`, 16 frames default.
- **`image_analyzer`** (`structured/ImageAnalyzer.js`): Vision LLM (MiniCPM-V/LLaVA via Ollama proxy) for OCR, description, object detection.

All three registered in `manifest.json`, `index.js`, `handleTools.js`, `ToolService.js` (localToolSchemas + toolDescriptions).

### Config
- `COMFYUI_URL` (default `http://comfyui:8188` in Docker) — ComfyUI server.
- `VISION_LLM_URL` (default Ollama proxy) — vision LLM endpoint.
- `VISION_LLM_MODEL` (default `minicpm-v`) — vision model for ImageAnalyzer.
- Models: download checkpoints to `/opt/comfyui/models/checkpoints` (e.g. `sd-v1-5-tiny.safetensors`).

## Agent Runtime Wiring (F5-F15)

All 10 agent-runtime services are wired into the chat execution flow via `api/server/services/AgentRuntime/runtimeHooks.js`. Feature flag: `AGENT_RUNTIME_WIRED=true` (set in `.env.example` + `docker-compose.override.yml`).

### Hooks (all non-intrusive — try/catch, no error propagation to chat)
- `onInitializeClient` — preloads project memory (F10)
- `onToolLoad` — merges coding tools (file/shell) into loaded tools
- `onToolExecute` — AgentFirewall gate before mutating tools (F9)
- `onToolEnd` — CodeIntelligence → BlastRadius → Verification → Repair → Memory (F5/F6/F7/F8/F10)
- `onRunStart` — starts observability trace (F13)
- `onRunEnd` — closes trace + feeds metrics to AdaptiveRouter + records session memory (F12/F13/F10)
- `onModelSelect` — consults AdaptiveRouter for model selection (F12)
- `onTraceStep` — records intermediate trace events (F13)

### REST routes (live, not gated)
- `/api/agent-runtime/*` — exposes F5-F15 services (CodeIntelligence, Verification, Repair, Security, Memory, Subagents, AdaptiveRouter, Observability, Evaluation, Optimization)

## FileStorage

Defaults to **local storage** (open-source, no cloud dependency). GCS and Azure stubs return clear `NOT_IMPLEMENTED` errors with setup instructions instead of crashing. To enable cloud: install `@google-cloud/storage` or `@azure/storage-blob` and implement the upload/download/delete/list methods.

## Harness Engine (F11-F15)

The HarnessEngine (`api/server/services/AgentRuntime/HarnessEngine.js`) turns the LLM into a production coding agent following the two-phase pattern (scaffolding + runtime harness) described in the OPENDEV paper (arxiv 2603.05344). Feature flag: `HARNESS_ENGINE_ENABLED=true`.

### Two phases
1. **Scaffolding** (before first prompt): SystemPromptBuilder builds the system prompt by layers (Persona → Scope → Tools → Constraints → References, Anthropic "Goldilocks altitude" + AGENTS.md injection), ToolRegistry resolves tools with lazy discovery (only surface tools the task needs, OPENDEV pattern), SubagentRegistry resolves subagents with filtered tool access (read-only explorers can't mutate).
2. **Harness** (runtime): InjectionPoints inject short reminders at the right moment (agent-harness pattern, prevents instruction fade-out), ReminderQueue manages prioritized/deduped reminders, CompactionManager runs a multi-layer cascade (compress tool outputs → sliding window → LLM summarization as last resort, JetBrains research), ConversationState treats history as a queryable event stream, StopConditions detect doom loops/repeated failures/no progress, ToolEnforcement normalizes tool output shape with separate renderings for UI vs model (RTK token-saving pattern), SandboxRunner runs shell commands in bubblewrap when available.

### Session management
- **Checkpoint**: persist session state to resume later (Codex session resume pattern).
- **GoalWorkflow**: register long-running multi-day goals (Codex `/goal`, Grok Build pattern).
- **WorktreeIsolation**: isolate each subagent in its own git worktree for parallel work (Grok Build 8-parallel pattern, Claude Code 2026-05).

### Hooks (all feature-flagged via `AGENT_RUNTIME_WIRED=true`)
- `onHarnessScaffold` — create/resume session + scaffold agent
- `onHarnessPreLLM` — inject reminders + compact context before LLM call
- `onHarnessPostTool` — normalize result + update state + observe for stop conditions
- `onHarnessShouldStop` — evaluate whether the loop should stop
- `onHarnessCheckpoint` — persist session state
- `onHarnessRunCommand` — run shell command through sandbox

### REST route
- `/api/harness/*` — scaffold, pre-llm, post-tool, should-stop, run-command, checkpoint, resume, checkpoints, goal, goals, worktree, status
- `/api/harness/rag/audit` — knowledge audit (has/missing lists, coverage %)
- `/api/harness/rag/dedup-check` — check for duplicates before indexing
- `/api/harness/rag/compress` — fast content-type-aware compression
- `/api/harness/rag/ingest-web` — search web → ingest into RAG
- `/api/harness/rag/auto-ingest` — audit + auto-search missing topics
- `/api/harness/diff/propose|approve|reject|apply|pending` — diff approval workflow
- `/api/harness/issue-to-pr` — GitHub issue → branch → implement → PR
- `/api/harness/computer-use/status|screenshot|click|type` — screen control

## RAG Enhancements (Knowledge Audit + Dedup + Compression + Web Pipeline)

### KnowledgeAuditEngine (`api/server/services/RAG/KnowledgeAuditEngine.js`)
Audits what knowledge the system has vs. what's missing for a task. Extracts topic keywords from the task, scans RAG collections + Memory layers, classifies each topic as has/missing using embedding similarity (or keyword fallback). Returns two lists: `has` (with score + source) and `missing` (with reason), plus a coverage %. Inspired by Ragas (Apache-2.0) context precision/recall and Corrective RAG.

### DedupEngine (`api/server/services/RAG/DedupEngine.js`)
Prevents duplicate knowledge from being indexed. Before indexing, checks similarity against existing docs using cosine similarity (threshold 0.92 default). Returns `skip` (duplicate), `merge` (near-duplicate), or `index` (new). Batch filter + duplicate finder for cleanup. Inspired by Maximem (2026) finding: one memory library had 10,134 entries, only 38 usable (99.6% junk).

### FastCompressor (`api/server/services/ContextIntelligence/FastCompressor.js`)
Maximum compression, efficient and fast for any LLM. 4 layers: structural dedup → content-type specific (code keeps structure, logs aggressive dedup, prose removes filler words) → token budget enforcement → delegate to Headroom (Apache-2.0) if installed. Target: 60-90% reduction, <50ms for 10KB. Content-type detection: code/json/log/markdown/prose.

### WebToRAGPipeline (`api/server/services/RAG/WebToRAGPipeline.js`)
Ingests web search results into RAG for permanent knowledge storage. Flow: SearchRuntime.search → extract content → DedupEngine.shouldIndex → FastCompressor.compress → RAGService.indexDocument (with source attribution). `autoIngestMissing`: audits knowledge, and if coverage <70%, auto-searches the web for missing topics and ingests them.

## Feature Parity (Issue→PR, Computer-Use, Diff Approval, Headless SDK)

### IssueToPRAutomation (`api/server/services/AgentRuntime/IssueToPRAutomation.js`)
Assigns a GitHub issue to the agent: parses issue URL/number, fetches via `gh` CLI, creates a branch, runs the harness, commits, pushes, opens a PR. Inspired by PR-Agent (Apache-2.0, 12.4K★) and GitHub Copilot cloud agent mode.

### ComputerUseBridge (`api/server/services/AgentRuntime/ComputerUseBridge.js`)
Screen-control capabilities: screenshot (OS-native: screencapture/scrot), click, type, key, scroll, getMousePos, getScreenSize. Uses optional `robotjs` (MIT) — if not installed, returns clear error instead of crashing. Inspired by Self-Operating Computer (MIT) and nuphus-mcp.

### DiffApprovalService (`api/server/services/AgentRuntime/DiffApprovalService.js`)
Proposes file changes as diffs, tracks approval state (pending → approved/rejected → applied) before writing to filesystem. Computes unified diffs. Mirrors Claude Code / Cursor / Copilot "approve before apply" UX.

### HeadlessSDK (`api/server/services/AgentRuntime/HeadlessSDK.js`)
Runs the harness headless (no UI) for CI/CD integration. CLI: `node headless.js "task" --model M --max-turns N --json`. Like Codex headless mode and Claude Code `--print`.
