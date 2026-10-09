/**
 * Tests E2E de la Fase A del freelancer (11-ago-2026) contra el bridge real,
 * usando un servidor FAKE de mi-opencode (node:http, sin dependencias).
 *
 * Cubre:
 *   T1 streaming normal (regresión)
 *   T2 bloqueante normal (regresión)
 *   T3 pregunta del agente -> relay al chat + respuesta en el siguiente turno (A3)
 *   T4 timeout con error real + abort del turno colgado (A4)
 *   T5 error de sesión traducido a error real (A4)
 *   T6 persistencia del mapa de sesiones entre reinicios del bridge (A2)
 *
 * Uso: node test/fase-a.test.mjs   (Node >= 22.6)
 */

import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const FAKE_PORT = 14096
const BRIDGE_PORT = 18787
const BRIDGE_ROOT = fileURLToPath(new URL("..", import.meta.url))
// En entornos sin node en PATH (p.ej. Git Bash en Windows), pasar NODE_BIN.
let NODE_BIN = process.env.NODE_BIN ?? "node"
if (process.platform === "win32" && NODE_BIN.startsWith("/")) {
  // Convierte rutas MSYS (/c/...) a Windows (C:\...) para spawn().
  NODE_BIN = NODE_BIN.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\")
}

let failures = 0
let passed = 0

function ok(cond, label) {
  if (cond) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failures++
    console.error(`  ❌ ${label}`)
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Servidor fake de mi-opencode
// ---------------------------------------------------------------------------

class FakeOpenCode {
  constructor() {
    this.sessionCount = 0
    this.sessions = new Map() // id -> { questionRequestID, questionAsked }
    this.aborted = []
    this.replies = []
    this.eventClients = new Set()
    this.server = createServer((req, res) => this.handle(req, res))
  }

  listen(port) {
    // Evita que Node cierre conexiones keep-alive inactivas (default 5s)
    // mientras el bridge espera el primer evento de la sesión.
    this.server.keepAliveTimeout = 0
    this.server.headersTimeout = 120_000
    this.server.requestTimeout = 120_000
    return new Promise((resolve) => this.server.listen(port, resolve))
  }

  close() {
    return new Promise((resolve) => this.server.close(resolve))
  }

  emit(type, properties) {
    const data = `data: ${JSON.stringify({ type, properties })}\n\n`
    console.log(`[fake] emit ${type} a ${this.eventClients.size} cliente(s)`)
    for (const client of this.eventClients) {
      client.write(data)
    }
  }

  handle(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${FAKE_PORT}`)
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      const json = () => {
        try {
          return body ? JSON.parse(body) : {}
        } catch {
          return {}
        }
      }
      const match = (pattern) => {
        const m = url.pathname.match(pattern)
        return m ? m[1] : null
      }
      const sid = match(/^\/session\/([^/]+)(?:\/.*)?$/)

      if (req.method === "POST" && url.pathname === "/session") {
        const id = `sess_fake_${++this.sessionCount}`
        this.sessions.set(id, { questionRequestID: null, questionAsked: false })
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ id }))
        return
      }

      if (req.method === "GET" && url.pathname === "/event") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        })
        this.eventClients.add(res)
        console.log(`[fake] /event conectado (total: ${this.eventClients.size})`)
        // NOTA: en Node, req.on("close") del lado servidor se dispara cuando el
        // request se completa (no cuando muere la conexión), así que usaríamos
        // res.on("close") — que sí indica que la conexión se cerró.
        res.on("close", () => {
          this.eventClients.delete(res)
          console.log(`[fake] /event cerrado (total: ${this.eventClients.size})`)
        })
        return
      }

      if (req.method === "POST" && url.pathname.endsWith("/prompt_async") && sid) {
        const { parts } = json()
        const text = (parts ?? []).map((p) => p.text ?? "").join("\n")
        console.log(`[fake] prompt_async en ${sid}: ${JSON.stringify(text.slice(0, 40))}`)
        const record = this.sessions.get(sid)
        this.emit("session.status", { sessionID: sid, status: { type: "busy" } })
        setTimeout(() => {
          if (text.includes("PREGUNTA")) {
            // el agente escribe algo y pregunta
            this.emit("message.part.updated", {
              sessionID: sid,
              part: { id: `part_q_${sid}`, type: "text", text: "Antes de seguir, necesito saber algo:" },
            })
            const requestID = `que_${sid}`
            record.questionRequestID = requestID
            record.questionAsked = true
            this.emit("question.asked", {
              id: requestID,
              sessionID: sid,
              questions: [
                {
                  header: "Aclaración",
                  question: "¿Cuál es tu color favorito?",
                  options: [{ label: "Azul", description: "Como el cielo" }, { label: "Verde", description: "Como el pasto" }],
                },
              ],
              tool: { messageID: "msg_1", callID: "call_1" },
            })
            // el turno queda pausado: NO se emite idle
          } else if (text.includes("TIMEOUT")) {
            // nunca responde: se queda colgado
          } else if (text.includes("ERROR")) {
            this.emit("session.error", {
              sessionID: sid,
              error: { message: "El proveedor LLM devolvió 429 rate_limit", type: "provider_error" },
            })
            this.emit("session.idle", { sessionID: sid })
          } else {
            this.emit("message.part.updated", {
              sessionID: sid,
              part: { id: `part_${sid}`, type: "text", text: `Hola desde opencode (${sid})` },
            })
            this.emit("session.idle", { sessionID: sid })
          }
        }, 50)
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === "POST" && url.pathname.includes("/question/") && url.pathname.endsWith("/reply")) {
        const requestID = match(/^\/question\/([^/]+)\/reply$/)
        this.replies.push({ requestID, answers: json().answers })
        const sessionID = [...this.sessions.entries()].find(([, r]) => r.questionRequestID === requestID)?.[0]
        setTimeout(() => {
          this.emit("message.part.updated", {
            sessionID,
            part: { id: `part_${sessionID}`, type: "text", text: `Perfecto. Tu respuesta fue: ${json().answers?.[0]?.[0] ?? "(vacía)"}` },
          })
          this.emit("session.idle", { sessionID })
        }, 50)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(true))
        return
      }

      if (req.method === "POST" && url.pathname.endsWith("/abort") && sid) {
        this.aborted.push(sid)
        res.writeHead(204)
        res.end()
        return
      }

      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "not found" }))
    })
  }
}

// ---------------------------------------------------------------------------
// Helpers del bridge
// ---------------------------------------------------------------------------

function startBridge(env, stateFile) {
  const bridge = spawn(NODE_BIN, ["--experimental-strip-types", "src/server.ts"], {
    cwd: BRIDGE_ROOT,
    env: { ...process.env, BRIDGE_PORT: String(BRIDGE_PORT), BRIDGE_STATE_FILE: stateFile, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  })
  bridge.stdout.on("data", (d) => process.stdout.write(`[bridge] ${d}`))
  bridge.stderr.on("data", (d) => process.stderr.write(`[bridge] ${d}`))
  return bridge
}

async function waitForBridge(bridge) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/v1/models`)
      if (res.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error("el bridge no arrancó")
}

function chat(messages, stream) {
  return fetch(`http://127.0.0.1:${BRIDGE_PORT}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream }),
  })
}

async function readSSE(res) {
  const text = await res.text()
  const chunks = []
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue
    const payload = line.slice(5).trim()
    if (payload === "[DONE]") continue
    try {
      chunks.push(JSON.parse(payload))
    } catch {}
  }
  return chunks
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const liveBridges = []

function track(bridge) {
  liveBridges.push(bridge)
  return bridge
}

async function killBridges() {
  for (const b of liveBridges) {
    try {
      b.kill("SIGTERM")
    } catch {}
  }
  liveBridges.length = 0
  await sleep(600)
}

async function main() {
  const fake = new FakeOpenCode()
  await fake.listen(FAKE_PORT)
  const stateDir = mkdtempSync(path.join(tmpdir(), "bridge-fase-a-"))

  try {
    // ---- T1: streaming normal (regresión) ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t1.json")))
      await waitForBridge(bridge)
      const res = await chat([{ role: "user", content: "hola" }], true)
      const chunks = await readSSE(res)
      const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? "").join("")
      ok(res.status === 200, "T1 streaming: HTTP 200")
      ok(text.includes("Hola desde opencode"), `T1 streaming: contenido presente (${JSON.stringify(text.slice(0, 60))})`)
      ok(chunks.some((c) => c.choices?.[0]?.finish_reason === "stop"), "T1 streaming: finish_reason stop")
      ok(fake.sessionCount === 1, "T1 streaming: se creó 1 sesión")
      await killBridges()
    }

    // ---- T2: bloqueante normal (regresión) ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t2.json")))
      await waitForBridge(bridge)
      const res = await chat([{ role: "user", content: "hola bloqueante" }], false)
      const data = await res.json()
      ok(res.status === 200, "T2 bloqueante: HTTP 200")
      ok(data.choices?.[0]?.message?.content?.includes("Hola desde opencode"), "T2 bloqueante: contenido presente")
      await killBridges()
    }

    // ---- T3: pregunta del agente -> relay + respuesta (A3) ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t3.json")))
      await waitForBridge(bridge)
      const res1 = await chat([{ role: "user", content: "PREGUNTA que color te gusta" }], true)
      const chunks1 = await readSSE(res1)
      const text1 = chunks1.map((c) => c.choices?.[0]?.delta?.content ?? "").join("")
      ok(text1.includes("Antes de seguir"), "T3: el preámbulo del agente llega")
      ok(text1.includes("color favorito"), "T3: la pregunta llega al chat")
      ok(text1.includes("Azul"), "T3: las opciones llegan al chat")
      ok(chunks1.some((c) => c.choices?.[0]?.finish_reason === "stop"), "T3: el turno termina con stop (no infinito)")

      // el usuario responde en un NUEVO request (mismo historial + respuesta)
      const sessionsBeforeAnswer = fake.sessionCount
      const res2 = await chat(
        [
          { role: "user", content: "PREGUNTA que color te gusta" },
          { role: "assistant", content: text1 },
          { role: "user", content: "Verde" },
        ],
        false,
      )
      const data2 = await res2.json()
      const answerText = data2.choices?.[0]?.message?.content ?? ""
      ok(res2.status === 200, "T3 respuesta: HTTP 200")
      ok(answerText.includes("Perfecto"), `T3 respuesta: respuesta final presente (${JSON.stringify(answerText.slice(0, 80))})`)
      ok(
        fake.replies.length === 1 && fake.replies[0].answers?.[0]?.[0] === "Verde",
        `T3: /question/reply recibió la respuesta del usuario (${JSON.stringify(fake.replies[0])})`,
      )
      ok(fake.sessionCount === sessionsBeforeAnswer, "T3: no se creó sesión nueva para la respuesta")
      await killBridges()
    }

    // ---- T4: timeout con error real + abort (A4) ----
    {
      const bridge = track(
        startBridge(
          {
            OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
            BRIDGE_REQUEST_TIMEOUT_MS: "1500",
          },
          path.join(stateDir, "t4.json"),
        ),
      )
      await waitForBridge(bridge)
      const res = await chat([{ role: "user", content: "TIMEOUT cuelga" }], true)
      const chunks = await readSSE(res)
      const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? "").join("")
      ok(res.status === 200, "T4 streaming: HTTP 200 (SSE iniciado)")
      ok(text.includes("Error") && text.includes("no respondió"), `T4 streaming: error real visible (${JSON.stringify(text.slice(0, 80))})`)
      await sleep(300)
      ok(fake.aborted.length >= 1, `T4: el turno colgado se abortó (${JSON.stringify(fake.aborted)})`)

      // y en modo bloqueante: 504 con error JSON real
      const res2 = await chat([{ role: "user", content: "TIMEOUT cuelga 2" }], false)
      const data2 = await res2.json()
      ok(res2.status === 504, `T4 bloqueante: HTTP 504 (${res2.status})`)
      ok(data2.error?.type === "bridge_timeout", "T4 bloqueante: error tipado bridge_timeout")
      await killBridges()
    }

    // ---- T5: session.error traducido a error real (A4) ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t5.json")))
      await waitForBridge(bridge)
      const res = await chat([{ role: "user", content: "ERROR del proveedor" }], false)
      const data = await res.json()
      ok(res.status === 500, `T5: HTTP 500 (${res.status})`)
      ok(data.error?.message.includes("429"), `T5: mensaje del error del proveedor llega (${JSON.stringify(data.error?.message)})`)
      await killBridges()
    }

    // ---- T6: persistencia del mapa entre reinicios (A2) ----
    {
      const stateFile = path.join(stateDir, "t6.json")
      const env = { OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}`, BRIDGE_STATE_FILE: stateFile }

      const bridge1 = track(startBridge(env))
      await waitForBridge(bridge1)
      const res1 = await chat([{ role: "user", content: "sesion persistente" }], false)
      const data1 = await res1.json()
      const firstSessionID = (data1.choices?.[0]?.message?.content.match(/sess_fake_\d+/) ?? [""])[0]
      ok(!!firstSessionID, `T6: turno 1 creó sesión (${firstSessionID})`)
      await sleep(400) // espera el debounce de persistencia
      bridge1.kill("SIGTERM")
      await sleep(700) // espera el flush + cierre del puerto

      const sessionsBeforeBridge2 = fake.sessionCount
      const bridge2 = track(startBridge(env))
      await waitForBridge(bridge2)
      const res2 = await chat(
        [
          { role: "user", content: "sesion persistente" },
          { role: "assistant", content: data1.choices?.[0]?.message?.content ?? "" },
          { role: "user", content: "segundo mensaje" },
        ],
        false,
      )
      const data2 = await res2.json()
      const secondSessionID = (data2.choices?.[0]?.message?.content.match(/sess_fake_\d+/) ?? [""])[0]
      ok(fake.sessionCount === sessionsBeforeBridge2, `T6: NO se creó sesión nueva tras el reinicio (creadas: ${fake.sessionCount})`)
      ok(secondSessionID === firstSessionID, `T6: se reutilizó la misma sesión (${firstSessionID} == ${secondSessionID})`)
      await killBridges()
    }
  } finally {
    await killBridges()
    await fake.close()
    rmSync(stateDir, { recursive: true, force: true })
  }

  console.log(`\nResultado: ${passed} pasaron, ${failures} fallaron`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("Error fatal:", err)
  process.exit(1)
})
