# Matriz de requisitos — Reconstrucción completa (FASE 35)

Fecha: 15/08/2026 · Proyecto: mi-libre-chat

Auditoría de TODO lo pedido en el historial, comparado contra el dashboard
REAL (verificado en vivo, no solo por nombre de archivo).

---

## A. Selector universal de IA — estructura nueva

Prioridad implementada (de arriba a abajo del selector):

```
1. MODELOS LOCALES          ← hasta arriba (antes de Modelos de texto)
   └── [INSTALADOS] [EXPLORAR] tabs
       ├── MOTORES INSTALADOS: ComfyUI · Kokoro · whisper (estado en vivo)
       ├── Runtimes: Ollama ✓ / llama.cpp / LM Studio / MLX / SDKs
       └── Modelos instalados (Usar / Borrar + peso, params, VRAM, licencia)
2. ✦ IA UNIVERSAL           ← chips de tipos de IA + runtimes por tipo
3. MODELOS DE TEXTO (LLM)   ← proveedores externos (solo en Todo/Texto)
4. [MODELOS DE <tipo>]      ← exploración por modalidad (submenú)
```

### Tipos de IA (lista extensible — FASE 4)

| # | Modalidad | Runtime visible | Categoría Explorar | Estado |
|---|---|---|---|---|
| 1 | Todo | todos | — | ✅ |
| 2 | Texto / LLM | — | llm | ✅ |
| 3 | Imagen | ComfyUI | imagen (HF pipeline text-to-image) | ✅ |
| 4 | Video | ComfyUI | video | ✅ |
| 5 | Animación | ComfyUI | animacion | ✅ |
| 6 | TTS | Kokoro | voz | ✅ |
| 7 | STT | whisper | stt (ASR) | ✅ |
| 8 | Audio | whisper | audio | ✅ |
| 9 | Audio multimodal | Kokoro + whisper | audio | ✅ |
| 10 | Música | Kokoro | musica | ✅ |
| 11 | 3D | ComfyUI | 3d | ✅ |
| 12 | Visión | Ollama multimodal | vision (image-to-text) | ✅ |
| 13 | Embeddings | — | embeddings | ✅ |
| 14 | Reranking | — | reranking | ✅ |
| 15 | OCR | Ollama multimodal | ocr | ✅ |
| 16 | Speech | Kokoro + whisper | voz | ✅ |
| 17 | Traducción | — | traduccion (translation) | ✅ |
| 18 | Código | — | codigo | ✅ |
| 19 | Agentes | — | agentes | ✅ |
| 20 | Robótica | — | robotica | ✅ |

Para añadir una modalidad nueva solo se toca:
`MODALITIES` + (opcional) `RUNTIME_MODALITIES` + `CATEGORY_FOR_MODALITY`
en `UniversalAiSection.tsx`, y (si hay pipeline HF nuevo) `CATEGORY_PIPELINES`
en `CatalogService.js`. El selector NO se rediseña.

### Separación EXPLORAR / INSTALAR / INSTALADOS (FASE 6)

- **INSTALADOS** (tab + categoría arriba): motores + modelos que EXISTEN en
  la máquina, con estado en vivo y botón Borrar. Nunca mezcla catálogo.
- **EXPLORAR**: fuentes 📦 Catálogo · 🤗 Hugging Face · 🐙 GitHub ·
  🎨 Civitai (civitai.com + fallback civitai.red) + buscador + pegar URL.
- **INSTALAR**: botón Descargar (Ollama), selector de cuantización GGUF,
  pausar/reanudar, chequeo de disco y compatibilidad con el hardware.

### Verificado en vivo (preview)

- [x] Modelos locales primero en el selector.
- [x] INSTALADOS con MOTORES INSTALADOS (ComfyUI/Kokoro/whisper) + 9 modelos
      de Ollama con Borrar.
- [x] 21 chips de modalidad (incluye Animación, Música, 3D, Visión, OCR,
      Traducción, Código, Agentes, Robótica).
- [x] Modalidad Visión: bloque LLM oculto, solo runtime Ollama multimodal,
      submenú "Modelos de visión" con exploración HF (BLIP detectado).
- [x] Modalidad Traducción: bloque correcto, persistida en localStorage.
- [x] Persistencia `universal-ai-modality` = "vision" / "traduccion".

---

## B. Estado de TODOS los requisitos históricos (resumen)

| Área | Estado | Notas |
|---|---|---|
| Memoria automática sin keys | ✅ | agente con Ollama local; botón 🧠 con contador |
| Visión por computadora en Configuración | ✅ | tab "IA y modelos" → VisionPanel (moondream, OCR, detectar, clasificar) |
| Civitai en el explorador | ✅ | FASE 34: chip + URL + fallback mirror |
| web_search en agentes sin claves | ✅ | tool duckduckgo_search registrada; SearchRuntime con fallback Bing |
| Motor de búsqueda universal + verificación | ✅ | /api/universal-search + /verify + /sources |
| Sonidos (Pixabay/Mixkit/Freesound/subida) | ✅/⚠️ | Mixkit y subida local sin claves; Pixabay/Freesound requieren token |
| Personalizar navegación | ✅ | switches por herramienta + expandibles |
| Streak + regalo con sesión extra | ✅ | "7 días de racha", "+1 sesión extra" en el menú del usuario |
| Papelera 30 días + aviso | ✅ | |
| Leer en voz alta se detiene al salir/borrar | ✅ | |
| Header no transparente | ✅ | fondo sólido + borde |
| RAG / Knowledge Engine con UI | ⏳ | backend existe (/api/rag, SearchRuntime); falta la pantalla de usuario |
| OpenFactVerification/Loki, FlashRank, crawl4ai | ⏳ | evaluados; el motor v1 es heurístico + LLM para síntesis |

---

## C. Archivos modificados en esta fase

- `client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx` — reordenación
  (Modelos locales arriba) + mapeo de 21 modalidades + persistencia extensible.
- `client/src/components/Chat/Menus/Endpoints/components/UniversalAiSection.tsx`
  — tipos de IA extensibles, runtime por modalidad, CATEGORY_FOR_MODALITY.
- `client/src/components/Chat/Menus/Endpoints/components/LocalModelsPanel.tsx`
  — categorías nuevas + strip MOTORES INSTALADOS en el tab Instalados.
- `api/server/services/localProviders/CatalogService.js` — CATEGORY_PIPELINES
  extendido (vision/ocr/stt/musica/traduccion/animacion…) + Civitai por tipo.
- Docs: `REQUISITOS_MATRIZ_FASE35.md` (este), `API_KEYS_AUDIT.md`,
  `CHECKLIST_PENDIENTES.md`, `KNOWLEDGE_ENGINE_AUDIT.md`.

## D. Pendiente real (no oculto)

1. **UI del Knowledge Engine / RAG** en el dashboard (backend listo).
2. **Síntesis LLM de la verificación factual** en el chat de agentes.
3. **ComfyUI/Kokoro/whisper "fetch failed"** — dependen de que rag_api y
   ComfyUI estén corriendo en el host; el estado se muestra honestamente.
