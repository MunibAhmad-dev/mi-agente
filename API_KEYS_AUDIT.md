# Auditoría de API Keys — ¿Qué necesita clave y qué es gratuito?

Fecha: 15/08/2026 · Proyecto: mi-libre-chat (FASE 34)

Objetivo: saber exactamente qué funciones funcionan SIN configurar ninguna
clave y cuáles requieren una API key (y de dónde obtenerla).

---

## ✅ FUNCIONAN SIN NINGUNA CLAVE (100% automáticas)

| Función | Cómo funciona | Proveedor |
|---|---|---|
| **Memoria automática** | Agente de memoria con Ollama local (`qwen3:0.6b`, instalado) · extrae/actualiza/borra recuerdos solo | Ollama local |
| **Chat con modelos locales** | Ollama / llama.cpp / LM Studio / MLX | Local |
| **Explorar modelos (Hugging Face)** | API pública de HF (descargas, likes, licencia, MoE/Dense) | HF público |
| **Explorar modelos (GitHub)** | API pública de GitHub (rate limit ~60 req/h) | GitHub público |
| **Explorar modelos (Civitai)** | API pública de civitai.com con fallback a civitai.red | Civitai público |
| **Descargar modelos con Ollama** | `ollama pull` vía proxy interno | Local |
| **Visión por computadora** | `moondream` instalado en Ollama (1.7 GB, MIT) | Ollama local |
| **Generación de imagen/video (ComfyUI)** | Runtime local (requiere que ComfyUI esté corriendo) | Local |
| **TTS local (Kokoro)** | Runtime local en rag_api | Local |
| **STT local (faster-whisper)** | Runtime local en rag_api | Local |
| **Búsqueda web (DuckDuckGo → Bing)** | SearchRuntime sin claves, con fallback automático | Público |
| **Motor de búsqueda universal + verificación** | `GET /api/universal-search/*` sobre SearchRuntime | Público |
| **web_search en agentes** | Tool `duckduckgo_search` registrada en el manifest | Público |
| **Sonidos Mixkit** | Biblioteca pública (sin clave) | Mixkit |
| **Subir sonidos propios** | Upload local validado (MP3/WAV/OGG) | Local |
| **Meilisearch (búsqueda de chats)** | Clave local generada por el stack | Local |
| **Racha de días (streak) + regalo** | Servicio propio en MongoDB | Local |
| **Papelera de chats (30 días)** | Backend propio | Local |

## 🔑 REQUIEREN API KEY (solo si quieres usar ese proveedor)

| Función | Variable | Dónde obtenerla | Gratis |
|---|---|---|---|
| Chat OpenAI | `OPENAI_API_KEY` | platform.openai.com | No |
| Chat Google | `GOOGLE_API_KEY` | aistudio.google.com | No |
| Chat Anthropic | `ANTHROPIC_API_KEY` | console.anthropic.com | No |
| Chat Mistral | `MISTRAL_API_KEY` | console.mistral.ai | No |
| Chat OpenRouter | `OPENROUTER_API_KEY` | openrouter.ai | No |
| Chat groq | `GROQ_API_KEY` | console.groq.com | Sí (trial) |
| LiteLLM gateway | `LITELLM_MASTER_KEY` | local (la defines tú) | — |
| Sonidos Pixabay | `PIXABAY_API_KEY` | pixabay.com/api | Sí |
| Sonidos Freesound | `FREESOUND_API_TOKEN` | freesound.org/apiv2 | Sí |
| GitHub (más rate limit) | `GITHUB_TOKEN` | github.com/settings/tokens | Sí |
| HF (modelos gated) | `HF_TOKEN` | huggingface.co/settings/tokens | Sí |
| Tavily/SerpAPI (fallbacks de búsqueda) | `TAVILY_API_KEY` / `SERPAPI_KEY` | tavily.com / serpapi.com | Parcial |

## 📌 Observaciones importantes

1. **Ninguna funcionalidad local requiere claves.** Todo el stack local
   (Ollama, visión, TTS, STT, ComfyUI, búsqueda, memoria, modelos) funciona
   sin configurar nada.
2. **Los proveedores cloud (OpenAI, Google, Anthropic…) están conectados**
   pero requieren su clave para enviar mensajes. El selector los muestra con
   "Establecer clave API" cuando falta.
3. **La búsqueda web no necesita claves** desde FASE 31: DuckDuckGo con
   fallback a Bing (scraping HTML). Tavily/SerpAPI siguen como opcionales.
4. **Pixabay y Freesound** están integrados en la biblioteca de sonidos pero
   requieren su token (gratis al registrarse). Mixkit y subida local no
   requieren nada.
