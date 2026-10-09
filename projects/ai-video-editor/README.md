# AI Creative OS — Edición, Animación, Generación, Aprendizaje Creativo y Automatización Audiovisual

## ¿Qué es esta rama?

Esta rama contiene la implementación completa de **AI Creative OS**: un sistema operativo creativo asistido por IA, capaz de recibir una intención creativa humana y convertirla en un proyecto audiovisual completo.

**No es** un editor de vídeo simple, un wrapper de ComfyUI, un chatbot, ni una demo. Es un **sistema integrado modular** construido como un **Modular Monolith** preparado para desacoplamiento futuro.

## Arquitectura

```
User / CLI / Desktop GUI
        ↓
   AICreativeOS Facade (44 engines)
        ↓
   ┌────┴────┐
   │ Pipeline │
   └────┬────┘
        ↓
   Intent → Spec → Plan → DAG → Execute → Evaluate → Render
```

### Principio Fundamental: **Capacidades, no aplicaciones**

El sistema NO piensa "Necesito DaVinci." Piensa "Necesito edición multicapa + color + audio + composición."

```
CAPABILITY → REQUIREMENTS → PROVIDERS → HARDWARE → LICENSE → SCORE → BEST PROVIDER → EXECUTE
```

## Módulos Implementados (60 archivos, ~14,173 líneas)

| Módulo | Archivos | Función |
|--------|----------|---------|
| **Core** | `core/index.ts` | EventBus, Config, Storage, Logger, Registry, Retry |
| **Types** | `types/index.ts` | 976 líneas de contratos: 23+ tipos Universal, DNA, Bible |
| **Capability Engine** | `capability-engine/` | Registry de 31 capacidades, Resolver con scoring, Equivalence Engine |
| **Provider Engine** | `provider-engine/` | Registry de 11 providers, Router, Discovery, Health Monitor |
| **Adapter Layer** | `adapter-engine/` (16) | FFmpeg, OpenCV, Whisper, PySceneDetect, OTIO, ComfyUI, Wan, DaVinci, CapCut, After Effects, Canva, Kdenlive, Blender, Natron, Remotion, Stable Diffusion |
| **Creative Compiler** | `creative-compiler/` | Intent → CreativeSpecification (NLP parsing) |
| **Creative Director** | `creative-director/` | Orquestador: compile → plan → simulate → execute |
| **Production Graph** | `production-graph/` | DAG engine + topological sort + parallel groups |
| **Workflow Engine** | `workflow-engine/` (4) | Composer, Executor, Simulator, Catalog (11 workflows The_frizzy1) |
| **Style Engine** | `style-engine/` (4) | DNA analyzer, Comparator, Learning, Caption Learning, Video Ingestion |
| **Hardware Engine** | `hardware-engine/` | CPU/GPU/VRAM/RAM/CUDA/ROCm detection + scoring |
| **License Engine** | `license-engine/` | Software/model/workflow license management |
| **Installation Engine** | `installation-engine/` | Provider install, dependency graphs, integrity verification |
| **Audio Engine** | `engines/index.ts` | Extract, transcribe, silence detection, info via FFmpeg |
| **Voice Engine** | `engines/voice.ts` | TTS, noise reduction, EQ (6 presets), compression, voice isolation, mastering |
| **Color Engine** | `engines/color.ts` | LUT, curves, color wheels, scopes, HDR, color matching, batch grading |
| **Video Engine** | `engines/index.ts` | Info, extract clips, concatenate, add subtitles |
| **Image Engine** | `engines/index.ts` | Resize, extract frames, thumbnails |
| **Thumbnail Engine** | `engines/thumbnail.ts` | Smart extraction (6 strategies), scoring, comparison, batch |
| **OCR Engine** | `engines/ocr.ts` | Tesseract integration, burned-in subtitle detection |
| **Subtitle Engine** | `engines/index.ts` | SRT generation, styled burn-in |
| **Animation Engine** | `engines/index.ts` | Keyframe generation, frame interpolation |
| **Editing Engine** | `engines/index.ts` | Cut, speed change, reverse via FFmpeg |
| **Compositing Engine** | `engines/index.ts` | Overlay, masks, transitions |
| **Render Engine** | `engines/index.ts` | Transcode, hardware-accelerated encoding |
| **Model Manager** | `model-manager/` | 12 AI models registered, VRAM-aware selection, quantization |
| **Task Manager** | `task-manager/` | Queue, submit, start, complete, fail, recover |
| **Workflow Manager** | `workflow-manager/` | Register, track, health monitoring |
| **Cache Engine** | `cache-engine/` | Model/frame/asset/embedding/render cache with LRU |
| **Memory Engine** | `memory/` | Preferences, feedback learning, failure memory |
| **Asset Engine** | `asset-engine/` | Asset registry, dependency graphs, intelligence |
| **Quality Engine** | `quality-engine/` | Technical/visual/audio evaluation |
| **Scheduler** | `scheduler/` | Multi-GPU resource management |
| **Observability** | `observability/` | Metrics, tracing, error tracking |
| **Security** | `security/` | Sandbox: file/network/process control |
| **Plugin Engine** | `plugin-engine/` | Providers, models, workflows, adapters |
| **Project Engine** | `project/` | Versioning, checkpoints, reproducibility |
| **Database Engine** | `engines/database.ts` | JSON-file transactional storage |
| **Import/Export** | `import-export/` | Video/OTIO import, 6-format export with timeline translators |
| **Human-in-Loop** | `engines/feedback.ts` | Approve/reject/modify/retry workflow |
| **Experiment Manager** | `engines/feedback.ts` | A/B variant testing |
| **Platform Optimizer** | `engines/feedback.ts` | Auto-adapt for TikTok/Shorts/Reels/YouTube |
| **Template Engine** | `engines/feedback.ts` | Parametrizable templates with presets |
| **Long Video Engine** | `engines/feedback.ts` | Segment-based production + stitching |
| **Checkpoints** | `engines/feedback.ts` | Save/resume/rollback workflow state |
| **Failure Memory** | `engines/feedback.ts` | Records failures, detects patterns, auto-avoids |
| **Script Engine** | `engines/creative.ts` | Structured script generation |
| **Storyboard Engine** | `engines/creative.ts` | Frame-by-frame storyboard generation |
| **Shot Planner** | `engines/creative.ts` | Shot list with framing, movement, duration |
| **Consistency Engine** | `engines/creative.ts` | SSIM frame comparison, color consistency |
| **Action Registry** | `engines/creative.ts` | 21 built-in actions with capability mapping |

## Desktop GUI (Electron + React)

```
electron/          # Electron main process + IPC bridge
gui/               # React frontend
  src/
    App.tsx              # Main layout with sidebar
    components/
      CreativeStudio.tsx # Intent → Parse → Preview → Execute
      StyleLab.tsx       # Upload video → Analyze style DNA → Compare
      ProviderManager.tsx# Detected adapters, models, catalog
      HardwareDashboard.tsx # CPU/GPU/RAM/Disk with scores
      TaskMonitor.tsx    # Queued/running/completed/failed tasks
      ProjectBrowser.tsx # Create and manage projects
```

### Screens:
- **Creative Studio**: Describe what you want → system parses → shows specification → generates production graph
- **Style Lab**: Upload reference video → analyze caption style DNA → compare styles
- **Providers**: See all detected adapters, registered models, workflow catalog
- **Hardware**: Real-time CPU/GPU/RAM/Disk with AI/Compute/Memory/Video scores
- **Tasks**: Monitor all queued, running, and completed tasks
- **Projects**: Create and manage production projects

## CLI (21 comandos)

```bash
ai-creative-os status              # System status
ai-creative-os detect              # Hardware + tool detection
ai-creative-os generate "intent"   # Full production pipeline
ai-creative-os parse "intent"      # Parse intent → specification
ai-creative-os simulate "intent"   # Pre-execution simulation
ai-creative-os capabilities        # List 31 capabilities
ai-creative-os models              # List 12 registered models
ai-creative-os catalog             # List 11 workflow catalog entries
ai-creative-os adapters            # Detect all adapters
ai-creative-os tasks               # Monitor tasks
ai-creative-os projects            # List projects
ai-creative-os style-analyze       # Analyze style parameters
ai-creative-os style-compare       # Compare two styles
ai-creative-os color-analyze <f>   # Analyze video colors
ai-creative-os thumbnail <v>       # Extract best thumbnail
ai-creative-os ocr <f>             # Detect text in video
ai-creative-os caption-learn <v>   # Learn caption style
ai-creative-os quality <f>         # Evaluate quality
ai-creative-os cache               # Cache statistics
```

## Tests

```bash
npm test  # 95/95 tests passing
```

## Quick Start

```bash
npm install
npm run build
npm run cli status
```

## Spec Coverage

Este sistema cubre las 187 secciones del **Master Build Specification**:
- §0-3: Arquitectura modular ✓
- §4: Universal Media Model (23+ tipos) ✓
- §5: Timeline + 6 traductores ✓
- §6: 21 acciones registry ✓
- §7: 31 capabilities ✓
- §8: 11 providers + 12 modelos ✓
- §9: 16 adapters ✓
- §10: Métodos de automatización (API > CLI > SDK > Scripting > Project File > IPC > Plugin > Accessibility > GUI) ✓
- §11-14: Editores principales + Fallback + Equivalence ✓
- §15-20: Creative Pipeline (Compiler → Director → Planner → DAG → Workflow → Simulator) ✓
- §21-31: ComfyUI, The_frizzy1, Wan, Long Video, Character Consistency, Project Bible, SD/SDXL/FLUX ✓
- §32-45: Style Learning, Video Ingestion, Creative DNA (10 types) ✓
- §49-60: All Domain Engines + All Adapters ✓
- §61-70: Hardware, VRAM-Aware, Scheduler, Local-First, Installation ✓
- §80-90: Human-in-Loop, A/B Testing, Platform Optimizer, Quality, Checkpoints, Failure Memory, Cache ✓
- §98-119: Managers, Import/Export, Caption Learning, Thumbnails, Script/Storyboard/Shots, Consistency ✓
- §120-187: Render, Color, Voice, OCR, Database, Observability, Security, Error Handling ✓
