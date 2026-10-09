# ARCHITECTURE_AUDIT.md

**Scope:** remote forensic audit of `proyectos-aoi/mi-agente` (branch `main`) plus local workspace
inspection, performed **before writing any implementation code** (spec §3).
**Method:** GitHub REST API (authenticated), `git` remote introspection, local environment probes.
No code was modified; no files from `main` or any other branch were copied, merged or committed.

---

## 1. Local environment

| Item | Value |
|---|---|
| Workspace | `.../freebuff/judeojuegos, animacion, personajes, musica/reduccion de tokens` |
| Starting branch | `judeojuegos-animacion-personajes-musica` (clean, zero tracked files) |
| Git | 2.55.0.windows.5 |
| Python | 3.12.10 (Windows Store alias aside, real install at `Programs/Python/Python312`) |
| SQLite | 3.49.1 → soporta FTS5 (verificado con índice `context_fts` en runtime) |
| Preinstalled deps | pydantic 2.13.5, pytest, fastapi, uvicorn, httpx |
| Installed during work | tiktoken 0.14.0 (via pip; PyPI reachable, GitHub curl needs `--ssl-no-revoke`) |
| Network | GitHub API OK con token; curl Windows falla revocación TLS salvo `--ssl-no-revoke` |

## 2. Remote repository `proyectos-aoi/mi-agente`

| Item | Value |
|---|---|
| Visibility | **private** (token verificado contra `/user` → cuenta `aoi555`) |
| Default branch | `main` |
| Size | ~28.8 MB, 5,006 files |
| Languages | TypeScript 21.1 MB · JavaScript 9.3 MB · Python 3.1 MB · CSS/Shell/HTML/Go minor |
| Branches (10) | main, actualisacion-tariq_webflow, ai-video-editor, cerebro-investigacion-rag, clonacion-y-creacion-de-paginas-web, creative-ai-orchestrator, dashboard-memoria-y-rag, ia-cripto, judeojuegos-animacion-personajes-musica, social-marketing-intelligence |
| Recent push | 2026-09-10 (commit `cd1f62ab2`, "Phase D+F: Mongo persistence, Scheduler boot, FFmpeg, OTel, LLM cache") |
| License | "Other / NOASSERTION" — no license file interpretable |
| Recent committers | Munib ahmad, Proyectos AOI |

**Identity:** el `api/package.json` se declara `@librechat/backend v0.8.7` con
`repository.url = danny-avila/LibreChat` → **AI-OS es un fork de LibreChat v0.8.7**
más una capa propia (README: "AI-OS — Universal AI Platform", 55 tools, 107 módulos
cognitivos, 10 contenedores Docker: LibreChat, Ollama, MongoDB, Redis, pgvector, MeiliSearch...).

## 3. Top-level structure (main)

```
client/           1,708 files (frontend React/LibreChat)
packages/         1,299 (api 733, client 240, data-schemas 230, data-provider 93, mcp-server, api-key-client)
api/              1,105 (server 983, app 58, cache, config, db, strategies, models.js)
integrations/       489
docs/, e2e/, config/, helm/, scripts/, redis-config/, deploy/, otel/
~70 *.md raíz     auditorías y planes previos (AUDIT.md, MASTER_AUDIT_REPORT.md, FASE0/1/3, ...)
```

## 4. Superficie existente relevante a contexto/tokens (main)

- `api/server/services/ContextIntelligence/` — `TokenCounter.js`, `TokenBudgetService.js`,
  `CompressionService.js`, `FastCompressor.js`, `VectorStore.js`.
- `api/server/services/AgentRuntime/ContextEngine/` — `CompactionManager.js`,
  `ConversationState.js`, `InjectionPoints.js`, `ReminderQueue.js`.
- `api/server/services/Harness/cognitive/` — `ContextCompactor.js`, `ToolResultCompressor.js`,
  `PromptCompressor.js`, `AdaptiveRAG.js`, `ContextualRetriever.js`, `PromptCache.js`,
  `MemoryEngine.js`, `MemoryCompressor.js`, `CrossSessionMemory.js`, `EmbeddingsModule.js`,
  `NLPTokenizer.js` + `TOKEN_OPTIMIZATION_ARCHITECTURE.md`.
- Rutas API existentes: `api/server/routes/context.js`, `rag.js`, `mcp.js`.
- `.mcp.json` en raíz (configuración MCP presente).

**Implicación:** ya existe inversión previa en compresión de contexto en el runtime JS.
Esta rama **no modifica ni duplica** ese trabajo: construye el motor medible y reversible
en Python como capa independiente, dejando la futura integración (spec §69, LiteLLM como
infraestructura de proveedores) para una fase posterior con benchmarks comparativos.

## 5. Decisiones de auditoría que condicionan la implementación

1. **Branch aislado obligatorio** (regla del usuario): se creó `reduccion-de-tokens`
   como rama **huérfana** (`git switch --orphan`) con índice vacío. No comparte historia
   con `main` ni con ninguna otra rama; ningún archivo de otras ramas fue commiteado.
   Nota: git no permite espacios en nombres de rama, por eso `reduccion de tokens` → `reduccion-de-tokens`.
2. **Token embebido:** el remote `origin` tenía un token antiguo incrustado en la URL y el
   usuario proporcionó otro en el prompt. Ninguno se escribió en archivos del repo.
   Ambos deben rotarse (quedan expuestos en histórico/consola).
3. **Python es viable como lenguaje del motor** (spec "Pila tecnológica maestra"): SQLite+FTS5
   disponibles sin servicios externos; tiktoken para conteo exacto; el resto de piezas
   (sqlite-vec, FastEmbed, etc.) quedan como extensiones opcionales no requeridas para el núcleo.
4. **Dependencias del núcleo:** solo `pydantic` (MIT) y `tiktoken` (MIT). FastAPI (MIT) es
   opcional para la capa API. Nada propietario, nada que requiera SaaS.

## 6. Riesgos detectados

- **Licencia del repo "NOASSERTION"**: cualquier código copiado de main heredaría esa
  ambigüedad → otra razón para la rama huérfana con código 100% nuevo (MIT declarado aquí).
- **Credenciales en URL remota**: riesgo de fuga en logs; mitigado rotando tokens.
- **Fork LibreChat enorme (29 MB)**: cualquier estrategia de "mejorar todo main" sería
  inviable; el enfoque de motor independiente + integración posterior es el correcto.
