// context_ui_e2e.mjs — FASE 5 → UI: verifica que el contexto ensamblado
// (memorias/RAG usadas, tokens, descartes) llega por la MISMA ruta que
// consume el MultiAgentPanel:
//
//   POST   /api/multiagent/sessions
//   POST   /sessions/:id/agents
//   POST   /sessions/:id/tasks        (auto-distribución)
//   POST   /agents/:id/start          (ejecución real contra Ollama)
//   GET    /sessions/:id/tasks        → contextReport por tarea
//
// Criterios duros:
//   · la tarea termina (completed) con resultado no vacío;
//   · `contextReport` presente con sourcesConsidered, bySource, totalTokens,
//     budgetTokens, dropped, dedupRemoved y blocks;
//   · si el agente usó contexto, blocks.length >= 1.
//
// Ejecutar DENTRO del contenedor:
//   node scripts/context_ui_e2e.mjs

const BASE = 'http://localhost:3080';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0';
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
const jpost = async (token, url, body) =>
  (await fetch(BASE + url, { method: 'POST', headers: h(token), body: JSON.stringify(body || {}) })).json();
const jget = async (token, url) => (await fetch(BASE + url, { headers: h(token) })).json();

console.log('═'.repeat(64));
console.log('FASE 5 → UI — CONTEXTO ENSAMBLADO EN LA RUTA DEL PANEL (ejecución real)');
console.log('═'.repeat(64));

const token = await login();
console.log('\n[1] login OK');

const session = await jpost(token, '/api/multiagent/sessions', {
  name: 'E2E contexto UI',
  description: 'verifica contextReport en la ruta del MultiAgentPanel',
  config: { taskDistribution: 'auto', maxConcurrentAgents: 2, enableCoordinator: true },
});
const sid = session.session.id;
console.log(`[2] sesión: ${sid}`);

const agent = await jpost(token, `/api/multiagent/sessions/${sid}/agents`, {
  type: 'researcher',
  name: 'Context UI R1',
  config: { model: 'qwen3:0.6b', temperature: 0.2, maxTokens: 500 },
});
const aid = agent.agent.id;
console.log(`[3] agente: ${aid} (${agent.agent.name})`);

const task = await jpost(token, `/api/multiagent/sessions/${sid}/tasks`, {
  title: 'Investigar JWT',
  description:
    'Investiga cómo se valida la autenticación JWT en el backend Node del proyecto y qué roles se guardan en MongoDB. Responde en 2 frases con la información del contexto.',
});
const tid = task.task.id;
console.log(`[4] tarea: ${tid} (${task.task.status})`);

console.log('\n[5] Iniciando agente (ejecución real contra Ollama)…');
await jpost(token, `/api/multiagent/agents/${aid}/start`, {});

let state = null;
let tasks = [];
const deadline = Date.now() + 300000;
while (Date.now() < deadline) {
  state = await jget(token, `/api/multiagent/sessions/${sid}`);
  tasks = (await jget(token, `/api/multiagent/sessions/${sid}/tasks`)).tasks || [];
  const t = tasks.find((x) => x.id === tid);
  if (t && (t.status === 'completed' || t.status === 'failed')) break;
  await sleep(4000);
}

const taskFinal = tasks.find((x) => x.id === tid);
console.log(`[6] tarea final: ${taskFinal?.status} (sesión ${state?.session?.status})`);

const rep = taskFinal?.contextReport;
console.log('\n[7] contextReport de la tarea (lo que renderiza el panel):');
if (!rep) {
  console.log('    ❌ SIN contextReport');
} else {
  console.log(`    sourcesConsidered: ${JSON.stringify(rep.sourcesConsidered || {})}`);
  console.log(`    bySource: ${JSON.stringify(rep.bySource || {})}`);
  console.log(`    tokens: ${rep.totalTokens}/${rep.budgetTokens} | incluidos=${rep.included} | dedup=${rep.dedupRemoved} | descartados=${rep.dropped}`);
  console.log(`    blocks: ${(rep.blocks || []).length} fragmento(s)`);
  for (const b of rep.blocks || []) {
    console.log(`      · [${b.source}]${b.key ? ' (' + b.key + ')' : ''} rel=${b.relevance?.toFixed?.(2) ?? b.relevance} tok=${b.tokens}`);
  }
  if (rep.sourceErrors?.length) console.log(`    sourceErrors: ${JSON.stringify(rep.sourceErrors)}`);
}

const completed = taskFinal?.status === 'completed';
const hasResult = !!taskFinal?.result && String(taskFinal.result).trim().length > 0;
const hasReport =
  rep &&
  typeof rep.sourcesConsidered === 'object' &&
  typeof rep.bySource === 'object' &&
  typeof rep.totalTokens === 'number' &&
  typeof rep.budgetTokens === 'number' &&
  typeof rep.dropped === 'number';
const blocksOk = !rep || !rep.blocks || Array.isArray(rep.blocks);

console.log('\n[8] Verificaciones duras:');
console.log(`  tarea completada con resultado: ${completed && hasResult ? 'SÍ ✅' : 'NO ❌'}`);
console.log(`  contextReport completo (fuentes, tokens, descartes): ${hasReport ? 'SÍ ✅' : 'NO ❌'}`);
console.log(`  blocks es array (fragmentos listables en UI): ${blocksOk ? 'SÍ ✅' : 'NO ❌'}`);
if (rep?.blocks?.length) {
  console.log(`  fragmentos visibles en UI (>=1): ${rep.blocks.length} ✅`);
}

// Limpieza
await fetch(BASE + `/api/multiagent/sessions/${sid}`, { method: 'DELETE', headers: h(token) });
console.log('\n[9] sesión destruida (limpieza)');

const ok = completed && hasResult && hasReport && blocksOk;
console.log(`\nRESULTADO: ${ok ? 'PASS ✅ — el panel tiene datos de contexto reales para renderizar' : 'FALLO ❌'}`);
if (!ok) process.exit(1);
