# free-claude-code — integración con LibreChat/AI-OS

Este directorio es una copia vendorizada de [Alishahryar1/free-claude-code](https://github.com/Alishahryar1/free-claude-code)
(sin historial de git). Se añadió como fuente adicional de proveedores baratos/locales
para el Gateway, junto a LiteLLM (ver sección "Modelos y proveedores" del checklist).

## Qué es

Un proxy local que traduce el protocolo Anthropic Messages (`/v1/messages`) y OpenAI
Responses (`/v1/responses`) hacia ~18 proveedores (NVIDIA NIM, OpenRouter, Gemini,
DeepSeek, Groq, LM Studio, Ollama, etc.), varios con capa gratuita o 100% local.

## Cómo se conecta a LibreChat

LibreChat ya tiene una variable pensada exactamente para esto: `ANTHROPIC_REVERSE_PROXY`
en `.env` — redirige el endpoint Anthropic nativo de LibreChat hacia cualquier base URL
compatible con `/v1/messages`, que es justo lo que expone este proxy.

1. Levantar el proxy (desde esta carpeta):
   ```bash
   uv run uvicorn server:app --host 0.0.0.0 --port 8082
   ```
2. Abrir el Admin UI local (`http://127.0.0.1:8082/admin`) y configurar el proveedor
   deseado (API key + modelo, o una opción 100% local como LM Studio/Ollama).
3. En el `.env` de LibreChat, descomentar:
   ```
   ANTHROPIC_REVERSE_PROXY=http://localhost:8082
   ANTHROPIC_API_KEY=fcc-no-auth
   ```
4. Reiniciar LibreChat. El selector de modelo del chat seguirá mostrando "Anthropic",
   pero el tráfico real sale por este proxy hacia el proveedor que hayas elegido en su
   Admin UI.

## Pendiente / a decidir

- Evaluar si conviene correr `fcc-server` como servicio propio en `docker-compose`
  (todavía no está añadido ahí).
- Definir `MODEL_OPUS` / `MODEL_SONNET` / `MODEL_HAIKU` en el Admin UI de FCC si se
  quiere enrutar cada tier de modelo a un proveedor distinto.
- No confundir con el Puente 1 del documento de integración (proxy nativo de LiteLLM
  de AI-OS) — son dos rutas independientes hacia el mismo endpoint Anthropic; conviene
  no dejar ambas activas a la vez para no generar confusión sobre qué proveedor sirvió
  cada respuesta.
