// research_e2e.mjs — FASE 6: Deep Research para agentes.
//
// Verifica con ejecución REAL de punta a punta:
//   A) Motor en proceso: descompone una pregunta real en sub-búsquedas,
//      recolecta fuentes con el UniversalSearchService REAL (SearchRuntime
//      DuckDuckGo→Bing), verifica factualmente y redacta respuesta con
//      citas [n] (LLM local Ollama).
//   B) Ruta HTTP: POST /api/agents/architect/research con JWT — el mismo
//      endpoint que consumirá la UI/agentes.
//
// Criterios duros:
//   · subQueries >= 1
//   · fuentes reales >= 3 (la web pública suele devolver más)
//   · citas [n] presentes en la respuesta Y numeradas contra fuentes reales
//   · verificación por sub-consulta con veredicto honesto
//   · la ruta HTTP devuelve 200 con el mismo shape
//
// Ejecutar DENTRO del contenedor LibreChat:
//   node scripts/research_e2e.mjs

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const BASE = 'http://localhost:3080';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0';

// El motor usa el alias `~` de forma transitiva (UniversalSearchService →
// SearchRuntime): registra el alias igual que el arranque de la app.
require('module-alias').addAliases({ '~': '/app/api' });

const {
  deepResearch,
  decomposeQuestion,
} = require('/app/api/server/services/AgentArchitect/deepResearch');

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

console.log('═'.repeat(64));
console.log('FASE 6 — DEEP RESEARCH (ejecución real)');
console.log('═'.repeat(64));

const QUESTION =
  '¿Qué es Ollama y cómo funciona con modelos locales de LLM?';

console.log(`\n[1] Descomposición de la pregunta:\n    "${QUESTION}"`);
const subQueries = decomposeQuestion(QUESTION, 4);
console.log(`    → ${subQueries.length} sub-búsqueda(s):`);
for (const s of subQueries) console.log(`      · ${s}`);

console.log('\n[2] Investigación REAL (motor universal + verificación + síntesis LLM)…');
console.log('    (puede tardar 30–120s: búsqueda web + verificación + Ollama)');
const report = await deepResearch(QUESTION, {
  maxSubQueries: 4,
  maxSources: 8,
  maxEvidence: 5,
});

if (!report.success) {
  console.error('FALLO: ' + report.error);
  process.exit(1);
}

console.log(`\n[3] Fuentes recolectadas (${report.sources.length}, raw ${report.stats.rawResults}):`);
for (const s of report.sources) {
  console.log(
    `  [${s.index}] ${s.title.slice(0, 70)} — ${s.domain || s.source} (autoridad ${s.authority}, relevancia ${s.relevance})`,
  );
}

console.log(`\n[4] Verificación por sub-consulta:`);
for (const v of report.verification) {
  console.log(
    `  · "${v.subQuery.slice(0, 50)}" → ${v.verdict} (confianza ${v.confidence}, apoyo independiente ${v.independentSupportingSources})`,
  );
}

console.log('\n[5] Respuesta final con citas:\n');
console.log(report.answer.slice(0, 900));

// ─────────────────── Verificaciones duras ─────────────────────────────────

const cited = [...report.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
const validCitations = cited.filter((n) => report.sources.some((s) => s.index === n));
const hasSubQueries = report.subQueries.length >= 1;
const hasSources = report.sources.length >= 3;
const hasCitations = cited.length >= 1;
const allCitationsReal = cited.length === validCitations.length;
const hasVerification = report.verification.length >= 1;

console.log('\n[6] Verificaciones duras:');
console.log(`  sub-búsquedas generadas: ${report.subQueries.length} ${hasSubQueries ? '✅' : '❌'}`);
console.log(`  fuentes reales >= 3: ${report.sources.length} ${hasSources ? '✅' : '❌'}`);
console.log(`  citas [n] en la respuesta: ${cited.length} ${hasCitations ? '✅' : '❌'}`);
console.log(`  toda cita [n] existe en fuentes: ${allCitationsReal ? 'SÍ ✅' : 'NO ❌ (' + JSON.stringify(cited) + ')'}`);
console.log(`  verificación factual por sub-consulta: ${report.verification.length} ${hasVerification ? '✅' : '❌'}`);

// ─────────────────── B) Ruta HTTP real ────────────────────────────────────

console.log('\n[7] Ruta HTTP POST /api/agents/architect/research (JWT real)…');
const token = await login();
const httpRes = await fetch(BASE + '/api/agents/architect/research', {
  method: 'POST',
  headers: h(token),
  body: JSON.stringify({ question: QUESTION, maxSources: 5 }),
});
const httpBody = await httpRes.json();
const httpOk = httpRes.status === 200 && httpBody.success === true && Array.isArray(httpBody.sources);
console.log(`    status ${httpRes.status}, success=${httpBody.success}, fuentes=${httpBody.sources?.length ?? 0} ${httpOk ? '✅' : '❌'}`);
if (httpOk) {
  const httpCited = [...String(httpBody.answer || '').matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const httpAllReal = httpCited.every((n) => httpBody.sources.some((s) => s.index === n));
  console.log(`    citas HTTP [n] reales: ${httpAllReal ? 'SÍ ✅' : 'NO ❌'}`);
}

const ok = hasSubQueries && hasSources && hasCitations && allCitationsReal && hasVerification && httpOk;
console.log(`\nRESULTADO: ${ok ? 'PASS ✅ — deep research con fuentes reales, verificación y citas [n] válidas' : 'FALLO ❌'}`);
if (!ok) process.exit(1);
