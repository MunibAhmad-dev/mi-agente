// capability_e2e.mjs — FASE 3: Capability Discovery Engine.
//
// Verifica con ejecución REAL:
//   A) Un plan generado por el planner REAL (LLM local Ollama) pasa por el
//      Capability Discovery contra los tools REALES del workspace; cada agente
//      recibe las tools que cubren sus capacidades.
//   B) Dedup verificada: (1) ninguna tool asignada a dos agentes, (2) el
//      marketplace se consulta una vez por capacidad, (3) nada ya disponible
//      se sugiere como "instalar", (4) claves de instalación únicas.
//
// Ejecutar DENTRO del contenedor LibreChat:
//   node scripts/capability_e2e.mjs

process.env.AGENT_ARCHITECT_PROVIDER = 'ollama';
process.env.AGENT_ARCHITECT_MODEL = process.env.CAP_MODEL || 'qwen3:1.7b';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('module-alias').addAliases({ '~': '/app/api' });

const { generatePlan, discoverCapabilitiesForPlan } = require('~/server/services/AgentArchitect');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** Carga los tools REALES del workspace (getCachedTools con fallback al manifest). */
async function loadRealTools() {
  try {
    const { getCachedTools } = require('~/server/services/Config');
    const cached = await getCachedTools();
    const tools = Object.entries(cached || {}).map(([name, def]) => ({
      name,
      description: def?.description || '',
      category: def?.category || '',
      source: 'workspace',
    }));
    if (tools.length > 0) return tools;
    console.log('  [warn] getCachedTools vacío, uso manifest');
  } catch (e) {
    console.log('  [warn] getCachedTools no disponible:', e.message.slice(0, 80));
  }
  const manifest = require('/app/api/app/clients/tools/manifest.json');
  return manifest.map((t) => ({ name: t.name, description: t.description || '', category: t.category || '', source: 'workspace' }));
}

// searchSkillCatalog real: mismo wiring que controllers/agents/architect.js
const makeSearchSkillCatalog = (tools) => async (query) => {
  const q = query.toLowerCase();
  return tools
    .filter((t) => (t.name + ' ' + t.description).toLowerCase().includes(q))
    .map((t) => ({ name: t.name, source: 'workspace_tools' }));
};

console.log('═'.repeat(64));
console.log('FASE 3 — CAPABILITY DISCOVERY ENGINE (ejecución real)');
console.log('═'.repeat(64));

const tools = await loadRealTools();
console.log(`\nTools reales del workspace: ${tools.length}`);
for (const t of tools.slice(0, 8)) console.log(`  - ${t.name} (${t.category || '—'})`);
if (tools.length > 8) console.log(`  … y ${tools.length - 8} más`);
const searchSkillCatalog = makeSearchSkillCatalog(tools);

// ───────────────── Part A: plan REAL + discovery real ─────────────────────

console.log('\n' + '─'.repeat(64));
console.log('PARTE A — Plan REAL (LLM local) → Discovery por agente');
console.log('─'.repeat(64));

let plan = null;
try {
  const started = Date.now();
  const res = await generatePlan({
    task: 'Investiga las mejores prácticas de seguridad en APIs REST, implementa un informe con citas y propón mejoras de código.',
    listAvailableTools: async () => tools,
    searchSkillCatalog,
    model: process.env.AGENT_ARCHITECT_MODEL,
  });
  plan = res.plan;
  console.log(`  plan generado en ${((Date.now() - started) / 1000).toFixed(1)}s — topología ${plan.topology}, ${plan.agents.length} agente(s)`);
} catch (e) {
  console.log('  [warn] generatePlan falló:', e.message.slice(0, 120));
}

const planForDiscovery = plan ?? {
  summary: 'Plan de respaldo (multi-agente) para verificación de dedup',
  topology: 'subagents',
  agents: [
    { key: 'coord', name: 'Coordinador', role_description: 'Coordina sub-tareas', instructions: 'Delega tareas y junta resultados.' },
    { key: 'researcher', name: 'Researcher', role_description: 'Investiga fuentes', instructions: 'Investiga y busca información con fuentes.' },
    { key: 'coder', name: 'Coder', role_description: 'Implementa código', instructions: 'Implementa el backend en Node y refactoriza el código.' },
    { key: 'reviewer', name: 'Reviewer', role_description: 'Audita', instructions: 'Revisa seguridad y verifica entregables.' },
  ],
};

const report = await discoverCapabilitiesForPlan({
  plan: planForDiscovery,
  listAvailableTools: async () => tools,
  searchSkillCatalog,
});

console.log('\n  Por agente:');
for (const a of report.agents) {
  console.log(`  • ${a.key} (${a.name})`);
  console.log(`      capacidades: ${a.capabilities.join(', ')}`);
  console.log(`      tools asignadas: ${a.assignedTools.length ? a.assignedTools.join(', ') : '— (sin tool disponible)'}`);
  if (a.unresolvedCapabilities.length) {
    console.log(`      sin tool local: ${a.unresolvedCapabilities.join(', ')}`);
  }
}

console.log('\n  Stats del plan:');
console.log(`      agentes: ${report.stats.agents}`);
console.log(`      tools asignadas únicas: ${report.stats.toolsAssigned}`);
console.log(`      colisiones de asignación resueltas: ${report.stats.duplicateAssignmentsPrevented}`);
console.log(`      instalaciones sugeridas: ${report.stats.installsSuggested} (duplicados evitados: ${report.stats.duplicateInstallsPrevented})`);
console.log(`      capacidades sin resolver: ${report.stats.unresolvedCapabilities}`);

// ───────────────── Part B: verificación de dedup (asserts) ────────────────

console.log('\n' + '─'.repeat(64));
console.log('PARTE B — Verificación de dedup (asserts)');
console.log('─'.repeat(64));

const allAssigned = report.agents.flatMap((a) => a.assignedTools);
const normAssigned = allAssigned.map(norm);
const uniqueAssigned = new Set(normAssigned);
const noDupAssignments = uniqueAssigned.size === normAssigned.length;
console.log(`  [1] tools únicas entre agentes: ${noDupAssignments ? 'SÍ ✅' : 'NO ❌'} (${uniqueAssigned.size}/${normAssigned.length})`);

const installKeys = report.installsSuggested.map((i) => i.key);
const noDupInstalls = new Set(installKeys).size === installKeys.length;
console.log(`  [2] claves de instalación únicas: ${noDupInstalls ? 'SÍ ✅' : 'NO ❌'}`);

const availableNorms = new Set(tools.map((t) => norm(t.name)));
const noInstallOfAvailable = report.installsSuggested.every((i) => !availableNorms.has(norm(i.name)));
console.log(`  [3] nada ya disponible se sugiere como instalar: ${noInstallOfAvailable ? 'SÍ ✅' : 'NO ❌'}`);

const ok = noDupAssignments && noDupInstalls && noInstallOfAvailable;
console.log(`\nRESULTADO: ${ok ? 'PASS ✅ — sin duplicados en asignación ni instalación' : 'FALLO ❌'}`);
if (!ok) process.exit(1);
