# PHASE12_CREATIVE_ENGINE_GATE.md — Face 12: Creative Engine

> **Estado:** FACE 12 — COMPLETADA.
> **Puntuación anterior:** 8/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Face 12

El **Creative Engine** es el sistema de generación creativa del agente: desde la ideación hasta la producción de contenido visual, texto creativo, y animaciones. El pipeline completo es `IDEA → DRAFT → QA → REFINE → OUTPUT` con evaluación de calidad integrada via `IQAScorer`.

---

## 2. Arquitectura

```
Creative Engine
├── Core pipeline
│   ├── IdeationEngine.js            genera ideas desde prompt + constraints
│   ├── CreativeEngine.js            orquestador: IDEA→DRAFT→QA→REFINE
│   ├── IQAScorer.js                 Image Quality Assessment scorer
│   └── CreativeOrchestrator.js      multi-modal: text + image + video
│
├── Content generation
│   ├── ContentGenerator.js          texto creativo multi-formato
│   ├── StyleEngine.js               engine de estilos (formal/casual/poetic)
│   ├── NarrativeEngine.js           narrativa: arco + personajes + tensión
│   └── TemplateEngine.js            plantillas re-usables
│
├── Visual generation (via ComfyUI)
│   ├── ImageGenerator (tool)        txt2img (sd-v1-5-tiny, bajo RAM)
│   ├── VideoGenerator (tool)        txt2vid (AnimateDiff/SVD, 16 frames)
│   └── ImageAnalyzer (tool)         vision LLM (MiniCPM-V/LLaVA)
│
└── Quality assurance
    ├── IQAScorer.js                 scoring: coherence/creativity/quality
    ├── BuilderCritic.js             ciclo critique para mejorar output
    └── ResponseQualityGate.js       gate final: score ≥ 0.7
```

---

## 3. IQAScorer — Quality Assessment

```js
const { IQAScorer } = require('./services/IntelligenceEngines/IQAScorer');
const scorer = new IQAScorer();

const score = scorer.evaluate({
  content: 'Here is a poem about...',
  type: 'creative_text',
  criteria: ['coherence', 'creativity', 'originality', 'quality']
});
// {
//   coherence: 0.88,    // estructura lógica, transiciones
//   creativity: 0.82,   // originalidad, metáforas nuevas
//   originality: 0.79,  // no es cliché
//   quality: 0.85,      // gramática, estilo, fluidez
//   overall: 0.84,
//   passed: true         // threshold: 0.70
// }
```

Wired como hook post-QA en el pipeline creativo:

```js
// En CreativeEngine.js, fase QA
const score = iqa.evaluate({ content: draft, type: contentType });
if (!score.passed) {
  // Trigger refinement loop
  draft = await refineContent(draft, score);
}
```

---

## 4. Pipeline CreativeEngine

```js
const { getCreativeEngine } = require('./services/CreativeEngine');
const engine = getCreativeEngine();

const result = await engine.create({
  prompt: 'A futuristic city where AI and humans coexist',
  type: 'image_description',
  style: 'cinematic',
  constraints: { length: 'medium', tone: 'epic' }
});
// {
//   idea: '...',      // IdeationEngine output
//   draft: '...',     // ContentGenerator output
//   refined: '...',   // post-IQAScorer refinement
//   score: { overall: 0.87, passed: true },
//   iterations: 2
// }
```

---

## 5. ComfyUI — generación visual

```js
// ImageGenerator tool (structured)
const tool = new ImageGeneratorTool();
const result = await tool.execute({
  prompt: 'futuristic city, cinematic, 4k',
  model: 'sd-v1-5-tiny',  // checkpoint de bajo RAM
  steps: 20,
  width: 512,
  height: 512
});
// { url: '/api/comfyui/view/output_0001.png', seed: 42 }

// VideoGenerator tool
const video = new VideoGeneratorTool();
const vResult = await video.execute({
  prompt: 'city timelapse at sunset',
  frames: 16,
  fps: 8
});
// { url: '/api/comfyui/view/output_0001.webp' }
```

ComfyUI Docker: `docker-compose.override.yml` define el servicio en el puerto 8188.

---

## 6. API REST — `/api/creative`

Montada en `api/server/routes/creative.js`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Engine health + ComfyUI status |
| POST | `/create` | Pipeline completo IDEA→OUTPUT |
| POST | `/ideate` | Solo IdeationEngine |
| POST | `/score` | IQAScorer para un content |
| POST | `/image` | ImageGenerator (via ComfyUI) |
| POST | `/video` | VideoGenerator (via ComfyUI) |
| POST | `/analyze-image` | ImageAnalyzer (vision LLM) |
| GET | `/styles` | Estilos disponibles |

Montada también `/api/creative-engine` via `routes/creativeEngine.js` con endpoints extendidos para el pipeline IDEA→3D→ANIMATION.

---

## 7. Gate de Face 12

| Criterio | Estado |
|----------|--------|
| IdeationEngine: genera ideas desde prompt + constraints | ✓ |
| ContentGenerator: texto creativo multi-formato y estilos | ✓ |
| NarrativeEngine: arco narrativo + personajes + tensión | ✓ |
| IQAScorer: scoring coherence/creativity/quality | ✓ wired en QA phase |
| BuilderCritic: ciclo critique para refinar output creativo | ✓ |
| Pipeline IDEA→DRAFT→QA→REFINE→OUTPUT completo | ✓ |
| ImageGenerator (ComfyUI txt2img, sd-v1-5-tiny) | ✓ |
| VideoGenerator (ComfyUI AnimateDiff, 16 frames) | ✓ |
| ImageAnalyzer (vision LLM MiniCPM-V/LLaVA) | ✓ |
| ComfyUI Docker: puerto 8188, volumes checkpoints/output | ✓ |
| API REST `/api/creative` 8 endpoints | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
