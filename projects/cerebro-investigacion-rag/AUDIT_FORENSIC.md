# FORENSIC AUDIT — Universal Research OS (branch `cerebro-investigacion-rag`)

**Date:** Sept 2026 · **Auditor:** Buffy (Codebuff) · **Method:** every claim below was verified by executing code (`npm test` = **54/54 PASS**) or by direct code inspection. Nothing is asserted as working "because it looks like it". Items that were NOT exercised live are explicitly marked.

**Scope audited:** commits `a401c41` (plan), `2541a42` (prompt maestro), `25734d2` (engine, 55 files / 5,664 lines).

---

## 1. WHAT IS WORKING 10/10 (verified by executing tests)

Each item lists the test(s) that prove it. Run `npm test` to reproduce.

| # | Capability | Proof (test name in `test/run_all.js`) |
|---|---|---|
| 1 | Multilingual intent classification (ES/EN) → domain, entities, question/task type, complexity, freshness, verification, experiment requirement | "Twilight Sparkle → fiction/character, low complexity" · "Qwen reduction → AI, experiment required" · "news verification → fact_check, freshness critical" |
| 2 | Adaptive clarification: asks only material questions; unanswered → explicit hypotheses | "clarification asks on ambiguous question… unanswered → explicit hypothesis" |
| 3 | Mode routing QUICK/STANDARD/DEEP/FORENSIC/EXPERIMENTAL with budgets | "routing table per complexity" |
| 4 | Resource governor: 8-kind estimates, 10 ceilings, browser→HTTP downgrade, real usage accounting | "governor admits normal plan, refuses over-ceiling plan" · "downgrades browser→http" · "estimates are produced for all kinds" |
| 5 | SSRF guard: blocks localhost/private/link-local/metadata/IP-literal/credential URLs (9-payload matrix) | "SSRF matrix blocks…" · "SSRF allows public domains" |
| 6 | Document extraction: HTML (script-stripping, title), JSON, PDF-lite, CSV | "document extractor: HTML, JSON, PDF-lite, CSV" |
| 7 | UniversalDocument pipeline: chunks, dedup by content hash, dual-leg indexing | "ingest HTML → doc + chunks" · "dedup by content_hash" |
| 8 | **Video timestamp provenance enforced on every chunk** | "video transcript carries timestamp provenance" |
| 9 | **Spec §96: dependency chain A→B→C→D→E collapses 5 apparent → exactly 1 independent source** (union-find over copies + citations) | "SPEC §96: chain A→B→C→D→E yields exactly 1 independent" |
| 10 | Source type classification (academic/github/video/wiki…) | "profiler classifies source types" |
| 11 | Atomic claims with temporal/causal splitting, SPO, modality (speculation/rumor/hypothesis/inference) | "atomic claims with SPO decomposition and modality" |
| 12 | **Evidence levels E0–E5 with independence-aware corroboration: dependent repetition = E2 (never counted as corroboration); own-primary-data witness = E3** | "E-levels: dependent repetition ≠ corroboration (E2 vs E3)" |
| 13 | Primary evidence → E4 → status TRUE | "primary evidence upgrades level to E4 and status TRUE" |
| 14 | **Spec §99: temporal contradiction (2024 vs 2025) detected, escalation task created, no forced verdict** | "SPEC §99: temporal contradiction detected…" |
| 15 | **19A.13 guarantee: mentioning feminism does NOT yield LEFT** (single-signal families refuse verdict) | "PROHIBITED heuristic: mentioning feminism does NOT yield LEFT" |
| 16 | Multi-signal orientation with confidence + evidence list (19A.1) | "multi-signal text yields orientation with confidence + evidence" |
| 17 | **BIAS ≠ FALSE: high-bias source keeps high claim confidence; E4 accepted regardless of bias; bias ≠ confidence (19A.11/19A.26)** | "BIAS ≠ FALSE: high-bias source keeps high claim confidence" |
| 18 | Orientation/factual confidence stored separately (19A.21) | "orientation and factual confidence stored separately" |
| 19 | FramingProfile: implicit assumptions, omission classification, counterargument detection | "framing profile: emphasis, omissions with classification" |
| 20 | User heuristics gate: SEARCH_MORE allowed, MARK_FALSE rejected (19A.24) | "user heuristic: SEARCH_MORE allowed, MARK_FALSE rejected" |
| 21 | Adaptive perspectives per domain incl. non-political bias types (fan/commercial) | "adaptive perspective sets per domain and mode" |
| 22 | Political adversarial protocol TASK A–E | "political claim spawns full adversarial protocol A-E" |
| 23 | JUDGE weighs evidence, never majority; false consensus exposed (20→1) | "JUDGE decides by evidence, false consensus exposed" |
| 24 | Devil's advocate above confidence threshold | "devil's advocate fires above threshold" |
| 25 | Stop engine: no premature stop; hard caps always apply; thresholds→stop | "stop engine: premature stop prevented…" · "thresholds exceeded → stop" |
| 26 | Confidence history trajectory 95→62→81 with reasons + evidence refs | "confidence history records the 95→62→81 trajectory" |
| 27 | Multi-dimensional confidence (never one number) | "dimensions keep metrics separate" |
| 28 | Retrieval router decision table (keyword/vector/graph/evidence/hybrid) | "retrieval router decision table" |
| 29 | **Hybrid RAG: BM25 + TF-IDF + claim + entity legs fused (RRF) with per-leg provenance** | "BM25 + TF-IDF legs both retrieve and fuse" |
| 30 | Contested claim pulls evidence-graph leg | "evidence filter: contested claim pulls evidence-graph leg" |
| 31 | Context compression keeps sentences under budget | "context compression shortens while keeping sentences" |
| 32 | **Orchestrator E2E: profile→acquire→deps→claims→evidence→bias→adversarial→answer with event flow** | "full pipeline…" |
| 33 | Checkpoints (9 stages) + resumability | "checkpoints saved through the pipeline and resumable" |
| 34 | Hypotheses from gaps with experiment plans; status PROPOSED (≠ conclusion) | "hypotheses generated for model-reduction questions" |
| 35 | **Spec §100: failing experiment → hypothesis REJECTED + failure memory** | "SPEC §100: failing experiment → hypothesis REJECTED" |
| 36 | **Sandbox: isolated process, code runs, secrets NOT visible (empty env), hard timeout** | "sandbox: code runs, secrets NOT exposed, timeout enforced" |
| 37 | Consolidation L0–L5 with measured byte ratios | "consolidation produces L0-L5 with measured, monotonic ratios" |
| 38 | Freshness classes + exponential decay + expiry | "freshness classes and decay" |
| 39 | Knowledge versioning: immutable snapshots, then-vs-now diff | "knowledge versioning diff: then vs now" |
| 40 | 4 memory layers separated; invalid layer rejected | "memory layers stay separated" |
| 41 | ResearchScore computed from real run data (measured) | "evaluation produces ResearchScore from real run data" |
| 42 | **Active-learning gate: proposals never auto-applied; approval requires approver** | "active learning: proposal stored, gate blocks unapproved application" |
| 43 | HTTP API end-to-end (research→claims→evidence→graph→timeline→report→rag→heuristics) | "API: research → claims → …" |
| 44 | Prompt-injection corpus passes as DATA, no instruction escalation | "injected documents never alter orchestrator behavior" |

## 2. WHAT IS PARTIAL (works, with stated limits)

| Item | Works | Limit |
|---|---|---|
| Web search provider (DDG HTML) | Yes, parses real results | Public endpoint, no SLA; markup changes break parsing → ACCESS_LIMITED (graceful, tested pattern) |
| PDF extraction | Uncompressed text objects + title | Compressed/complex PDFs need poppler/pdf-parse sidecar |
| Browser cascade level | Architecture + escalation reasons in place | Requires `RESEARCH_OS_BROWSER_CMD` (Playwright sidecar) — not bundled, not exercised live |
| Video ingestion | Transcript path with enforced timestamps | yt-dlp download + faster-whisper STT are sidecars (not bundled); OCR/visual evidence not implemented |
| Model router | Decisions with degradation tested | LLM execution adapters (Ollama/OpenAI/local HTTP) are plug-in points, not implemented |
| Wiki auditor | `wikiPage` extracts citation domains | Claim↔citation meaning verification (§97 full flow) not yet implemented as engine |
| Evidence relevance gate | Lexical (content-word Jaccard ≥ 0.08) | No embeddings yet → paraphrases may fall below gate (documented) |
| Contradiction engine | temporal/direct/numeric + negation asymmetry | No semantic NLI; contextual/definition-mismatch types are stubs |
| Persistence | JSON file (auto-flush, debounced) | No concurrency safety for multi-process; Mongo adapter not written |

## 3. ERRORS & RISKS BY CATEGORY

### 3.1 External connectivity & dependencies
- **CRITICO — Search providers degrade to zero results on markup change** (DDG HTML scraping, no API contract). *Impact:* live research quality collapses silently to ACCESS_LIMITED. *Mitigation in code:* graceful degradation + multi-provider. *Fix:* Brave/Bing API adapters + provider health metrics (per-provider success rate in ResearchMemory).
- **ALTO — No retry/backoff** on HttpTransport (single attempt per URL). *Fix:* 2 retries with exponential backoff + per-host rate limiting.
- **MEDIO — DNS rebinding guard resolves once**; a hostile server can still TOCTOU between check and connect. *Fix:* custom agent pinning resolved IP.

### 3.2 Placeholders / incomplete code
- **ALTO — Browser level is a stub** (`BrowserLevel.available` false unless env set; `fetch()` rejects). Honest: cascade reports escalation reasons; tests never fake success.
- **MEDIO — `queryFor()` perspective modifiers use hardcoded outlet domains** (nypost/abc.es/guardian…); fine as defaults, but should be config.
- **MEDIO — ContradictionEngine 'contextual'/'definition' types declared, not implemented.**
- **BAJO — `ContradictionEngine` imports `uid` unused.**

### 3.3 Simulation vs real
- **CRITICO (for honesty) — No LLM is executed anywhere in tests.** All "models" are routing decisions. The 19A orientation/bias analyzers are deterministic heuristics, not LLM inference — intentional (testable), but sophistication is below an LLM-based classifier. *Fix:* Face 40 adds optional LLM-backed classifier behind same interface, keeping heuristic as fallback.
- **ALTO — The E2E orchestrator test runs offline (`injectDocs`).** Live network path is exercised only by providers' unit patterns and manual CLI. *Fix:* nightly live smoke test with real queries.

### 3.4 Agent orchestration & flow
- **ALTO — Adversarial tasks are created but not driven to completion by the orchestrator** (`status PENDING`; `complete()` exists, nobody calls it in the loop). *Fix:* orchestrator round 2 executes CHALLENGER searches and completes tasks.
- **MEDIO — Single sequential round**; multi-round loop (GapEngine tasks feeding round 2) is designed but not wired.

### 3.5 State, memory & context
- **MEDIO — Working memory is written but not consumed** during synthesis; synthesis is claim-ranked, not conversation-aware.
- **MEDIO — `_jobs`-style in-memory patterns eliminated**, but store has no index structures → O(n) scans per find; fine at research scale, not at platform scale.

### 3.6 Error handling & resilience
- **ALTO — Orchestrator catch marks session FAILED and computes resume point, but `resume()` only reports** — it does not re-execute from the stage. *Fix:* implement stage-jump execution in the run loop.
- **MEDIO — HttpTransport double-reject risk** (timeout + error both fire) — guarded by promise semantics but noisy.

### 3.7 Input/output validation
- **ALTO — API has no schema validation** (only `question` presence); malformed payloads create junk sessions. *Fix:* per-route validation + 400s.
- **MEDIO — No length caps on user question** (DoS via giant prompt). Fix: cap + reject.

### 3.8 Observability
- **PARTIAL — Event bus with 12 lifecycle events works and is queryable per session (tested).** Missing: OTel export, metrics counters, structured trace IDs. Resource report exists per session (tested).

### 3.9 Security
- **ALTO — SSRF + injection + sandbox empty-env are tested and solid; missing:** JWT/auth on the API (open by default, local-only assumption), output encoding for UI consumers, per-user session isolation.
- **MEDIO — Sandbox blocks env-secrets but allows network access** from the child process. *Fix:* network-disable flag (e.g. spawn with restricted shell or container).

### 3.10 Performance
- **MEDIO — O(n²) document-pair similarity** in DependencyAnalyzer (fine ≤ a few hundred docs; LSH/shingles-by-band needed beyond).
- **MEDIO — BM25/TF-IDF indexes rebuild scans** on first query after restart (lazy, not incremental).

### 3.11 Testing
- **STRONG — 54 tests, zero dependencies, deterministic, spec scenarios included. Missing:** live-network E2E (excluded by design), property/fuzz tests for extractors, UI tests (none exists).

### 3.12 Config & deployment
- **PARTIAL — Everything configurable via env/config.js; no Dockerfile, no CI workflow, no helm.** *Fix:* 20-line Dockerfile + GitHub Actions running `npm test`.

### 3.13 System prompt (the "maestro" spec)
- **VERIFIED — the branch honors the spec's absolute rules** and they are enforced in code+tests: source→fact prohibition (claims start UNVERIFIED), repetition≠corroboration (§96), orientation≠truth (19A tests), inference≠fact (modality), hypothesis≠conclusion (PROPOSED status), "I don't know" (NOT_ENOUGH_EVIDENCE paths), auditability (event log + checkpoints + provenance chain).

### 3.14 Backend & frontend status
- **Backend:** the engine + API is real and tested (this branch). **Frontend: does not exist on this branch by design** (orphan rule; the platform's React client lives on main). *Fix:* Face 41 dashboard as a separate orphan branch or merged PR with main after review.

## 4. PRIORITIZATION (what to touch first)

| Prio | Item | Action |
|---|---|---|
| 1 CRITICO | Provider fragility | Add provider health tracking + 2 robust providers (Brave API, Wikipedia opensearch) before any live usage |
| 2 CRITICO | LLM absence | Implement Ollama adapter behind ModelRouter decisions; keep heuristic fallback; benchmark both on the 54-test corpus |
| 3 ALTO | Adversarial round 2 | Wire GapEngine tasks + adversarial tasks into orchestrator multi-round loop |
| 4 ALTO | True resume | Stage-jump execution from last checkpoint |
| 5 ALTO | API validation + auth token | Schema validation, question length cap, bearer-token middleware |
| 6 ALTO | Retry/backoff + rate limit | HttpTransport hardening |
| 7 MEDIO | Mongo adapter | Same interface as core/store; env-switch |
| 8 MEDIO | PDF/browser sidecars | Optional containers, measured adoption |
| 9 MEDIO | NLI contradiction + embedding relevance | Ollama embeddings into VectorStore (interface ready) |
| 10 BAJO | CI + Dockerfile | GitHub Actions, 15 lines |

## 5. VERIFICATION COMMANDS

```bash
npm test                 # 54/54 PASS (deterministic, offline)
node src/cli.js "¿Quién es Twilight Sparkle?"   # live network validation
npm start                # API :3210 → POST /api/research-os/research
```

*Audit rule honored: nothing above is claimed working without an executed test or explicit "partial/not exercised" mark.*
