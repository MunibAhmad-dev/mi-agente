# 09 — FLUJO DE RAG, MEMORIA, AGENTES, HERRAMIENTAS Y ENRUTAMIENTO DE MODELOS

---

## 1. FLUJO RAG (Retrieval-Augmented Generation)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIO                                 │
│               "¿Qué es el proyecto X?"                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │  QUERY REFORM │  QueryExpander expande la query
                  │  + Expansión  │  con sinónimos, contexto
                  └───────┬───────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
      ┌──────────────┐ ┌──────────┐ ┌──────────────┐
      │  BM25 SEARCH │ │ SEMANTIC │ │  KNOWLEDGE   │  Búsqueda híbrida
      │  (Keywords)  │ │ (Vector) │ │  GRAPH       │
      └──────┬───────┘ └────┬─────┘ └──────┬───────┘
             │              │              │
             ▼              ▼              ▼
      ┌──────────────────────────────────────────┐
      │         HYBRID RETRIEVER                  │
      │   Combina resultados de las 3 fuentes     │
      │   + Cross-document deduplication          │
      └──────────────────┬───────────────────────┘
                         │
                         ▼
      ┌──────────────────────────────────────────┐
      │         RE-RANKING                        │
      │   ReRanker re-ordena por relevancia        │
      │   Cross-encoder scoring                   │
      └──────────────────┬───────────────────────┘
                         │
                         ▼
      ┌──────────────────────────────────────────┐
      │         CONTEXT INJECTION                 │
      │   ContextInjector arma el prompt final     │
      │   + Conversation context                   │
      │   + Memory context                         │
      │   + RAG context (comprimido)               │
      └──────────────────┬───────────────────────┘
                         │
                         ▼
                  ┌───────────────┐
                  │  LLM REQUEST  │  Prompt completo al modelo
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │   RESPUESTA   │  Respuesta con citations
                  └───────────────┘
```

### Archivos RAG:
| Archivo | Función |
|---------|---------|
| `cognitive/rag/RAGEngine.js` | Pipeline principal RAG |
| `cognitive/rag/HybridRetriever.js` | BM25 + Semantic + Graph |
| `cognitive/rag/SmartChunker.js` | Chunking inteligente por oración |
| `cognitive/rag/SemanticCompressor.js` | Compresión semántica (50-70%) |
| `cognitive/rag/CrossDocDeduplicator.js` | Deduplicación cross-document |
| `cognitive/rag/IncrementalCompressor.js` | Solo comprimir lo nuevo |
| `cognitive/rag/ReRanker.js` | Re-ranking cross-encoder |
| `cognitive/rag/ContextInjector.js` | Inyección de contexto |
| `cognitive/rag/QueryExpander.js` | Expansión de queries |
| `cognitive/rag/DocProcessor.js` | Procesamiento de documentos |
| `cognitive/rag/EmbeddingEngine.js` | Embeddings con sentence-transformers |
| `cognitive/rag/VectorStore.js` | Almacenamiento vectorial |
| `cognitive/rag/DocumentIndexer.js` | Indexación de documentos |
| `cognitive/rag/RAGMonitor.js` | Métricas de calidad RAG |
| `cognitive/rag/AdaptiveRAG.js` | RAG adaptativo por tarea |

---

## 2. FLUJO DE MEMORIA

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT ENGINE                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               SHORT-TERM MEMORY                         │    │
│  │  Últimos N mensajes de la conversación                   │    │
│  │  In-memory, se pierde al cerrar sesión                   │    │
│  │  Capacidad: ~20 mensajes o ~4000 tokens                  │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                     │
│  ┌────────────────────────┼────────────────────────────────┐    │
│  │               WORKING MEMORY                            │    │
│  │  Contexto activo de la tarea actual                     │    │
│  │  In-memory, persiste durante la tarea                    │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                     │
│  ┌────────────────────────┼────────────────────────────────┐    │
│  │              LONG-TERM MEMORY (SQLite)                  │    │
│  │                                                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                │    │
│  │  │ EPISODIC │ │ SEMANTIC │ │PROCEDURAL│                │    │
│  │  │ (Tareas) │ │(Conocim.)│ │(Cómo hcer)│               │    │
│  │  └──────────┘ └──────────┘ └──────────┘                │    │
│  │                                                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                │    │
│  │  │  USER    │ │ PROJECT  │ │CONVERSAT.│                │    │
│  │  │ MEMORY   │ │ MEMORY   │ │ MEMORY   │                │    │
│  │  └──────────┘ └──────────┘ └──────────┘                │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                     │
│  ┌────────────────────────┼────────────────────────────────┐    │
│  │           MEMORY CONSOLIDATION                          │    │
│  │  MemoryConsolidator fusiona y limpia memorias           │    │
│  │  CognitiveSleep ejecuta ciclos de consolidación        │    │
│  │  MemoryDecay reduce confianza de memorias antiguas     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Archivos de memoria:
| Archivo | Función |
|---------|---------|
| `memory/MemoryEngine.js` | Engine principal de memoria |
| `memory/LongTermMemory.js` | SQLite persistente |
| `memory/ShortTermMemory.js` | Sliding window in-memory |
| `memory/WorkingMemory.js` | Contexto activo de tarea |
| `memory/EpisodicMemory.js` | Episodios de tarea |
| `memory/SemanticMemory.js` | Base de conocimiento |
| `memory/ProceduralMemory.js` | Procedimientos paso a paso |
| `memory/UserMemory.js` | Datos persistentes por usuario |
| `memory/ProjectMemory.js` | Datos por proyecto |
| `memory/ConversationMemory.js` | Historial de chat |
| `memory/MemoryConsolidator.js` | Pipeline de consolidación |
| `memory/MemoryReplay.js` | Replay de experiencias |
| `memory/CognitiveSleep.js` | Ciclos de sueño cognitivo |
| `memory/MemoryDecay.js` | Decaimiento de confianza |
| `memory/ProvenanceTracker.js` | Tracking de procedencia |
| `memory/ConfidenceScorer.js` | Scoring de confianza |
| `memory/ContradictionDetector.js` | Detección de contradicciones |
| `memory/KnowledgeVersioning.js` | Versionado de conocimiento |
| `memory/ForgettingManager.js` | Olvido estratégico |
| `memory/MemoryRanker.js` | Ranking de relevancia |

---

## 3. FLUJO DEL AGENTE (Agent Loop)

```
┌─────────────────────────────────────────────────────────────────┐
│                       AGENT LOOP                                 │
│                   AgentLoop.js (750 líneas)                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. RECIBIR TAREA                                        │    │
│  │    → Usuario envía mensaje                               │    │
│  │    → ContextEngine ensambla contexto                     │    │
│  │    → ContextCompactor comprime si > max_tokens           │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │ 2. PLANIFICAR                                          │    │
│  │    → PlannerEngine crea plan                             │    │
│  │    → TaskDecomposer divide en pasos                      │    │
│  │    → TodoManager actualiza todo.md                       │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │ 3. EJECUTAR (while loop)                                │    │
│  │    ┌────────────────────────────────────────────────┐   │    │
│  │    │  a. Enviar prompt al LLM (via UniversalLLMRouter)│  │    │
│  │    │  b. LLM responde con tool_call o texto          │  │    │
│  │    │  c. Si tool_call:                               │  │    │
│  │    │     → Seleccionar herramienta                   │  │    │
│  │    │     → Verificar permisos (PolicyEngine)        │  │    │
│  │    │     → Ejecutar herramienta                      │  │    │
│  │    │     → HookSystem: PreToolUse → Execute → Post  │  │    │
│  │    │     → Capturar resultado                        │  │    │
│  │    │     → LoopDetector: ¿estamos en loop?           │  │    │
│  │    │  d. Si texto: proceso terminado                  │  │    │
│  │    │  e. Guardar execution trace                     │  │    │
│  │    └────────────────────────────────────────────────┘   │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │ 4. VERIFICAR                                            │    │
│  │    → Verifiers: tests, lint, type-check                 │    │
│  │    → CriticAgent: evaluación LLM                        │    │
│  │    → ¿Exito? → Guardar en memoria                       │    │
│  │    → ¿Fallo? → Recovery strategies                      │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │ 5. APRENDER                                             │    │
│  │    → LearningEngine procesa evento                      │    │
│  │    → FailureDetector analiza errores                    │    │
│  │    → RootCauseAnalyzer diagnostica causa                │    │
│  │    → LessonExtractor extrae lección                     │    │
│  │    → KnowledgeValidator verifica                        │    │
│  │    → MemoryConsolidator almacena                        │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │ 6. RESPONDER AL USUARIO                                │    │
│  │    → Respuesta final con contexto                       │    │
│  │    → Suggested Actions (action chips)                   │    │
│  │    → Follow-up suggestions                              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Archivos del agente:
| Archivo | Función |
|---------|---------|
| `AgentLoop.js` | Loop principal del agente |
| `cognitive/AutoLauncher.js` | Auto-inicia servicios |
| `cognitive/ContextCompactor.js` | Compresión de contexto |
| `cognitive/planner/PlannerEngine.js` | Planificación dinámica |
| `cognitive/planner/TaskDecomposer.js` | Descomposición de tareas |
| `cognitive/planner/ReplanningEngine.js` | Re-planificación |
| `cognitive/planner/CheckpointManager.js` | Checkpoints y resume |

---

## 4. FLUJO DE HERRAMIENTAS (Tools)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOOL EXECUTION                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  LLM devuelve: tool_call = { name: "ShellTool",        │    │
│  │                                args: { command: "ls" } } │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  1. Buscar tool en registry                            │    │
│  │     tools/index.js → { ShellTool: require(...) }        │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  2. Verificar permisos                                 │    │
│  │     PolicyEngine: ¿el usuario puede usar esta tool?     │    │
│  │     PermissionManager: ¿está autorizado?                │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  3. Hook: PreToolUse                                   │    │
│  │     HookSystem ejecuta hooks pre-ejecución              │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  4. Ejecutar tool                                      │    │
│  │     ShellTool.execute({ command: "ls" })               │    │
│  │     → child_process.spawn(...)                          │    │
│  │     → stdout + stderr                                   │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  5. Hook: PostToolUse                                  │    │
│  │     HookSystem ejecuta hooks post-ejecución             │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  6. Guardar resultado                                  │    │
│  │     → ExecutionTrace                                   │    │
│  │     → ToolLearning: registrar uso exitoso/fallido       │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  7. Devolver resultado al LLM                          │    │
│  │     → resultado → siguiente turno del LLM               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Categorías de tools (55 total):

| Categoría | Tools | Archivo index |
|-----------|-------|---------------|
| Core Agent (P0) | Filesystem, Shell, Search | `tools/index.js` |
| Advanced (P2-P4) | CodeExec, GitWorktree, GitRollback, ComputerUse | `tools/index.js` |
| Original (14) | Hook, Browser, CICD, Deploy, Image, TTS, etc. | `tools/index.js` |
| Gap Coverage (12) | Canvas, Plugin, Cloud, Plan, Companion, etc. | `tools/index.js` |
| New (13) | WebScraper, STT, Backup, Git, Health, etc. | `tools/index.js` |
| Protocol (5) | Email, Calendar, Drive, Social, RSS | `tools/index.js` |
| Improvement (3) | Docker, MultiModal, Video | `tools/index.js` |

---

## 5. FLUJO DE ENRUTAMIENTO DE MODELOS

```
┌─────────────────────────────────────────────────────────────────┐
│                 UNIVERSAL LLM ROUTER                             │
│             UniversalLLMRouter.js                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  RECIBIR: task + context + requirements                 │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  CLASIFICAR TAREA                                      │    │
│  │  → ¿Es coding? → Preferir: Qwen3-Coder, DeepSeek      │    │
│  │  → ¿Es conversación? → Preferir: Llama, Mistral        │    │
│  │  → ¿Es análisis? → Preferir: GLM, Qwen                 │    │
│  │  → ¿Es simple? → Modelo pequeño (1-3B)                  │    │
│  │  → ¿Es compleja? → Modelo grande (7-13B+)               │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  SELECCIONAR PROVEEDOR                                 │    │
│  │                                                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │    │
│  │  │  OLLAMA  │  │   LLM    │  │  LOCAL   │              │    │
│  │  │  (local) │  │ STUDIO   │  │  (vLLM)  │              │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘              │    │
│  │       │             │             │                      │    │
│  │  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐              │    │
│  │  │  OPENAI  │  │  GROK/   │  │  ANTHROPIC│              │    │
│  │  │  (API)   │  │  xAI     │  │  (API)    │              │    │
│  │  └──────────┘  └──────────┘  └──────────┘              │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  NORMALIZAR RESPUESTA                                  │    │
│  │  ResponseNormalizer: unifica formato tool_calls/text    │    │
│  │  → Ollama format: { content, tool_calls }               │    │
│  │  → OpenAI format: { choices[0].message }                │    │
│  │  → DeepSeek format: adaptado                            │    │
│  │  → Grok format: adaptado                                │    │
│  │  → Anthropic format: adaptado                           │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  MONITOREAR                                            │    │
│  │  → CostTracker: calcular costo tokens                   │    │
│  │  → LatencyTracker: registrar latencia                   │    │
│  │  → ModelLearning: registrar éxito/fallo                 │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Proveedores configurados:
| Proveedor | Tipo | Configuración |
|-----------|------|---------------|
| Ollama | Local (gratis) | `OLLAMA_BASE_URL` en `.env` |
| OpenAI | Remoto (API key) | `OPENAI_API_KEY` en `.env` |
| Grok/xAI | Remoto (API key) | `GROK_API_KEY` en `.env` |
| Anthropic | Remoto (API key) | `ANTHROPIC_API_KEY` en `.env` |
| DeepSeek | Remoto (API key) | `DEEPSEEK_API_KEY` en `.env` |
| LM Studio | Local (gratis) | `LMSTUDIO_URL` en `.env` |
| WebLLM | Browser (gratis) | `WebLLMManager.js` |

---

## 6. FLUJO MCP (Model Context Protocol)

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP CLIENT                                 │
│              cognitive/mcp/MCPClient.js                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  1. Cargar configuración (.mcp.json)                    │    │
│  │     → Lista de MCP servers a conectar                   │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  2. Conectar a servers                                  │    │
│  │     → stdio: spawn child process                        │    │
│  │     → SSE: HTTP connection                              │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  3. Descubrir tools del server                          │    │
│  │     → tools/list → lista de herramientas MCP            │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐    │
│  │  4. Cuando AgentLoop recibe tool_call MCP:              │    │
│  │     → MCPClient.executeTool(name, args)                 │    │
│  │     → Rutea al servidor MCP correcto                    │    │
│  │     → tools/call → resultado                            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Config MCP (`.mcp.json`):
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "web-search": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-web-search"]
    }
  }
}
```
