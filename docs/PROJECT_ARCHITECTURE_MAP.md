# Project Architecture Map — Face 7

## Universal AI Agent OS — Feature Matrix

This document maps every Face (feature set) to its implementation status and file locations.

| Face | Name | Status | Key Files |
|------|------|--------|-----------|
| 4 | Cognitive OS | ✅ Active | `CognitiveBehavior/`, `Memory/MemoryFacade.js` |
| 7 | Universal AI OS | ✅ Active | `ExecutiveLoop/`, `HarnessEngine.js`, `CognitiveBehavior/` |
| 8 | Executive System | ✅ Active | `ExecutiveLoop/ExecutiveLoop.js`, `Director.js`, `DecisionLog.js` |
| 9 | Visual Intelligence | ⚡ Branch | `visual-intelligence` branch; Playwright + ScreenshotAnalyzer |
| 10 | Research/Learning | ⚡ Branch | `cerebro-investigacion-rag` — Python KG + 54 passing tests |
| 11 | Security | ✅ Active | `SimulationBeforeAction.js`, `PolicyEngine.js`, `ConstitutionEngine.js`, `EventSourcing.js` |
| 12 | Creative Engine | ⚡ Partial | `GenerativeAI/`, IQA scoring in `creative-ai-orchestrator` branch |
| 13 | IA y Modelos | ✅ Active | `UniversalLLMRouter.js`, `MultiModelJudge.js`, `ExecutiveBrain.js` |
| 14 | DeepSeek Harness | ✅ Flag-gated | Active when `DEEPSEEK_API_KEY` set |
| 15 | SkillHub | ✅ Active | `SkillHub/`, `SkillRegistry.js` |
| 16 | Self-learning | ⚡ Partial | `LearningEngine.js`, `LearningEvaluationGate.js` |
| 17 | Universal Agent | ✅ Active | `CognitiveBehavior/PersonalityLayer.js`, `ModePrompts.js` |
| 18 | Website Cloning | ⚡ Branch | `clonacion-y-creacion-de-paginas-web` branch — 9 specialized agents |
| 19 | Reputation | ⚡ Partial | `ReputationMonitor.js` |
| 20 | Social Marketing | ⚡ Branch | `social-marketing-intelligence` branch |
| 21 | Research OS | ⚡ Branch | `cerebro-investigacion-rag` — Python KG + MCP server |
| 22 | Creative 3D/Animation | ❌ Missing | Planned: IDEA→3D→ANIMATION→GAME pipeline |

## Active feature flags

```env
HARNESS_ENGINE_ENABLED=true   # Scaffolding + SafetyHarness active
AGENT_RUNTIME_WIRED=true      # ExecutiveLoop injection active
```

## Middleware chain (per request)

```
POST /api/agents/chat
  └─ restoreResumeContext
  └─ wireCognitiveBehavior       ← QU + AC + PersonalityLayer + ModePrompts
  └─ wireExecutiveLoop           ← 12-phase pipeline + executive brief injection
  └─ createMessageFilterPii
  └─ moderateText
  └─ checkAgentAccess
  └─ checkAgentResourceAccess
  └─ validateConvoAccess
  └─ buildEndpointOption
  └─ AgentController → LLM
```

## Data directories (runtime)

```
data/
  audit_trail.jsonl          ← EventSourcing append-only log
  decision_log.jsonl         ← DecisionLog per-decision records
  world_model.json           ← WorldModel snapshot
  long_horizon_plans/        ← LongHorizonExecution plan files
  memoria/
    episodic.json            ← MemoriaMulticapa episodic layer
    semantic.json            ← MemoriaMulticapa semantic layer
    procedural.json          ← MemoriaMulticapa procedural layer
```

## Branches with pending code

| Branch | Content | Integration path |
|--------|---------|-----------------|
| `cerebro-investigacion-rag` | Python KG + Research OS (54/54 tests) | Connect as MCP server |
| `creative-ai-orchestrator` | IQA scoring + ffmpeg pipeline | Cherry-pick to main |
| `clonacion-y-creacion-de-paginas-web` | 9 web-cloning agents | Adopt as Skills |
| `social-marketing-intelligence` | Real social connectors | Cherry-pick Connectors |
| `reduccion-de-tokens` | Advanced token management | Cherry-pick services |
