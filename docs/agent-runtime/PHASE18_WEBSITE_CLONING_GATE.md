# PHASE18_WEBSITE_CLONING_GATE.md — Face 18: Website Cloning

> **Estado:** FACE 18 — COMPLETADA.
> **Puntuación anterior:** 8.5/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Face 18

El sistema de **Website Cloning** es un pipeline multi-agente que analiza, clona, repara y valida sitios web. Va más allá de un simple `wget`: incluye forensics de diseño, reparación automática del HTML clonado, y validación visual de fidelidad entre el original y el clon.

---

## 2. Arquitectura — 4 agentes especializados

```
WebCloner System
├── WebClonerSupervisor.js          orquestador del pipeline multi-agente
│   ├── Paso 1: WebCloner           clona HTML/CSS/JS del sitio
│   ├── Paso 2: DesignForensicsAgent extrae DNA de diseño (tokens, colores)
│   ├── Paso 3: AutoRepairAgent      aplica 7 reglas de reparación
│   └── Paso 4: VisualQAAgent        valida fidelidad visual del clon
│
├── DesignForensicsAgent.js         extracción de design tokens
├── AutoRepairAgent.js              reparación automática de HTML clonado
└── VisualQAAgent.js               validación visual (desde VisualIntelligence)
```

---

## 3. WebClonerSupervisor — pipeline full-analysis

```js
const { WebClonerSupervisor } = require('./services/VisualIntelligence/WebClonerSupervisor');
const supervisor = new WebClonerSupervisor();

const result = await supervisor.fullAnalysis('https://example.com');
// {
//   clone: {
//     html: '<!DOCTYPE html>...',
//     css: '...',
//     assets: ['logo.png', 'hero.webp'],
//     url: 'https://example.com'
//   },
//   designDNA: {
//     colors: { primary: '#1a73e8', secondary: '#fff', accent: '#fbbc04' },
//     fonts: ['Google Sans', 'Roboto'],
//     spacing: { base: '8px', scale: 'T-shirt' },
//     borderRadius: '4px',
//     shadows: ['0 1px 2px rgba(0,0,0,.3)']
//   },
//   repairs: [
//     { rule: 'absolute_urls', fixed: 3 },
//     { rule: 'missing_viewport_meta', fixed: 1 },
//     { rule: 'external_font_inlined', fixed: 2 }
//   ],
//   visual: {
//     pixelDiff: 0.03,
//     passed: true,
//     screenshot: Buffer
//   }
// }
```

---

## 4. DesignForensicsAgent — DNA de diseño

```js
const { DesignForensicsAgent } = require('./services/VisualIntelligence/DesignForensicsAgent');
const forensics = new DesignForensicsAgent();

const dna = await forensics.extract('https://stripe.com');
// {
//   colors: { primary: '#635bff', background: '#f6f9fc', text: '#0a2540' },
//   typography: {
//     body: 'Sohne, system-ui, -apple-system',
//     heading: 'Sohne, system-ui',
//     scale: [12, 14, 16, 20, 24, 32, 48]
//   },
//   spacing: { xs: 4, sm: 8, md: 16, lg: 32, xl: 64 },
//   borderRadius: { sm: '3px', md: '6px', lg: '12px' },
//   elevation: ['none', '0 2px 5px rgba(0,0,0,.15)', '0 8px 24px rgba(0,0,0,.2)'],
//   grid: { columns: 12, gutter: '24px', maxWidth: '1200px' }
// }
```

Técnica de extracción:
1. Playwright captura la página
2. CSS computed styles de elementos representativos
3. Clustering de colores por frecuencia (k-means heurístico)
4. Análisis de tipografía por tag (h1→h6, p, small)
5. Medición de espaciados comunes (margin/padding)

---

## 5. AutoRepairAgent — 7 reglas de reparación

```js
const { AutoRepairAgent } = require('./services/VisualIntelligence/AutoRepairAgent');
const repair = new AutoRepairAgent();

const repaired = await repair.repair(rawClonedHtml, {
  sourceUrl: 'https://example.com'
});
// { html: '...', repairs: [{rule, count, details}], score: 0.95 }
```

Las 7 reglas:

| Regla | Descripción |
|-------|-------------|
| `absolute_urls` | Convierte `/api/...` y `href="/..."` a URLs absolutas |
| `viewport_meta` | Añade `<meta name="viewport">` si falta |
| `external_font_inline` | Convierte Google Fonts a @font-face inline |
| `broken_images` | Detecta `<img>` con src roto, añade placeholder |
| `missing_charset` | Añade `<meta charset="utf-8">` si falta |
| `remove_tracking` | Elimina scripts de analytics (GA, FB pixel, etc.) |
| `fix_relative_css` | Resuelve `url('../images/...')` en CSS inline |

---

## 6. API REST — `/api/cloner`

Montada en `api/server/routes/cloner.js` (y batch routes):

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/clone` | Clonar URL → HTML + CSS + assets |
| POST | `/analyze` | Analizar estructura de URL |
| POST | `/full-analysis` | Pipeline completo: clone → forensics → repair → visual QA |
| POST | `/design-forensics` | Solo extracción de design DNA |
| POST | `/auto-repair` | Solo reparación de HTML clonado |
| POST | `/visual-qa` | Solo validación visual |

---

## 7. Casos de uso

### Clonar y reproducir un landing page

```bash
curl -X POST /api/cloner/full-analysis \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://example.com" }'
```

### Extraer design system de un competidor

```bash
curl -X POST /api/cloner/design-forensics \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://stripe.com" }'
# Retorna colores, tipografía, espaciados, elevaciones
```

### Verificar fidelidad de un clon

```bash
curl -X POST /api/cloner/visual-qa \
  -H 'Content-Type: application/json' \
  -d '{ "originalUrl": "https://example.com", "cloneUrl": "http://localhost:3001" }'
# { "passed": true, "pixelDiff": 0.02, "issues": [] }
```

---

## 8. Gate de Face 18

| Criterio | Estado |
|----------|--------|
| WebClonerSupervisor: orquestador multi-agente | ✓ |
| WebCloner: captura HTML/CSS/assets via Playwright | ✓ |
| DesignForensicsAgent: extracción design DNA (colores/tipografía/espaciados) | ✓ |
| AutoRepairAgent: 7 reglas de reparación automática | ✓ |
| VisualQAAgent: pixel diff + HTML risk del clon | ✓ |
| Pipeline full-analysis completo (4 pasos) | ✓ |
| POST `/clone` endpoint | ✓ |
| POST `/analyze` endpoint | ✓ |
| POST `/full-analysis` endpoint | ✓ |
| POST `/design-forensics` endpoint | ✓ |
| POST `/auto-repair` endpoint | ✓ |
| POST `/visual-qa` endpoint | ✓ |
| Graceful degradation sin Playwright | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
