# AUDIT.md — Auditoría de código (PHASE 0)

> Inspección real del repositorio mi-libre-chat el 14-ago-2026.
> Método: recorrido de archivos, verificación de conexión (ruta→controlador→
> servicio→runtime), búsqueda de placeholders/mocks/código muerto.

## Hallazgos por categoría

### 1. Bugs / lógica (encontrados en fases previas, corregidos)
- `text-primary-content` (clase Tailwind inexistente) → botones ilegibles.
  Corregido a `text-primary-foreground` (FASE 19b). Verificado con computed styles.
- EventBus: `setMaxListeners` no existe en eventemitter3 instalado → crash al
  montar globalmente. Corregido con guard (FASE 20).
- Sonido guardado con prefijo `local:` nunca sonaba en la síntesis → normalizado (FASE 20).
- Sonido no disparaba en el flujo real del chat porque el chat usa
  `useResumableSSE` (no `useSSE`) → agregado en sus 3 puntos (FASE 20).
- Build OOM: `--max-old-space-size=8192` en host de 8 GB → 4096 (FASE 19b/20).
- `lucide-react` no resuelto por rolldown desde packages/client → symlink al root (FASE 20).

### 2. Placeholders / mocks / trampas
- **No encontrados** en: tools.js (proxy honesto, propaga errores de
  mi-opencode), localProviders (Ollama real, catálogo HF real), sonidos
  (síntesis real + APIs reales), system/metrics/telemetry (FASE D7 conectó
  instancias reales). Estado: **sin placeholders en las rutas críticas**.

### 3. Código muerto / desconectado (candidatos a revisar)
- `api/server/services/WorkflowEngine/*` — motor completo pero **sin UI** y
  persistencia entre reinicios sin validar. Riesgo: código "que existe pero no
  demuestra funcionar" → prioridad PHASE 2.
- `api/server/routes/multiagent.js` — rutas completas; falta validar cobertura
  de UI/consumo real y tests.
- `api/server/models/SoundPreferences.js` vive en `api/models/` (la entrada de
  sync apuntaba a `api/server/models/` — corregida en FASE 22).
- `frontend/` (panel enterprise) — eliminado en FASE 15.

### 4. Seguridad (hallazgos)
- API keys de sonidos SOLO en backend (nunca al navegador) ✓.
- Subidas de sonidos: validación MIME + tamaño (5 MB) + UUID no adivinable +
  acceso solo propietario (JWT) ✓. Duración (15 s) validada en cliente; el
  servidor no la revalida (sin ffprobe) — **limitación documentada**.
- Tools proxy: Basic auth hacia mi-opencode; sin exponer credenciales ✓.
- SSRF: endpoints locales (Ollama) restringidos a base URL configurada ✓.

### 5. Testing (estado)
- Suites existentes: files (referencia uploads), skills, AgentPanel.
- **Faltan** (PHASE 2+): WorkflowEngine (pasos, dependsOn, retries, cancel,
  resume), multiagente, sonidos (prefs, proveedores, subida), localProviders
  (detección Ollama, espacio disco), tools proxy.
- No hay E2E automatizado del flujo agente→tool→resultado.

### 6. Configuración
- `.env` + `docker-compose.override.yml` (envs custom explícitas).
- Sin configuración tipada/versionada (CUE) — aceptable hoy; se documenta.

## Regresión (FASE 21 — verificada en vivo)
- Personalizar navegación: 8 switches + master; OFF/ON reflejado al instante en
  la barra lateral; persistencia tras recarga ✓.

## Conclusiones PHASE 0
1. La base es sólida y REAL: agentes, skills, MCP, memorias, modelos locales,
   tools (mi-opencode), workflows (motor), multiagente, sonidos, observabilidad.
2. Las 3 brechas principales: **contexto/inteligencia** (Project Brain +
  Context Engine), **ejecución controlada** (Tool Router + Workflow UI +
  persistencia), **calidad/seguridad** (Auditor + Policy + Token economy).
3. No hay placeholders en las rutas críticas; el código muerto conocido es el
  WorkflowEngine sin consumidor UI claro.
