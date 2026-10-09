# Mi Agente — Autonomous AI Agent OS

<p align="center">
  <strong>An AI agent that actually runs on your computer.<br>
  Takes screenshots. Creates files. Browses the web. Opens apps. Generates images.<br>
  No simulations. Real tools. Real results.</strong>
</p>

<p align="center">
  <a href="#-what-it-does">What it does</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-agent-tools">Agent Tools</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-projects">Projects</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-green.svg" alt="Node 18+" />
  <img src="https://img.shields.io/badge/self--hosted-yes-brightgreen.svg" alt="Self Hosted" />
  <img src="https://img.shields.io/badge/open--source-100%25-orange.svg" alt="Open Source" />
</p>

---

## What it does

Mi Agente transforms [LibreChat](https://github.com/danny-avila/LibreChat) into a fully autonomous AI coding agent with real desktop capabilities:

| Capability | How |
|---|---|
| **Screenshot the desktop** | Takes real PNG screenshots of your screen |
| **Create files & folders** | Writes directly to your Desktop, Documents, or any path |
| **Copy images & binaries** | True binary copy — real PNG files, not placeholders |
| **Browse the web** | Opens real browser, searches Bing/Yahoo/DuckDuckGo |
| **Open applications** | Launches Explorer, Notepad, Chrome, etc. silently |
| **Generate images** | ComfyUI integration for txt2img and txt2vid |
| **Execute shell commands** | Background process manager with retry & priority queue |
| **Analyze images** | Vision LLM (MiniCPM-V/LLaVA) for OCR and description |

All agent operations run **silently in the background** — no CMD or PowerShell windows pop up.

---

## Architecture

Built on a **15-phase agent runtime** that goes well beyond a simple LLM wrapper:

```
User Message
     │
     ▼
┌─────────────────────────────────────────┐
│           HarnessEngine                 │  ← OPENDEV paper (arxiv 2603.05344)
│  Scaffolding → Injection → Compaction   │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│          Agent Runtime Hooks            │
│                                         │
│  F5  CodeIntelligence   symbol index    │
│  F7  Verification       lint/test/build │
│  F8  Repair             rewind/retry    │
│  F9  AgentFirewall      policy engine   │
│  F10 Memory             5-layer store   │
│  F11 SubAgents          6 roles         │
│  F12 AdaptiveRouter     latency/cost    │
│  F13 Observability      trace + replay  │
│  F14 Evaluation         benchmark 1-10  │
│  F15 Optimization       6 dimensions    │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│           Agent Tools                   │
│  BrowserTool  FilesystemOps  Computer   │
│  ImageGenerator  VideoGenerator         │
│  WebSearch  ApplyPatch  BackgroundExec  │
└─────────────────────────────────────────┘
```

---

## Agent Tools

### `computer_control`
Control the desktop from the agent:
- `screenshot` — capture the screen as PNG
- `open_app` — launch any application (silent, no window flash)
- `list_windows` — enumerate open windows
- `click`, `type_text`, `press_key`, `scroll` — full input control
- `clipboard_read` / `clipboard_write`
- `screen_size` — get resolution

### `filesystem_ops`
Real file system access:
- `read` — read text files
- `write` — create or overwrite files
- `copy` — true binary copy (handles PNG, images, any file)
- `list` — directory listing
- `create_dir`, `delete`, `exists`
- Paths: `Desktop/file.txt`, `~/Documents/`, or absolute

### `browser_use`
Real browser control via Playwright:
- `navigate` — open any URL
- `search` — multi-engine search (Bing → Yahoo → DuckDuckGo fallback)
- `extract` — get page text content
- Bot detection: automatically falls back to next engine

### `image_generator`
ComfyUI txt2img:
- Uses local ComfyUI server (no cloud API)
- Checkpoint: `sd-v1-5-tiny` (low-RAM default)
- Returns markdown with embedded image

### `video_generator`
ComfyUI txt2vid:
- AnimateDiff / SVD workflows
- 16 frames default, SaveAnimatedWEBP output

### `image_analyzer`
Vision LLM (Ollama):
- OCR, description, object detection
- Models: MiniCPM-V, LLaVA (configurable)

---

## Memory System (5 Layers)

```
SHORT      → current conversation context
SESSION    → within this agent session
PROJECT    → per-repository persistent knowledge
HISTORICAL → long-term cross-session memory
ARTIFACT   → generated files, outputs, results
```

Retrieval uses embedding similarity with keyword fallback.

---

## Security Policy Engine

Agent Firewall with Cedar-based policy evaluation:

| Preset | Allows |
|---|---|
| `restricted` | Read-only filesystem, no shell |
| `standard` | Read/write workspace, no deployment |
| `full` | All operations including git and deploy |

Policy enforcement runs before every mutating tool call.

---

## Sub-Agents (6 Roles)

Each sub-agent has its own context and filtered tool access:

| Role | Tools | Purpose |
|---|---|---|
| Explorer | read-only | Codebase mapping |
| Researcher | browser | Web research |
| Coder | filesystem + shell | Implementation |
| Tester | test runner | Verification |
| Reviewer | read-only | Code review |
| Security | scanner | Vulnerability audit |

---

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB
- Docker (optional, for ComfyUI)

### Install

```bash
git clone https://github.com/MunibAhmad-dev/mi-agente.git
cd mi-agente
cp .env.example .env
npm install
npm run backend
```

### Environment

```env
# Required
MONGO_URI=mongodb://localhost:27017/mi-agente
JWT_SECRET=your-secret-here

# Agent Runtime
AGENT_RUNTIME_WIRED=true
HARNESS_ENGINE_ENABLED=true

# ComfyUI (optional — for image/video generation)
COMFYUI_URL=http://localhost:8188

# Browser (optional — for browser_use tool)
BROWSER_HEADLESS=true

# Vision LLM (optional — for image_analyzer)
VISION_LLM_URL=http://localhost:11434
VISION_LLM_MODEL=minicpm-v
```

### Docker (full stack)

```bash
docker compose up -d
```

Includes: API, MongoDB, Meilisearch, pgvector, ComfyUI.

---

## Configuration

Feature flags in `.env`:

| Flag | Default | Effect |
|---|---|---|
| `AGENT_RUNTIME_WIRED` | `false` | Enable all 15 runtime phases |
| `HARNESS_ENGINE_ENABLED` | `false` | Enable HarnessEngine (OPENDEV pattern) |
| `BROWSER_HEADLESS` | `true` | `false` = visible browser window |
| `COMFYUI_URL` | — | Enable image/video generation |

---

## Projects

Included standalone projects built with the agent:

| Project | Language | Description |
|---|---|---|
| `reduccion-de-tokens` | Python | Token optimization pipeline with 60-90% compression |
| `cerebro-investigacion-rag` | JS | Deep research engine with hybrid RAG |
| `dashboard-memoria-y-rag` | Python | Memory + RAG dashboard with embeddings |
| `creative-ai-orchestrator` | TS/Go | ComfyUI orchestration with multi-runtime support |
| `ai-video-editor` | TS | AI video editor with 14 adapter engines |
| `ia-cripto` | Python | Evolutionary crypto trading agents |
| `clonacion-y-creacion-de-paginas-web` | JS | Multi-agent web page cloning |
| `judeojuegos-animacion-personajes-musica` | Python | Game/animation/character/music engine |

---

## REST API (Agent Runtime)

```
GET  /api/agent-runtime/code-intelligence
GET  /api/agent-runtime/memory
GET  /api/agent-runtime/observability
POST /api/agent-runtime/verification
POST /api/agent-runtime/security/check
GET  /api/harness/status
POST /api/harness/scaffold
POST /api/harness/issue-to-pr
GET  /api/harness/rag/audit
POST /api/harness/diff/propose
```

---

## License

MIT — free to use, modify, and distribute.

---

## Based On

- [LibreChat](https://github.com/danny-avila/LibreChat) — MIT
- [OPENDEV Paper](https://arxiv.org/abs/2603.05344) — HarnessEngine architecture
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) — MIT

---

<p align="center">
  Built by <a href="https://github.com/MunibAhmad-dev">Munib Ahmad</a>
</p>
