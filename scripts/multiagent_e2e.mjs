// multiagent_e2e.mjs — FASE 1: verifica el MultiAgentController E2E.
// Crea sesiones con 3 y 5 agentes, los ejecuta con Ollama REAL (qwen3:0.6b),
// verifica creación, comunicación (sendMessage) y finalización (task completed
// con resultado no vacío). Ejecutar DENTRO del contenedor LibreChat.
const BASE = 'http://localhost:3080';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0';
const MODEL = process.env.MA_MODEL || 'qwen3:0.6b';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ email: 'f12@test.local', password: 'admin12345' }),
  });
  const json = await res.json();
  if (!json.token) throw new Error('login falló: ' + JSON.stringify(json));
  return json.token;
}
const h = (token) => ({ authorization: 'Bearer ' + token, 'user-agent': UA, 'content-type': 'application/json' });
const jget = async (token, url) => (await fetch(BASE + url, { headers: h(token) })).json();
const jpost = async (token, url, body) =>
  (await fetch(BASE + url, { method: 'POST', headers: h(token), body: JSON.stringify(body || {}) })).json();

/** Crea sesión con N agentes, lanza N tareas y verifica que todas completen con
 *  ejecución REAL de Ollama. Devuelve el resumen. */
async function runSession(token, n, types) {
  const session = (await jpost(token, '/api/multiagent/sessions', {
    name: `E2E F1 ${n} agentes`,
    description: 'verificación multi-agente con Ollama real',
    config: { taskDistribution: 'auto', maxConcurrentAgents: n, enableCoordinator: true },
  })).session;
  const sid = session.id;

  // Crear agentes
  const agents = [];
  for (let i = 0; i < n; i += 1) {
    const type = types[i % types.length];
    const agent = (await jpost(token, `/api/multiagent/sessions/${sid}/agents`, {
      type,
      name: `${type}-${i + 1}`,
      config: { model: MODEL, temperature: 0.3, maxTokens: 500 },
    })).agent;
    agents.push(agent);
  }

  // Crear tareas (distribución automática → se asignan a agentes IDLE)
  const tasks = [];
  for (let i = 0; i < n; i += 1) {
    const task = (await jpost(token, `/api/multiagent/sessions/${sid}/tasks`, {
      title: `Tarea ${i + 1}`,
      description: `Explica en 2 frases qué harías como ${agents[i].name} para resolver: verifica el estado del sistema y propón una mejora.`,
      priority: 2,
    })).task;
    tasks.push(task);
  }

  // Iniciar todos los agentes → ejecución REAL con Ollama
  for (const agent of agents) {
    await jpost(token, `/api/multiagent/agents/${agent.id}/start`, {});
  }

  // Comunicación entre agentes (verificación del canal de mensajes)
  let message = null;
  if (agents.length >= 2) {
    message = await jpost(token, '/api/multiagent/messages', {
      fromAgentId: agents[0].id,
      toAgentId: agents[1].id,
      content: 'hola colega, ¿cómo va la tarea?',
    });
  }

  // Poll hasta que todas las tareas completen o falle
  const deadline = Date.now() + 300000; // 5 min (CPU)
  let done = false;
  let final = null;
  while (Date.now() < deadline) {
    const state = await jget(token, `/api/multiagent/sessions/${sid}`);
    if (state.session?.stats) {
      const st = state.session.stats;
      if (st.completedTasks + st.failedTasks >= n) {
        done = true;
        final = state.session;
        break;
      }
    }
    await sleep(4000);
  }

  // Estado final de agentes y tareas
  const agentsState = (await jget(token, `/api/multiagent/sessions/${sid}/agents`)).agents || [];
  const tasksState = (await jget(token, `/api/multiagent/sessions/${sid}/tasks`)).tasks || [];

  await jpost(token, `/api/multiagent/sessions/${sid}/pause`, {});
  const destroyed = await jpost(token, `/api/multiagent/sessions/${sid}`, {});
  // DELETE usa method DELETE; reintentar por si el helper POST no aplicó.
  if (!destroyed.success) {
    await fetch(BASE + `/api/multiagent/sessions/${sid}`, { method: 'DELETE', headers: h(token) });
  }

  return {
    n,
    sessionStatus: final?.status || 'sin estado',
    done,
    stats: final?.stats,
    completed: tasksState.filter((t) => t.status === 'completed').length,
    failed: tasksState.filter((t) => t.status === 'failed').length,
    pending: tasksState.filter((t) => t.status !== 'completed' && t.status !== 'failed').length,
    allResultsNonEmpty: tasksState
      .filter((t) => t.status === 'completed')
      .every((t) => typeof t.result === 'string' && t.result.trim().length > 0),
    agentsIdleAfter: agentsState.filter((a) => a.status === 'idle').length,
    messageDelivered: Boolean(message?.message?.id),
    messageStats: message?.message
      ? { from: message.message.fromAgentId, to: message.message.toAgentId }
      : null,
  };
}

async function main() {
  const token = await login();
  console.log('login OK');

  // 3 agentes
  const r3 = await runSession(token, 3, ['coordinator', 'researcher', 'coder']);
  console.log('\n=== SESIÓN 3 AGENTES ===');
  console.log('  finalización completa:', r3.done ? 'SÍ ✅' : 'NO ❌ (timeout)');
  console.log('  tareas completadas:', r3.completed, '| fallidas:', r3.failed, '| pendientes:', r3.pending);
  console.log('  resultados no vacíos:', r3.allResultsNonEmpty ? 'SÍ ✅' : 'NO ❌');
  console.log('  agentes idle tras ejecución:', `${r3.agentsIdleAfter}/${r3.n}`);
  console.log('  mensaje entre agentes:', r3.messageDelivered ? 'entregado ✅' : 'no ❌');

  // 5 agentes
  const r5 = await runSession(token, 5, ['coordinator', 'researcher', 'coder', 'reviewer', 'tester']);
  console.log('\n=== SESIÓN 5 AGENTES ===');
  console.log('  finalización completa:', r5.done ? 'SÍ ✅' : 'NO ❌ (timeout)');
  console.log('  tareas completadas:', r5.completed, '| fallidas:', r5.failed, '| pendientes:', r5.pending);
  console.log('  resultados no vacíos:', r5.allResultsNonEmpty ? 'SÍ ✅' : 'NO ❌');
  console.log('  agentes idle tras ejecución:', `${r5.agentsIdleAfter}/${r5.n}`);
  console.log('  mensaje entre agentes:', r5.messageDelivered ? 'entregado ✅' : 'no ❌');

  const ok3 = r3.done && r3.completed === 3 && r3.allResultsNonEmpty && r3.agentsIdleAfter >= 3 && r3.messageDelivered;
  const ok5 = r5.done && r5.completed === 5 && r5.allResultsNonEmpty && r5.agentsIdleAfter >= 5 && r5.messageDelivered;
  console.log('\nRESULTADO:');
  console.log('  3 agentes →', ok3 ? 'PASS ✅' : 'FALLO ❌', JSON.stringify(r3.stats || {}));
  console.log('  5 agentes →', ok5 ? 'PASS ✅' : 'FALLO ❌', JSON.stringify(r5.stats || {}));
  if (!(ok3 && ok5)) process.exit(1);
  console.log('\n✅ MULTI-AGENTE E2E VERIFICADO CON EJECUCIÓN REAL (Ollama)');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
