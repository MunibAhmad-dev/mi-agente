# PHASE3_TOOL_RUNTIME.md — Fase 3: Tool Runtime (activar coding tools del SDK)

> **Estado:** FASE 3 — COMPLETADA.
> **Palanca de reutilización:** el SDK `@librechat/agents` (v3.2.65) trae
> un motor completo de coding tools locales que la app NO usaba. Esta
> fase lo activa como servicio versionado, **sin exponerlo al chat general
> por seguridad** hasta que el Agent Firewall + Sandbox (Fase 9) esté listo.

## 1. Hallazgo (qué había dormido)

El SDK exporta factories de coding tools locales (verificado):
- `createLocalCodingToolBundle` → bundle completo + checkpointer (rewind).
- `createLocalCodingToolDefinitions` / `createLocalCodingToolRegistry` → catálogo.
- Herramientas: `read_file`, `write_file`, `edit_file`, `grep_search`
  (ripgrep), `glob_search`, `list_directory`, `compile_check`,
  `bash_execution`, `code_execution`, `programmatic_tool_calling`.

La app solo usaba `createBashExecutionTool` (Code API **remoto** cloud),
no las coding tools **locales**. Estaban 100% dormidas.

## 2. Decisión de seguridad (Regla 6 del doc)

> "Las operaciones peligrosas requieren políticas. Nunca confiar
> únicamente en el prompt."

Las coding tools locales ejecutan `bash` y escriben archivos
**directamente en el host del proceso API** (`child_process` + `fs`).
Cablearlas al chat general sin firewall sería un riesgo de seguridad
grave (ejecución arbitraria en el servidor). Por eso:

- Se exponen como **servicio versionado** (`AgentRuntime/codingTools.js`).
- Defaults seguros: `readOnly: true`, `fileCheckpointing: true`,
  `postEditSyntaxCheck: true`, workspace root acotado.
- **NO se cablean al `createRun` del chat general todavía.** Se activan
  al flujo del Coding Agent en Fase 9, dentro del `SandboxManager` (Docker).

## 3. Implementación

| Archivo | Rol |
|---|---|
| `services/AgentRuntime/codingTools.js` | Wrapper seguro del SDK: `buildLocalExecutionConfig`, `createCodingToolBundle`, `filterToolsByPermission`, `resolveCodingTools` (Tool Router), `TOOL_METADATA` (categoría/riesgo/permiso por tool), `getCodingToolDefinitions`, `getCodingToolRegistry` |
| `services/AgentRuntime/codingTools.spec.js` | 15 tests: constantes, metadatos, config segura, filtering de permisos, catálogos, Tool Router |

### Tool Router mínimo (doc §3 — Tool Router)
`resolveCodingTools(requestedNames, { permissions, ... })` aplica la
política de permisos antes de devolver tools al agent loop:
- solo-lectura (default) → excluye `write_file`/`edit_file`/`bash`/`execute_code`.
- permiso `write` → incluye `write_file`/`edit_file`.
- permiso `execute` → incluye `bash`/`execute_code`.

### Metadatos de riesgo (doc §23 — Change Risk Engine)
`TOOL_METADATA` clasifica cada tool: `read_file`/`grep`/`glob` = LOW;
`write`/`edit` = MEDIUM; `bash`/`execute_code` = HIGH. Base para el
Risk Engine futuro (Fase 6).

## 4. Regla 2 verificada
"Las tools son independientes del modelo": las coding tools tienen
interfaces estructuradas (DynamicStructuredTool de LangChain). No
dependen de DeepSeek ni de ningún LLM. Funcionan con cualquier modelo
que soporte tool calling (Fase 2 declaró `TOOL_CALLING` para DeepSeek).

## 5. Gate de Fase 3

| Criterio | Estado |
|---|---|
| Implementación | ✓ servicio codingTools.js + Tool Router + metadatos de riesgo |
| Tests unitarios | ✓ 15/15 pasan |
| Sin romper existentes | ✓ no se tocó ToolService/client.js (servicio nuevo) |
| Sin placeholders/TODO | ✓ |
| Sin mocks donde debe haber real | ✓ usa el SDK real |
| Seguridad (Regla 6) | ✓ no cableado al chat; defaults readOnly + checkpointing |
| Regla 2 (tools independientes del modelo) | ✓ |
| Lint | ✓ 0 errores |
| Documentación | ✓ este doc |

**Resultado del GATE:** APTO. Pasa a Fase 4 (Context Engine).

## 6. Pendiente para fases posteriores
- **Fase 9 (Security):** cablear `resolveCodingTools` al `createRun` del
  Coding Agent dentro del `SandboxManager` (Docker), con firewall de
  permisos. Hasta entonces, las coding tools locales quedan como
  servicio disponible pero no expuesto al chat general (seguro).
- **Fase 7 (Verification):** `compile_check` ya está disponible vía este
  servicio como tool de verificación.
