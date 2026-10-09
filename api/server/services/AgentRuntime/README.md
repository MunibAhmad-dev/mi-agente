# AgentRuntime — Runtime versionado de agentes (FASE 1)

## Qué es

Fachada **versionada** del runtime de ejecución de agentes. El runtime real
(LangChain streaming, `buildAgentInput`, generación SSE, `GenerationJobManager`)
vive en los paquetes compilados `@librechat/api` y `@librechat/agents`
(dependencias del proyecto). Este servicio es la superficie que el repositorio
posee y controla.

## Por qué existe

En la Fase 0 se identificó un riesgo de arquitectura: el runtime de agentes
vivía **solo** en el paquete compilado, con imports dispersos de `@librechat/*`
en controllers y servicios. Si el paquete cambiaba de contrato, el repo no
tenía un punto único para detectar/absorber el cambio.

Este módulo resuelve eso:

1. **Centraliza** todas las llamadas al runtime (`initializeAgent`, `loadAgent`,
   `discoverConnectedAgents`, `createContentAggregator`, …).
2. **Pinea el contrato**: `RUNTIME_VERSION` (versión del contrato que la app usa)
   y `TARGET_API_VERSION` (versión de `@librechat/api` contra la que se validó).
3. **Se prueba** con `AgentRuntime.spec.js` (checks del contrato: cada función
   expuesta existe y es invocable — corre dentro del contenedor donde están los
   paquetes reales).

## Contrato expuesto

| Función | Origen | Uso |
|---|---|---|
| `initializeAgent(params)` | @librechat/api | chat de agentes (request controller) |
| `loadAgent(params, deps)` | @librechat/api | build options |
| `discoverConnectedAgents(params)` | @librechat/api | subagentes conectados |
| `isMemoryEnabled(agent)` | @librechat/api | memoria activa |
| `validateAgentModel(agent, modelsConfig)` | @librechat/api | validación de modelo |
| `buildAgentContextAttachmentsByAgentId(...)` | @librechat/api | adjuntos por agente |
| `GenerationJobManager` | @librechat/api | jobs de generación |
| `createContentAggregator(config, handlers)` | @librechat/agents | agregar delitas SSE |

## Cómo reemplazar el runtime

Si se decide migrar a Agno, PydanticAI u otro runtime (Fase 1 del master prompt):

1. Implementar las mismas firmas en un adaptador nuevo (`AgentRuntime/adapters/agno.js`).
2. Cambiar el `require` en `index.js` para elegir el adaptador (patrón provider).
3. `AgentRuntime.spec.js` no cambia: verifica el contrato, no la implementación.

## Cómo probar

```bash
# dentro del contenedor del API (donde están los paquetes reales):
NODE_ENV=test node_modules/.bin/jest server/services/AgentRuntime/AgentRuntime.spec.js
```
