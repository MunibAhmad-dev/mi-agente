/**
 * opencode-bridge
 * -----------------------------------------------------------------------
 * Adaptador OpenAI-compatible para mi-opencode, pensado para conectarse
 * como "custom endpoint" de LibreChat (bloque `endpoints.custom` de
 * librechat.yaml).
 *
 * Traduce:
 *   LibreChat  --  POST /v1/chat/completions (formato OpenAI)  -->
 *   este adaptador  --  Session API real de mi-opencode (POST /session,
 *                        POST /session/:id/message)  -->
 *   mi-opencode (agente real)
 *
 * y la respuesta de vuelta a formato OpenAI (streaming o no).
 *
 * Fase A del freelancer (auditoría 11-ago-2026) — lo que esta versión
 * resuelve, de verdad:
 *
 * - A2 (persistencia): el mapa conversación LibreChat ↔ sesión opencode ya
 *   no vive solo en memoria. Se persiste en un archivo JSON
 *   (BRIDGE_STATE_FILE, por defecto ./bridge-state.json) con guardado
 *   diferido (debounce) + flush en SIGTERM/SIGINT. Un reinicio del bridge
 *   conserva las sesiones, el historial esperado (para detectar ediciones /
 *   rebobinados) y las preguntas pendientes.
 *
 * - A3 (preguntas del agente): el bridge escucha el evento `question.asked`
 *   del stream global de eventos, formatea la(s) pregunta(s) en markdown y
 *   las entrega al usuario de LibreChat como mensaje del asistente (fin del
 *   turno). La siguiente request del usuario se trata como la respuesta: el
 *   bridge la reenvía a mi-opencode vía POST /question/:requestID/reply y
 *   espera a que el agente reanude su turno (misma suscripción de eventos,
 *   sin huecos) para transmitir la respuesta final.
 *
 * - A4 (timeouts y errores reales): cada request de chat tiene un timeout
 *   total (BRIDGE_REQUEST_TIMEOUT_MS, por defecto 180_000 ms). Si mi-opencode
 *   no responde a tiempo, el bridge devuelve un error REAL (504 en modo
 *   bloqueante; mensaje de error visible en el stream en modo streaming) en
 *   lugar de dejar el cargador infinito, y aborta el turno colgado
 *   (POST /session/:id/abort, best-effort). Los eventos `session.error` del
 *   servidor (fallo del proveedor LLM, content-filter, etc.) también se
 *   traducen a errores reales hacia LibreChat.
 *
 * Arquitectura de eventos: en lugar de abrir un GET /event por request (que
 * podía perder eventos tempranos y no podía cubrir dos fases de un mismo
 * turno), el bridge mantiene UNA suscripción persistente al stream global
 * con reconexión automática (backoff) y despacha cada evento a los
 * recolectores por sessionID. Cada recolector usa un cursor de secuencia
 * para no re-procesar eventos viejos.
 *
 * Formato de sesiones: LibreChat manda el historial completo en cada
 * request. mi-opencode mantiene su propio historial del lado del servidor
 * una vez creada una sesión. El adaptador cachea qué sessionID de opencode
 * corresponde a cada conversación de LibreChat (hash estable del primer
 * mensaje) y solo reenvía el ÚLTIMO mensaje de usuario en cada turno
 * (o una transcripción sembrada si la sesión es nueva / fue editada).
 */

import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http"
import { createHash, randomUUID } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

// ---------------------------------------------------------------------------
// Configuración (todo por variable de entorno, sin valores hardcodeados)
// ---------------------------------------------------------------------------

const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096"
const OPENCODE_SERVER_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD ?? ""
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY ?? ""
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 8787)
const MODEL_ID = process.env.BRIDGE_MODEL_ID ?? "mi-opencode-agent"
/** Timeout total por request de chat (A4). */
const REQUEST_TIMEOUT_MS = Number(process.env.BRIDGE_REQUEST_TIMEOUT_MS ?? 180_000)
/** Timeout para llamadas HTTP puntuales al servidor de opencode. */
const API_CALL_TIMEOUT_MS = Number(process.env.BRIDGE_API_CALL_TIMEOUT_MS ?? 30_000)
/** Archivo de persistencia del mapa de sesiones (A2). */
const STATE_FILE = process.env.BRIDGE_STATE_FILE ?? "./bridge-state.json"

if (!BRIDGE_API_KEY) {
  console.warn(
    "[opencode-bridge] ADVERTENCIA: BRIDGE_API_KEY no está definida. " +
      "El adaptador aceptará requests sin autenticación. No lo expongas así en producción.",
  )
}

// ---------------------------------------------------------------------------
// Errores tipados
// ---------------------------------------------------------------------------

class BridgeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`mi-opencode no respondió dentro de ${Math.round(timeoutMs / 1000)}s (timeout BRIDGE_REQUEST_TIMEOUT_MS)`)
    this.name = "BridgeTimeoutError"
  }
}

class BridgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BridgeError"
  }
}

// ---------------------------------------------------------------------------
// Cliente HTTP mínimo hacia mi-opencode (Basic Auth si hay password configurada)
// ---------------------------------------------------------------------------

function opencodeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (OPENCODE_SERVER_PASSWORD) {
    headers["Authorization"] = "Basic " + Buffer.from(`opencode:${OPENCODE_SERVER_PASSWORD}`).toString("base64")
  }
  return headers
}

async function opencodeFetch(pathname: string, init?: RequestInit, timeoutMs = API_CALL_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${OPENCODE_BASE_URL}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: { ...opencodeHeaders(), ...(init?.headers ?? {}) },
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new BridgeTimeoutError(timeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  let json: any = undefined
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    // respuesta no-JSON (no debería pasar contra la Session API real)
  }
  if (!res.ok) {
    throw new BridgeError(
      `mi-opencode respondió ${res.status} ${res.statusText} en ${pathname}: ${json ? JSON.stringify(json) : text}`,
    )
  }
  return json
}

async function createSession(title: string) {
  return opencodeFetch("/session", { method: "POST", body: JSON.stringify({ title }) })
}

async function promptAsync(sessionID: string, text: string) {
  // Devuelve 204 No Content en cuanto el prompt está en marcha; la respuesta
  // llega luego por el stream SSE de /event.
  await opencodeFetch(`/session/${encodeURIComponent(sessionID)}/prompt_async`, {
    method: "POST",
    body: JSON.stringify({ parts: [{ type: "text", text }] }),
  })
}

/** Best-effort: aborta un turno colgado (usado al devolver un error real, A4). */
function abortSession(sessionID: string) {
  opencodeFetch(`/session/${encodeURIComponent(sessionID)}/abort`, { method: "POST" }, 5_000).catch(() => {})
}

// ---------------------------------------------------------------------------
// Persistencia del mapa de sesiones (A2)
// ---------------------------------------------------------------------------

interface PendingQuestion {
  requestID: string
  questions: Array<{
    question: string
    header?: string
    options?: Array<{ label: string; description?: string }>
  }>
}

interface PendingPermission {
  requestID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
}

interface SessionRecord {
  id: string
  /** Historial de la conversación tal como opencode debería tenerlo. */
  history: Array<{ role: string; text: string }>
  /** Pregunta pendiente del agente (A3), si la hay. */
  pendingQuestion?: PendingQuestion
  /** Solicitud de permiso pendiente del agente (Fase B1-B3), si la hay. */
  pendingPermission?: PendingPermission
  /**
   * Estado transitorio de emisión de texto (partTypes + emittedByPart),
   * compartido entre la fase de pregunta y la fase de respuesta del MISMO
   * turno para no duplicar ni perder fragmentos. No se persiste a disco.
   */
  emit?: { partTypes: Map<string, string>; emittedByPart: Map<string, number> }
}

const sessionMap = new Map<string, SessionRecord>()

let persistTimer: ReturnType<typeof setTimeout> | undefined

function persistSoon() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = undefined
    writeState()
  }, 200)
}

function writeState() {
  try {
    const records: Record<
      string,
      {
        id: string
        history: SessionRecord["history"]
        pendingQuestion?: PendingQuestion
        pendingPermission?: PendingPermission
      }
    > = {}
    for (const [key, record] of sessionMap) {
      records[key] = {
        id: record.id,
        history: record.history,
        pendingQuestion: record.pendingQuestion,
        pendingPermission: record.pendingPermission,
      }
    }
    mkdirSync(path.dirname(path.resolve(STATE_FILE)), { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify({ version: 1, records }, null, 2))
  } catch (error) {
    console.error("[opencode-bridge] no se pudo persistir el estado:", error)
  }
}

function loadState() {
  try {
    const raw = readFileSync(STATE_FILE, "utf-8")
    const data = JSON.parse(raw)
    for (const [key, record] of Object.entries(data.records ?? {})) {
      const r = record as {
        id?: string
        history?: SessionRecord["history"]
        pendingQuestion?: PendingQuestion
        pendingPermission?: PendingPermission
      }
      if (!r?.id) continue
      sessionMap.set(key, {
        id: r.id,
        history: Array.isArray(r.history) ? r.history : [],
        pendingQuestion: r.pendingQuestion,
        pendingPermission: r.pendingPermission,
      })
    }
    if (sessionMap.size > 0) {
      console.log(`[opencode-bridge] estado restaurado: ${sessionMap.size} sesion(es) desde ${STATE_FILE}`)
    }
  } catch {
    // sin estado previo — arranque limpio
  }
}

loadState()

process.on("SIGTERM", () => {
  writeState()
  process.exit(0)
})
process.on("SIGINT", () => {
  writeState()
  process.exit(0)
})

// ---------------------------------------------------------------------------
// Hub de eventos: UNA suscripción persistente a GET /event con reconexión.
// Despacha cada evento a los recolectores registrados por sessionID.
// ---------------------------------------------------------------------------

interface HubEvent {
  seq: number
  type: string
  properties: any
}

class EventHub {
  private listeners = new Map<string, Set<(event: HubEvent) => void>>()
  private seq = 0
  private connected = false
  private retryDelay = 1_000
  private stopped = false

  start() {
    this.stopped = false
    void this.connect()
  }

  stop() {
    this.stopped = true
  }

  private connect() {
    if (this.stopped) return
    // Usamos node:http (no fetch) a propósito: undici resuelve fetch solo al
    // recibir el PRIMER byte del body, y un server que no emita nada al
    // conectar dejaría la suscripción colgada para siempre. Con node:http, el
    // evento 'response' llega en cuanto se reciben los headers.
    const url = new URL(`${OPENCODE_BASE_URL}/event`)
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        headers: { ...opencodeHeaders(), Accept: "text/event-stream" },
      },
      (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          console.error(`[opencode-bridge] GET /event respondió ${res.statusCode}; reconectando en ${this.retryDelay}ms`)
          res.resume()
          this.connected = false
          this.scheduleReconnect()
          return
        }
        this.connected = true
        this.retryDelay = 1_000
        console.log("[opencode-bridge] suscripción a /event activa")
        const decoder = new TextDecoder()
        let buffer = ""
        res.on("data", (chunk: Buffer) => {
          buffer += decoder.decode(chunk, { stream: true })
          let sep: number
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            this.parseAndDispatch(rawEvent)
          }
        })
        res.on("end", () => {
          this.connected = false
          console.error(`[opencode-bridge] /event desconectado; reconectando en ${this.retryDelay}ms`)
          this.scheduleReconnect()
        })
        res.on("error", (error) => {
          this.connected = false
          console.error(`[opencode-bridge] /event error: ${error.message}; reconectando en ${this.retryDelay}ms`)
          this.scheduleReconnect()
        })
      },
    )
    req.on("error", (error) => {
      this.connected = false
      console.error(`[opencode-bridge] /event no conectable (${error.message}); reconectando en ${this.retryDelay}ms`)
      this.scheduleReconnect()
    })
    req.end()
  }

  private scheduleReconnect() {
    if (this.stopped) return
    setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, 30_000)
      this.connect()
    }, this.retryDelay)
  }

  private parseAndDispatch(rawEvent: string) {
    const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"))
    if (!dataLine) return
    let event: any
    try {
      event = JSON.parse(dataLine.slice(5).trim())
    } catch {
      return
    }
    const props = event.properties ?? {}
    const sessionID = typeof props.sessionID === "string" ? props.sessionID : undefined
    this.seq += 1
    const hubEvent: HubEvent = { seq: this.seq, type: event.type, properties: props }
    if (process.env.BRIDGE_DEBUG) {
      console.log(`[opencode-bridge] hub event ${event.type} seq=${this.seq} session=${sessionID} listeners=${sessionID ? (this.listeners.get(sessionID)?.size ?? 0) : 0}`)
    }
    if (sessionID) {
      const set = this.listeners.get(sessionID)
      if (set) for (const listener of set) listener(hubEvent)
    }
  }

  lastSeq(): number {
    return this.seq
  }

  subscribe(sessionID: string, listener: (event: HubEvent) => void): () => void {
    let set = this.listeners.get(sessionID)
    if (!set) {
      set = new Set()
      this.listeners.set(sessionID, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) this.listeners.delete(sessionID)
    }
  }
}

const hub = new EventHub()
hub.start()

// ---------------------------------------------------------------------------
// Mapeo conversación LibreChat -> sesión opencode
// ---------------------------------------------------------------------------

function conversationKey(messages: Array<{ role: string; content: unknown }>): string {
  const firstUser = messages.find((m) => m.role === "user")
  const seed = firstUser ? JSON.stringify(firstUser.content) : randomUUID()
  return createHash("sha256").update(seed).digest("hex")
}

function messageText(message: { role: string; content: unknown }): string {
  if (typeof message.content === "string") return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part: any) => (typeof part === "string" ? part : (part?.text ?? "")))
      .filter(Boolean)
      .join("\n")
  }
  return String(message.content ?? "")
}

function lastUserText(messages: Array<{ role: string; content: unknown }>): string {
  const last = [...messages].reverse().find((m) => m.role === "user")
  return last ? messageText(last) : ""
}

/** Normaliza para comparar (espacios colapsados, sin bordes). */
function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ")
}

function sameHistory(
  a: Array<{ role: string; text: string }>,
  b: Array<{ role: string; text: string }>,
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].role !== b[i].role) return false
    if (normalizeText(a[i].text) !== normalizeText(b[i].text)) return false
  }
  return true
}

function historyFromMessages(messages: Array<{ role: string; content: unknown }>): Array<{ role: string; text: string }> {
  return messages.map((m) => ({ role: m.role, text: messageText(m) }))
}

type TurnResolution =
  | { kind: "turn"; key: string; record: SessionRecord; incomingHistory: Array<{ role: string; text: string }>; lastText: string; text: string }
  | { kind: "answer"; key: string; record: SessionRecord; incomingHistory: Array<{ role: string; text: string }>; lastText: string }
  | { kind: "permission-answer"; key: string; record: SessionRecord; incomingHistory: Array<{ role: string; text: string }>; lastText: string }

/**
 * Resuelve la sesión para este request y decide qué prompt mandar.
 *
 * - Si hay una pregunta pendiente (A3), la request se trata como la
 *   respuesta del usuario (kind "answer") — no se crea sesión nueva.
 * - Si la sesión es nueva o el historial divergió (edición/rebobinado),
 *   se crea/reconstruye la sesión sembrada con la transcripción.
 * - Si coincide, se reenvía solo el último mensaje.
 */
async function resolveTurn(messages: Array<{ role: string; content: unknown }>): Promise<TurnResolution> {
  const key = conversationKey(messages)
  const incomingHistory = historyFromMessages(messages.slice(0, -1))
  const lastText = lastUserText(messages)

  const existing = sessionMap.get(key)

  if (existing?.pendingQuestion) {
    return { kind: "answer", key, record: existing, incomingHistory, lastText }
  }
  if (existing?.pendingPermission) {
    return { kind: "permission-answer", key, record: existing, incomingHistory, lastText }
  }

  const diverged = existing ? !sameHistory(incomingHistory, existing.history) : true

  let record = existing
  let fresh = false
  if (!existing || diverged) {
    const session = await createSession("librechat-bridge")
    const id = session?.id ?? session?.data?.id
    if (!id) throw new BridgeError("mi-opencode no devolvió un session.id al crear la sesión")
    record = { id, history: [] }
    sessionMap.set(key, record)
    persistSoon()
    fresh = true
  }

  const text = fresh && incomingHistory.length > 0 ? buildSeedPrompt(incomingHistory, lastText) : lastText
  return { kind: "turn", key, record, incomingHistory, lastText, text }
}

/**
 * Después de recibir la respuesta del agente, actualiza el historial esperado
 * de la sesión para poder detectar ediciones en el siguiente turno.
 */
function recordAssistantTurn(
  record: SessionRecord,
  incomingHistory: Array<{ role: string; text: string }>,
  lastText: string,
  answer: string,
) {
  record.history = [...incomingHistory, { role: "user", text: lastText }, { role: "assistant", text: answer }]
  delete record.emit
  persistSoon()
}

function buildSeedPrompt(
  history: Array<{ role: string; text: string }>,
  lastText: string,
): string {
  const transcript = history
    .map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.text}`)
    .join("\n\n")
  return (
    `[Contexto de una conversación previa, continúa desde aquí]\n\n${transcript}\n\n` +
    `Mensaje actual del usuario:\n${lastText}`
  )
}

// ---------------------------------------------------------------------------
// Formato OpenAI-compatible
// ---------------------------------------------------------------------------

function chatCompletionObject(id: string, text: string) {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

function sseChunk(id: string, delta: Record<string, unknown>, finishReason: string | null) {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
  return `data: ${JSON.stringify(payload)}\n\n`
}

function openaiError(status: number, message: string, type: string) {
  return JSON.stringify({ error: { message, type } })
}

// ---------------------------------------------------------------------------
// Formato de la pregunta del agente para el usuario (A3)
// ---------------------------------------------------------------------------

function formatQuestion(questions: NonNullable<PendingQuestion["questions"]>): string {
  const lines: string[] = ["🔔 **El agente necesita una aclaración antes de continuar.**"]
  for (const q of questions) {
    lines.push("")
    lines.push(`### ${q.header ?? "Pregunta"}`)
    lines.push(q.question)
    if (q.options?.length) {
      lines.push("")
      lines.push("Opciones:")
      q.options.forEach((option, i) => {
        lines.push(`${i + 1}. **${option.label}**${option.description ? ` — ${option.description}` : ""}`)
      })
    }
  }
  lines.push("")
  lines.push("> Escribe tu respuesta en el próximo mensaje.")
  return lines.join("\n")
}

/** Formatea una solicitud de permiso (Fase B1-B3) para el usuario del chat. */
function formatPermission(permission: PendingPermission): string {
  const lines: string[] = ["🔐 **El agente pide permiso para ejecutar una acción.**"]
  lines.push("")
  lines.push(`**Permiso:** \`${permission.permission}\``)
  if (permission.patterns.length) {
    lines.push(`**Patrón:** \`${permission.patterns.join(", ")}\``)
  }
  const metadataEntries = Object.entries(permission.metadata).filter(
    ([, value]) => typeof value === "string" || typeof value === "number",
  )
  if (metadataEntries.length) {
    lines.push("**Detalles:** " + metadataEntries.map(([key, value]) => `${key}=${value}`).join(", "))
  }
  lines.push("")
  lines.push("> Responde **aprueba** (solo esta vez), **siempre** (permitir siempre) o **no** (denegar).")
  return lines.join("\n")
}

/** Interpreta la respuesta libre del usuario a una solicitud de permiso. */
function interpretPermissionReply(text: string): { reply: "once" | "always" | "reject"; message?: string } {
  const lower = text.trim().toLowerCase()
  if (/(^|\s)(siempre|always)/.test(lower)) return { reply: "always" }
  if (/^(no|deny|denegar|rechaza|rechazar)[.!\s]*$/i.test(lower) || /(deny|denegar|rechaza)/.test(lower)) {
    return { reply: "reject", message: text }
  }
  return { reply: "once" }
}

// ---------------------------------------------------------------------------
// Recolector de eventos de sesión: consume el hub hasta idle / pregunta /
// error / timeout. Devuelve el texto acumulado y, si aplica, la pregunta.
// ---------------------------------------------------------------------------

type TurnOutcome =
  | { status: "done"; text: string }
  | { status: "question"; text: string; question: PendingQuestion }
  | { status: "permission"; text: string; permission: PendingPermission }

interface CollectOptions {
  emitState: { partTypes: Map<string, string>; emittedByPart: Map<string, number> }
  onDelta: (delta: string) => void
  /** Captura preguntas (question.asked) y permisos (permission.asked). */
  capturePending: boolean
}

function createTurnCollector(sessionID: string, opts: CollectOptions): {
  promise: Promise<TurnOutcome>
  arm: () => void
  cancel: () => void
} {
  const { emitState, onDelta } = opts
  let settled = false
  let armed = false
  let accumulated = ""
  let finish = () => {}
  let unsub = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined

  const promise = new Promise<TurnOutcome>((resolve, reject) => {
    finish = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      unsub()
      fn()
    }

    timer = setTimeout(() => {
      finish(() => reject(new BridgeTimeoutError(REQUEST_TIMEOUT_MS)))
    }, Math.max(1, REQUEST_TIMEOUT_MS))

    const before = hub.lastSeq()
    unsub = hub.subscribe(sessionID, (event) => {
      // Ignora eventos previos al armado: la acción (prompt_async / reply)
      // se dispara DESPUÉS de armar, así que los eventos de su turno siempre
      // tienen seq > before y no se pierden; los rezagados del turno
      // anterior se descartan.
      if (!armed || event.seq <= before || settled) return
      try {
        handleEvent(event)
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new BridgeError(String(error))))
      }
    })

    const handleEvent = (event: HubEvent) => {
      const props = event.properties ?? {}
      switch (event.type) {
        case "message.part.updated": {
          const part = props.part
          if (part?.id) {
            emitState.partTypes.set(part.id, part.type ?? "text")
            if (part.type === "text" && typeof part.text === "string" && part.text) {
              const emitted = emitState.emittedByPart.get(part.id) ?? 0
              if (part.text.length > emitted) {
                const rest = part.text.slice(emitted)
                onDelta(rest)
                accumulated += rest
                emitState.emittedByPart.set(part.id, part.text.length)
              }
            }
          }
          break
        }
        case "message.part.delta": {
          const partType = emitState.partTypes.get(props.partID)
          if (props.field === "text" && partType !== "reasoning") {
            const delta: string = props.delta ?? ""
            if (delta) {
              onDelta(delta)
              accumulated += delta
              emitState.emittedByPart.set(props.partID, (emitState.emittedByPart.get(props.partID) ?? 0) + delta.length)
            }
          }
          break
        }
        case "question.asked": {
          if (opts.capturePending && typeof props.id === "string") {
            finish(() =>
              resolve({
                status: "question",
                text: accumulated,
                question: { requestID: props.id, questions: Array.isArray(props.questions) ? props.questions : [] },
              }),
            )
          }
          break
        }
        case "permission.asked": {
          if (opts.capturePending && typeof props.id === "string") {
            finish(() =>
              resolve({
                status: "permission",
                text: accumulated,
                permission: {
                  requestID: props.id,
                  permission: typeof props.permission === "string" ? props.permission : "unknown",
                  patterns: Array.isArray(props.patterns) ? props.patterns : [],
                  metadata: props.metadata && typeof props.metadata === "object" ? props.metadata : {},
                },
              }),
            )
          }
          break
        }
        case "session.error": {
          const message =
            typeof props.error?.message === "string" ? props.error.message : "mi-opencode reportó un error de sesión"
          finish(() => reject(new BridgeError(message)))
          break
        }
        case "session.idle": {
          finish(() => resolve({ status: "done", text: accumulated }))
          break
        }
        case "session.status": {
          if (props.status?.type === "idle") {
            finish(() => resolve({ status: "done", text: accumulated }))
          }
          break
        }
        default:
          break
      }
    }
  })

  return {
    promise,
    arm: () => {
      armed = true
    },
    cancel: () => {
      finish(() => {})
    },
  }
}

// ---------------------------------------------------------------------------
// Ejecución de un turno
// ---------------------------------------------------------------------------

/**
 * Fase de turno normal: arma el recolector ANTES de disparar prompt_async
 * (para no perder los eventos tempranos del turno) y espera el resultado.
 * Si el agente pregunta (A3), devuelve status "question" y guarda la
 * pregunta en el record (sin abortar el turno: queda pausado en el server).
 */
async function handleTurn(record: SessionRecord, text: string, onDelta: (delta: string) => void): Promise<TurnOutcome> {
  record.emit ??= { partTypes: new Map(), emittedByPart: new Map() }
  const collector = createTurnCollector(record.id, { emitState: record.emit, onDelta, capturePending: true })
  collector.arm()
  try {
    await promptAsync(record.id, text)
    return await collector.promise
  } catch (error) {
    collector.cancel()
    delete record.emit
    if (error instanceof BridgeTimeoutError || error instanceof BridgeError) {
      abortSession(record.id)
    }
    throw error
  }
}

/**
 * Fase de respuesta a una pregunta pendiente (A3): reenvía la respuesta del
 * usuario al request pendiente y espera a que el agente reanude su turno,
 * transmitiendo el texto final. Si durante la reanudación el agente pide un
 * permiso o hace otra pregunta, se devuelve ese estado pendiente para que el
 * caller lo reenvíe al usuario (no se registra historial: el turno sigue
 * incompleto).
 */
async function handleAnswer(
  record: SessionRecord,
  incomingHistory: Array<{ role: string; text: string }>,
  lastText: string,
  onDelta: (delta: string) => void,
): Promise<TurnOutcome> {
  const pending = record.pendingQuestion
  if (!pending) throw new BridgeError("no hay pregunta pendiente para responder")

  record.emit ??= { partTypes: new Map(), emittedByPart: new Map() }
  const collector = createTurnCollector(record.id, { emitState: record.emit, onDelta, capturePending: true })
  collector.arm()
  try {
    await opencodeFetch(`/question/${encodeURIComponent(pending.requestID)}/reply`, {
      method: "POST",
      body: JSON.stringify({ answers: pending.questions.map(() => [lastText]) }),
    })
  } catch (error) {
    collector.cancel()
    delete record.emit
    // La pregunta ya no existe (caducó, se reinició el server, el usuario
    // editó el historial...). Limpiamos el estado y propagamos el error; el
    // caller decide si reintentar como turno normal.
    record.pendingQuestion = undefined
    persistSoon()
    throw error
  }

  record.pendingQuestion = undefined
  persistSoon()

  try {
    const outcome = await collector.promise
    if (outcome.status === "done") {
      record.history = [...incomingHistory, { role: "user", text: lastText }, { role: "assistant", text: outcome.text }]
      delete record.emit
      persistSoon()
    }
    return outcome
  } catch (error) {
    collector.cancel()
    delete record.emit
    if (error instanceof BridgeTimeoutError || error instanceof BridgeError) {
      abortSession(record.id)
    }
    throw error
  }
}

/**
 * Fase de respuesta a una solicitud de permiso pendiente (Fase B1-B3):
 * reenvía la decisión del usuario vía POST /permission/:requestID/reply y
 * espera a que el agente reanude su turno, transmitiendo el texto final.
 */
async function handlePermissionAnswer(
  record: SessionRecord,
  incomingHistory: Array<{ role: string; text: string }>,
  lastText: string,
  onDelta: (delta: string) => void,
): Promise<TurnOutcome> {
  const pending = record.pendingPermission
  if (!pending) throw new BridgeError("no hay solicitud de permiso pendiente para responder")

  record.emit ??= { partTypes: new Map(), emittedByPart: new Map() }
  const collector = createTurnCollector(record.id, { emitState: record.emit, onDelta, capturePending: true })
  collector.arm()
  try {
    const decision = interpretPermissionReply(lastText)
    await opencodeFetch(`/permission/${encodeURIComponent(pending.requestID)}/reply`, {
      method: "POST",
      body: JSON.stringify(decision),
    })
  } catch (error) {
    collector.cancel()
    delete record.emit
    record.pendingPermission = undefined
    persistSoon()
    throw error
  }

  record.pendingPermission = undefined
  persistSoon()

  try {
    const outcome = await collector.promise
    if (outcome.status === "done") {
      record.history = [...incomingHistory, { role: "user", text: lastText }, { role: "assistant", text: outcome.text }]
      delete record.emit
      persistSoon()
    }
    return outcome
  } catch (error) {
    collector.cancel()
    delete record.emit
    if (error instanceof BridgeTimeoutError || error instanceof BridgeError) {
      abortSession(record.id)
    }
    throw error
  }
}

/**
 * Aplica el resultado de un turno: registra historial (si terminó) o guarda
 * y formatea la pregunta/permiso pendiente para reenviarlo al usuario.
 */
function applyOutcome(
  record: SessionRecord,
  outcome: TurnOutcome,
  isAnswerKind: boolean,
  incomingHistory: Array<{ role: string; text: string }>,
  lastText: string,
): { text: string; relay: string } {
  if (outcome.status === "question") {
    record.pendingQuestion = outcome.question
    persistSoon()
    const relay = formatQuestion(outcome.question.questions)
    return { text: `${outcome.text}\n\n${relay}`, relay }
  }
  if (outcome.status === "permission") {
    record.pendingPermission = outcome.permission
    persistSoon()
    const relay = formatPermission(outcome.permission)
    return { text: `${outcome.text}\n\n${relay}`, relay }
  }
  if (!isAnswerKind) {
    recordAssistantTurn(record, incomingHistory, lastText, outcome.text)
  }
  return { text: outcome.text, relay: "" }
}

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString("utf-8")
  return raw ? JSON.parse(raw) : {}
}

function checkAuth(req: IncomingMessage): boolean {
  if (!BRIDGE_API_KEY) return true
  const auth = req.headers["authorization"] ?? ""
  return auth === `Bearer ${BRIDGE_API_KEY}`
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method === "GET" && req.url === "/v1/models") {
      if (!checkAuth(req)) {
        res.writeHead(401, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "unauthorized" }))
        return
      }
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: MODEL_ID, object: "model", created: 0, owned_by: "mi-opencode" }],
        }),
      )
      return
    }

    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      if (!checkAuth(req)) {
        res.writeHead(401, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "unauthorized" }))
        return
      }

      const body = await readJsonBody(req)
      const messages: Array<{ role: string; content: unknown }> = body.messages ?? []
      const wantsStream = Boolean(body.stream)
      const completionId = "chatcmpl-" + randomUUID()

      const resolution = await resolveTurn(messages)

      if (!wantsStream) {
        try {
          let answer: string
          if (resolution.kind === "answer" || resolution.kind === "permission-answer") {
            const outcome =
              resolution.kind === "permission-answer"
                ? await handlePermissionAnswer(resolution.record, resolution.incomingHistory, resolution.lastText, () => {})
                : await handleAnswer(resolution.record, resolution.incomingHistory, resolution.lastText, () => {})
            answer = outcome.text
          } else {
            const outcome = await handleTurn(resolution.record, resolution.text, () => {})
            if (outcome.status === "question") {
              answer = `${outcome.text}\n\n${formatQuestion(outcome.question.questions)}`
              resolution.record.pendingQuestion = outcome.question
              persistSoon()
            } else if (outcome.status === "permission") {
              answer = `${outcome.text}\n\n${formatPermission(outcome.permission)}`
              resolution.record.pendingPermission = outcome.permission
              persistSoon()
            } else {
              answer = outcome.text
              recordAssistantTurn(resolution.record, resolution.incomingHistory, resolution.lastText, answer)
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify(chatCompletionObject(completionId, answer)))
        } catch (error) {
          if (resolution.kind === "turn" && resolution.record.emit) delete resolution.record.emit
          const isTimeout = error instanceof BridgeTimeoutError
          const message = error instanceof Error ? error.message : String(error)
          res.writeHead(isTimeout ? 504 : 500, { "Content-Type": "application/json" })
          res.end(openaiError(isTimeout ? 504 : 500, message, isTimeout ? "bridge_timeout" : "bridge_error"))
        }
        return
      }

      // Streaming token-a-token real: prompt_async + eventos del hub.
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      res.write(sseChunk(completionId, { role: "assistant" }, null))
      let sawContent = false
      const emitDelta = (delta: string) => {
        if (!delta.trim()) return
        sawContent = true
        res.write(sseChunk(completionId, { content: delta }, null))
      }
      try {
        let answer: string
        if (resolution.kind === "answer" || resolution.kind === "permission-answer") {
          const outcome =
            resolution.kind === "permission-answer"
              ? await handlePermissionAnswer(resolution.record, resolution.incomingHistory, resolution.lastText, emitDelta)
              : await handleAnswer(resolution.record, resolution.incomingHistory, resolution.lastText, emitDelta)
          answer = outcome.text
        } else {
          const outcome = await handleTurn(resolution.record, resolution.text, emitDelta)
          if (outcome.status === "question") {
            const questionText = formatQuestion(outcome.question.questions)
            emitDelta(`\n\n${questionText}`)
            answer = `${outcome.text}\n\n${questionText}`
            resolution.record.pendingQuestion = outcome.question
            persistSoon()
          } else if (outcome.status === "permission") {
            // Fase B: reenvío de permission.asked al chat (paridad con las
            // preguntas). El turno termina con la solicitud visible; la
            // siguiente request del usuario es la decisión (aprueba/siempre/no).
            const relay = formatPermission(outcome.permission)
            emitDelta(`\n\n${relay}`)
            answer = `${outcome.text}\n\n${relay}`
            resolution.record.pendingPermission = outcome.permission
            persistSoon()
          } else {
            answer = outcome.text
            recordAssistantTurn(resolution.record, resolution.incomingHistory, resolution.lastText, answer)
          }
        }
        if (!sawContent && answer) {
          // El agente terminó sin emitir deltas (respuesta vacía o por
          // part.updated): mandar el texto completo para no dejar el stream
          // vacío.
          res.write(sseChunk(completionId, { content: answer }, null))
        }
        res.write(sseChunk(completionId, {}, "stop"))
        res.write("data: [DONE]\n\n")
        res.end()
      } catch (error) {
        if (resolution.kind === "turn" && resolution.record.emit) delete resolution.record.emit
        // A4: error REAL visible para el usuario, no un cargador infinito.
        const message = error instanceof Error ? error.message : String(error)
        console.error("[opencode-bridge] error en turno:", message)
        res.write(sseChunk(completionId, { content: `\n\n⚠️ **Error:** ${message}\n` }, null))
        res.write(sseChunk(completionId, {}, "stop"))
        res.write("data: [DONE]\n\n")
        res.end()
      }
      return
    }

    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "not found" }))
  } catch (err) {
    console.error("[opencode-bridge] error:", err)
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        error: { message: err instanceof Error ? err.message : String(err), type: "bridge_error" },
      }),
    )
  }
})

server.listen(BRIDGE_PORT, () => {
  console.log(`[opencode-bridge] escuchando en http://127.0.0.1:${BRIDGE_PORT}`)
  console.log(`[opencode-bridge] -> mi-opencode en ${OPENCODE_BASE_URL}`)
  console.log(`[opencode-bridge] timeout por request: ${REQUEST_TIMEOUT_MS}ms | estado en: ${STATE_FILE}`)
})
