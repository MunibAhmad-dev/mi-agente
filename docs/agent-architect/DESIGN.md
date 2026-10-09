# Agent Architect — Orquestador Autónomo de Agentes

## 1. Objetivo

Añadir un modo **Automático** al constructor de agentes existente (`AgentPanel`,
`OrchestrationHub`) que, dada una tarea en lenguaje natural, decide por sí mismo:

- cuántos agentes se necesitan,
- el rol/objetivo de cada uno,
- qué topología usar (independiente, cadena, delegación con subagentes, handoff),
- qué herramientas/skills/MCP necesita cada agente,
- y si falta una capability, la busca en el marketplace/sync de GitHub ya existente
  y la resuelve (con confirmación si el modo es manual).

El modo **Manual** sigue siendo el flujo actual: el usuario configura todo a mano
en `AgentPanel`. El toggle no crea "dos sistemas" distintos — el modo automático
simplemente **rellena el mismo formulario/objetos que ya usa el modo manual**, y
opcionalmente pausa antes de persistir para que el usuario edite.

## 2. Por qué así (decisiones clave)

1. **No reinventar la persistencia.** Ya existe `createAgentHandler` /
   `updateAgentHandler` en `api/server/controllers/agents/v1.js`, con toda la
   lógica de ACL, permisos, filtrado de tools autorizadas y validación de edges/
   subagents. Reimplementar eso en un servicio nuevo sería duplicar superficie de
   seguridad (riesgo de bypass de permisos). En su lugar, el Architect **invoca
   internamente esos mismos handlers** con un `req` sintético que respeta
   `req.user`/`req.config` reales de la petición entrante.

2. **Planear ≠ ejecutar.** El LLM nunca crea nada directamente. Genera un
   `ArchitectPlan` (JSON validado con Zod). Ese plan pasa por:
   `generar → validar esquema → resolver capacidades faltantes → (confirmar si
   es manual) → aplicar (crear agentes reales)`.
   Esto evita que una alucinación del modelo se traduzca directo en agentes/
   instalaciones no deseadas.

3. **Salida estructurada vía tool-calling, no parsing de texto libre.** En vez
   de pedirle al modelo "responde solo JSON" y hacer `JSON.parse` a ciegas
   (frágil), se le da al modelo una herramienta `submit_plan` cuyo `input_schema`
   ES el esquema del plan. El modelo *debe* invocar esa tool para terminar. Esto
   es más confiable y es exactamente el patrón de function-calling que usan
   Grok/GPT/Claude para salidas estructuradas.

4. **Tool-calling genérico reutilizable (estilo Grok).** Se implementa un loop
   de tool-use genérico (`toolCallLoop.js`) que no es específico del planner:
   dado un array de `tools` (JSON Schema) y un `executeTool(name, input)`,
   corre el ciclo `modelo → tool_use → tool_result → modelo → ...` hasta que el
   modelo entrega una respuesta final o se alcanza `maxTurns`. El planner es solo
   el primer consumidor; el mismo loop puede exponerse después a cualquier
   agente para tool-calling autónomo en conversación (que es como opera Grok:
   el modelo decide cuándo y qué herramienta llamar, incluida búsqueda).

5. **Límites duros (guardrails).** Máximo de agentes por plan, máximo de turnos
   de tool-calling, y **ninguna instalación de skill/plugin ocurre sin al menos
   una confirmación explícita**, incluso en modo automático — se autoriza la
   *búsqueda* automáticamente, no la *instalación* de código de terceros sin que
   el usuario lo vea al menos una vez (ver `require_confirmation` en el plan).

## 3. Flujo end-to-end

```
Usuario escribe tarea + modo (auto/manual)
        │
        ▼
POST /api/agents/architect/plan
        │
        ▼
planner.generatePlan()
  ├─ arma system prompt + tools: [list_available_tools, search_skill_marketplace,
  │                                submit_plan]
  ├─ corre toolCallLoop() contra Anthropic
  │     - el modelo puede llamar list_available_tools / search_skill_marketplace
  │       cuantas veces necesite (esto es la parte "autónoma": el propio modelo
  │       decide qué necesita buscar)
  │     - termina llamando submit_plan(plan)
  └─ valida `plan` con Zod (architectPlanSchema)
        │
        ▼
skillResolver.resolveMissingCapabilities(plan)
  - separa capacidades ya disponibles vs. faltantes
  - para las faltantes, consulta el catálogo del marketplace ya existente
  - marca cada una como: resolved | installable | unresolved
        │
        ▼
Responde al cliente: { plan, resolution }
        │
   ┌────┴─────┐
   │  MANUAL   │  el usuario ve el plan en <ArchitectPanel>, puede editar
   │           │  cada agente (reutiliza AgentPanel), confirma
   └────┬─────┘
        │ (auto: se salta directo, salvo instalaciones de skill nuevas)
        ▼
POST /api/agents/architect/apply
        │
        ▼
architect.applyPlan()
  1. si hay capacidades "installable" y no fueron confirmadas → 409 pidiendo
     confirmación explícita (esto aplica también en modo automático)
  2. fase 1: crea todos los agentes SIN edges/subagents todavía, reutilizando
     `v1.createAgent` internamente (misma validación/ACL que el modo manual)
  3. fase 2: con los IDs reales ya asignados, actualiza cada agente con sus
     `edges` (handoff) / `subagents` / `agent_ids` (chain) según la topología
     del plan, reutilizando `v1.updateAgent`
  4. devuelve la lista de agentes creados + la topología aplicada
```

## 4. Esquema del plan (`architectPlanSchema`)

```ts
ArchitectPlan {
  summary: string;                // resumen de la estrategia, se muestra al usuario
  topology: 'single' | 'chain' | 'handoff' | 'subagents';
  agents: ArchitectAgent[];       // 1..MAX_AGENTS (8)
  missing_capabilities: string[]; // nombres libres, resueltos después
}

ArchitectAgent {
  key: string;                 // id temporal dentro del plan, ej. "researcher"
  name: string;
  role_description: string;    // qué hace, en 1-2 frases
  instructions: string;        // system prompt del agente
  tools: string[];             // nombres de tools/skills/MCP que necesita
  handoff_to?: string[];       // keys de otros agentes (topología handoff)
  is_root?: boolean;           // punto de entrada de la conversación
}
```

## 5. Guardrails concretos implementados

| Límite | Valor | Dónde |
|---|---|---|
| Máx. agentes por plan | 8 | `schemas.js` (`MAX_AGENTS`) |
| Máx. turnos de tool-calling del planner | 6 | `toolCallLoop.js` |
| Instalación de skill sin confirmación | Nunca permitida | `applyPlan` (409 si falta `confirmed_installs`) |
| Reintento en salida inválida | 1 | `planner.js` |
| Aislamiento de permisos | El plan se aplica con el `req.user` real, nunca con un usuario "sistema" | `architect.js` |

## 6. Piezas nuevas (mapa de archivos)

Backend:
- `api/server/services/AgentArchitect/anthropicClient.js` — cliente mínimo a la Messages API con soporte de `tools`.
- `api/server/services/AgentArchitect/toolCallLoop.js` — loop genérico de tool-calling (estilo Grok/function-calling).
- `api/server/services/AgentArchitect/architectTools.js` — definición de las tools que el planner puede usar.
- `api/server/services/AgentArchitect/schemas.js` — esquemas Zod del plan.
- `api/server/services/AgentArchitect/planner.js` — orquesta el loop + valida salida.
- `api/server/services/AgentArchitect/skillResolver.js` — resuelve capacidades faltantes contra el marketplace/tools ya existentes.
- `api/server/controllers/agents/architect.js` — `planTask`, `applyPlan`.
- `api/server/routes/agents/architect.js` — rutas, montadas dentro de `routes/agents/v1.js`.

Frontend:
- `client/src/data-provider/Agents/architect.ts` — mutations `usePlanAgentTaskMutation` / `useApplyAgentPlanMutation`.
- `client/src/components/SidePanel/Agents/Advanced/ArchitectToggle.tsx` — switch Automático/Manual.
- `client/src/components/SidePanel/Agents/Advanced/ArchitectPanel.tsx` — input de tarea + preview del plan + confirmar.
- Cambios en `OrchestrationHub.tsx` para montar el toggle + panel arriba de los patrones existentes.

## 7. Qué NO quedó resuelto en esta primera pasada (honestidad sobre el alcance)

- El `skillResolver` deja un punto de extensión (`searchSkillCatalog`) para
  conectarlo al sync real de GitHub (`Skills/sync.js`); implementé la interfaz y
  un fallback que busca en `getCachedTools()`, pero **no ejecuté contra tu base
  de datos real** (no hay entorno vivo aquí), así que se debe probar en tu
  entorno de desarrollo antes de producción.
- No añadí UI de progreso en tiempo real para instalaciones de skill largas
  (eso viviría en `Tools/SkillsDialog.tsx`, se puede conectar después).
- El loop de tool-calling es genérico pero solo lo conecto al planner en esta
  entrega; exponerlo como tool-calling "en vivo" durante la conversación normal
  de un agente (no solo al planear) es el siguiente paso natural y reutiliza el
  mismo archivo `toolCallLoop.js`.
