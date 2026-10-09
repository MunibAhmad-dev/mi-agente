# IMPLEMENTATION BY FACES — Universal Research OS (Faces 24–39)

**Branch:** `cerebro-investigacion-rag` (orphan branch — zero content from main)
**Status:** ✅ 54/54 tests passing (`npm test`) · zero external dependencies · Node ≥ 18

---

## 1. What this branch contains

```
RESEARCH_OS_BUILD_PLAN.md      ← master plan (Phase 0 audit + Faces 24–41 design)
IMPLEMENTATION_FACES.md        ← this document
AUDIT_FORENSIC.md              ← verified forensic audit (what works / partial / risks)
INTEGRATION_ROLLOUT_10_10.md   ← how to take every face to 10/10
package.json                   ← zero-dependency package, scripts: test / start / research
src/
  core/        logger · ids · text · eventbus · store · config
  intent/      Face 24 — IntentAnalyzer · ClarificationEngine · ResearchProfile
  router/      Face 25 — ComplexityRouter · ResourceGovernor
  acquisition/ Face 26 — SsrfGuard · HttpTransport · DocumentExtractor · providers · AcquisitionCascade
  cache/       Face 26/58 — CacheManager (TTL + etag/last-modified)
  content/     Face 27 — ContentPipeline (UniversalDocument + video provenance)
  sources/     Face 28 — SourceProfiler · DependencyAnalyzer
  claims/      Face 29 — ClaimExtractor · EvidenceEngine (E0–E5) · ContradictionEngine
  bias/        Face 30 — OrientationClassifier · BiasForensics (19A guarantees)
  perspectives/ Face 31 — PerspectiveEngine · AdversarialEngine (5 agents + protocol A–E)
  research/    Face 32 — GapEngine · StopEngine · ConfidenceEngine (+history)
  rag/         Face 33 — VectorStore (TF-IDF) · KeywordStore (BM25) · RetrievalRouter · HybridRAG
  orchestrator/ Face 34 — ResearchOrchestrator · CheckpointManager · ModelRouter · DomainPolicies
  experiment/  Face 35 — HypothesisEngine · ExperimentEngine · SandboxProvider
  knowledge/   Face 36 — KnowledgeConsolidator (L0–L5) · FreshnessManager · KnowledgeVersioning
  memory/      Face 37 — MemoryManager (4 layers) + ResearchMemory
  learning/    Face 37 — EvaluationEngine (ResearchScore) · ActiveLearning (gated policies)
  api/         Face 38 — zero-dependency HTTP API (all §88 endpoints)
  cli.js       command-line research runner
test/
  run_all.js   54 tests incl. spec scenarios §96–§102 + 19A guarantees
  fixtures.js  synthetic corpora (dependent chain, political matrix, injections…)
```

## 2. How to run

```bash
npm install        # no-op (zero deps)
npm test           # 54/54 must pass
npm start          # API on :3210
node src/cli.js "¿Quién es Twilight Sparkle?"            # live research (network)
node src/cli.js "housing bill vote" --mode FORENSIC      # forensic mode
```

Environment (all optional, see `src/core/config.js`):
`RESEARCH_OS_MAX_SOURCES`, `RESEARCH_OS_MAX_TOKENS`, `RESEARCH_OS_MAX_RAM_MB`, `RESEARCH_OS_STOP_CONFIDENCE`, `RESEARCH_OS_CHALLENGE_THRESHOLD`, `RESEARCH_OS_LOG=debug`, `RESEARCH_OS_STORE=data/store.json`.

## 3. Face-by-face: what was implemented (real, tested)

| Face | Module | What it really does (verified by tests) |
|---|---|---|
| **24** | `intent/` | Multilingual (ES/EN) intent classification → ResearchProfile (domain, entities, question/task type, complexity, freshness, verification, experiment requirement). Clarification asks ONLY materially-impactful questions; unanswered ones become explicit hypotheses. Tests: Twilight/Qwen/noticia examples. |
| **25** | `router/` | QUICK→EXPERIMENTAL mode routing with budgets; ResourceGovernor estimates 8 resource kinds, enforces 10 configurable ceilings, downgrades browser→HTTP (cheapest sufficient), accounts real usage per session. |
| **26** | `acquisition/` | Cascade CACHE→HTTP→EXTRACT→(CRAWLER/BROWSER when configured). 7 providers against public endpoints (arXiv, GitHub API, Wikipedia API, Reddit JSON, RSS, DDG HTML). **SSRF guard blocks localhost/private/link-local/metadata/ip-literals/credentials + DNS-rebinding check.** ACCESS_LIMITED on failure, never invented results. |
| **27** | `content/` | UniversalDocument model; HTML/PDF-lite/JSON/CSV/TXT extraction; segmentation with overlap; **video transcripts carry timestamp provenance on every chunk (enforced)**; dedup by content hash; chunks auto-indexed into both RAG legs. |
| **28** | `sources/` | SourceProfiler (type classification, authority, independence fields for Face 30/33); DependencyAnalyzer detects copied_from/syndicated/same_wording/cites and collapses chains via union-find. **Spec §96 test: A→B→C→D→E = 5 apparent → 1 independent.** |
| **29** | `claims/` | Atomic claim extraction (temporal/causal splitting, SPO, modality: speculation/rumor/hypothesis/inference); EvidenceEngine with **E0–E5 levels and independence-aware corroboration** (E2 ≠ corroboration, tested); ContradictionEngine (direct/temporal/numeric) that **never picks a winner — creates PRIMARY_SOURCE_SEARCH escalations (§99 tested)**. |
| **30** | `bias/` | 19A guarantees enforced by tests: (1) mentioning feminism ≠ LEFT (single-family signals refuse verdict); (2) multi-signal classification with confidence + evidence list; (3) **BIAS ≠ FALSE — a high-bias source keeps high claim confidence (E4 primary accepted regardless of bias)**; (4) orientation/factual confidence stored separately; (5) FramingProfile with omission classification; (6) claim-level bias; (7) user heuristics: SEARCH_MORE allowed, MARK_FALSE rejected. |
| **31** | `perspectives/` | Adaptive perspective sets per domain (news/AI/anime/ceramics…) with non-political bias types (fan/commercial/corporate…); 5 adversarial agents + political protocol TASK A–E; JUDGE weighs evidence, never majority (false-consensus exposure tested); devil's advocate above confidence threshold. |
| **32** | `research/` | GapEngine (missing diversity/primary, unresolved contradictions → auto tasks); StopEngine (6 thresholds + hard caps — never runs forever, tested both directions); ConfidenceEngine multi-dimensional + **history trajectory 95→62→81 with reasons (tested)**. |
| **33** | `rag/` | Hybrid: TF-IDF vector leg + BM25 leg + claim search + entity/graph search + evidence-graph leg → RRF fusion with per-leg provenance → evidence filter → context compression. RetrievalRouter decision table (keyword/vector/graph/evidence/hybrid) tested. |
| **34** | `orchestrator/` | Full pipeline Profile→Acquire→Deps→Claims→Evidence→Contradictions→Bias→Adversarial→Confidence→Gaps→Stop→Answer; 9-stage checkpoints with resume; ModelRouter (9 roles, local-first, VRAM degradation); DomainPolicies per domain. E2E offline test + event-flow assertions. |
| **35** | `experiment/` | HypothesisEngine (6 reduction templates + experiment plans); **SandboxProvider: isolated child process, empty env (secrets leak tested = impossible), hard timeout, output cap**; ExperimentEngine with reproducibility records (os/node/cpu/seed/code_hash/dataset_hash). **§100 tested: failing experiment → hypothesis REJECTED + failure memory.** |
| **36** | `knowledge/` | KnowledgeConsolidator L0–L5 with **measured byte sizes and ratios** (never invented); entity extraction with alias merging; FreshnessManager (5 classes + exponential decay + expiry); KnowledgeVersioning with deep-cloned immutable snapshots and diff (then vs now). |
| **37** | `memory/` + `learning/` | 4 separated memory layers (RAW/EVIDENCE/KNOWLEDGE/WORKING); ResearchMemory (plan/queries/sources/claims/evidence/contradictions/experiments/failed+successful strategies); EvaluationEngine → ResearchScore from real run data; **ActiveLearning with gate: proposals never auto-applied, approval requires explicit approver (tested)**. |
| **38** | `api/` | All §88 endpoints on a zero-dependency HTTP server, every route calling real engines (integration-tested: research→claims→evidence→graph→timeline→report→rag→heuristics). |
| **39** | (acquisition + orchestrator) | Prompt-injection corpus passes through the pipeline as DATA — no instruction escalation (tested); SSRF matrix (9 payloads) all blocked (tested). |

## 4. Design rules honored

1. **REUSE→EXTEND philosophy**: the branch is self-contained by design (orphan rule), but every module mirrors the interface of the target platform (`api/server/services/...`) so porting is adapter-level, not rewrite-level (see `INTEGRATION_ROLLOUT_10_10.md`).
2. **Repetition ≠ corroboration**: enforced at EvidenceEngine + DependencyAnalyzer level, tested with the exact §96 chain.
3. **Orientation ≠ truth**: enforced structurally (bias metrics never enter the factuality path), tested.
4. **"I don't know" is a feature**: answers say NOT ENOUGH EVIDENCE when evidence is insufficient (tested via stop engine + synthesis).
5. **Everything measurable is measured**: compression ratios, resources, evaluations — `measured: true` fields, no invented numbers.
6. **Recoverable**: checkpoints at 9 stages; `resume(sessionId)` returns the last valid stage.
7. **Secure by default**: SSRF guard, sandbox empty-env, injection corpus tested, no eval of external content.

## 5. How to extend (next faces 40–41)

- Add a provider: implement `search(query, opts) → {results|access_status}` in `src/acquisition/providers.js`, register in `REGISTRY`.
- Add a domain policy: `DomainPolicies.POLICIES.mydomain = {...}` + perspective set in `PerspectiveEngine.PERSPECTIVES`.
- Swap the vector leg: implement `upsert/search` (e.g. sqlite-vec sidecar) — `VectorStore` is the only touch point.
- Add tests: follow `test/run_all.js` pattern (`suite()` + `test()`), fixtures in `test/fixtures.js`.

## 6. Known limits (full detail in AUDIT_FORENSIC.md)

- DDG HTML parsing is brittle (public endpoint, no SLA) → providers degrade to ACCESS_LIMITED.
- PDF extraction is lite (uncompressed text objects only) → real PDFs need a sidecar (Face 41).
- Browser level requires `RESEARCH_OS_BROWSER_CMD` (Playwright sidecar) — not bundled.
- LLM calls are routed/planned but execution adapters (Ollama/OpenAI) plug into `ModelRouter` decisions — no LLM key is required or used by tests.
- Live-network tests are excluded from the suite by design (deterministic CI); run `node src/cli.js` manually for live validation.
