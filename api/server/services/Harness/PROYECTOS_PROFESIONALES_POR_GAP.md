# 🏆 PROYECTOS PROFESIONALES PARA CADA GAP — Lista Final

> **Criterios**: Abiertos, permisivos, sin censura, pocos recursos, top del ecosistema.
> **Rating**: 1 = pobre, 10 = perfecto

---

## GAP 1: Vector Store / RAG Real

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **LanceDB** | 12k+ | Apache-2.0 | Embedded, cero dependencias de servidor | **9/10** | El más profesional: embedded, zero-config, columnar, multi-modal. No necesita servidor separado. |
| 2 | **ChromaDB** | 17k+ | Apache-2.0 | Embedded o cliente-servidor | **8/10** | El más fácil de usar. npm install y listo. Embedded mode sin servidor. |
| 3 | **Qdrant** | 22k+ | Apache-2.0 | Servidor (~50MB RAM base) | **8/10** | El más performant para producción. Rust-based, cuantización, filtrado avanzado. |
| 4 | **Milvus** | 32k+ | Apache-2.0 | Servidor pesado (~500MB+ RAM) | **6/10** | Muy potente pero pesado. Más para enterprise que para nuestro caso. |
| 5 | **FAISS** | 33k+ | MIT | CPU/GPU library | **7/10** | Ultra-rápido pero es solo una librería, no tiene API de persistencia. |
| 6 | **pgvector** | 13k+ | PostgreSQL License | PostgreSQL extension | **7/10** | Excelente si ya usas PostgreSQL. Extiende tu DB existente. |
| 7 | **Hnswlib** | 4k+ | Apache-2.0 | C++ library (~5MB) | **6/10** | Ultraligero pero sin persistencia. Solo el algoritmo HNSW. |

### 🏆 GANADOR RECOMENDADO: **LanceDB**
- Embedded (sin servidor)
- Apache-2.0 (comercial OK)
- Multi-modal (texto, imágenes, audio)
- Auto-indexación
- ~10MB en disco

### Runner-up: **ChromaDB** (si quieres npm ecosystem) o **Qdrant** (si quieres lo más rápido)

---

## GAP 2: Python Sandbox / Code Interpreter

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **E2B** | 7k+ | Apache-2.0 | MicroVM (~125ms cold start) | **9/10** | El estándar de la industria para AI code execution. SDK en JS/Python. |
| 2 | **Daytona** | 12k+ | Apache-2.0 →.moveTo BUSL | Container-based | **7/10** | Self-hostable, persistente, pero la licencia está cambiando a BUSL. |
| 3 | **microsandbox** | 3k+ | MIT | MicroVM ligero | **8/10** | Self-hosted, open-source puro, microVM isolation. El más "open" de todos. |
| 4 | **nsjail** | 5k+ | Apache-2.0 | Process-level (~50ms) | **7/10** | Ultra-ligero de Google. Process isolation pero no full VM. |
| 5 | **Cloudflare Workers** | N/A | Propietario | V8 isolates (~1ms) | **5/10** | Rápido pero requiere cuenta Cloudflare. No es self-hosted. |
| 6 | **Docker** | N/A | Apache-2.0 | Container (~10-50ms) | **6/10** | Universal pero no diseñado para code execution untrusted. |
| 7 | **WebContainers (StackBlitz)** | N/A | Propietario | Browser-native | **5/10** | Innovador pero solo funciona en browser. |

### 🏆 GANADOR RECOMENDADO: **microsandbox**
- MIT license puro
- Self-hosted sin depender de nadie
- MicroVM isolation real
- Pocos recursos
- Sin censura

### Runner-up: **E2B** si quieres el SDK más maduro, o **nsjail** si quieres algo minimalista de Google

---

## GAP 3: Procesamiento de Archivos (PDFs, Imágenes, Audio, Spreadsheets)

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **Docling (IBM)** | 20k+ | MIT | Python, ~200MB | **9/10** | El más completo: PDF, DOCX, PPTX, XLSX, HTML, imágenes, audio. MIT. |
| 2 | **pdf-parse** | 3k+ | MIT | Node.js, ~5MB | **8/10** | Ligero para PDFs en Node.js. Simple y rápido. |
| 3 | **sharp** | 32k+ | Apache-2.0 | Node.js, ~10MB | **9/10** | El estándar para imágenes en Node.js. Resize, convert, metadata. |
| 4 | **xlsx (SheetJS)** | 40k+ | Apache-2.0 | Node.js, ~3MB | **9/10** | El estándar para Excel/spreadsheets. Libre de Microsoft. |
| 5 | **mammoth** | 2k+ | BSD-2-Clause | Node.js, ~2MB | **8/10** | DOCX → HTML/Markdown. Simple y confiable. |
| 6 | **Tesseract.js** | 17k+ | Apache-2.0 | Node.js/WASM, ~30MB | **8/10** | OCR puro. Reconocimiento de texto en imágenes. |
| 7 | **marker** | 20k+ | GPL-3.0 | Python, ~500MB | **7/10** | PDF → Markdown. GPU opcional. GPL es consideración. |
| 8 | **Unstructured** | 10k+ | Apache-2.0 | Python, ~300MB | **8/10** | El más completo para RAG pipelines. PDF, DOCX, HTML, imágenes. |

### 🏆 GANADORES RECOMENDADOS (suite completa):
1. **Docling** → Multi-format processor (PDFs, Office, imágenes, audio)
2. **sharp** → Imágenes
3. **xlsx** → Spreadsheets
4. **mammoth** → DOCX
5. **Tesseract.js** → OCR

---

## GAP 4: Voz — TTS (Text-to-Speech) y STT (Speech-to-Text)

### TTS (Texto a Voz)

| # | Proyecto | GitHub Stars | Licencia | VRAM/RAM | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **Kokoro-82M** | 6k+ | Apache-2.0 | 82M params, ~2-3GB GPU o CPU | **10/10** | El mejor balance: 82M params, Apache 2.0, 54 voces, 8 idiomas. Corre en CPU. |
| 2 | **Chatterbox (Resemble)** | 15k+ | MIT | 0.5B params, ~4-6GB | **9/10** | Mejor calidad de voz, voice cloning, MIT license. |
| 3 | **Piper** | 6k+ | GPL-3.0 (fork) | <1GB, CPU-first | **8/10** | El más ligero. Perfecto para Raspberry Pi / edge. |
| 4 | **Orpheus 3B** | 8k+ | Apache-2.0 | 3B params, ~8-12GB | **8/10** | Calidad excelente, emotion tags, Apache 2.0. |
| 5 | **Qwen3-TTS** | 5k+ | Apache-2.0 | 0.6B-1.7B params | **8/10** | El default de Hugging Face, Apache 2.0. |
| 6 | **Bark** | 36k+ | MIT | ~1B params, ~6-12GB | **7/10** | Efectos de sonido, música, expresivo. |
| 7 | **MOSS-TTS Nano** | 1k+ | Apache-2.0 | 0.1B params, CPU-only | **7/10** | Ultra-ligero, 20 idiomas, CPU puro. |

### STT (Voz a Texto)

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **Whisper.cpp** | 35k+ | MIT | ~1GB CPU-only | **10/10** | El estándar. Port a C++. Corre en CPU. |
| 2 | **WhisperX** | 12k+ | MIT | ~2GB GPU | **9/10** | Whisper + word-level alignment. |
| 3 | **faster-whisper** | 12k+ | MIT | ~1GB GPU | **9/10** | Whisper reescrito con CTranslate2. 4x más rápido. |
| 4 | **Canary Qwen 2.5B** | 3k+ | Apache-2.0 | ~5GB GPU | **7/10** | Más reciente, más rápido que Whisper. |
| 5 | **Handy** | 1k+ | MIT | ~500MB CPU | **7/10** | Ultraligero, near-instant transcription. |

### 🏆 GANADORES RECOMENDADOS:
- **TTS**: **Kokoro-82M** (ligero, Apache 2.0, 54 voces) + **Chatterbox** (calidad premium, MIT)
- **STT**: **Whisper.cpp** (el estándar, MIT, CPU)

---

## GAP 5: Generación de Imágenes

| # | Proyecto | GitHub Stars | Licencia | VRAM | Rating | ¿Por qué? |
|---|----------|-------------|----------|------|--------|-----------|
| 1 | **FLUX.1 [schnell]** | 18k+ | Apache-2.0 | ~8-12GB GPU | **8/10** | Rápido, calidad alta, Apache 2.0. El más used. |
| 2 | **Stable Diffusion 3.5** | 28k+ | Stability AI Community | ~6-8GB GPU | **7/10** | Versátil, buen ecosystem. Licencia no es MIT pero es permisiva. |
| 3 | **SDXL-Lightning** | 5k+ | MIT | ~4-6GB GPU | **7/10** | Ultra-rápido (4 steps), MIT, runs on consumer GPU. |
| 4 | **HiDream O1** | 3k+ | MIT | ~8GB GPU | **7/10** | Rising star 2026, MIT, buena calidad. |
| 5 | **Cosmic-Coconut** | 1k+ | Apache-2.0 | ~2GB GPU | **8/10** | El más ligero! Solo 2GB VRAM. Apache 2.0. |
| 6 | **TinyBeans** | 500+ | Apache-2.0 | ~1GB GPU | **9/10** | Ultra-ligero para generación básica. |

### 🏆 GANADOR RECOMENDADO: **FLUX.1 [schnell]** (si tienes GPU) o **SDXL-Lightning** (si tienes GPU limitada)
> **Nota**: Generación de imágenes requiere GPU. Sin GPU, no hay opciones realistas para esto.

---

## GAP 6: Scheduler / Cron Jobs

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **node-cron** | 4k+ | ISC | ~50KB | **10/10** | Zero deps, perfecto para Node.js. Cron expressions. |
| 2 | **bullmq** | 10k+ | MIT | ~100KB + Redis | **8/10** | Jobs con cola, retries, delays. Necesita Redis. |
| 3 | **agenda** | 5k+ | MIT | ~80KB + MongoDB | **7/10** | Jobs persistentes en MongoDB. |
| 4 | **node-schedule** | 8k+ | MIT | ~30KB | **9/10** | Cron + Date scheduling. Sin dependencias. |

### 🏆 GANADOR: **node-cron** (más simple, zero deps) + **node-schedule** (para scheduling por fecha)

---

## GAP 7: Reportes (Markdown → PDF/HTML)

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **marked** | 31k+ | MIT | ~100KB | **9/10** | El estándar para Markdown → HTML. |
| 2 | **pdfkit** | 9k+ | MIT | ~200KB | **9/10** | PDF generation puro en Node.js. |
| 3 | **Pandoc** | 33k+ | GPL-2.0 | ~30MB | **8/10** | El universal document converter. Pero GPL. |
| 4 | **MDX** | 20k+ | MIT | Variable | **7/10** | Markdown + JSX. Más para web que para PDF. |
| 5 | **html-pdf-node** | 1k+ | MIT | ~5MB (Chromium) | **7/10** | HTML → PDF vía Puppeteer. |

### 🏆 GANADORES: **marked** (MD→HTML) + **pdfkit** (HTML→PDF)

---

## GAP 8: Model Context Protocol (MCP)

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **@modelcontextprotocol/sdk** | 8k+ | MIT | ~200KB | **10/10** | SDK oficial de Anthropic. TypeScript. El estándar. |
| 2 | **MCP Hub** | 2k+ | MIT | Variable | **7/10** | Registry de MCP servers. |
| 3 | **mcp-use** | 3k+ | MIT | ~100KB | **8/10** | Client MCP para conectar a cualquier server. |

### 🏆 GANADOR: **@modelcontextprotocol/sdk** (el oficial, MIT)

---

## GAP 9: Multimodal Processing (Vision)

| # | Proyecto | GitHub Stars | Licencia | Recursos | Rating | ¿Por qué? |
|---|----------|-------------|----------|----------|--------|-----------|
| 1 | **sharp** | 32k+ | Apache-2.0 | ~10MB | **9/10** | Resize, crop, format conversion. |
| 2 | **Tesseract.js** | 17k+ | Apache-2.0 | ~30MB WASM | **8/10** | OCR: imagen → texto. |
| 3 | **jimp** | 3k+ | MIT | ~5MB | **7/10** | Pure JS image processing. |
| 4 | **pdf2pic** | 1k+ | MIT | ~5MB | **7/10** | PDF pages → images. |

### 🏆 GANADORES: **sharp** + **Tesseract.js**

---

## RESUMEN FINAL — TOP PROJECTS POR GAP

| Gap | Proyecto Ganador | Licencia | npm install | Recursos |
|-----|-----------------|----------|-------------|----------|
| **1. Vector Store/RAG** | **LanceDB** | Apache-2.0 | `npm i lancedb` | Embedded, cero server |
| **2. Python Sandbox** | **microsandbox** | MIT | `npm i microsandbox` | MicroVM, ~125ms |
| **3. PDFs/Archivos** | **Docling + sharp + xlsx + mammoth** | MIT/Apache | `pip install docling` + npm | ~200MB total |
| **4. TTS** | **Kokoro-82M** | Apache-2.0 | `pip install kokoro` | 82M params, CPU OK |
| **4. STT** | **Whisper.cpp** | MIT | `brew install whisper.cpp` | ~1GB, CPU OK |
| **5. Imágenes** | **FLUX.1 schnell** | Apache-2.0 | HuggingFace download | ~8-12GB GPU |
| **6. Scheduler** | **node-cron** | ISC | `npm i node-cron` | ~50KB |
| **7. Reportes** | **marked + pdfkit** | MIT | `npm i marked pdfkit` | ~300KB |
| **8. MCP** | **@modelcontextprotocol/sdk** | MIT | `npm i @modelcontextprotocol/sdk` | ~200KB |
| **9. Multimodal** | **sharp + Tesseract.js** | Apache-2.0 | `npm i sharp tesseract.js` | ~40MB |

---

## INSTALACIÓN COMPLETA (sin GPU)

```bash
# NPM packages (todos permisivos, ~25MB total)
npm install lancedb node-cron marked pdfkit @modelcontextprotocol/sdk sharp tesseract.js xlsx mammoth

# Python packages (para Docling + Kokoro + Whisper.cpp)
pip install docling kokoro
brew install whisper.cpp  # o compilar desde source
```

**Total: ~225MB en disco, cero dependencias de servicios externos.**

---

## NOTA SOBRE IMÁGENES Y VOZ

- **Generación de imágenes** REQUIERE GPU (mínimo 4GB VRAM). No hay alternativa realista en CPU.
- **TTS (Kokoro)** SÍ funciona en CPU (82M params, muy ligero).
- **STT (Whisper.cpp)** SÍ funciona en CPU (pero más lento que GPU).
- **Para Computer Use GUI** ya tenemos Playwright + nativo OS (implementado en FASE 6).

---

*Documento generado: Agosto 2026*
*Fuentes: GitHub, HuggingFace, Modal Blog, Firecrawl, Northflank, LocalAIMaster, Reddit r/LocalLLaMA*
