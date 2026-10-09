# opencode-bridge

Adaptador OpenAI-compatible entre `mi-libre-chat` y `mi-opencode`. Traduce
`POST /v1/chat/completions` (lo que manda LibreChat) a la Session API real de
`mi-opencode` (`POST /session`, `POST /session/:id/message`) y de vuelta.

Ver el bloque de comentarios al inicio de `src/server.ts` para el diseño
completo y sus límites honestos.

## Qué se verificó de verdad (no solo por lectura de código)

- ✅ `mi-opencode` arranca (`bun run serve`) tras los fixes documentados en
  los reportes de integración.
- ✅ El bridge crea una sesión real contra `mi-opencode` (`POST /session`,
  ID de sesión real devuelto).
- ✅ El bridge reenvía el prompt al endpoint real de `mi-opencode`
  (`POST /session/:id/message`, bloqueante) y en modo streaming usa
  `POST /session/:id/prompt_async` + `GET /event` (SSE).
- ✅ **Round-trip completo con LLM real** (Fase 4): el catálogo por defecto
  de `mi-opencode` incluye el proveedor `opencode` (OpenCode Zen) con
  `options.apiKey: "public"`, así que un mensaje ida-y-vuelta se completa sin
  configurar ninguna API key. Verificado en vivo: JSON ✅ y streaming SSE ✅.
- ✅ **Streaming token-a-token real** (Fase 5.1): cada `message.part.delta`
  con `field: "text"` de un part de tipo `"text"` se reenvía como un
  `chat.completion.chunk` individual; el razonamiento del modelo (parts de
  tipo `"reasoning"`) se filtra y no llega al cliente. El fin de turno se
  detecta con `session.idle`. Evidencia: una frase de 3 palabras llega como
  5-6 chunks incrementales + `finish_reason: "stop"` + `[DONE]`.
- ✅ **Contexto preservado al rebobinar/editar** (Fases 5.2 y 6): el
  adaptador guarda por sesión el historial esperado y lo compara contra el
  historial completo que LibreChat manda en cada request.
    - Primer mensaje cambiado (5.2) → sesión nueva sembrada con la
      transcripción. Verificado: editar el número secreto (42→7) responde "7".
    - Mensaje INTERMEDIO editado o rebobinado a un punto intermedio (Fase 6)
      → se detecta la divergencia del historial y se RECONSTRUYE la sesión
      sembrada con el historial editado. Verificado en vivo: cambiar el color
      favorito en el turno 2 (azul→verde) hace que la pregunta posterior
      responda "verde" (con la sesión vieja decía "azul"); y un rebobinado
      al turno 1 hace que el agente ignore los turnos posteriores.

## Fase A (auditoría 11-ago-2026) — confiabilidad del puente

- ✅ **A2 — La memoria del puente sobrevive a un reinicio.** El mapa
  conversación LibreChat ↔ sesión opencode (más el historial esperado y las
  preguntas pendientes) se persiste en `BRIDGE_STATE_FILE` (por defecto
  `./bridge-state.json`; en Docker, volumen `bridge-state` montado en
  `/data`). Guardado diferido + flush en SIGTERM/SIGINT.
- ✅ **A3 — Las preguntas del agente llegan al chat.** El bridge escucha el
  evento `question.asked`, formatea la pregunta en markdown y la entrega
  como mensaje del asistente (el turno queda pausado en mi-opencode). La
  siguiente request del usuario se responde vía
  `POST /question/:requestID/reply` y el bridge espera a que el agente
  reanude su turno para transmitir la respuesta final (misma suscripción de
  eventos, sin huecos).
- ✅ **A4 — Timeouts y errores reales.** `BRIDGE_REQUEST_TIMEOUT_MS` (por
  defecto 180000 ms) limita cada request de chat: si mi-opencode no responde,
  el cliente recibe un error real (504 en modo bloqueante; mensaje de error
  visible en el stream en modo streaming) y el turno colgado se aborta
  (`POST /session/:id/abort`). Los `session.error` del servidor también se
  traducen a errores reales.

## Uso

### Opción A — Nativo (Fase 1, sin Docker)

```bash
# variables de entorno
export OPENCODE_BASE_URL=http://127.0.0.1:4096       # dónde corre mi-opencode
export OPENCODE_SERVER_PASSWORD=cambia-esto           # debe==OPENCODE_SERVER_PASSWORD de mi-opencode
export BRIDGE_API_KEY=otro-secreto-para-librechat      # el apiKey que pondrás en librechat.yaml
export BRIDGE_PORT=8787

bun run src/server.ts
# o: node --experimental-strip-types src/server.ts   (Node >=22.6)
```

### Opción B — Docker Compose (Fase 2)

Levanta `mi-opencode` + este bridge en contenedores, con los secretos como
Docker secrets (archivos, no texto plano en un `.env` versionado):

```bash
cd mi-libre-chat/integrations/opencode-bridge

cp secrets/opencode_server_password.txt.example secrets/opencode_server_password.txt
cp secrets/bridge_api_key.txt.example secrets/bridge_api_key.txt
# editar ambos archivos con valores fuertes reales (nunca se commitean,
# ver secrets/.gitignore)

cp .env.example .env
# ajustar OPENCODE_BUILD_CONTEXT si mi-opencode no es un hermano directo
# de mi-libre-chat en tu disco

docker compose up --build
```

Detalles de arquitectura, cómo conectar esto a LibreChat, y qué se pudo/no
se pudo verificar realmente: ver `docker-compose.yml` (comentario de
cabecera) y `INTEGRATION_REPORT_FASE_2_DOCKER.md` en la raíz de este
checkout.

**Honesto:** este `docker-compose.yml` y los `Dockerfile`/`Dockerfile.dev`
asociados se revisaron a mano contra el código real del repo, pero no se
pudieron construir ni correr (`docker build` / `docker compose up`) en el
entorno donde se escribieron — no había Docker disponible ahí. Falta que
los corras con Docker real y confirmes los gates de salida.

## Wiring en `mi-libre-chat`

Agregar en `librechat.yaml` (bloque `endpoints.custom`):

```yaml
custom:
  - name: 'mi-opencode'
    baseURL: 'http://opencode-bridge:8787/v1'
    apiKey: '${OPENCODE_BRIDGE_KEY}'
    models:
      default: ['mi-opencode-agent']
      fetch: false
    titleConvo: true
```

Y definir `OPENCODE_BRIDGE_KEY` en el `.env` de LibreChat con el mismo valor
que pusiste en `secrets/bridge_api_key.txt` (Docker) o `BRIDGE_API_KEY`
(nativo).

> **Nota (Fase 2 / Docker):** `baseURL: http://opencode-bridge:8787/v1`
> arriba asume que LibreChat y el bridge están en la misma red Docker. El
> `docker-compose.yml` de esta carpeta usa su propia red aislada
> (`opencode-bridge-network`) y no modifica el `docker-compose.yml`
> principal de LibreChat (trae un aviso de "no editar directamente"). Si
> corrés LibreChat con Docker vía ese compose principal, usá en cambio
> `baseURL: 'http://host.docker.internal:8787/v1'` (el contenedor `api` de
> ese compose ya tiene `extra_hosts: host.docker.internal:host-gateway`).
> Si preferís unir ambos stacks en una sola red Docker, ver el comentario
> de cabecera de `docker-compose.yml` en esta carpeta.

## Seguridad — leer antes de exponer esto en red

1. `OPENCODE_SERVER_PASSWORD` en `mi-opencode` es opcional por diseño; si no
   la defines, el servidor de `mi-opencode` queda sin autenticación. Este
   bridge asume que sí la definiste.
2. `mi-opencode` ejecuta comandos y toca el filesystem del host donde corre.
   Este bridge es, en la práctica, una puerta de entrada indirecta a esa
   ejecución desde LibreChat. No lo expongas a usuarios en los que no
   confíes sin revisar los permisos/sandbox de `mi-opencode` primero.
3. `BRIDGE_API_KEY` sin definir deja el adaptador sin autenticación —
   el proceso lo advierte por consola al arrancar, pero igual arranca.
4. **(Fase 2)** Con Docker, ambos secretos (`OPENCODE_SERVER_PASSWORD`,
   `BRIDGE_API_KEY`) se pasan como Docker secrets (archivo montado en
   `/run/secrets/...`), no como texto plano en un `.env` versionado. Los
   archivos reales viven en `secrets/*.txt` y están en `.gitignore` — solo
   se versionan los `.example`. Ver `docker-entrypoint.sh` para el mecanismo
   exacto (resuelve el secreto antes de arrancar `server.ts`, que en sí no
   se modificó).
