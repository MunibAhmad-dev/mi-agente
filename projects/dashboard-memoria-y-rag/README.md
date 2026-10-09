# 🧠 Brain — AI Memory, Knowledge Graph & RAG Platform

> A living, inspectable, explainable AI knowledge and memory system with hybrid search, knowledge graph, document ingestion, and MCP server.

## Features

- **🤖 AI Learning** — Conversations, patterns, and interaction memories
- **📚 Knowledge RAM** — Documents, facts, and ingested content
- **🔍 Hybrid Search** — Vector (pgvector HNSW) + Full-Text (tsvector GIN) + Reciprocal Rank Fusion
- **🕸️ Knowledge Graph** — Entity extraction (spaCy NER), relationships, visualization
- **📄 Document Ingestion** — Text processing with automatic chunking, embedding, and entity extraction
- **💬 RAG Chat** — Retrieval-Augmented Generation with context assembly
- **🔌 MCP Server** — Model Context Protocol server (SSE transport) with 10 tools
- **🌐 Bilingual Dashboard** — Interactive HTML dashboard with EN/ES language selector
- **🔐 Security** — Token auth, rate limiting, request-ID middleware
- **📊 Memory Lifecycle** — States, spaces, deduplication, soft-delete

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Dashboard      │────>│   FastAPI         │────>│ PostgreSQL  │
│   (HTML/JS)      │     │   (port 8000)     │     │ pgvector    │
│   EN/ES i18n     │     │   ONNX/torch      │     │ (port 5432) │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
┌─────────────────┐     ┌──────┴──────────┐
│   MCP Server     │────>│  Embedding       │
│   (SSE :3001)    │     │  Service         │
│   10 tools       │     │  (ONNX-first)    │
└─────────────────┘     └─────────────────┘
```

## Quick Start

```bash
# Clone the repo
git clone -b brain-dashboard-memoria-y-rag https://github.com/proyectos-aoi/mi-agente.git
cd mi-agente/brain

# Start all services
docker compose up -d

# Open dashboard
open http://localhost:8000/dashboard
```

## Services

| Service | Port | RAM | Description |
|---------|------|-----|-------------|
| **API** | 8000 | ~67 MB | FastAPI server + embeddings |
| **MCP** | 3001 | ~51 MB | Model Context Protocol server |
| **PostgreSQL** | 5432 | ~23 MB | pgvector database |
| **Total** | - | **~141 MB** | All services combined |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check + backend info |
| `POST` | `/api/memory` | Create memory (AI Learning or Knowledge RAM) |
| `GET` | `/api/memory` | List memories (filter by space, category, state) |
| `GET` | `/api/memory/stats` | Memory statistics |
| `POST` | `/api/search` | Hybrid vector + FTS search |
| `POST` | `/api/chat` | RAG chat with context |
| `POST` | `/api/documents/ingest/text` | Ingest text (auto-chunk + embed + extract) |
| `GET` | `/api/graph/entities` | List knowledge graph entities |
| `GET` | `/api/graph/visualize` | Graph visualization data |
| `GET` | `/api/knowledge/provenance/:id` | Trace memory source |

## Memory Spaces

- **`ai_learning`** — Patterns, conversation memories, learned behaviors
- **`knowledge_ram`** — Documents, facts, ingested knowledge
- **`default`** — General-purpose memories

## MCP Tools

| Tool | Description |
|------|-------------|
| `recall` | Search memories with hybrid search |
| `remember` | Store a new memory |
| `forget` | Soft-delete a memory |
| `search_graph` | Query the knowledge graph |
| `ingest_text` | Ingest text (chunk + embed + extract) |
| `get_relationships` | Get entity relationships |
| `provenance` | Trace memory source |
| `memory_status` | Memory statistics |
| `graph_stats` | Knowledge graph statistics |
| `move_memory` | Move memory between spaces |

## Dashboard Features

- **📊 Dashboard** — Overview with stats for AI Learning and Knowledge RAM
- **🤖 AI Learning** — View and manage conversation/pattern memories
- **📚 Knowledge RAM** — View and manage document/fact memories
- **🕸️ Knowledge Graph** — Interactive force-directed graph visualization
- **🔍 Search** — Hybrid search with scoring and latency info
- **📥 Ingest** — Ingest text into AI Learning or Knowledge RAM space
- **💬 Chat** — RAG-powered chat with source citations
- **🌐 Language** — Toggle between English (EN) and Spanish (ES)

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://brain:brain@postgres:5432/brain` | PostgreSQL connection |
| `EMBEDDING_DEVICE` | `cpu` | Device for embeddings |
| `EMBEDDING_BATCH_SIZE` | `16` | Batch size for embedding generation |
| `LOG_LEVEL` | `WARNING` | Log level |
| `MCP_PORT` | `3001` | MCP server port |

## Tech Stack

- **Python 3.12** — Core runtime
- **FastAPI** — HTTP framework
- **ONNX Runtime** — Embedding inference (fallback: PyTorch)
- **pgvector** — Vector similarity search
- **spaCy** — Named entity recognition
- **MCP SDK v2** — Model Context Protocol
- **Docker Compose** — Container orchestration

## License

MIT License
