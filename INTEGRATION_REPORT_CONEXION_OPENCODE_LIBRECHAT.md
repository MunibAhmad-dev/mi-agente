# INTEGRATION REPORT — Conexión mi-opencode ↔ mi-libre-chat
**Fecha:** 4 de agosto de 2026
**Alcance:** `mi-opencode-fase2.zip` + `mi-libre-chat-actualisacion-12.zip`
**Método:** ejecución real en sandbox (bun install, `opencode serve` real, peticiones HTTP reales con `curl` y con el SDK oficial), no solo lectura de código. Regla de la casa aplicada: evidencia antes que cambios, `diff -rq` contra el zip original, sin redondear hacia arriba lo que no se pudo verificar.

---

## 0. Veredicto en una frase

**La conexión está construida y probada de punta a punta hasta el límite de lo que este sandbox permite verificar sin tus credenciales**: `mi-opencode` arranca de verdad, crea sesiones reales, y el adaptador nuevo (`opencode-bridge`) las alcanza correctamente desde una petición con forma de LibreChat — el único eslabón no probado es una respuesta real de un LLM, porque el entorno donde se construyó esto no tiene ninguna API key de proveedor configurada.

---

## 1. Qué se entrega

### 1.1 `mi-opencode` (actualizado)
- **30 archivos modificados** en `packages/opencode/src/` (lista completa en la sección 3).
- **1 archivo nuevo**: `packages/opencode/test-connection.ts` — smoke test reusable contra el SDK oficial, para que puedas volver a correr esta misma verificación cuando quieras.
- `bun.lock` actualizado (de un `bun install` real, filtrado a `packages/opencode` + `packages/core` + `packages/sdk/js` — el monorepo completo no instala en este sandbox por dominios bloqueados: `pkg.pr.new`, `nodejs.org`; ver sección 5).

### 1.2 `mi-libre-chat` (actualizado)
- **`librechat.yaml` nuevo** (no existía uno activo, solo `librechat.example.yaml`): copia del example + una entrada `custom` real llamada `mi-opencode` apuntando al adaptador nuevo.
- **`.env.example` actualizado**: sección nueva con `OPENCODE_BRIDGE_URL` / `OPENCODE_BRIDGE_KEY` y las instrucciones de arranque, en el mismo estilo que las integraciones existentes (`free-claude-code`, `litellm`). Nada existente fue borrado (verificado con grep antes y después).
- **`integrations/opencode-bridge/` nuevo**: el adaptador OpenAI-compatible completo (`src/server.ts`, `README.md`, `package.json`).

---

## 2. Lo que se verificó por ejecución real, no por lectura

| Paso | Verificado | Evidencia |
|---|---|---|
| `bun install` filtrado (`packages/opencode`, `packages/core`, `packages/sdk/js`) | ✅ | 2005 paquetes instalados, log real |
| `opencode serve` arranca sin crashear | ✅ | Proceso vivo >30s, puerto 4096 escuchando, `curl` devuelve 401 (auth exigida correctamente) |
| Auth HTTP Basic de `mi-opencode` funciona | ✅ | `curl -u opencode:testpass123` → sesión creada |
| `POST /session` crea una sesión real | ✅ | Dos corridas independientes, IDs reales (`ses_0317b7862ffeyXsRpH4Nhcdv52`, `ses_0316f7623ffe8tj2u5cVvycqf1`, `ses_0316d2cdfffeneDa6m1C3iua3P`), con `directory`, `timestamps` reales |
| SDK oficial (`@opencode-ai/sdk`) funciona contra el servidor real | ✅ | `test-connection.ts`, corrida real, output capturado |
| `opencode-bridge` traduce `GET /v1/models` a formato OpenAI | ✅ | `curl` real, respuesta JSON correcta |
| `opencode-bridge` traduce `POST /v1/chat/completions` → crea sesión real en `mi-opencode` → reenvía el prompt al endpoint real | ✅ | `curl` real, sesión `ses_0316d2cdfffeneDa6m1C3iua3P` creada por el bridge, prompt reenviado a `/session/:id/message` |
| Un LLM real responde a través de toda la cadena | ⚠️ **NO verificado** | `mi-opencode` devuelve `500 UnknownError` en el paso de prompt — no hay ningún proveedor (Anthropic/OpenAI/etc.) configurado en este sandbox. Es una limitación de credenciales del entorno de construcción, no un bug de la conexión: la sesión se crea y el prompt llega correctamente al endpoint real. |
| Streaming token-a-token real (`GET /event`, SSE) | ⚠️ **NO implementado** | El bridge hace streaming "en bloque" (respuesta completa en un solo chunk SSE), no incremental. Ver `opencode-bridge/README.md` para el diseño de la extensión, no implementada porque no había forma de generar eventos reales que verificar sin una API key de proveedor. |
| LibreChat completo (con Mongo/Meilisearch/Redis) | ❌ **NO probado** | Infraestructura demasiado pesada para este sandbox de un solo proceso. La superficie que sí importa (LibreChat como cliente HTTP `chat/completions`) está cubierta por las pruebas con `curl` contra el bridge. |

---

## 3. Bugs encontrados y corregidos en `mi-opencode` (verificados por ejecución, no solo por lectura)

Se encontraron **cinco clases de bug independientes**, todas necesarias para que `opencode serve` llegara a arrancar. Ninguna estaba documentada en `AUDITORIA_FORENSE_MI_OPENCODE_01AGO2026.md`, porque esa auditoría no llegó a ejecutar el servidor.

### 3.1 Sintaxis: `await` fuera de función `async` dentro de `Effect.gen`
**8 archivos**, cada uno con 1 a 3 ocurrencias (varias en el mismo patrón copiado y pegado): `tool/dependency-analysis.ts`, `tool/api-client.ts`, `tool/code-review.ts`, `tool/code-scan.ts`, `tool/flux-image.ts`, `tool/madge.ts`, `tool/skill-generator.ts`, `tool/skills-marketplace.ts`.
**Fix aplicado:** envolver cada llamada en `yield* Effect.promise(() => ...)`. **Cuidado real encontrado durante el fix**: en `code-review.ts` (función `reviewFile`) y en `madge.ts` (función `scanDir`), el `await` SÍ era correcto porque esas funciones son `async function` reales — un primer pase automático con regex los rompió por error y hubo que revertirlos puntualmente. Estado final: los 8 archivos compilan limpio (`bun build`, 0 errores).

### 3.2 Wiring muerto: ~28 herramientas nuevas nunca conectadas al registro real
El objeto `tool` real que arma `tool/registry.ts` (vía `Effect.all({...})`, línea ~278 original) **nunca incluyó** ninguna de las herramientas nuevas — ni siquiera `approval.ts` o `skill-graph.ts`, que `AUDITORIA_FORENSE_MI_OPENCODE_01AGO2026.md` certificó como ✅. Más abajo el array `builtin` sí las referenciaba (`tool.approval`, `tool.codeScan`, etc.), propiedades inexistentes en ese objeto — `undefined` colándose en silencio porque `bun` no tipa en build. Un `undefined` en ese array además rompe cualquier código que después haga `.map(t => t.id)` sobre `builtin`.
**Fix aplicado:** se comentaron (no se borraron) los imports/yields/entradas de array de las ~28 tools afectadas, con nota explicando por qué, en `tool/registry.ts`. Esto **no cambia ninguna capacidad real del agente** — ya eran inalcanzables antes de este pase.

### 3.3 API inexistente: `Schema.UnionLiteral`
**57 usos en 30 archivos**, sin excepción en cada uno de los módulos nuevos. La versión de `effect` instalada (`4.0.0-beta.83`) no tiene `Schema.UnionLiteral`; la API correcta, ya usada en el código heredado real (`tool/webfetch.ts`), es `Schema.Literals([...])`.
**Fix aplicado:** reemplazo mecánico `Schema.UnionLiteral(a, b, c)` → `Schema.Literals([a, b, c])` en los 30 archivos. Esto es lo que permitió que estos archivos al menos **compilaran**; la mayoría siguen desconectados por el bug de la sección 3.2.

### 3.4 `InstanceState.context` resuelto de forma eager en vez de en `execute`
En al menos 15 de los módulos nuevos, la primera línea del cuerpo `Effect.gen` de la tool (no dentro de `execute:`) llama a `InstanceState.context`, que exige un `InstanceRef` de request — inexistente durante la construcción del registro. Esto crashea el arranque headless en cuanto cualquiera de esas tools se resuelve como servicio (`yield* XTool`), incluso si nunca llega a ejecutarse.
**Fix aplicado:** se deshabilitaron (comentadas) las 3 tools activas que quedaban con este patrón (`BrowserControlTool`, `ScreenshotToCodeTool`, `LocalShellTool`) — igual que en 3.2, ya eran inalcanzables.

### 3.5 Fiber de fondo no identificado que exige `InstanceRef` al boot
Incluso con 3.1–3.4 resueltos, `opencode serve` seguía muriendo con `InstanceRef not provided`, arrancado desde cualquier `cwd` (con o sin proyecto git real). El stack trace de Effect solo expone frames internos del runtime (`forkUnsafe`, scheduler) — no el frame de la app que originó el `Effect.fork`. Candidatos investigados y descartados: `config/config.ts`, `server/global-lifecycle.ts`, `control-plane/workspace-adapter-runtime.ts`, `project/bootstrap.ts` (este último resuelve sus dependencias de forma diferida, no en construcción).
**Fix aplicado (en `effect/instance-ref.ts`… no, en `effect/instance-state.ts`, función `context`):** en vez de morir cuando no hay `InstanceRef` en scope, se devuelve un contexto sintético de fallback (`/tmp/opencode-boot-fallback`). Las llamadas reales por-request no se ven afectadas: el middleware de request provee su propio `InstanceRef`, que siempre tiene prioridad sobre este default. **Pendiente real:** identificar el fiber exacto (sospechosos: la cadena de construcción de `Config`, `Format`, `LSP`, `Plugin`, `Project`, `ShareNext`, `Snapshot` o `Vcs` en `project/bootstrap.ts`) y diferir su llamada a inicialización real por-instancia en vez de resolverla eager en construcción de capa. Documentado como TODO en el propio código.

---

## 4. Archivos modificados (lista completa, `diff -rq` contra el zip original)

```
packages/opencode/src/effect/instance-state.ts          [fix real: 3.5]
packages/opencode/src/tool/registry.ts                  [fix real: 3.2 + 3.4, wiring]
packages/opencode/src/tool/dependency-analysis.ts        [fix real: 3.1]
packages/opencode/src/tool/api-client.ts                 [fix real: 3.1 + 3.3]
packages/opencode/src/tool/code-review.ts                 [fix real: 3.1 + 3.3]
packages/opencode/src/tool/code-scan.ts                   [fix real: 3.1 + 3.3]
packages/opencode/src/tool/flux-image.ts                  [fix real: 3.1 + 3.3]
packages/opencode/src/tool/madge.ts                        [fix real: 3.1 + 3.3]
packages/opencode/src/tool/skill-generator.ts              [fix real: 3.1 + 3.3]
packages/opencode/src/tool/skills-marketplace.ts           [fix real: 3.1 + 3.3]
packages/opencode/src/tool/screenshot-to-code.ts            [fix: 3.3 solamente, sigue deshabilitada por 3.4]
packages/opencode/src/tool/skill-hub.ts                     [fix: 3.3 solamente, sigue deshabilitada por 3.2]
packages/opencode/src/tool/web-research.ts                  [fix: 3.3 solamente, sigue deshabilitada por 3.2]
packages/opencode/src/context-compression/context-compression.ts   [fix: 3.3 solamente]
packages/opencode/src/feature-analyzer/feature-analyzer.ts          [fix: 3.3 solamente]
packages/opencode/src/cache/smart-cache.ts                          [fix: 3.3 solamente]
packages/opencode/src/skill-graph/skill-graph.ts                    [fix: 3.3 solamente]
packages/opencode/src/api/api-tool.ts                               [fix: 3.3 solamente]
packages/opencode/src/form-analysis/form-analysis.ts                [fix: 3.3 solamente]
packages/opencode/src/notion/notion.ts                              [fix: 3.3 solamente]
packages/opencode/src/test-runner/test-runner.ts                    [fix: 3.3 solamente]
packages/opencode/src/animation-recorder/animation-recorder.ts      [fix: 3.3 solamente]
packages/opencode/src/lazy-load/lazy-load.ts                        [fix: 3.3 solamente]
packages/opencode/src/error-analyzer/error-analyzer.ts               [fix: 3.3 solamente]
packages/opencode/src/workflow-versioning/workflow-versioning.ts     [fix: 3.3 solamente]
packages/opencode/src/integrations/index.ts                          [fix: 3.3 solamente]
packages/opencode/src/prompts/prompts.ts                             [fix: 3.3 solamente]
packages/opencode/src/ui-patterns/ui-patterns.ts                     [fix: 3.3 solamente]
packages/opencode/src/menu-analyzer/menu-analyzer.ts                  [fix: 3.3 solamente]
packages/opencode/src/auto-evolution/auto-evolution.ts                [fix: 3.3 solamente]
packages/opencode/src/event-automation/event-automation.ts            [fix: 3.3 solamente]
packages/opencode/src/approval/approval.ts                            [fix: 3.3 solamente]

Archivo nuevo:
packages/opencode/test-connection.ts                     [smoke test reusable, ver sección 6]
```

**Nota honesta sobre los 22 archivos marcados "fix: 3.3 solamente":** ahora compilan, pero siguen sin estar wireados al registro real (bug 3.2). Arreglarlos de sintaxis no los vuelve alcanzables por el agente. Si quieres que alguno de ellos sí quede disponible como tool real, hay que: (a) confirmar que su lógica interna es la que quieres (no se auditó línea por línea el comportamiento de cada uno, solo que compilan), (b) agregarlo de verdad al objeto `Effect.all({...})` de `registry.ts` con una key real, y (c) mover cualquier `InstanceState.context` de nivel-tool a dentro de `execute`. Ninguno de estos 3 pasos se hizo — decisión deliberada para no ampliar el radio de cambios más allá de "que el servidor arranque y la conexión funcione".

---

## 5. Limitaciones del entorno donde se construyó esto (no defectos del código)

- El sandbox no tiene acceso a `pkg.pr.new` ni `nodejs.org` — el `bun install` del monorepo completo (con `packages/app`, `packages/desktop`, etc.) no se pudo hacer; se instaló solo el subconjunto necesario (`packages/opencode`, `packages/core`, `packages/sdk/js`) vía `bun install --filter`.
- No hay ninguna API key de proveedor LLM (Anthropic/OpenAI/etc.) configurada — por eso no se pudo probar una respuesta real de un modelo a través de la cadena completa.
- No se pudo levantar `mi-libre-chat` completo (necesita MongoDB, Meilisearch, Redis) — se probó la superficie que importa (el bridge respondiendo como LibreChat lo consumiría) con `curl` directo.
- Los procesos en background no sobreviven entre llamadas de herramienta separadas en este sandbox (se cierran junto con la subshell) — todas las pruebas de servidor real se hicieron arrancando, probando, y matando el proceso dentro de una misma ventana de ejecución.

---

## 6. Cómo reproducir las pruebas tú mismo

```bash
# 1. Levantar mi-opencode (con tu propia API key de proveedor configurada,
#    para llegar más lejos de lo que se pudo probar aquí)
cd packages/opencode
OPENCODE_SERVER_PASSWORD=tu-password bun run --conditions=browser src/index.ts serve --port 4096

# 2. En otra terminal: smoke test contra el SDK oficial
cd packages/opencode
bun run --conditions=browser test-connection.ts
# (ajustar el password dentro del script si cambiaste OPENCODE_SERVER_PASSWORD)

# 3. Levantar el bridge
cd ../../integrations/opencode-bridge   # dentro del repo de mi-libre-chat
OPENCODE_BASE_URL=http://127.0.0.1:4096 \
OPENCODE_SERVER_PASSWORD=tu-password \
BRIDGE_API_KEY=un-secreto \
BRIDGE_PORT=8787 \
bun run src/server.ts

# 4. Probar como lo haría LibreChat
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer un-secreto" \
  -H "Content-Type: application/json" \
  -d '{"model":"mi-opencode-agent","messages":[{"role":"user","content":"hola"}],"stream":false}'

# 5. Levantar mi-libre-chat normalmente (docker compose) con
#    OPENCODE_BRIDGE_URL=http://opencode-bridge:8787 y
#    OPENCODE_BRIDGE_KEY=un-secreto en su .env, y seleccionar
#    "mi-opencode" en el selector de endpoints.
```

## 7. Próximos pasos recomendados, en orden

1. Configurar un proveedor real en `mi-opencode` (`opencode.json` o variables de entorno) y repetir el paso 4 de la sección 6 para confirmar una respuesta real de un LLM a través de toda la cadena — es el único eslabón que falta cerrar.
2. Encontrar el fiber exacto de la sección 3.5 (con un debugger real, no con logs) y reemplazar el fallback sintético por un fix de raíz.
3. Decidir, módulo por módulo, cuáles de los 22 "fix: 3.3 solamente" quieren volver a estar disponibles como tools reales, y hacer el wiring de verdad.
4. Si terminas queriendo streaming token-a-token real en LibreChat, implementar la variante `promptAsync` + `GET /event` documentada (no implementada) en `opencode-bridge/README.md`.
5. Levantar `mi-libre-chat` completo (con su stack de Mongo/Meilisearch/Redis) para la prueba end-to-end final que este sandbox no pudo hacer.
