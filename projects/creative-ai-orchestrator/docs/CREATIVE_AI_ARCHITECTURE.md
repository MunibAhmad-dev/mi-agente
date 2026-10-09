# Creative AI Orchestrator (CAIO) - Architecture

## Overview

Universal system for discovery, installation, configuration, execution, evaluation, and autonomous improvement of AI creative tools.

**Status:** Phase 12 complete — typecheck passes, server starts, all core APIs functional.

## Architecture Diagram

```
                        USER
                           |
                           v
                    ┌─────────────┐
                    │ AI DIRECTOR │ (Creative Agent)
                    └──────┬──────┘
                           |
                           v
                ┌─────────────────────┐
                │ CREATIVE ORCHESTR.  │ (Event Bus + Memory)
                └──────────┬──────────┘
                           |
        ┌──────────────────┼──────────────────┐
        |                  |                  |
        v                  v                  v
    DISCOVERY           PLANNER            VISION
    (GitHub/HF/         (LLM              (Image
     Civitai/            Routing)          Analysis)
     ComfyUI)               |
        |                  v
        v             Capability
    Ranking            Graph
    License
    Compatibility
        |
        v
    RUNTIME MANAGER
        |
  ┌─────┼─────┐
  |           |
  v           v
ComfyUI    Future
Adapter    Runtimes
```

## Components Built

### Core Layer (`src/core/`)
- **Types** (`types/index.ts`) — Complete type system: 60+ interfaces, 10 enums
- **Database** (`database/index.ts`) — SQLite via sql.js, async factory, 13 tables, WAL mode
- **Events** (`events/index.ts`) — Pub/sub event bus with history, wildcard handlers
- **Config** (`config/index.ts`) — Environment + .env file loading
- **Errors** (`errors/index.ts`) — Classification engine, human-friendly messages, retry logic
- **Hardware** (`hardware/detector.ts`) — GPU, VRAM, RAM, CPU, CUDA, ROCm, disk detection
- **LLM** (`llm/provider.ts`) — OpenAI, Anthropic, Local (Ollama) providers with task routing

### Discovery Layer (`src/discovery/`)
- **GitHub** (`github/provider.ts`) — Repository search, license detection, scoring
- **HuggingFace** (`huggingface/provider.ts`) — Model/dataset search, LoRA, VAE
- **Civitai** (`civitai/provider.ts`) — Checkpoint/LoRA/resource search
- **Ranking** (`ranking/index.ts`) — Multi-dimensional scoring (license, maintenance, activity, quality, hardware fit, security)
- **License** (`license/engine.ts`) — SPDX detection, compatibility checking, risk assessment
- **Compatibility** (`compatibility/engine.ts`) — OS, GPU, VRAM, RAM, Python, CUDA checks

### Runtime Layer (`src/runtimes/`)
- **Manager** (`core/manager.ts`) — Runtime adapter lifecycle management
- **ComfyUI** (`comfyui/adapter.ts`) — Full adapter: detect, install, start, stop, execute, models, extensions, rollback
  - Communicates via HTTP API (process boundary)
  - No GPL code copied into the core
  - Workflow-to-prompt translation

### Project Layer (`src/projects/`, `src/workflows/`, `src/models/`)
- **Project Manager** — Create, import, export, clone, version
- **Workflow Engine** — Import (ComfyUI format), validate, clone, compare
- **Model Manager** — Register, search, deduplicate, track installation

### Agent Layer (`src/agents/`, `src/memory/`, `src/evaluation/`)
- **Creative Agent** — Intent → Plan → Discover → Select → Build → Execute → Evaluate → Learn
- **Memory System** — Short-term, project, long-term, experiment memory
- **Evaluation Engine** — Quality scoring, A/B comparison, plateau detection

### Vision Layer (`src/vision/`)
- **Vision Engine** — PNG/JPEG/WebP dimension parsing, quality metrics, improvement suggestions
- **Image comparison** — Before/after analysis

### Security Layer (`src/security/`)
- **Permissions Manager** — Manual/Assisted/Autonomous levels
- **Security Scanner** — Dangerous pattern detection (subprocess, eval, pickle, etc.)
- **Audit Trail** — Full event logging

### API Layer (`src/api/`)
- **HTTP API** — Express server with typed routes
- **WebSocket** — Real-time event broadcast
- **Routes:** /api/projects, /api/runtimes, /api/workflows, /api/models, /api/discovery, /api/vision, /api/agent, /api/health

## License Compliance

- **Core platform:** MIT
- **ComfyUI:** GPL-3.0 — used as SEPARATE process via HTTP API boundary
- **No GPL code copied** into the core codebase
- License engine tracks every dependency's license

## NOT IMPLEMENTED (Clearly Marked)

1. **VLM integration** — Requires external VLM provider
2. **Video analysis** — Requires ffprobe or opencv4nodejs
3. **Model download** — Requires HuggingFace Hub client integration
4. **GUI** — React frontend (Phase 13)
5. **Go binary** — Performance-critical components for future optimization
6. **RAG/Vector search** — LlamaIndex integration for long-term knowledge

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Database:** SQLite (sql.js — pure JavaScript)
- **HTTP:** Express
- **WebSocket:** ws
- **Storage:** Filesystem + SQLite
- **No native dependencies** required for core functionality

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | System info |
| GET | `/api/health` | Hardware + system health |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/models` | List models |
| POST | `/api/models` | Register model |
| GET | `/api/workflows` | List workflows |
| POST | `/api/workflows/import` | Import workflow |
| GET | `/api/discovery/github` | Search GitHub |
| GET | `/api/discovery/huggingface` | Search HuggingFace |
| GET | `/api/discovery/civitai` | Search Civitai |
| POST | `/api/vision/analyze` | Analyze image |
| POST | `/api/agent/process` | Creative agent |
