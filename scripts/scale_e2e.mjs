// scale_e2e.mjs — FASE 2: escalado dinámico del planner.
//
// Verifica con ejecución REAL:
//   A) Una tarea que CRECE en complejidad en tiempo real: se van añadiendo
//      sub-tareas al enunciado y el analizador determinista (código real de
//      producción) reclasifica el tier y sube el rango de agentes
//      simple(1-3) → medium(4-5) → complex(6-14) → extremely_complex(15-20).
//   B) El pipeline COMPLETO del planner con un LLM REAL local (Ollama):
//      generatePlan → toolCallLoop → createMessage(Ollama) → plan válido
//      + metadata de complejidad.
//
// Ejecutar DENTRO del contenedor LibreChat:
//   node scripts/scale_e2e.mjs
//
// Requiere AGENT_ARCHITECT_PROVIDER=ollama en el proceso (se fuerza aquí
// antes de requerir los módulos para no depender del env del contenedor).

process.env.AGENT_ARCHITECT_PROVIDER = 'ollama';
process.env.AGENT_ARCHITECT_MODEL = process.env.SCALE_MODEL || 'qwen3:1.7b';

const { analyzeComplexity, buildTierGuidance, generatePlan } = await import(
  '/app/api/server/services/AgentArchitect/index.js'
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIER_ORDER = { simple: 0, medium: 1, complex: 2, extremely_complex: 3 };

// ───────────────────────── Parte A: crecimiento en tiempo real ────────────

const PARTS = [
  'Resume este documento en 3 frases.',
  'Resume este documento en 3 frases y traduce el resumen al inglés.',
  'Investiga las mejores prácticas de seguridad en APIs REST y escribe un informe con citas de fuentes oficiales y ejemplos de código en Python.',
  'Investiga las mejores prácticas de seguridad en APIs REST y escribe un informe detallado con citas de fuentes oficiales, ejemplos de código en Python y una sección de pruebas de vulnerabilidades.',
  'Construye una plataforma web completa:',
  '1. Diseña la interfaz con React, CSS y componentes accesibles.',
  '2. Implementa el backend en Node con MongoDB, caché y colas de tareas.',
  '3. Añade autenticación, permisos por rol y auditoría de seguridad.',
  '4. Crea pruebas unitarias y E2E con cobertura superior al 80%.',
  '5. Despliega el sistema en Docker con un contenedor por servicio y Kubernetes para escalar.',
  '6. Documenta la arquitectura, la API y un manual de usuario.',
  '7. Integra un modelo de IA (LLM local) para recomendaciones y resúmenes.',
  '8. Genera imágenes con ComfyUI, videos cortos de animación y audio TTS con voz local.',
  '9. Investiga fuentes oficiales y cita la evidencia en el informe final.',
  '10. Verifica la regresión de todos los módulos y optimiza el consumo de RAM y CPU.',
  'No sé por dónde empezar: ayúdame a decidir el orden de los módulos, coordina varios equipos, gestiona el presupuesto de contexto y valida cada entregable contra los requisitos antes de terminar.',
];

console.log('═'.repeat(64));
console.log('PARTE A — TAREA QUE CRECE EN COMPLEJIDAD EN TIEMPO REAL');
console.log('═'.repeat(64));
console.log('  #  | tier               | rango agentes | score | señal dominante');
console.log('-----+--------------------+---------------+-------+------------------');

let lastIdx = -1;
let scalingOk = true;
for (let i = 0; i < PARTS.length; i += 1) {
  const task = PARTS.slice(0, i + 1).join('\n');
  const c = analyzeComplexity(task);
  const idx = TIER_ORDER[c.tier];
  if (idx < lastIdx) scalingOk = false; // nunca debe bajar de tier al crecer
  lastIdx = idx;
  console.log(
    `${String(i + 1).padStart(4)} | ${c.tier.padEnd(18)} | ${String(c.range.min).padStart(2)}–${String(c.range.max).padEnd(12)} | ${String(c.score).padStart(5)} | ${c.reasons[c.reasons.length - 1] || ''}`,
  );
}

const first = analyzeComplexity(PARTS[0]);
const last = analyzeComplexity(PARTS.join('\n'));
console.log('\nResultado A:');
console.log(`  inicial:    ${first.tier} → rango ${first.range.min}–${first.range.max}`);
console.log(`  final:      ${last.tier} → rango ${last.range.min}–${last.range.max}`);
const aOk =
  first.tier === 'simple' && last.tier === 'extremely_complex' && scalingOk && last.range.max === 20;
console.log(`  escalado monótono no-decreciente: ${scalingOk ? 'SÍ ✅' : 'NO ❌'}`);
console.log(`  A → ${aOk ? 'PASS ✅' : 'FALLO ❌'}`);
console.log('\nGuía que se inyectaría al modelo (tier final):\n' + buildTierGuidance(last));

// ───────────────────────── Parte B: pipeline real con Ollama ──────────────

console.log('\n' + '═'.repeat(64));
console.log('PARTE B — generatePlan REAL con LLM local (Ollama)');
console.log('═'.repeat(64));

const listAvailableTools = async () => [
  { name: 'web_search', description: 'Busca información en internet', category: 'search' },
  { name: 'knowledge_engine', description: 'Verifica hechos con fuentes', category: 'search' },
];

let bOk = false;
try {
  const started = Date.now();
  const { plan, complexity, transcriptTurns } = await generatePlan({
    task: 'Resume este documento en 3 frases y propón una mejora.',
    listAvailableTools,
    model: process.env.AGENT_ARCHITECT_MODEL,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`  modelo:            ${process.env.AGENT_ARCHITECT_MODEL}`);
  console.log(`  turns (LLM↔tools): ${transcriptTurns}`);
  console.log(`  tiempo:            ${elapsed}s`);
  console.log(`  topología:         ${plan.topology}`);
  console.log(`  agentes:           ${plan.agents.length}`);
  for (const a of plan.agents) {
    console.log(`    - ${a.key}: ${a.name} [tools: ${(a.tools || []).join(', ') || '—'}]`);
  }
  console.log(`  complexity:        ${complexity.tier} (score ${complexity.score}) rango ${complexity.range.min}–${complexity.range.max}`);
  bOk =
    plan.agents.length >= 1 &&
    plan.agents.length <= 20 &&
    ['single', 'chain', 'handoff', 'subagents'].includes(plan.topology) &&
    complexity.tier === 'simple';
  console.log(`  B → ${bOk ? 'PASS ✅' : 'FALLO ❌'}`);
} catch (err) {
  console.error('  B → ERROR ❌:', err.message);
}

if (!aOk || !bOk) {
  console.error('\n❌ E2E ESCALADO FALLÓ');
  process.exit(1);
}
console.log('\n✅ E2E ESCALADO DINÁMICO VERIFICADO (analizador real + LLM real)');
