# Creative AI Orchestrator (CAIO) — Prompt Original

Este documento contiene el prompt completo utilizado para crear el sistema CAIO.
Fue procesado por un agente de IA que implementó el proyecto incrementalmente.

---

## INSTRUCCIÓN PRINCIPAL

Implementa dentro del proyecto actual un sistema completo denominado:
**Creative AI Orchestrator (CAIO)**

El sistema debe convertir la plataforma en una capa de orquestación capaz de utilizar herramientas y runtimes de IA creativa de forma autónoma.

**NO** construir simplemente una interfaz para ComfyUI.
Construir una arquitectura general en la que ComfyUI sea el primer Runtime Adapter.

La arquitectura debe permitir posteriormente añadir:
- generación de imágenes
- generación de vídeo
- audio
- música
- TTS
- STT
- 3D
- edición
- upscaling
- entrenamiento
- LoRA
- modelos multimodales
- otros runtimes locales
- otros runtimes remotos

El sistema debe poder recibir una intención humana de alto nivel y transformar esa intención en una solución ejecutable.

Ejemplo:
"Quiero crear un vídeo cinematográfico de esta imagen, mejorar la calidad y mantener el personaje."

El sistema debe poder:
ENTENDER → PLANIFICAR → BUSCAR → SELECCIONAR → INSTALAR → CONFIGURAR → CONSTRUIR → EJECUTAR → OBSERVAR → EVALUAR → MEJORAR → REPETIR → APRENDER

---

## RESUMEN DE LAS 180 SECCIONES

### Estructura del prompt

El prompt original contenía **180 secciones** numeradas que definían:

| # | Sección | Descripción |
|---|---------|-------------|
| 0 | Instrucción Principal | Definición del sistema CAIO |
| 1 | Reglas Absolutas | No mocks, no placeholders, INPUT→PROCESO→OUTPUT real |
| 2 | Restricciones de Recursos | Bajo consumo, lazy loading, caché, SQLite |
| 3 | Licencias | MIT/Apache/BSD prioritarias, GPL boundary con ComfyUI |
| 4 | Pinokio | Referencia para instalación de apps |
| 5 | SwarmUI | Referencia para UX e integración |
| 6 | ComfyUI | Runtime soportado #1 (GPL-3.0) |
| 7 | ComfyUI-Manager | Gestión de custom nodes |
| 8 | OpenHands | Referencia para agentes multi-step |
| 9 | smolagents | Referencia para agentes ligeros |
| 10 | LlamaIndex | Referencia para memoria/RAG |
| 11 | OpenCV | Referencia para procesamiento de imagen |
| 12 | Discovery Engine | Buscar en GitHub, HF, Civitai, ComfyUI |
| 13 | GitHub Discovery | Búsqueda de repositorios, releases, licencias |
| 14 | HuggingFace Discovery | Modelos, datasets, LoRA, VAE, etc. |
| 15 | Civitai Discovery | Checkpoints, LoRA, embeddings, workflows |
| 16 | ComfyUI Registry | Custom nodes y extensiones |
| 17 | Discovery Semántico | Convertir intención en consultas técnicas |
| 18 | Ranking | Scoring multidimensional de recursos |
| 19 | License Engine | SPDX, compatibility, risk assessment |
| 20 | Compatibility Engine | OS/GPU/VRAM/RAM/Python/CUDA |
| 21 | Hardware Intelligence | Auto-detección de GPU/VRAM/RAM/CPU |
| 22 | Resource Estimation | Estimar VRAM/RAM/storage antes de ejecutar |
| 23 | Runtime Manager | Interfaz RuntimeAdapter general |
| 24 | Instalador GUI | Instalar ComfyUI sin terminal |
| 25 | Detección de Instalaciones | Detectar instalaciones existentes |
| 26 | Multi-Instance | Múltiples instancias ComfyUI |
| 27 | Project Manager | Estructura de proyecto |
| 28 | Import Project | JSON/ZIP/folder/Git |
| 29 | Model Manager | Checkpoints, LoRA, VAE, ControlNet, etc. |
| 30 | Global Model Store | Evitar duplicados |
| 31 | Workflow Engine | Import/export/validate/clone/compare |
| 32 | Workflow Tools | Operaciones sobre workflows |
| 33 | Creative Agent | Agente principal |
| 34 | Capability Graph | goal→capability→model→node→hardware |
| 35 | Vision Engine | OpenCV + IQA + VLM |
| 36 | Image Analysis | Sharpness, noise, blur, contrast, etc. |
| 37 | Video Analysis | Frame quality, temporal consistency |
| 38 | Vision Feedback Loop | Analizar→mejorar→comparar |
| 39 | Quality Score | Sistema de scoring configurable |
| 40 | A/B Testing | Comparar versiones |
| 41 | Experiment Engine | Grid/random search, Bayesian optimization |
| 42 | Autonomous Creative Loop | Full loop UNDERSTAND→LEARN |
| 43 | Auto-Repair | detect→diagnose→classify→repair→validate |
| 44 | Version Control | Snapshots, diff, rollback, branch |
| 45 | Project Memory | Requirements, workflows, models, experiments |
| 46 | RAG | LlamaIndex para documentación/conocimiento |
| 47 | Discovery + Agent | Herramientas del agente |
| 48 | Fork & Improve | Import→analyze→execute→improve |
| 49 | Security Sandbox | Static analysis, dependency analysis |
| 50 | Permissions | READ/SAFE WRITE/PRIVILEGED |
| 51 | Autonomy Levels | Manual/Assisted/Autonomous |
| 52 | Resource Manager | VRAM/RAM/CPU/storage monitoring |
| 53 | LLM Provider Abstraction | Multi-provider routing |
| 54 | Vision Provider Abstraction | VLM local/remoto |
| 55 | Event Bus | Eventos del sistema |
| 56 | Observability | Timestamp, project, agent, tool, input, output |
| 57 | Health System | RuntimeHealth, ProjectHealth, etc. |
| 58 | Offline-First | Funcionar sin internet |
| 59 | Cache | Cachés con TTL |
| 60 | Deduplicación | Hashes para evitar duplicados |
| 61 | Project Export | Exportar project.ai |
| 62 | Reproducibility | Guardar versión completa |
| 63-66 | GUI | Dashboard simple y avanzado |
| 67-69 | Conversación Contextual | Recordar contexto |
| 70 | Pipeline Builder | Input→Preprocess→Generate→Enhance→Output |
| 71 | Multi-Modal Projects | Combinar text/image/video/audio |
| 72 | Future Runtimes | Interfaces preparadas |
| 73 | Database | SQLite para metadata |
| 74 | API | Endpoints internos |
| 75 | WebSocket | Progreso en tiempo real |
| 76 | Error Handling | 14 códigos de error clasificados |
| 77 | Failure Recovery | Snapshot antes de cambios destructivos |
| 78 | Snapshots | Versiones de runtime/proyecto/workflow |
| 79 | Experiment Memory | Parámetros, scores, resultados |
| 80 | Agent Memory | Short-term, project, long-term |
| 81 | Prompt/Context Optimization | Solo contexto relevante |
| 82 | Local Model Support | LLMs locales para planning |
| 83 | Model Routing | small→simple, medium→normal, large→complex |
| 84 | User Feedback Loop | Good/Bad/Improve/Try again |
| 85-87 | User Request Examples | Ejemplos de uso |
| 88-89 | Internet Security | Sandbox, security scoring |
| 90-92 | Network/Filesystem Control | Políticas de red y disco |
| 93-94 | Cleanup/Disk Management | Limpieza y gestión de disco |
| 95-96 | Performance/Benchmarking | Profiling y benchmarks |
| 97-98 | Adaptive Workflow/Presets | Perfiles y presets creativos |
| 99-101 | No Hardcode | No hardcodear modelos, nodos, GPU |
| 102-103 | Plugin Architecture/SDK | Interfaces extensibles |
| 104-105 | Capability Declaration/Tool Registry | Declaración de capacidades |
| 106-108 | Tool Risk/Plan Validation/Limits | Seguridad y límites |
| 109-110 | User Control/Audit Trail | Control humano y auditoría |
| 111-114 | Evaluation/Optimization/Smart Stop | Evaluación y parada inteligente |
| 115-116 | Experiment/Semantic Search | Búsqueda de resultados |
| 117-120 | Auto-Docs/Change/Visual Diff/Workflow Diff | Documentación y diffs |
| 121-124 | Model Recommendation/Cache/Rate Limits/Attribution | Recomendación y caché |
| 125-128 | Reproducible Install/Update/Dep Conflicts/Clone | Instalación reproducible |
| 129-131 | Sharing/Model Warning/User-Friendly Errors | Compartir y errores amigables |
| 132-137 | Diagnostics/Repair/Safe Mode/Node/Model/Workflow Health | Diagnósticos |
| 138-140 | Pre-Flight/Post-Flight/Result Storage | Checks antes/después |
| 141-144 | Result Search/Feedback Learning/Future Self-Improvement/Security | Búsqueda y aprendizaje |
| 145-155 | Testing/Acceptance Tests | 10 tests de aceptación |
| 156-162 | Architecture/Integration | Integración con sistema existente |
| 163-169 | Telemetry/Privacy/Classification/Clean Architecture/Contracts/No Lock-in | Arquitectura limpia |
| 170-177 | Documentation/Licenses/Performance/Graceful Degradation/Fallback | Documentación y degradación |
| 178-180 | Final Vision/Model Mental/Final Success | Visión final del sistema |

---

## CRITERIOS DE ÉXITO (Sección 180)

El usuario debería poder decir:
"Quiero construir X."
Y la plataforma debe poder:
1. Entender qué quiere
2. Analizar su hardware
3. Determinar qué capacidades necesita
4. Buscar soluciones
5. Buscar proyectos en GitHub
6. Buscar modelos en Hugging Face
7. Buscar recursos en Civitai
8. Buscar componentes de ComfyUI
9. Analizar licencias
10. Analizar seguridad
11. Analizar compatibilidad
12. Elegir la mejor solución
13. Instalar el runtime si falta
14. Configurarlo
15. Crear o importar un proyecto
16. Resolver dependencias
17. Crear/modificar el workflow
18. Ejecutarlo
19. Analizar el resultado
20. Detectar problemas
21. Experimentar
22. Mejorar
23. Comparar versiones
24. Mantener la mejor
25. Hacer rollback si es necesario
26. Guardar el proyecto
27. Guardar memoria
28. Guardar reproducibilidad
29. Explicar qué hizo
30. Permitir al usuario tomar control en cualquier momento

---

## PROYECTOS DE REFERENCIA

| Proyecto | Licencia | Uso |
|----------|----------|-----|
| Pinokio | MIT | Instalación, ejecución, aislamiento |
| SwarmUI | MIT | UX, integración ComfyUI |
| ComfyUI | GPL-3.0 | Runtime #1 (separado por API boundary) |
| ComfyUI-Manager | GPL-3.0 | Gestión de custom nodes |
| OpenHands | MIT | Agentes, herramientas, planificación |
| smolagents | Apache-2.0 | Agentes ligeros |
| LlamaIndex | MIT | Memoria, RAG |
| OpenCV | Apache-2.0 | Procesamiento de imagen |

---

*Este documento fue generado automáticamente para documentar el prompt completo utilizado en la creación del proyecto CAIO.*
