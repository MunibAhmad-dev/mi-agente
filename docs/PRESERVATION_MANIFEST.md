# Preservation Manifest — Face 7

This document records what has been preserved, improved, and extended from the LibreChat v0.8.7 base.

## PRESERVED — Unchanged LibreChat core

The following LibreChat core systems are untouched. All changes are additive, not modifying any existing LibreChat functionality:

| System | Location | Status |
|--------|----------|--------|
| Authentication (JWT + OAuth) | `api/server/routes/auth/` | ✅ Preserved |
| Conversation management | `api/server/routes/conversations/` | ✅ Preserved |
| Message storage (MongoDB) | `api/models/` | ✅ Preserved |
| File uploads | `api/server/routes/files/` | ✅ Preserved |
| Plugin system | `api/server/routes/plugins/` | ✅ Preserved |
| LLM endpoint routing | `api/server/routes/endpoints/` | ✅ Preserved |
| LibreChat frontend | `client/` | ✅ Preserved |
| LibreChat config schema | `librechat.yaml` | ✅ Preserved |
| All existing API routes | `api/server/routes/` | ✅ Preserved |

## IMPROVED — Enhanced LibreChat systems

| System | Improvement | Impact |
|--------|-------------|--------|
| Agent chat endpoint | Added `wireCognitiveBehavior` + `wireExecutiveLoop` middleware | All agent chats now get intent classification + executive analysis |
| System prompt | Constitution loaded from DB before each HarnessEngine session | Consistent policy enforcement |
| Response quality | Learning gate scores each response vs. answer contract | Continuous quality improvement loop |

## EXTENDED — New capabilities

All new capabilities are:
1. **Feature-flagged** — `HARNESS_ENGINE_ENABLED` + `AGENT_RUNTIME_WIRED` — off by default
2. **Non-breaking** — every new middleware/service wraps in try/catch and never blocks the request
3. **Additive** — new files only; zero modifications to LibreChat core files

| Extension | Files | Description |
|-----------|-------|-------------|
| Executive System | `api/server/services/ExecutiveLoop/` | 12-phase cognitive pipeline |
| Harness Engine | `api/server/services/AgentRuntime/` | Scaffolding + safety harness |
| Memory System | `api/server/services/Memory/`, `services/Harness/cognitive/` | Three-layer + world model |
| Cognitive Behavior | `api/server/services/CognitiveBehavior/` | Personality + mode prompts |
| Executive AI | `api/server/services/ExecutiveAI/` | Constitution engine |
| Safety | `api/server/services/Harness/cognitive/` | Simulation + policy + audit |
| Harness API | `api/server/routes/harness.js` | New routes — no conflict |

## Rollback procedure

To roll back all agent OS features without touching the LibreChat core:

```bash
# Disable all features — base LibreChat is restored immediately
HARNESS_ENGINE_ENABLED=false
AGENT_RUNTIME_WIRED=false
```

No database migrations are required. All feature data is stored in `data/` (JSON/JSONL files) which can be safely deleted.
