// modelrouter_e2e.mjs — FASE 4: Model Router por capacidades.
//
// Verifica con ejecución REAL:
//   A) Los modelos REALES de Ollama (GET /api/tags) se registran en el
//      ModelRegistry del CapabilityOrchestrator.
//   B) Un plan multi-agente se rutea por capacidades (FASE 3): cada agente
//      recibe el mejor modelo local real según su rol.
//   C) Inferencia REAL sobre el modelo elegido del primer agente (chat a
//      Ollama) — no basta con "se eligió", hay que demostrar que funciona.
//
// Ejecutar DENTRO del contenedor LibreChat:
//   node scripts/modelrouter_e2e.mjs

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('module-alias').addAliases({ '~': '/app/api' });

const {
  mapRoleToCapabilities,
  fetchOllamaModels,
  buildModelRegistryFromOllama,
  routePlanToModels,
} = require('~/server/services/AgentArchitect');

const OLLAMA = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

console.log('═'.repeat(64));
console.log('FASE 4 — MODEL ROUTER POR CAPACIDADES (ejecución real)');
console.log('═'.repeat(64));

// ─────────────── A) Modelos reales + registro real ────────────────────────

console.log('\n[1] Fetch de modelos REALES de Ollama…');
const ollamaModels = await fetchOllamaModels({ ollamaBaseUrl: OLLAMA });
console.log(`    ${ollamaModels.length} modelos encontrados:`);
for (const m of ollamaModels) console.log(`      - ${m.name} (${m.details?.parameter_size || m.details?.family || '—'})`);

const registry = buildModelRegistryFromOllama(ollamaModels);
console.log(`\n    Registrados en ModelRegistry: ${registry.listModels().length} (provider ollama, status active)`);

// ─────────────── B) Plan multi-agente → routing por capacidades ───────────

const PLAN_AGENTS = [
  { key: 'coord', name: 'Coordinador', role_description: 'Coordina sub-tareas', instructions: 'Delega tareas a especialistas y junta resultados.' },
  { key: 'researcher', name: 'Researcher', role_description: 'Investiga fuentes', instructions: 'Investiga y busca información actualizada con fuentes y evidencia.' },
  { key: 'coder', name: 'Coder', role_description: 'Implementa código', instructions: 'Implementa el backend en Node, refactoriza el código y llama funciones.' },
  { key: 'reviewer', name: 'Reviewer', role_description: 'Audita y verifica', instructions: 'Revisa seguridad, evalúa la lógica y verifica cada entregable.' },
];

const agents = PLAN_AGENTS.map((a) => ({
  key: a.key,
  name: a.name,
  capabilities: mapRoleToCapabilities({ role: a.role_description, instructions: a.instructions }),
}));

console.log('\n[2] Capacidades por agente (FASE 3):');
for (const a of agents) console.log(`    ${a.key}: ${a.capabilities.join(', ')}`);

const report = routePlanToModels({ agents, registry });

console.log('\n[3] Routing por capacidades:');
for (const a of report.agents) {
  if (a.chosenModel) {
    console.log(`    ${a.key} → ${a.chosenModel.modelId} (match ${a.chosenModel.matchScore.toFixed(2)}, cubre: ${a.chosenModel.matchedCapabilities.join(', ')})`);
    if (a.unmatchedCapabilities.length) {
      console.log(`         sin cobertura: ${a.unmatchedCapabilities.join(', ')}`);
    }
  } else {
    console.log(`    ${a.key} → SIN MODELO (nada cubre: ${a.unmatchedCapabilities.join(', ')})`);
  }
}

console.log('\n    Stats:', JSON.stringify(report.stats));

const routed = report.agents.every((a) => a.chosenModel);
const allLocal = report.stats.allLocal;
console.log(`    todos con modelo real local: ${routed && allLocal ? 'SÍ ✅' : 'NO ❌'}`);

// ─────────────── C) Inferencia REAL en el modelo elegido ──────────────────

console.log('\n[4] Inferencia REAL en el modelo elegido del primer agente…');
const chosen = report.agents[0].chosenModel;
let inferOk = false;
// Ollama carga el modelo en frío (5-10s) y bajo presión de memoria puede
// fallar la primera llamada → reintento con backoff antes de declarar fallo.
for (let attempt = 1; attempt <= 3 && !inferOk; attempt += 1) {
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: chosen.model,
        messages: [{ role: 'user', content: 'Responde solo con la palabra OK.' }],
        stream: false,
        options: { num_predict: 10 },
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (res.ok) {
      const json = await res.json();
      // qwen3 en modo thinking responde en `thinking` con `content` vacío.
      const text = (json.message?.content || json.message?.thinking || '').trim();
      inferOk = text.length > 0;
      console.log(`    ${chosen.modelId} respondió: "${text.slice(0, 60)}" (${res.status}, intento ${attempt})`);
    } else {
      const errBody = (await res.text().catch(() => '')).slice(0, 160);
      console.log(`    intento ${attempt}: ${chosen.modelId} → HTTP ${res.status} ${errBody}`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  } catch (e) {
    console.log(`    intento ${attempt}: error ${e.message.slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, 10000));
  }
}

const ok = routed && allLocal && inferOk;
console.log(`\nRESULTADO: ${ok ? 'PASS ✅ — routing por capacidades verificado con inferencia real en Ollama' : 'FALLO ❌'}`);
if (!ok) process.exit(1);
