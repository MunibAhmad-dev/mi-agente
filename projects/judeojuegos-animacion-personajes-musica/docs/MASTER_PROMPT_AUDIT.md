# Master Prompt V3 — Forensic Audit

Audited: 2026-09-07 · Version: MASTER PROMPT V3 · Result: **vision A+, principles A, feasibility D, operability C-**

---

## 1. Executive summary

The prompt is an outstanding **product vision** and an impossible **single-deliverable spec**.
It is best treated as the *product bible* — the north star and the acceptance criteria — not as a
backlog that must all be "done" at once. Anyone who promises to deliver 100% of this spec in one
effort is either lying or will ship mocks (which the prompt itself bans).

The professional path is exactly what the prompt already hints at: build a **monolithic core that
is real and complete**, then deliver **independent vertical slices** (image → character → 3D →
animation → video → audio → games) on top of it, each one *fully implemented, integrated, executed,
QA'd, and versioned* before the next begins. The monolith is what makes this tractable: one stable
kernel, many swappable engines.

This audit is organized as:
- §2 What to keep — the principles that are correct and load-bearing
- §3 Critical problems — the contradictions and infeasibilities, with resolutions
- §4 Feasibility map by domain
- §5 Licensing quick-reference (verified today)
- §6 Amended principles (the rules we adopt)
- §7 Decisions required from the user

---

## 2. What to keep (these are correct and load-bearing)

| Principle | Why it's right |
|---|---|
| §2 "Creative OS, not integrations" | The correct mental model. Tools (Blender, SD, Wan, Godot) become adapters behind one system. |
| §6 Monolithic modular design | Correct for a single-user/studio tool. Microservices would add ops burden with zero benefit here. |
| §4 Licensing firewall | Genuinely rare and genuinely important. Open source ≠ free use; weights licenses differ from code licenses. |
| §66 Offline-first, §67 privacy | Local models as default, cloud as opt-in. This is a product differentiator. |
| §72/§96 No false completion | The single most valuable rule. Code/UI/endpoint existence ≠ functionality. |
| §61 Checkpoints, §51 partial regeneration | Correct engineering: never redo what already passed. Saves hours on real pipelines. |
| §50 Asset graph, §52 versioning, §91 reproducibility | The difference between a toy and a tool you can trust for long projects. |
| §84 Adapters, §85 internal representation | The decoupling that makes models/engines swappable (also §92). |
| §89 Human-in-the-loop | Realistic: some failures cannot be auto-repaired; escalation is a feature, not a fallback. |
| §53–§54 Memory + search | A creative tool without project memory is unusable for characters that must stay consistent. |

---

## 3. Critical problems (with resolutions)

### P1 — Scope is 5–12 person-years of work, not a single build. *(Blocking)*
Counting the prompt's own module list: ~26 domain modules, ~10 engines, 3 game engines, ~40 model
categories, 5 QA analyzers, an automated repair system, a full dashboard with ~20 sections, a
visual editor (timeline + canvas + layers + camera paths), an installer, and a full E2E game+VN
pipeline. Order-of-magnitude estimate at production quality (per §72's bar):

| Area | Effort (person-months) |
|---|---|
| Kernel (orchestrator, planner, compiler, jobs, memory, RAG, assets, versions, security, storage) | 6–12 |
| Dashboard + editors (phased) | 8–18 |
| Image studio + style + character consistency | 4–9 |
| 3D pipeline (2D→3D, retopo, materials, Blender) | 8–18 |
| Rigging, animation, camera, storyboard | 4–8 |
| Video (Wan) + temporal QA | 3–6 |
| Audio (TTS, cloning, diarization) | 3–6 |
| Music (ACE-Step) + SFX | 2–4 |
| Narrative + world model | 3–6 |
| Godot generation | 4–10 |
| Ren'Py generation | 1–3 |
| O3DE integration | 12–24+ |
| Game coding agents + sandbox | 6–12 |
| QA analyzers + auto-repair | 6–12 |
| Installer, perf, remote compute | 4–8 |

**Resolution:** adopt the **vertical-slice strategy** (§6 of ROADMAP.md). The kernel is built once
and stays; each media domain lands as a complete slice. The feature matrix (§7 ROADMAP.md) stays
public and honest. "100%" is the long-term target; every shipped phase is real.

### P2 — The hardware envelope is undefined. *(Blocking)*
Video generation (Wan 2.2-14B) wants ~16–24 GB VRAM; 3D rendering and music want a modern GPU;
an LLM for planning wants 8–16 GB. "Runs on the user's machine" is not a spec.

**Resolution:** define **hardware profiles** (Minimal / Standard / Pro / Studio) and make the
resource manager and model router *profile-aware* (ROADMAP.md §3). The dashboard must tell the
user honestly what will and won't run on their hardware.

### P3 — "No MVP" contradicts "phased delivery". *(Contradiction)*
The prompt bans MVP/demo/prototype but demands 25 sequential phases. If Phase 1 ships a
"Core + Orchestrator" with nothing producing real media, that *is* a skeleton — which the prompt
would call a mock if it faked anything. The resolution is in *what* each phase delivers.

**Resolution:** every milestone ships a **real, tested vertical slice**, and the "horizontal"
layers are only ever built as thin, *functional* infrastructure that slices pass through — never
as stubs. A skeleton is not a mock if it executes real tasks, writes real files, and resumes
after a crash. Mocks are banned; infrastructure is fine.

### P4 — The three game engines are not equals. *(Effort mismatch)*
Ren'Py (export a scripted project, run `renpy lint`) ≈ weeks. Godot (project generation, scenes,
scripts, headless export) ≈ months. O3DE ≈ a separate multi-year product to integrate properly.

**Resolution:** tier the integrations. Ren'Py and Godot are product targets. O3DE becomes an
**explicit stretch goal**, gated by a milestone checkpoint, not a promise.

### P5 — "Visual editor" (§59) is three full products in one bullet.
A canvas editor with layers/masks/annotations, a timeline editor, a camera-path editor, and a 3D
preview are each substantial applications.

**Resolution:** phase the editors. Start with an asset-aware dashboard + lightweight canvas and
timeline; use the *engines themselves* (Blender, Godot) as the deep editors, launched from UCE,
rather than re-implementing Blender in the browser. Acceptable per §2 — tools are internal engines.

### P6 — Auto-repair (§49) overpromises for arbitrary failures.
"Regenerate the wrong thing" is algorithmic for images (known seed, known prompt) but not for
arbitrary 3D topology or video artifacts. Repair loops that never converge waste GPU-hours.

**Resolution:** every repair loop gets a **configurable max-attempts budget**, a diagnosis step
that must produce a concrete hypothesis, and escalation to human-in-the-loop (§89) when the budget
is exhausted. "Repair succeeded" is only claimed when re-QA passes.

### P7 — Voice cloning needs a consent gate (ethics + legality).
The prompt correctly requires authorization in §34 but lists cloning as a core feature elsewhere.

**Resolution:** voice cloning is a **consent-gated capability**: explicit user confirmation, stored
with the voice asset, and the voice never leaves the machine (§66/§67). This is a compliance
feature, not friction.

### P8 — Missing operational concerns the prompt never mentions.
- **Disk management**: models are multi-GB; a registry of 10 models can exceed 100 GB. Need quotas, cleanup, and a download/verify/update flow (§82 needs this anyway).
- **Backup / disaster recovery** for projects and the database.
- **CI/CD and test infrastructure** — the only way to honor §72–§78 is a test pipeline that runs the real E2E on every change.
- **Multi-user concurrency** — the prompt has ADMIN/USER but no concurrency model. Decide: single-user default, multi-user optional later (affects DB choice).
- **Packaging/installer reality**: Windows + GPU drivers + CUDA + Python + Node + Blender is a support matrix, not a script. Needs honest system detection and a "doctor" command.
- **Cost/energy** visibility for remote compute (§12).
- **Error UX**: §71 demands structured errors — also needs a user-facing way to see them.

**Resolution:** folded into the architecture (ARCHITECTURE.md) and roadmap (M0, M11, M12).

### P9 — License nuance is more dangerous than the prompt admits.
- Open weights ≠ open code (e.g., code Apache, weights non-commercial).
- GPL boundary: Blender (GPL-3.0) and ComfyUI (GPL-3.0) are fine as **external processes** we
  script over subprocess/HTTP, but their code must not be linked into the engine — otherwise the
  engine inherits copyleft. Default plan: use `bpy` via headless Blender (external), use
  `diffusers` directly for SD/FLUX/Qwen (Apache-2.0) instead of embedding ComfyUI.
- Dataset licenses matter for training/fine-tunes; for inference-only usage they are lower risk
  but must still be recorded (§4).

**Resolution:** the licensing firewall records code + weights + dataset licenses per component and
blocks installation on incompatibility (see §5 table). Blender/ComfyUI policy: external-process
only, never imported.

### P10 — "Done" needs operationalization.
§96 is correct but not executable as prose. "Real execution validated" needs a checklist per
feature.

**Resolution:** a **Definition of Done** template (ROADMAP.md §1): interface + implementation +
unit test + integration test + real execution with real output + QA result + versioned artifact +
documentation. Milestones don't close without it.

### P11 — The module list (§6) mixes layers.
It lists kernels, domains, adapters, and UI all flat, which invites dependency spaghetti.

**Resolution:** reorganized into four layers with strict dependency direction
(ARCHITECTURE.md §2): Kernel → Domains → Adapters → Workers, with the Dashboard as a client of the
kernel's API.

### P12 — Model landscape moves fast; the spec freezes specific names.
Wan 2.2 is already superseded by newer Apache-2.0 video models; FLUX.1-dev is non-commercial;
Qwen-Image and ACE-Step are Apache-2.0. Any hardcoded list rots.

**Resolution:** models are **data, not code** (§4 of ARCHITECTURE.md): a registry with
capabilities, licenses, and VRAM; the router picks from what's installed. The roadmap's model
candidates are a starting point, re-researched per phase.

---

## 4. Feasibility map by domain (honest labels)

| Domain | Verdict | Notes |
|---|---|---|
| LLM workspace, narrative, planner | **Doable, mature** | Local LLMs (Qwen3 etc.) are production-capable today. |
| Image generation, editing, inpainting, upscaling | **Doable, mature** | SD/FLUX/Qwen-Image via diffusers; consistency via reference conditioning is good but not perfect. |
| Character sheets / turnarounds | **Doable with QA-gated consistency** | Multi-view consistency is a solved-enough problem with reference/control conditioning; per-view regeneration per §19 is right. |
| 2D→3D reconstruction | **Best-effort, QA-gated** | Auto-retopo of arbitrary characters is approximate; gate with topology QA and HITL. |
| 3D modeling/rigging via Blender | **Doable (procedural subset)** | Full character rigs are automatable; high-quality *artistic* modeling is not — scope as procedural + human touch. |
| Lip-sync | **Doable** | Phoneme→blendshape pipelines exist; quality varies; audio-driven sync is approximate. |
| Animation | **Doable (procedural + keyframe)** | Locomotion/gesture libraries + Blender automation; cinematic-quality animation remains human territory. |
| Video generation (Wan) | **Doable, quality-limited** | Apache-2.0, runs locally; identity preservation and long-range consistency are imperfect → temporal QA + short clips + HITL. |
| TTS / voice | **Doable** | Kokoro/CosyVoice-class models are production-capable; cloning needs the consent gate (P7). |
| Music (ACE-Step) | **Doable** | Apache-2.0, consumer-GPU class per v1.5. |
| Game generation (Godot) | **Partial** | Generating playable, *well-designed* games is an open research problem; generating *buildable, lint-clean* projects is doable. QA automation is the honest gate. |
| Visual novels (Ren'Py) | **Doable** | Scripted branching + assets → lint-clean export is achievable. |
| O3DE | **Stretch only** | See P4. |
| Automated game QA (agentic play) | **Research-grade** | Smoke tests, headless run, log analysis, screenshots + vision LLM: doable. Autonomous bug-fixing agents: ambitious, HITL-gated. |
| Auto-repair across all media | **Partial** | Strong for images (deterministic regen), weak for 3D/video; budget + HITL (P6). |

---

## 5. Licensing quick-reference (checked 2026-09-07)

Verified via web research today; the licensing firewall re-verifies each component at install time
with the full §4 schema (name, version, code license, weights license, dataset license, commercial
use, redistribution, modification, restrictions, source, checked date).

| Component | Code license | Weights license | Commercial use | Notes |
|---|---|---|---|---|
| Wan 2.2 (video) | Apache-2.0 | Apache-2.0 | ✅ | Also check Wan 2.7-class successors at phase research |
| ACE-Step (music) | Apache-2.0 | Apache-2.0 | ✅ | v1.5 targets consumer GPUs |
| Qwen-Image / Qwen-Image-Edit | Apache-2.0 | Apache-2.0 | ✅ | |
| FLUX.1-schnell | Apache-2.0 | Apache-2.0 | ✅ | |
| FLUX.1-dev | — | **Non-commercial** | ❌ | Classic code/weights trap — excluded by default |
| SD 1.5 / SDXL | — | CreativeML OpenRAIL-M | ✅ (with use restrictions) | Verify current status at phase research |
| Blender | GPL-3.0 | n/a | ✅ (outputs) | **External process only** — never link into engine |
| ComfyUI | GPL-3.0 | n/a | ✅ (outputs) | **External process only**; default is direct `diffusers` to avoid copyleft |
| Godot | MIT | n/a | ✅ | |
| Ren'Py | MIT-style (permissive) | n/a | ✅ | Verify exact terms at phase research |
| O3DE | Apache-2.0 | n/a | ✅ | |
| Qwen3 family (LLM) | Apache-2.0 | Apache-2.0 | ✅ | Candidate for planner/narrative |
| Kokoro / CosyVoice (TTS) | Apache-2.0 | Apache-2.0 | ✅ | Verify at phase research |
| F5-TTS | MIT (code) | **verify** | ⚠️ | Weights license must be confirmed before use |
| llama.cpp / llama-cpp-python | MIT | n/a | ✅ | |
| FastAPI, SQLAlchemy, Pydantic, React, Vite, diffusers, torch | permissive (MIT/Apache/BSD) | n/a | ✅ | |

Rule: **Apache-2.0/MIT preferred; OpenRAIL-class only with restrictions recorded; non-commercial
weights excluded unless the user explicitly authorizes them.**

---

## 6. Amended principles (the rules we adopt)

1. Build a **monolithic kernel** that is real, restartable, and DB-backed, and **isolated
   workers** for anything heavy, risky, or external. (§6 + P1)
2. Ship **vertical slices**, each 100% real and tested; the feature matrix never lies. (§96 + P3)
3. **Offline-first, permissive-only, consent-gated** (voice cloning). (§66/§67 + P7)
4. **Everything reproducible and rollback-able.** (§52/§91)
5. **Repair loops have budgets and escalate to humans.** (§49 + P6)
6. **Models are data.** The router picks from an installed registry; no hardcoded model names in
   the kernel. (§84/§92 + P12)
7. **No copyleft linking**: GPL tools are external processes only. (§4 + P9)
8. **Hardware profiles are a first-class concept**; the system tells the truth about what runs. (P2)
9. **A feature is COMPLETE only after real execution + QA + versioning + docs.** (§72/§96)

---

## 7. Decisions required from the user

1. **Hardware profile** (Minimal / Standard / Pro / Studio) — determines which domains can ship
   and how the router is configured. *(blocking)*
2. **Tech stack sign-off** — Python engine core + React dashboard (recommended) vs. alternatives.
   *(blocking M0)*
3. **First vertical slice** after the kernel: Image→Character (recommended) / Narrative / 3D.
4. **O3DE**: in scope as stretch goal, or explicitly out?
5. **Multi-user**: single-user desktop first (recommended), multi-user later?
6. **Remote compute** (Colab/GPU cloud, §12): in scope for v1 or v2?

These are captured as open questions in ARCHITECTURE.md §9 and ROADMAP.md §8.