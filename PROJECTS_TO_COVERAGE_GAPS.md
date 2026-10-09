# PROYECTOS OPEN-SOURCE PARA CUBRIR TODOS LOS GAPS

**Fecha:** 30 de Agosto, 2026
**Objetivo:** Encontrar proyectos abiertos, permisivos, top, de bajos recursos para cubrir cada gap identificado en la auditoría.

---

## RESUMEN EJECUTIVO

| Gap | Proyecto Recomendado | Licencia | RAM | Score |
|-----|---------------------|----------|-----|-------|
| Hook System | EventEmitter3 + custom hooks | MIT | ~0MB | 10/10 |
| Full Browser | Puppeteer / Lightpanda | Apache-2.0 | ~50-300MB | 9/10 |
| CI/CD Integration | node-cron + GitHub API | MIT | ~1MB | 8/10 |
| Deployment Engine | dockerode | Apache-2.0 | ~5MB | 8/10 |
| Image Generation | FLUX Schnell via HF API | Apache-2.0 | ~0MB (API) | 9/10 |
| Agent Teams | Custom (EventBus exists) | - | ~0MB | 10/10 |
| TTS | Kokoro-82M / espeak-ng | Apache-2.0 | ~50-200MB | 9/10 |
| STT | Whisper.cpp / node-whisper | MIT | ~100-300MB | 9/10 |
| Presentations | pptxgenjs + reveal.js | MIT | ~5MB | 9/10 |
| Website Generation | Handlebars + EJS | MIT | ~2MB | 9/10 |
| Canvas/Diagrams | mermaid | MIT | ~5MB | 10/10 |
| Cross-session Msg | node-ipc / EventEmitter | MIT | ~1MB | 10/10 |
| SDK | Custom (based on existing API) | - | ~0MB | 10/10 |
| LSP Integration | vscode-languageserver | MIT | ~10MB | 8/10 |
| Video Generation | Wan2.1 via API / placeholder | Apache-2.0 | ~0MB (API) | 6/10 |
| Policy Engine | Custom (extend SecurityHardening) | - | ~0MB | 10/10 |

**Total RAM estimada para cubrir todos los gaps: ~200-600MB** (la mayoría son APIs o sudah existentes)

---

## GAP 1: HOOK SYSTEM (PreToolUse, PostToolUse, etc.)

**Prevalencia:** 6/14 agentes | **Prioridad:** P0 CRÍTICO

### Lo que necesitamos
Un sistema de hooks que permita ejecutar código antes/después de que el agente use herramientas:
- PreToolUse (antes de ejecutar herramienta)
- PostToolUse (después de ejecutar herramienta)
- PrePrompt (antes de enviar al LLM)
- PostPrompt (después de recibir respuesta)
- OnError (cuando hay error)
- OnMessage (cuando hay nuevo mensaje)

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **EventEmitter3** | MIT | ~0MB | **10/10** | Event emitter ultra-rápido, 10x más rápido que Node nativo |
| 2 | **mitt** | MIT | ~0MB | **9/10** | Event emitter de 200 bytes, ultra-ligero |
| 3 | **Emittery** | MIT | ~0MB | **9/10** | Async event emitter con soporte TypeScript |
| 4 | **node-hook** | MIT | ~0MB | **7/10** | Hook into require() calls |

### Recomendación: **EventEmitter3** (ya es dependency de muchos paquetes)
- **RAM:** ~0MB (es una librería pura)
- **Por qué:** Ultra-rápido, probado en producción, MIT, cero dependencias
- **Cómo implementar:** Crear `HookSystem.js` que use EventEmitter3 para events como `preToolUse`, `postToolUse`, etc.
- **Costo:** $0

### Implementación necesaria:
```javascript
// HookSystem.js - ~150 líneas
const EventEmitter = require('eventemitter3');

class HookSystem {
  async triggerPreToolUse(toolName, args) { /* ... */ }
  async triggerPostToolUse(toolName, result) { /* ... */ }
  async triggerPrePrompt(messages) { /* ... */ }
  async triggerPostPrompt(response) { /* ... */ }
  async triggerOnError(error) { /* ... */ }
  registerHook(event, callback) { /* ... */ }
  unregisterHook(event, callback) { /* ... */ }
}
```

---

## GAP 2: FULL BROWSER (Puppeteer/Playwright)

**Prevalencia:** 8/14 agentes | **Prioridad:** P1 MUY IMPORTANTE

### Lo que necesitamos
Browser automation completo:
- Navegación web real (no solo fetch)
- Screenshots
- Click, type, scroll
- Wait for elements
- PDF generation
- Form submission
- Multi-tab
- Persistent sessions

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **Puppeteer** | Apache-2.0 | ~100-300MB | **9/10** | Chrome headless completo, el estándar |
| 2 | **Playwright** | Apache-2.0 | ~100-300MB | **10/10** | Multi-browser (Chrome, Firefox, WebKit), auto-wait |
| 3 | **Lightpanda** | Apache-2.0 | ~30MB | **8/10** | Headless browser en Zig, 9x menos RAM que Chrome |
| 4 | **Obscura** | MIT | ~30MB | **8/10** | Headless browser en Rust, 30MB RAM, compatible Puppeteer |
| 5 | **Ferrum** | MIT | ~50MB | **7/10** | Chrome DevTools Protocol directo, sin Puppeteer |
| 6 | **Chrome DevTools Protocol** | BSD | ~0MB | **10/10** | Protocolo nativo, sin dependencias extra |

### Recomendación: **Playwright** (mejor opción) + **Puppeteer** (fallback)
- **RAM:** ~100-300MB (Chrome headless)
- **Por qué:** Playwright es el más completo: multi-browser, auto-wait, tracing, screenshots, PDFs
- **Alternativa ligera:** Si RAM es problema, usar **Lightpanda** (30MB) o **Obscura** (30MB)
- **Costo:** $0

### Implementación necesaria:
```javascript
// BrowserManager.js - ~300 líneas
const { chromium } = require('playwright');

class BrowserManager {
  async launch(headless = true) { /* ... */ }
  async navigate(url) { /* ... */ }
  async screenshot(path) { /* ... */ }
  async click(selector) { /* ... */ }
  async type(selector, text) { /* ... */ }
  async evaluate(js) { /* ... */ }
  async pdf(path) { /* ... */ }
  async close() { /* ... */ }
}
```

---

## GAP 3: CI/CD INTEGRATION

**Prevalencia:** 4/14 agentes | **Prioridad:** P0 CRÍTICO

### Lo que necesitamos
- Trigger CI/CD pipelines
- Monitor build status
- Auto-fix failing builds
- Create PRs with fixes
- Run tests automatically

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **@octokit/rest** | MIT | ~5MB | **10/10** | GitHub API completa (Actions, PRs, Issues) |
| 2 | **node-cron** | MIT | ~1MB | **9/10** | Ya instalado! Scheduler para CI/CD |
| 3 | **simple-git** | MIT | ~2MB | **9/10** | Git operations desde Node.js |
| 4 | **GitHub Actions API** | - | ~0MB | **10/10** | API nativa de GitHub |
| 5 | **Woodpecker CI** | Apache-2.0 | ~50MB | **7/10** | CI/CD self-hosted ligero |

### Recomendación: **@octokit/rest** + **simple-git** (ya tenemos node-cron)
- **RAM:** ~7MB total
- **Por qué:** GitHub API completa + git operations, ya tenemos scheduler
- **Costo:** $0

### Implementación necesaria:
```javascript
// CICDIntegration.js - ~250 líneas
const { Octokit } = require('@octokit/rest');
const simpleGit = require('simple-git');

class CICDIntegration {
  async triggerWorkflow(repo, workflow) { /* ... */ }
  async getBuildStatus(repo, runId) { /* ... */ }
  async createPR(repo, title, body, branch) { /* ... */ }
  async runTests(repo) { /* ... */ }
  async autoFix(repo, issue) { /* ... */ }
}
```

---

## GAP 4: DEPLOYMENT ENGINE

**Prevalencia:** 3/14 agentes | **Prioridad:** P0 CRÍTICO

### Lo que necesitamos
- Deploy containers
- Deploy serverless functions
- Deploy static sites
- Rollback deployments
- Monitor deployments

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **dockerode** | Apache-2.0 | ~5MB | **9/10** | Docker API client para Node.js |
| 2 | **SSH2** | MIT | ~3MB | **8/10** | Deploy via SSH a servidores remotos |
| 3 | **node-ssh** | MIT | ~2MB | **8/10** | Wrapper simplificado de SSH2 |
| 4 | **Netlify CLI** | MIT | ~10MB | **8/10** | Deploy static sites gratis |
| 5 | **Vercel CLI** | Apache-2.0 | ~15MB | **7/10** | Deploy apps completas |
| 6 | **Dokploy** | MIT | ~50MB | **7/10** | Self-hosted PaaS |

### Recomendación: **dockerode** + **node-ssh**
- **RAM:** ~5MB
- **Por qué:** Docker deploy + SSH deploy cubre 90% de casos de uso
- **Costo:** $0

### Implementación necesaria:
```javascript
// DeploymentEngine.js - ~300 líneas
const Docker = require('dockerode');
const NodeSSH = require('node-ssh').NodeSSH;

class DeploymentEngine {
  async deployDocker(config) { /* ... */ }
  async deploySSH(host, commands) { /* ... */ }
  async deployStatic(site) { /* ... */ }
  async rollback(deploymentId) { /* ... */ }
  async monitor(deploymentId) { /* ... */ }
}
```

---

## GAP 5: IMAGE GENERATION

**Prevalencia:** 3/14 agentes | **Prioridad:** P1 MUY IMPORTANTE

### Lo que necesitamos
- Text-to-image generation
- Image editing
- Image variation
- Style transfer

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **FLUX Schnell** (via HF API) | Apache-2.0 | ~0MB (API) | **9/10** | Best open-source image gen, free tier disponible |
| 2 | **Stable Diffusion WebUI API** | AGPL-3.0 | ~4GB (GPU) | **7/10** | Necesita GPU, pesado |
| 3 | **ComfyUI** | GPL-3.0 | ~4GB (GPU) | **6/10** | Necesita GPU, pesado |
| 4 | **Hugging Face Inference API** | - | ~0MB | **10/10** | API gratis con tier gratuito |
| 5 | **Together AI** | - | ~0MB | **9/10** | FLUX Schnell a $0.053/imagen |
| 6 | **pollinations.ai** | MIT | ~0MB | **8/10** | API gratis sin key |

### Recomendación: **Hugging Face Inference API** (gratis) + **pollinations.ai** (sin key)
- **RAM:** ~0MB (es API)
- **Por qué:** FLUX Schnell es el mejor open-source, HF tiene free tier
- **Alternativa sin GPU:** pollinations.ai es 100% gratis sin API key
- **Costo:** $0 (HF free tier) o ~$0.05/imagen (Together AI)

### Implementación necesaria:
```javascript
// ImageGenerator.js - ~200 líneas
class ImageGenerator {
  async generate(prompt, options) {
    // Try pollinations.ai first (free, no key)
    // Then HF Inference API (free tier)
    // Then Together AI (paid)
  }
  async edit(image, instructions) { /* ... */ }
  async variations(image) { /* ... */ }
}
```

---

## GAP 6: AGENT TEAMS (Multi-Agent Coordination)

**Prevalencia:** 4/14 agentes | **Prioridad:** P1 MUY IMPORTANTE

### Lo que necesitamos
- Multiple agents working together
- Task delegation
- Parallel execution
- Result aggregation
- Agent-to-agent communication

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **Custom (EventBus exists)** | - | ~0MB | **10/10** | Ya tenemos EventBus + AgentOrchestrator |
| 2 | **Mastra** | MIT | ~10MB | **8/10** | TypeScript agent framework con multi-agent |
| 3 | **Vercel AI SDK** | Apache-2.0 | ~5MB | **8/10** | Streaming + tool calling + multi-agent |
| 4 | **AutoGen** | MIT | ~20MB | **7/10** | Microsoft multi-agent framework (Python) |
| 5 | **CrewAI** | MIT | ~15MB | **7/10** | Multi-agent orchestration (Python) |

### Recomendación: **Implementar nosotros** (ya tenemos la infraestructura)
- **RAM:** ~0MB (extender EventBus existente)
- **Por qué:** Ya tenemos EventBus, AgentOrchestrator, BackgroundTaskManager
- **Lo que falta:** Agent-to-agent messaging, task delegation, result aggregation
- **Costo:** $0

### Implementación necesaria:
```javascript
// AgentTeams.js - ~200 líneas
class AgentTeams {
  async createTeam(agents) { /* ... */ }
  async delegateTask(team, task) { /* ... */ }
  async parallelExecute(team, tasks) { /* ... */ }
  async aggregateResults(results) { /* ... */ }
  async communicate(fromAgent, toAgent, message) { /* ... */ }
}
```

---

## GAP 7: TTS (Text-to-Speech)

**Prevalencia:** 2/14 agentes | **Prioridad:** P3 CONVENIENTE

### Lo que necesitamos
- High-quality speech synthesis
- Multiple voices
- Multiple languages
- Streaming audio
- Local/offline support

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **Kokoro-82M** | Apache-2.0 | ~200MB | **10/10** | 82M params, 54 voces, 8 idiomas, el mejor |
| 2 | **espeak-ng** | GPL-3.0 | ~5MB | **7/10** | TTS básico, multi-idioma, muy ligero |
| 3 | **Piper TTS** | MIT | ~50MB | **9/10** | Fast local TTS, multi-idioma |
| 4 | **Coqui TTS** | MPL-2.0 | ~200MB | **8/10** | Multi-model TTS |
| 5 | **edge-tts** | MIT | ~0MB | **9/10** | Microsoft Edge TTS, gratis, sin GPU |
| 6 | **Web Speech API** | - | ~0MB | **8/10** | Nativo del navegador, gratis |

### Recomendación: **edge-tts** (gratis, sin GPU) + **Kokoro** (mejor calidad)
- **RAM:** ~0MB (edge-tts) o ~200MB (Kokoro)
- **Por qué:** edge-tts es gratis y funciona sin GPU, Kokoro es el mejor open-source
- **Costo:** $0

### Implementación necesaria:
```javascript
// TTSManager.js - ~150 líneas
class TTSManager {
  async synthesize(text, voice, options) {
    // Try edge-tts first (free)
    // Then Kokoro (best quality)
  }
  async getVoices() { /* ... */ }
  async streamAudio(text, voice) { /* ... */ }
}
```

---

## GAP 8: STT (Speech-to-Text)

**Prevalencia:** 2/14 agentes | **Prioridad:** P3 CONVENIENTE

### Lo que necesitamos
- Real-time transcription
- Multiple languages
- Local/offline support
- High accuracy

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **Whisper.cpp** | MIT | ~100-300MB | **10/10** | El mejor STT open-source, local |
| 2 | **node-whisper** | MIT | ~150MB | **8/10** | Node.js bindings para Whisper |
| 3 | **Vosk** | Apache-2.0 | ~50MB | **8/10** | STT offline, multi-idioma, ligero |
| 4 | **Web Speech API** | - | ~0MB | **7/10** | Nativo del navegador |
| 5 | **Deepgram** | - | ~0MB | **9/10** | API cloud, free tier |

### Recomendación: **Vosk** (más ligero) + **Whisper.cpp** (mejor calidad)
- **RAM:** ~50MB (Vosk) o ~150MB (Whisper)
- **Por qué:** Vosk es más ligero y offline, Whisper es más preciso
- **Costo:** $0

### Implementación necesaria:
```javascript
// STTManager.js - ~150 líneas
class STTManager {
  async transcribe(audioBuffer, options) {
    // Try Vosk first (lighter)
    // Then Whisper (better quality)
  }
  async startRealTimeTranscription(callback) { /* ... */ }
  async stopRealTimeTranscription() { /* ... */ }
}
```

---

## GAP 9: PRESENTATIONS/SLIDES

**Prevalencia:** 2/14 agentes | **Prioridad:** P2 IMPORTANTE

### Lo que necesitamos
- Generate PPTX files
- Generate HTML presentations
- Templates
- Charts/diagrams in slides

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **pptxgenjs** | MIT | ~5MB | **10/10** | Generate PPTX files, charts, images |
| 2 | **reveal.js** | MIT | ~5MB | **10/10** | HTML presentations, plugin system |
| 3 | **Marp** | MIT | ~10MB | **9/10** | Markdown → slides, multiple themes |
| 4 | **jsPDF** | MIT | ~3MB | **8/10** | PDF generation (ya instalado pdfkit) |
| 5 | **Slidev** | MIT | ~15MB | **8/10** | Markdown slides con Vue |

### Recomendación: **pptxgenjs** (PPTX) + **reveal.js** (HTML)
- **RAM:** ~10MB total
- **Por qué:** pptxgenjs genera PowerPoint reales, reveal.js genera HTML interactivas
- **Costo:** $0

### Implementación necesaria:
```javascript
// PresentationGenerator.js - ~250 líneas
const PptxGenJS = require('pptxgenjs');

class PresentationGenerator {
  async generatePPTX(slides, outputPath) { /* ... */ }
  async generateHTML(slides, outputPath) { /* ... */ }
  async addChart(slide, chartData) { /* ... */ }
  async addImage(slide, imagePath) { /* ... */ }
}
```

---

## GAP 10: WEBSITE/APP GENERATION

**Prevalencia:** 2/14 agentes | **Prioridad:** P2 IMPORTANTE

### Lo que necesitamos
- Generate HTML/CSS/JS websites
- Templates engine
- Component generation
- Deploy to hosting

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **Handlebars** | MIT | ~2MB | **10/10** | Template engine, ya muy usado |
| 2 | **EJS** | Apache-2.0 | ~1MB | **9/10** | Embedded JavaScript templates |
| 3 | **11ty (Eleventy)** | MIT | ~5MB | **9/10** | Static site generator, ultra-rápido |
| 4 | **Hexo** | MIT | ~10MB | **8/10** | Static site generator para blogs |
| 5 | **Astro** | MIT | ~20MB | **8/10** | Modern static site generator |
| 6 | **Pico CSS** | MIT | ~0MB | **10/10** | CSS classless, minimal, beautiful |

### Recomendación: **Handlebars** + **Pico CSS** + **11ty**
- **RAM:** ~7MB total
- **Por qué:** Handlebars es el template engine más maduro, Pico CSS genera sitios bonitos con 0 CSS, 11ty genera sites estáticos
- **Costo:** $0

### Implementación necesaria:
```javascript
// WebsiteGenerator.js - ~300 líneas
const handlebars = require('handlebars');

class WebsiteGenerator {
  async generateSite(template, data, outputPath) { /* ... */ }
  async generateBlog posts, outputPath) { /* ... */ }
  async generateLanding(data, outputPath) { /* ... */ }
  async generateDocs(content, outputPath) { /* ... */ }
}
```

---

## GAP 11: CANVAS/DIAGRAMS

**Prevalencia:** 2/14 agentes | **Prioridad:** P2 IMPORTANTE

### Lo que necesitamos
- Generate diagrams
- Flowcharts
- Sequence diagrams
- Architecture diagrams
- Interactive canvas

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **mermaid** | MIT | ~5MB | **10/10** | Diagramas desde texto, flowcharts, sequence, etc. |
| 2 | **D3.js** | BSD-3 | ~10MB | **9/10** | Visualización de datos, custom charts |
| 3 | **Chart.js** | MIT | ~5MB | **9/10** | Charts simples y bonitos |
| 4 | **rough.js** | MIT | ~3MB | **8/10** | Hand-drawn style diagrams |
| 5 | **JointJS** | MPL-2.0 | ~15MB | **7/10** | Diagramas interactivos |

### Recomendación: **mermaid** + **Chart.js**
- **RAM:** ~10MB total
- **Por qué:** Mermaid genera diagramas desde Markdown, Chart.js genera charts
- **Costo:** $0

### Implementación necesaria:
```javascript
// DiagramGenerator.js - ~200 líneas
const mermaid = require('mermaid');

class DiagramGenerator {
  async generateFlowchart(description) { /* ... */ }
  async generateSequenceDiagram(steps) { /* ... */ }
  async generateArchitecture(components) { /* ... */ }
  async generateChart(type, data) { /* ... */ }
  async renderToPNG(diagram, outputPath) { /* ... */ }
}
```

---

## GAP 12: CROSS-SESSION MESSAGING

**Prevalencia:** 3/14 agentes | **Prioridad:** P0 CRÍTICO

### Lo que necesitamos
- Agent-to-agent communication
- Session-to-session messaging
- Event broadcasting
- Message queues

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **EventEmitter3** | MIT | ~0MB | **10/10** | Ya cubierto en Gap 1 |
| 2 | **node-ipc** | MIT | ~2MB | **8/10** | Inter-process communication |
| 3 | **NATS.js** | Apache-2.0 | ~5MB | **9/10** | High-performance messaging |
| 4 | **BullMQ** | MIT | ~5MB | **9/10** | Job queue con Redis |
| 5 | **Redis (ioredis)** | MIT | ~5MB | **9/10** | Pub/sub messaging |

### Recomendación: **EventEmitter3** + **node-ipc**
- **RAM:** ~2MB
- **Por qué:** EventEmitter3 para intra-process, node-ipc para inter-process
- **Costo:** $0

### Implementación necesaria:
```javascript
// CrossSessionMessaging.js - ~150 líneas
class CrossSessionMessaging {
  async send(targetSession, message) { /* ... */ }
  async broadcast(message) { /* ... */ }
  async subscribe(channel, callback) { /* ... */ }
  async unsubscribe(channel) { /* ... */ }
}
```

---

## GAP 13: SDK PROPIO

**Prevalencia:** 4/14 agentes | **Prioridad:** P1 MUY IMPORTANTE

### Lo que necesitamos
- Developer SDK for custom agents
- API client library
- Documentation
- Examples

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **Custom (basado en HarnessAPI)** | - | ~0MB | **10/10** | Ya tenemos HarnessAPI.js con 15 endpoints |
| 2 | **OpenAPI/Swagger** | Apache-2.0 | ~2MB | **10/10** | API documentation standard |
| 3 | **axios** | MIT | ~3MB | **10/10** | HTTP client (ya instalado) |
| 4 | **ws** | MIT | ~2MB | **9/10** | WebSocket client |

### Recomendación: **Generar SDK desde HarnessAPI existente**
- **RAM:** ~0MB
- **Por qué:** Ya tenemos la API, solo falta generar el SDK wrapper
- **Costo:** $0

### Implementación necesaria:
```javascript
// AgentSDK.js - ~200 líneas
class AgentSDK {
  constructor(apiUrl, apiKey) { /* ... */ }
  async chat(message, options) { /* ... */ }
  async executeTool(toolName, args) { /* ... */ }
  async searchCapabilities(query) { /* ... */ }
  async installCapability(id) { /* ... */ }
  async getMetrics() { /* ... */ }
  stream(message, options) { /* SSE stream */ }
}
```

---

## GAP 14: LSP INTEGRATION

**Prevalencia:** 2/14 agentes | **Prioridad:** P2 IMPORTANTE

### Lo que necesitamos
- Code intelligence
- Autocomplete
- Go-to-definition
- Find references
- Diagnostics

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **vscode-languageserver** | MIT | ~10MB | **10/10** | LSP client/server implementation |
| 2 | **vscode-languageserver-textdocument** | MIT | ~2MB | **9/10** | Text document synchronization |
| 3 | **typescript-language-server** | MIT | ~15MB | **9/10** | TypeScript LSP |
| 4 | **eslint** | MIT | ~10MB | **9/10** | Linting (ya parcialmente integrado) |

### Recomendación: **vscode-languageserver** + **vscode-languageserver-textdocument**
- **RAM:** ~12MB
- **Por qué:** LSP estándar, soporte para múltiples lenguajes
- **Costo:** $0

### Implementación necesaria:
```javascript
// LSPIntegration.js - ~200 líneas
const { LanguageClient } = require('vscode-languageclient/node');

class LSPIntegration {
  async startServer(language) { /* ... */ }
  async getCompletions(filePath, position) { /* ... */ }
  async getDefinitions(filePath, position) { /* ... */ }
  async getDiagnostics(filePath) { /* ... */ }
  async formatDocument(filePath) { /* ... */ }
}
```

---

## GAP 15: VIDEO GENERATION

**Prevalencia:** 2/14 agentes | **Prioridad:** P3 CONVENIENTE

### Lo que necesitamos
- Text-to-video
- Image-to-video
- Video editing

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **Wan2.1** (via API) | Apache-2.0 | ~0MB (API) | **7/10** | Best open-source video gen, necesita GPU |
| 2 | **CogVideo** | Apache-2.0 | ~8GB (GPU) | **6/10** | Video gen, necesita GPU pesada |
| 3 | **Open-Sora** | Apache-2.0 | ~8GB (GPU) | **6/10** | Video gen, necesita GPU pesada |
| 4 | **FFmpeg** | LGPL-2.1 | ~5MB | **10/10** | Video processing/editing (ya existe) |
| 5 | **Remotion** | MIT | ~20MB | **8/10** | React → Video, render server-side |

### Recomendación: **Remotion** (generation) + **FFmpeg** (editing)
- **RAM:** ~25MB
- **Por qué:** Remotion genera video desde React/JS, FFmpeg edita video
- **Nota:** Video generation real requiere GPU, usar API es más práctico
- **Costo:** $0 (Remotion) + $0 (FFmpeg)

### Implementación necesaria:
```javascript
// VideoGenerator.js - ~200 líneas
class VideoGenerator {
  async generateFromText(prompt, options) { /* ... */ }
  async generateFromImages(images, options) { /* ... */ }
  async editVideo(input, operations) { /* ... */ }
  async addAudio(video, audio) { /* ... */ }
  async convertFormat(input, output) { /* ... */ }
}
```

---

## GAP 16: POLICY ENGINE

**Prevalencia:** 3/14 agentes | **Prioridad:** P2 IMPORTANTE

### Lo que necesitamos
- Granular permissions
- Tool restrictions
- Network restrictions
- Filesystem restrictions
- Command restrictions

### Proyectos encontrados

| # | Proyecto | Licencia | RAM | Score | Qué hace |
|---|----------|----------|-----|-------|----------|
| 1 | **Custom (extender SecurityHardening)** | - | ~0MB | **10/10** | Ya tenemos SecurityHardening.js |
| 2 | **joi** | MIT | ~2MB | **9/10** | Schema validation |
| 3 | **zod** | MIT | ~2MB | **9/10** | TypeScript-first schema validation |
| 4 | **node-segment** | MIT | ~1MB | **7/10** | Text segmentation |

### Recomendación: **Extender SecurityHardening existente** + **joi**
- **RAM:** ~2MB
- **Por qué:** Ya tenemos SecurityHardening.js, solo falta Policy Engine
- **Costo:** $0

### Implementación necesaria:
```javascript
// PolicyEngine.js - ~200 líneas
class PolicyEngine {
  async checkToolPermission(toolName, context) { /* ... */ }
  async checkNetworkAccess(url, context) { /* ... */ }
  async checkFileAccess(path, operation, context) { /* ... */ }
  async checkCommand(command, context) { /* ... */ }
  async enforcePolicy(request, policy) { /* ... */ }
}
```

---

## RESUMEN FINAL: TODOS LOS PROYECTOS

### Proyectos que YA TENEMOS instalados:
| Proyecto | Licencia | Estado |
|----------|----------|--------|
| node-cron | MIT | ✅ Instalado |
| marked | MIT | ✅ Instalado |
| pdfkit | MIT | ✅ Instalado |
| xlsx | Apache-2.0 | ✅ Instalado |
| mammoth | BSD-2 | ✅ Instalado |
| sharp | Apache-2.0 | ✅ Instalado |
| @lancedb/lancedb | Apache-2.0 | ✅ Instalado |
| pdf-parse | MIT | ✅ Instalado |
| tesseract.js | Apache-2.0 | ✅ Instalado |
| bree | MIT | ✅ Instalado |
| vm2 | MIT | ✅ Instalado |
| natural | Apache-2.0 | ✅ Instalado |
| graphology | MIT | ✅ Instalado |

### Proyectos que FALTA instalar:
| # | Proyecto | Para Gap | Licencia | RAM | Costo |
|---|----------|----------|----------|-----|-------|
| 1 | **eventemitter3** | Hooks + Messaging | MIT | ~0MB | $0 |
| 2 | **playwright** | Full Browser | Apache-2.0 | ~100MB | $0 |
| 3 | **@octokit/rest** | CI/CD | MIT | ~5MB | $0 |
| 4 | **simple-git** | CI/CD | MIT | ~2MB | $0 |
| 5 | **dockerode** | Deployment | Apache-2.0 | ~5MB | $0 |
| 6 | **node-ssh** | Deployment | MIT | ~2MB | $0 |
| 7 | **pptxgenjs** | Presentations | MIT | ~5MB | $0 |
| 8 | **handlebars** | Websites | MIT | ~2MB | $0 |
| 9 | **mermaid** | Diagrams | MIT | ~5MB | $0 |
| 10 | **chart.js** | Charts | MIT | ~5MB | $0 |
| 11 | **vscode-languageserver** | LSP | MIT | ~10MB | $0 |
| 12 | **joi** | Policy Engine | MIT | ~2MB | $0 |
| 13 | **remotion** | Video Gen | MIT | ~20MB | $0 |
| 14 | **node-ipc** | Cross-session | MIT | ~2MB | $0 |

### RAM Total estimada: ~165MB extra
### Costo Total: $0 (todo open-source)

### APIs gratuitas para cubrir gaps pesados:
| API | Para Gap | Costo |
|-----|----------|-------|
| Hugging Face Inference API | Image Gen (FLUX) | Gratis (free tier) |
| pollinations.ai | Image Gen (fallback) | Gratis (sin key) |
| edge-tts | TTS | Gratis (sin key) |
| Together AI | Image Gen (paid) | ~$0.05/imagen |

---

## PLAN DE IMPLEMENTACIÓN

### FASE 1: Hooks + Cross-session (P0) — 1 día
- Instalar: eventemitter3, node-ipc
- Crear: HookSystem.js, CrossSessionMessaging.js
- Integrar: CognitiveEngine + DSHAgentLoop

### FASE 2: CI/CD + Deployment (P0) — 2 días
- Instalar: @octokit/rest, simple-git, dockerode, node-ssh
- Crear: CICDIntegration.js, DeploymentEngine.js
- Integrar: HarnessManager

### FASE 3: Full Browser (P1) — 2 días
- Instalar: playwright
- Crear: BrowserManager.js
- Integrar: ComputerUse.js

### FASE 4: Image Gen + TTS + STT (P1) — 2 días
- Instalar: (APIs, no paquetes)
- Crear: ImageGenerator.js, TTSManager.js, STTManager.js
- Integrar: FileProcessor.js

### FASE 5: Presentations + Websites + Diagrams (P2) — 2 días
- Instalar: pptxgenjs, handlebars, mermaid, chart.js
- Crear: PresentationGenerator.js, WebsiteGenerator.js, DiagramGenerator.js
- Integrar: ReportGenerator.js

### FASE 6: SDK + LSP + Policy (P2) — 2 días
- Instalar: vscode-languageserver, joi
- Crear: AgentSDK.js, LSPIntegration.js, PolicyEngine.js
- Integrar: HarnessAPI.js

### FASE 7: Agent Teams (P1) — 1 día
- Crear: AgentTeams.js (extender EventBus existente)
- Integrar: AgentOrchestrator.js

### FASE 8: Video Gen (P3) — 1 día
- Instalar: remotion
- Crear: VideoGenerator.js
- Integrar: FileProcessor.js

### TOTAL: ~13 días para cubrir TODOS los gaps
### RAM total: ~165MB extra
### Costo total: $0

---

## CRITERIO DE ÉXITO

Después de implementar todo, nuestro agente tendrá:

| Categoría | Antes | Después |
|-----------|-------|---------|
| Capacidades FULL | ~120 (21%) | ~200 (35%) |
| Capacidades PARTIAL | ~45 (8%) | ~20 (3%) |
| Capacidades MISSING | ~415 (72%) | ~360 (62%) |
| RAM total | ~220MB | ~385MB |
| Providers LLM | 9 | 9 |
| Tools | 41 | 65+ |
| Sistemas conectados | 20 | 35+ |

**Nota:** Las capacidades "missing" restantes son mayoritariamente multimedia pesada (3D, CAD, music, animation) que requieren GPU o APIs externas costosas.
