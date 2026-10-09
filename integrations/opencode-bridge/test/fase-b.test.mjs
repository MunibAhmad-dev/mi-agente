/**
 * Tests E2E de la Fase B del freelancer (11-ago-2026) contra el bridge real,
 * usando un servidor FAKE de mi-opencode (node:http, sin dependencias).
 *
 * Cubre:
 *   T1 relay de permission.asked -> el turno termina con el permiso visible (B1-B3)
 *   T2 respuesta "aprueba" -> POST /permission/:id/reply {reply:"once"} + texto final (B4)
 *   T3 respuesta "siempre" -> {reply:"always"}
 *   T4 respuesta "no" -> {reply:"reject"}
 *   T5 chat normal (regresión, sin permiso involucrado)
 *
 * Uso: node test/fase-b.test.mjs   (Node >= 22.6)
 */

import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const FAKE_PORT = 14196
const BRIDGE_PORT = 18887
const BRIDGE_ROOT = fileURLToPath(new URL("..", import.meta.url))
let NODE_BIN = process.env.NODE_BIN ?? "node"
if (process.platform === "win32" && NODE_BIN.startsWith("/")) {
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
    this.sessions = new Map() // id -> { permissionRequestID }
    this.permissionReplies = []
    this.eventClients = new Set()
    this.turnCount = new Map() // id -> número de turno (part ids únicos)
    this.server = createServer((req, res) => this.handle(req, res))
  }

  listen(port) {
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
        this.sessions.set(id, { permissionRequestID: null })
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
        res.on("close", () => this.eventClients.delete(res))
        return
      }

      if (req.method === "POST" && url.pathname.endsWith("/prompt_async") && sid) {
        const { parts } = json()
        const text = (parts ?? []).map((p) => p.text ?? "").join("\n")
        const record = this.sessions.get(sid)
        const turn = (this.turnCount.get(sid) ?? 0) + 1
        this.turnCount.set(sid, turn)
        this.emit("session.status", { sessionID: sid, status: { type: "busy" } })
        setTimeout(() => {
          if (text.includes("PERMISO_SANDBOX")) {
            this.emit("message.part.updated", {
              sessionID: sid,
              part: { id: `part_${sid}_t${turn}`, type: "text", text: "Quiero ejecutar un comando en el sandbox:" },
            })
            const requestID = `per_${sid}`
            record.permissionRequestID = requestID
            this.emit("permission.asked", {
              id: requestID,
              sessionID: sid,
              permission: "sandbox",
              patterns: ["npm install"],
              metadata: { command: "npm install", image: "alpine" },
              always: ["*"],
            })
            // el turno queda pausado esperando la decisión: NO se emite idle
          } else if (text.includes("PERMISO_BROWSER")) {
            const requestID = `per_${sid}`
            record.permissionRequestID = requestID
            this.emit("permission.asked", {
              id: requestID,
              sessionID: sid,
              permission: "browser",
              patterns: ["navigate"],
              metadata: { action: "navigate", url: "https://example.com" },
              always: ["*"],
            })
          } else if (text.includes("PERMISO_CRON")) {
            const requestID = `per_${sid}`
            record.permissionRequestID = requestID
            this.emit("permission.asked", {
              id: requestID,
              sessionID: sid,
              permission: "cron",
              patterns: ["create:backup"],
              metadata: { action: "create", name: "backup", schedule: "0 3 * * *" },
              always: ["*"],
            })
          } else {
            this.emit("message.part.updated", {
              sessionID: sid,
              part: { id: `part_${sid}_t${turn}`, type: "text", text: `Sin permisos requeridos (${sid})` },
            })
            this.emit("session.idle", { sessionID: sid })
          }
        }, 50)
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === "POST" && url.pathname.includes("/permission/") && url.pathname.endsWith("/reply")) {
        const requestID = match(/^\/permission\/([^/]+)\/reply$/)
        this.permissionReplies.push({ requestID, ...json() })
        const sessionID = [...this.sessions.entries()].find(([, r]) => r.permissionRequestID === requestID)?.[0]
        setTimeout(() => {
          const turn = this.turnCount.get(sessionID) ?? 1
          this.emit("message.part.updated", {
            sessionID,
            part: { id: `part_${sessionID}_t${turn + 1}`, type: "text", text: `Ejecutado con decisión: ${json().reply}` },
          })
          this.emit("session.idle", { sessionID })
        }, 50)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(true))
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
  const stateDir = mkdtempSync(path.join(tmpdir(), "bridge-fase-b-"))

  try {
    // ---- T1: permission.asked -> relay al chat, turno termina (B1-B3) ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t1.json")))
      await waitForBridge(bridge)
      const res = await chat([{ role: "user", content: "PERMISO_SANDBOX ejecuta npm install" }], true)
      const chunks = await readSSE(res)
      const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? "").join("")
      ok(res.status === 200, "T1: HTTP 200 (SSE iniciado)")
      ok(text.includes("Quiero ejecutar un comando"), "T1: el preámbulo del agente llega")
      ok(text.includes("🔐"), "T1: la solicitud de permiso llega al chat")
      ok(text.includes("sandbox"), "T1: el tipo de permiso aparece")
      ok(text.includes("npm install"), "T1: el patrón/acción aparece")
      ok(chunks.some((c) => c.choices?.[0]?.finish_reason === "stop"), "T1: el turno termina con stop (no infinito)")
      await killBridges()
    }

    // ---- T2: "aprueba" -> {reply:"once"} + texto final (B4) ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t2.json")))
      await waitForBridge(bridge)
      const res1 = await chat([{ role: "user", content: "PERMISO_SANDBOX ejecuta npm install" }], true)
      const text1 = (await readSSE(res1)).map((c) => c.choices?.[0]?.delta?.content ?? "").join("")

      const sessionsBefore = fake.sessionCount
      const res2 = await chat(
        [
          { role: "user", content: "PERMISO_SANDBOX ejecuta npm install" },
          { role: "assistant", content: text1 },
          { role: "user", content: "aprueba" },
        ],
        false,
      )
      const data2 = await res2.json()
      ok(res2.status === 200, "T2: HTTP 200")
      ok(data2.choices?.[0]?.message?.content?.includes("Ejecutado con decisión"), "T2: texto final del agente llega")
      ok(
        fake.permissionReplies.length === 1 && fake.permissionReplies[0].reply === "once",
        `T2: /permission/reply recibió {reply:"once"} (${JSON.stringify(fake.permissionReplies[0])})`,
      )
      ok(fake.sessionCount === sessionsBefore, "T2: no se creó sesión nueva para responder al permiso")
      await killBridges()
    }

    // ---- T3: "siempre" -> {reply:"always"} ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t3.json")))
      await waitForBridge(bridge)
      const res1 = await chat([{ role: "user", content: "PERMISO_BROWSER navega" }], true)
      const text1 = (await readSSE(res1)).map((c) => c.choices?.[0]?.delta?.content ?? "").join("")
      ok(text1.includes("browser"), "T3: permiso browser llega al chat")

      const res2 = await chat(
        [
          { role: "user", content: "PERMISO_BROWSER navega" },
          { role: "assistant", content: text1 },
          { role: "user", content: "siempre" },
        ],
        false,
      )
      const data2 = await res2.json()
      ok(res2.status === 200, "T3: HTTP 200")
      ok(data2.choices?.[0]?.message?.content?.includes("always"), "T3: texto final confirma la decisión always")
      ok(
        fake.permissionReplies.some((r) => r.reply === "always"),
        `T3: /permission/reply recibió {reply:"always"} (${JSON.stringify(fake.permissionReplies)})`,
      )
      await killBridges()
    }

    // ---- T4: "no" -> {reply:"reject"} ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t4.json")))
      await waitForBridge(bridge)
      const res1 = await chat([{ role: "user", content: "PERMISO_CRON crea el job" }], true)
      const text1 = (await readSSE(res1)).map((c) => c.choices?.[0]?.delta?.content ?? "").join("")
      ok(text1.includes("cron"), "T4: permiso cron llega al chat")

      const res2 = await chat(
        [
          { role: "user", content: "PERMISO_CRON crea el job" },
          { role: "assistant", content: text1 },
          { role: "user", content: "no" },
        ],
        false,
      )
      const data2 = await res2.json()
      ok(res2.status === 200, "T4: HTTP 200")
      ok(
        fake.permissionReplies.some((r) => r.reply === "reject"),
        `T4: /permission/reply recibió {reply:"reject"} (${JSON.stringify(fake.permissionReplies)})`,
      )
      ok(data2.choices?.[0]?.message?.content?.includes("reject"), "T4: texto final refleja el rechazo")
      await killBridges()
    }

    // ---- T5: chat normal sin permiso (regresión) ----
    {
      const bridge = track(startBridge({ OPENCODE_BASE_URL: `http://127.0.0.1:${FAKE_PORT}` }, path.join(stateDir, "t5.json")))
      await waitForBridge(bridge)
      const res = await chat([{ role: "user", content: "hola" }], false)
      const data = await res.json()
      ok(res.status === 200, "T5: HTTP 200")
      ok(data.choices?.[0]?.message?.content?.includes("Sin permisos requeridos"), "T5: respuesta normal sin relay")
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
