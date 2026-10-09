# PHASE2_MODEL_ADAPTER.md — Fase 2: Model Adapter (DeepSeek V4-Flash)

> **Estado:** FASE 2 — COMPLETADA.
> **Principio:** Regla 1 de los docs — "el modelo es reemplazable".
> **Conclusión:** NO se crea un adapter DeepSeek acoplado. Se reutiliza
> el cliente OpenAI-compatible existente y se configura DeepSeek como
> endpoint local. Se corrigen los perfiles de capacidades (bug real).

## 1. Decisión de arquitectura

DeepSeek V4-Flash (y cualquier modelo DeepSeek) se sirve vía un runtime
**OpenAI-compatible** (Ollama GGUF / vLLM / lmdeploy). LibreChat ya tiene
un cliente OpenAI-compatible (`@librechat/agents`) que soporta streaming,
tool calling, structured output y cancellation por diseño.

**Por tanto no se implementa un adapter DeepSeek propio.** Acoplar el
runtime a "deepseek" violaría la Regla 1 ("el modelo es reemplazable").
La abstracción correcta es "endpoint OpenAI-compatible con capacidades
declaradas", que es lo que ya existe.

Lo que SÍ faltaba (y se corrigió en esta fase):

## 2. Cambios implementados

### 2.1 Corrección de capacidades de DeepSeek (bug real)
DeepSeek soporta **function calling** y **JSON mode** (confirmado por
`LLMGateway/providers/DeepSeekProvider.js` → `getCapabilities()`), pero
los registros del `CapabilityOrchestrator` y el perfil heurístico del
`AgentArchitect/modelRouter.js` **no lo declaraban**. Sin `TOOL_CALLING`,
el Model Router no seleccionaría DeepSeek para tareas de coding que
requieren herramientas — crítico para un Coding Agent.

| Archivo | Cambio |
|---|---|
| `services/CapabilityOrchestrator/constants/Types.js` | Añadida `JSON_MODE` (capability nueva, aditiva) |
| `services/CapabilityOrchestrator/index.js` | `deepseek-chat`/`coder` ahora declaran `TOOL_CALLING` + `JSON_MODE`; `maxTokens` 4096→8192; añadido `deepseek-v3` |
| `services/AgentArchitect/modelRouter.js` | Perfil `/deepseek/` ahora incluye `TOOL_CALLING` + `JSON_MODE` |

### 2.2 Endpoint local DeepSeek en `librechat.yaml`
Añadido endpoint "DeepSeek (local)" aditivo (no rompe los existentes):
- Reutiliza el proxy Ollama existente (`/api/ollama-proxy`), así
  cualquier `ollama pull deepseek-v3` se descubre automáticamente (`fetch: true`).
- `dropParams: ['user']` (Ollama no acepta el campo `user`).
- Documenta cómo servir DeepSeek con runtime nativo (vLLM/lmdeploy)
  cambiando `baseURL` a `${DEEPSEEK_LOCAL_URL}/v1`.

## 3. Verificación de capacidades del adapter

| Capacidad del doc | Soporte | Cómo |
|---|---|---|
| Streaming | ✓ | cliente OpenAI-compatible + `createContentAggregator` (activo en `client.js`) |
| Tool calling | ✓ | DeepSeek function calling + `TOOL_CALLING` ahora declarado |
| Structured output | ✓ | `JSON_MODE` ahora declarado; OpenAI-compatible lo soporta |
| Cancellation | ✓ | `AbortSignal.timeout` en `BaseProvider` + `GenerationJobManager` (abort coordinado) |
| Health checks | ✓ | `DeepSeekProvider.healthCheck()` + `/api/health` + `routes/localModels.js` |
| Capability detection | ✓ | `capabilitiesForOllamaModel('deepseek-*')` + `ModelRegistry.findByCapabilities` |
| Modelo reemplazable | ✓ | adapter genérico OpenAI-compatible, sin acoplamiento a "deepseek" |

## 4. Cómo levantar DeepSeek local (guía operativa)

```bash
# Opción A — Ollama (más simple):
ollama pull deepseek-v3        # o deepseek-r1 / deepseek-coder-v2
# El endpoint "DeepSeek (local)" lo descubre automáticamente (fetch: true).

# Opción B — runtime nativo DeepSeek (vLLM/lmdeploy) para máximo rendimiento:
# Levantar el servidor OpenAI-compatible de vLLM/lmdeploy, luego en librechat.yaml
# cambiar baseURL del endpoint "DeepSeek (local)" a:
#   baseURL: '${DEEPSEEK_LOCAL_URL:-http://localhost:8000}/v1'
# y eliminar apiKey: 'ollama' (usar la API key real del runtime).
```

## 5. Gate de Fase 2

| Criterio | Estado |
|---|---|
| Implementación | ✓ capabilities corregidas + endpoint local + capability nueva `JSON_MODE` |
| Sin romper existentes | ✓ endpoint aditivo; capabilities aditivas |
| Modelo reemplazable (Regla 1) | ✓ sin acoplamiento a deepseek |
| Capability detection | ✓ TOOL_CALLING/JSON_MODE declarados |
| Streaming/tool/cancel/health | ✓ verificado vía OpenAI-compatible + GenerationJobManager |

**Resultado del GATE:** APTO. Pasa a Fase 3 (Tool Runtime — activar
coding tools del SDK).
