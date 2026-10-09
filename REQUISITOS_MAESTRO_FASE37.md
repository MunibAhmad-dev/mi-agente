# MATRIZ MAESTRA DE REQUISITOS — AUDITORÍA COMPLETA (FASE 37)

Reconstrucción de TODOS los requisitos solicitados en el historial de la conversación,
comparados contra el estado real del repositorio/dashboard. Leyenda de estados:

- ✅ IMPLEMENTADO (verificado funcionando)
- 🟡 PARCIAL (existe pero incompleto o con limitaciones conocidas)
- ❌ NO IMPLEMENTADO
- 🐛 ROTO (existía pero no funcionaba) → corregido en esta fase
- 🔌 NO CONECTADO (backend sin UI, o UI sin backend)
- 📍 DUPLICADO / REORGANIZADO (resuelto reestructurando)

---

## A. ARQUITECTURA DEL PROYECTO

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| A1 | "mi-opencode" NO debe aparecer en el selector de LLM (es el núcleo, no un LLM) | ✅ | El selector muestra solo proveedores reales (OpenAI, Ollama, etc.); mi-opencode vive como `opencode-bridge`/`mi-opencode` en el stack, nunca como modelo seleccionable |
| A2 | Abstracción LocalModelProviders (Ollama/LM Studio/llama.cpp/vLLM) | 🟡 | `api/server/services/localProviders/` — Ollama completo; LM Studio/llama.cpp/MLX/SDKs como filas en el panel (con estado), sin driver completo de cada uno |
| A3 | No romper proveedores existentes (OpenAI/Anthropic/Google/…) | ✅ | Selector intacto para proveedores cloud; verificado en vivo |

## B. SELECTOR UNIVERSAL DE IA (Universal AI Selector)

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| B1 | Selector universal con modalidades (texto, imagen, video, animación, TTS, STT, audio, multimodal, música, 3D, visión, embeddings, reranking, OCR, speech, traducción, código, agentes, robótica) | ✅ | `UniversalAiSection.tsx` — 21 tipos, lista extensible |
| B2 | IA Universal ARRIBA del selector | ✅ | Modelos locales → IA Universal → INSTALADO → Modelos de texto |
| B3 | MODELOS LOCALES hasta arriba | ✅ | Primera opción del selector |
| B4 | La modalidad elegida personaliza la parte inferior | ✅ | Los runtimes y bloques de exploración cambian según la modalidad |
| B5 | Categoría INSTALADO separada (motores ya presentes: ComfyUI, Kokoro, whisper, Ollama multimodal) | ✅ | Sección propia con línea divisoria, colapsable, contador y "Ver todos →" |
| B6 | Persistir la modalidad elegida | ✅ | `universal-ai-modality` en localStorage |
| B7 | Al elegir texto/imagen/etc. mostrar proyectos/modelos de HF/GitHub/Civitai | ✅ | Bloques de exploración inline por modalidad (FASE 36) |
| B8 | INSTALADO colapsable (hacerla pequeña) | ✅ | Botón "Contraer sección Instalado" |
| B9 | Contador de modelos instalados + acceso directo | ✅ | "9 modelos instalados" + "Ver todos →" + mini-lista con "Usar" |
| B10 | Explorar solo LLM en la pestaña LLM; imagen/video/etc. separados | ✅ | Pestañas separadas por modalidad |
| B11 | Buscador con URLs de proyectos (HF/GitHub/Civitai) | ✅ | Campo de proyectos acepta URLs → `resolveProjectUrl` |
| B12 | Modelos MoE en búsqueda | ✅ | Filtros de arquitectura (Dense/MoE) + metadata de HF |
| B13 | Información: peso disco, VRAM, parámetros, licencia, cuantización | ✅ | Detalle por modelo en Instalados y Explorar |
| B14 | Civitai (civitai.com + civitai.red) | ✅ | Chip 🎨 Civitai con fallback automático (FASE 34) |

## C. MODELOS LOCALES (descubrimiento / instalación / descarga)

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| C1 | Detección automática de Ollama sin romper nada si no está | ✅ | Health check no bloqueante; estado informativo |
| C2 | Descubrir modelos instalados automáticamente | ✅ | `GET /api/local-models` → Ollama/llama.cpp/LM Studio |
| C3 | Botón Borrar modelo instalado | ✅ | En Instalados (FASE 29) |
| C4 | Botón de descarga en modelos | ✅ | En Explorar |
| C5 | Elegir cuantización al descargar | ✅ | Selector de cuantización |
| C6 | Pausar/reanudar descargas | 🟡 | Estado por descarga con progreso; reanudar depende del proveedor |
| C7 | Instalación con verificación de espacio en disco | 🟡 | Se valida tamaño estimado; no bloquea por disco lleno (depende del runtime) |
| C8 | Verificar modo claro | ✅ | Interfaz usa tokens de tema (claro/oscuro consistentes) |
| C9 | Estado del modelo (🟢/🟡/🔴) con texto, no solo color | ✅ | StatusDot + texto "Conectado/No disponible" |
| C10 | Health check ligero por runtime | ✅ | `useRuntimeHealth` con refresh |
| C11 | Streaming/request E2E con Ollama en el chat | ✅ | Selección → conversación usa el modelo local (verificado: qwen3:0.6b en el header) |
| C12 | Capacidades por modelo (tools/vision/reasoning) | ✅ | `capabilities` reales de Ollama; no se inventan |
| C13 | Contexto máximo por modelo | ✅ | `contextLength` de Ollama; fallback seguro |
| C14 | Estados de runtimes correctos | ✅ | 🐛→✅ FASE 36: puerto 8500→8000 + normalización `ok` (ComfyUI/Kokoro/whisper/Ollama multimodal todos "Conectado") |

## D. VISIÓN POR COMPUTADORA

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| D1 | Sistema de visión (describir, OCR, detectar, clasificar) | ✅ | `VisionService` + `VisionPanel` en Configuración → IA |
| D2 | Visión conectada a TODOS los LLM (locales + proveedores) | ✅ | FASE 36: multi-proveedor (Ollama local + OpenAI/Anthropic/Google/OpenRouter con claves del usuario) |
| D3 | No inventar capacidad de visión (usar capabilities reales) | ✅ | Se confía en `capabilities` de Ollama; moondream (vision real) instalado y probado |
| D4 | Detección de objetos con coordenadas | 🟡 | Tareas detect/clasify disponibles; bounding boxes no renderizados sobre la imagen |

## E. PERSONALIZAR NAVEGACIÓN

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| E1 | Sección en Configuración → Personalizar navegación | ✅ | `CustomizeNavigation.tsx` |
| E2 | Cada herramienta con switch visible sin entrar | ✅ | Switch deslizable en cada fila |
| E3 | Click → muestra las mismas funciones que el menú principal | ✅ | MaximizedFeature monta los componentes reales (AgentPanel, SkillsAccordion, PromptsAccordion, MemoryPanel, BookmarkPanel, FilesPanel, MCPBuilder) |
| E4 | No a pantalla completa; se ve bien en la ventana | ✅ | Panel inline con `max-h-[75vh]` |
| E5 | Flechita minimizar/volver funciona | ✅ | ChevronLeft + Minimize2 cierran y restauran la lista |
| E6 | Nuevo chat / Historial sin botón "Abrir" (solo chevron expand/collapse) | ✅ | FixedRow |
| E7 | Persistencia de visibilidad | ✅ | Recoil atoms con persistencia por usuario |
| E8 | Restaurar configuración predeterminada | ✅ | Botón "Restaurar configuración" |
| E9 | OFF ≠ desactivar: la herramienta sigue en Configuración | ✅ | Solo visibilidad; rutas intactas |
| E10 | Ventanas/modales internos no quedan detrás (prompts) | 🐛→✅ | FASE 37: PromptForm drawer z-[100]/z-[110] → z-[140]/z-[145] (Settings dialog es z-[125]) |

## F. SONIDOS Y NOTIFICACIONES

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| F1 | Configuración → Preferencias → Sonidos y notificaciones | ✅ | `SoundsPanel` + tab Preferencias |
| F2 | Interruptor global + volumen + background | ✅ | |
| F3 | Eventos por tipo (respuesta IA, tarea, error, mensaje…) | 🟡 | Sistema de eventos implementado; los sonidos responden a eventos reales vía `useSoundSystem` |
| F4 | Biblioteca de sonidos con búsqueda | ✅ | Buscador con proveedores y filtros |
| F5 | Proveedores: Pixabay, Mixkit, Freesound + local | 🟡 | Mixkit + subida local sin claves; Pixabay/Freesound requieren clave gratuita |
| F6 | Subir sonidos personalizados | ✅ | `uploads.js` + UI |
| F7 | Previsualización sin descargar | ✅ | Player con play/pause |
| F8 | HTTP 400 en reproducción | ✅ | Verificado: los sonidos reproducen sin 400 (FASE 34-35) |

## G. MEMORIA

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| G1 | Memoria 100% automática, sin keys ni config de usuario | ✅ | `memory.agent.enabled` + LLM local qwen3:0.6b (FASE 34 verificado) |
| G2 | Memoria visible en el chat | ✅ | Botón 🧠 con contador + panel Memorias con CRUD (MemoryPanel) |
| G3 | Auditar memoria actual vs Mem0 y conservar la mejor | 🟡 | AUDITORÍA: se conserva la actual (ver abajo) |
| G4 | Que ningún LLM olvide detalles de conversaciones | 🟡 | Memoria de agente + referencias; el historial del chat sigue siendo la fuente principal |

**Decisión Mem0 (G3):** se conserva el sistema actual (memoria de agente de LibreChat con
LLM local). Motivos: (1) es automática y gratuita sin infraestructura extra; (2) usa el
mismo endpoint local (Ollama) ya instalado; (3) Mem0 añadiría un servicio externo/dependencia
y una API key o despliegue propio, sin beneficio proporcional para un dashboard single-user
local. Mem0 queda documentado como mejora futura si se necesita memoria a escala multi-usuario
o vectorial.

## H. STREAK / REGALO

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| H1 | Contabilizar días de uso | ✅ | "7 días de racha" en el menú de usuario |
| H2 | Regalo con sesión extra real | ✅ | "+1 sesión(es) extra al día · 5 usadas hoy" — verificada en el menú de cuenta |

## I. CHAT / AUDIO / PAPELERA

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| I1 | Detener lectura en voz alta al salir del chat | ✅ | `SpeechCleanup.tsx` (FASE 26) |
| I2 | Detener audio al borrar el chat | ✅ | Mismo oyente global |
| I3 | Papelera 30 días con aviso al borrar | ✅ | `deletedconversations` con TTL 30 días + endpoints trash (listar/restaurar/borrar/vaciar) |
| I4 | Icono de usuario arriba con las opciones de la captura | ✅ | HeaderUserMenu con racha, apariencia, archivos, archivadas, papelera, configuración |
| I5 | Botón claro/oscuro en el menú principal | ✅ | ThemeToggle en el header |
| I6 | Header transparente: arreglar legibilidad al hacer scroll | ✅ | Header usa `bg-presentation` sólido (no transparente) |

## J. BÚSQUEDA / KNOWLEDGE ENGINE / RAG

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| J1 | Motor de búsqueda universal multi-fuente | ✅ | `UniversalSearchService` (DuckDuckGo→Bing, dedup por URL, perfiles por dominio) |
| J2 | Verificación factual (afirmaciones, contradicción, corroboración) | ✅ | `verifyClaim` → CORROBORATED/SINGLE_SOURCE/CONTRADICTED/NO_EVIDENCE |
| J3 | Source Catalog con perfiles | ✅ | 32 perfiles (autoridad/confiabilidad por tipo) |
| J4 | UI del Knowledge Engine | ✅ | FASE 36: Configuración → IA → Knowledge Engine (Buscar/Verificar/Fuentes) |
| J5 | web_search activo en agentes | ✅ | `duckduckgo_search` registrada (index + manifest + handleTools) + fallback corregido (DDG vacío → Bing) |
| J6 | RAG: sistema visible en el dashboard | 🔌→✅ | FASE 37: backend existía (`/api/rag`, 11 endpoints) SIN UI → creado `RAGPanel` (Colecciones/Indexar/Buscar) |
| J7 | RAG: búsqueda semántica funcional | 🐛→✅ | FASE 37: embeddings TF-IDF con vocabulario variable → dimensión fija 256 (hashing trick). Antes `cosineSimilarity` devolvía 0 siempre (dimensiones distintas) → ahora rankea correctamente |
| J8 | Reemplazo COMPLETO del buscador (no paralelo) | 🟡 | UniversalSearch es el motor; el RAG interno (memoria de docs) es complementario, no paralelo |

## K. AGENTES

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| K1 | Routing en subagentes | ✅ | `AgentRouting.tsx` con tiers |
| K2 | Métricas de routing | 🟡 | Nivel básico (modelo usado por tarea); dashboard de métricas pendiente |
| K3 | Presupuesto de contexto | 🟡 | Límites por tier; presupuesto dinámico pendiente |
| K4 | Runtime de agentes con proveedores locales (loadConfigModels) | ✅ | Resuelto (FASE previa): endpoints con fetch:true → lista plana para Ollama |
| K5 | Routing por tier en 3 niveles | ✅ | 3 tiers implementados |
| K6 | UI del panel de agentes: niveles automáticos por defecto | ✅ | |
| K7 | Test unitario del routing | ✅ | `AgentRouting` con tests |
| K8 | Todo el potencial de la plataforma conectado a los LLM | 🟡 | Agentes/skills/prompts/memoria conectados; la síntesis del Knowledge Engine dentro del chat queda como siguiente paso |

## L. INFRAESTRUCTURA / RUNNERS LOCALES

| ID | Requisito | Estado | Dónde / Notas |
|----|-----------|--------|---------------|
| L1 | ComfyUI corriendo (imagen/video, modelos pequeños de prueba) | ✅ | ComfyUI 0.3.47 en rag_api:8600 (CPU), imagen de prueba generada |
| L2 | Kokoro (TTS) + faster-whisper (STT) locales | ✅ | Runtime en rag_api:8000, ambos "Conectado" en el selector |
| L3 | Llama.cpp / LM Studio / MLX como proveedores locales | 🟡 | Filas con estado y endpoint configurable; drivers completos futuros |
| L4 | Persistencia del arranque de runtimes tras reinicio | 🟡 | `start-stack.sh` los arranca; al reiniciar Docker vía Desktop hay que ejecutarlo de nuevo |

---

## RESUMEN DE LO IMPLEMENTADO EN FASE 37

1. **UI del RAG** (`RAGPanel.tsx` + registro en Configuración → IA → Base de conocimiento):
   - Estado del servicio (documentos, colecciones, vector store, embeddings)
   - Colecciones: listar, ver estadísticas, eliminar
   - Indexar documento (colección + ID + contenido)
   - Búsqueda semántica con % de relevancia y colección opcional
   - Verificado E2E: indexar 2 docs → buscar "vision imagenes" → doc-2 al 49%

2. **Bug de búsqueda RAG corregido**: los embeddings TF-IDF tenían dimensión variable
   (vocabulario de cada texto), por lo que `cosineSimilarity` (que exige longitudes
   iguales) devolvía 0 y la búsqueda nunca encontraba nada. Ahora dimensión fija 256
   con hashing trick (3 sub-hashes por palabra, peso TF, normalizado). Sin claves.

3. **Fix z-index de modales internos**: el drawer de crear prompt usaba z-[100]/z-[110]
   y quedaba DETRÁS del diálogo de Configuración (z-[125]). Subido a z-[140]/z-[145].
   (Los demás diálogos usan OGDialog con sistema de profundidad automático 130+n·60.)

## PENDIENTES DOCUMENTADOS (no son placeholders)

- **Síntesis LLM del Knowledge Engine dentro del chat** (los veredictos se muestran
  en la UI; falta que el LLM redacte la respuesta final con fuentes).
- **Bounding boxes en detección de objetos** (visión).
- **Dashboard de métricas de routing** (nivel por tarea existe, gráficas no).
- **Drivers completos LM Studio / llama.cpp / MLX** (filas + estado + endpoint sí).
- **Pixabay/Freesound con clave gratuita** (Mixkit y subida local sin clave funcionan).
