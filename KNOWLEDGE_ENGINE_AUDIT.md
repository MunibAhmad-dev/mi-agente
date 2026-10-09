# UNIVERSAL KNOWLEDGE ENGINE — AUDITORÍA (FASES 1–3)

> Según el spec, las fases 1-3 son de AUDITORÍA y DISEÑO (sin modificar código).
> Este documento entrega esas tres fases. La implementación arranca en la FASE 4
> (Web Search abstraction) y avanza fase a fase con tests y sin placeholders.

---

## FASE 1 — Auditoría del repositorio (estado ACTUAL, sin tocar código)

### Lo que YA existe (no duplicar)

| Componente | Ubicación | Estado |
|---|---|---|
| RAG API (langchain + Ollama embeddings) | contenedor `rag_api` (Python, FastAPI, puerto 8000) | ✅ corre |
| Vector DB pgvector | contenedor `vectordb` (Postgres + pgvector) | ✅ corre |
| Ruta `/api/rag` | `api/server/routes/rag.js` | ✅ montada |
| Ruta `/api/context` | `api/server/routes/context.js` | ✅ montada |
| SearchRuntime (provider duckduckgo) | `api/server/services/` (RuntimeRegistry) | ✅ se inicializa |
| Memoria nativa estilo Mem0 (tools set_memory/delete_memory + rutas `/api/memories` + panel UI) | LibreChat core + `packages/api/src/agents/memory.ts` | ✅ activa con LLM local (FASE 28) |
| Ollama Fast Proxy (OpenAI-compatible, think:false) | `api/server/routes/ollamaProxy.js` | ✅ E2E verificado |
| Catálogo de modelos HF categorizado (llm/imagen/video/voz/audio/embeddings) | `api/server/services/localProviders/CatalogService.js` | ✅ |
| Runtimes TTS/STT (Kokoro + faster-whisper) | `rag_api:8500` + proxy `/api/ai-runtimes` | ✅ E2E verificado |
| ComfyUI (imagen/video) | `rag_api:8600` + proxy `/api/comfyui` | ✅ generación real verificada |
| Hash/dedupe: NO existe | — | ⛔ pendiente |
| Content extraction: NO existe | — | ⛔ pendiente |
| Knowledge storage: NO existe (solo memoria por usuario) | — | ⛔ pendiente |
| Model Knowledge Auditor: NO existe | — | ⛔ pendiente |

### Recursos disponibles para el engine (sin coste extra de RAM/CPU)
- `vectordb` (pgvector) ya corre → índice vectorial reutilizable.
- `rag_api` ya corre → embeddings + chunks reutilizables.
- Ollama local → LLM de extracción/auditoría (sin API externa).
- Runtimes TTS/STT/ComfyUI ya integrados → futuros "knowledge adapters" multimodales.

---

## FASE 2 — Auditoría de tecnologías (decisión por componente)

| Componente | Candidato | Licencia | Decisión | Razón |
|---|---|---|---|---|
| Búsqueda web | **SearXNG** (self-hosted) | AGPL-3.0 | ⚠️ evaluar | Máxima privacidad pero AGPL: NO entra al núcleo; se usará como provider opcional. El SearchRuntime actual (duckduckgo) ya cubre el caso inicial sin dependencias. |
| Búsqueda web (fallback) | DuckDuckGo (provider existente) | API pública | ✅ usar | Ya integrado en SearchRuntime; 0 RAM/CPU extra. |
| GraphRAG | microsoft/graphrag | MIT | ❌ NO ahora | Pipeline pesado (indexa con LLM, coste alto); el RAG vectorial actual cubre la FASE 1-12. Se evaluará solo si el conocimiento relacional lo exige (fase avanzada). |
| Vector store | pgvector (existente) | PostgreSQL license | ✅ usar | Ya corre; soporta cuantización (halfvec/scalar). |
| Vector quantización | pgvector scalar/binary + `halfvec` | PostgreSQL license | ✅ usar | Cuantización nativa (hasta ~2× a 32× menos memoria) sin dependencias nuevas. |
| Compresión fría | **Zstandard** (`zstd` npm / libzstd) | BSD-3-Clause | ✅ usar para L0 RAW | Lossless, rápido; solo almacenamiento frío. |
| Extracción de documentos | **Apache Tika** | Apache-2.0 | ⚠️ opcional | Potente (PDF/DOCX/PPT/XLS) pero es un servidor Java (~300-500 MB RAM). Alternativa ligera: `pdf-parse` + `mammoth` (JS) para los formatos 80% usados. **Decisión: empezar con parsers JS ligeros; Tika solo si se necesita cobertura total.** |
| Deduplicación exacta | SHA-256 (crypto nativo) | — | ✅ usar | Hash de contenido + URL canónica. |
| Deduplicación semántica | SemDeDup (archivado) | CC-BY-NC 4.0 | ❌ NO usar | Archivo + **NC (no comercial)** → incompatible. Alternativa: umbral de similitud coseno sobre embeddings pgvector (nuestro propio algoritmo, sin dependencia). |
| Graph de conocimiento | propio sobre pgvector/Mongo | — | ✅ fase avanzada | Solo si el caso lo exige; sin lib extra. |

### Candidatos evaluados y RECHAZADOS
- **SemDeDup**: licencia CC-BY-NC (prohíbe uso comercial) y repo archivado → NO.
- **GraphRAG completo**: coste de indexación alto, sin necesidad actual → pospuesto.
- **Apache Tika**: RAM alta; solo si los parsers JS no bastan → pospuesto.
- **Qdrant** (servidor aparte): pgvector ya cubre; no duplicar servicio.

---

## FASE 3 — Arquitectura propuesta

```text
                LIBRECHAT DASHBOARD
                        │
                        ▼
             UNIVERSAL KNOWLEDGE API  (rutas nuevas /api/knowledge/*)
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
    SEARCH          RAG/STORE         AUDITOR
        │               │                │
        ▼               ▼                ▼
   SearchProvider   Knowledge DB      Model Profile
   (duckduckgo,     (Mongo: items +   (Quick/Standard
    SearXNG opt)     versiones +       audits con el
        │            pgvector:         LLM local)
        ▼            embeddings)       │
   Search Router        │              ▼
   (¿web o KB?)         │        Gap Detection
        │               │              │
        └───────────────┼──────────────┘
                        ▼
                 KNOWLEDGE ROUTER
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
       LLM             TTS             IMAGE
   (chat/agentes)   (Kokoro)       (ComfyUI)
```

### Modelo de datos (diseño, no implementado aún)
- `knowledge_items`: `{ content_hash, canonical_url, title, excerpt, lang, source, created_at, updated_at, last_verified_at, freshness_class (STATIC/SLOW/DYNAMIC/REAL_TIME), confidence, source_count, category[], version, raw_hash }`
- `knowledge_versions`: histórico de cambios (nunca sobrescribir a ciegas).
- `knowledge_sources`: L1 evidence (fragmentos citables) con zstd comprimido.
- `knowledge_embeddings`: pgvector con halfvec cuantizado (L3).
- `model_profiles`: `{ model, quick_audit { coverage, coding, math, fresh, langs }, gaps[] , last_audit }`

### Flujo maestro
```
Pregunta → Knowledge Router → ¿en KB? → ¿fresco? → RAG | Web
  Web → fetch → extract → SHA-256 dedupe → sem-dedupe (coseno)
      → fact/entity extraction (LLM local) → versionado → categorizar
      → almacenar → RAG → modelo
```

### Seguridad (diseño)
- Contenido web = UNTRUSTED: jamás puede alterar system prompt/permisos/herramientas (aislamiento DATA vs INSTRUCTIONS).
- Fetch con timeouts, tamaño máximo, sin redirecciones a internos, bloqueo de SSRF (mismo patrón `createSSRFSafeAgents` ya existente en `packages/api/src/auth/agent.ts`).
- Buscador: validación de query, rate limiting, sanitización.
- Auditor de modelos: pruebas controladas (nunca "inspección de pesos").

---

## Plan de implementación (fases 4-20, orden estricto)

- **FASE 4** Web Search abstraction: interfaz SearchProvider + SearchRouter sobre el SearchRuntime existente (duckduckgo hoy, SearXNG opcional).
- **FASE 5** Content extraction: fetch seguro + parsers JS ligeros (html→text, pdf-parse, mammoth) + metadata (título/autor/fecha/idioma/hash).
- **FASE 6** Exact deduplication: SHA-256 + canonical_url (Mongo único).
- **FASE 7** Semantic deduplication: embeddings pgvector + umbral de coseno (algoritmo propio, sin lib NC).
- **FASE 8** Knowledge extraction: LLM local (Ollama) → entidades/hechos/relaciones con confidence.
- **FASE 9** Knowledge storage: colecciones Mongo + versiones.
- **FASE 10** Vector quantization: halfvec pgvector + medición de recall.
- **FASE 11** Knowledge Router: decide KB vs Web según frescura y gaps.
- **FASE 12** RAG integration: inyectar solo el contexto faltante (Model-aware RAG).
- **FASE 13** Knowledge Auditor: bancos de pruebas por categoría (30-100 QUICK) con LLM local.
- **FASE 14** Model Intelligence: perfil + gaps + Auto-Enhance (configura RAG/web por modelo).
- **FASE 15** Adapters multimodales: TTS knowledge (pronunciación), imagen (visual concepts), video (scene graph).
- **FASE 16** Dashboard Knowledge Center (buscar/filtrar/ver fuentes/versiones/confianza/fusionar).
- **FASE 17** Optimización (caché determinista, bandwidth, batches).
- **FASE 18** Auditoría de seguridad (SSRF, prompt injection, archive bombs, oversized).
- **FASE 19** License audit (KNOWLEDGE_ENGINE_LICENSE_AUDIT.md).
- **FASE 20** E2E completo.

---

## DECISIÓN DE MEMORIA (ítem 5 del encargo)

**Conservar la memoria NATIVA** (estilo Mem0 ya integrada en LibreChat).

- **Mem0**: Apache-2.0, gratis, self-hosted, el framework de memoria más adoptado. PERO: (a) el servidor Ollama local **no soporta embeddings** (los extraería con una lib pesada o un modelo de embeddings nuevo), (b) la memoria nativa ya implementa el mismo patrón (LLM extrae → guarda clave-valor → inyecta contexto) con tools `set_memory`/`delete_memory`, rutas `/api/memories`, panel UI y **particiones personal/agente**, y (c) está **ya conectada al LLM local** (FASE 28). La regla del proyecto ("no duplicar sistemas") manda: duplicar Mem0 añadiría RAM/CPU y una fuente de verdad paralela sin beneficio real aquí.

**Cómo mejorarla (hoja de ruta, sin romper lo existente):**
1. **Recuerdos per-conversación**: el panel ya filtra por agente; añadir clave de contexto por conversación (scope `conversation:<id>`) para que cada chat tenga su memoria sin contaminar la global.
2. **Resumen-compresión**: al acercarse al `tokenLimit`, resumir las memorias antiguas con el LLM local (una sola llamada) y fusionar duplicados semánticos (coseno en pgvector cuando el servidor de embeddings esté disponible).
3. **Importance scoring**: el agente de memoria ya decide qué guardar; añadir un score de importancia para podar recuerdos triviales y conservar los citados por el usuario ("recuerda que…").
4. **Visible en el chat**: hecho en FASE 29 (botón 🧠 con contador + panel editable desde la conversación).
5. **Mem0 como provider futuro**: si algún día hace falta retrieval vectorial multi-agente con embeddings propios, se implementa como ADAPTER bajo la misma interfaz (nunca como sistema paralelo).
