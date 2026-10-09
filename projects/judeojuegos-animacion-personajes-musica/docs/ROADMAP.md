# Roadmap — Phased Plan

Version: draft 0.1 · 2026-09-07 · Strategy derived from `MASTER_PROMPT_AUDIT.md` (P1, P3) and
`ARCHITECTURE.md`.

---

## 1. Definition of Done (operationalized Master Prompt §96)

A milestone or feature is **COMPLETE** only when all of these pass for a *real* run:

1. **Interface** — public API/contract exists and is typed.
2. **Implementation** — real code, no mocks, no placeholders.
3. **Unit tests** — pass in CI.
4. **Integration test** — the feature works through the kernel (DB + storage + workers).
5. **Real execution** — a real task runs and produces a real artifact (not a fixture).
6. **QA** — the artifact passes the domain's QA thresholds, or a documented, recorded exception
   with human sign-off.
7. **Versioning** — the artifact is versioned with full provenance (model, seed, prompt, params,
   workflow hash, refs).
8. **Documentation** — the feature's doc section exists and matches reality.
9. **Regression** — existing tests still pass.

Statuses are recorded in the feature matrix (§7): COMPLETE / PARTIAL / BROKEN / MOCKED / MISSING.
Nothing is marked COMPLETE without #1–#9. There is no "done by declaration."

---

## 2. Strategy: vertical slices, not horizontal layers

The prompt's 25 phases are reorganized into **kernel + slices**. The kernel (M0–M3) is built once,
thin but *functional* — every piece of it executes real tasks immediately. Then each domain lands
as a complete vertical slice:

```
KERNEL (M0–M3) ──► slice 1: IMAGE + CHARACTER (M4–M5)
                       │
                       ├─► slice 2: 3D + RIG + ANIMATION (M6–M7)
                       │
                       ├─► slice 3: VIDEO (M8)
                       │
                       ├─► slice 4: AUDIO + MUSIC (M9)
                       │
                       ├─► slice 5: NARRATIVE + GAMES (M10–M11)
                       │
                       └─► slice 6: QA/REPAIR, DASHBOARD, HARDENING (M12–M13)
```

Slices are independent: work on slice 2 doesn't block slice 1, and a later slice can be gated on
hardware. The E2E test (§5) grows with every slice.

---

## 3. Hardware profiles

The resource manager and model router are configured by profile; the installer detects and reports
the actual profile honestly.

**Selected profile (2026-09-07): Pro — 24 GB VRAM.** Everything runs locally, including Wan-class
video and larger LLMs; batch image generation is comfortable.

**GPU status: DISABLED by user decision (2026-09-07).** The system runs CPU-only until
`UCE_ENABLE_GPU` is deliberately re-enabled and the GPU adapters are connected. M0–M1 are fully
implementable CPU-side, which is what is done.

| Profile | Typical GPU | VRAM | Runs well | Runs with limits |
|---|---|---|---|---|
| **Minimal** | none / iGPU | 0–4 GB | kernel, LLM small (CPU), Ren'Py export, dashboard | image (slow, low res), no video/music locally |
| **Standard** (recommended default) | RTX 3060/4060-class | 8–12 GB | LLM 7–14B, SD/FLUX-small, Qwen-Image, TTS, ACE-Step, Blender, Godot/Ren'Py | Wan 5B (slow), no Wan 14B |
| **Pro** | RTX 3090/4090-class | 24 GB | everything incl. Wan 2.2-14B, larger LLMs, batch image | — |
| **Studio** | 2× GPU or 48 GB+ | 48+ GB | everything + big batches + local video at speed | — |

Anything that doesn't fit the active profile is deferred, queued, or routed to remote compute
(opt-in only, Master Prompt §12).

---

## 4. Milestones (revised phases, with acceptance tests)

Each milestone closes only via §1 DoD, including its real acceptance test.

| # | Milestone | Scope (what is real) | Acceptance test (must run) |
|---|---|---|---|
| **M0** ✅ (2026-09-07) | Skeleton that lives | Repo, engine package, config, DB schema, storage (content-addressed), internal job scheduler, task graph, worker protocol, health/status endpoints, pytest+CI, error/telemetry records | **Passed**: 15/15 tests, including kill-worker-mid-run → resume → identical hashes; live HTTP smoke run produced real artifacts with zero errors |
| **M1** ✅ (2026-09-07) | Project system + auth + asset store + dashboard shell | Projects CRUD + archive, content-addressed asset store with **version history + rollback**, auth/RBAC (PBKDF2 + HMAC tokens, ADMIN/USER, ownership isolation), structured API errors, CLI (init/doctor/serve/submit/jobs/artifacts/errors/users/projects/assets), React dashboard (login/home/projects/assets/jobs/errors) served by the kernel | **Passed**: 38/38 tests (auth, ownership isolation, versions/rollback, CLI subprocess, crash-resume); live HTTP smoke: register→login→project→asset v1/v2→project-linked job→artifact, zero errors. Audit log and rate limiting deferred to the security milestone (M13 hardening) — tracked honestly below |
| **M2** | Memory + RAG + asset graph | Memory tables, embeddings, text RAG, visual RAG (CLIP), asset graph + edge invalidation, partial-regeneration detection | Inject memories → retrieval returns relevant refs → change an asset → dependents flagged invalid |
| **M3** | LLM layer + narrative core | Providers, model registry + quality guard, model router (FAST/BALANCED/QUALITY/MAX), Creative Spec compiler (NL → spec → task DAG), planner, world/narrative memory, contradiction check | Type an idea → get an editable Creative Spec → generated task DAG renders in dashboard → planner reasons over memory |
| **M4** | Image + style engine | Image adapter (SD/FLUX/Qwen via diffusers), editing/inpaint/outpaint/upscale, style entities (visual profile, palette, refs, embeddings), image QA (anatomy/hands/eyes/identity/style/composition scores) | Generate image from spec → QA scores recorded → style applied across 3 generations with measurable consistency |
| **M5** | Character vertical | Character engine (identity, face, body, hair, clothing, accessories, expressions, poses), sheets + turnaround pipeline (multi-view, per-view regeneration), consistency validation | Create character → sheet (front/side/3-4/close-up) → turnaround with consistency scores → regenerate only one failed view |
| **M6** | 2D→3D + Blender adapter | Internal character representation, 2D→3D pipeline (depth, landmarks, mesh, retopo, UV, texture, material), headless Blender worker, GLB/FBX export | Character → GLB with topology/UV/material QA report → opens in Blender headless verify |
| **M7** | Rig + animation + camera | Body rig (IK/FK, spine/arms/legs/hands/feet), facial rig (shape keys, 6 emotions), lip sync (text→phonemes→mouth), procedural animation (walk/run/gesture), camera path editor, storyboard shots | Rig → deformation QA passes → animate a walk cycle → render preview → lip-sync clip from text |
| **M8** | Video vertical | Wan 2.2-class adapter (T2V/I2V), camera/pose conditioning, temporal QA (flicker/consistency/identity), shot-consistency checks | 4s clip from character reference → temporal QA report → flicker-detected clip flagged + repaired/regenerated |
| **M9** | Audio + music vertical | TTS (Kokoro/CosyVoice), consent-gated voice cloning + voice ingestion (VAD, diarization, separation, quality filter), ACE-Step music (theme→scene→variation), SFX, audio QA (clipping/noise/volume/timing) | Voice ingested → speakers detected → character speaks cloned (consented) voice → theme generated + variation → audio QA passes |
| **M10** | Narrative + games v1 | Narrative engine (lore, dialogue, branching, world state, contradiction detection), game project generator, Ren'Py exporter, Ren'Py lint QA | Request "RPG" → design doc + world + quests + dialogue → **export Ren'Py project → `renpy lint` clean → headless run screenshots** |
| **M11** | Godot + game agents | Godot project generator (scenes, scripts, UI), headless export, sandboxed game-coding agent (write→test→validate→approve), game QA (launch, navigate, screenshot, log analysis, vision analysis) | Generated Godot project → headless export succeeds → automated player smoke test passes → screenshots + log analysis clean |
| **M12** | QA/repair system + dashboard complete | Cross-domain QA analyzers, repair loops with budgets (diagnose→repair→re-QA, max attempts, HITL escalation), full dashboard (models, memory, workflows, jobs, GPU, qa, admin), visual editors v1 (canvas, timeline, camera path) | **Seeded-failure test**: inject a broken asset → system flags → repairs → re-QA passes or escalates; every dashboard button performs a real action (Master Prompt §79 audit) |
| **M13** | Hardening + E2E | Remote compute adapter (opt-in), installer + system doctor, performance pass (startup, model switching, memory), backup/disk management, full E2E (§5) | Fresh machine install → run the full E2E scenario → final forensic audit report |

Milestone ordering note: O3DE remains an explicit **stretch goal after M13**, gated by a
checkpoint decision (audit P4).

---

## 5. North-star E2E (Master Prompt §78, grown per slice)

The single acceptance pipeline that every slice feeds:

```
IDEA → PLANNING → CHARACTER → STYLE → SHEET/TURNAROUND → 2D→3D → RIG → FACE →
ANIMATION → VOICE → MUSIC → SCENE → CAMERA → VIDEO → GODOT PROJECT → BUILD →
QA → REPAIR → FINAL BUILD
```

At M5 the runnable prefix is IDEA→TURNAROUND; at M7 IDEA→ANIMATED PREVIEW; at M9
IDEA→VOICE+MUSIC; at M11 the full pipeline to a Godot build. The test runs for real on every
release (CI, on the active hardware profile).

---

## 6. Model candidates (seed data for the registry — re-researched per phase)

| Task | Default candidate(s) | Fallback | License status (2026-09-07) |
|---|---|---|---|
| LLM / narrative | Qwen3 (7–14B) GGUF | Llama-class permissive | Apache-2.0 |
| Image | Qwen-Image / FLUX.1-schnell / SDXL | per installed | Apache-2.0 / Apache-2.0 / OpenRAIL-M |
| Video | Wan 2.2-class (5B/14B) | newer Apache-2.0 successors | Apache-2.0 |
| TTS | Kokoro / CosyVoice | — | Apache-2.0 |
| Music | ACE-Step | — | Apache-2.0 |
| Embeddings | sentence-transformers + CLIP | — | permissive |

Excluded by policy until explicit user authorization: non-commercial weights (e.g., FLUX.1-dev),
any model failing the firewall.

---

## 7. Feature matrix (seed — full matrix maintained in the repo as features are built)

| Feature | Frontend | Backend | Integration | Real execution | Tests | Status | Target |
|---|---|---|---|---|---|---|---|
| Kernel: orchestration, jobs, checkpoints | ✓ (jobs page) | implemented | implemented | ✓ pytest + live smoke | ✓ | **COMPLETE** | M0–M1 ✅ |
| Storage + versioning | ✓ (assets page) | implemented | implemented | ✓ pytest | ✓ | **COMPLETE** (content-addressed store + artifact/checkpoint rows + asset versions/rollback API + UI) | M1 ✅ |
| Auth/RBAC | ✓ (login page) | implemented | implemented | ✓ pytest | ✓ | **COMPLETE** (register/login/me, ADMIN/USER, ownership isolation) | M1 ✅ |
| Projects | ✓ (projects page) | implemented | implemented | ✓ pytest | ✓ | **COMPLETE** (CRUD + archive) | M1 ✅ |
| Dashboard shell | ✓ | implemented | implemented (served by kernel) | ✓ build + smoke | ✓ | **PARTIAL** (login/home/projects/assets/jobs/errors; visual editors + more sections pending) | M11 |
| Memory + RAG (text/visual) | ✓ (memory page) | **PARTIAL** (9 categories + BM25 + hashing-embedding search, tested; visual RAG needs embeddings model) | implemented | ✓ pytest + smoke | ✓ | **PARTIAL** — text half COMPLETE, visual half GPU-gated | M2 |
| Creative Spec compiler | — | planned | — | — | — | MISSING | M3 |
| Model router + quality guard | ✓ (models page) | **COMPLETE** (registry + licensing gate + mode-weighted routing + VRAM gate + quality floor, tested) | implemented (honest availability) | ✓ pytest + smoke | ✓ | **COMPLETE** (CPU coordination layer; model backends arrive with the GPU phase) | M3 |
| Licensing firewall (§4) | ✓ (system page) | **COMPLETE** (17 seeded entries, enforced gate, logged overrides) | implemented | ✓ pytest + smoke | ✓ | **COMPLETE** | P1 ✅ |
| Resource manager + quotas (§11) | ✓ (system page) | **COMPLETE** (snapshot + storage quotas; psutil optional) | implemented | ✓ pytest | ✓ | **COMPLETE** (GPU probing deferred) | P1 ✅ |
| Asset graph + partial regen (§50/§51) | — | **COMPLETE** (typed relations, impact BFS, regen plan) | implemented | ✓ pytest + smoke | ✓ | **COMPLETE** (UI graph view pending) | P2 ✅ |
| Styles + characters (§14/§16) | ✓ (characters page) | **COMPLETE** (entities, palette validation, slot consistency) | implemented | ✓ pytest + smoke | ✓ | **COMPLETE** (generation pipelines fill slots later) | P3 ✅ |
| QA framework CPU (§45–49) | ✓ (qa page) | **COMPLETE** (text/image/audio/model3d/video checkers, honest unavailability) | implemented | ✓ pytest + smoke | ✓ | **COMPLETE** (visual model QA is GPU-gated) | P4 ✅ |
| Automatic repair (§49) | — (via jobs) | **COMPLETE** (QA→REPAIR loop with budget, diagnosis rows, QA_FAILED errors) | implemented | ✓ pytest + smoke | ✓ | **COMPLETE** | P4 ✅ |
| Adapters + providers (§12/§55) | ✓ (system page) | **COMPLETE** (honest probes; provider health/rotation/quota/fallback) | implemented | ✓ pytest + smoke | ✓ | **COMPLETE** (real services behind probes later) | P5 ✅ |
| Verification loop (§95/§96) | — | **COMPLETE** (`python -m engine audit`: 14 areas, live evidence, exit-code gate) | implemented | ✓ 10/10 | ✓ | **COMPLETE** | P9 ✅ |
| Image engine + style | — | planned | — | — | — | MISSING (GPU-gated) | M4 |
| Character sheets + turnaround | — | planned | — | — | — | MISSING (GPU-gated) | M5 |
| 2D→3D + Blender pipeline | — | planned | — | — | — | MISSING (GPU-gated) | M6 |
| Rigging + facial + lip sync | — | planned | — | — | — | MISSING (GPU-gated) | M7 |
| Animation + camera + storyboard | — | planned | — | — | — | MISSING (GPU-gated) | M7 |
| Video (Wan) + temporal QA | — | planned | — | — | — | MISSING (GPU-gated) | M8 |
| TTS + cloning (consent-gated) | — | planned | — | — | — | MISSING (GPU-gated) | M9 |
| Music (ACE-Step) + SFX | — | planned | — | — | — | MISSING (GPU-gated) | M9 |
| Narrative + world model | — | planned | — | — | — | MISSING (GPU-gated) | M10 |
| Ren'Py generation | — | planned | — | — | — | MISSING | M10 |
| Godot generation + agents | — | planned | — | — | — | MISSING | M11 |
| QA analyzers (visual/anatomy, model-based) | — | planned | — | — | — | MISSING (GPU-gated) | M12 |
| Dashboard complete + editors | ✓ (10 sections) | implemented (served by kernel) | implemented | ✓ build + smoke | ✓ | **PARTIAL** (visual editors — canvas/timeline/camera paths — pending) | M12 |
| Remote compute + installer + perf | — | planned | — | — | — | MISSING | M13 |

This matrix is the living artifact of the project (Master Prompt §73/§74). Each milestone updates
it with real evidence.

---

## 8. Risk register (top items)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hardware can't run the ambitious domains | High | High | Hardware profiles + honest router; Standard profile is the default target |
| Scope creep / burning out on 100% | High | High | Vertical slices; feature matrix is the shield — nothing ships half-done |
| Model license drift (weights change terms) | Medium | Medium | Licensing firewall re-checks at install; policy: permissive-only |
| GPL entanglement via Blender/ComfyUI | Medium | High | External-process rule is architectural (ARCHITECTURE §2), tested in CI |
| Identity preservation in video below expectations | High | Medium | Set thresholds honestly; temporal QA + HITL; short clips |
| Game generation produces unplayable output | High | Medium | QA gates: lint-clean, headless run, smoke tests; HITL; scope "playable v1" explicitly |
| Agentic game QA is research-grade | High | Medium | Start with smoke/log/screenshot + vision LLM; autonomous fixing is a later increment |
| Installer/GPU-driver pain on Windows | Medium | Medium | Detector + doctor command; Docker server mode as escape hatch |
| O3DE consumes the roadmap | Medium | High | Explicit stretch goal with checkpoint gate after M13 |
| Solo-dev timeline vs. enthusiasm | High | Medium | Honest reporting in every milestone review; adjust scope, never fake completion |

---

## 9. Immediate next actions (after decisions in §10)

1. **Decide** hardware profile, stack, first slice, O3DE, multi-user, remote compute (§10).
2. `git init` + scaffold the M0 repository layout (engine package, dashboard shell, tests, CI).
3. M0 implementation per §1 DoD — kernel, storage, scheduler, worker protocol, checkpoint resume.
4. First slice decision after M3 (kernel real): Image→Character recommended.

---

## 10. Decisions (locked 2026-09-07)

1. **Hardware profile: Pro (24 GB VRAM)**
2. **Stack: Python core + React dashboard**
3. **First vertical slice: Image→Character** (after M1–M3 kernel completion)
4. **GPU: DISABLED (CPU-only) by user decision — no GPU integration until deliberately re-enabled**
5. O3DE: **stretch goal only** (assumed default)
6. Multi-user: **single-user v1** (assumed default)
7. Remote compute: **v2** (assumed default)

Next actions: M1 (project system + dashboard shell + auth), then M2 (memory + RAG + asset graph),
M3 (LLM layer + narrative core), then the Image→Character vertical (M4–M5).