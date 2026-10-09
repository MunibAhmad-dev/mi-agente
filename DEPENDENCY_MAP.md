# DEPENDENCY_MAP.md — Mapa de dependencias (PHASE 0)

## Dependencias externas (runtime)

| Paquete | Uso | ¿Reemplazable? |
|---|---|---|
| librechat-data-provider | tipos, API, auth (getTokenHeader, refreshToken) | No (núcleo) |
| @librechat/client | componentes UI (Switch, Sidebar, Button…) | No (núcleo) |
| react / react-dom / recoil / react-i18next | UI y estado | No |
| @tanstack/react-query | datos remotos | No |
| mongoose | MongoDB | Sí (adaptador DB) |
| multer | subidas (sonidos) | Sí |
| express | API | No |
| lucide-react | iconos | Sí (reemplazo de iconos) |
| ollama (host) | modelos locales | Sí (OpenAICompatProvider ya cubre compat) |

## Dependencias internas (módulos propios)

```
routes/*
  └─ controllers/*  ──► services/*  ──► mi-opencode / Ollama / proveedores
client hooks (useSSE, useResumableSSE, useSoundSystem, useSideNavLinks)
  └─ store (Recoil) ──► services (SoundService, EventBus) ──► /api/*
```

| Módulo | Importa | Importado por |
|---|---|---|
| services/EventBus | (ninguno) | WorkflowEngine, ExecutionBridge, client EventBus |
| services/WorkflowEngine | EventBus | routes/enterprise, routes/panel |
| services/localProviders/index.js | OllamaProvider, OpenAICompatProvider, CatalogService | routes/localModels.js |
| services/sounds/* | (network/fs) | controllers/SoundController |
| controllers/SoundController | models/SoundPreferences + services/sounds/* | routes/sounds.js |
| hooks/useSideNavLinks | SidePanel/* componentes | Sidebar / ExpandedPanel |
| hooks/useResumableSSE | soundService, EventBus | Chat |

## Riesgos de impacto (qué se rompería)

| Si cambio… | Puede romper… |
|---|---|
| services/EventBus API | WorkflowEngine, ExecutionBridge, useSoundSystem, task events |
| store/settings atoms (showSidebar*) | useSideNavLinks, CustomizeNavigation, FeatureVisibilityMenu |
| SoundService.playSoundId | sonidos de eventos (SSE, EventBus) |
| localProviders/index.js (espacio en disco) | LocalModelsPanel (validación de descargas) |
| api/models/SoundPreferences | SoundController (prefs por usuario) |
| index.js (montaje de rutas) | todas las rutas /api/* |

## Tests existentes (PHASE 0 — verificación)

- `api/server/routes/files/*.test.js` — subidas (referencia para uploads de sonidos).
- `api/server/routes/skills.test.js`, `skills.tenant.test.js` — skills.
- `client/src/components/SidePanel/Agents/AgentPanel.test.tsx` — panel de agentes.
- Suites de LibreChat upstream (jest) — correrlas antes de cada fase.
- No existen aún: tests de WorkflowEngine, multiagente, sonidos, localProviders.
