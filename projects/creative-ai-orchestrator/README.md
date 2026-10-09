# Creative AI Orchestrator (CAIO)

**Universal system for discovery, installation, configuration, execution, evaluation, and autonomous improvement of AI creative tools.**

## What It Does

CAIO is an AI operating layer that can:
1. **Understand** your creative intent from natural language
2. **Discover** solutions across GitHub, HuggingFace, Civitai, ComfyUI
3. **Evaluate** licenses, compatibility, security, quality
4. **Install** runtimes and dependencies automatically
5. **Build** workflows from templates or discovery results
6. **Execute** workflows via ComfyUI (first supported runtime)
7. **Analyze** outputs with vision engine and quality scoring
8. **Improve** through autonomous experimentation
9. **Learn** from results and user feedback

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or with auto-reload for development
npm run dev
```

The server starts at `http://127.0.0.1:3456`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | System info |
| GET | `/api/health` | Hardware detection + system health |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/models` | List registered models |
| POST | `/api/models` | Register a model |
| GET | `/api/workflows` | List workflows |
| POST | `/api/workflows/import` | Import workflow (JSON) |
| POST | `/api/workflows/:id/validate` | Validate workflow |
| GET | `/api/discovery/github?q=...` | Search GitHub |
| GET | `/api/discovery/huggingface?q=...` | Search HuggingFace |
| GET | `/api/discovery/civitai?q=...` | Search Civitai |
| POST | `/api/agent/process` | Creative agent (natural language) |
| POST | `/api/vision/analyze` | Analyze image quality |
| POST | `/api/experiments/:id/grid` | Run experiment grid search |
| WebSocket | `/` | Real-time events |

## Example: Creative Agent

```bash
curl -X POST http://127.0.0.1:3456/api/agent/process \
  -H "Content-Type: application/json" \
  -d '{"intent": "I want to create a professional product photo with studio lighting"}'
```

## Architecture

```
User Intent → Creative Agent → Discovery → Selection → Installation →
Workflow Building → Execution → Vision Analysis → Evaluation → Improvement
```

See [docs/CREATIVE_AI_ARCHITECTURE.md](docs/CREATIVE_AI_ARCHITECTURE.md) for full details.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Database:** SQLite (sql.js — pure JavaScript, zero native deps)
- **HTTP:** Express + WebSocket
- **License:** MIT

## Configuration

Copy `.env.example` to `.env` and configure:

```env
PORT=3456
OPENAI_API_KEY=your-key       # Optional: for LLM agent
GITHUB_TOKEN=your-token       # Optional: for GitHub discovery
HUGGINGFACE_TOKEN=your-token  # Optional: for HuggingFace discovery
```

## Project Structure

```
src/
├── core/           # Types, database, events, config, errors, hardware, LLM
├── discovery/      # GitHub, HuggingFace, Civitai providers, ranking, licenses
├── runtimes/       # Runtime manager + ComfyUI adapter
├── agents/         # Creative agent + repair agent
├── workflows/      # Workflow engine
├── models/         # Model manager
├── projects/       # Project manager
├── experiments/    # Experiment engine
├── vision/         # Image/video analysis
├── evaluation/     # Quality scoring, A/B comparison
├── memory/         # Short-term, project, long-term memory
├── security/       # Permissions, scanner, audit
└── api/            # HTTP + WebSocket server
```

## License

MIT — see [LICENSE](LICENSE) for details.

ComfyUI is used as a separate process (GPL-3.0) via HTTP API boundary. No GPL code is included in this codebase.
