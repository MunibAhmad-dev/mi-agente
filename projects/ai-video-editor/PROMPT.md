# Prompt Original Usado para Crear AI Creative OS

Este archivo contiene el prompt completo que se utilizó para construir todo el sistema implementado en esta rama.

---

## MASTER BUILD SPECIFICATION

### AI CREATIVE OS 10/10

**Sistema Universal Local-First para Edición, Animación, Generación, Aprendizaje Creativo y Automatización Audiovisual**

---

### 0. MISIÓN DEL PROYECTO

Construir una plataforma profesional denominada provisionalmente: **AI CREATIVE OS**

La plataforma debe convertirse en un sistema operativo creativo asistido por IA, capaz de recibir una intención creativa humana y convertirla en un proyecto audiovisual completo.

**No debe ser:**
- un simple editor de vídeo;
- un wrapper de ComfyUI;
- un chatbot;
- una colección de scripts;
- una interfaz que haga clics;
- un launcher de aplicaciones;
- un MVP;
- una demo;
- un conjunto de integraciones desconectadas.

**Debe ser un sistema integrado capaz de:**
- planificar; analizar; generar; editar; animar; componer; mezclar; renderizar;
- evaluar; corregir; aprender; recordar; reutilizar;
- sustituir herramientas; instalar dependencias; optimizar recursos;
- recuperarse de errores; trabajar localmente; funcionar con diferentes niveles de hardware;
- utilizar software propietario cuando el usuario lo tenga;
- utilizar alternativas abiertas cuando no lo tenga;
- construir workflows dinámicos; aprender estilos audiovisuales a partir de referencias;
- mantener consistencia de personajes y escenarios;
- producir vídeos cortos y largos; entregar archivos finales y proyectos editables.

### 1. PRINCIPIO FUNDAMENTAL

La arquitectura NO debe estar centrada en aplicaciones. Debe estar centrada en: **CAPACIDADES**

La IA no debe pensar: "Necesito DaVinci." Debe pensar: "Necesito edición multicapa + color + audio + composición."

```
CAPABILITY → REQUIREMENTS → AVAILABLE PROVIDERS → HARDWARE COMPATIBILITY
→ LICENSE COMPATIBILITY → QUALITY/SPEED SCORE → BEST PROVIDER
→ FALLBACK PROVIDERS → EXECUTION
```

### 2. ARQUITECTURA DE ALTO NIVEL

```
USER / UI
    ↓
AI CREATIVE DIRECTOR
    ↓
CREATIVE COMPILER (Intent → Creative Specification)
    ↓
PRODUCTION PLANNER
    ↓
PRODUCTION GRAPH (DAG / Workflow)
    ↓
CAPABILITY ENGINE → PROVIDER ROUTER → ADAPTER LAYER
    ↓
EXTERNAL / LOCAL PROVIDERS
```

En paralelo: Hardware Engine, License Engine, Memory Engine, Asset Engine, Style Engine, Quality Engine, Security Engine, Observability Engine, Installation Engine

### 3. ARQUITECTURA MODULAR

**MODULAR MONOLITH PREPARADO PARA DESACOPLAMIENTO**

Cada módulo debe tener: interfaz, contratos, eventos, DTOs, servicios, repositorios, tests, dependencias explícitas.

Módulos principales: Core, CreativeDirector, CreativeCompiler, Planning, ProductionGraph, Capability, Provider, Adapter, Media, Timeline, Asset, Style, Memory, Model, Workflow, Hardware, Scheduler, Installation, License, Audio, Animation, Image, Video, Editing, Compositing, Template, Quality, Evaluation, Security, Observability, Plugin, Project, Export, Import, Testing

### 4. UNIVERSAL MEDIA MODEL

Crear una representación audiovisual independiente de cualquier editor:
UniversalProject, UniversalSequence, UniversalTrack, UniversalClip, UniversalAudioClip, UniversalImage, UniversalVideo, UniversalText, UniversalCaption, UniversalEffect, UniversalTransition, UniversalMask, UniversalKeyframe, UniversalAnimation, UniversalCamera, UniversalTransform, UniversalColorGrade, UniversalMarker, UniversalAutomation

### 5. UNIVERSAL TIMELINE

Traducible a: DaVinci, CapCut, After Effects, Kdenlive, Blender, FFmpeg, otros formatos.

Cuando una característica no tenga equivalente: Supported, Converted, Approximated, Unsupported. **Nunca ocultar pérdidas.**

### 6. UNIVERSAL ACTION REGISTRY

CUT_CLIP, SPLIT_CLIP, TRIM_CLIP, MOVE_CLIP, DUPLICATE_CLIP, DELETE_CLIP, SPEED_CHANGE, REVERSE_CLIP, CROP, RESIZE, ROTATE, ZOOM, PAN, KEYFRAME, MASK, TRACK, REROUTE_AUDIO, ADD_CAPTION, ADD_TRANSITION, COLOR_CORRECT, COLOR_GRADE, ADD_EFFECT, COMPOSITE, RENDER, EXPORT, IMPORT

### 7-8. CAPABILITY + PROVIDER REGISTRY

Registrar TODAS las capacidades y CADA herramienta como Provider con: id, name, version, source, license, capabilities, api, cli, sdk, scripting, gui_automation, project_format, hardware, VRAM, RAM, CPU, OS, installation, configuration, health, quality, speed, fallbacks, dependencies.

### 9. ADAPTER LAYER

Obligatorios: FFmpeg, DaVinci, CapCut, After Effects, Canva, Kdenlive, Blender, Natron, ComfyUI, Wan, OpenTimelineIO, Whisper, OpenCV, PySceneDetect

### 10. MÉTODOS DE AUTOMATIZACIÓN

Prioridad: 1. Native API → 2. CLI → 3. SDK → 4. Official scripting → 5. Project-file manipulation → 6. IPC → 7. Plugin → 8. Accessibility automation → 9. GUI automation

### 11-14. EDITORES PRINCIPALES + FALLBACK + EQUIVALENCIA

CapCut (TikTok/Shorts), DaVinci Resolve (profesional/color/Fairlight), After Effects (motion/VFX), Canva (templates/social).

Sistema de fallback con Capability Equivalence Engine: Exact → Near → Partial → Alternative Workflow

### 15-20. CREATIVE COMPILER + DIRECTOR + PRODUCTION GRAPH + WORKFLOW

Intent → CreativeSpecification → ProductionGraph → ExecutableWorkflow
Con simulación pre-ejecución: Validate → Dependencies → Models → VRAM → RAM → Disk → License → Estimated time → Risk → Execute

### 21-31. COMFYUI, THE_FRIZZY1, WAN 2.2, LONG VIDEO, CHARACTER CONSISTENCY

- ComfyUI como motor de workflows (opcional, GPL-3.0)
- The_frizzy1-Workflows como catálogo (MIT)
- Wan 2.1/2.2/2.2 Animate correctamente diferenciados
- Long video por segmentos con stitching
- Character Bible: rostro, cuerpo, ropa, accesorios, colores, estilo

### 32-45. STYLE LEARNING ENGINE

Ingesta de vídeo de referencia → Análisis (FFmpeg, OpenCV, PySceneDetect, Whisper, OCR) → CreativeDNA (10 tipos) → Parámetros → Comparación → Mixing → Seguridad de replicación

### 49-60. DOMAIN ENGINES + ALL ADAPTERS

Audio, Image, Video, Animation, Editing, Compositing, Render, Subtitles + todos los adapters

### 61-70. HARDWARE + VRAM-AWARE + SCHEDULER + LOCAL-FIRST

- Detección: CPU, GPU, VRAM, RAM, Disk, CUDA, ROCm, Drivers, OS
- Selección automática: Full Precision → FP8 → Q8 → Q6 → Q5 → Q4 → Q3 → Q2
- Local-first: Nunca exigir API de pago para funciones que puedan realizarse localmente

### 80-90. FEEDBACK, EXPERIMENTS, PLATFORM, QUALITY, CACHE

- Human-in-the-Loop: approve/reject/modify/retry
- A/B Testing: variantes con scoring automático
- Platform Optimizer: TikTok, YouTube Shorts, Instagram Reels, YouTube
- Quality Control: technical, visual, audio, narrative, continuity, style
- Checkpoints + Failure Memory + Cache Engine

### 98-119. MANAGERS, IMPORT/EXPORT, CAPTION LEARNING, SCRIPTS

- Model/Workflow/Task Managers
- Import/Export con 6 timeline translators
- Caption Style Learning desde vídeos de referencia
- Thumbnail Engine con 6 estrategias
- Script, Storyboard, Shot Planner
- Consistency Engine (SSIM + color)

### 120-187. RENDER, COLOR, VOICE, OCR, DATABASE, OBSERVABILITY, SECURITY

- Render Engine con hardware acceleration
- Color Engine: LUT, curves, wheels, scopes, HDR
- Voice Engine: TTS, noise reduction, EQ, compression, mastering
- OCR: Tesseract integration
- Database: JSON-file transactional storage
- Observability: metrics, tracing, errors
- Security: sandbox (file/network/process)

---

### RESULTADO ESPERADO

El usuario debe poder pasar de:
> "Quiero hacer este vídeo."

A:
> "El sistema entendió qué quiero, aprendió el estilo que seleccioné, eligió las herramientas disponibles, generó los assets, animó, editó, mezcló, corrigió los errores, optimizó los recursos, respetó las licencias y me entregó el proyecto final editable."

**Ese es el criterio definitivo de éxito.**
