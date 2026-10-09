# Proyectos Open Source para Cubrir Gaps — Lista con Ratings

*Criterios: abiertos, permisivos, sin censura, pocos recursos. Rating 1-10 (10=perfecto).*

---

## GAP 1: Vector Store / RAG real (embeddings + búsqueda semántica)

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **ChromaDB** | Apache-2.0 | Muy ligero (embedded, sin Docker) | **9/10** | ✅ PERFECTO para nosotros. Corre dentro de Node.js via chromadb npm. Embeddings locales con all-MiniLM-L6-v2 (22MB). Sin servidor externo. |
| 2 | **LanceDB** | Apache-2.0 | Ligero (embedded) | **8/10** | Embedded como SQLite pero para vectores. Sin servidor. Pero requiere Rust binding. |
| 3 | **sqlite-vss** | MIT | Muy ligero (extensión SQLite) | **7/10** | Extensión de SQLite para vectores. Ideal si ya usamos SQLite. Pero menos features que ChromaDB. |
| 4 | **Qdrant** | Apache-2.0 | Medio (Docker o binario) | **6/10** | Muy potente pero requiere servidor separado. Overkill para nuestro caso. |
| 5 | **FAISS** | MIT | Muy ligero (C++ lib) | **5/10** | Facebook AI Similarity Search. Ultra rápido pero sin API REST, solo librería C++. |
| 6 | **pgvector** | PostgreSQL License | Medio (PostgreSQL) | **4/10** | Requiere PostgreSQL completo. Demasiado para nosotros. |

**Recomendación: ChromaDB (#1)** — Embedded, Apache-2.0, npm package, 22MB de embeddings, sin servidor.

---

## GAP 2: Python sandbox aislado (Code Interpreter)

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **E2B** | Apache-2.0 | Medio (Firecracker microVMs) | **8/10** | Sandbox profesional para AI code execution. SDK JavaScript. Pero requiere servicio en la nube o Firecracker. |
| 2 | **llm-sandbox** | MIT | Ligero (Docker container) | **7/10** | Sandbox ligero diseñado para LLMs. Docker-based. Simple de integrar. |
| 3 | **Pyodide** | MIT | Ligero (WebAssembly) | **7/10** | Python en WebAssembly. Corre en el browser o Node.js. Sin Docker. Sin aislamiento de OS. |
| 4 | **Deno sandbox** | MIT | Ligero (built-in) | **6/10** | Deno tiene sandboxing nativo. Podemos usar `deno eval` con permisos restringidos. |
| 5 | **vm2/vm3** | MIT | Muy ligero (in-process) | **5/10** | Sandbox JS en Node.js. No soporta Python. Solo JavaScript. |
| 6 | **Docker (plain)** | Apache-2.0 | Medio (Docker daemon) | **5/10** | Ejecutar Python en contenedor Docker aislado. Simple pero requiere Docker. |
| 7 | **Firecracker** | Apache-2.0 | Medio (microVMs) | **4/10** | AWS microVMs. Muy seguro pero complejo de configurar. |

**Recomendación: E2B (#1) o Pyodide (#3)** — E2B para producción, Pyodide para lightweight sin Docker.

---

## GAP 3: Procesamiento de archivos (PDFs, imágenes, audio, spreadsheets)

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **pdf-parse** | MIT | Muy ligero (pure JS) | **9/10** | ✅ PERFECTO. Parsea PDFs en Node.js puro. Sin dependencias nativas. npm install pdf-parse. |
| 2 | **sharp** | Apache-2.0 | Ligero (libvips) | **9/10** | ✅ PERFECTO. Procesamiento de imágenes ultra rápido. Resize, crop, format conversion, metadata. |
| 3 | **mammoth** | BSD-2-Clause | Ligero | **8/10** | Convierte DOCX a HTML/Markdown. Simple y confiable. |
| 4 | **xlsx** | Apache-2.0 | Ligero | **8/10** | Lee/escribe Excel spreadsheets. npm package. |
| 5 | **MinerU** | AGPL-3.0 | Medio (modelos ML) | **6/10** | Parser de documentos con ML. Muy completo pero AGPL (no permisiva). |
| 6 | **whisper.cpp** | MIT | Medio (C++ binary) | **7/10** | Transcribe audio. Pero más para STT que para "leer" audio. |
| 7 | **textract** | MIT | Medio (varias dependencias) | **5/10** | Extrae texto de muchos formatos. Pero dependencias pesadas. |

**Recomendación: pdf-parse + sharp + mammoth + xlsx** — 4 npm packages ligeros que cubren todo.

---

## GAP 4: Voz (TTS / STT)

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **whisper.cpp** | MIT | Medio (C++ binary, 1-4GB RAM) | **8/10** | ✅ MEJOR STT local. Corre en CPU. Soporta 100+ idiomas. Sin GPU necesaria. |
| 2 | **faster-whisper** | MIT | Medio (Python, CTranslate2) | **8/10** | 4× más rápido que whisper original. Python. |
| 3 | **Kokoro-82M** | Apache-2.0 | Muy ligero (82M params, ~200MB) | **9/10** | ✅ PERFECTO TTS. Más ligero que Piper. Calidad alta. Apache-2.0. |
| 4 | **Piper** | MIT | Muy ligero (CPU, ~50MB) | **9/10** | ✅ EXCELENTE TTS. Ultra rápido en CPU. Múltiples voces. Sin GPU. |
| 5 | **Coqui XTTS v2** | CPML (no permisiva) | Alto (GPU necesaria) | **4/10** | Clonación de voz. Pero licencia restrictiva (CPML). |
| 6 | **speech-t5** | MIT | Medio | **6/10** | Microsoft TTS. Pero requiere GPU. |
| 7 | **Vosk** | Apache-2.0 | Ligero (~50MB model) | **7/10** | STT offline. Más ligero que whisper pero menos preciso. |

**Recomendación: whisper.cpp (#1) para STT + Piper (#4) para TTS** — Ambos MIT, ligeros, CPU, sin GPU.

---

## GAP 5: Ejecución asíncrona en background

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **BullMQ** | MIT | Ligero (Redis required) | **8/10** | Job queue profesional. pero requiere Redis. |
| 2 | **Agenda** | MIT | Ligero (MongoDB) | **7/10** | Job scheduling para Node.js. pero requiere MongoDB. |
| 3 | **node-cron** | MIT | Muy ligero (zero deps) | **9/10** | ✅ PERFECTO. Cron jobs en Node.js puro. Sin dependencias externas. |
| 4 | **bree** | MIT | Ligero (worker threads) | **8/10** | Job scheduler usando worker threads. Sin Redis/MongoDB. |
| 5 | **p-queue** | MIT | Muy ligero | **7/10** | Cola de promesas con concurrency limit. No es scheduler pero útil. |

**Recomendación: node-cron (#3) para scheduling + p-queue (#5) para concurrency control.**

---

## GAP 6: Generación de imágenes

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **FLUX.1 [schnell]** | Apache-2.0 | Medio (6-8GB VRAM) | **8/10** | Rápido, calidad alta. Apache-2.0. Pero necesita GPU. |
| 2 | **SDXL Turbo** | CreativeML Open RAIL-M | Medio (6GB VRAM) | **7/10** | Ultra rápido (1 step). Pero licencia no es Apache/MIT. |
| 3 | **Stable Diffusion 3.5** | Stability AI Community | Medio (8GB VRAM) | **7/10** | Buena calidad. Licencia más restrictiva. |
| 4 | **Z-Image Turbo** | Apache-2.0 | Bajo (6GB VRAM) | **8/10** | Sin censura. Apache-2.0. Rápido. |
| 5 | **HiDream O1** | MIT | Medio (GPU) | **7/10** | MIT. Calidad creciente. |
| 6 | **ComfyUI** | GPL-3.0 | Variable | **6/10** | Workflow editor para SD. Pero GPL. |

**Recomendación: FLUX.1 schnell (#1) o Z-Image Turbo (#4)** — Apache-2.0, sin censura, buena calidad.

---

## GAP 7: Exportar reportes (Markdown, Word, PDF)

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **md-to-pdf** | MIT | Muy ligero | **9/10** | ✅ Convierte Markdown a PDF. Simple. |
| 2 | **pandoc** | GPL-2.0 | Ligero (binary) | **7/10** | El universal converter. Pero GPL. |
| 3 | **docx** | MIT | Ligero | **8/10** | Genera archivos Word (.docx) en Node.js. |
| 4 | **pdfkit** | MIT | Ligero | **8/10** | Genera PDFs en Node.js puro. |
| 5 | **marked** | MIT | Muy ligero | **9/10** | Parsea Markdown a HTML. Luego usar pdfkit para PDF. |

**Recomendación: marked + pdfkit** — Markdown→HTML→PDF, todo MIT, ligero.

---

## GAP 8: MCP (Model Context Protocol)

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **@modelcontextprotocol/sdk** | MIT | Muy ligero | **9/10** | ✅ SDK oficial de MCP para TypeScript/Node.js. MIT. |
| 2 | **awesome-mcp-servers** | — | Referencia | **8/10** | Lista curada de MCP servers. Útil como referencia. |
| 3 | **mcp-server-filesystem** | MIT | Muy ligero | **8/10** | MCP server para filesystem. Ejemplo oficial. |

**Recomendación: @modelcontextprotocol/sdk (#1)** — SDK oficial, MIT, npm install directo.

---

## GAP 9: Generación de video

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **LTX-Video 2.3** | Apache-2.0 | Bajo (8-12GB VRAM) | **7/10** | Más ligero para video. Apache-2.0. |
| 2 | **Wan 2.1** | Apache-2.0 | Bajo-Medio (8GB VRAM) | **7/10** | Alibaba. Apache-2.0. 1.3B params. |
| 3 | **FramePack F1** | Apache-2.0 | Muy bajo (6GB VRAM) | **8/10** | Image→video con 6GB VRAM. Apache-2.0. |
| 4 | **CogVideoX** | Apache-2.0 | Medio (GPU) | **6/10** | Pero más pesado. |
| 5 | **HunyuanVideo** | Tencent Community | Alto (RTX 4090) | **4/10** | Calidad alta pero requiere GPU potente. |

**Recomendación: FramePack F1 (#3)** — El más ligero, Apache-2.0.

---

## GAP 10: Colaboración entre bots / Learning by demonstration

| # | Proyecto | Licencia | Recursos | Rating | Notas |
|---|----------|----------|----------|--------|-------|
| 1 | **CrewAI** | MIT | Ligero | **7/10** | Multi-agent orchestration. Pero Python. |
| 2 | **LangGraph** | MIT | Ligero | **7/10** | Agent workflows con graphs. Python. |
| 3 | **AutoGen** | MIT | Medio | **6/10** | Microsoft multi-agent. Python. |
| 4 | **OpenAdapt** | MIT | Medio | **6/10** | Record & replay de workflows. Python. |
| 5 | **n8n** | Sustainable Use | Medio (Docker) | **5/10** | Workflow automation. No es exactamente "learning". |

**Nota: Estos gaps (colaboración, learning) son más de arquitectura que de proyectos externos. Ya tenemos el harness que puede extenderse.**

---

## RESUMEN EJECUTIVO — Top 3 proyectos por gap

| Gap | Proyecto #1 (mejor) | Proyecto #2 | Proyecto #3 |
|-----|---------------------|-------------|-------------|
| **Vector Store/RAG** | ChromaDB (Apache-2.0) | LanceDB (Apache-2.0) | sqlite-vss (MIT) |
| **Python sandbox** | E2B (Apache-2.0) | Pyodide (MIT) | llm-sandbox (MIT) |
| **File processing** | pdf-parse + sharp + xlsx (MIT) | mammoth (BSD) | MinerU (AGPL) |
| **Voice TTS/STT** | whisper.cpp + Piper (MIT) | Kokoro-82M (Apache-2.0) | Vosk (Apache-2.0) |
| **Async execution** | node-cron (MIT) | bree (MIT) | p-queue (MIT) |
| **Image generation** | FLUX.1 schnell (Apache-2.0) | Z-Image Turbo (Apache-2.0) | HiDream O1 (MIT) |
| **Report export** | marked + pdfkit (MIT) | md-to-pdf (MIT) | docx (MIT) |
| **MCP** | @modelcontextprotocol/sdk (MIT) | — | — |
| **Video generation** | FramePack F1 (Apache-2.0) | Wan 2.1 (Apache-2.0) | LTX-Video 2.3 (Apache-2.0) |
| **Bot collaboration** | CrewAI (MIT) | LangGraph (MIT) | AutoGen (MIT) |

## CANDIDATOS PARA INSTALAR INMEDIATAMENTO (sin GPU, sin Docker)

| npm install | Tamaño | Licencia | Gap que cubre |
|-------------|--------|----------|---------------|
| `chromadb` | ~5MB | Apache-2.0 | Vector Store/RAG |
| `pdf-parse` | ~1MB | MIT | PDF processing |
| `sharp` | ~8MB | Apache-2.0 | Image processing |
| `xlsx` | ~3MB | Apache-2.0 | Spreadsheet processing |
| `mammoth` | ~2MB | BSD-2 | DOCX processing |
| `node-cron` | ~50KB | MIT | Scheduling |
| `marked` | ~100KB | MIT | Markdown→HTML |
| `pdfkit` | ~2MB | MIT | HTML→PDF |
| `@modelcontextprotocol/sdk` | ~1MB | MIT | MCP |

**Total: ~22MB, 9 packages, todos sin GPU, sin Docker, permisivos.**
