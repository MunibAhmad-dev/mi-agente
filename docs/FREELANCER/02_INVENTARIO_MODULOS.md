# 📦 INVENTARIO COMPLETO DE MÓDULOS Y SERVICIOS — AI-OS

## Estado: 31 de Agosto, 2026

---

## 1. SERVICIOS PRINCIPALES (70 directorios)

### 🧠 HARNASS (El Agente) — `api/server/services/Harness/`

| Archivo | Líneas | Función |
|---------|--------|---------|
| AgentLoop.js | ~750 | **Bucle principal** — while(tool_call), ejecuta pasos del agente |
| AgentOrchestrator.js | ~300 | Orquesta sub-agentes y tareas paralelas |
| TaskPlanner.js | ~200 | Planifica tareas complejas paso a paso |
| ContextCompactor.js | ~150 | Comprime contexto cuando se acerca al límite |
| CheckpointManager.js | ~180 | Guarda/restaura estado (checkpoints) |
| RecoveryManager.js | ~200 | Recuperación de errores y reintentos |
| SandboxRunner.js | ~250 | Ejecuta código en sandbox aislado |
| CostTracker.js | ~120 | Tracking de costos por tokens |
| StreamingManager.js | ~100 | Streaming de respuestas SSE |
| VoiceManager.js | ~150 | Gestión de voz (TTS/STT) |
| MCPClient.js | ~200 | Cliente para servidores MCP |
| MCPServer.js | ~150 | Servidor MCP embebido |
| ComputerUse.js | ~540 | Control de escritorio (mouse, teclado, screenshots) |
| RepositoryMap.js | ~180 | Mapa del repositorio (tree-sitter) |
| VectorStoreManager.js | ~150 | Gestión de vector store |
| SocialMediaSearch.js | ~200 | Búsqueda en redes sociales |
| SuggestedActionsEngine.js | ~180 | Genera acciones sugeridas |
| DeepSearchAgent.js | ~250 | Búsqueda profunda en web |
| FileProcessor.js | ~200 | Procesamiento de archivos |
| MemoryManager.js | ~200 | Gestión de memoria del agente |
| ProviderOrchestrator.js | ~180 | Orquesta proveedores LLM |
| ObservabilityHub.js | ~150 | Observabilidad centralizada |
| SecurityHardening.js | ~200 | Hardening de seguridad |
| ToolSecurity.js | ~120 | Seguridad de herramientas |
| HarnessAPI.js | ~100 | API pública del harness |
| HarnessInit.js | ~80 | Inicialización del harness |
| HarnessManager.js | ~120 | Gestión del harness |
| DSHAgentLoop.js | ~200 | Agent Loop alternativo (DeepSeek) |
| DSHContextManager.js | ~150 | Gestión de contexto (DeepSeek) |
| DSHModelPlugin.js | ~100 | Plugin de modelo (DeepSeek) |
| DSHSessionManager.js | ~120 | Gestión de sesiones (DeepSeek) |
| DSHToolAdapter.js | ~150 | Adaptador de tools (DeepSeek) |
| AuditReport.js | ~100 | Generación de reportes de auditoría |
| BackgroundTaskManager.js | ~120 | Tareas en segundo plano |
| CitationTracker.js | ~100 | Tracking de citas/fuentes |
| ReportGenerator.js | ~150 | Generación de reportes |
| VoiceConversation.js | ~150 | Conversación por voz |

### 🔧 TOOLS (55 herramientas) — `api/server/services/Harness/tools/`

| Tool | Archivo | Función |
|------|---------|---------|
| Filesystem | FilesystemTools.js | Leer, escribir, editar, crear, eliminar archivos |
| Shell | ShellTool.js | Ejecutar comandos de terminal |
| Browser | BrowserManager.js | Control de Playwright (navegador real) |
| Computer Use | ComputerUseTool.js | Mouse, teclado, screenshots |
| Computer Vision | ComputerUseVision.js | Análisis visual de pantalla |
| Git | GitIntegration.js | Commits, branches, merges, diffs |
| Git Worktree | GitWorktreeManager.js | Worktrees aislados |
| Git Rollback | GitRollback.js | Revertir cambios |
| Code Executor | CodeExecutor.js | Ejecutar Python/JS/Shell |
| Search | SearchTools.js | Buscar en archivos (grep/glob) |
| Web Scraper | WebScraper.js | Extraer contenido de páginas |
| Deeper Search | DeeperSearchV2.js | Búsqueda profunda en web |
| Social Scraper | SocialScraper.js | Scraping de redes sociales |
| RSS | RSSAggregator.js | Lectores RSS |
| Email | EmailManager.js | Envío de emails |
| Calendar | CalendarManager.js | Gestión de calendario |
| Drive | DriveManager.js | Gestión de archivos en nube |
| MultiModal | MultiModalLocal.js | Imágenes, audio, video |
| TTS | TTSManager.js | Text-to-Speech |
| STT | STTManager.js | Speech-to-Text |
| Image Generator | ImageGenerator.js | Generación de imágenes |
| Video Processor | VideoProcessor.js | Edición de video (FFmpeg) |
| Diagram | DiagramGenerator.js | Generación de diagramas |
| Presentation | PresentationGenerator.js | Generación de presentaciones |
| Website | WebsiteGenerator.js | Generación de sitios web |
| Canvas | CanvasManager.js | Lienzo digital |
| MCP Client | MCPClient.js | Conectar con servidores MCP |
| Docker Sandbox | DockerSandbox.js | Aislamiento en contenedores |
| Health Dashboard | HealthDashboard.js | Monitoreo de salud |
| Metrics | MetricsCollector.js | Recopilación de métricas |
| Playbook | PlaybookManager.js | Ejecución de playbooks |
| Plugin Marketplace | PluginMarketplace.js | Marketplace de plugins |
| Backup | BackupManager.js | Respaldos automáticos |
| Alert Manager | AlertManager.js | Sistema de alertas |
| Cache Manager | CacheManager.js | Gestión de caché |
| Clipboard | ClipboardManager.js | Portapapeles |
| Companion | CompanionManager.js | Asistentes personales |
| Cross Session | CrossSessionMessaging.js | Mensajes entre sesiones |
| Desktop Controller | DesktopController.js | Control del escritorio |
| Doctor Module | DoctorModule.js | Diagnóstico del sistema |
| Goal Manager | GoalManager.js | Gestión de metas |
| Hook System | HookSystem.js | Sistema de hooks |
| LSP Integration | LSPIntegration.js | Language Server Protocol |
| Log Manager | LogManager.js | Gestión de logs |
| Policy Engine | PolicyEngine.js | Motor de políticas |
| Plan Mode | PlanModeManager.js | Modo planificación |
| Protocol Config | ProtocolConfigWizard.js | Configuración de protocolos |
| Queue Manager | QueueManager.js | Gestión de colas |
| Rate Limiter | RateLimiter.js | Limitación de tasa |
| CICD | CICDIntegration.js | Integración CI/CD |
| Deployment | DeploymentEngine.js | Despliegue automático |
| Cloud Agent | CloudAgent.js | Agente en la nube |
| Agent Teams | AgentTeams.js | Equipos de agentes |
| Collections | CollectionsEngine.js | Motor de colecciones |
| Credential Vault | CredentialVault.js | Almacén de credenciales |
| LSP | LSPIntegration.js | Language Server Protocol |

### 🧠 COGNITIVO (107 módulos) — `api/server/services/Harness/cognitive/`

#### Memoria
| Módulo | Función |
|--------|---------|
| memory/ | Memoria episódica, semántica, procedural, de usuario |
| consolidation/ | Consolidación y compresión de memoria |
| CrossSessionMemory.js | Memoria entre sesiones |
| ExperienceReplay.js | Replay de experiencias pasadas |

#### Conocimiento
| Módulo | Función |
|--------|---------|
| knowledge/ | Knowledge graph, grafo causal |
| rag/ | RAG híbrido, adaptativo, por capas |
| evidence/ | Sistema de evidencia y provenance |
| FactChecker.js | Verificación de hechos |
| SourceEvaluator.js | Evaluación de fuentes |

#### Aprendizaje
| Módulo | Función |
|--------|---------|
| learning/ | Aprendizaje de errores, loops, recuperación |
| experiments/ | Motor de experimentación |
| improvement/ | Mejora continua |
| SkillsSystem.js | Sistema de skills |

#### Planificación
| Módulo | Función |
|--------|---------|
| PlanMode.js | Modo planificación explícito |
| DynamicWorkflows.js | Workflows dinámicos |
| ParallelExecutor.js | Ejecución paralela |
| DAGScheduler.js | Scheduler basado en DAG |
| WorkspaceManager.js | Gestión de espacios de trabajo |

#### Agentes
| Módulo | Función |
|--------|---------|
| CriticAgent.js | Agente crítico/evaluador |
| ExecutiveBrain.js | Cerebro ejecutivo |
| EventBus.js | Sistema de eventos |
| PeerReviewer.js | Revisión entre pares |

#### Búsqueda
| Módulo | Función |
|--------|---------|
| AdaptiveRAG.js | RAG adaptativo |
| HybridSearch.js | Búsqueda híbrida |
| ContextualRetriever.js | Recuperación contextual |
| FileIndexer.js | Indexación de archivos |

#### Seguridad
| Módulo | Función |
|--------|---------|
| ApprovalGates.js | Gates de aprobación |
| HookSystem.js | Hooks pre/post |
| PromptManager.js | Gestión de prompts |

#### Evaluación
| Módulo | Función |
|--------|---------|
| BenchmarkSuite.js | Suite de benchmarks |
| ModelEvaluator.js | Evaluador de modelos |
| RAGEvaluator.js | Evaluador de RAG |
| DuplicateDetector.js | Detector de duplicados |

#### Optimización
| Módulo | Función |
|--------|---------|
| PromptCache.js | Caché de prompts |
| ToolResultCompressor.js | Compresión de resultados |
| GPUManager.js | Gestión de GPU |
| ResourceProfiles.js | Perfiles de recursos |

#### Infraestructura
| Módulo | Función |
|--------|---------|
| AutoLauncher.js | Auto-lanzamiento de servicios |
| MicroVMManager.js | Gestión de microVMs |
| RemoteExecutor.js | Ejecución remota |
| DistributedTracer.js | Tracing distribuido |

### 📊 OTROS SERVICIOS (60+)

| Servicio | Función |
|----------|---------|
| RAG/ | Sistema de Retrieval-Augmented Generation |
| Memory/ | Servicio de memoria |
| LLMProviders/ | Proveedores LLM (GPT, Grok, etc) |
| LLMGateway/ | Gateway universal de LLM |
| LLMRuntime/ | Runtime de ejecución LLM |
| AgentRuntime/ | Runtime de ejecución del agente |
| Agents/ | Sistema de agentes |
| SubAgents/ | Sub-agentes |
| Marketplace/ | Marketplace de plugins |
| Skills/ | Sistema de skills |
| SkillsDiscovery/ | Descubrimiento de skills |
| Vision/ | Visión por computadora |
| WorkflowEngine/ | Motor de workflows |
| Scheduler/ | Tareas programadas |
| Telemetry/ | Telemetría |
| Observability/ | Observabilidad |
| Security/ | Hardening de seguridad |
| SecurityScanner/ | Escáner de seguridad |
| Evaluation/ | Sistema de evaluación |
| Optimization/ | Optimización |
| Performance/ | Rendimiento |
| MetricsCollector/ | Recopilación de métricas |
| RateLimiter/ | Limitación de tasa |
| Connectors/ | Conectores externos |
| Config/ | Configuración |
| Files/ | Gestión de archivos |
| FileStorage/ | Almacenamiento de archivos |
| Artifact/ | Artefactos |
| ComfyUI/ | Integración ComfyUI |
| HuggingFace/ | Integración HuggingFace |
| ImageRuntime/ | Runtime de imágenes |
| BrowserRuntime/ | Runtime del navegador |
| SearchRuntime/ | Runtime de búsqueda |
| CodeIntelligence/ | Inteligencia de código |
| ContextIntelligence/ | Inteligencia de contexto |
| ContextManager/ | Gestión de contexto |
| CapabilityOrchestrator/ | Orquestador de capacidades |
| CapabilityRouter/ | Enrutador de capacidades |
| RuntimeRegistry/ | Registro de runtimes |
| IntegrationManager/ | Gestor de integraciones |
| MultiAgentController/ | Controlador multi-agente |
| ProcessManager/ | Gestor de procesos |
| Repair/ | Reparación automática |
| Threads/ | Gestión de hilos |
| Runs/ | Ejecuciones |
| PolicyEngine/ | Motor de políticas |
| SandboxManager/ | Gestor de sandbox |
| ToolService.js | Servicio de herramientas |
| ActionService.js | Servicio de acciones |
| AssistantService.js | Servicio de asistentes |
| AuthService.js | Servicio de autenticación |
| DocsService.js | Servicio de documentación |
| PluginService.js | Servicio de plugins |
| Webhook/ | Webhooks |
| Claude/ | Integración Claude |
| APIKeyManager/ | Gestión de API keys |

---

## 2. RUTAS HTTP (68 archivos)

| Ruta | Método | Función |
|------|--------|---------|
| /api/auth/login | POST | Login local |
| /api/auth/register | POST | Registro de usuario |
| /api/auth/logout | POST | Logout |
| /api/auth/refresh | POST | Refrescar JWT |
| /api/auth/2fa/* | POST | 2FA (enable, disable, verify) |
| /api/convos | GET/POST/PUT/DELETE | CRUD conversaciones |
| /api/messages | GET/POST | Mensajes |
| /api/messages/:id | GET/PUT/DELETE | Mensaje específico |
| /api/harness/scaffold | POST | Crear sesión de agente |
| /api/harness/pre-llm | POST | Pre-LLM (compact, inject) |
| /api/harness/post-tool | POST | Post-tool (normalize) |
| /api/harness/checkpoint | POST | Guardar checkpoint |
| /api/harness/resume | POST | Resumir sesión |
| /api/models | GET | Modelos disponibles |
| /api/models/:provider | GET | Modelos de un proveedor |
| /api/tools | GET | Herramientas disponibles |
| /api/tools/:tool/execute | POST | Ejecutar herramienta |
| /api/rag/* | GET/POST | Sistema RAG |
| /api/memories | GET/POST/DELETE | Memoria |
| /api/mcp/* | GET/POST | Protocolo MCP |
| /api/vision/* | POST | Visión por computadora |
| /api/skills | GET/POST/PUT/DELETE | Skills |
| /api/marketplace | GET/POST | Marketplace |
| /api/metrics/* | GET | Métricas |
| /api/performance/* | GET | Rendimiento |
| /api/system/* | GET | Estado del sistema |
| /api/config/* | GET/PUT | Configuración |
| /api/settings | GET/PUT | Ajustes |
| /api/user | GET/PUT | Usuario actual |
| /api/users | GET/POST/DELETE | Gestión de usuarios |
| /api/roles | GET/POST/PUT/DELETE | Roles |
| /api/presets | GET/POST/PUT/DELETE | Presets |
| /api/prompts | GET/POST/PUT/DELETE | Prompts |
| /api/tags | GET/POST/DELETE | Etiquetas |
| /api/endpoints | GET | Endpoints |
| /api/connectors | GET | Conectores |
| /api/keys | GET/POST/DELETE | API keys |
| /api/search/* | GET | Búsqueda |
| /api/sandbox/* | POST | Sandbox |
| /api/scheduler/* | GET/POST | Tareas programadas |
| ... | ... | (40+ más) |

---

## 3. MIDDLEWARE (36 archivos)

| Middleware | Función |
|-----------|---------|
| requireJwtAuth.js | Verificación JWT (obligatorio) |
| requireLocalAuth.js | Auth local (usuario/contraseña) |
| requireLdapAuth.js | Auth LDAP/Active Directory |
| optionalJwtAuth.js | Auth JWT (opcional) |
| checkBan.js | Verificación de baneo |
| validateEmailLogin.js | Validación de email |
| validateRegistration.js | Validación de registro |
| validatePasswordReset.js | Validación de reset de contraseña |
| validateModel.js | Validación de modelo LLM |
| validateMessageReq.js | Validación de mensaje |
| moderateText.js | Moderación de contenido |
| logHeaders.js | Logging de headers |
| setHeaders.js | Configuración de headers |
| abortMiddleware.js | Abortar peticiones |
| checkDomainAllowed.js | Verificación de dominio |
| checkInviteUser.js | Verificación de invitación |
| checkPeoplePickerAccess.js | Acceso a People Picker |
| canAccessSharedLink.js | Acceso a enlaces compartidos |
| canDeleteAccount.js | Verificación de eliminación |
| denyRequest.js | Denegar petición |
| error.js | Manejo de errores |
| noIndex.js | Headers No-Index |
| uaParser.js | Parsing de User-Agent |
| setTwoFactorTempUser.js | Usuario temporal 2FA |
| validateImageRequest.js | Validación de imágenes |
| buildEndpointOption.js | Construcción de opciones de endpoint |
| messageValidation.js | Validación de mensajes |
| ... (9 más) |

---

*Documento generado para auditoría del proyecto AI-OS.*
