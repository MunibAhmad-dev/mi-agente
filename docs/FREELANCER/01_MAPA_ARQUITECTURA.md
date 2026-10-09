# 🗺️ MAPA COMPLETO DE LA ARQUITECTURA — AI-OS

## Estado Actual del Proyecto (31 de Agosto, 2026)

---

## 1. PILA TECNOLÓGICA COMPLETA

```
┌─────────────────────────────────────────────────────────────────┐
│                     PILA TECNOLÓGICA AI-OS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FRONTEND                                                       │
│  ├── React 18 + Vite (SPA)                                      │
│  ├── LibreChat UI (30+ componentes React)                       │
│  ├── Admin Panel (React dedicado)                               │
│  ├── AI Model Browser (HTML standalone)                         │
│  ├── Dashboard HTML (22 secciones, vanilla JS)                  │
│  ├── Tailwind CSS (estilos)                                     │
│  ├── React Router (navegación)                                  │
│  ├── TanStack Query (data fetching)                             │
│  ├── Zustand (state management)                                 │
│  └── Socket.IO client (real-time)                               │
│                                                                 │
│  BACKEND                                                        │
│  ├── Node.js 18+ (runtime)                                      │
│  ├── Express.js (HTTP framework)                                │
│  ├── Socket.IO (WebSockets)                                     │
│  ├── Mongoose (MongoDB ODM)                                     │
│  ├── JWT (autenticación)                                        │
│  ├── Passport.js (OAuth/LDAP)                                   │
│  ├── express-rate-limit (rate limiting)                         │
│  └── Helmet (security headers)                                  │
│                                                                 │
│  BASE DE DATOS                                                  │
│  ├── MongoDB 8.0 (principal)                                    │
│  ├── pgvector (vectores RAG)                                    │
│  ├── Redis (cache + sessions)                                   │
│  ├── MeiliSearch (búsqueda full-text)                           │
│  └── LanceDB (vector store local)                               │
│                                                                 │
│  IA / LLM                                                       │
│  ├── Ollama (local, gratis)                                     │
│  ├── LM Studio (local, gratis)                                  │
│  ├── OpenAI API (GPT-4, GPT-3.5)                               │
│  ├── DeepSeek API                                               │
│  ├── xAI API (Grok)                                             │
│  ├── Anthropic API (Claude)                                     │
│  ├── LiteLLM (router universal)                                 │
│  └── WebLLM (browser, gratis)                                   │
│                                                                 │
│  HERRAMIENTAS                                                   │
│  ├── Playwright (navegador real)                                 │
│  ├── Sharp (imágenes)                                           │
│  ├── FFmpeg (video/audio)                                       │
│  ├── Child Process (terminal)                                   │
│  ├── fs (filesystem)                                            │
│  └── simple-git (Git)                                           │
│                                                                 │
│  DOCKER                                                         │
│  ├── docker-compose.yml (7 servicios)                           │
│  ├── Dockerfile (API principal)                                  │
│  ├── Dockerfile.model-browser (AI Model Browser)                │
│  └── deploy-compose.yml (producción)                            │
│                                                                 │
│  TESTING                                                        │
│  ├── Jest (unit tests)                                          │
│  ├── Playwright (E2E tests)                                     │
│  └── Supertest (API tests)                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. MAPA DE ARQUITECTURA — ASCII

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        AI-OS — ARQUITECTURA COMPLETA                    ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE PRESENTACIÓN                            │
│                                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │  LibreChat   │ │    Admin     │ │ AI Model     │ │  Dashboard   │   │
│  │  (React)     │ │    Panel     │ │  Browser     │ │  (HTML)      │   │
│  │  :3080       │ │  (React)     │ │  (HTML)      │ │  (Archivo)   │   │
│  │              │ │  :3000       │ │  :3456       │ │              │   │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘   │
└─────────┼────────────────┼────────────────┼────────────────┼────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE API (Express.js)                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    RUTAS HTTP (68 archivos)                      │   │
│  │                                                                  │   │
│  │  auth.js          → Login, registro, 2FA, OAuth, LDAP          │   │
│  │  convos.js        → CRUD conversaciones                         │   │
│  │  messages.js      → Envío/recepción de mensajes                 │   │
│  │  harness.js       → Control del agente (scaffold, pre-llm, etc) │   │
│  │  models.js        → Modelos LLM disponibles                     │   │
│  │  tools.js         → Lista de herramientas                       │   │
│  │  rag.js           → Sistema RAG                                 │   │
│  │  memories.js      → Sistema de memoria                          │   │
│  │  mcp.js           → Protocolo MCP                               │   │
│  │  vision.js        → Visión por computadora                      │   │
│  │  skills.js        → Sistema de skills                           │   │
│  │  marketplace.js   → Marketplace de plugins                      │   │
│  │  metrics.js       → Métricas del sistema                        │   │
│  │  performance.js   → Rendimiento                                 │   │
│  │  system.js        → Estado del sistema                          │   │
│  │  ... (40+ rutas más)                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MIDDLEWARE (36 archivos)                       │   │
│  │                                                                  │   │
│  │  requireJwtAuth.js    → Verificación JWT                        │   │
│  │  requireLocalAuth.js  → Auth local (usuario/contraseña)         │   │
│  │  requireLdapAuth.js   → Auth LDAP/Active Directory              │   │
│  │  checkBan.js          → Verificación de baneo                   │   │
│  │  validateEmailLogin.js→ Validación de email                      │   │
│  │  moderateText.js      → Moderación de contenido                  │   │
│  │  validateModel.js     → Validación de modelo LLM                │   │
│  │  ... (29 más)                                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CONTROLLERS (20 archivos)                      │   │
│  │                                                                  │   │
│  │  AuthController.js          → Lógica de autenticación           │   │
│  │  TwoFactorController.js     → 2FA (HOTP/TOTP)                   │   │
│  │  UserController.js          → Gestión de usuarios                │   │
│  │  ModelController.js         → Selección de modelos               │   │
│  │  EndpointController.js      → Gestión de endpoints               │   │
│  │  PluginController.js        → Gestión de plugins                 │   │
│  │  Balance.js                 → Gestión de créditos                │   │
│  │  AgentRoutingController.js  → Enrutamiento de agentes            │   │
│  │  PermissionsController.js   → Permisos                           │   │
│  │  ... (11 más)                                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CAPA DE SERVICIOS (70 directorios)                    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    🧠 HARNASS (EL AGENTE)                         │ │
│  │                                                                   │ │
│  │  AgentLoop.js           → Bucle principal (while tool_call)      │ │
│  │  AgentOrchestrator.js   → Orquestación de sub-agentes            │ │
│  │  TaskPlanner.js         → Planificación de tareas                │ │
│  │  ContextCompactor.js    → Compresión de contexto                 │ │
│  │  CheckpointManager.js   → Checkpoints y resume                   │ │
│  │  RecoveryManager.js     → Recuperación de errores                │ │
│  │  SandboxRunner.js       → Ejecución en sandbox                   │ │
│  │  CostTracker.js         → Tracking de costos                     │ │
│  │  StreamingManager.js    → Streaming de respuestas                │ │
│  │  VoiceManager.js        → Voz (TTS/STT)                          │ │
│  │  MCPClient.js           → Cliente MCP                            │ │
│  │  MCPServer.js           → Servidor MCP                           │ │
│  │  ComputerUse.js         → Control de escritorio                  │ │
│  │  RepositoryMap.js       → Mapa del repositorio                   │ │
│  │  VectorStoreManager.js  → Gestión de vector store                │ │
│  │  SocialMediaSearch.js   → Búsqueda en redes sociales             │ │
│  │  SuggestedActionsEngine.js → Acciones sugeridas                   │ │
│  │  DeepSearchAgent.js     → Búsqueda profunda                      │ │
│  │  ... (40+ archivos más)                                          │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    🔧 TOOLS (55 herramientas)                     │ │
│  │                                                                   │ │
│  │  FilesystemTools.js     → Leer/escribir/editar archivos          │ │
│  │  ShellTool.js           → Ejecutar comandos de terminal          │ │
│  │  BrowserManager.js      → Control de Playwright (navegador)      │ │
│  │  ComputerUseTool.js     → Mouse, teclado, screenshots            │ │
│  │  GitIntegration.js      → Operaciones Git                        │ │
│  │  CodeExecutor.js        → Ejecutar código Python/JS/Shell        │ │
│  │  SearchTools.js         → Buscar en archivos (grep/glob)         │ │
│  │  MCPClient.js           → Conectar con servidores MCP            │ │
│  │  VideoProcessor.js      → Edición de video (FFmpeg)              │ │
│  │  ImageGenerator.js      → Generación de imágenes                 │ │
│  │  TTSManager.js          → Text-to-Speech                         │ │
│  │  STTManager.js          → Speech-to-Text                         │ │
│  │  EmailManager.js        → Envío de emails                        │ │
│  │  CalendarManager.js     → Gestión de calendario                  │ │
│  │  DriveManager.js        → Gestión de archivos en nube            │ │
│  │  SocialScraper.js       → Scraping de redes sociales             │ │
│  │  DockerSandbox.js       → Aislamiento en contenedores            │ │
│  │  CICDIntegration.js     → Integración CI/CD                      │ │
│  │  DeploymentEngine.js    → Despliegue automático                  │ │
│  │  BackupManager.js       → Respaldos automáticos                  │ │
│  │  ... (35 más)                                                    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    🧠 COGNITIVO (107 módulos)                     │ │
│  │                                                                   │ │
│  │  Memoria:                                                       │ │
│  │    memory/              → Episódica, semántica, procedural       │ │
│  │    consolidation/       → Consolidación y compresión             │ │
│  │    CrossSessionMemory.js → Memoria entre sesiones                │ │
│  │                                                                   │ │
│  │  Conocimiento:                                                   │ │
│  │    knowledge/           → Knowledge graph, grafo causal          │ │
│  │    rag/                 → RAG híbrido, adaptativo                 │ │
│  │    evidence/            → Evidencia y provenance                 │ │
│  │                                                                   │ │
│  │  Aprendizaje:                                                    │ │
│  │    learning/            → Errores, loops, recuperación           │ │
│  │    experience/          → Replay de experiencias                 │ │
│  │    experiments/         → Motor de experimentación               │ │
│  │    improvement/         → Mejora continua                        │ │
│  │                                                                   │ │
│  │  Planificación:                                                  │ │
│  │    PlanMode.js          → Modo planificación                     │ │
│  │    TaskPlanner.js       → Planificador de tareas                 │ │
│  │    DynamicWorkflows.js  → Workflows dinámicos                    │ │
│  │    ParallelExecutor.js  → Ejecución paralela                     │ │
│  │    DAGScheduler.js      → Scheduler basado en DAG                │ │
│  │                                                                   │ │
│  │  Agentes:                                                        │ │
│  │    CriticAgent.js       → Agente crítico/evaluador               │ │
│  │    ExecutiveBrain.js    → Cerebro ejecutivo                       │ │
│  │    EventBus.js          → Sistema de eventos                     │ │
│  │                                                                   │ │
│  │  Seguridad:                                                      │ │
│  │    ApprovalGates.js     → Gates de aprobación                    │ │
│  │    HookSystem.js        → Hooks pre/post                          │ │
│  │                                                                   │ │
│  │  Evaluación:                                                     │ │
│  │    BenchmarkSuite.js    → Suite de benchmarks                     │ │
│  │    ModelEvaluator.js    → Evaluador de modelos                    │ │
│  │    RAGEvaluator.js      → Evaluador de RAG                        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    📊 OTROS SERVICIOS                             │ │
│  │                                                                   │ │
│  │  RAG/                  → Sistema de Retrieval-Augmented Gen      │ │
│  │  Memory/               → Servicio de memoria                     │ │
│  │  LLMProviders/         → Proveedores LLM (GPT, Grok, etc)       │ │
│  │  Security/             → Hardening de seguridad                  │ │
│  │  LLMGateway/           → Gateway universal de LLM                │ │
│  │  LLMRuntime/           → Runtime de ejecución LLM                │ │
│  │  AgentRuntime/         → Runtime de ejecución del agente         │ │
│  │  Agents/               → Sistema de agentes                      │ │
│  │  SubAgents/            → Sub-agentes                             │ │
│  │  Marketplace/          → Marketplace de plugins                  │ │
│  │  Skills/               → Sistema de skills                       │ │
│  │  SkillsDiscovery/      → Descubrimiento de skills                │ │
│  │  Vision/               → Visión por computadora                  │ │
│  │  WorkflowEngine/       → Motor de workflows                      │ │
│  │  Scheduler/            → Tareas programadas                      │ │
│  │  Telemetry/            → Telemetría                              │ │
│  │  Observability/        → Observabilidad                          │ │
│  │  ... (40+ servicios más)                                         │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE DATOS                                    │
│                                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │   MongoDB    │ │   pgvector   │ │    Redis     │ │ MeiliSearch  │   │
│  │   8.0.20     │ │  0.8.0       │ │   (cache)    │ │  v1.35.1     │   │
│  │   :27017     │ │  :5432       │ │   :6379      │ │  :7700       │   │
│  │              │ │              │ │              │ │              │   │
│  │  Principal   │ │  Vectores    │ │  Sesiones    │ │  Búsqueda    │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                   │
│  │   Ollama     │ │  LM Studio   │ │   LLM APIs   │                   │
│  │   :11434     │ │  :1234       │ │  (remotos)   │                   │
│  │  (local)     │ │  (local)     │ │              │                   │
│  └──────────────┘ └──────────────┘ └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. FLUJO DE COMUNICACIÓN

```
USUARIO (Browser/App)
    │
    │  HTTP/WebSocket
    ▼
┌─────────────────────────────────────────┐
│           LIBRECHAT UI (:3080)           │
│  React + Socket.IO                       │
└────────────────┬────────────────────────┘
                 │
                 │  HTTP POST /api/messages
                 │  WebSocket (streaming)
                 ▼
┌─────────────────────────────────────────┐
│         API SERVER (Express.js)          │
│                                          │
│  ┌──────────────┐                        │
│  │ Auth Middleware│ ← JWT verification   │
│  └──────┬───────┘                        │
│         │                                │
│  ┌──────▼───────┐                        │
│  │ Routes       │ ← 68 route files      │
│  └──────┬───────┘                        │
│         │                                │
│  ┌──────▼───────┐                        │
│  │ Controllers  │ ← 20 controllers      │
│  └──────┬───────┘                        │
│         │                                │
│  ┌──────▼───────┐                        │
│  │ Services     │ ← 70 service dirs     │
│  │              │                        │
│  │  ┌─────────┐│                        │
│  │  │ Harness ││ ← Agent Loop           │
│  │  │ (Agente)││                        │
│  │  └────┬────┘│                        │
│  │       │     │                        │
│  │  ┌────▼────┐│                        │
│  │  │  Tools  ││ ← 55 herramientas      │
│  │  └────┬────┘│                        │
│  │       │     │                        │
│  │  ┌────▼────┐│                        │
│  │  │Cognitive││ ← 107 módulos          │
│  │  └─────────┘│                        │
│  └──────────────┘                        │
└────────────────┬────────────────────────┘
                 │
                 │  Mongoose/SQL/HTTP
                 ▼
┌─────────────────────────────────────────┐
│           BASE DE DATOS                  │
│                                          │
│  MongoDB ←→ pgvector ←→ Redis ←→ Meili  │
└─────────────────────────────────────────┘
```

---

## 4. ESTRUCTURA DE ARCHIVOS DEL PROYECTO

```
mi agente ia/
│
├── api/                          ← BACKEND (Node.js + Express)
│   └── server/
│       ├── index.js              ← ENTRY POINT (arranca el servidor)
│       ├── routes/               ← 68 archivos de rutas HTTP
│       │   ├── index.js          ← Registra todas las rutas
│       │   ├── auth.js           ← Login/logout/registro/2FA
│       │   ├── convos.js         ← CRUD conversaciones
│       │   ├── messages.js       ← Envío de mensajes
│       │   ├── harness.js        ← Control del agente
│       │   ├── models.js         ← Modelos LLM
│       │   ├── tools.js          ← Herramientas
│       │   ├── rag.js            ← Sistema RAG
│       │   ├── memories.js       ← Memoria
│       │   ├── mcp.js            ← Protocolo MCP
│       │   ├── vision.js         ← Visión
│       │   └── ... (56 más)
│       ├── controllers/          ← 20 controllers
│       ├── middleware/           ← 36 middlewares
│       ├── services/             ← 70 directorios de servicios
│       │   ├── Harness/          ← 🔥 EL AGENTE COMPLETO
│       │   │   ├── AgentLoop.js  ← Bucle principal
│       │   │   ├── tools/        ← 55 herramientas
│       │   │   ├── cognitive/    ← 107 módulos cognitivos
│       │   │   └── ...
│       │   ├── RAG/              ← Sistema RAG
│       │   ├── Memory/           ← Sistema de memoria
│       │   ├── LLMProviders/     ← Proveedores LLM
│       │   └── ...
│       └── utils/                ← Utilidades
│
├── client/                       ← FRONTEND (React + Vite)
│   └── src/
│       ├── components/           ← Componentes React
│       ├── hooks/                ← Custom hooks
│       ├── store/                ← Zustand stores
│       ├── routes/               ← React Router
│       └── ...
│
├── packages/                     ← PAQUETES COMPARTIDOS
│   ├── api/                      ← Paquete de API
│   ├── data-provider/            ← Proveedor de datos
│   ├── data-schemas/             ← Esquemas de datos
│   ├── client/                   ← Paquete cliente
│   ├── api-key-client/           ← Cliente de API keys
│   └── mcp-server/               ← Servidor MCP
│
├── config/                       ← CONFIGURACIÓN
│   ├── update.js
│   ├── create-user.js
│   └── ...
│
├── integrations/                 ← INTEGRACIONES EXTERNAS
│   ├── free-claude-code/
│   ├── comfyui/
│   └── litellm-gateway/
│
├── docker-compose.yml            ← DOCKER (7 servicios)
├── Dockerfile                    ← Build de la API
├── Dockerfile.model-browser      ← Build del Model Browser
├── .env.example                  ← Variables de entorno
├── setup.bat                     ← Setup Windows
├── setup.sh                      ← Setup Linux/Mac
├── package.json                  ← Dependencias principales
└── README.md                     ← Documentación
```

---

## 5. RESUMEN DE MÉTRICAS

| Métrica | Valor |
|---------|-------|
| **Archivos totales** | ~4,949 |
| **Líneas de código (backend)** | 91,822 |
| **Rutas HTTP** | 68 |
| **Servicios** | 70 directorios |
| **Controllers** | 20 |
| **Middlewares** | 36 |
| **Tools (herramientas)** | 55 |
| **Módulos cognitivos** | 107 |
| **Contenedores Docker** | 7 |
| **Paquetes compartidos** | 6 |
| **Integraciones** | 3+ |

---

## 6. TIPO DE ARQUITECTURA

**Clasificación:** Monolito modular con servicios Docker externos

```
┌─────────────────────────────────────────────────────────┐
│  MONOLITO MODULAR (API + Harness + Tools + Cognitive)   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Express.js Server (:3080)                       │   │
│  │  ├── Routes (68)                                │   │
│  │  ├── Controllers (20)                           │   │
│  │  ├── Services (70)                              │   │
│  │  │   ├── Harness (Agent + Tools + Cognitive)    │   │
│  │  │   ├── RAG                                    │   │
│  │  │   ├── Memory                                 │   │
│  │  │   ├── LLMProviders                           │   │
│  │  │   └── ...                                    │   │
│  │  └── Middleware (36)                             │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  SERVICIOS EXTERNOS (Docker)                            │
│  ├── MongoDB (:27017)                                  │
│  ├── pgvector (:5432)                                  │
│  ├── Redis (:6379)                                     │
│  ├── MeiliSearch (:7700)                               │
│  ├── Ollama (:11434)                                   │
│  └── RAG API (:8000)                                   │
└─────────────────────────────────────────────────────────┘
```

---

*Documento generado para auditoría arquitectónica del proyecto AI-OS.*
