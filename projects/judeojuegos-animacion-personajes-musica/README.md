# Universal Creative Engine (UCE)

Working title for a production-grade **modular-monolith AI creative platform**, built from the
Master Prompt V3 specification: a single system that takes a natural-language idea and drives it
through planning, characters, 2D/3D, rigging, animation, video, voice, music, narrative,
game/visual-novel builds, QA, and automatic repair — using open, permissive, locally runnable
models and tools as *internal engines*, never as visible seams.

> **Status: kernel + full CPU-scope domain layer implemented and verified (2026-09-07): 107/107
> tests, verification loop 10/10 (`python -m engine audit`), live HTTP smoke passed. CPU-only —
> GPU integration is disabled by decision; the GPU-domain engines are the next phase.**
> Nothing is called "done" until it runs a real, tested end-to-end execution (Master Prompt §72, §96).

## Qué es el proyecto (en español)

**Producto de análisis y auditoría forense: judeojuegos, animación, personajes, música.
https://proyectos-aoi.github.io.**

Este repositorio lleva el nombre del proyecto con ese dominio, y la ahi]: ##

---\n\n## What is this project
\n**Universal Creative Engine (UCE)** is a monolithic-modular AI creative platform (single kernel + separate workers) built from the master prompt. The goal is that a user describes an idea in natural language and the system plans, executes, and evaluates all creative flow: characters, images, 2D, 3D, rigging, animation, voice, music, scenes, video, games, visual novels, with automated QA and automatic repair — using open, locally-run tools as internal engines.
\nThe user perceives it all as one system.\n\nInternally, the kernel orchestrates:\n\n- AI Agent / Creative Director / LLM workspace / Narrative Engine\n- Image Studio (generation, editing, inpainting, outpainting, upscaling, control)\n- 2D Studio\n- 3D Studio (Blender as backend)\n- Animation/Video Studio (Wan-class video)\n- Audio + Music Studio (TTS, consented voice cloning, music generation)\n- Game / Visual Novel Environment (Godot, Ren'Py)\n- Asset Manager (content-addressed store, versions, rollback, asset graph)\n- Project Memory (9 categories, RAG)\n- Model Router + Licensing Firewall\n- Resource Manager\n- Automated QA + Automatic Repair\n\n### The master flow now\n\nThe system models:\n\nIDEA → PLANNING → SPEC → TASK Graph (DAG) → SELECT MODELS/ADAPTERS → EXECUTION → QA → REPAIR → VERSION → ASSET GRAPH → PROJECT → EXPORT.\n\nToday, what **actually runs in CPU**:\n\n- Task graph orchestration (tasks, dependencies, retries, checkpoints, crash-recovery)\n- Auth/RBAC, projects, assets (store, history, rollback)\n- Licensing firewall (explicit gate)\n- Model registry/router + quality guard + VRAM\n- Memory + search + asset graph + styles + characters (consistency)\n- Real QA (text, image, audio, 3D model) + automatic repair loop\n- Adapters + providers (availability probe, health, quotas, fallback, keys encrypted at rest)\n- CLI + dashboard.\n\n### GPU: status per user decision\n\nGPU is **DISABLED** (`UCE_ENABLE_GPU = False`, by user decision).\n\nNo image/video/3D/TTS/music/LLM narrative generation yet.\n\nBut the **coordination layer** for them already exists (registry, router, adapters, providers, QA). The next milestone is to connect a CPU LLM adapter (e.g. llama.cpp / qwen3 GGUF) and a creative-spec compiler, then proceed to GPU capabilities when enabled.\n\n### Respect for the master prompt\n\n- No mocks, no fake endpoints, no default simulations.\n- If a backend is unavailable, report it with a reason, not pretending.\n- If QA cannot run (e.g. ffprobe absent), fail with a reason, not faking the result.\n- If a model or license fails the firewall, it is not silently activated.\n\n## What works and what is missing (executive summary)\n\n- Works for real (proven by execution): kernel DAG, auth/RBAC, projects, assets with history/rollback, licensing firewall, model registry/router, memory+search, asset graph, styles+characters, QA+auto-repair, adapters+providers, CLI (19 commands), dashboard (10 sections).\n- Missing (by decision/priority): CUDA layers that need GPU / not installed yet, NLP→DAG compiler, and full deployment (Docker/compose, server config).\n\n## What is done in this branch\n\n- README (this)\n- prompt-maestro.md (the master prompt)\n- FORENSIC_AUDIT.md (forensic audit)\n- INTEGRATION_PLAN.md (integration plan)\n\n## Tests delivered\n\n- 107 tests + hardening tests (timeout, lock, rate limiting, keys,. migrations, backup/verify, events, metrics, prune).\n\n---\n\n## Qué es el proyecto (en español)\n\n**Producto de análisis \n y auditoría forense: judeojuegos, animación, personajes, música.**\n\n Este repositorio lleva el nombre del proyecto con ese dominio. Servirá como repositorio del proyecto + código + documentación. Lea el prompt maestro, el README, el forensic audit y el integration plan.

**Universal Creative Engine (UCE)** es un motor creativo de software de única arquitectura monolitica modular (un mismo kernel + workers separados) construido desde el prompt maestro porque quieres que, desde una idea en lenguaje natural, el sistema pueda planificar, ejecutar y evaluar todo el flujo creativo: caracteres, imágenes, 2D, 3D, rigging, animación, voz, música, escenas, video, juegos, visual novels, con QA automático y sistema de reparación — usando herramientas abiertas y ejecutables localmente.

El usuario lo percibe como un solo entorno. Internamente coordina:

- AI Agent / Creative Director / LLM workspace / Narrative Engine
- Image Studio (generación, edición, inpainting, outpainting, upscalado, control)
- 2D Studio
- 3D Studio (con Blender como backend)
- Animation Studio (yank/Waner como motores de video)
- Audio + Music Studio (TTS, clonación de voz consentida, música)
- Game / Visual Novel Environment (Godot, Ren'Py)
- Asset Manager (almacen de contenido, versiones, rollback, gráfico de activos)
- Project Memory (9 categorías, RAG)
- Model Router + Licensing Firewall
- Resource Manager
- Automated QA + Automatic Repair

### En qué momento está el flujo maestro

El sistema modela el flujo:

IDEA → PLANNING → SPEC → TASK GRAPH (DAG) → SELECT MODELS / ADAPTERS → EXECUTION → QA → REPAIR → VERSION → ASSET GRAPH → PROJECT → EXPORT.

Actualmente, lo que ejecuta "de verdad" en CPU:

- Orquestación de DAGs (tareas, dependencias, reintentos, checkpoint, crash-recovery)
- Auth/RBAC, proyectos, activos (almacen, historial, rollback)
- Firewall de licencias (puerta explícita)
- Registro/enrutador de modelos + guarda de calidad + VRAM
- Memoria + búsqueda + gráfico de activos + estilos + personajes (consistencia)
- QA real (texto, imagen, audio, modelo 3D) + bucle automático de reparación
- Adaptadores + proveedores (detector de disponibilidad, health, cuotas, fallback, claves encriptadas)
- CLI + dashboard.

### GPU: estado por decisión del usuario

GPU está DESHABILITADO (`UCE_ENABLE_GPU = False` por decisión).

No hay generación de imagen/video/3D/TTS/música ni LLM narrativo todavía.

Pero la **capa de coordinación** para ellos ya existe (registro, enrutador, adapters, providers, QA). El siguiente hito es conectar un adaptador LLM CPU (ej. llama.cpp/qwen3 GGUF) y el compilador de especificación creativa, y luego avanazar hacia las capacidades GPU cuando se habilite.

### Respeto al prompt maestro

- Sin mocks, sin endpoints falsos, sin simulaciones por defecto.
- Si un backend no está disponible, lo reporta con motivo, no fingiendo.
- Si QA no puede correr (ej. ffprobe ausente), falla con motivo, no fingiendo resultado.
- Si un modelo o licencia no pasa el firewall, no se activa silenciosamente.

## Qué funciona y qué falta (resumen ejecutivo)

- Funciona de verdad (probado por ejecución): kernel DAG, auth/RBAC, proyectos, activos con historial/rollback, firewall de licencias, registro/enrutador de modelos, memoria+búsqueda, gráfico de activos, estilos+personajes, QA+reparación automática, adaptadores+proveedores, CLI (19 comandos), dashboard 10 secciones.
- Pendiente (por decisión/prioridad): las capas CUDA que requieren GPU/no están instaladas aún, compilador NLP→DAG, y el despliegue final (Docker/compose, configuración del servidor).

## Qué está hecho en esta rama

- README (este)
- prompt-maestro.md (el prompt maestro)
- FORENSIC_AUDIT.md (auditoría forense)
- INTEGRATION_PLAN.md (plan de integración)

## Código instalado

- 107 pruebas + tests de endurecimiento (timeout, lock, rate limiting, claves,. migrations, backup/verify, eventos, métricas, prune).

---\n\n## What works today (real, tested)

- **Kernel**: SQLite (WAL), content-addressed asset store, DAG task graph with validation, DB-backed
  job scheduler (QUEUED→PLANNED→WAITING→RUNNING→QA→REPAIR→…), **isolated worker subprocesses**,
  crash detection + resume from checkpoint, retry budgets, partial re-run (only failed tasks),
  structured errors (Master Prompt §71), telemetry (§70), observability endpoints.
- **Auth/RBAC**: PBKDF2 password hashing, HMAC-signed bearer tokens, ADMIN/USER roles,
  ownership isolation on projects and assets.
- **Projects**: CRUD, archive, asset store with **version history + rollback** (content-addressed,
  Master Prompt §62), per-project storage quotas (§11).
- **Licensing firewall (§4)**: 17 researched entries (code/weights/dataset licenses, commercial-use
  flags, verdicts), an enforced gate on model activation, and logged overrides — flux.1-dev is
  BLOCKED by design, sdxl RESTRICTED with a recorded override.
- **Model registry + router (§10/§56)**: capability metadata, FAST/BALANCED/QUALITY/MAX_QUALITY
  modes, VRAM gating, quality floor with explicit override — refuses unavailable models *with
  reasons*, never silently substitutes.
- **Memory + search (§53/§54)**: 9 fixed memory categories per project, BM25 keyword ranking and a
  deterministic hashing-embedding semantic mode, plus unified asset+memory search.
- **Asset graph (§50/§51)**: typed relations (derived_from/references/depends_on/variant_of),
  transitive impact analysis, ordered partial-regeneration plans.
- **Styles + characters (§14/§16/§17)**: persistent style profiles (palette validation, reference
  assets) and characters with 15 identity slots and a consistency gate.
- **QA framework (§45–49)**: CPU-real checkers — text (length/JSON), image (resolution/exposure/
  contrast/sharpness), audio (clipping/RMS/duration), 3D (OBJ + GLB: normals/UVs/degenerate faces),
  video (ffprobe; honest QAUnavailable when absent).
- **Automatic repair (§49)**: tasks carry a `qa_policy`; the kernel runs QA on artifacts, drives
  GENERATE→QA→FAIL→DIAGNOSE→REPAIR→QA with budgets, records repair attempts and QA_FAILED errors.
- **Adapters + providers (§12/§55)**: honest availability probes (ffmpeg/blender/godot/comfyui/
  llama.cpp/gpu), provider registry with health checks, key rotation, quotas, priority fallback.
- **CLI**: `init`, `doctor`, `serve`, `submit`, `jobs`, `artifacts`, `errors`, `telemetry`, `users`,
  `projects`, `assets`, `licenses`, `models`, `memory`, `graph`, `characters`, `qa`, `adapters`,
  **`audit`** (the verification loop).
- **Dashboard**: 10 sections — login, home, projects, assets (versions/rollback), characters,
  memory, models + router preview, jobs, QA, errors, system (resources/adapters/licenses).
- **Evidence**: **107/107 tests pass** (crash→resume→identical hashes; repair-loop convergence;
  license-gate enforcement; router guard; QA checkers; CLI subprocess), the **verification loop**
  scores 10/10 across 14 areas (`docs/audit_evidence.json`), and a **live HTTP smoke test**
  (`scripts/smoke.py`) exercises every flow against a real server, including a QA-policy job and a
  repair-loop convergence over HTTP.

## Run it

```bash
# 1) Python environment
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"     # Windows; use .venv/bin on Linux/macOS

# 2) Tests
.venv/Scripts/python -m pytest -q

# 3) Server (serves the API + the built dashboard)
.venv/Scripts/python -m engine serve                # → http://127.0.0.1:8765

# 4) First user (the very first registered user becomes ADMIN)
.venv/Scripts/python -m engine users create admin --password change-me

# 5) Dashboard
cd dashboard && npm install && npm run build        # once; rebuild after dashboard edits
# (dev mode with hot reload: npm run dev, proxies to the kernel on 8765)
```

A demo workspace is pre-seeded in `data/` (user `admin` / `admin12345`) if you want to log in
immediately.

## Documents

| Document | Contents |
|---|---|
| `docs/MASTER_PROMPT_AUDIT.md` | Audit of the master prompt: strengths, contradictions, infeasibilities, amendments, licensing quick-reference (checked 2026-09-07) |
| `docs/ARCHITECTURE.md` | Monolith design: layers, module breakdown, isolation boundaries, adapter contracts, data model, tech stack, security |
| `docs/ROADMAP.md` | Phased plan: Definition of Done, vertical-slice strategy, hardware profiles, milestones, feature matrix, risk register |
| `docs/GAP_PLAN.md` | Honest inventory of what was skipped and the phased plan that closed every CPU-implementable gap |
| `docs/AUDIT.md` | Full audit: per-area scores 1–10 backed by `docs/audit_evidence.json`, what each part needs for 10/10, risks, improvement ideas |

## Decisions (locked 2026-09-07)

- **Hardware profile: Pro (24 GB VRAM)** target — but **GPU integration is deferred**; the system
  runs **CPU-only** until deliberately re-enabled (`UCE_ENABLE_GPU` in `engine/config.py`).
- **Stack: Python 3.12 engine core (FastAPI + SQLAlchemy, stdlib-only crypto) + React/TypeScript dashboard.**
- **First vertical slice after the kernel: Image → Character.**
- Assumed defaults: O3DE = stretch goal only, single-user v1, remote compute in v2.

## Guiding principles (adopted from the audit)

1. **One kernel, many engines.** Orchestration and state live in a single restartable process with
   one database; heavy/risky work runs in isolated worker processes coordinated by the kernel.
2. **Vertical completeness, not horizontal mocks.** Each phase ships a real, tested vertical slice.
3. **Offline-first, permissive-only.** Every model and tool passes the licensing firewall.
4. **Everything reproducible.** Artifacts carry model, seed, prompt, parameters, workflow hash,
   and version — rollback always possible.
5. **Honesty over optimism.** The feature matrix stays visible and truthful (COMPLETE / PARTIAL /
   BROKEN / MOCKED / MISSING). We never claim something works without a passing test.

## License

The project itself will be released under a permissive open-source license (decision pending).
Every integrated model, tool, and dependency is vetted by the licensing firewall before use;
see `docs/MASTER_PROMPT_AUDIT.md` §Licensing quick-reference.