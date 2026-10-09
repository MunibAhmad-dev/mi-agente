# Investigación: funciones de GPT (OpenAI) y Grok (xAI) vs. alternativas open source

*Compilado a partir de las fuentes oficiales de OpenAI (help.openai.com, changelog de ChatGPT) y xAI (docs.x.ai, x.ai) — agosto 2026.*

> Nota sobre alcance: OpenAI y xAI actualizan sus productos casi a diario. Esta lista refleja el estado de sus changelogs oficiales al 27-28 de agosto de 2026. Algunas funciones están en beta o solo en ciertos países/planes.

---

## PARTE 1 — Mapa completo de funciones

### 1. ChatGPT / OpenAI — todas las funciones documentadas

**A. Modelos y "cerebro"**
- Familia GPT-5.x (Instant, Thinking, Pro, mini, Auto-routing) con niveles de esfuerzo de razonamiento (Instant/Medium/High/Extra High/Pro Standard/Pro Extended)
- Selector de modelo simplificado, auto-switch Instant→Thinking
- Ventana de contexto expandida (hasta 256k tokens en Thinking)
- "Fast answers" (respuestas rápidas sin personalización para preguntas informativas)
- Modelos de voz dedicados (GPT-Live-1 y mini) full-duplex

**B. Agentes y ejecución de tareas**
- **ChatGPT Work**: agente para tareas largas, multi-herramienta, con aprobación humana en pasos críticos
- **Scheduled tasks** (tareas programadas, recurrentes, activadas por webhooks de Gmail/Slack/GitHub)
- **Codex** (agente de codificación autónomo): CLI, IDE, app de escritorio (macOS/Windows/Linux), remoto desde móvil, Computer Use en Windows/Mac, multi-repo, goal mode, record & replay
- **Navegador integrado** con capacidad de iniciar sesión en sitios web y completar tareas (reemplazo de Atlas)
- **ChatGPT Sites**: crear apps/dashboards ligeros publicables con URL propia (WebMCP)
- Reservas de restaurantes, búsqueda de empleo, compras con checkout instantáneo (Agentic Commerce Protocol)

**C. Memoria y personalización**
- Memoria automática ("Dreaming"/memoria que se auto-actualiza), memoria por proyecto, fuentes de memoria visibles y editables
- Instrucciones personalizadas (hasta 5,000 caracteres)
- Personalidad configurable (tono, calidez, uso de emojis, listas)
- Chats temporales con/sin personalización

**D. Multimodalidad**
- **Imágenes**: ChatGPT Images (generación y edición), "images with thinking"
- **Video**: Sora / Sora 2 (descontinuado en abril 2026, API cerrada en septiembre 2026)
- **Voz**: modo voz integrado en el chat (texto+audio simultáneo), Voice en Work/Codex, CarPlay
- **Visión**: análisis de imágenes, gráficos interactivos generados a partir de datos
- **Documentos**: lectura, resumen, extracción desde archivos (hasta 20 por mensaje), OCR implícito

**E. Herramientas de productividad**
- Code Interpreter / Python en sandbox
- Canvas / bloques de escritura y de código a pantalla completa
- Proyectos (agrupar chats, archivos, memoria propia)
- Library (biblioteca de archivos con gestión de almacenamiento)
- Búsqueda unificada (chats, proyectos, imágenes, documentos)
- Quizzes interactivos, módulos de aprendizaje interactivo (matemáticas/ciencias)
- ChatGPT para Excel/Sheets, PowerPoint, Word (add-ins)
- Custom GPTs / Plugins / Skills (antes "App Directory")

**F. Conectores e integraciones**
- Gmail, Outlook (incluye buzones compartidos), Google Drive/Docs/Sheets/Slides, Box, Notion, Linear, Dropbox, Salesforce, Apple Messages, Slack, GitHub, DigitalOcean, Airtable, GitLab, HubSpot, Supabase, Vercel
- "Sign in with ChatGPT" en sitios de terceros

**G. Dominios verticales**
- ChatGPT Health (registros médicos, Apple Health)
- Finanzas personales (cuentas conectadas vía Plaid)
- ChatGPT for Clinicians, for Academic Researchers, Edu/for Teachers

**H. Seguridad y cuenta**
- Lockdown Mode (limita acceso a la red para reducir exfiltración de datos)
- Advanced Account Security (passkeys, llaves de recuperación)
- Sesiones activas, contacto de confianza (seguridad ante crisis)
- Predicción de edad / experiencia para menores

**I. Otros**
- Grupos de chat (en retirada), WhatsApp/Kakao/Viber, ads en free/go (ciertos países), "Your Year with ChatGPT"

---

### 2. Grok / xAI — todas las funciones documentadas

**A. Modelos**
- Grok 4.6 (modelo insignia, contexto 500k, esfuerzo de razonamiento configurable: low/medium/high/xhigh), familia Grok 4.x, Grok 3/3 mini (legado)
- Grok 4 Fast (búsqueda y razonamiento multimodal optimizado)
- Modelos dedicados de audio, imagen y video

**B. Chat y razonamiento**
- Modo "Think" (razonamiento extendido paso a paso)
- **DeepSearch** (investigación profunda con búsqueda web en tiempo real)
- Tarjetas enriquecidas en el chat (acciones, deportes, mapas, clima)
- Búsqueda en X (X Search) y web en tiempo real

**C. Grok Imagine (multimedia)**
- Generación de imágenes (hasta 2K), edición de imágenes, edición multi-imagen (hasta 3 fuentes)
- Generación de video texto→video e imagen→video, edición de video, extensión de video, "reference-to-video"
- Voz: texto-a-voz, voz-a-voz, voces personalizadas, tokens efímeros

**D. Agentes**
- **Grok Bot**: "compañeros de equipo" de IA con computadora en la nube persistente propia (navegador, sistema de archivos, terminal), colaboración entre bots, aprendizaje de flujos por demostración, rutinas/automatizaciones programadas
- **Grok Build**: agente de codificación (CLI, modos, atajos de teclado, despliegues enterprise)

**E. Archivos y memoria**
- Subida de archivos amplios (PDF, hojas de cálculo, código, imagen, audio, video) — hasta ~100 archivos en web
- Chat con archivos (RAG), Colecciones de archivos y metadatos
- Proyectos con archivos y automatizaciones adjuntas

**F. Conectores**
- Google Drive, Gmail y Google Calendar, Outlook Mail/Calendar, SharePoint, OneDrive, Microsoft Teams, Salesforce, túnel MCP personalizado

**G. Empresarial**
- Workspaces personales y de equipo, licencias, gestión de organización, Grok Business/Enterprise

**H. Política de contenido**
- Postura declarada como "menos restrictiva" que la competencia (aunque Imagine sí aplica revisión de moderación y no permite todo)

---

## PARTE 2 — Equivalentes open source, permisivos y ligeros en recursos

Leyenda de licencia: **MIT/Apache-2.0** = totalmente permisiva; **licencia de pesos** (Llama, Gemma) = uso amplio con algunas restricciones.

| Función de GPT/Grok | Alternativa open source | Licencia | Nota de recursos |
|---|---|---|---|
| **Modelo de lenguaje base / chat** | Qwen (2.5/3), Mistral Small/Nemo, Gemma 3 (4B–27B), DeepSeek-V4-Flash, gpt-oss, GLM-5 | Apache-2.0 / Mistral / Gemma ToU | Gemma 3 4B–12B y Mistral 7–13B corren en una sola GPU de consumo (8–16 GB VRAM) |
| **Modelo "sin censura"** | Dolphin 3 (Mistral/Llama), Hermes 3/4 (Nous Research, 3B–405B), Llama2-uncensored, modelos "abliterados" (refusal-removed) | Apache-2.0/MIT en la mayoría | Versiones de 7–13B en cuantización Q4 corren en laptop; Hermes 3B es la opción más ligera |
| **Ejecución/servidor local** | Ollama, llama.cpp, LM Studio | MIT | Corre en CPU o GPU modesta; ideal para no depender de nube |
| **Razonamiento extendido ("Think"/"Thinking")** | Modelos con modo razonamiento: DeepSeek-R1 destilados, Qwen3 (modo thinking), gpt-oss | Apache-2.0/MIT | Las versiones destiladas (7B–14B) son razonablemente ligeras |
| **Búsqueda web en tiempo real / DeepSearch** | SearXNG (motor de metabúsqueda autoalojado) + LLM, GPT Researcher, Tongyi DeepResearch, Atlas (harness de investigación citada) | MIT/Apache-2.0 | SearXNG es muy ligero (un contenedor Docker pequeño) |
| **Agente de codificación autónomo (Codex/Grok Build)** | OpenHands, OpenCode, Aider, Cline, Kilo Code, Goose | MIT/Apache-2.0 | OpenCode y Aider son los más ligeros (CLI, sin runtime pesado); OpenHands necesita un sandbox contenedorizado |
| **Agente de navegador / computer use** | Browserable, Nanobrowser (extensión de Chrome, 100% local con tus propias claves), Bytebot, Self-Operating Computer Framework, Steel.dev | MIT/Apache-2.0 | Nanobrowser es la opción más ligera (corre en tu propio navegador) |
| **"Bots" persistentes / equipo de agentes con memoria y máquina propia** | OpenClaw (agente autónomo, mensajería como interfaz), nanobot (agente ultraligero), Hermes Agent, Openwork (alternativa MIT a Cowork basada en Opencode) | MIT | nanobot está diseñado explícitamente para ser mínimo/legible |
| **Generación de imágenes** | Stable Diffusion 3.5 / SDXL, FLUX.1 / FLUX 2 Klein (rápido), Z-Image Turbo (sin censura) | Apache-2.0/licencia de pesos abierta | FLUX Klein y SD-Turbo corren en 6–8 GB VRAM |
| **Edición de imágenes** | ComfyUI + FLUX/SDXL con nodos de edición/inpainting | GPL/MIT (ComfyUI) | — |
| **Generación de video** | Wan 2.1/2.2 (Alibaba, MoE, Apache-2.0), LTX-Video 2.3 (Lightricks, muy ligero), HunyuanVideo 1.5 (Tencent, 8.3B, corre en un RTX 4090), Mochi 1, CogVideoX | Apache-2.0 en su mayoría | Wan 2.1 1.3B y LTX 2.3 son las opciones "runs-anywhere" (8–12 GB VRAM); HunyuanVideo 1.5 genera 480p en ~75s en un 4090 |
| **Imagen→video de muy bajo consumo** | FramePack F1 | Apache-2.0 | Funciona con apenas 6 GB VRAM |
| **Voz — texto a voz (TTS)** | Piper, Coqui TTS, XTTS | MIT/Apache-2.0 | Piper corre en CPU, muy ligero |
| **Voz — voz a texto (STT)** | Whisper (OpenAI, pesos abiertos) / faster-whisper / whisper.cpp | MIT | whisper.cpp corre incluso en CPU de laptop |
| **Conversación de voz en tiempo real (full-duplex)** | Vocode, Vapi (frameworks), pipelines Whisper+LLM+TTS en streaming | MIT/Apache-2.0 | Requiere algo de ingeniería para latencia baja, pero es viable en GPU modesta |
| **Memoria persistente entre conversaciones** | Mem0, MemGPT/Letta, sistemas de memoria jerárquica (ej. OpenHuman) | Apache-2.0/MIT | Ligero: capa sobre una base vectorial pequeña (SQLite + embeddings locales) |
| **RAG / chat con documentos** | LlamaIndex, embeddings locales + SQLite/Chroma | MIT/Apache-2.0 | Muy ligero con embeddings pequeños (ej. bge-small) |
| **Orquestación multiagente** | CrewAI, AutoGen, LangGraph | MIT/Apache-2.0/MIT | — |
| **Automatización / tareas programadas / conectores tipo Zapier** | n8n (con licencia "fair-code", casi permisiva pero no OSI pura), Activepieces (MIT) | MIT (Activepieces) / sustainable-use (n8n) | Ambos se auto-alojan en un contenedor pequeño |
| **"Todo en uno" ya empaquetado (chat + imagen + video + voz + agente de código, sin censura, local)** | **Locally Uncensored** (github.com/PurpleDoubleD/locally-uncensored) — app de escritorio (Tauri/Rust) que integra LLMs abliterados vía Ollama, ComfyUI (FLUX, SDXL, Z-Image Turbo), Wan/HunyuanVideo/LTX para video, Whisper+TTS neuronal para voz, RAG local, 25+ personas, modo agente | AGPL-3.0 | Diseñado explícitamente para hardware modesto (image-to-video en 6 GB VRAM); un solo instalador, sin Docker, 100% offline |

---

## PARTE 3 — Recomendación de "stack" mínimo equivalente

Si el objetivo es cubrir el mayor número de funciones de GPT/Grok con el menor consumo de recursos y sin restricciones de contenido, un stack razonable sería:

1. **Cerebro de texto/razonamiento**: Ollama + Hermes 3 (8B–13B) o Qwen3 (7B–14B) — permisivo, poco censurado, corre en GPU de 8–16 GB.
2. **Búsqueda en tiempo real**: SearXNG autoalojado + function calling del LLM.
3. **Agente de código**: OpenCode o Aider apuntando al mismo modelo local o a un modelo remoto vía API.
4. **Agente de navegador/computadora**: Nanobrowser (extensión) o Bytebot (contenedor Linux) para tareas tipo "Grok Bot"/"ChatGPT Work".
5. **Imagen**: FLUX Klein o SDXL vía ComfyUI.
6. **Video**: LTX-Video 2.3 o Wan 2.1 1.3B (bajo VRAM) / HunyuanVideo 1.5 si hay una RTX 4090.
7. **Voz**: whisper.cpp (STT) + Piper (TTS), o XTTS si se necesita clonación de voz.
8. **Memoria**: Mem0 o Letta sobre SQLite/Chroma.
9. **Empaquetado listo para usar sin armar nada de esto a mano**: **Locally Uncensored**, que ya integra la mayoría de estas piezas en un solo instalador.

---

*Fuentes principales: help.openai.com/en/articles/6825453 (release notes ChatGPT), docs.x.ai/grok/overview, docs.x.ai/grok-bot/overview, docs.x.ai/developers/models, y comparativas de mercado de agosto 2026 citadas en la investigación (Hyperstack, LTX Blog, PocketLLM, Atomic Chat, GitHub awesome-lists). Verificar cada proyecto directamente antes de integrarlo, ya que las versiones/licencias cambian con frecuencia.*
