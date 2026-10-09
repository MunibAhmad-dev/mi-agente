# INTEGRATION PLAN — to 10/10, phase by phase (2026-09-08)

Companion to `FORENSIC_AUDIT.md` (findings + priorities) and `GAP_PLAN.md`.
Every phase follows the repo's Definition of Done: interface, implementation,
tests, integration test, real execution, QA, documentation, regression. No phase
closes by declaration.

Progress legend: `[ ]` pending · `[~]` partial · `[x]` done.

Current verified baseline (2026-09-08): **119/119 tests**, `engine audit` **10/10
across 14 areas**, live HTTP smoke passed, GPU **off** by user decision.

---

## Phase F0 — Install, configure, verify (any machine) `[~] core done / [ ] packaging`

Goal: reproducible from-zero bring-up in under 10 minutes.

1. **Install** `[x]`
   ```bash
   git clone https://github.com/proyectos-aoi/mi-agente.git && cd mi-agente
   git checkout judeojuegos-animacion-personajes-musica
   python -m venv .venv
   .venv/Scripts/python -m pip install -e ".[dev]"        # Windows (.venv/bin on POSIX)
   cd dashboard && npm ci && npm run build && cd ..
   ```
   Optional engines (probed honestly when absent): `ffmpeg`, `blender`, `godot`, `renpy`.
2. **Configure** `[x]` — copy `.env.example` → `.env`; set `UCE_DATA_DIR`, `UCE_PORT`,
   `UCE_LOG_LEVEL`, `UCE_MAX_ATTEMPTS`, `UCE_TASK_TIMEOUT_S` (default 600),
   `UCE_MAX_PARALLEL` (default 2), `UCE_PROJECT_QUOTA_MB`; optional
   `UCE_LLAMACPP_URL` / `UCE_COMFYUI_URL` when those engines are installed.
3. **Initialize** `[x]` — `python -m engine init` (DB + migrations + storage +
   secret) → `python -m engine users create <admin> --password …` (first user = ADMIN).
4. **Verify** `[x]` — `python -m engine doctor` (exit 0) → `python -m engine audit`
   (10/10) → `python -m engine serve` → `python scripts/smoke.py http://127.0.0.1:<port>`.
5. **Packaging** `[ ]` — **next actionable phase**:
   - `Dockerfile` (multi-stage: node build → python runtime; non-root user; healthcheck
     hitting `/api/health`).
   - `docker-compose.yml` (kernel + optional PostgreSQL via `UCE_DB_URL`; volume for
     `UCE_DATA_DIR`).
   - Service unit: systemd (Linux) / NSSM (Windows) with restart policy + scheduled
     `engine backup` and `engine prune`.
   - `INSTALLATION.md` + `CONFIGURATION.md` per master prompt §80.

**Acceptance**: fresh machine or `docker compose up` → smoke PASSED, `audit` 10/10,
`doctor` 0 — from zero, without reading the source.

---

## Phase F1 — Reliability & security hardening `[x]` (2026-09-07, regression-verified 2026-09-08)

All items implemented and tested:

1. **Worker wall-clock timeout** (Crítico): `proc.wait(timeout=…)`, kill on expiry,
   `WORKER_TIMEOUT` error, requeue per budget; `params.timeout_s` or `UCE_TASK_TIMEOUT_S`.
2. **Single-instance guard** (Crítico): PID+lock in `UCE_DATA_DIR`; second
   `serve`/`init` refuses to boot; stale locks taken over.
3. **Login rate limiting** (Alto): token bucket per IP+username → 429 + `Retry-After`.
4. **Provider keys encrypted at rest** (Alto): Fernet derived from the signing
   secret; `enc:…` at rest; decrypt only in `pick()`; refuses encrypted keys without secret.
5. **Migrations** (Alto): versioned transactional runner + `schema_version` table;
   idempotent on fresh and old DBs.
6. **Backup** (Alto): `engine backup --out dir` → WAL-checkpointed DB + blob manifest;
   `--verify` detects tampering.
7. **Parallel scheduler** (Alto): `UCE_MAX_PARALLEL` independent tasks per tick;
   crash-resume guarantees preserved.
8. **Strict provider health** (Medio): only 2xx counts healthy.
9. **Persisted events + `/api/events` + `/api/metrics` + `engine prune`** (Medio).

Regression 2026-09-08: full suite 119/119 green on top of all of the above.

---

## Phase F1b — Prove the new endpoints `[ ]` — **NEXT**

1. **HTTP tests**: `test_audit_endpoint` (ADMIN → `all_checks_passed`,
   `overall_score`, `areas`), `test_events_api` (submit job → filter events by
   topic/job_id → `task.started`/`task.completed`/`job.updated` present),
   `test_metrics_api` (`uce_jobs`, `uce_tasks_total`, `uce_qa_*` counters present).
2. **CI audit gate**: add an `audit` job to `.github/workflows/ci.yml` that runs
   `python -m engine audit` and fails the build on any area < 10; add a smoke job
   running `scripts/smoke.py` against a live `engine serve`.

**Acceptance**: the three endpoints are covered by tests; CI fails on audit regression.

---

## Phase F2 — Hardening leftovers (audit §4 items 14–16, 19) `[ ]`

1. **Secret auto-creation**: `init` (and first-boot) creates the signing secret if
   absent → provider keys are never plaintext by default; add `--require-encrypted`
   fail-closed option.
2. **Streaming uploads**: spooled temp file instead of full-RAM buffer.
3. **Video-QA preflight**: check ffprobe availability before submitting a video task
   with `qa_policy`; fail with a clear configuration error instead of burning the
   repair budget.
4. **Manifest-hash fast path**: skip dispatching tasks whose manifest hash already
   has a COMPLETED output (cache §68, first real win).
5. **Health endpoint reads the GPU adapter probe** instead of hardcoding `false`.

**Acceptance**: each item lands with its test; suite stays green.

---

## Phase F3 — CPU model integration (no GPU needed) `[ ]`

Goal: the first *creative* engines, running real models on CPU.

1. **LLM via llama.cpp** (license APPROVED in the firewall): document qwen3 GGUF
   download; adapter `llama_cpp` (URL probe exists) powers the **Creative Spec
   compiler** (§8/§9): natural language → editable spec → task DAG.
2. **Real embeddings**: sentence-transformers (CPU) behind the existing
   `search(mode="semantic")` contract; hashing embedder stays as the
   zero-dependency fallback.
3. **TTS via Kokoro** (CPU-ok in the registry): `audio.generate` handler + audio QA
   policy; the voice-cloning consent gate stays closed by default (§34).
4. **Narrative engine v1 (§37/§38)**: world/character memory feeds prompts; outputs
   validated by `qa` kind `text` (JSON mode) and written back to memory categories.

**Acceptance**: type an idea → editable Creative Spec → generated DAG executes
end-to-end → artifact passes QA. All CPU; smoke extension added to CI.

---

## Phase F4 — Dashboard completeness `[ ]`

1. Audit page (runs/reads the verification loop) + events/activity feed.
2. Asset-graph visualization (impact + regeneration plan rendering, §50/§51).
3. Visual editors v1 (§59): storyboard shot editor (§31), camera-path canvas (§30).
4. Live job progress: SSE subscription replacing polling.
5. Component tests (React Testing Library) for the 10 existing pages; automated
   §79 button audit (every visible control performs a real action).

**Acceptance**: every §58 dashboard section exists and every control performs a
real action.

---

## Phase F5 — GPU phase (requires explicit user decision: `UCE_ENABLE_GPU=true`)

Order follows the locked slice decision (Image → Character):

1. diffusers adapter: FLUX.1-schnell / Qwen-Image (APPROVED licenses only) →
   `image.generate` handler + full image QA + character sheets/turnaround (§18/§19).
2. Blender headless adapter (external process, GPL-safe) → 3D pipeline (§21–§25).
3. Wan 2.2 video + temporal QA (§32/§47).
4. Voice ingestion + cloning (consent-gated, §33/§34) + ACE-Step music (§35/§36).
5. Godot / Ren'Py exporters + game QA agents (§39–§44).
6. Remote compute (§12) — opt-in, last.

**Acceptance**: per slice, the Definition of Done with real generated artifacts
and real QA scores (§87).

---

## Phase F6 — Production deployment `[ ]`

1. Docker/compose with PostgreSQL (`UCE_DB_URL`) — removes the single-writer ceiling.
2. TLS termination (reverse proxy) + HTTPS guidance in README.
3. Multi-user policies: admin audit log, token revocation list, per-user quotas.
4. Disaster-recovery runbook: scheduled `engine backup` + timed restore drill.

**Acceptance**: fresh-VM deploy from compose → full smoke + audit green against
PostgreSQL; restore drill completes from the backup alone.

---

## Current position

`[x] F0 core` → `[x] F1 hardening` → **next: F1b (endpoint tests + CI gate)** →
F2 (leftovers) → F3 (CPU models) → F4 (dashboard) → F5 (GPU, on your decision) →
F6 (production).
