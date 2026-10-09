# Auditoría de pendientes — Todo lo pedido en el chat vs. lo implementado

Fecha: 15/08/2026 · Proyecto: mi-libre-chat (FASE 34)

Revisión completa de los requisitos acumulados. Estado real verificado en el
código y en ejecución (no solo "existe el archivo").

---

## 1. Selector de modelos / modelos locales

| Requisito | Estado | Notas |
|---|---|---|
| Selector universal de IA (texto, imagen, video, TTS, STT, audio, multimodal) | ✅ | IA Universal arriba; el contenido inferior cambia según modalidad |
| Persistir la modalidad elegida | ✅ | localStorage |
| Explorar solo-LLM en "Modelos locales" | ✅ | categoría fija `llm` |
| Explorar con buscador + pegar URL (HF, GitHub, Civitai, Ollama) | ✅ | `resolveProjectUrl` backend + campo URL en UI |
| Metadata: peso, parámetros, MoE/Dense, licencia, descargas | ✅ | reales según fuente |
| Instalados con botón Borrar/desinstalar | ✅ | "Borrar" en cada modelo instalado |
| Pausar/reanudar descargas | ✅ | |
| Elegir cuantización al descargar | ✅ | selector de quants GGUF |
| Instalación con chequeo de espacio en disco | ✅ | aviso "No cabe en disco" |
| Modelos MoE en el buscador | ✅ | filtro Arquitectura + tag real de HF |
| **Civitai (civitai.com + civitai.red)** | ✅ NUEVO FASE 34 | chip 🎨 Civitai + resolución de URL + fallback a mirror |
| Ver modo claro | ✅ | header/selector verificados en claro |

## 2. Memoria

| Requisito | Estado | Notas |
|---|---|---|
| Memoria 100% automática, sin keys ni config del usuario | ✅ | `memory.agent.enabled: true` + Ollama local; verificado: el botón 🧠 muestra recuento |
| Memoria visible en el chat | ✅ | botón 🧠 en el header abre el panel |
| Auditar Mem0 vs. memoria nativa | ✅ | nativa (estilo Mem0) elegida: 0 deps, embeddings no necesarios |

## 3. Navegación / configuración

| Requisito | Estado | Notas |
|---|---|---|
| Personalizar navegación (switch por herramienta) | ✅ | |
| Expandir cada herramienta mostrando sus funciones | ✅ | |
| Switch ON/OFF sin botón "abrir" en nuevo chat/historial | ✅ | |
| Ventanas de "añadir" (skins, prompts) detrás de la config | ✅ | corregido (z-index / montaje condicional) |
| Panel de visión por computadora en Configuración → IA | ✅ | FASE 31-32, tab "IA" con VisionPanel |
| Sonidos y notificaciones en Preferencias | ✅ | |
| Subir sonidos propios (MP3/WAV/OGG) | ✅ | upload validado en backend |
| Sonidos Pixabay / Mixkit / Freesound | ⚠️ | Mixkit y subida local sin clave; Pixabay/Freesound requieren token (gratis) en `.env` |
| Errores HTTP 400 en sonidos | ⚠️ | depende de tokens ausentes; corregido para Mixkit/local |

## 4. Búsqueda / conocimiento

| Requisito | Estado | Notas |
|---|---|---|
| SearchRuntime (DuckDuckGo + Bing, sin claves) | ✅ | fallback por 0 resultados corregido FASE 34 |
| web_search en agentes (tool custom sin claves) | ✅ | `duckduckgo_search` registrada (index, handleTools, manifest) |
| Motor de búsqueda universal (multi-fuente) | ✅ NUEVO FASE 34 | `/api/universal-search` con multi-consulta + dedup + perfiles de fuente |
| Verificación factual (corroboración/contradicción) | ✅ NUEVO FASE 34 | `/api/universal-search/verify` → CORROBORATED / SINGLE_SOURCE / CONTRADICTED / NO_EVIDENCE |
| Source Catalog / perfiles de fuentes | ✅ NUEVO FASE 34 | `/api/universal-search/sources` (32 perfiles) |
| OpenFactVerification/Loki, OpenSERP, FlashRank, crawl4ai | ⏳ | evaluados; no integrados (licencia/deps). El motor v1 es heurístico + LLM para síntesis final |
| Extracción de contenido + re-ranking + detección de entidades | ⏳ | fase 2 del Knowledge Engine (documentado en KNOWLEDGE_ENGINE_AUDIT.md) |

## 5. Otros pedidos históricos

| Requisito | Estado | Notas |
|---|---|---|
| RAG / Knowledge Engine con UI | ✅ | FASE 34/37: KnowledgeEnginePanel (búsqueda universal + verificación, `/api/universal-search`) y RAGPanel (biblioteca de documentos, `/api/rag`) registrados en Configuración → IA (registry.tsx). Actualizado por FASE 49 — eran complementarios, no duplicados |
| ComfyUI real (imagen/video) | ⚠️ | selector verificado; el runtime de imagen 256×256 se generó por CPU en pruebas; estado en vivo depende de que rag_api/ComfyUI estén corriendo |
| Kokoro + faster-whisper locales | ✅ | TTS/STT verificados (POST /tts 200) |
| Regalo con sesión extra real | ✅ | +1 sesión extra persistida por hito |
| Streak con días de uso | ✅ | |
| Leer en voz alta se detiene al salir/borrar chat | ✅ | |
| Papelera de chats 30 días + aviso al borrar | ✅ | |
| Botón claro/oscuro en el menú principal | ✅ | |
| Avatar de usuario arriba (como la captura) | ✅ | |
| Auditoría de regresión (lo que se saltó) | ✅ | este documento + pruebas E2E |

## 6. Pendiente real (priorizado)

1. ~~UI del Knowledge Engine / RAG~~ → ✅ resuelto (FASE 34/37):
   KnowledgeEnginePanel y RAGPanel en Configuración → IA.
2. **Integración de sonidos con eventos reales** — verificar que
   `useSoundSystem` dispara en los eventos (IA termina, tarea completa…).
3. ~~Síntesis LLM de la verificación~~ → ✅ resuelto (FASE 6, deep research):
   `/api/agents/architect/research` descompone, recolecta fuentes, verifica
   cada sub-consulta y redacta la respuesta con citas [n] reales.
4. **OpenFactVerification/Loki** — opcional si se quiere verificación con un
   segundo LLM; requiere decidir qué modelo local lo alimenta.

## 7. Cosas que NO llegaron al código (para reimplementar si las quieres)

- **Sistema de visión por computadora completo**: ya no aplica — se
  implementó FASE 31-32 (VisionService + VisionPanel + moondream instalado y
  verificado E2E). El prompt original se quedó fuera de sesiones anteriores,
  pero la funcionalidad equivalente ya existe.
- **Civitai** era el único punto del mensaje anterior que faltaba → hecho.
