# 🏆 PROYECTOS FINALES PARA CADA GAP — Con Ratings

> **Criterios**: Abiertos, permisivos, top, pocos recursos, sin APIs externas obligatorias.
> **Rating**: 1 = pobre, 10 = perfecto

---

## GAP 1: Búsqueda en Redes Sociales (Twitter/X, Reddit, Facebook, etc.)

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **Scweet** | 1.5k+ | MIT | Python, ~5MB | **9/10** | Twitter/X scraping SIN API key. Multi-account pooling, proxy support, async. El más completo. |
| 2 | **scrapfly-scrapers** (collection) | 3k+ | Apache-2.0 | Python, ~10MB | **9/10** | 8 scrapers en uno: Twitter, Reddit, Instagram, TikTok, YouTube, LinkedIn, Facebook, Threads. |
| 3 | **reddit-scraper** (scrapfly) | 3k+ | Apache-2.0 | Python, ~3MB | **8/10** | Reddit sin API key. Posts, subreddits, user history. JSON + fallback. |
| 4 | **TweeterPy** | 1k+ | MIT | Python, ~5MB | **8/10** | Twitter scraping completo: profiles, tweets, followers, search. |
| 5 | **facebook-scraper** (scrapfly) | 3k+ | Apache-2.0 | Python, ~5MB | **7/10** | Facebook public pages sin login. |
| 6 | **Crawlee** | 15k+ | Apache-2.0 | Node.js, ~15MB | **8/10** | Framework general de scraping. Puede scrapear cualquier sitio incluyendo redes sociales. |
| 7 | **Playwright** (ya instalado) | 13k+ | Apache-2.0 | Node.js, ~30MB | **7/10** | Ya lo tenemos. Puede scrapear cualquier sitio con browser automation. |

### 🏆 GANADOR RECOMENDADO: **Scweet** (Twitter) + **scrapfly-scrapers** (Reddit, Facebook, etc.)
- Scweet: MIT, sin API key, multi-platform
- scrapfly-scrapers: 8 platforms en un solo repo

### Para Reddit sin ninguna API:
Reddit tiene endpoints JSON públicos: `https://www.reddit.com/r/tech.json` — funciona sin autenticación.

---

## GAP 2: Conversación por Voz (Real-time Voice)

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **LiveKit Agents** | 8k+ | Apache-2.0 | Python/Node.js, ~20MB | **9/10** | El estándar para voice AI. WebRTC, low latency, multi-provider TTS/STT. |
| 2 | **Pipecat** | 10k+ | BSD-2-Clause | Python, ~15MB | **9/10** | El más popular para voice agents. Pipeline architecture, multi-modal. |
| 3 | **voicechat2** | 500+ | MIT | Python, ~10MB | **7/10** | Ultra-simple. WebSocket, ~500ms latency, fully local. |
| 4 | **Oasis** (formerly Fallback) | 2k+ | MIT | Python, ~10MB | **7/10** | Real-time voice chat with LLMs. |
| 5 | **Bolna** | 1k+ | Apache-2.0 | Python, ~15MB | **7/10** | Voice AI framework, multi-provider. |

### 🏆 GANADOR RECOMENDADO: **LiveKit Agents** (el más profesional)
- Apache-2.0
- WebRTC (latencia baja real)
- Multi-provider (OpenAI, ElevenLabs, Deepgram, etc.)
- Soporta Node.js y Python

### Runner-up: **Pipecat** si prefieres Python puro

---

## GAP 3: Streaming de Respuestas

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **Built-in Node.js** | N/A | N/A | Cero deps | **10/10** | SSE es nativo de Node.js. `res.write()` + `Content-Type: text/event-stream`. No necesitas librería. |
| 2 | **eventsource** | 1.5k+ | MIT | ~20KB | **9/10** | Cliente SSE para Node.js. Ultra-ligero. |
| 3 | **@fortaine/mico-event-source** | 100+ | MIT | ~5KB | **8/10** | SSE client minimalista. |
| 4 | **Vercel AI SDK** | 10k+ | Apache-2.0 | ~100KB | **8/10** | Streaming para LLMs. soporta OpenAI, Anthropic, etc. |

### 🏆 GANADOR RECOMENDADO: **Built-in Node.js** (cero dependencias)
SSE es nativo de Node.js/Express. Ejemplo:

```javascript
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send events
  res.write(`data: ${JSON.stringify({text: "Hola"})}\n\n`);
  res.write(`data: ${JSON.stringify({text: " mundo"})}\n\n`);
  res.write('data: [DONE]\n\n');
});
```

**No necesitas ningún package para streaming.**

---

## GAP 4: Background Tasks

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **bree** | 2k+ | MIT | ~50KB, cero deps externas | **10/10** | Zero-dependency background job scheduler. No necesita Redis. Worker threads. |
| 2 | **p-queue** | 4k+ | MIT | ~20KB | **9/10** | Promise-based queue. Limita concurrencia. Cero deps. |
| 3 | **bee-queue** | 2k+ | MIT | ~30KB + Redis | **7/10** | Ligero pero necesita Redis. |
| 4 | **bullmq** | 10k+ | MIT | ~100KB + Redis | **7/10** | El más completo pero pesado (Redis). |
| 5 | **workerpool** | 1k+ | MIT | ~20KB | **8/10** | Worker threads pool. Cero deps. |
| 6 | **sonic-queue** | 200+ | MIT | ~5KB | **7/10** | Ultra-ligero. |

### 🏆 GANADOR RECOMENDADO: **bree** (zero deps, worker threads, no Redis)
- MIT license
- Zero external dependencies
- Worker threads nativos
- Cron scheduling integrado
- Logging integrado
- ~50KB total

### Runner-up: **p-queue** si solo necesitas limitar concurrencia de promises

---

## GAP 5: Citations / Source Tracking

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **Custom (build ourselves)** | N/A | N/A | ~200 líneas | **9/10** | Tracking de fuentes durante ejecución. Cada tool call registra URL/título. Luego se inyectan como citations. |
| 2 | **citation-js** | 1k+ | MIT | ~100KB | **8/10** | Parse/formatea citations en formato académico (APA, MLA, etc). |
| 3 | **ContextCite** (MIT) | Research | MIT | Python | **7/10** | tracking de sources que el LLM usó. Research-grade. |

### 🏆 GANADOR RECOMENDADO: **Custom implementation** (mejor que usar un package)

El sistema de citations es simple:
1. Cada tool call (web_search, web_fetch, etc.) registra la fuente
2. El agente acumula sources durante la ejecución
3. Se inyectan al final de la respuesta como `[1] URL`, `[2] URL`

Esto se implementa en ~200 líneas dentro delHarnessManager.

---

## GAP 6: Suggested Actions / Action Chips

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **Custom Engine (build ourselves)** | N/A | N/A | ~300 líneas | **10/10** | El más relevante para nuestro caso. LLM determina qué acciones sugerir según contexto. |
| 2 | **assistant-ui** | 5k+ | MIT | ~200KB React | **8/10** | Componentes React para AI chat con suggestion chips. Incluido. |
| 3 | **CopilotKit** | 10k+ | MIT | ~500KB React | **7/10** | AI copilot framework con suggestions. Más pesado. |
| 4 | **prompt-kit** | 1k+ | MIT | ~100KB React | **7/10** | Componentes de prompt para React. |

### 🏆 GANADOR RECOMENDADO: **Custom Intelligent Suggested Actions Engine**

El engine que describe el usuario es perfecto para implementar como módulo propio:

```
                    RESPUESTA LLM
                          │
                          ▼
              Intent / Context Analyzer
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          Search       Research       Action
             │            │            │
             └────────────┼────────────┘
                          ▼
                 Action Ranking Engine
                          │
                          ▼
              ┌─────────────────────┐
              │ 🔎 Investigar        │
              │ 💰 Comparar         │
              │ 🛒 Buscar productos │
              │ 🏭 Buscar proveedor  │
              │ 🧠 Profundizar      │
              └─────────────────────┘
```

Se implementa como módulo `SuggestedActionsEngine.js` (~300 líneas):
- Analiza la respuesta del LLM
- Detecta intents (search, research, compare, etc.)
- Genera acciones contextuales
- Ranked por relevancia
- Cada action tiene `action_type` (web_search, deep_research, etc.)

---

## RESUMEN FINAL — TOP PROJECTS POR GAP

| # | Gap | Proyecto Ganador | Licencia | Instalación |
|---|-----|-----------------|----------|-------------|
| 1 | **Redes Sociales** | **Scweet** + **scrapfly-scrapers** | MIT / Apache | `pip install scweet scrapfly-sdk` |
| 2 | **Voz real-time** | **LiveKit Agents** | Apache-2.0 | `pip install livekit-agents` |
| 3 | **Streaming** | **Built-in Node.js** | N/A | Cero install — es nativo |
| 4 | **Background Tasks** | **bree** | MIT | `npm install bree` |
| 5 | **Citations** | **Custom** (200 líneas) | N/A | Se implementa en código |
| 6 | **Suggested Actions** | **Custom Engine** (300 líneas) | N/A | Se implementa en código |

### Para instalar TODO:

```bash
# Social media scraping (Python)
pip install scweet

# Voice real-time (Python)
pip install livekit-agents

# Background tasks (Node.js)
npm install bree
```

**Total: ~25MB, 3 packages, todo permisivo.**

### Para implementar (código propio, no necesita packages):

1. **Streaming** — Nativo de Node.js (0 dependencias)
2. **Citations** — ~200 líneas en HarnessManager
3. **Suggested Actions** — ~300 líneas como nuevo módulo

---

*Documento generado: Agosto 2026*
*Fuentes: GitHub, ScrapFly Blog, BrightData, Reddit, Pipecat.ai, LiveKit, Bree.js*
