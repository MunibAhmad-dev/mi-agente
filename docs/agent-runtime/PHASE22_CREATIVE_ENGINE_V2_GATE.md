# PHASE22_CREATIVE_ENGINE_V2_GATE.md — Face 22: Creative Engine v2 (IDEA→3D→ANIMATION)

> **Estado:** FACE 22 — COMPLETADA.
> **Puntuación anterior:** 8/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Face 22

La segunda versión del Creative Engine implementa el pipeline extendido **IDEA → CONCEPTO → IMAGEN → 3D → ANIMACIÓN → OUTPUT**. Va más allá de la generación de texto e imágenes (Face 12) para incluir generación de assets 3D, animaciones, y un sistema de storyboarding. Todo el pipeline es orquestado por `CreativeOrchestrator` y accesible via ComfyUI.

---

## 2. Arquitectura — pipeline IDEA→3D→ANIMATION

```
Creative Engine v2
├── Ideation layer
│   ├── IdeationEngine.js             genera ideas desde prompt + mood + references
│   ├── ConceptExpander.js            expande la idea en concepto completo
│   └── StoryboardEngine.js           crea storyboard visual (secuencias + timing)
│
├── 2D generation (via ComfyUI txt2img)
│   ├── ImageGeneratorTool.js         txt2img con sd-v1-5-tiny (bajo RAM)
│   ├── StyleTransferEngine.js        aplica estilo visual de referencia
│   └── VariationEngine.js            genera N variaciones de una imagen
│
├── 3D generation
│   ├── ThreeDEngine.js               descripción → prompt 3D optimizado
│   ├── ModelPromptBuilder.js         builds prompts para modelos 3D
│   └── AssetPipeline.js             gestiona assets 3D: GLB/FBX/OBJ
│
├── Animation layer
│   ├── AnimationEngine.js            secuencia de frames → animación
│   ├── VideoGeneratorTool.js         AnimateDiff/SVD 16 frames via ComfyUI
│   └── MotionPlannerEngine.js        plan de movimiento: keyframes + easing
│
├── Quality assurance
│   ├── IQAScorer.js                  calidad visual (face 12)
│   ├── AestheticScorer.js            scoring estético: composición/color/balance
│   └── CreativeOutputValidator.js    valida que output cumple el brief
│
└── CreativeOrchestrator.js           orquestador del pipeline completo
```

---

## 3. Pipeline completo — IDEA to ANIMATION

```js
const { CreativeOrchestrator } = require('./services/CreativeEngine');
const orchestrator = new CreativeOrchestrator();

const result = await orchestrator.createFull({
  idea: 'A robot discovering a forgotten library in a post-apocalyptic world',
  style: 'cinematic', 
  mood: 'melancholic',
  output: ['storyboard', 'keyframes', 'animation'],
  duration: 5,   // segundos de animación
});
// {
//   concept: {
//     summary: '...',
//     themes: ['discovery', 'solitude', 'hope'],
//     palette: ['#1a1a2e', '#16213e', '#e94560'],
//     mood: 'melancholic'
//   },
//   storyboard: [
//     { frame: 1, description: 'Wide shot: ruins...', timing: '0-1s' },
//     { frame: 2, description: 'Robot enters...', timing: '1-3s' },
//     { frame: 3, description: 'Close-up: book...', timing: '3-5s' }
//   ],
//   keyframes: [Buffer, Buffer, Buffer],   // images ComfyUI
//   animation: Buffer,                     // webp animado
//   quality: { iqa: 0.82, aesthetic: 0.79, passed: true }
// }
```

---

## 4. StoryboardEngine

```js
const { StoryboardEngine } = require('./services/CreativeEngine');
const sb = new StoryboardEngine();

const storyboard = sb.create({
  concept: 'Robot in library',
  duration: 5,
  shots: 3,
  style: 'cinematic',
});
// {
//   shots: [
//     { id: 1, type: 'wide', description: '...', prompt: 'wide shot, ruins, sunset, cinematic', timing: '0-1.5s' },
//     { id: 2, type: 'medium', description: '...', prompt: '...', timing: '1.5-3.5s' },
//     { id: 3, type: 'close_up', description: '...', prompt: '...', timing: '3.5-5s' }
//   ],
//   transitions: ['cut', 'dissolve'],
//   totalDuration: 5
// }
```

Tipos de shot: `extreme_wide`, `wide`, `medium`, `close_up`, `extreme_close_up`, `overhead`, `low_angle`.

---

## 5. AnimationEngine + VideoGeneratorTool

```js
const { AnimationEngine } = require('./services/CreativeEngine');
const animator = new AnimationEngine();

// Planificar movimiento
const motionPlan = animator.plan({
  subject: 'robot walking',
  duration: 5,
  keyframes: [
    { time: 0, state: 'standing', position: { x: 0 } },
    { time: 2.5, state: 'walking', position: { x: 50 } },
    { time: 5, state: 'stopping', position: { x: 100 } }
  ],
  easing: 'ease-in-out',
});

// Generar animación via ComfyUI AnimateDiff
const video = await animator.generate({
  prompt: 'robot walking through library, cinematic, 4k',
  frames: 16,
  fps: 8,
  motion_bucket_id: 127,  // SVD parameter
});
// { url: '/api/comfyui/view/animation_001.webp', frames: 16, duration: 2 }
```

---

## 6. AestheticScorer

```js
const { AestheticScorer } = require('./services/CreativeEngine');
const scorer = new AestheticScorer();

scorer.score({
  type: 'image_description',
  content: 'A dramatic wide shot of a robot standing in golden hour light...',
});
// {
//   composition: 0.88,   // rule of thirds, leading lines, balance
//   color: 0.85,         // harmony, contrast, saturation
//   lighting: 0.91,      // golden hour, dramatic shadows
//   storytelling: 0.79,  // narrative content, emotion
//   overall: 0.86
// }
```

---

## 7. API REST — `/api/creative-engine`

Montada en `api/server/routes/creativeEngine.js`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Health + ComfyUI status |
| POST | `/create-full` | Pipeline IDEA→3D→ANIMATION completo |
| POST | `/ideate` | IdeationEngine + ConceptExpander |
| POST | `/storyboard` | StoryboardEngine |
| POST | `/keyframes` | Generar keyframes de storyboard |
| POST | `/animate` | AnimationEngine + VideoGeneratorTool |
| POST | `/score/iqa` | IQAScorer |
| POST | `/score/aesthetic` | AestheticScorer |
| GET | `/styles` | Estilos disponibles |
| GET | `/moods` | Moods disponibles |

---

## 8. Diferencia con Face 12 (Creative Engine v1)

| Dimensión | Face 12 (v1) | Face 22 (v2) |
|-----------|-------------|-------------|
| Pipeline | IDEA→DRAFT→QA→OUTPUT | IDEA→CONCEPTO→IMAGEN→3D→ANIMATION |
| Storyboard | No | ✓ StoryboardEngine |
| 3D assets | No | ✓ ThreeDEngine |
| Animation | VideoGenerator básico | ✓ AnimationEngine + MotionPlannerEngine |
| Scoring | IQAScorer | ✓ IQAScorer + AestheticScorer + CreativeOutputValidator |
| Orquestador | CreativeEngine.create() | ✓ CreativeOrchestrator.createFull() |

---

## 9. Gate de Face 22

| Criterio | Estado |
|----------|--------|
| IdeationEngine + ConceptExpander (idea → concepto completo) | ✓ |
| StoryboardEngine (shots + timing + transitions) | ✓ |
| StyleTransferEngine + VariationEngine | ✓ |
| ThreeDEngine + ModelPromptBuilder + AssetPipeline | ✓ |
| AnimationEngine + MotionPlannerEngine (keyframes + easing) | ✓ |
| VideoGeneratorTool (AnimateDiff/SVD via ComfyUI) | ✓ |
| IQAScorer wired en QA phase | ✓ |
| AestheticScorer (composición/color/iluminación/narrativa) | ✓ |
| CreativeOutputValidator (verifica que output cumple brief) | ✓ |
| CreativeOrchestrator: pipeline completo IDEA→ANIMATION | ✓ |
| API REST `/api/creative-engine` 10 endpoints | ✓ |
| Diferenciación clara de Face 12 v1 | ✓ |
| ComfyUI Docker integrado (puerto 8188) | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
