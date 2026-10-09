# INTEGRATION & ROLLOUT PLAN — From current state to 10/10, by faces

**Branch:** `cerebro-investigacion-rag` · **Prerequisite:** read `AUDIT_FORENSIC.md` (current verified state) and `IMPLEMENTATION_FACES.md` (what is built).

This document explains, **by faces**, how to install, configure, integrate and harden the Research OS until every subsystem is 10/10 — first as the standalone engine (this branch), then merged into the `mi-agente` platform (main) through adapters.

---

## PHASE A — Standalone engine (this branch) to 10/10

### A.1 Installation (already 10/10 — verified)
```bash
git clone -b cerebro-investigacion-rag https://github.com/proyectos-aoi/mi-agente.git
cd mi-agente
npm test        # 54/54 PASS — no dependencies, no API keys, no external services
npm start       # API on :3210
```
Requirements: Node ≥ 18. Nothing else. Zero-dependency rule stays until a dependency earns its place (measured, license-checked).

### A.2 Configuration (Face 25 config surface)
| Env var | Default | Purpose |
|---|---|---|
| `RESEARCH_OS_MAX_SOURCES` | 60 | source ceiling per session |
| `RESEARCH_OS_MAX_TOKENS` | 400k | LLM budget ceiling |
| `RESEARCH_OS_MAX_RAM_MB` / `MAX_VRAM_MB` | 4096 / 8192 | governor ceilings |
| `RESEARCH_OS_STOP_CONFIDENCE` | 0.75 | stop threshold |
| `RESEARCH_OS_CHALLENGE_THRESHOLD` | 0.8 | devil's advocate trigger |
| `RESEARCH_OS_BROWSER_CMD` | unset | enables browser cascade level |
| `RESEARCH_OS_MODEL_*` (planner/extractor/…) | local-first | per-role model override |
| `RESEARCH_OS_STORE` | data/store.json | persistence file (Mongo adapter later) |

### A.3 Face 40 — Real execution layer (the biggest gap, P1)
**Goal:** from "routing decisions" to real model calls and robust live acquisition.

1. **OllamaAdapter** (`src/llm/OllamaAdapter.js`): `chat(role, messages, opts)` honoring `ModelRouter` decisions (`RESEARCH_OS_MODEL_*`), streaming off, timeout + 2 retries with backoff. Interface identical to future OpenAI/Anthropic adapters.
2. **LLM-backed engines behind existing interfaces** (heuristic stays as fallback, selected by config `RESEARCH_OS_USE_LLM=1`):
   - `IntentAnalyzer` → LLM classification with JSON-schema output, same ResearchProfile shape.
   - `OrientationClassifier` → few-shot classification; heuristic result kept as prior; confidence = min(both).
   - `ContradictionEngine` → NLI pair classification for contextual/definition types.
   - `EvidenceEngine.relevance` → embedding cosine (nomic-embed-text via Ollama) into `VectorStore` (interface ready).
3. **Provider hardening**: retry/backoff, per-host rate limit, provider health metrics (`success_rate` per provider in `research_memory`), add Brave Search API + Wikipedia opensearch + Crossref as robust anchors.
4. **Acceptance (DoD):** live CLI research on 10 real questions returns ≥3 sources with ≥1 independent for 8/10; all 54 tests still green; LLM path and heuristic path both pass.

### A.4 Face 41 — Orchestrator maturity (P2)
1. **Multi-round loop:** round N+1 consumes `GapEngine` tasks + `AdversarialEngine` PENDING tasks (CHALLENGER/SKEPTIC searches actually executed, tasks completed via `complete()`); StopEngine decides each round.
2. **True resume:** `resume(sessionId)` re-executes from `latestValid.stage` (skip completed stages, reload state blobs).
3. **Media sidecars (optional containers):** `yt-dlp` + faster-whisper (video ingestion to real transcripts), `poppler`/pdf-parse (real PDFs), Playwright sidecar behind `RESEARCH_OS_BROWSER_CMD`.
4. **Wiki auditor engine (§97):** claim → wiki citation → fetch cited source → verify meaning (NLI) → mismatch reduces confidence; revision-history signals.
5. **Acceptance:** interruption test kills the process mid-round; restart continues from checkpoint and completes; §97 scenario test with a real wiki page.

### A.5 Face 42 — API hardening & security (P3)
1. Schema validation on every route (question length cap, enum checks, 400 on junk).
2. Bearer-token middleware (`RESEARCH_OS_API_TOKEN`), per-user session ownership field.
3. Sandbox network isolation (container/`--no-network`), artifact size quota.
4. Structured logs → OTel exporter (align with platform's `otel/`), metrics counters per face.
5. **Acceptance:** injection corpus + SSRF matrix + auth tests all green; OTel traces visible.

### A.6 Face 43 — Dashboard (P4)
Minimal UI (can reuse the platform's ActivityPanel pattern): Research list → session detail with timeline, claims (status+confidence), evidence graph, dependency summary, "WHY SHOULD I BELIEVE THIS?" panel, resource report. Data exclusively from the §88 API — no fake data.

### A.7 Face 44 — Benchmark & self-improvement (P5)
1. `benchmark/` harness: 30-question suite (QA, fact-check, research, compression) → JSON report with measured numbers.
2. ActiveLearning policies evaluated monthly; approved policies update source ranking/query strategy via `activePolicies()` (gate already enforced).
3. Comparison suite vs other systems on reproducible tasks (accuracy/depth/diversity/citations/time/tokens/cost).

---

## PHASE B — Integration into the mi-agente platform (main)

The branch stays the source of truth; integration happens as **adapters + a new service tree**, honoring the absolute rule (nothing from other branches is copied into this branch — the merge direction is the reverse: this engine is mounted into main via PR).

### B.1 Mount point
```
api/server/services/ResearchOS/     ← copy of src/ (same tree, license headers)
api/server/routes/researchOS.js     ← adapter to platform route registry (FASE 49 pattern)
client/src/components/Chat/ActivityPanel/…Research…  ← dashboard tab (Face 43)
```

### B.2 Adapter replacements (REUSE the platform, REPLACE only the store/LLM seams)
| Engine seam | This branch | Platform adapter |
|---|---|---|
| `core/store` | JSON file | Mongo (`api/db`) collections — same async interface, no engine change |
| `core/eventbus` | in-process | platform EventBus + events table |
| `ModelRouter` decisions | OllamaAdapter | platform `LLMGateway`/`llmRouter` (Face 17) |
| `providers.webSearch` | DDG HTML | platform `SearchRuntime` (DDG→Bing→Brave) first, local providers as fallback |
| `VectorStore`/`KeywordStore` | TF-IDF/BM25 | `RAGService` (Redis) + Meilisearch — only if benchmarks favor them |
| Sandbox | child process | platform `SandboxManager` |
| Auth | token middleware | platform JWT middleware |

### B.3 Sequence (PRs, each with tests)
1. **PR-A:** mount engine + `/api/research-os/*` routes behind JWT; Mongo store adapter; platform search adapter. Tests: platform jest suite + this branch's 54 tests.
2. **PR-B:** Face 41/42 hardening merged; ActivityPanel tab; resource report wired to platform `MetricsCollector`.
3. **PR-C:** media sidecars in docker-compose (profiles: `research-media`), wiki auditor, benchmark report in docs.

### B.4 Security gates before merge
- `.env` untracked on main + keys rotated (**pre-existing critical finding**).
- SSRF guard kept on ALL outbound fetches (platform-wide, not only research).
- Rate limits on research endpoints; session quota per user (governor ceilings per user, not global).

---

## PRIORITY ORDER (one line each)

1. Face 40 LLM+provider reality (P1, Crítico→Alto)
2. Face 41 multi-round + true resume + wiki auditor (P2)
3. Face 42 API validation/auth/OTel (P3)
4. Face 43 dashboard (P4)
5. Face 44 benchmark + active learning on real data (P5)
6. Platform integration PRs A→C (parallel track after Face 40)

**Definition of 10/10 (unchanged from the plan):** implemented + integrated + tested + documented + observable + recoverable + secure — with real measurements, no mocks presented as done.
