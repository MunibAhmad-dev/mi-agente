# 📋 GUÍA DEL PROYECTO PARA FREELANCER

## AI-OS — Universal AI Platform

**Versión:** 1.0  
**Fecha:** 31 de Agosto, 2026  
**Repositorio:** https://github.com/proyectos-aoi/mi-agente

---

## 1. ¿QUÉ ES ESTE PROYECTO?

AI-OS es una **plataforma de IA autónoma** que funciona como un "sistema operativo de inteligencia artificial". Combina:

- Un **agente de IA** que puede ejecutar tareas reales (archivos, terminal, navegador, escritorio)
- **Memoria y aprendizaje** que persiste entre sesiones
- **Múltiples modelos LLM** (locales y remotos)
- **Interfaz web** completa (LibreChat + Dashboard personalizado)

**No es un chatbot simple.** Es un sistema que puede:
- Leer/escribir/editar archivos en tu computadora
- Ejecutar comandos de terminal
- Navegar por internet con un navegador real
- Controlar el escritorio (screenshots, mouse, teclado)
- Procesar video, audio, imágenes
- Conectar con servicios externos via MCP
- Aprender de errores y mejorar con el tiempo

---

## 2. ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────┐
│                    INTERFAZ DE USUARIO                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │LibreChat │  │Dashboard │  │AdminPanel│  │OpenCode│  │
│  │ :3080    │  │  HTML    │  │  :3000   │  │ :4096  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
└───────┼──────────────┼──────────────┼────────────┼──────┘
        │              │              │            │
        ▼              ▼              ▼            ▼
┌─────────────────────────────────────────────────────────┐
│                    API SERVER (Node.js)                   │
│                    Puerto: 3080                           │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              RUTAS (api/server/routes/)              │ │
│  │  auth.js, convos.js, messages.js, tools.js,         │ │
│  │  harness.js, models.js, rag.js, memories.js,        │ │
│  │  mcp.js, vision.js, skills.js, marketplace.js ...   │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │           SERVICIOS (api/server/services/)           │ │
│  │                                                      │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │ │
│  │  │   Harness    │  │  Cognitive   │  │    RAG    │ │ │
│  │  │  (Agente)    │  │  (Cerebro)   │  │(Búsqueda) │ │ │
│  │  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │ │
│  │         │                 │                 │       │ │
│  │  ┌──────▼───────┐  ┌──────▼───────┐  ┌─────▼─────┐ │ │
│  │  │  AgentLoop   │  │   Memory     │  │  Vector   │ │ │
│  │  │  (Bucle)     │  │  (Memoria)   │  │    DB     │ │ │
│  │  └──────────────┘  └──────────────┘  └───────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   MongoDB    │ │   Redis      │ │  pgvector    │
│  :27017      │ │  :6379       │ │  :5432       │
│  (Datos)     │ │  (Cache)     │ │  (Vectores)  │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 3. FLUJO DE UNA PETICIÓN

### Flujo completo: Usuario escribe algo → Respuesta

```
1. USUARIO escribe en LibreChat (http://localhost:3080)
        │
        ▼
2. LibreChat envía POST a /api/messages
        │
        ▼
3. API SERVER recibe la petición
        │
        ├──▶ auth.js: Verifica JWT token
        ├──▶ convos.js: Carga/crea conversación
        └──▶ messages.js: Procesa mensaje
                │
                ▼
4. AgentLoop.js (el cerebro del agente)
        │
        ├──▶ ContextCompactor.js: Comprime contexto si es muy largo
        ├──▶ UniversalLLMRouter.js: Selecciona mejor LLM
        │       ├── Ollama (local, gratis)
        │       ├── OpenAI/GPT (remoto, paga)
        │       ├── DeepSeek (remoto, paga)
        │       └── xAI/Grok (remoto, paga)
        │
        ├──▶ LLM responde con texto O tool_calls
        │       │
        │       ▼
        │   ¿Tiene tool_calls?
        │       │
        │       ├── NO → Devuelve respuesta al usuario
        │       │
        │       └── SÍ → Ejecuta herramientas
        │               │
        │               ▼
        │       tools/index.js: Busca la herramienta
        │               │
        │               ├──▶ FilesystemTools.js (leer/escribir archivos)
        │               ├──▶ ShellTool.js (ejecutar comandos)
        │               ├──▶ BrowserManager.js (navegador Playwright)
        │               ├──▶ ComputerUseTool.js (control escritorio)
        │               ├──▶ GitIntegration.js (operaciones git)
        │               ├──▶ CodeExecutor.js (ejecutar código)
        │               ├──▶ SearchTools.js (buscar en archivos)
        │               ├──▶ MCPClient.js (servidores MCP)
        │               ├──▶ ... (55 herramientas en total)
        │               │
        │               ▼
        │       Resultado → Vuelve al AgentLoop
        │               │
        │               ▼
        │       ¿Necesita más pasos?
        │           ├── SÍ → Repite desde paso 4
        │           └── NO → Devuelve respuesta final
        │
        ▼
5. RESPUESTA se guarda en MongoDB
        │
        ▼
6. USUARIO ve la respuesta en LibreChat
```

---

## 4. DÓNDE ESTÁ EL BACKEND

### 📍 Ubicación principal del backend:

```
mi agente ia/
├── api/
│   └── server/
│       ├── index.js              ← PUNTO DE ENTRADA (arranca el servidor)
│       ├── routes/               ← RUTAS HTTP (endpoints)
│       │   ├── index.js          ← Registra todas las rutas
│       │   ├── auth.js           ← Login/logout/registro
│       │   ├── convos.js         ← CRUD de conversaciones
│       │   ├── messages.js       ← Envío/recepción de mensajes
│       │   ├── harness.js        ← Control del agente
│       │   ├── models.js         ← Modelos LLM disponibles
│       │   ├── tools.js          ← Lista de herramientas
│       │   ├── rag.js            ← Sistema RAG
│       │   ├── memories.js       ← Sistema de memoria
│       │   ├── mcp.js            ← Protocolo MCP
│       │   ├── vision.js         ← Visión por computadora
│       │   ├── skills.js         ← Sistema de skills
│       │   ├── marketplace.js    ← Marketplace de plugins
│       │   ├── metrics.js        ← Métricas del sistema
│       │   ├── performance.js    ← Rendimiento
│       │   ├── system.js         ← Estado del sistema
│       │   └── ... (40+ rutas)
│       │
│       ├── controllers/          ← Lógica de negocio
│       ├── middleware/           ← Auth, rate-limit, CORS
│       ├── services/             ← SERVICIOS PRINCIPALES
│       │   ├── Harness/          ← 🔥 EL AGENTE COMPLETO
│       │   │   ├── AgentLoop.js  ← Bucle principal del agente
│       │   │   ├── tools/        ← 55 herramientas
│       │   │   ├── cognitive/    ← 107 módulos cognitivos
│       │   │   ├── ComputerUse.js
│       │   │   ├── MCPClient.js
│       │   │   └── ...
│       │   ├── RAG/              ← Sistema de búsqueda
│       │   ├── Memory/           ← Sistema de memoria
│       │   ├── LLMProviders/     ← Proveedores LLM
│       │   ├── Security/         ← Seguridad
│       │   └── ... (60+ servicios)
│       └── utils/                ← Utilidades
```

### 📍 Archivos clave para entender el flujo:

| Archivo | Qué hace | Líneas |
|---------|----------|--------|
| `api/server/index.js` | Arranca Express, monta rutas, inicia servicios | ~200 |
| `api/server/routes/index.js` | Registra TODAS las rutas HTTP | ~150 |
| `api/server/routes/harness.js` | Endpoints del agente (/harness/chat, /harness/tools) | ~100 |
| `api/server/services/Harness/AgentLoop.js` | **EL CEREBRO** — bucle principal while(tool_call) | ~750 |
| `api/server/services/Harness/tools/index.js` | Registra las 55 herramientas | ~120 |
| `api/server/services/Harness/cognitive/index.js` | Registra los 107 módulos cognitivos | ~200 |

---

## 5. DOCKER — CONTENEDORES

```yaml
# docker-compose.yml
services:
  LibreChat        → Puerto 3080   → UI principal (React)
  admin-panel      → Puerto 3000   → Panel de administración
  ai-model-browser → Puerto 3456   → Buscador de modelos IA
  chat-mongodb     → Puerto 27017  → Base de datos principal
  chat-meilisearch → Puerto 7700   → Motor de búsqueda
  vectordb         → Puerto 5432   → pgvector (vectores)
  rag_api          → Puerto 8000   → API de RAG
```

### Iniciar todo:
```bash
docker compose up -d
```

### Ver logs de un servicio:
```bash
docker logs LibreChat -f
docker logs chat-mongodb -f
```

### Detener todo:
```bash
docker compose down
```

---

## 6. SISTEMA DE HERRAMIENTAS (TOOLS)

Las 55 herramientas están en `api/server/services/Harness/tools/`:

### 🗂️ Archivos y Sistema:
| Tool | Archivo | Qué hace |
|------|---------|----------|
| Filesystem | FilesystemTools.js | Leer, escribir, editar, crear, eliminar archivos |
| Shell | ShellTool.js | Ejecutar comandos de terminal |
| Search | SearchTools.js | Buscar en archivos (grep/glob) |
| Git | GitIntegration.js | Commits, branches, merges, diffs |
| Git Worktree | GitWorktreeManager.js | Worktrees aislados |
| Git Rollback | GitRollback.js | Revertir cambios |

### 🌐 Navegador y Web:
| Tool | Archivo | Qué hace |
|------|---------|----------|
| Browser | BrowserManager.js | Control de Playwright (navegador real) |
| Web Scraper | WebScraper.js | Extraer contenido de páginas |
| Deeper Search | DeeperSearchV2.js | Búsqueda profunda en web |
| Social Scraper | SocialScraper.js | Scraping de redes sociales |
| RSS | RSSAggregator.js | Lectores RSS |
| Email | EmailManager.js | Envío de emails |
| Calendar | CalendarManager.js | Gestión de calendario |
| Drive | DriveManager.js | Gestión de archivos en nube |

### 🖥️ Control de Escritorio:
| Tool | Archivo | Qué hace |
|------|---------|----------|
| Computer Use | ComputerUseTool.js | Mouse, teclado, screenshots |
| Computer Vision | ComputerUseVision.js | Análisis visual de pantalla |
| Desktop Controller | DesktopController.js | Control del escritorio |
| Clipboard | ClipboardManager.js | Portapapeles |

### 💻 Código y Desarrollo:
| Tool | Archivo | Qué hace |
|------|---------|----------|
| Code Executor | CodeExecutor.js | Ejecutar Python/JS/Shell |
| LSP Integration | LSPIntegration.js | Language Server Protocol |
| CICD | CICDIntegration.js | Integración CI/CD |
| Deployment | DeploymentEngine.js | Despliegue automático |

### 🧠 IA y Procesamiento:
| Tool | Archivo | Qué hace |
|------|---------|----------|
| MultiModal | MultiModalLocal.js | Imágenes, audio, video |
| TTS | TTSManager.js | Text-to-Speech |
| STT | STTManager.js | Speech-to-Text |
| Image Generator | ImageGenerator.js | Generación de imágenes |
| Video Processor | VideoProcessor.js | Edición de video (FFmpeg) |
| Diagram | DiagramGenerator.js | Generación de diagramas |

### 🔧 Otros:
| Tool | Archivo | Qué hace |
|------|---------|----------|
| MCP Client | MCPClient.js | Conectar con servidores MCP |
| Docker Sandbox | DockerSandbox.js | Aislamiento en contenedores |
| Health Dashboard | HealthDashboard.js | Monitoreo de salud |
| Metrics | MetricsCollector.js | Recopilación de métricas |
| Playbook | PlaybookManager.js | Ejecución de playbooks |
| Plugin Marketplace | PluginMarketplace.js | Marketplace de plugins |
| Backup | BackupManager.js | Respaldos automáticos |
| ... | ... | (55 tools en total) |

---

## 7. SISTEMA COGNITIVO (CEREBRO)

Los 107 módulos están en `api/server/services/Harness/cognitive/`:

### 🧠 Memoria:
- `memory/` — Memoria episódica, semántica, procedural, de usuario
- `consolidation/` — Consolidación y compresión de memoria
- `CrossSessionMemory.js` — Memoria entre sesiones

### 📚 Conocimiento:
- `knowledge/` — Knowledge graph, grafo causal
- `rag/` — RAG híbrido, adaptativo, por capas
- `evidence/` — Sistema de evidencia y provenance

### 🔄 Aprendizaje:
- `learning/` — Aprendizaje de errores, loops, recuperación
- `experience/` — Replay de experiencias
- `experiments/` — Motor de experimentación
- `improvement/` — Mejora continua

### 🎯 Planificación:
- `PlanMode.js` — Modo planificación explícito
- `TaskPlanner.js` — Planificador de tareas
- `DynamicWorkflows.js` — Workflows dinámicos
- `ParallelExecutor.js` — Ejecución paralela
- `DAGScheduler.js` — Scheduler basado en DAG

### 🤖 Agentes:
- `CriticAgent.js` — Agente crítico/evaluador
- `ExecutiveBrain.js` — Cerebro ejecutivo
- `EventBus.js` — Sistema de eventos

### 🔍 Búsqueda:
- `AdaptiveRAG.js` — RAG adaptativo
- `HybridSearch.js` — Búsqueda híbrida
- `ContextualRetriever.js` — Recuperación contextual

### 🛡️ Seguridad:
- `ApprovalGates.js` — Gates de aprobación
- `HookSystem.js` — Sistema de hooks (pre/post)
- `Security/` — Hardening de seguridad

### 📊 Evaluación:
- `BenchmarkSuite.js` — Suite de benchmarks
- `ModelEvaluator.js` — Evaluador de modelos
- `RAGEvaluator.js` — Evaluador de RAG
- `SourceEvaluator.js` — Evaluador de fuentes

---

## 8. MODELOS LLM

### Configuración actual:

| Proveedor | Tipo | Costo | Configuración |
|-----------|------|-------|---------------|
| **Ollama** | Local | Gratis | `http://localhost:11434` |
| **LM Studio** | Local | Gratis | `http://localhost:1234` (si está corriendo) |
| **OpenAI/GPT** | Remoto | Paga | API key en `.env` |
| **DeepSeek** | Remoto | Paga | API key en `.env` |
| **xAI/Grok** | Remoto | Paga | API key en `.env` |
| **Anthropic/Claude** | Remoto | Paga | API key en `.env` |

### Modelos instalados en Ollama:

```bash
# Ver modelos disponibles
curl http://localhost:11434/api/tags

# Descargar un modelo
ollama pull qwen3:1.7b
ollama pull moondream    # Vision (1.8B)
ollama pull llava:7b     # Vision (7B)
```

---

## 9. BASE DE DATOS (MONGODB)

### Conexión:
```
mongodb://localhost:27017/LibreChat
```

### Colecciones principales:

| Colección | Qué almacena |
|-----------|-------------|
| `conversations` | Conversaciones con el agente |
| `messages` | Mensajes (usuario + asistente) |
| `users` | Usuarios registrados |
| `presets` | Configuraciones de modelo |
| `prompts` | Prompts personalizados |
| `memories` | Memoria del agente |
| `skills` | Skills/habilidades aprendidas |
| `tools_config` | Configuración de herramientas |
| `knowledge_base` | Base de conocimiento RAG |
| `sessions` | Sesiones activas |
| `audit_logs` | Logs de auditoría |

### Ver datos con MongoDB Compass:
1. Abrir MongoDB Compass
2. Conectar a: `mongodb://localhost:27017/LibreChat`
3. Navegar las colecciones

---

## 10. ARCHIVOS IMPORTANTES

### Para entender el proyecto:
| Archivo | Descripción |
|---------|-------------|
| `README.md` | Documentación principal |
| `docker-compose.yml` | Configuración de contenedores |
| `.env.example` | Variables de entorno (plantilla) |
| `setup.bat` / `setup.sh` | Instalación one-click |

### Para auditoría:
| Archivo | Descripción |
|---------|-------------|
| `AUDITORIA_FINAL_ACTUALIZADA.md` | Auditoría completa del estado |
| `DASHBOARD_UI_SPECIFICATION.md` | Especificación del dashboard |
| `DASHBOARD_INVENTORY.md` | Inventario de dashboards |

### Para desarrollo:
| Archivo | Descripción |
|---------|-------------|
| `api/server/index.js` | Entry point del backend |
| `api/server/routes/index.js` | Todas las rutas HTTP |
| `api/server/services/Harness/AgentLoop.js` | Bucle principal del agente |
| `api/server/services/Harness/tools/index.js` | Registro de herramientas |
| `api/server/services/Harness/cognitive/index.js` | Registro de módulos cognitivos |

---

## 11. COMANDOS ÚTILES

```bash
# Iniciar todo
docker compose up -d

# Ver logs del agente
docker logs LibreChat -f

# Ver logs de MongoDB
docker logs chat-mongodb -f

# Verificar estado de servicios
docker ps

# Reiniciar un servicio
docker compose restart api

# Detener todo
docker compose down

# Reconstruir contenedores
docker compose up -d --build

# Ver modelos de Ollama
curl http://localhost:11434/api/tags

# Probar el agente directamente
curl -X POST http://localhost:3080/api/harness/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola, ¿qué puedes hacer?"}'
```

---

## 12. PUERTOS

| Puerto | Servicio | URL |
|--------|----------|-----|
| 3080 | LibreChat (UI principal) | http://localhost:3080 |
| 3000 | Admin Panel | http://localhost:3000 |
| 3456 | AI Model Browser | http://localhost:3456 |
| 27017 | MongoDB | localhost:27017 |
| 7700 | MeiliSearch | localhost:7700 |
| 5432 | pgvector (vectordb) | localhost:5432 |
| 8000 | RAG API | localhost:8000 |
| 11434 | Ollama (LLM local) | http://localhost:11434 |
| 4096 | OpenCode | http://localhost:4096 |

---

## 13. TROUBLESHOOTING

### MongoDB no conecta:
```bash
docker logs chat-mongodb
# Si dice "address already in use": 
docker stop chat-mongodb && docker rm chat-mongodb
docker compose up -d mongodb
```

### LibreChat no carga:
```bash
docker logs LibreChat
# Verificar que MongoDB está corriendo:
docker ps | grep mongo
```

### Ollama no responde:
```bash
curl http://localhost:11434/api/tags
# Si no responde:
ollama serve
```

### Puerto 3080 ocupado:
```bash
# En Windows:
netstat -ano | findstr :3080
# Matar el proceso que lo usa
```

---

**Documento generado para auditoría y desarrollo del proyecto AI-OS.**
