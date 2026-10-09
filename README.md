# 🧠 AI-OS — Universal AI Platform

<p align="center">
  <strong>Plataforma de IA autónoma, modular y open-source que rivaliza con los mejores agentes comerciales de 2026</strong>
</p>

<p align="center">
  <a href="#-arquitectura">Arquitectura</a> •
  <a href="#-capacidades">Capacidades</a> •
  <a href="#-herramientas-55">Tools</a> •
  <a href="#-módulos-cognitivos-107">Cognitive</a> •
  <a href="#-instalación">Instalación</a> •
  <a href="#-dashboard">Dashboard</a> •
  <a href="#-docker">Docker</a>
</p>

---

## 📋 Descripción

**AI-OS** es una plataforma de IA autónoma construida desde cero que integra:

- **41+ herramientas** de ejecución registradas (filesystem, shell, browser, computer use, video, MCP, etc.) — 56 archivos en Harness/tools/
- **107 módulos cognitivos** (memoria, RAG, aprendizaje, conocimiento, routing, etc.)
- **DSHAgentLoop** (loop real de ejecución, 292 líneas) + **AgentLoop** (implementación extendida, 773 líneas, integrable opcionalmente)
- **6 servicios Docker** en docker-compose.aios.yml + **8 servicios** en docker-compose.yml (API, RAG, MongoDB, Meilisearch, pgvector, computer-use, etc.)
- **Dashboard UI profesional** con 22 secciones
- **Local-first** — compatible con Ollama sin APIs de pago; proveedores cloud (OpenAI, Anthropic, xAI) son opcionales

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                  DASHBOARD UI                        │
│         22 secciones • HTML + LibreChat React        │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                  API SERVER                           │
│            Express.js — 115+ rutas                    │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│              AGENT LOOP (750 líneas)                  │
│   while(tool_call) → reason → execute → observe       │
│   + AutoLauncher + MCP + VisionRouter + SelfHealing   │
└──────┬──────────┬──────────┬──────────┬─────────────┘
       │          │          │          │
┌──────▼──┐ ┌─────▼────┐ ┌──▼─────┐ ┌──▼──────┐
│  TOOLS  │ │ COGNITIV │ │ MEMORY │ │   RAG   │
│   55    │ │   107    │ │ 8 tipos│ │ 7 comps │
└─────────┘ └──────────┘ └────────┘ └─────────┘
       │          │          │          │
┌──────▼──────────▼──────────▼──────────▼─────────────┐
│              DOCKER INFRASTRUCTURE                    │
│   LibreChat • MongoDB • Redis • pgvector • Ollama    │
│   MeiliSearch • OpenCode • Admin Panel                │
└─────────────────────────────────────────────────────┘
```

---

## ⚡ Capacidades

### 🤖 Agent Loop
| Feature | Estado |
|---------|--------|
| while(tool_call) pattern | ✅ |
| Self-healing (error → classify → fix → retry) | ✅ |
| Auto-checkpoint on error | ✅ |
| Context compaction automática | ✅ |
| Auto-launch de servicios | ✅ |
| MCP integration | ✅ |
| Vision routing inteligente | ✅ |
| Rate limiting y quotas | ✅ |
| Distributed tracing | ✅ |
| Ask User (human-in-the-loop) | ✅ |
| Replan dinámico | ✅ |
| Rollback (git) | ✅ |

### 🧠 Sistema de Memoria (8 tipos)
| Tipo | Descripción |
|------|-------------|
| Long-term Memory | Persistencia entre sesiones |
| Short-term Memory | Contexto de sesión actual |
| Working Memory | Estado activo del agente |
| Episodic Memory | Experiencias pasadas |
| Semantic Memory | Conocimiento factual |
| Procedural Memory | Cómo hacer cosas |
| User Memory | Preferencias del usuario |
| Cross-session Memory | Datos entre sesiones |

### 🔍 Sistema RAG
| Componente | Función |
|-----------|---------|
| RAGEngine | Motor principal de RAG |
| AdaptiveRAG | Selección adaptativa de estrategia |
| HybridSearch | Búsqueda híbrida (vectorial + BM25) |
| SmartChunker | Chunking inteligente con consciencia semántica |
| SemanticCompressor | Compresión semántica de contexto |
| ContextualRetriever | Enriquecimiento contextual |
| FactChecker | Verificación de hechos |

### 📚 Sistema de Aprendizaje
| Componente | Función |
|-----------|---------|
| LearningEngine | Motor de aprendizaje principal |
| ErrorLearningSystem | Aprende de errores |
| FailureMemory | Memoria de fracasos |
| LoopDetector | Detecta loops infinitos |
| RootCauseAnalyzer | Análisis de causa raíz |
| LessonEngine | Extracción de lecciones |
| ExperienceReplay | Reproducción de experiencias |
| SelfImprovementEngine | Auto-mejora continua |

---

## 🛠️ Herramientas (55)

### Core Agent (P0)
| Tool | Función |
|------|---------|
| FilesystemTools | Leer/escribir/editar archivos |
| ShellTool | Ejecutar comandos shell |
| SearchTools | Grep/Glob/Find |

### Computer Use (16 tools)
| Tool | Función |
|------|---------|
| computer_screenshot | Capturar pantalla |
| computer_click | Clic en coordenadas |
| computer_double_click | Doble clic |
| computer_move_mouse | Mover mouse |
| computer_scroll | Scroll |
| computer_type | Escribir texto |
| computer_press_key | Presionar tecla |
| computer_hotkey | Combinación de teclas |
| computer_drag | Arrastrar |
| computer_clipboard_read | Leer portapapeles |
| computer_clipboard_write | Escribir portapapeles |
| computer_window_list | Listar ventanas |
| computer_window_focus | Enfocar ventana |
| computer_window_resize | Redimensionar ventana |
| computer_mouse_position | Posición del mouse |
| computer_screen_size | Tamaño de pantalla |

### Video (10 tools)
| Tool | Función |
|------|---------|
| video_convert | Convertir formatos (mp4, webm, gif, etc.) |
| video_trim | Recortar video |
| video_compress | Comprimir video |
| video_thumbnail | Extraer miniaturas |
| video_extract_audio | Extraer audio |
| video_info | Información del video |
| video_to_gif | Convertir a GIF |
| video_concat | Concatenar videos |
| video_watermark | Agregar marca de agua |
| video_frames_extract | Extraer frames |

### Browser & Web
| Tool | Función |
|------|---------|
| BrowserManager | Automatización con Playwright |
| WebScraper | Scraping web |
| DeeperSearchV2 | Investigación profunda |
| SocialScraper | Scraping de redes sociales |
| RSSAggregator | Feeds RSS |

### Code & Git
| Tool | Función |
|------|---------|
| CodeExecutor | Ejecutar Python/JS |
| GitWorktreeManager | Git worktrees |
| GitRollback | Git rollback |
| GitIntegration | Operaciones Git |
| LSPIntegration | Language Server Protocol |

### AI & Media
| Tool | Función |
|------|---------|
| ImageGenerator | Generación de imágenes |
| TTSManager | Text-to-speech |
| STTManager | Speech-to-text |
| MultiModalLocal | Visión/STT via Ollama |
| ComputerUseVision | Screenshot + análisis LLM |

### Infrastructure
| Tool | Función |
|------|---------|
| DockerSandbox | Sandbox Docker |
| CICDIntegration | Pipelines CI/CD |
| DeploymentEngine | Deploy automático |
| BackupManager | Gestión de backups |
| CloudAgent | Ejecución en cloud |

### Communication
| Tool | Función |
|------|---------|
| EmailManager | Email (IMAP/SMTP, $0) |
| CalendarManager | Calendario (CalDAV, $0) |
| DriveManager | Drive (WebDAV, $0) |
| WebhookManager | Webhooks |
| CrossSessionMessaging | Mensajes entre sesiones |

### Management
| Tool | Función |
|------|---------|
| AgentTeams | Equipos de agentes |
| CompanionManager | Compañeros IA |
| PlaybookManager | Playbooks ejecutables |
| GoalManager | Seguimiento de metas |
| DoctorModule | Salud del sistema |

### Security
| Tool | Función |
|------|---------|
| CredentialVault | Almacenamiento seguro |
| PolicyEngine | Políticas de seguridad |
| RateLimiter | Limitación de tasa |
| ApprovalGates | Puertas de aprobación |

### Utilities
| Tool | Función |
|------|---------|
| CanvasManager | Editor Canvas/Tiptap |
| PluginMarketplace | Marketplace de plugins |
| PlanModeManager | Modo planificación |
| CollectionsEngine | Gestión de colecciones |
| PresentationGenerator | Generador de presentaciones |
| WebsiteGenerator | Generador de sitios web |
| DiagramGenerator | Generador de diagramas |
| ClipboardManager | Portapapeles |
| LogManager | Gestión de logs |
| MetricsCollector | Recolección de métricas |
| QueueManager | Cola de tareas |
| CacheManager | Caché |
| AlertManager | Alertas |
| HealthDashboard | Dashboard de salud |
| ProtocolConfigWizard | Asistente de protocolos |

---

## 🧩 Módulos Cognitivos (107)

### Core Engine
CognitiveEngine, ExecutiveBrain, EventBus, EventStream

### Memory System
MemoryEngine, CrossSessionMemory, ExperienceReplay, ConsolidationEngine, UserProfileMemory, PersistentStorage

### RAG System
RAGEngine, AdaptiveRAG, HybridSearch, SmartChunker, SemanticCompressor, ContextualRetriever, RAGOptimizer

### Learning System
LearningEngine, LessonEngine, ErrorLearningSystem, FailureMemory, LoopDetector, RootCauseAnalyzer, SelfImprovementEngine, LearningMetrics

### Knowledge System
KnowledgeEngine, KnowledgeGraph, KnowledgeGapDetector, CausalMemory

### Evidence System
EvidenceEngine, FactChecker, SourceEvaluator, PeerReviewer

### LLM Routing
UniversalLLMRouter, IntelligentRouter, ResponseNormalizer, LLMGateway, LocalLLMManager, CostOptimizer, NLPTokenizer

### Vision
VisionComplexityRouter (Simple: Moondream 1.8B, Medium: LLaVA 7B, Hard: LLaVA 13B+)

### MCP
MCPClient (stdio + SSE transports)

### Token Optimization
TokenAnalyzer, TokenBudgetManager, TokenCostOptimizer, TokenOptimizationEngine, PromptCompressor, AdaptiveCompressor, ContextPruner, ConversationCompressor, MemoryCompressor

### Caching
PromptCache, SemanticCache, ExactCache, PrefixCacheManager

### Planning
PlanMode, DAGScheduler, DynamicWorkflows, TaskClassifier

### Security
ApprovalGates, PromptInjectionDetector, QualityGate, MultiUserIsolation

### Providers
ProviderHealthChecker, APIKeyRotation, QuotaManager

### Monitoring
DistributedTracer, ModelEvaluator, RAGEvaluator, CodebaseForensics

### New Integrations
AutoLauncher, WebLLMManager, FineTuningManager, MCPClient

---

## 🖥️ Dashboard

Dashboard HTML profesional con **22 secciones**:

| Sección | Función |
|---------|---------|
| Overview | Stats, actividad general |
| Chat | Interfaz de conversación |
| Agents | Sub-agentes disponibles |
| Models | Proveedores y rendimiento |
| Routing | Router inteligente |
| Pipelines | Pipelines de modelos |
| Memory | Sistema de memoria (8 tipos) |
| RAG | Sistema RAG |
| Knowledge | Knowledge Graph |
| Tools | 55 herramientas |
| Browser | Automatización web |
| Terminal | Terminal embebido |
| Workflows | Workflows dinámicos |
| Security | Seguridad |
| Monitoring | Monitoreo en tiempo real |
| Settings | Configuración |
| **Computer Use** | 16 tools de control de escritorio |
| **MCP Servers** | Servidores MCP |
| **Vision Router** | 3 niveles de complejidad |
| **WebLLM** | Modelos en el browser |
| **Fine-Tuning** | LoRA/QLoRA training |
| **Auto Launcher** | Auto-inicio de servicios |

---

## 🐳 Docker

### 10 Contenedores
| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| LibreChat | 3080 | UI principal (React) |
| Admin Panel | 3000 | Panel de administración |
| MongoDB | 27017 | Base de datos documentos |
| Redis | 6379 | Caché en memoria |
| pgvector | 5432 | Vector database |
| Ollama | 11434 | LLM local |
| MeiliSearch | 7700 | Búsqueda full-text |
| OpenCode | 4096 | Code editor |
| OpenCode Bridge | 8787 | Bridge |
| RAG API | — | API de RAG |

### Iniciar con Docker
```bash
docker compose up -d
```

---

## 📦 Instalación

### Requisitos
- **Docker Desktop** — [Descargar](https://www.docker.com/products/docker-desktop/) (Windows/Mac/Linux)
- **Git** — [Descargar](https://git-scm.com/downloads)
- **MongoDB Compass** (opcional) — [Descargar](https://www.mongodb.com/products/compass) para inspeccionar la BD

### ⚡ Setup One-Click (Recomendado)

**Windows:**
```bat
# 1. Clonar el repositorio
git clone https://github.com/proyectos-aoi/mi-agente.git
cd mi-agente

# 2. Ejecutar setup (genera .env, inicia Docker, todo automatico)
setup.bat
```

**Linux / Mac:**
```bash
# 1. Clonar el repositorio
git clone https://github.com/proyectos-aoi/mi-agente.git
cd mi-agente

# 2. Ejecutar setup (genera .env, inicia Docker, todo automatico)
chmod +x setup.sh
./setup.sh
```

### 🗄️ Acceso a MongoDB (para auditoria)

| Dato | Valor |
|------|-------|
| **Host** | `localhost` |
| **Port** | `27017` |
| **Database** | `LibreChat` |
| **Auth** | Ninguna (`--noauth`) |
| **URL completa** | `mongodb://localhost:27017/LibreChat` |

**Para conectar con MongoDB Compass:**
1. Abrir MongoDB Compass
2. Pegar: `mongodb://localhost:27017/LibreChat`
3. Click "Connect"

### URLs de acceso
| Servicio | URL | Puerto |
|----------|-----|--------|
| **LibreChat (Chat UI)** | http://localhost:3080 | 3080 |
| **Admin Panel** | http://localhost:3000 | 3000 |
| **AI Model Browser** | http://localhost:3456 | 3456 |
| **MongoDB** | localhost:27017 | 27017 |
| **Ollama (LLM local)** | http://localhost:11434 | 11434 |
| **Dashboard** | `client/dashboard.html` (abrir archivo) | — |
| **OpenCode** | http://localhost:4096 | 4096 |

---

## 🔧 Configuración

### LLM Local (gratis)
```bash
# Instalar Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Descargar modelo
ollama pull qwen3:1.7b

# Verificar
curl http://localhost:11434/api/tags
```

### Vision Models
```bash
# Simple (1.8B, MIT)
ollama pull moondream

# Medium (7B, Apache-2.0)
ollama pull llava:7b

# Hard (13B, Apache-2.0)
ollama pull llava:13b
```

### Face 9 — Visual Intelligence (Playwright)

Browser automation and screenshot comparison require Playwright. Install it once after `npm install`:

```bash
# Install Playwright browsers (required for BrowserManager + VisualQA screenshot diff)
npx playwright install chromium

# Optional: install all browsers
npx playwright install
```

If Playwright is not installed, the system degrades gracefully — `VisualQAAgent.compare()` falls back to HTML-only risk analysis without pixel diffing. All other Visual Intelligence features remain fully operational.

### Face 14 — DeepSeek Harness

DeepSeek integration is flag-gated. To enable it, add your API key to `.env`:

```env
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
```

Once set, the `DeepSeekProvider` in `api/server/services/LLMGateway/providers/DeepSeekProvider.js` is activated automatically. Supported models: `deepseek-chat`, `deepseek-coder`, `deepseek-reasoner`. If the key is absent, the harness silently falls back to other configured providers.

### Social Intelligence Connectors

All 8 social connectors work without API keys (public endpoints). Optional keys unlock higher rate limits:

| Connector | Optional env var | Benefit |
|-----------|-----------------|---------|
| YouTube | `YOUTUBE_API_KEY` | Search + profiles (Piped API used as fallback) |
| Reddit | *(no key needed)* | Public JSON API |
| Bluesky | *(no key needed)* | Public AT Protocol API |
| Mastodon | *(no key needed)* | Public Mastodon API |
| HackerNews | *(no key needed)* | Public Algolia HN API |
| GitHub | `GITHUB_TOKEN` | Higher rate limits (60 → 5000 req/hr) |
| RSS | *(no key needed)* | Direct feed fetch |
| DuckDuckGo | *(no key needed)* | Lite search endpoint |

---

## 📊 Comparación vs Competencia

| Capacidades | GPT | Grok | Claude Code | Manus | Copilot | **AI-OS** |
|------------|-----|------|-------------|-------|---------|----------|
| Agent Loop | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 55+ Tools | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 107 Cognitive Modules | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Computer Use | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| MCP Protocol | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Vision Routing (3 tiers) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| WebLLM (browser) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Fine-Tuning (LoRA) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Memory System (8 tipos) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| RAG Completo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Learning System | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Multi-LLM Routing | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Dashboard UI | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **100% Gratis** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **100% Local** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 🛡️ Seguridad

- **Docker Sandbox** — Aislamiento de código ejecutado
- **CredentialVault** — Almacenamiento seguro de credenciales
- **AgentFirewall** — Bloqueo de operaciones peligrosas
- **PromptInjectionDetector** — Detección de inyección de prompts
- **ApprovalGates** — Puertas de aprobación para operaciones sensibles
- **Audit Logs** — Registro completo de actividades
- **Rate Limiting** — Control de tasa de solicitudes

---

## 📁 Estructura del Proyecto

```
mi-agente/
├── api/                        # Backend API
│   ├── server/
│   │   ├── controllers/        # Controladores Express
│   │   ├── routes/             # Rutas API (115+)
│   │   └── services/
│   │       └── Harness/        # 🧠 Core del agente
│   │           ├── DSHAgentLoop.js        # Loop de ejecución real (usado en producción)
│   │           ├── AgentLoop.js          # Implementación extendida (opcional)
│   │           ├── ComputerUse.js        # Control de escritorio
│   │           ├── tools/                # 55 herramientas
│   │           └── cognitive/            # 107 módulos cognitivos
│   │               ├── memory/           # Sistema de memoria
│   │               ├── rag/              # Sistema RAG
│   │               ├── learning/         # Sistema de aprendizaje
│   │               ├── knowledge/        # Sistema de conocimiento
│   │               ├── llm/              # Routing LLM
│   │               ├── vision/           # Vision router
│   │               ├── mcp/              # MCP client
│   │               └── optimization/     # Optimización de tokens
│   └── app/                    # LibreChat app
├── client/                     # Frontend
│   ├── dashboard.html          # Dashboard principal
│   ├── ai-model-browser.html   # Buscador de modelos
│   └── src/                    # React components (LibreChat)
├── packages/                   # Packages monorepo
├── docker-compose.aios.yml     # 6 servicios Docker (Ollama, MongoDB, Meilisearch, LibreChat, admin, browser)
├── docker-compose.yml          # 8 servicios Docker (API, RAG, MongoDB, Meilisearch, pgvector, computer-use, admin, browser)
├── Dockerfile                  # Build principal
├── .mcp.json                   # Config MCP servers
├── .env.example                # Variables de entorno
└── docs/                       # Documentación
```

---

## 📄 Licencia

**Propietaria** — © 2026 Proyectos AOI. Todos los derechos reservados.

Este software es propietario y confidencial. No está permitido copiar, modificar, distribuir, vender, hacer ingeniería inversa ni divulgar el código fuente a terceros.

Ver [LICENSE](LICENSE) para detalles completos.

---

## 🤝 Soporte

Para soporte o consultas, contacta a Proyectos AOI.

---

<p align="center">
  <strong>🧠 AI-OS — Universal AI Platform</strong><br>
  <em>Construido con ❤️ por Proyectos AOI</em>
</p>
