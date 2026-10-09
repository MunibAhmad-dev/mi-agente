# FASE 1 — PLAN DE IMPLEMENTACIÓN COMPLETO

**Fecha:** 30 de Agosto, 2026
**Basado en:** FASE0_AUDITORIA_COMPLETA.md
**Objetivo:** Cerrar los 16 gaps críticos para alcanzar ~85% de cobertura del blueprint

---

## RESUMEN DE PLAN

| Fase | Prioridad | Componentes | Paquetes npm | RAM | Días |
|------|-----------|-------------|--------------|-----|------|
| **P0** | CRÍTICO | Agent Loop + Core Tools + Verifiers | 8 | ~40MB | 3-4 |
| **P1** | IMPORTANTE | Context + Router + Sub-agents + MCP | 5 | ~30MB | 2-3 |
| **P2** | MODERADO | CodeAct + Worktrees + Memory advanced | 4 | ~20MB | 2-3 |
| **P3** | BAJO | Parallelism + Observability + Workflows | 3 | ~15MB | 1-2 |
| **P4** | FUTURO | Desktop CU + Paridad total | 2 | ~10MB | 2-3 |
| **TOTAL** | | **~30 componentes** | **22** | **~115MB** | **10-15** |

---

## FASE P0 — CRÍTICO (Sin esto no hay agente funcional)

### P0.1: Agent Loop Real (while tool_call)

**Qué falta:** El DSHAgentLoop actual solo hace retry. Necesitamos un loop real tipo Claude Code:
```
while (tool_call):
    reason → plan → execute → observe → evaluate → continue/finish
```

**Cómo implementar:**
1. Reescribir `DSHAgentLoop.js` con un loop while real
2. Cada iteración: LLM genera tool_call → ejecutar tool → observar resultado → continuar o parar
3. Integrar con el LLM para que el modelo decida qué tool usar
4. Soporte para múltiples tool_calls secuenciales
5. Límite configurable de iteraciones (default: 20)

**Archivo:** `api/server/services/Harness/DSHAgentLoop.js` (reescritura)
**Dependencias:** Ninguna nueva
**RAM:** ~2MB

### P0.2: Filesystem Tools (Read/Write/Edit)

**Qué falta:** No hay herramientas nativas de filesystem como las de Claude Code.

**Cómo implementar:**
1. Crear `FilesystemTools.js` con:
   - `read_file(path, offset, limit)` — Leer archivo con offsets
   - `write_file(path, content)` — Escribir archivo completo
   - `edit_file(path, old_string, new_string)` — Editar por reemplazo de string
   - `list_directory(path)` — Listar directorio
   - `create_directory(path)` — Crear directorio
   - `delete_file(path)` — Eliminar archivo
   - `move_file(from, to)` — Mover/renombrar
   - `copy_file(from, to)` — Copiar
2. Integrar al DSHToolAdapter como herramientas registradas
3. Validación de paths (no salir del proyecto)
4. Logging de todas las operaciones

**Archivo:** `api/server/services/Harness/tools/FilesystemTools.js` (nuevo)
**Integración:** `DSHToolAdapter.js` (agregar tools)
**Dependencias:** Ninguna
**RAM:** ~1MB

### P0.3: Shell/Bash Tool

**Qué falta:** No hay ejecución de comandos shell.

**Cómo implementar:**
1. Crear `ShellTool.js` con:
   - `execute_command(command, cwd, timeout)` — Ejecutar comando
   - `execute_background(command, cwd)` — Ejecutar en background
   - Output capture (stdout + stderr)
   - Timeout configurable
   - Shell whitelist (bash, sh, powershell)
2. Integrar al DSHToolAdapter
3. Sandbox: ejecutar en directorio aislado
4. Logging completo de comandos ejecutados

**Archivo:** `api/server/services/Harness/tools/ShellTool.js` (nuevo)
**Integración:** `DSHToolAdapter.js`
**Dependencias:** Ninguna
**RAM:** ~2MB

### P0.4: Grep/Glob/Search Tool

**Qué falta:** No hay búsqueda en archivos de código.

**Cómo implementar:**
1. Crear `SearchTools.js` con:
   - `grep(pattern, path, options)` — Búsqueda con regex en archivos
   - `glob(pattern, path)` — Búsqueda por patrón de nombre
   - `search_code(query, path)` — Búsqueda semántica en código
   - `find_files(extension, path)` — Buscar por extensión
2. Usar `ripgrep` (rg) como backend si está disponible, fallback a Node.js fs
3. Soporte para .gitignore
4. Límite de resultados

**Archivo:** `api/server/services/Harness/tools/SearchTools.js` (nuevo)
**Integración:** `DSHToolAdapter.js`
**Dependencias:** Ninguna (usa fs nativo)
**RAM:** ~3MB

### P0.5: Verifiers Deterministas

**Qué falta:** No hay verificación automática del trabajo.

**Cómo implementar:**
1. Crear `DeterministicVerifier.js` con:
   - `verify_syntax(file)` — Parse JavaScript/TypeScript
   - `verify_lint(file)` — Ejecutar ESLint
   - `verify_types(file)` — Ejecutar TypeScript compiler
   - `verify_tests(testFile)` — Ejecutar Jest/Vitest
   - `verify_compile(file)` — Verificar que compila
   - `verify_all(files)` — Ejecutar todos
2. Resultados estructurados: { pass, errors[], warnings[], suggestions[] }
3. Integrar al VerificationAgent
4. Ejecución automática post-modificación

**Archivo:** `api/server/services/Harness/Verification/DeterministicVerifier.js` (nuevo)
**Integración:** `VerificationAgent.js`
**Dependencias:** Ninguna (usa herramientas ya instaladas)
**RAM:** ~5MB

### P0.6: Integrar Tools al Agent Loop

**Qué falta:** Los 45 tools existentes no están cableados al loop del agente.

**Cómo implementar:**
1. Actualizar `DSHToolAdapter.js` para registrar:
   - FilesystemTools
   - ShellTool
   - SearchTools
   - GitIntegration (ya existe)
   - BrowserManager (ya existe)
   - Los 45 tools existentes
2. Crear schema JSON para cada tool (nombre, parámetros, retorno)
3. Pasar schemas al LLM en cada iteración del loop
4. Manejar respuestas del LLM con tool_calls

**Archivo:** `api/server/services/Harness/DSHToolAdapter.js` (actualización)
**Dependencias:** Todos los tools anteriores
**RAM:** ~2MB

### P0.7: Repository Map (Aider-style)

**Qué falta:** El agente no entiende la estructura del código.

**Cómo implementar:**
1. Instalar `tree-sitter` + parsers (JS, TS, Python, Bash)
2. Crear `RepositoryMap.js` con:
   - `buildMap(rootDir)` — Construir mapa del repo
   - `parseFile(filePath)` — Parsear archivo con tree-sitter
   - `extractSymbols(ast)` — Extraer funciones, clases, exports
   - `rankByRelevance(query, map)` — Rankear por relevancia
   - `getContextFiles(query)` — Obtener archivos relevantes para una query
3. Actualizar cada 30 segundos o al detectar cambios
4. Cache en memoria para queries frecuentes

**Archivo:** `api/server/services/Harness/RepositoryMap.js` (nuevo)
**Paquetes:** `tree-sitter`, `tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`
**RAM:** ~15MB

### P0.8: Actualizar HarnessManager para P0

**Cómo implementar:**
1. Inicializar todos los nuevos componentes en `HarnessManager.js`
2. Conectar Agent Loop → Tools → Verifiers
3. Agregar RepositoryMap al context manager
4. Configurar paths por defecto

**Archivo:** `api/server/services/Harness/HarnessManager.js` (actualización)
**Dependencias:** Todos los componentes P0

---

## FASE P1 — IMPORTANTE

### P1.1: Context Compaction (integrado al loop)

**Qué falta:** MemoryCompressor existe pero no se integra al loop.

**Cómo implementar:**
1. Crear `ContextCompactor.js` que:
   - Detecta cuando el contexto > 80% del límite
   - Resume automáticamente la conversación
   - Preserva puntos clave (tools usados, decisiones, errores)
   - Inyecta resumen en el contexto
2. Integrar al DSHContextManager
3. Configurar triggers (por tokens, por tiempo, manual)

**Archivo:** `api/server/services/Harness/cognitive/ContextCompactor.js` (nuevo)
**Integración:** `DSHContextManager.js`
**RAM:** ~5MB

### P1.2: Model Router Inteligente

**Qué falta:** UniversalLLMRouter usa el mismo modelo para todo.

**Cómo implementar:**
1. Crear `IntelligentRouter.js` que clasifique tareas por complejidad:
   - **Deterministic** (grep, ls, cat) → modelo pequeño o local
   - **Simple** (resumen, traducción) → modelo pequeño
   - **Medium** (code gen, debug) → modelo mediano
   - **Complex** (architecture, planning) → modelo grande
   - **Specialized** (vision, audio) → modelo especializado
2. Integrar con Ollama para tareas determinísticas (gratis)
3. Cache de clasificación por tipo de tarea
4. Métricas de éxito por modelo/tarea

**Archivo:** `api/server/services/Harness/cognitive/llm/IntelligentRouter.js` (nuevo)
**Paquete:** `ollama` (para local inference)
**RAM:** ~10MB

### P1.3: Sub-agentes Aislados

**Qué falta:** Sub-agentes no tienen aislamiento real.

**Cómo implementar:**
1. Crear `IsolatedSubAgent.js` que:
   - Ejecute sub-agente con contexto aislado (copia del contexto, no referencia)
   - Retorne SOLO resumen (no todo el resultado)
   - Tenga límite de profundidad (max 3 niveles)
   - Tenga límite de concurrencia (max 5 sub-agentes)
2. Integrar con SubAgents/subagentService.js
3. Logging de delegaciones

**Archivo:** `api/server/services/SubAgents/IsolatedSubAgent.js` (nuevo)
**Integración:** `SubAgents/subagentService.js`
**RAM:** ~5MB

### P1.4: Sandbox Docker

**Qué falta:** SandboxRunner usa vm2 (inseguro).

**Cómo implementar:**
1. Crear `DockerSandbox.js` que:
   - Ejecute código en contenedor Docker aislado
   - Límites de CPU/RAM configurables
   - Network isolation
   - Timeouts
   - Volume mounts para archivos
2. Fallback a vm2 si Docker no está disponible
3. Integrar al SandboxRunner

**Archivo:** `api/server/services/SandboxManager/DockerSandbox.js` (nuevo)
**Paquete:** `dockerode` (ya instalado)
**RAM:** ~5MB

### P1.5: MCP SDK Oficial

**Qué falta:** MCPServer existe pero no usa el SDK oficial.

**Cómo implementar:**
1. Instalar `@modelcontextprotocol/sdk`
2. Actualizar `MCPServer.js` para usar el SDK oficial
3. Soporte para MCP tools, resources, prompts
4. Auto-descubrimiento de MCP servers

**Archivo:** `api/server/services/Harness/MCPServer.js` (actualización)
**Paquete:** `@modelcontextprotocol/sdk`
**RAM:** ~5MB

---

## FASE P2 — MODERADO

### P2.1: CodeAct (emisión de código ejecutable)

**Qué falta:** El agente no puede emitir código que se ejecute directamente.

**Cómo implementar:**
1. Crear `CodeExecutor.js` que:
   - Detecte cuando el LLM emite código (```python, ```bash, etc.)
   - Ejecute en sandbox aislado
   - Capture output
   - Retorne resultado al loop
2. Soporte para Python, JavaScript, Bash
3. Integrar al Agent Loop

**Archivo:** `api/server/services/Harness/tools/CodeExecutor.js` (nuevo)
**Dependencias:** DockerSandbox (P1.4)
**RAM:** ~10MB

### P2.2: Git Worktrees

**Qué falta:** No hay aislamiento de trabajo por worktrees.

**Cómo implementar:**
1. Crear `GitWorktreeManager.js` que:
   - Cree worktrees temporales para sub-agentes
   - Limpie worktrees al terminar
   - Merge automático si es exitoso
   - Rollback si falla
2. Integrar con GitIntegration

**Archivo:** `api/server/services/Harness/tools/GitWorktreeManager.js` (nuevo)
**Dependencias:** GitIntegration
**RAM:** ~2MB

### P2.3: Filesystem-as-Memory

**Qué falta:** No se usa el filesystem como memoria.

**Cómo implementar:**
1. Crear `FilesystemMemory.js` que:
   - Use archivos .md para almacenar conocimiento
   - Organice por categorías (errors/, lessons/, skills/, etc.)
   - Indexe automáticamente
   - Consulte cuando sea relevante
2. Integrar con MemoryEngine

**Archivo:** `api/server/services/Harness/cognitive/memory/FilesystemMemory.js` (nuevo)
**RAM:** ~3MB

### P2.4: Critic/Evaluator LLM

**Qué falta:** No hay evaluación por LLM separado.

**Cómo implementar:**
1. Crear `CriticAgent.js` que:
   - Evalúe el resultado del agente principal
   - Detecte errores, bugs, mejoras
   - Proponga correcciones
   - Use modelo diferente al principal
2. Integrar al VerificationAgent

**Archivo:** `api/server/services/Harness/cognitive/CriticAgent.js` (nuevo)
**RAM:** ~5MB

---

## FASE P3 — BAJO

### P3.1: Parallel Execution

**Cómo implementar:**
1. Crear `ParallelExecutor.js` que:
   - Ejecute tareas independientes en paralelo
   - Use Promise.allSettled
   - Límite de concurrencia configurable
   - Merge de resultados

**Archivo:** `api/server/services/Harness/cognitive/ParallelExecutor.js` (nuevo)
**RAM:** ~3MB

### P3.2: Rollback Git

**Cómo implementar:**
1. Crear `GitRollback.js` que:
   - Haga commit antes de cada modificación
   - Permita rollback a commit anterior
   - Compare versiones
   - Liste cambios

**Archivo:** `api/server/services/Harness/tools/GitRollback.js` (nuevo)
**RAM:** ~1MB

### P3.3: Ask User

**Cómo implementar:**
1. Crear `AskUserModule.js` que:
   - Pregunte al usuario cuando sea necesario
   - Use WebSocket para comunicación en tiempo real
   - Permita opciones múltiples
   - Timeouts configurables

**Archivo:** `api/server/services/Harness/cognitive/AskUserModule.js` (nuevo)
**RAM:** ~1MB

---

## FASE P4 — FUTURO

### P4.1: Computer Use Vision

**Cómo implementar:**
1. Usar Playwright para screenshots
2. Enviar screenshots al LLM con visión
3. El LLM analiza y decide acciones
4. Ejecutar acciones en el DOM

**Archivo:** `api/server/services/Harness/tools/ComputerUseVision.js` (nuevo)
**RAM:** ~15MB

### P4.2: Perfiles de Recursos

**Cómo implementar:**
1. Crear `ResourceProfiles.js` con:
   - **Profile A (Ultra Low):** Solo local LLM, 2GB RAM
   - **Profile B (Balanced):** Mixto local/remoto, 4GB RAM
   - **Profile C (Maximum):** Remoto + local, 8GB+ RAM
2. Auto-detectar hardware
3. Configurar automáticamente

**Archivo:** `api/server/services/Harness/cognitive/ResourceProfiles.js` (nuevo)
**RAM:** ~2MB

---

## INSTALACIÓN DE PAQUETES

### P0 (Crítico)
```bash
npm install tree-sitter tree-sitter-javascript tree-sitter-typescript tree-sitter-python tree-sitter-bash
```

### P1 (Importante)
```bash
npm install @modelcontextprotocol/sdk ollama
```

### P2 (Moderado)
```bash
# Ya tenemos todo lo necesario
```

### P3 (Bajo)
```bash
# Ya tenemos todo lo necesario
```

---

## CRITERIOS DE ACEPTACIÓN POR FASE

### P0
- [ ] Agent Loop ejecuta while tool_call real
- [ ] Filesystem tools (Read/Write/Edit) funcionan
- [ ] Shell tool ejecuta comandos
- [ ] Grep/Glob buscan en archivos
- [ ] Verifiers validan syntax/lint/types
- [ ] Repository Map construye árbol del repo
- [ ] Todos los tools están cableados al loop

### P1
- [ ] Context Compaction reduce contexto automáticamente
- [ ] Model Router clasifica por complejidad
- [ ] Sub-agentes ejecutan aislados con resumen
- [ ] Sandbox Docker funciona (o fallback a vm2)
- [ ] MCP SDK oficial integrado

### P2
- [ ] CodeAct ejecuta código emitido por el LLM
- [ ] Git Worktrees aíslan trabajo
- [ ] Filesystem-as-Memory almacena conocimiento
- [ ] CriticAgent evalúa resultados

### P3
- [ ] Parallel Execution ejecuta en paralelo
- [ ] Git Rollback deshace cambios
- [ ] Ask User comunica con el usuario

### P4
- [ ] Computer Use Vision analiza screenshots
- [ ] Perfiles de recursos optimizan por hardware

---

## PLAN DE ROLLBACK

Para cada componente:
1. **Antes de modificar:** Crear backup del archivo original
2. **Si falla:** Restaurar backup
3. **Si falla parcialmente:** Mantener funcionalidad anterior + nuevo componente deshabilitado
4. **Variable de entorno:** `ENABLE_<COMPONENT>=false` para deshabilitar

## PLAN DE TESTING INCREMENTAL

Para cada componente:
1. **Unit test:** Probar función individual
2. **Integration test:** Probar con componentes adyacentes
3. **System test:** Probar en el contexto completo
4. **Smoke test:** Probar que el sistema arranca y responde

---

*Plan completado. Listo para FASE 2 (implementación).*
