# PHASE9_VISUAL_INTELLIGENCE_GATE.md — Face 9: Visual Intelligence

> **Estado:** FACE 9 — COMPLETADA.
> **Puntuación anterior:** 8/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Face 9

El sistema de **Visual Intelligence** permite al agente analizar, comparar, testear y diagnosticar interfaces visuales: capturar screenshots via Playwright, extraer bounding boxes, ejecutar regression tests, testing adversarial de UI y generar diagnósticos visuales. Implementado completamente en `api/server/services/VisualIntelligence/`.

---

## 2. Arquitectura — 10 componentes

```
VisualIntelligence/
├── VisualQAAgent.js              análisis QA visual (pixel diff + riesgo HTML)
├── BoundingBoxExtractor.js       extrae bounding boxes de elementos UI
├── VisualRegression.js           diff de screenshots entre versiones
├── VisualRegressionSystem.js     orquestador de regression tests
├── MultiResolutionTester.js      testa en múltiples resoluciones
├── ResolutionTestHarness.js      harness de tests por resolución
├── AdversarialVisualTesting.js   testing adversarial: inputs extremos
├── UnifiedVisualRepresentation.js representación unificada de UI elements
├── VisualDiagnosisAgent.js       diagnóstico de problemas visuales
└── VisualHistory.js              historial de estados visuales
```

---

## 3. Componentes en detalle

### 3.1 VisualQAAgent

```js
const { VisualQAAgent } = require('./VisualIntelligence');
const agent = new VisualQAAgent();

const result = await agent.analyze({
  url: 'http://localhost:3000',
  selector: '.chat-container',
});
// {
//   pixelDiff: 0.02,         // 2% de diferencia respecto al baseline
//   htmlRisk: { score: 0.1, issues: [] },
//   passed: true,
//   screenshot: Buffer,
//   timestamp: '2026-09-24T12:00:00Z'
// }
```

Análisis:
- **pixel diff**: compara contra baseline (threshold configurable, default 5%)
- **HTML risk**: detecta elementos ocultos maliciosos, iframes no esperados, scripts inline
- **accessibility**: detecta ausencia de alt, aria-label, contraste insuficiente

### 3.2 BoundingBoxExtractor

```js
const { BoundingBoxExtractor } = require('./VisualIntelligence');
const extractor = new BoundingBoxExtractor();

const boxes = await extractor.extract('http://localhost:3000', '.nav-item');
// [
//   { selector: '.nav-item:nth-child(1)', x: 10, y: 20, width: 120, height: 40 },
//   { selector: '.nav-item:nth-child(2)', x: 140, y: 20, width: 120, height: 40 }
// ]
```

### 3.3 VisualRegression + VisualRegressionSystem

```js
const { VisualRegressionSystem } = require('./VisualIntelligence');
const vrs = new VisualRegressionSystem({ threshold: 0.05 });

// Capture baseline
await vrs.captureBaseline('homepage', 'http://localhost:3000');

// After change, compare
const result = await vrs.compare('homepage', 'http://localhost:3000');
// { passed: true, diff: 0.01, screenshot: Buffer, baseline: Buffer }
```

### 3.4 MultiResolutionTester + ResolutionTestHarness

```js
const { MultiResolutionTester } = require('./VisualIntelligence');
const tester = new MultiResolutionTester();

const results = await tester.test('http://localhost:3000', [
  { width: 375, height: 812, name: 'mobile' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1440, height: 900, name: 'desktop' },
]);
// [{ resolution: 'mobile', passed: true, issues: [] }, ...]
```

### 3.5 AdversarialVisualTesting

```js
const { AdversarialVisualTesting } = require('./VisualIntelligence');
const adversarial = new AdversarialVisualTesting();

const results = await adversarial.run('http://localhost:3000', {
  tests: ['overflow_text', 'rtl_content', 'large_images', 'empty_state'],
});
// [{ test: 'overflow_text', passed: false, issue: 'Text overflows at 2000 chars' }]
```

Casos adversariales: texto muy largo, contenido RTL, imágenes enormes, estado vacío, caracteres unicode, contenido embebido, zoom extremo.

### 3.6 VisualDiagnosisAgent

```js
const { VisualDiagnosisAgent } = require('./VisualIntelligence');
const diagnosis = new VisualDiagnosisAgent();

const report = await diagnosis.diagnose({
  url: 'http://localhost:3000',
  issue: 'Login button not visible on mobile',
});
// {
//   root_cause: 'Button has position: absolute but parent has overflow: hidden',
//   severity: 'high',
//   fix: 'Change overflow to visible or add z-index',
//   screenshot: Buffer
// }
```

---

## 4. Playwright — prerequisito

```bash
# Auto-instalado por postinstall script en package.json
npx playwright install chromium --with-deps

# Verificar
npx playwright --version
```

Sin Playwright instalado, todos los métodos de VisualIntelligence que requieren browser retornan `{ error: 'Playwright not installed', fallback: true }` en lugar de crashear.

---

## 5. API REST — `/api/visual-intelligence`

Montada en `api/server/routes/visualIntelligence.js`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Health + Playwright check |
| POST | `/analyze` | VisualQAAgent: pixel diff + HTML risk |
| POST | `/bounding-boxes` | BoundingBoxExtractor |
| POST | `/regression/baseline` | Captura baseline para comparación |
| POST | `/regression/compare` | Compara contra baseline |
| POST | `/multi-resolution` | Test en múltiples resoluciones |
| POST | `/adversarial` | Testing adversarial de UI |
| POST | `/diagnose` | VisualDiagnosisAgent |
| GET | `/history/:url` | VisualHistory para una URL |

---

## 6. WebCloner agents (Face 18 — extensión)

`VisualQAAgent.js` es también usado por los agentes de Website Cloning (`VisualQAAgent` para verificar que un clon reproduzca fielmente el original). La integración está documentada en PHASE18_WEBSITE_CLONING_GATE.md.

---

## 7. Gate de Face 9

| Criterio | Estado |
|----------|--------|
| VisualQAAgent (pixel diff + HTML risk) | ✓ |
| BoundingBoxExtractor (UI element positions) | ✓ |
| VisualRegression (diff entre versiones) | ✓ |
| VisualRegressionSystem (orquestador) | ✓ |
| MultiResolutionTester (mobile/tablet/desktop) | ✓ |
| ResolutionTestHarness (harness de tests) | ✓ |
| AdversarialVisualTesting (inputs extremos) | ✓ |
| UnifiedVisualRepresentation | ✓ |
| VisualDiagnosisAgent (diagnóstico de issues) | ✓ |
| VisualHistory (historial de estados) | ✓ |
| Graceful degradation sin Playwright | ✓ |
| Auto-install Playwright en postinstall | ✓ |
| API REST `/api/visual-intelligence` 9 endpoints | ✓ |
| Integración con WebCloner agents (Face 18) | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
