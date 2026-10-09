# UNIVERSAL RESEARCH OS — BUILD PLAN (Faces 24–38)

**Repo:** `proyectos-aoi/mi-agente` · **Branch:** `cerebro, investigacion, rag` · **Version:** 1.0 (Sept 2026)
**Methodology:** same as the existing project — build feature-by-feature ("Faces"), each Face ships implemented, integrated, tested, documented, observable, recoverable and secure. No mocks presented as done. Nothing is marked complete without a passing test and a real end-to-end run.

---

## 0. AUDIT OF THE CURRENT REPOSITORY (PHASE 0 — FACTS, NOT ASSUMPTIONS)

Audited from a fresh clone of `main` (commit `cd1f62a`, "feat: Phase D+F — Mongo persistence, Scheduler boot, FFmpeg, Faces 21-23, OTel, LLM cache").

### 0.1 What the project IS

A **heavily customized LibreChat fork** (v0.8.7) evolved into a personal AI-OS:

| Layer | Technology |
|---|---|
| Frontend | React/Vite client (`client/`), ActivityPanel with face tabs |
| API | Node/Express (`api/`) with ~90 route modules mounted via central registry |
| DB | MongoDB (Mongoose) + **Meilisearch** for keyword/semantic index |
| Vector store | Redis (custom `RAGService`, hash-based + nomic-embed-text 768d) or pgvector via `rag.yml` |
| LLM | Ollama/LM Studio local-first (`localProviders/`), adaptive LLM router (Face 17), Ollama Fast Proxy |
| Infra | Docker Compose, Redis, OTel tracing (`otel/`), Langfuse, `turbo` + npm workspaces + bun.lock |
| Runtime | ~180 services under `api/server/services/` |

### 0.2 Existing components we will REUSE (not rebuild)

**REUSE — full engines already working:**

| Component | Path | What it gives us |
|---|---|---|
| `SearchRuntime` | `api/server/services/SearchRuntime/SearchRuntime.js` | DuckDuckGo → Bing → Brave fallback chain, no API key, multi-provider search |
| `UniversalSearchService` | `api/server/services/UniversalSearch/` | FASE 34: multi-query search, source catalog with profiles, claim verification with corroborations/contradictions, local-LLM synthesis; verdicts `SINGLE_SOURCE`/`NO_EVIDENCE` when evidence is insufficient |
| `RAGService` | `api/server/services/RAG/RAGService.js` | Redis-persisted collections, embeddings (hashing + nomic 768d), cosine search, `enrichPrompt` |
| `DedupEngine` | `api/server/services/RAG/DedupEngine.js` | Semantic dedup for RAG docs |
| `KnowledgeAuditEngine` | `api/server/services/RAG/KnowledgeAuditEngine.js` | Knowledge auditing |
| `WebToRAGPipeline` | `api/server/services/RAG/WebToRAGPipeline.js` | Web → RAG ingestion |
| `IngestionPipeline` | `api/server/services/Ingestion/` | Face 21: file/URL/YouTube → chunk → RAG; background jobs |
| `FactChecker` | `api/server/services/Harness/cognitive/FactChecker.js` | Claim verification with verdicts |
| `EvidenceEngine` | `api/server/services/Harness/cognitive/evidence/EvidenceEngine.js` | Provenance, confidence, contradiction, knowledge decay |
| `KnowledgeEngine` + `KnowledgeGraph` | `api/server/services/Harness/cognitive/knowledge/` | Entities, relations, causal/temporal tracking |
| `AgentLoop`/`CognitiveEngine` | `api/server/services/Harness/cognitive/` | Orchestration loop, dependency-injected sub-engines |
| `EventBus` | `api/server/services/EventBus/index.js` | Internal pub/sub (extend with research events) |
| `SandboxManager` | `api/server/services/SandboxManager/` | Sandboxed execution (extend for experiments) |
| `CacheManager` | `api/server/services/CacheManager/` | TTL caching |
| `MetricsCollector`/`Observability`/`Telemetry` | `api/server/services/` | OTel metrics/traces per research run |
| JWT auth on harness routes | existing pattern | Security baseline for new routes |
| faster-whisper STT runtime | FASE 45 runtime | Local transcription for video/audio ingestion |
| Meilisearch | `api/package.json` dep | BM25/keyword leg of hybrid retrieval |

**PARTIAL — exists but incomplete for Research OS purposes (extend, don't replace):**

- `UniversalSearchService.sourceCatalog` — profiles exist but no *ideological orientation*, *bias metrics*, or *dependency graph*.
- `EvidenceEngine` — confidence/contradiction exist but no E0–E5 evidence levels, no source-dependency awareness, no claim-level bias.
- `FactChecker` — verdicts exist but no multi-round verification, no adversarial tasks, no primary-source escalation.
- `RAGService` — vector only; **no hybrid retrieval** (no BM25 leg despite Meilisearch being installed), no retrieval router, no claim/entity search.
- `IngestionPipeline` — 3 source types (file/URL/YouTube); needs RSS, GitHub, Reddit, wikis, PDF, archives + `UniversalDocument` model.
- `KnowledgeGraph` — in-memory only; no Mongo persistence, no versioning.
- `_jobs` Map in IngestionPipeline — in-memory, lost on restart; needs Mongo persistence (code comment admits this).
- `WebToRAGPipeline` — single fetch path; no HTTP→crawler→browser cascade.

**MOCKS / DEBT / SECURITY findings (fix during the faces, do not hide):**

- ⚠️ **`.env` with real secrets is tracked in git on `main`** (verified: `git ls-files` includes `.env`). Must be untracked in a *separate security fix on main* (not this branch) — documented here as a discovered limitation. Until then treat all repo history as exposed; **rotate any key present in `.env`**.
- Stray 0-byte file named `]*` at repo root (accidental commit).
- Multiple root-level audit/plan docs overlap and contradict each other; Research OS docs will live under `docs/research-os/` to avoid adding to the pile.
- `DISENO_ARQUITECTURA_V3_UNIVERSAL.md` (234k chars) already contains a universal-architecture vision — this plan supersedes it for research/RAG scope, reusing its valid concepts.
- LLM cache exists (Phase D+F); keep for research cost control.

### 0.3 Faces already shipped (1–23) — context only, NOT part of this branch

Faces 1–23 cover: constitution, learning, security/self-repair, LLM keys/router, harness, fine-tuning, website cloning, reputation, mass ingestion, creative engine. **The absolute rule of this branch: Faces 24+ only, zero content from main or other branches is copied into this branch's files; the branch will be created from an empty orphan root so it cannot inherit anything.**

---

## 1. OBJECTIVE

Convert the existing platform into a **Universal Research, Evidence, Knowledge & Experimentation OS** that can research any domain (AI, hardware, science, ceramics, anime, news, politics, products, video, forums, wikis…), and — core property — **know how much confidence each piece of information deserves and why**.

Non-negotiable principles (enforced in code and tests):

1. Never convert `source → fact`, `repetition → corroboration`, `orientation → truth`, `popularity → truth`, `inference → fact`, `hypothesis → conclusion`.
2. Evidence levels E0–E5 with **independence-aware corroboration** (dependency graph).
3. Bias/orientation is **context**, never truth. `BIAS ≠ FALSE`. Symmetrical skepticism across all orientations.
4. Every important conclusion is auditable: ANSWER → CLAIM → EVIDENCE → DOCUMENT → SOURCE → ORIGINAL SOURCE.
5. The system can say "I DON'T KNOW" and "NOT ENOUGH EVIDENCE".
6. Lite-weight-first: SQLite/Redis/Mongo embedded storage before heavy infra.

---

## 2. TARGET ARCHITECTURE (mapped onto the existing codebase)

```
USER QUESTION
   │
   ▼
IntentAnalyzer (Face 24) ──► ClarificationEngine (Face 25)
   │                                │
   ▼                                ▼
ResearchProfile ◄────────── ComplexityRouter + ResourceGovernor (Face 26)
   │
   ▼
ResearchOrchestrator (Face 27)  ── checkpoints (Face 30) ── events (EventBus)
   │
   ├─► Acquisition cascade (Face 28): cache → HTTP+trafilatura-style extractor → crawler → browser
   ├─► Providers: web / academic / social / community / video / GitHub / wikis (Face 28)
   │
   ▼
ContentPipeline (Face 29): normalize → segment → UniversalDocument → Mongo + RAGService
   │
   ▼
SourceProfiler (Face 31)          ClaimExtractor (Face 32)
   │ (orientation, bias,            │ (atomic claims, SPO+T, modality)
   │  reliability, independence)    │
   ▼                                ▼
DependencyAnalyzer (Face 33) ──► EvidenceGraph (Face 34)
   │ (copy/syndicate/cite chains)  │ (SUPPORTS/CONTRADICTS/QUALIFIES/UNKNOWN, E0-E5)
   ▼                                ▼
BiasForensics (Face 35) ──► MultiPerspective + Adversarial engines (Face 36)
   │ (orientation/bias metrics,     │ (SUPPORTER/CHALLENGER/SKEPTIC/SOURCE_AUDITOR/JUDGE)
   │  never truth-by-orientation)   │
   ▼                                ▼
GapEngine + StopEngine + ConfidenceEngine (Face 37)
   │
   ├──► HypothesisEngine + ExperimentEngine + Sandbox (Face 38)
   │
   ▼
HybridRAG (Face 39): router → vector+BM25+entity+claim+graph → rerank → compress → LLM
   │
   ▼
KnowledgeConsolidator + Memory layers (Face 40)
   │
   ▼
Synthesis → ResearchAnswer (Face 41) → ResearchMemory → ActiveLearning (Face 42)
```

**Independence of storage:** all new persistence goes to new Mongo collections (Section 6). Existing collections are read, never migrated destructively.

---

## 3. FACE-BY-FACE PLAN

Each Face has: **Goal / Reuses / New modules / Definition of Done (real tests, no fakes)**. Faces are ordered by dependency. A face is 10/10 only when DoD passes on a live run against real sources.

---

### FACE 24 — Intent & Profile Engine
**Goal:** classify any question into a typed `ResearchProfile`.
**Reuses:** `AgentLoop` conventions, `llmRouter` Face 17 router for cheap classification model.
**New:** `api/server/services/ResearchOS/Intent/IntentAnalyzer.js`, `ClarificationEngine.js`, `ResearchProfile.js`.
**Model:** `IntentProfile { id, question, domain, subdomain, entities[], question_type, task_type, complexity(0-1), freshness_requirement, verification_requirement, research_depth, experiment_requirement, source_types[], political_analysis(bool), budget, deadline, clarification_history[] }`.
**Clarification:** asks only when the answer would materially change the research (ambiguity score > threshold); always proceeds with explicit hypotheses if unanswered.
**DoD:** unit tests: "¿Quién es Twilight Sparkle?" → fiction/character/low; "¿Cómo reducir Qwen sin cuantizar?" → AI/model-optimization/high + experiment; "¿Es verdadera esta noticia?" → news/fact-check/freshness-critical. Ambiguous LLM customization question produces the 2 clarification questions; with no answer, proceeds with hypothesis logged.

### FACE 25 — Complexity Router & Resource Governor
**Goal:** route SIMPL→MODERATE→COMPLEX→DEEP→EXPERIMENTAL→FORENSIC with hard resource ceilings.
**Reuses:** `CacheManager`, `MetricsCollector`, LLM cache.
**New:** `ComplexityRouter.js` (configurable thresholds: e.g. SIMPLE 1–5 sources, MODERATE 10–30, COMPLEX multi-round, FORENSIC = dependency graph + primary + contradiction + adversarial), `ResourceGovernor.js` (estimates cpu/ram/vram/disk/tokens/network/runtime/cost; configurable MAX_* via env; CHEAPEST-SUFFICIENT-METHOD selection).
**DoD:** routing table tests; governor refuses a plan exceeding budget and downgrades it; estimates measured (not invented) on the 3 test questions.

### FACE 26 — Acquisition Cascade & Source Providers
**Goal:** cache → HTTP fetch → text extraction → crawler → browser, with provider adapters per source family.
**Reuses:** `SearchRuntime` (DDG/Bing/Brave), `WebToRAGPipeline`, `BrowserRuntime`, `IngestionPipeline` loaders, faster-whisper STT, `yt-dlp` optional dependency for public media.
**New:** `api/server/services/ResearchOS/Acquisition/`:
- `AcquisitionCascade.js` (escalation rules: browser only when JS/dynamic/interaction needed; record why each level was chosen)
- `DocumentExtractor.js` (HTML→readable text; PDF; TXT/MD/JSON/CSV)
- providers: `WebProvider`, `NewsProvider` (RSS), `AcademicProvider` (arXiv/CrossRef/open APIs), `GitHubProvider`, `RedditProvider` (public JSON), `WikiProvider` (incl. citation extraction), `ForumProvider`, `VideoProvider` (yt-dlp + whisper), `SocialProvider`, `ArchiveProvider` (web.archive.org)
- `AccessPolicy.js`: public/technically-permitted access only; never bypass auth/CAPTCHA/paywalls; on failure → `ACCESS_LIMITED` and continue.
**DoD:** cascade test proving HTTP is used for a static page and browser escalation logged with reason; one provider test per family against live endpoints (arXiv API, GitHub API, public RSS); ACCESS_LIMITED path test.

### FACE 27 — Universal Document Model & Content Pipeline
**Goal:** one document model for everything ingested.
**New:** `UniversalDocument` (Section 6.1) + `ContentPipeline.js`: RAW → NORMALIZE → EXTRACT → SEGMENT → METADATA → EMBED (via `RAGService`) → persisted to Mongo.
**Multimodal:** HTML, PDF, TXT, MD, JSON, CSV, images (OCR via VisionService FASE 31/35), video (transcript with timestamps), audio, social threads/comments.
**Video provenance:** every claim from video carries `video_id + timestamp + transcript_segment` (enforced in schema).
**DoD:** ingest one HTML, one PDF, one YouTube video (real network test, marked and skippable offline); timestamps present on all video-derived segments; content_hash dedup verified.

### FACE 28 — Source Profiler & Dependency Analyzer
**Goal:** every source profiled; every dependency mapped (kill false consensus).
**Reuses:** `UniversalSearchService.sourceCatalog` (extend, don't replace), `KnowledgeGraph` for graph storage.
**New:** `SourceProfiler.js` → `SourceProfile { source_id, publisher, author, type, authority, historical_accuracy, editorial_orientation{label,confidence,evidence[]}, bias{score,confidence,signals[]}, citation_quality, correction_history, originality, independence, ownership, funding, conflicts_of_interest, freshness }`. Orientation labels: left…right, libertarian, socialist, green, conservative, progressive, nationalist, religious, populist, mixed, unknown — **plus non-political bias types: commercial, corporate, fan, anti-fan, institutional, national, cultural, academic, community, methodological**.
`DependencyAnalyzer.js` detects: copied_from, derived_from, cites, quotes, same_original_source, same_image/video, same_wording (shingle + embedding similarity), syndication.
**Output:** apparent_sources vs independent_sources vs original_sources (e.g. 20 → 3 → 1).
**DoD:** dependency test chain A→B→C→D→E reports exactly 1 independent source (spec §96); profiler test on a known publisher returns orientation with confidence + evidence list, UNKNOWN allowed.

### FACE 29 — Claim Engine & Evidence Graph
**Goal:** atomic claims + typed evidence relations with levels.
**Reuses:** `EvidenceEngine` (extend), `FactChecker` (extend), `KnowledgeGraph`.
**New:** `ClaimExtractor.js` → `Claim { id, subject, predicate, object, time, location, modality, source_ids[], evidence_ids[], confidence, status, quote_span, doc_id, video_ts? }`; `EvidenceGraph.js` → relations SUPPORTS / CONTRADICTS / QUALIFIES / UNKNOWN; evidence levels **E0 unsupported, E1 single secondary, E2 dependent repetition, E3 independent corroboration, E4 primary, E5 direct/experimental**.
**ContradictionEngine:** direct / partial / temporal / contextual / definition-mismatch / source-disagreement — never auto-picks a winner; escalates to primary-source search.
**DoD:** extraction test on a mock article yields ≥3 atomic claims with correct SPO decomposition; E-level unit tests; contradiction test (A says 2024, B says 2025) → conflict + new research task, not a forced verdict (spec §99).

### FACE 30 — Bias Forensics Engine (spec 19A)
**Goal:** ideological & bias forensics that **never decides truth from orientation**.
**New:** `api/server/services/ResearchOS/Bias/`:
- `OrientationClassifier.js` — multi-signal (framing patterns, terminology, endorsements, topic selection, author/publisher history); returns `{orientation, confidence, evidence[]}`; refuses single-keyword classification (prohibited heuristics rejected by test).
- `ArticleBiasAnalyzer.js` — loaded/emotional language, sensationalism, source selection, citation quality, balance, counterargument presence; per-article, independent of publisher.
- `FramingAnalyzer.js` → `FramingProfile { emphasis, omissions, positive_framing, negative_framing, terminology, assumptions, counterarguments, emotional_intensity }`; omission classification: LIKELY_IRRELEVANT / POSSIBLY_RELEVANT / IMPORTANT_CONTEXT / CRITICAL_OMISSION / UNKNOWN.
- `ClaimBiasAnalyzer.js` — bias scored **per claim**, not per article.
- `SourceInformationProfile` builder — the 19A.22 profile with all metrics kept separately (never collapsed into one score).
**Hard guarantees (tested):** (1) classifier input with "feminism mentioned" alone does NOT output LEFT; (2) orientation never feeds the factuality path — code-level separation + test that a HIGH-bias source with strong evidence keeps high claim confidence; (3) symmetrical skepticism: identical pipeline for left/right/center sources.
**DoD:** all three guarantee tests + metrics-preservation test (orientation_confidence, bias_confidence, factual_confidence remain distinct fields).

### FACE 31 — Multi-Perspective & Adversarial Research
**Goal:** perspective sets per domain + adversarial agents.
**Reuses:** `MultiAgentController`/`SubAgents` for agent spawning; `SearchRuntime` for targeted queries.
**New:** `PerspectiveEngine.js` — adaptive perspective sets (news: local/international/left/center/right/government/opposition/academic/legal/primary; AI: paper/developer/manufacturer/benchmark/GitHub/community/critic/practitioner; anime: official/original/episode/database/wiki/fan/community; ceramics: academic/historical/museum/master/technical/community). Only relevant perspectives used.
`AdversarialEngine.js` — SUPPORTER (finds supporting evidence), CHALLENGER (contrary evidence), SKEPTIC (finds errors), SOURCE_AUDITOR (audits sources), JUDGE (synthesizes **by evidence**, never majority vote).
**Political adversarial protocol:** on contested political claims auto-spawn tasks: A support / B contradict / C primary / D independent / E independence-check of apparent consensus.
**Devil's advocate:** when confidence > 0.8 → CHALLENGE MODE: "what would prove us wrong?" + targeted search.
**DoD:** simulated contested claim produces ≥4 adversarial tasks and a judge verdict citing evidence ids; devil's-advocate trigger test.

### FACE 32 — Gap, Stop & Confidence Engines
**Goal:** know when to research more, when to stop, and how confident we are.
**New:** `GapEngine.js` (post-round: missing primary, missing sources, unresolved contradictions, unknown dates/authors, insufficient samples → auto new tasks), `StopEngine.js` (stop when evidence_sufficiency + independence + primary_evidence + contradiction_resolution + freshness + coverage exceed domain thresholds; never infinite), `ConfidenceEngine.js` (multi-dimensional: confidence, evidence_quality, source_quality, independence, primary_evidence, freshness, contradiction, bias_risk — **never a single opaque number**), `ConfidenceHistory.js` (95 → primary contradiction → 62 → new evidence → 81, with reasons and evidence refs).
**DoD:** stop-engine tests for premature-stop and run-away scenarios; confidence-history replay test; "why should I believe this" object schema test.

### FACE 33 — Hybrid RAG
**Goal:** hybrid retrieval + router + rerank + compression.
**Reuses:** `RAGService` (vector leg), **Meilisearch (already a dependency — keyword leg)**, `SemanticCompressor`, `QueryExpander`, `KnowledgeGraph` (entity/graph leg), `llmRouter` for reranker/extractor models.
**New:** `HybridRAG.js`, `RetrievalRouter.js` (exact fact→keyword; semantic→vector; entity-relation→graph; contested claim→evidence graph; spec lookup→keyword+primary; complex→hybrid), `ClaimSearch.js`, `EvidenceFilter.js` (drops E0 evidence from synthesis contexts), `ContextBuilder.js`.
**Compression:** LLMLingua evaluated with a benchmark BEFORE adoption (§47); ratios measured, never invented; if benchmark shows information-retention loss, record LIMITATION and keep `SemanticCompressor`.
**DoD:** retrieval-router decision table tests; hybrid query returns fused+reranked results with per-leg provenance; compression benchmark runs and writes measured numbers to docs (real dataset, no invented ratios).

### FACE 34 — Research Orchestrator (the core)
**Goal:** decide what/when/tool/model/amount/stop/verify/experiment.
**Reuses:** `AgentLoop` + `CognitiveEngine` patterns, `EventBus` (new events: ResearchStarted, SearchStarted, SourceFound, DocumentIngested, ClaimExtracted, EvidenceAdded, ContradictionDetected, HypothesisCreated, ExperimentStarted/Finished, ConfidenceUpdated, ResearchCompleted), `Scheduler` for background rounds, `CheckpointManager` (new) for resumability.
**New:** `ResearchOrchestrator.js` — rules + heuristics + confidence + budgets + history + domain policy (not rigid rules); `DomainPolicies.js` (news→primary+independent journalism; AI→papers+docs+GitHub+benchmarks; hardware→manufacturer+independent benchmarks; ceramics→academic+historical+practitioner; anime→original+official+episode+database+community; all configurable); `CheckpointManager.js` (RESEARCH_STARTED…ANSWER_GENERATED; resume from last valid checkpoint); `ResearchModes` QUICK/STANDARD/DEEP/FORENSIC/EXPERIMENTAL.
**Failure recovery:** survives LLM/browser/network/db/GPU/source/parser failures without losing the research (state persisted per checkpoint).
**DoD:** E2E: kill network mid-run → resume from checkpoint completes; E2E forensic mode on a test question produces full provenance chain; all 12 events emitted in order on a live run.

### FACE 35 — Hypothesis & Experiment Engine
**Goal:** research → hypothesis → experiment loop with sandbox and reproducibility.
**Reuses:** `SandboxManager` (extend with resource limits: cpu/ram/gpu/runtime), `HuggingFace` service for model assets.
**New:** `HypothesisEngine.js` → `Hypothesis { statement, assumptions[], supporting_evidence[], contradicting_evidence[], confidence, testability, predicted_outcome, experiment_plan }`; `ExperimentEngine.js` → experiment, environment, config, dataset, code, benchmark, metrics, artifacts, results; `FailureMemory.js` (rejected hypotheses + reasons → never repeat uselessly); parallel RESEARCH + EXPERIMENT tracks with evidence merge.
**Example baked as integration test:** "reduce Qwen without quantizing" → research pruning/distillation/low-rank/etc. → model audit → hypotheses H1..Hn → sandboxed micro-experiment plan (execution depends on host resources; plan+audit+failure-memory are testable without GPU).
**Security:** experiment runtime isolated; no secrets access by default (explicit opt-in).
**DoD:** hypothesis generation test from real research state; failure-memory rejection test (H17 layer-pruning → REJECTED stored); sandbox denies secret access (test).

### FACE 36 — Knowledge Consolidation, Memory & Versioning
**Goal:** documents → durable knowledge; layered memory; freshness.
**Reuses:** `KnowledgeEngine`, `DedupEngine`, `Memory` service, `RAGService` collections.
**New:** `KnowledgeConsolidator.js` (docs → entities/claims/facts/relations/summaries; semantic dedup; RAW never deleted), storage levels L0 RAW → L1 CLEAN → L2 DEDUP → L3 STRUCTURED → L4 KNOWLEDGE → L5 SUMMARY with **measured** sizes per run; `FreshnessManager.js` (STATIC/SLOW_CHANGING/DYNAMIC/VERY_DYNAMIC/BREAKING + expires_at); `KnowledgeVersioning.js` (what did we know then vs now; claim/source/knowledge versions); memory layers RAW/EVIDENCE/KNOWLEDGE/WORKING separated by Mongo collection.
**DoD:** consolidation on 100-doc synthetic dataset produces entity+claim+summary layers with measured compression table; freshness classification tests; version diff test (v1→v2 shows what changed).

### FACE 37 — Research Memory & Active Learning
**Goal:** learn what works.
**New:** `ResearchMemory.js` (question, plan, queries, sources, claims, evidence, contradictions, experiments, results, answer, evaluation, failed/successful strategies); `EvaluationEngine.js` (self-eval: factuality, citation accuracy/completeness, source quality, independence, coverage, contradiction handling, freshness, hallucination, reasoning quality → `ResearchScore`); `ActiveLearning.js` → `ResearchPolicy` updates (query generation, source ranking, model routing, retrieval, stopping, budgets). **No arbitrary self-modification of production code** — proposals go through propose→evaluate→test→benchmark→approval→deploy→rollback (enforced by a `PolicyManager` gate with test).
**DoD:** evaluation produces ResearchScore with all fields; policy proposal is stored, gated, and NOT auto-applied (test asserts gate blocks unapproved proposals).

### FACE 38 — API, Dashboard & Audit Views
**Goal:** expose the OS.
**Reuses:** route registry (`api/server/routes/index.js` FASE 49 pattern), JWT middleware pattern, ActivityPanel face tabs (add "Research" tab), existing dashboard scheduler wiring.
**New:** `api/server/routes/researchOS.js`:
```
POST /api/research-os/research            (create session, mode, budget)
GET  /api/research-os/research/:id
POST /api/research-os/research/:id/continue | /verify | /experiment
GET  /api/research-os/research/:id/sources | /claims | /evidence | /graph | /timeline | /report
POST /api/research-os/rag/query
GET  /api/research-os/knowledge | /compression/stats | /metrics/:id
```
Dashboard: Research, Sources, Claims, Evidence, Knowledge, RAG, Memory, Compression, Experiments, Hypotheses, Models, Resources, Logs, Security. Research Graph View; Source Explorer (from claim → source → original); "WHY SHOULD I BELIEVE THIS?" view; "WHAT COULD MAKE THIS WRONG?" view; Research Timeline; Resource Monitor (cpu/ram/vram/tokens/latency/cost per research).
**DoD:** every endpoint has an integration test against the real service (no fake data responses); UI renders live data from the API for a completed research session.

### FACE 39 — Security Hardening for Research
**Goal:** treat all external content as untrusted.
**Reuses:** `SecurityScanner`, `PolicyEngine`, `PermissionService`, JWT patterns.
**New:** `ContentFirewall.js` — prompt-injection scrubbing on every ingested document before LLM context; SSRF guard on all fetched URLs (private-range/IP-literal blocking, redirect validation); file-type sniffing beyond extension; size caps. A fetched page can never modify system prompt/credentials/permissions/tools/filesystem/env (enforced: documents enter the pipeline as data-only with strip-markup provenance blocks).
**DoD:** injection-payload corpus test (docs containing "ignore previous instructions" etc. never alter orchestrator behavior); SSRF matrix test (localhost/169.254.169.254/10.x/redirect-to-private blocked); PDF-malice smoke test.

### FACE 40 — Testing, Benchmark & Comparison Infrastructure
**Goal:** prove everything, continuously.
**Tests (jest, co-located, real — the repo already has jest config):** unit per engine; integration per face; E2E research runs; the mandated scenario tests: dependency chain (§96), Wikipedia citation-mismatch (§97), political matrix (§98 — no auto-selection by orientation), contradiction (§99), experiment failure (§100), recovery/interruption (§101).
**Wikipedia/Wiki auditor:** claim → citation → original → verify meaning → revision history/dispute signals; citation-mismatch reduces confidence (tested).
**Benchmark:** internal harness measuring QA, fact-checking, research depth, source diversity, citation correctness/completeness, contradiction detection, retrieval quality, compression (real measured numbers).
**Comparison infra:** reproducible task suite to compare against other systems with metrics accuracy/depth/diversity/citations/time/tokens/ram/vram/cost.
**DoD:** all scenario tests green; benchmark produces a JSON report committed under `docs/research-os/benchmarks/` with real measured values.

### FACE 41 — Documentation & Audit Mode
**New docs (under `docs/research-os/`):** `ARCHITECTURE.md`, `RESEARCH_ENGINE.md`, `RAG.md`, `EVIDENCE_ENGINE.md`, `SOURCE_ENGINE.md`, `BIAS_FORENSICS.md`, `EXPERIMENT_ENGINE.md`, `SECURITY.md`, `DATABASE.md`, `API.md`, `RESOURCE_MODEL.md`, `COMPRESSION.md`, `TESTING.md`, `OPERATIONS.md`.
**FORENSIC AUDIT MODE:** inspect why-answer/why-source/why-confidence/why-stopped/why-model/why-experiment for any session.
**DoD:** every face's doc exists and matches the implemented code (doc review against exports); audit-mode query test on a finished session.

---

## 4. IMPLEMENTATION ORDER (dependency graph)

```
F24 Intent ─► F25 Router/Governor ─► F26 Acquisition ─► F27 UniversalDocument
                                                              │
        ┌─────────────────────────────────────────────────────┘
        ▼
F28 Profiler+Dependency ─► F29 Claims+Evidence ─► F30 Bias Forensics ─► F31 Perspective+Adversarial
                                                              │
                     F32 Gap/Stop/Confidence ◄────────────────┘
                              │
              F33 Hybrid RAG ┤ F34 Orchestrator (uses F24-F33 + checkpoints)
                              │
              F35 Hypothesis/Experiment ─► F36 Consolidation ─► F37 Memory/ActiveLearning
                              │
              F38 API/Dashboard ─► F39 Security (parallel with F26+) ─► F40 Tests/Bench ─► F41 Docs
```

Practical sequencing for PRs on this branch:
1. **PR-1:** F24+F25 (foundations) · **PR-2:** F26+F27+F39 (acquisition + security from day one) · **PR-3:** F28+F29 · **PR-4:** F30+F31 · **PR-5:** F32+F34 · **PR-6:** F33 · **PR-7:** F35+F36 · **PR-8:** F37+F38 · **PR-9:** F40+F41.

---

## 5. SERVICE INTERFACES (all swappable, dependency-injected like `CognitiveEngine`)

Every module behind an interface; every provider replaceable via config:

```js
// acquisition
interface SearchProvider    { search(query, opts) → SearchResult[] }
interface BrowserProvider   { fetch(url, opts) → { html, screenshot?, reason } }
interface CrawlerProvider   { crawl(url, depth, limits) → FetchedPage[] }
interface DocumentExtractor { extract(raw, mime) → ExtractedDocument }
interface TranscriptionProvider { transcribe(audio) → TimedTranscript }
// analysis
interface SourceProfiler    { profile(source) → SourceProfile }
interface ClaimExtractor    { extract(document) → Claim[] }
interface EvidenceEngine    { relate(claim, evidence) → EvidenceRelation }
interface DependencyAnalyzer{ analyze(sources[]) → DependencyGraph }
interface BiasAnalyzer      { analyzeSource(s) → OrientationAndBias }  // context only
interface FactChecker       { check(claim) → Verdict }                 // evidence-based
// knowledge & retrieval
interface VectorStore  { upsert(chunks), search(v, k) }
interface KeywordStore { index(docs), search(q, k) }
interface RerankerProvider { rerank(query, docs) → ScoredDocs[] }
interface EmbeddingProvider { embed(texts) → Vec[][] }
interface RAGEngine    { retrieve(profile) → ContextBundle }
interface CompressionProvider { compress(ctx, opts) → { text, metrics } }
// higher-order
interface ResearchOrchestrator { run(ResearchProfile) → ResearchSession }
interface HypothesisEngine  { propose(state) → Hypothesis[] }
interface ExperimentEngine  { plan(h) → Experiment; run(e) → Result }
interface SandboxProvider   { exec(code, limits) → RunResult }
interface MemoryManager     { store(layer, item), recall(query, layer) }
interface CheckpointManager { save(session, stage), resume(sessionId) }
interface ResourceGovernor  { estimate(plan) → Estimate; admit(plan) → bool }
interface PolicyManager     { propose(policy) → Proposal; apply(proposal) → gated }
```

---

## 6. DATABASE (new MongoDB collections — additive, zero changes to existing)

```js
research_sessions   { _id, user, question, profile, mode, status, checkpoints[], budgets, report, timeline[], created/updated }
research_tasks      { _id, session_id, type, payload, status, attempts, result_ref, parent_task }
sources             { _id, session_id, canonical_url, type, fetched_via, access_status, fetched_at }
source_profiles     { source_id, publisher, orientation{label,confidence,evidence}, bias{...}, reliability, independence, ownership, freshness }
documents           { _id, canonical_url, source_id, title, content, language, published_at, fetched_at, extraction_method, content_hash, metadata, video{ id, ts, segment } }
document_chunks     { doc_id, idx, text, embedding_ref, claim_refs[] }
claims              { _id, session_id, subject, predicate, object, time, location, modality, source_ids[], quote_span, doc_id, video_ts, status, confidence }
evidence            { _id, claim_id, type(SUPPORTS|CONTRADICTS|QUALIFIES|UNKNOWN), level(E0..E5), doc_id, source_id, independent(bool), note }
evidence_relations  { claim_id, related_claim_id, relation, resolved_by }
source_relations    { from_source, to_source, relation(copied_from|cites|syndicated|same_original|same_media|same_wording), similarity }
entities            { _id, name, aliases[], type, first_seen }
entity_relations    { from, to, relation, evidence_ids[] }
experiments         { _id, session_id, hypothesis_id, env, config, dataset_hash, code_hash, seed, artifacts, result, status }
hypotheses          { _id, session_id, statement, assumptions[], confidence, testability, predicted_outcome, status(PROPOSED|TESTED|REJECTED|CONFIRMED) }
embeddings          { ref, vector, model, dim, namespace }   // mirrors RAGService namespaces
memories            { layer(RAW|EVIDENCE|KNOWLEDGE|WORKING), payload, refs[], created_at, expires_at }
knowledge           { _id, topic, statement, claim_ids[], evidence_summary, confidence, freshness_class, versions[] }
compression_runs    { _id, input_size, output_size, ratio, token_reduction, retention_metrics, dataset }
evaluation_runs     { _id, session_id, ResearchScore, notes }
checkpoints         { _id, session_id, stage, state_blob, created_at }
events              { _id, session_id, type, payload, at }     // replayable event log
research_policies   { _id, domain, strategy, stats, status(PROPOSED|EVALUATED|APPROVED|REJECTED) }
```

**Indexes:** `session_id`, `claim_id`, `source_id`, `doc_id`, `canonical_url` (unique-ish), `content_hash`, `type+at` on events, text index on `claims.subject/object`. Vector search continues to live in `RAGService`/Redis (already working) — **no pgvector/Neo4j until a measured need** (lightweight-first rule).

---

## 7. RESOURCE & COST MODEL

- Every session records the §111 report: sources searched, docs processed, claims extracted, tokens used, cpu time, RAM peak, VRAM peak, disk, network, experiments, runtime. Populated by `MetricsCollector` + `ResourceGovernor` (real measurements, exposed in dashboard).
- Model routing per task via Face 17 router: planner/search/extract/embed/rerank/research/verify/synthesis/experiment models may all differ; local Ollama first, remote fallback.
- LLM cache (existing) keyed by normalized prompt for extraction/verification calls.

---

## 8. SECURITY SUMMARY (full detail in FACE 39)

Untrusted-content firewall; SSRF guards; no credential exposure to sandboxes; JWT on all new routes; rate limits via existing `RateLimiter`; secrets never logged; **`.env`-in-git issue reported to main owners — not fixable from this branch by design.**

---

## 9. LIMITATIONS DISCOVERED DURING AUDIT (reported, not hidden)

| Limitation | Cause | Impact | Workaround |
|---|---|---|---|
| `.env` with secrets tracked in main's git history | historical commit | all keys in that file must be considered exposed | rotate keys; untrack `.env` in a main-side commit; add to `.gitignore` |
| In-memory job store in IngestionPipeline | MVP shortcut | jobs lost on restart | replaced by `research_tasks`/`checkpoints` collections in F34 |
| RAGService vector-only | no BM25 leg wired | weaker hybrid recall | Meilisearch already a dependency → keyword leg in F33 |
| No browser-automation engine in acquisition path | WebToRAGPipeline is fetch-only | JS-heavy sites unreachable | BrowserRuntime exists (Face 18 uses it) → wired as cascade level in F26 |
| yt-dlp/LLMLingua are Python | repo is Node | extra runtime needed | optional sidecar container; measured adoption only |
| Cannot verify legal status of scraping targets from code | external matter | some providers may be ACCESS_LIMITED | AccessPolicy + per-provider ToS notes |

---

## 10. TRACKING

- Face status board: `docs/research-os/STATUS.md` (created in PR-1, updated per PR).
- Each Face closes with: implemented + integrated + tested + documented + observable (events/metrics) + recoverable (checkpoints) + secure (firewall/JWT) — the §113 Definition of Done, enforced literally.

---

*This document is the single source of truth for the `cerebro, investigacion, rag` branch. Subsequent PRs implement Faces 24–41 in the order of §4 and update §10.*
