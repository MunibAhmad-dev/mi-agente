// persist_e2e.mjs — cierre del pendiente del gate de FASE 1:
// persistencia de sesiones/agentes/tareas del MultiAgentController en Mongo.
//
// Verificación REAL de punta a punta en DOS fases (el reinicio del API mata
// el proceso, por eso se ejecuta en dos pasadas):
//
//   FASE A (--phase-a): proceso standalone DENTRO del contenedor.
//     · conecta Mongo real;
//     · crea una sesión con 2 agentes y 2 tareas vía el singleton del
//       controller (misma clase que la ruta HTTP);
//     · completa UNA tarea con un resultado marcador;
//     · deja la otra tarea pendiente;
//     · guarda el sid en /tmp para la fase B. NO destruye la sesión.
//
//   [ el harness reinicia el contenedor LibreChat ]
//
//   FASE B (--phase-b): proceso standalone contra el API REINICIADO.
//     · login con JWT real;
//     · GET /api/multiagent/sessions → la sesión de la fase A existe;
//     · GET /sessions/:sid → 2 agentes, 2 tareas;
//     · GET tasks → la tarea completada conserva el resultado marcador y la
//       pendiente sigue pending;
//     · GET agents → ambos idle (recuperación correcta);
//     · limpieza: DELETE la sesión y verifica que desaparece.
//
// Ejecutar DENTRO del contenedor:
//   node scripts/persist_e2e.mjs --phase-a
//   node scripts/persist_e2e.mjs --phase-b

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('module-alias').addAliases({ '~': '/app/api' });

const PHASE = process.argv.includes('--phase-a') ? 'a' : 'b';
const BASE = 'http://localhost:3080';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0';
const MARKER = 'RESULTADO_PERSISTIDO_FASE1_GATE';
const SID_FILE = '/tmp/persist_sid.txt';

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
const jget = async (token, url) => (await fetch(BASE + url, { headers: h(token) })).json();
const jsend = async (token, url, method, body) =>
  (await fetch(BASE + url, { method, headers: h(token), body: body ? JSON.stringify(body) : undefined })).json();

function userIdFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
    return payload.id || payload.sub;
  } catch {
    return undefined;
  }
}

console.log('═'.repeat(64));
console.log(`FASE 1 GATE — PERSISTENCIA MULTIAGENTE (fase ${PHASE === 'a' ? 'A: crear' : 'B: recuperar tras reinicio'})`);
console.log('═'.repeat(64));

if (PHASE === 'a') {
  const mongoose = require('mongoose');
  // Registra todos los modelos (incl. MultiAgentSession) y conecta a Mongo real.
  require('~/db');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/LibreChat', {
    serverSelectionTimeoutMS: 15000,
  });
  console.log('[A] Mongo conectado');

  const { multiAgentController } = require('~/server/services/MultiAgentController');

  const token = await login();
  const userId = userIdFromToken(token);
  console.log(`[A] login OK (userId ${userId})`);

  // Limpieza previa de sesiones de E2E huérfanas del mismo marcador.
  const existing = await multiAgentController.listSessions(userId);
  for (const s of existing) {
    if (s.name && s.name.startsWith('E2E persist')) {
      await multiAgentController.destroySession(s.id);
      console.log(`[A] limpiada sesión huérfana ${s.id}`);
    }
  }

  const session = await multiAgentController.createSession({
    userId,
    name: 'E2E persist',
    description: 'verifica persistencia tras reinicio',
    config: { taskDistribution: 'manual', maxConcurrentAgents: 2 },
  });
  const sid = session.id;
  console.log(`[A] sesión creada: ${sid} (status ${session.status})`);

  const a1 = await multiAgentController.addAgent({ sessionId: sid, type: 'researcher', name: 'Persist R1' });
  const a2 = await multiAgentController.addAgent({ sessionId: sid, type: 'coder', name: 'Persist C1' });
  console.log(`[A] agentes: ${a1.id}, ${a2.id}`);

  const t1 = await multiAgentController.createTask({
    sessionId: sid,
    title: 'Tarea completada persistente',
    description: 'tarea que se completará antes del reinicio',
  });
  const t2 = await multiAgentController.createTask({
    sessionId: sid,
    title: 'Tarea pendiente',
    description: 'tarea que debe sobrevivir como pending',
  });
  await multiAgentController.assignTask({ taskId: t1.id, agentId: a1.id });
  await multiAgentController.completeTask({ taskId: t1.id, result: MARKER });
  console.log(`[A] tareas: ${t1.id} (completed con marcador), ${t2.id} (pending)`);

  // Verifica que el documento quedó en Mongo con TODO el estado.
  const MultiAgentSession = require('~/models/MultiAgentSession');
  const doc = await MultiAgentSession.findOne({ sid }).lean();
  const ok =
    doc &&
    doc.agents.length === 2 &&
    doc.tasks.length === 2 &&
    doc.tasks.find((t) => t.id === t1.id)?.result === MARKER &&
    doc.tasks.find((t) => t.id === t2.id)?.status === 'pending';
  console.log(`[A] documento en Mongo: agents=${doc?.agents?.length}, tasks=${doc?.tasks?.length}, resultado=${ok ? 'OK ✅' : 'FALLO ❌'}`);

  require('fs').writeFileSync(SID_FILE, sid);
  console.log(`[A] sid guardado en ${SID_FILE}`);
  console.log(`\nFASE A: ${ok ? 'PASS ✅ — sesión persistida en Mongo' : 'FALLO ❌'}`);
  if (!ok) process.exit(1);
} else {
  const fs = require('fs');
  if (!fs.existsSync(SID_FILE)) {
    console.error('FALLO: no existe el sid de la fase A. Ejecuta primero --phase-a.');
    process.exit(1);
  }
  const sid = fs.readFileSync(SID_FILE, 'utf-8').trim();

  const token = await login();
  const userId = userIdFromToken(token);
  console.log(`[B] login OK (userId ${userId}), verificando sid ${sid}`);

  // 1) La sesión aparece tras el reinicio del API (hidratación automática).
  const list = await jget(token, '/api/multiagent/sessions');
  const found = (list.sessions || []).find((s) => s.id === sid);
  console.log(`[B] GET /sessions → sesión recuperada: ${found ? 'SÍ ✅' : 'NO ❌'}`);
  if (!found) {
    console.error('FALLO: la sesión no sobrevivió al reinicio.');
    process.exit(1);
  }

  // 2) Detalle: agentes y tareas.
  const detail = await jget(token, `/api/multiagent/sessions/${sid}`);
  const d = detail.session;
  console.log(`[B] detalle: status=${d.status}, agentes=${d.agentCount}, tareas=${d.taskCount}`);

  // 3) Tareas: la completada conserva el marcador; la pendiente sigue pending.
  const tasks = await jget(token, `/api/multiagent/sessions/${sid}/tasks`);
  const completed = (tasks.tasks || []).find((t) => t.result === MARKER);
  const pending = (tasks.tasks || []).find((t) => t.status === 'pending');
  console.log(`[B] tarea completada con marcador: ${completed ? 'SÍ ✅' : 'NO ❌'}`);
  console.log(`[B] tarea pendiente sobrevivió como pending: ${pending ? 'SÍ ✅' : 'NO ❌'}`);

  // 4) Agentes: ambos idle (recuperación sin zombies).
  const agents = await jget(token, `/api/multiagent/sessions/${sid}/agents`);
  const agentsIdle = (agents.agents || []).length === 2 && (agents.agents || []).every((a) => a.status === 'idle');
  console.log(`[B] agentes idle tras reinicio (${agents.agents?.length}): ${agentsIdle ? 'SÍ ✅' : 'NO ❌'}`);

  // 5) Limpieza: destruir vía API y verificar que desaparece.
  const del = await jsend(token, `/api/multiagent/sessions/${sid}`, 'DELETE', null);
  const after = await jget(token, '/api/multiagent/sessions');
  const gone = !(after.sessions || []).some((s) => s.id === sid);
  console.log(`[B] DELETE /sessions → success=${del.success}, desaparece de Mongo: ${gone ? 'SÍ ✅' : 'NO ❌'}`);

  const ok =
    found && d.agentCount === 2 && d.taskCount === 2 && completed && pending && agentsIdle && gone;
  console.log(`\nFASE B: ${ok ? 'PASS ✅ — la sesión sobrevivió al reinicio del contenedor y se recuperó por HTTP' : 'FALLO ❌'}`);
  if (!ok) process.exit(1);
}
