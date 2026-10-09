# PHASE11_SUBAGENTS.md — Fase 11: Subagents

> **Estado:** FASE 11 — COMPLETADA.
> **Reutilización:** integra codingTools (Fase 3), Memory (Fase 10),
> Firewall (Fase 9), CodeIntelligence (Fase 5).

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/Subagents/subagentService.js` | Dispatcher de roles especializados |
| `services/Subagents/__tests__/subagentService.spec.js` | 16 tests |

### 6 roles (doc §11)
| Rol | systemPrompt | Tools | Policy | canWrite | Memory layers |
|---|---|---|---|---|---|
| Explorer | entender código, no modifica | read/list/grep/glob | restricted | no | PROJECT, SHORT |
| Researcher | investigar APIs/patrones | grep/glob/read | restricted | no | HISTORICAL, PROJECT |
| Coder | implementar cambios mínimos + tests | read/write/edit/compile/grep/glob | standard | sí | PROJECT, SESSION, SHORT |
| Tester | escribir/ejecutar tests | read/write/execute/compile | standard | sí | PROJECT, SESSION |
| Reviewer | revisar calidad/riesgo, no modifica | read/grep/glob | restricted | no | PROJECT, HISTORICAL |
| Security | auditar vulnerabilidades/secrets | read/grep/glob | restricted | no | PROJECT, HISTORICAL |

### `dispatch({ role, task, projectId, userId, extraContext })`
Devuelve un **task descriptor** con contexto INDEPENDIENTE por rol:
- systemPrompt del rol,
- allowedTools + allowedActions (subconjunto de codingTools),
- policy del Firewall (preset),
- memoryContext (recall por relevancia filtrado por las capas del rol),
- extraContext.

El dispatcher NO ejecuta el LLM: ensambla el contexto y devuelve el
descriptor listo para que el AgentLoop lo ejecute con el **modelo compartido
DeepSeek** (regla del doc: "comparten DeepSeek con contextos independientes").

### `authorizeAction(role, actionParams)`
Valida que una acción esté permitida para el rol (allowlist de acciones
+ policy del Firewall). Los roles read-only no pueden escribir.

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §11 | Explorer/Researcher/Coder/Tester/Reviewer/Security | ✓ 6 roles |
| §11 | Bajo demanda | ✓ dispatch(role, task) |
| §11 | Comparten DeepSeek | ✓ dispatcher no ejecuta LLM |
| §11 | Contextos independientes | ✓ systemPrompt+tools+memory por rol |

## 3. Gate de Fase 11

| Criterio | Estado |
|---|---|
| Implementación | ✓ 6 roles + dispatch + authorizeAction |
| Tests | ✓ 16/16 pasan |
| Reutiliza Fases 3/9/10 | ✓ codingTools + Firewall + Memory |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 12 (Adaptive Model Router).
