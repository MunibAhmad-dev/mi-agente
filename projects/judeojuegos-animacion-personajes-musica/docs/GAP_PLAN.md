# GAP PLAN — Closing the distance to the Master Prompt (2026-09-07)

## 1. Honest inventory — what was skipped

The previous turns delivered **M0 + M1 only**. Everything else in the 100-section
master prompt was deferred (documented in `ROADMAP.md`), never faked. No existing
work was overwritten: the full suite passed before this plan started.

| State | Items |
|---|---|
| **DONE (tested)** | Kernel: DB, content-addressed storage, DAG task graph, scheduler, worker subprocesses, checkpoints/resume, structured errors, telemetry, auth/RBAC, projects, assets with versions/rollback, CLI, dashboard shell, CI |
| **SKIPPED** | Licensing firewall as code; model registry + router + quality guard; resource manager; memory/RAG/search; asset graph; partial regeneration planning; styles; characters + consistency; QA framework; automatic repair loop; adapters; provider manager; dashboard sections for all of the above; admin policies; visual editors; and all GPU-domain engines (image, video, 3D, rigging, animation, audio-gen, music, narrative-LLM, games) |

## 2. Constraints for this pass (user decisions)

- **GPU stays OFF** (`UCE_ENABLE_GPU=False`). Nothing here touches hardware.
- **No mocks** (Master Prompt §97): every module below is real logic with real tests.
  Model/media *engines* that require GPU or downloaded weights are represented by
  their real coordination layer (registry, router, adapters, QA, repair) with
  honest **availability detection** — they fail loudly with reasons, never fake output.
- Everything runs in the existing monolith process; workers stay subprocess-isolated.

## 3. Phases executed in this pass

| Phase | Scope | Master Prompt § |
|---|---|---|
| **P1** | Licensing firewall (registry + gate), model registry + router (FAST/BALANCED/QUALITY/MAX_QUALITY) + quality guard, resource snapshot + storage quotas | 4, 10, 11, 55, 56 |
| **P2** | Memory (9 categories) + keyword & embedding search + asset graph + partial-regeneration planning | 50, 51, 53, 54 |
| **P3** | Style profiles + character entities with slot consistency | 14, 16, 17 |
| **P4** | QA framework (image/audio/3D/video/text checks, CPU-real) + automatic repair loop wired into the scheduler | 45–49, 60 (QA/REPAIR states) |
| **P5** | Adapter availability probes (ffmpeg/blender/comfyui/llama.cpp/gpu) + provider manager (rotation, health, quotas, priority) | 12, 55 |
| **P6–P8** | API endpoints for all modules; CLI commands; dashboard pages (Models, Memory, Characters, QA, System) | 58 |
| **P9** | Verification loop: `python -m engine audit` — structural + live checks per area, exit non-zero until green | 95 |
| **P10** | Full audit: docs/AUDIT.md, per-area scores 1–10 backed by the evidence file, gaps to 10/10, improvement ideas | 95, 96 |

## 4. What still blocks 10/10 (GPU/hardware-gated, deliberately deferred)

Image generation, video generation, 3D reconstruction/Blender pipelines, rigging,
animation, TTS/voice cloning, music generation, LLM narrative, Godot/Ren'Py/O3DE
builds, visual RAG embeddings (CLIP), remote compute. Each already has its real
coordination layer (registry/router/QA/repair/adapters) — connecting the actual
model backends is the next phase once GPU is re-enabled (`UCE_ENABLE_GPU=true`).
