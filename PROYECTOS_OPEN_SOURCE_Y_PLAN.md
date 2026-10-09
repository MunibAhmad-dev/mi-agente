# PROYECTOS OPEN SOURCE + PLAN DE IMPLEMENTACIÓN

**Fecha:** 29 agosto 2026  
**Objetivo:** Cubrir las capacidades faltantes/parciales con proyectos abiertos, permisivos, sin censura y de bajos recursos

---

## PARTE 1 — LISTA COMPLETA DE PROYECTOS

### A. DEEPSEEK HARNESS (Core del nuevo agente)

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **DeepSeek Harness** | https://github.com/deepseek-ai/deepseek-harness | MIT | Node.js, bajo | Agent runtime completo: tools, skills, sessions, sandboxes, context, loops, scheduling, orchestration. "Everything is a plugin" |
| **Cordis** (framework de DSH) | Integrado en DSH | MIT | Muy bajo | Plugin kernel: mounting, unmounting, dependencies entre plugins |

### B. COMPUTER USE / GUI AUTOMATION

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **Agent S** | https://github.com/simular-ai/agent-s | Apache-2.0 | Medio | Framework open source para interacción autónoma con computadoras via Agent-Computer Interface |
| **Browser Use** | https://github.com/browser-use/browser-use | MIT | Bajo | Agente de navegador: abre páginas, clickea, tipea, llena formularios. Top 100 en GitHub |
| **UI-TARS** (ByteDance) | https://github.com/bytedance/UI-TARS | Apache-2.0 | Medio | GUI agent multimodal: entiende pantallas y actúa |
| **Skyvern** | https://github.com/Skyvern-AI/skyvern | AGPL-3.0 | Medio | Browser automation para workflows estructurados (formularios, portales gubernamentales) |
| **Stagehand** | https://github.com/browserbase/stagehand | MIT | Bajo | Browser automation para AI agents, API simple |
| **OpenAdapt** | https://github.com/OpenAdaptAI/OpenAdapt | MIT | Medio | Grabar y reproducir workflows de GUI (record & replay) |

### C. AGENTE AUTÓNOMO DE LARGO PLAZO

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **OpenHands** (fka OpenDevin) | https://github.com/All-Hands-AI/OpenHands | MIT | Medio | Agente de código autónomo con sandbox, browser, terminal |
| **Aider** | https://github.com/paul-gauthier/aider | Apache-2.0 | Muy bajo | Agente de código CLI, ligero, funciona con cualquier LLM |
| **Goose** | https://github.com/block/goose | Apache-2.0 | Bajo | Agente autónomo extensible con herramientas |
| **SuperAGI** | https://github.com/TransformerOptimus/SuperAGI | MIT | Medio | Framework de agentes autónomos con tool management, vector DB, memory |
| **LangGraph** | https://github.com/langchain-ai/langgraph | MIT | Bajo | Orquestación de agentes como grafos de estado |

### D. CONECTORES / INTEGRACIONES

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **Activepieces** | https://github.com/activepieces/activepieces | MIT | Medio | 450+ conectores (Gmail, Slack, Google, etc.), Zapier alternativo |
| **n8n** | https://github.com/n8n-io/n8n | Sustainable Use License | Medio | 400+ integraciones, workflows con AI |
| **Composio** | https://github.com/ComposioHQ/composio | MIT | Bajo | Toolkits para conectar AI agents con Gmail, Slack, GitHub, etc. |
| **MCP SDK** | https://github.com/modelcontextprotocol/typescript-sdk | MIT | Muy bajo | Model Context Protocol — estándar para herramientas de AI agents |
| **Slack API (oficial)** | https://github.com/slackapi/python-slack-sdk | MIT | Muy bajo | SDK oficial de Slack |
| **Google API Node.js** | https://github.com/googleapis/google-api-nodejs-client | Apache-2.0 | Bajo | Clientes oficiales de Google APIs |

### E. DEEP SEARCH / INVESTIGACIÓN

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **GPT Researcher** | https://github.com/assafelovic/gpt-researcher | MIT | Bajo | Agente de investigación profunda, búsqueda iterativa, reportes con citas. 29k+ stars |
| **Open Deep Research** (LangChain) | https://github.com/langchain-ai/open_deep_research | MIT | Bajo | Research agent configurable, multi-provider, multi-search |
| **Tavily** | https://github.com/tavily-ai/tavily-python | MIT | Bajo | API de búsqueda optimizada para AI agents |
| **SearXNG** | https://github.com/searxng/searxng | AGPL-3.0 | Muy bajo | Motor de metabúsqueda autoalojado, privacidad |

### F. MEMORIA / CONTEXTO

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **Mem0** | https://github.com/mem0ai/mem0 | Apache-2.0 | Bajo | Capa universal de memoria para AI agents: extracción, almacenamiento, recuperación |
| **Letta** (fka MemGPT) | https://github.com/letta-ai/letta | Apache-2.0 | Medio | Runtime de agentes con memoria stateful: Core blocks, Recall storage, Archival. Context Repositories con git |
| **Zep** | https://github.com/getzep/zep | Apache-2.0 | Bajo | Memoria temporal para AI agents: embeddings, knowledge graph, search |

### G. SANDBOX / EJECUCIÓN AISLADA

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **E2B** | https://github.com/e2b-dev/E2B | Apache-2.0 | Medio | Sandbox runtime para AI agents: Firecracker microVMs, SDK Python/JS |
| **Daytona** | https://github.com/daytonaio/daytona | Apache-2.0 | Medio | Development environment management, sandboxing con Sysbox |
| **Docker** (ya en el proyecto) | https://github.com/moby/moby | Apache-2.0 | Variable | Containerization — ya lo tenemos en el proyecto |

### H. TOOL SYSTEM / ORQUESTACIÓN

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **CrewAI** | https://github.com/crewAIInc/crewAI | MIT | Bajo | Orquestación multiagente con roles, tools, memoria |
| **AutoGen** (Microsoft) | https://github.com/microsoft/autogen | MIT | Medio | Framework multiagente con conversaciones, tools, código |
| **LangChain** | https://github.com/langchain-ai/langchain | MIT | Bajo | Framework LLM: tools, chains, agents, memory |
| **LlamaIndex** | https://github.com/run-llama/llama_index | MIT | Bajo | RAG framework: indexing, retrieval, query engines |

### I. VIDEO / MULTIMEDIA

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **Wan 2.1** (Alibaba) | https://github.com/Wan-Video/Wan2.1 | Apache-2.0 | Alto (GPU) | Generación de video texto→video |
| **LTX-Video** | https://github.com/Lightricks/LTX-Video | Apache-2.0 | Medio (8-12GB VRAM) | Video ligero |
| **FramePack F1** | https://github.com/lllyasviel/FramePack | Apache-2.0 | Bajo (6GB VRAM) | Image→video de muy bajo consumo |
| **Whisper** (OpenAI) | https://github.com/openai/whisper | MIT | Bajo-Medio | STT (speech-to-text) |
| **Piper** | https://github.com/rhasspy/piper | MIT | Muy bajo | TTS local, corre en CPU |

### J. CODING AGENT / HERRAMIENTAS DE DESARROLLO

| Proyecto | Link | Licencia | Recursos | Qué cubre |
|---|---|---|---|---|
| **OpenCode** | https://github.com/opencode-ai/opencode | MIT | Muy bajo | Coding agent CLI, ultra-ligero |
| **Aider** | https://github.com/paul-gauthier/aider | Apache-2.0 | Muy bajo | Pair programming con AI, git-aware |
| **Kilo Code** | https://github.com/kilocode/kilo-code | Apache-2.0 | Bajo | VS Code extension para coding agents |
| **Cline** | https://github.com/cline/cline | Apache-2.0 | Bajo | VS Code extension, agente autónomo |

---

## PARTE 2 — MAPEO: Carencia → Proyecto Solución

| Carencia del agente | Proyectos solucion | Proyecto principal | Alternativa |
|---|---|---|---|
| **Computer Use / GUI** | Agent S, UI-TARS, Browser Use, OpenAdapt | **Agent S** (Apache-2.0) | **Browser Use** (MIT) para web |
| **Agente largo plazo** | DeepSeek Harness, OpenHands, SuperAGI | **DeepSeek Harness** (MIT) | **OpenHands** (MIT) |
| **Conectores Gmail/Slack/Google** | Activepieces, Composio, n8n | **Composio** (MIT, más ligero) | **Activepieces** (MIT, más completo) |
| **Deep Search / Research** | GPT Researcher, Open Deep Research, Tavily | **GPT Researcher** (MIT) | **Open Deep Research** (MIT) |
| **Memoria avanzada** | Mem0, Letta, Zep | **Mem0** (Apache-2.0, más ligero) | **Letta** (Apache-2.0, más completo) |
| **Sandbox** | E2B, Daytona, Docker | **Docker** (ya tenemos) | **E2B** (Apache-2.0) para cloud |
| **Tool System / Orchestration** | CrewAI, AutoGen, LangGraph | **LangGraph** (MIT) | **CrewAI** (MIT) |
| **Record & Replay** | OpenAdapt | **OpenAdapt** (MIT) | Construir propio con OpenAdapt |
| **Workflow automation** | n8n, Activepieces, Temporal | **Activepieces** (MIT) | **n8n** (Sustainable Use) |
| **Video generation** | Wan 2.1, LTX-Video, FramePack | **FramePack F1** (6GB VRAM) | **LTX-Video** (8GB) |
| **TTS/STT** | Piper, Whisper | **Piper** (CPU) + **Whisper** (MIT) | — |
| **Multi-agente** | CrewAI, AutoGen, LangGraph | **LangGraph** (MIT) | **CrewAI** (MIT) |

---

## PARTE 3 — ANÁLISIS DE DEEPSEEK HARNESS

### Qué es
DeepSeek Harness (dsh) es un runtime de agentes open source (MIT) construido sobre Cordis. Todo es un plugin: modelos, tools, skills, sessions, sandboxes, storage, loops, scheduling, UI.

### Arquitectura
```
Cordis Kernel (plugin system)
    │
    ├── Model Plugin (cualquier LLM: GPT, Grok, DeepSeek, local)
    ├── Tool Plugins (file, shell, search, web)
    ├── Skill Plugins (reusable capabilities)
    ├── Session Plugin (conversation state)
    ├── Sandbox Plugin (isolated execution)
    ├── Storage Plugin (filesystem/state)
    ├── Loop Plugin (agent control flow)
    ├── Scheduling Plugin (subagent scheduling)
    └── UI Plugin (Web UI)
```

### 4 Runtime Modes
1. **Standard** — Full toolset: file editing, shell, search, skills, planning, subagents
2. **Code** — Tools via SDK, el modelo programa multi-step en TypeScript
3. **Minimal** — Solo bash + editor (para benchmarks)
4. **Creator** — Para construir custom presets

### Fortalezas
- ✅ MIT license — completamente abierto
- ✅ Model-agnostic — funciona con cualquier LLM
- ✅ Plugin architecture — extensible sin fork
- ✅ Observabilidad — session log append-only, trajectory view
- ✅ Node.js — mismo runtime que nuestro proyecto
- ✅ Reanudable — puede resumir, fork, replay runs

### Debilidades / Limitaciones
- ⚠️ Developer preview — breaking changes frecuentes
- ⚠️ v0.1 — no production-ready aún
- ⚠️ Sin conectores de apps (Gmail, Slack, etc.)
- ⚠️ Sin GUI automation / Computer Use
- ⚠️ Sin deep search integrado
- ⚠️ Documentación principalmente en chino

### Decisión: REUTILIZAR + ENVOLVER
**Reutilizar:** El core architecture (Cordis plugin system, agent loop, session management)
**Envolver:** Nuestras abstracciones encima (LLMProviders, CapabilityRouter, etc.)
**NO copiar:** Sus UI, sus tools específicas (usar las nuestras)

---

## PARTE 4 — PLAN DE IMPLEMENTACIÓN POR FASES

### FASE 0: Auditoría y Diseño ✅ (ESTE DOCUMENTO)

### FASE 1: DeepSeek Harness Core Integration
**Objetivo:** Integrar DSH como runtime base del agente
- Clonar DSH como sub-dependencia
- Envolver su Cordis kernel con nuestro Provider Registry
- Adaptar nuestro LLMGateway para que DSH lo use como Model Plugin
- Mantener nuestro AgentRuntime como capa superior
- **Resultado:** DSH ejecuta agentes usando nuestros providers (GPT, Grok, DeepSeek)
- **Duración:** 1-2 semanas

### FASE 2: Tool System Robusto
**Objetivo:** Tool registry, routing, authorization, timeout, retries
- Crear `ToolRegistry` inspirado en DSH's plugin system
- Implementar tool routing dinámico (solo expone tools relevantes)
- Añadir authorization por tool
- Añadir timeout y cancellation por tool
- Conectar con nuestras tools existentes (file, shell, search, browser)
- **Resultado:** Sistema de herramientas profesional con discovery, validation, auth
- **Duración:** 1 semana

### FASE 3: Context Manager
**Objetivo:** Maximizar información útil / tokens
- Implementar `ContextManager` con:
  - Selección de contexto relevante
  - Ventanas de contexto por modelo
  - Resumación automática cuando se acerca al límite
  - Contexto de tarea + contexto de proyecto
  - Gestión de resultados de tools
  - Prevención de crecimiento indefinido
- Integrar con Mem0 para memoria persistente
- **Resultado:** El agente usa contexto de forma inteligente
- **Duración:** 1-2 semanas

### FASE 4: Memoria Jerárquica
**Objetivo:** Memoria que mejora con el tiempo
- Implementar:
  - **Working Memory** — estado actual de la tarea
  - **Task Memory** — qué se ha hecho en esta tarea
  - **Project Memory** — conocimiento del proyecto
  - **Architectural Memory** — patrones y decisiones
  - **Error Memory** — errores y cómo se resolvieron
  - **Long-Term Memory** — preferencias del usuario
- Integrar con Mem0 o Letta
- Añadir "Memory Dreamer" — job que organiza memorias
- **Resultado:** Memoria útil, recuperable y controlable
- **Duración:** 1-2 semanas

### FASE 5: Agent Loop Mejorado
**Objetivo:** Loop robusto con self-healing
- Implementar:
  ```
  UNDERSTAND → PLAN → SELECT TOOLS → EXECUTE → OBSERVE → EVALUATE → CONTINUE/REPLAN/FINISH
  ```
- Manejar: éxito, error, tool failure, context overflow, timeout, provider failure
- Implementar self-healing:
  ```
  EXECUTE → ERROR → CLASSIFY → DIAGNOSE → FIX → TEST → VERIFY
  ```
- Clasificación de errores: Syntax, Dependency, Logic, Integration, Environment, Tool, Provider, Context
- **Resultado:** Agente que se recupera de errores inteligentemente
- **Duración:** 1-2 semanas

### FASE 6: DeepSearch / Research Agent
**Objetivo:** Investigación profunda con fuentes citadas
- Integrar GPT Researcher (MIT) o construir sobre SearchRuntime
- Loop: decompose → search → read → evaluate → refine → search again
- Límite de 10 pasos
- Cross-check de fuentes
- Citación de fuentes en respuestas
- **Resultado:** El agente puede investigar temas profundos con evidencia
- **Duración:** 1 semana

### FASE 7: Conectores de Apps
**Objetivo:** Conectar el agente al ecosistema del usuario
- **Fase 7a:** Gmail (OAuth2) + Google Calendar
- **Fase 7b:** Slack + Microsoft Teams
- **Fase 7c:** GitHub (extend MCP existente) + Linear
- **Fase 7d:** Google Drive + Notion
- Usar Composio (MIT) como base o SDKs oficiales
- **Resultado:** El agente puede leer emails,.calendar, mensajes, PRs
- **Duración:** 2-3 semanas (por fases)

### FASE 8: Computer Use / GUI Automation
**Objetivo:** El agente puede usar apps de escritorio
- Integrar Agent S (Apache-2.0) o construir sobre Playwright
- DesktopRuntime que extienda BrowserRuntime
- Permission system para apps
- Screenshot + action cycle
- **Resultado:** El agente puede usar CUALQUIER app con interfaz gráfica
- **Duración:** 2-3 semanas

### FASE 9: Planning + Checkpoints + Recovery
**Objetivo:** Tareas complejas con puntos de control
- TaskPlanner mejorado con dependency graph
- Checkpoints antes de operaciones críticas
- Rollback automático en fallo
- Reanudación desde checkpoint
- Human Approval Checkpoints
- **Resultado:** El agente ejecuta tareas complejas sin perder progreso
- **Duración:** 1-2 semanas

### FASE 10: Multi-Provider Orchestration
**Objetivo:** Usar el mejor modelo para cada subtarea
- TaskPlanner selecciona modelo por subtarea
- GPT-5.6 Sol para razonamiento profundo
- Grok 4.6 para búsqueda web
- GPT-5.6 Luna para tareas simples
- DeepSeek para código
- **Resultado:** Orquestación inteligente multi-modelo
- **Duración:** 1 semana

### FASE 11: Verification Agent
**Objetivo:** Verificación independiente del trabajo
- Agent separado que verifica:
  - Código compilable
  - Tests pasando
  - Integración correcta
  - Sin regresiones
  - Sin vulnerabilities
- Busca activamente falsos positivos
- **Resultado:** Doble verificación antes de declarar "terminado"
- **Duración:** 1 semana

### FASE 12: Observabilidad + Security
**Objetivo:** Visibilidad completa + seguridad
- Logging estructurado: TaskID, AgentID, Model, Provider, Tool, Tokens, Cost
- Dashboard de métricas en tiempo real
- Security audit: API keys, prompt injection, path traversal, SSRF
- Rate limiting por provider
- **Resultado:** Sistema observable y seguro
- **Duración:** 1 semana

### FASE 13: UI/Dashboard + Testing
**Objetivo:** Interfaz completa + tests E2E
- Model selector UI para todos los providers
- Provider health dashboard
- Cost tracking visual
- Task progress tracker
- Tests E2E de flujos completos
- **Resultado:** UI funcional + tests pasando
- **Duración:** 1-2 semanas

### FASE 14: Auditoría Final Forense
**Objetivo:** Verificar que TODO funciona
- Auditoría desde cero sin confiar en conclusiones previas
- Verificar cada flujo E2E
- Security audit final
- Regression audit
- Documentación final
- **Resultado:** Proyecto verificado y documentado
- **Duración:** 1 semana

---

## PARTE 5 — DEPENDENCIAS Y ORDEN

```
FASE 0 ✅ (este documento)
    ↓
FASE 1 (DSH Core) ← depende de: nada
    ↓
FASE 2 (Tools) ← depende de: FASE 1
    ↓
FASE 3 (Context) ← depende de: FASE 1
    ↓
FASE 4 (Memory) ← depende de: FASE 3
    ↓
FASE 5 (Agent Loop) ← depende de: FASE 2, 3, 4
    ↓
FASE 6 (DeepSearch) ← depende de: FASE 5
    ↓
FASE 7 (Conectores) ← depende de: FASE 2, 5
    ↓
FASE 8 (Computer Use) ← depende de: FASE 5
    ↓
FASE 9 (Planning) ← depende de: FASE 5
    ↓
FASE 10 (Multi-Provider) ← depende de: FASE 1
    ↓
FASE 11 (Verification) ← depende de: FASE 5
    ↓
FASE 12 (Security) ← depende de: todas
    ↓
FASE 13 (UI/Testing) ← depende de: todas
    ↓
FASE 14 (Final Audit) ← depende de: todas
```

**Estimación total:** 14-18 semanas de trabajo intensivo

---

## PARTE 6 — PRIORIDADES Y RECURSOS

### Si tienes poco tiempo (2-4 semanas):
1. FASE 1 (DSH Core)
2. FASE 2 (Tools)
3. FASE 5 (Agent Loop)
4. FASE 6 (DeepSearch)
→ Resultado: Agente funcional con herramientas e investigación

### Si tienes tiempo medio (4-8 semanas):
Todo lo anterior +
5. FASE 3 (Context)
6. FASE 4 (Memory)
7. FASE 7 (Conectores - Gmail/Slack/GitHub)
8. FASE 10 (Multi-Provider)
→ Resultado: Agente completo con memoria, contexto, conectores

### Si tienes tiempo completo (8-18 semanas):
Todo lo anterior +
9. FASE 8 (Computer Use)
10. FASE 9 (Planning)
11. FASE 11 (Verification)
12. FASE 12 (Security)
13. FASE 13 (UI/Testing)
14. FASE 14 (Final Audit)
→ Resultado: Plataforma de agentes profesional completa

---

*Plan generado el 29 agosto 2026. Todos los proyectos listados son open source y verificados.*
