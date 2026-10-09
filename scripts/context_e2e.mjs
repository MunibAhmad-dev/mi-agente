// context_e2e.mjs — FASE 5: Context Manager + memoria + RAG para agentes.
//
// Verifica con ejecución REAL de punta a punta:
//   A) Memorias REALES del usuario creadas vía API (Mongo) — el Context
//      Manager las carga desde la misma base que el dashboard.
//   B) RAG REAL: documentos indexados en el RAGService (Redis + embeddings
//      reales de Ollama nomic-embed-text).
//   C) Sesión multi-agente REAL (MultiAgentController en proceso, mismo
//      código que la ruta HTTP): cada tarea se ejecuta con contexto
//      ensamblado (memoria + RAG + ejecuciones previas) y expone
//      `contextReport` (fuentes, relevancia, dedup, presupuesto de tokens).
//
// La sesión corre en proceso para compartir el singleton del RAGService con
// los documentos indexados (el proceso del API cargó Redis al arrancar).
//
// Ejecutar DENTRO del contenedor LibreChat:
//   node scripts/context_e2e.mjs

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('module-alias').addAliases({ '~': '/app/api' });

const { getRAGService } = require('~/server/services/RAG');
const { multiAgentController } = require('~/server/services/MultiAgentController');
const mongoose = require('mongoose');

const BASE = 'http://localhost:3080';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0';
const MODEL = process.env.CTX_MODEL || 'qwen3:0.6b';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ email: 'f12@test.local', password: 'admin12345' }),
  });
  const json = await res.json();
  if (!json.token) throw new Error('login falló: ' + JSON.stringify(json).slice(0, 200));
  return json.token;
}
const h = (token) => ({ authorization: 'Bearer ' + token, 'user-agent': UA, 'content-type': 'application/json' });
const jpost = async (token, url, body, method = 'POST') =>
  (await fetch(BASE + url, { method, headers: h(token), body: JSON.stringify(body || {}) })).json();

/** Extrae el userId del payload del JWT (campo `id`). */
function userIdFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
    return payload.id || payload.sub;
  } catch {
    return undefined;
  }
}

console.log('═'.repeat(64));
console.log('FASE 5 — CONTEXT MANAGER + MEMORIA + RAG (ejecución real)');
console.log('═'.repeat(64));

const token = await login();
const userId = userIdFromToken(token);
console.log(`\n[0] login OK (userId ${userId})`);

// ─────────────────── A) RAG real: indexar documentos ──────────────────────

const COLLECTION = `e2e_ctx_${Date.now().toString(36)}`;
const PROJECT_DOC = {
  id: 'doc-proyecto',
  content:
    'La plataforma mi-libre-chat usa Node.js con MongoDB y frontend React. ' +
    'La autenticación valida tokens JWT firmados con HMAC-SHA256 con expiración de 24 horas; ' +
    'los roles y permisos se guardan en MongoDB.',
  metadata: { source: 'proyecto', coleccion: COLLECTION },
};
const UNRELATED_DOC = {
  id: 'doc-cocina',
  content: 'Receta de pan casero con harina integral y levadura fresca, horneado a 200 grados durante 40 minutos.',
  metadata: { source: 'cocina', coleccion: COLLECTION },
};

console.log(`\n[1] Indexando 2 documentos en el RAGService (colección ${COLLECTION})…`);
const rag = await getRAGService(); // Promise: inicializa Redis + embeddings Ollama
await rag.indexDocuments(COLLECTION, [PROJECT_DOC, UNRELATED_DOC]);
const ragCheck = await rag.search('autenticación JWT del backend Node', { topK: 4, minSimilarity: 0.1 });
console.log(`    búsqueda de prueba → ${ragCheck.length} resultados (top ${ragCheck[0]?.score?.toFixed(3) || '—'})`);

// Conexión a Mongo para que el Context Manager (getAllUserMemories vía ~/models)
// cargue las memorias reales del usuario desde la misma base que el dashboard.
// `~/db` ejecuta createModels(mongoose) en su require: registra TODOS los
// modelos (incl. Memory) — sin esto getAllUserMemories falla en proceso standalone.
require('~/db');
await mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/LibreChat', {
  serverSelectionTimeoutMS: 15000,
});
console.log('    [db] Mongo conectado + modelos registrados (memorias cargables)');

// ─────────────────── B) Memorias reales vía API (Mongo) ───────────────────

// Nota: el schema de memorias exige claves /^[a-z_]+$/ (sin dígitos).
const MEMORY_KEYS = ['ctx_proyecto', 'ctx_preferencia', 'ctx_duplicada'];
console.log('\n[2] Creando memorias reales del usuario vía API…');
const memProyecto = await jpost(token, '/api/memories', {
  key: MEMORY_KEYS[0],
  value: 'El proyecto es un dashboard de chat con agentes multi-rol; el módulo de seguridad usa JWT en el backend Node.',
});
const memPreferencia = await jpost(token, '/api/memories', {
  key: MEMORY_KEYS[1],
  value: 'El usuario prefiere respuestas concisas, en español y con referencias a fuentes cuando existan.',
});
// Memoria que DUPLICA el contenido del doc RAG → debe deduplicarse.
const memDuplicada = await jpost(token, '/api/memories', {
  key: MEMORY_KEYS[2],
  value: PROJECT_DOC.content,
});
console.log(`    creadas: proyecto=${memProyecto?.created}, preferencia=${memPreferencia?.created}, duplicada=${memDuplicada?.created}`);

// ─────────────────── C) Sesión multi-agente con contexto ──────────────────

console.log('\n[3] Sesión multi-agente REAL (MultiAgentController en proceso)…');
const session = await multiAgentController.createSession({
  userId,
  name: 'E2E F5 contexto',
  description: 'verifica contexto memoria+RAG por agente',
  config: { taskDistribution: 'auto', maxConcurrentAgents: 2, enableCoordinator: true },
});
const sid = session.id;

const agents = [];
for (const [type, name] of [
  ['researcher', 'Researcher'],
  ['coder', 'Coder'],
]) {
  const agent = await multiAgentController.addAgent({
    sessionId: sid,
    type,
    name,
    config: { model: MODEL, temperature: 0.2, maxTokens: 500 },
  });
  agents.push(agent);
}

const descs = [
  'Investiga cómo está implementada la autenticación JWT en el backend Node del proyecto y resume las preferencias del usuario para las respuestas.',
  'Explica en 2 frases cómo validarías los tokens JWT del backend y qué roles guardaría MongoDB, usando solo la información del contexto.',
];
const tasks = [];
for (let i = 0; i < 2; i += 1) {
  const task = await multiAgentController.createTask({
    sessionId: sid,
    title: `Tarea F5 ${i + 1}`,
    description: descs[i],
    priority: 2,
  });
  tasks.push(task);
}

for (const agent of agents) {
  await multiAgentController.startAgent(agent.id);
}

const deadline = Date.now() + 420000;
let done = false;
while (Date.now() < deadline) {
  const state = await multiAgentController.getSession(sid);
  const st = state?.stats;
  if (st && st.completedTasks + st.failedTasks >= tasks.length) {
    done = true;
    break;
  }
  await sleep(4000);
}

const tasksState = await multiAgentController.getSessionTasks(sid);

console.log('\n[4] Reporte de contexto por tarea (contextReport):');
let allReports = true;
let allResults = true;
let budgetOk = true;
for (const t of tasksState) {
  const rep = t.contextReport;
  if (!rep || typeof rep !== 'object' || rep.error) {
    allReports = false;
    console.log(`  • ${t.title} (${t.status}) → SIN contextReport ❌${rep?.error ? ' (' + rep.error + ')' : ''}`);
    continue;
  }
  const sources = rep.sourcesConsidered || {};
  const hasMemory = (sources.memory || 0) > 0;
  const hasRag = (sources.rag || 0) > 0;
  const tokensOk = rep.totalTokens <= rep.budgetTokens;
  budgetOk = budgetOk && tokensOk;
  console.log(`  • ${t.title} (${t.status})`);
  console.log(`      fuentes: memoria=${sources.memory ?? 0}, rag=${sources.rag ?? 0}, ejecución=${sources.execution ?? 0}`);
  console.log(`      incluidos=${rep.included}, dedup eliminados=${rep.dedupRemoved}, descartados=${rep.dropped}`);
  console.log(`      tokens ${rep.totalTokens}/${rep.budgetTokens} ${tokensOk ? '✅' : '❌'} | por fuente: ${JSON.stringify(rep.bySource || {})}`);
  if (!hasMemory || !hasRag) allReports = false;
  if (!t.result || !String(t.result).trim()) allResults = false;
}

console.log('\n[5] Verificaciones:');
console.log(`  sesión completada: ${done ? 'SÍ ✅' : 'NO ❌ (timeout)'}`);
console.log(`  contexto ensamblado (memoria + RAG) en cada tarea: ${allReports ? 'SÍ ✅' : 'NO ❌'}`);
console.log(`  respuestas generadas con contexto (no vacías): ${allResults ? 'SÍ ✅' : 'NO ❌'}`);
console.log(`  presupuesto de tokens respetado: ${budgetOk ? 'SÍ ✅' : 'NO ❌'}`);
const dedupSeen = tasksState.some((t) => t.contextReport?.dedupRemoved > 0);
console.log(`  dedup eliminó contenido duplicado (memoria≈RAG): ${dedupSeen ? 'SÍ ✅' : 'NO ⚠️ (puede variar por embeddings)'}`);

// ─────────────── Limpieza ─────────────────────────────────────────────────

console.log('\n[6] Limpieza…');
for (const key of MEMORY_KEYS) {
  await jpost(token, `/api/memories/${key}`, {}, 'DELETE');
}
await multiAgentController.destroySession(sid);
console.log('    memorias borradas + sesión destruida');

const ok = done && allReports && allResults && budgetOk;
console.log(`\nRESULTADO: ${ok ? 'PASS ✅ — contexto por agente verificado con memoria+RAG reales' : 'FALLO ❌'}`);
if (!ok) process.exit(1);
