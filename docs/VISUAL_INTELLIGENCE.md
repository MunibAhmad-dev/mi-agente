# Visual Intelligence System — Face 9

## Overview

Face 9 defines the Visual Intelligence & Visual Software Engineering pipeline. It enables the agent to see, understand, diagnose, and repair visual interfaces.

**Full pipeline:**
```
Browser → DOM → HTML → CSS → Screenshot → OCR → Computer Vision
                              ↓
               UnifiedVisualRepresentation (UVR)
                              ↓
                    Visual Intelligence
                              ↓
                         Evaluation
                              ↓
                  VisualDiagnosisAgent → Repairs
                              ↓
                       VisualHistory (trend)
```

---

## Components

### VisualIntelligenceEngine
**File:** `api/server/services/Harness/VisualIntelligence/VisualIntelligenceEngine.js`

Core analysis engine:
- DOM analysis — element count, depth, structural issues
- Accessibility checking — WCAG violations, ARIA, contrast
- UI pattern evaluation — anti-patterns, design system compliance
- Screenshot capture (Playwright/Puppeteer)
- `auditHTML(html)` — full audit from raw HTML (no browser needed)
- `auditPage(url)` — full audit via browser automation

### Image-based Services
**Directory:** `api/server/services/VisualIntelligence/`

| Module | Description |
|--------|-------------|
| `BoundingBoxExtractor` | AI-powered bounding box detection in screenshots |
| `VisualQAAgent` | Visual question answering against images |
| `ResolutionTestHarness` | Test UI at multiple breakpoints |
| `VisualRegression` | Baseline-based visual regression detection |
| `MultiResolutionTester` | Automated multi-breakpoint test runs |
| `VisualRegressionSystem` | Advanced regression with metadata |
| `AdversarialVisualTesting` | Adversarial/edge-case visual testing |

### UnifiedVisualRepresentation (UVR)
**File:** `api/server/services/VisualIntelligence/UnifiedVisualRepresentation.js`

Combines all analysis sources into one canonical object:
- `structure` — DOM issues, element count, depth
- `accessibility` — violations, passed checks, score
- `ui` — patterns, anti-patterns, recommendations
- `visual` — screenshot metadata
- `text` — OCR text, word count
- `qa` — visual QA answers
- `health` — aggregated health score 0-100

### VisualDiagnosisAgent
**File:** `api/server/services/VisualIntelligence/VisualDiagnosisAgent.js`

Processes a UVR and produces:
- `verdict` — `pass | warn | fail`
- `findings` — structured list of issues with severity
- `repairs` — ranked repair proposals (high-impact + low-effort first)
- `health` — overall health score

Repair proposals cover: accessibility violations, DOM issues, UI anti-patterns.

### VisualHistory
**File:** `api/server/services/VisualIntelligence/VisualHistory.js`

Time-series storage of visual snapshots:
- Records lightweight summaries (not full UVR objects)
- Up to 50 snapshots per key, 500 total
- `getTrend(key)` — `improving | degrading | stable | unknown`
- Used to track regressions across deployments

---

## API Endpoints

Base path: `/api/visual-intelligence`

### Core Engine

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Engine capability report |
| POST | `/analyze-html` | Analyze raw HTML (DOM + A11y + UI) |
| POST | `/audit-page` | Full page audit via browser |
| POST | `/screenshot` | Take a screenshot only |

### Image Services

| Method | Path | Description |
|--------|------|-------------|
| POST | `/image/bounding-boxes` | Extract bounding boxes |
| POST | `/image/qa` | Visual question answering |
| POST | `/bounding-boxes` | Extract bounding boxes (v2) |
| POST | `/qa/run` | Run full visual QA report |
| GET | `/qa/reports` | List recent QA reports |

### Regression

| Method | Path | Description |
|--------|------|-------------|
| GET | `/regression/baselines` | List baselines |
| POST | `/regression/baseline/:key` | Set baseline |
| POST | `/regression/compare/:key` | Compare against baseline |
| POST | `/regression/v2/baseline` | Capture baseline (v2) |
| POST | `/regression/v2/compare` | Compare (v2) |
| GET | `/regression/v2/baselines` | List baselines (v2) |

### Resolution Testing

| Method | Path | Description |
|--------|------|-------------|
| GET | `/resolution/stats` | Resolution test stats |
| POST | `/multi-resolution` | Test at multiple breakpoints |

### Unified Pipeline (Face 9 core)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/pipeline/analyze` | Full pipeline: HTML or URL → UVR → Diagnosis |
| POST | `/pipeline/diagnose` | Diagnose a pre-built UVR |

### Visual History

| Method | Path | Description |
|--------|------|-------------|
| GET | `/history` | List all tracked keys |
| GET | `/history/:key` | Get snapshots + trend for a key |
| DELETE | `/history/:key` | Clear history for a key |

---

## Usage Examples

### Full pipeline from HTML
```http
POST /api/visual-intelligence/pipeline/analyze
{
  "html": "<html>...</html>",
  "key": "my-component-v1.2.3",
  "recordHistory": true
}
```

Response:
```json
{
  "ok": true,
  "unified": { "health": 72, "structure": {...}, "accessibility": {...}, ... },
  "diagnosis": { "verdict": "warn", "repairs": [...], "findings": [...] },
  "summary": "WARN (health: 72/100): 3 warnings — 5 repairs proposed"
}
```

### Trend check
```http
GET /api/visual-intelligence/history/my-component-v1.2.3?limit=10
```

Response:
```json
{
  "key": "my-component-v1.2.3",
  "history": [...],
  "trend": { "trend": "improving", "delta": 8, "snapshots": [...] }
}
```

---

## Architecture Notes

- All engine calls degrade gracefully — if Playwright/Puppeteer is not installed, the engine returns stub responses instead of crashing
- The unified pipeline (`/pipeline/analyze`) accepts either raw HTML (no browser needed) or a URL (requires browser automation)
- VisualHistory is in-process memory — snapshots survive the request but not a server restart. For persistence, integrate with the MemoryFacade or MongoDB.
- OCR integration: pass `ocr: { text, blocks }` in the `sources` parameter of `UnifiedVisualRepresentation.build()` to include OCR output from any external OCR service (Tesseract, Google Vision, AWS Textract)
