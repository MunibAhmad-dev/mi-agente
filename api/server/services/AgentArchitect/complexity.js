/**
 * complexity.js — Analizador determinista de complejidad de tareas para el
 * Agent Architect (FASE 2: escalado dinámico del planner).
 *
 * Clasifica una tarea en un tier de complejidad y recomienda un rango de
 * agentes, de modo que el planner dimensiona el plan dinámicamente:
 *
 *   simple             → 1–3 agentes
 *   medium             → 4–5 agentes
 *   complex            → 6–14 agentes (hasta ~15)
 *   extremely_complex  → 15–20 agentes
 *
 * Es 100% determinista (heurística por señales, sin LLM ni red), por lo que
 * es testeable y reproducible. Los rangos NO son límites duros: son la guía
 * inicial que el planner inyecta al modelo; el único límite duro es MAX_AGENTS.
 *
 * Los rangos se recortan automáticamente contra MAX_AGENTS (schemas.js) para
 * que nunca recomienden más agentes de los que el guardrail permite.
 */

const { MAX_AGENTS } = require('./schemas');

const TIERS = {
  simple: { key: 'simple', label: 'Simple', min: 1, max: 3 },
  medium: { key: 'medium', label: 'Media', min: 4, max: 5 },
  complex: { key: 'complex', label: 'Compleja', min: 6, max: 14 },
  extremely_complex: {
    key: 'extremely_complex',
    label: 'Extremadamente compleja',
    min: 15,
    max: 20,
  },
};

const TIER_ORDER = ['simple', 'medium', 'complex', 'extremely_complex'];

/** Palabras clave por dominio de trabajo. Cada dominio distinto detectado suma
 *  complejidad (una tarea que toca 3 dominios necesita más agentes que una
 *  mono-dominio). */
const DOMAIN_KEYWORDS = {
  code: [
    'código',
    'codigo',
    'programar',
    'refactor',
    'script',
    'función',
    'funcion',
    'bug',
    'typescript',
    'javascript',
    'python',
    'node',
    'backend',
    'frontend',
    'desarrollo',
    'desarrollar',
    'reescribir',
    'implementa',
    'implementar',
  ],
  research: [
    'investiga',
    'investigar',
    'investigación',
    'investigacion',
    'fuentes',
    'estudiar',
    'estudio',
    'analizar',
    'análisis',
    'analisis',
    'buscar información',
    'citas',
    'evidencia',
    'busca',
  ],
  data: [
    'base de datos',
    'sql',
    'csv',
    'dataset',
    'datos',
    'mongodb',
    'postgres',
    'migración de datos',
    'migracion de datos',
    'etl',
  ],
  image: [
    'imagen',
    'imágenes',
    'imagenes',
    'visión',
    'vision',
    'foto',
    'gráfico',
    'grafico',
    'diagrama',
    'diseño visual',
    'comfyui',
    'generar imagen',
  ],
  video: ['video', 'animación', 'animacion', 'película', 'pelicula', 'clip', 'secuencia de video'],
  audio: [
    'audio',
    'voz',
    'tts',
    'stt',
    'música',
    'musica',
    'sonido',
    'transcrip',
    'kokoro',
    'whisper',
  ],
  web: [
    'web',
    'sitio',
    'página',
    'pagina',
    'html',
    'css',
    'react',
    'interfaz',
    'ui',
    'dashboard',
    'aplicación',
    'aplicacion',
    'plataforma web',
  ],
  deploy: [
    'docker',
    'kubernetes',
    'despliegue',
    'desplegar',
    'deploy',
    'servidor',
    'nube',
    'cloud',
    'producción',
    'produccion',
    'helm',
    'contenedor por servicio',
  ],
  security: [
    'seguridad',
    'vulnerabilidad',
    'cifrado',
    'autenticación',
    'autenticacion',
    'permisos',
    'ssrf',
    'secreto',
    'auditoría de seguridad',
    'auditoria de seguridad',
  ],
  testing: [
    'test',
    'prueba',
    'pruebas',
    'validación',
    'validacion',
    'verificación',
    'verificacion',
    'regresión',
    'regresion',
    'cobertura',
    'e2e',
  ],
  docs: [
    'documentación',
    'documentacion',
    'docs',
    'readme',
    'manual',
    'guía',
    'guia',
    'tutorial',
    'wikis',
    'informe',
    'reporte',
    'resumen',
  ],
  ml: [
    'modelo',
    'llm',
    'entrenar',
    'fine-tune',
    'red neuronal',
    'embedding',
    'inteligencia artificial',
    'machine learning',
  ],
};

/** Raíces que indican trabajo de ejecución/verificación intensivo (no solo
 *  responder): cubren formas conjugadas (construye/construir, verifica/verificar). */
const EXECUTION_STEMS = [
  'constru',
  'implement',
  'audit',
  'refactor',
  'despl',
  'deploy',
  'kubernetes',
  'docker',
  'arquitect',
  'migr',
  'escal',
  'optimiz',
  'revis',
  'verific',
  'integr',
  'valid',
  'desarrolla',
  'coordina',
];

/**
 * @param {string} task - descripción de la tarea en palabras del usuario.
 * @returns {{ tier: string, score: number, range: {min: number, max: number}, reasons: string[] }}
 */
function analyzeComplexity(task) {
  const text = (task || '').trim();
  if (!text) {
    return {
      tier: 'simple',
      score: 0,
      range: clampRange(TIERS.simple),
      reasons: ['tarea vacía → simple'],
    };
  }

  const lower = text.toLowerCase();
  const reasons = ['tarea directa de alcance limitado (base)'];
  let score = 1; // base: toda tarea merece al menos un agente

  // 1) Extensión del enunciado.
  if (text.length > 150) {
    score += 0.5;
    reasons.push('enunciado extenso (+0.5)');
  }
  if (text.length > 600) {
    score += 0.5;
    reasons.push('enunciado muy extenso (+0.5)');
  }
  if (text.length > 1200) {
    score += 0.5;
    reasons.push('enunciado extremadamente extenso (+0.5)');
  }

  // 2) Subtareas explícitas (saltos de línea, listas numeradas, punto y coma).
  const subtaskBlocks = text
    .split(/\n+|;|(?:\d+[.)]\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  const subtaskScore = Math.min(2, Math.max(0, subtaskBlocks.length - 1) * 0.5);
  if (subtaskScore > 0) {
    score += subtaskScore;
    reasons.push(`${subtaskBlocks.length} subtareas explícitas (+${subtaskScore})`);
  }

  // 3) Amplitud de dominios: más dominios → más agentes especializados.
  const domains = new Set();
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) domains.add(domain);
  }
  const domainScore = Math.min(2.4, Math.max(0, domains.size - 1) * 0.6);
  if (domainScore > 0) {
    score += domainScore;
    reasons.push(`${domains.size} dominios (${[...domains].join(', ')}) (+${domainScore})`);
  }

  // 4) Tarea de ejecución/auditoría intensiva (stems → cubren conjugaciones).
  const hits = EXECUTION_STEMS.filter((k) => lower.includes(k));
  const execScore = Math.min(1.6, hits.length * 0.4);
  if (execScore > 0) {
    score += execScore;
    reasons.push(`ejecución/verificación (${hits.slice(0, 4).join(', ')}) (+${execScore})`);
  }

  // 5) Ambigüedad / decisión abierta.
  if (
    /(no sé|no se|sin especificar|ayúdame a decidir|ayudame a decidir|no estoy seguro)/i.test(text)
  ) {
    score += 0.5;
    reasons.push('requiere decisión/ambigüedad (+0.5)');
  }

  // 6) Coordinación multidisciplinar (varios equipos/roles simultáneos).
  if (/(equipos|multidisciplin|varios roles|coordinación|coordinacion|coordina)/i.test(text)) {
    score += 0.5;
    reasons.push('requiere coordinación multidisciplinar (+0.5)');
  }

  const rounded = Math.round(score * 10) / 10;

  let tierKey;
  if (rounded >= 9) tierKey = 'extremely_complex';
  else if (rounded >= 6) tierKey = 'complex';
  else if (rounded >= 3) tierKey = 'medium';
  else tierKey = 'simple';

  return { tier: tierKey, score: rounded, range: clampRange(TIERS[tierKey]), reasons };
}

function clampRange(tier) {
  const min = Math.max(1, Math.min(tier.min, MAX_AGENTS));
  const max = Math.max(min, Math.min(tier.max, MAX_AGENTS));
  return { min, max };
}

/**
 * Bloque de guía que el planner inyecta en el system prompt del modelo para
 * dimensionar el plan según la complejidad real de la tarea.
 */
function buildTierGuidance(complexity) {
  const tier = TIERS[complexity.tier];
  return [
    `Complejidad de la tarea: ${tier.label} (score ${complexity.score}).`,
    `Rango recomendado de agentes para esta complejidad: ${complexity.range.min}–${complexity.range.max}.`,
    `- Dimensiona el plan DENTRO de ese rango según lo que la tarea realmente necesite.`,
    `- El rango es una guía inicial, no un límite: si la tarea crece en complejidad mientras trabajas, puedes superar el máximo del rango (hasta ${MAX_AGENTS} agentes).`,
    `- Nunca superes ${MAX_AGENTS} agentes en total.`,
    `- Sigue usando el MENOR número de agentes que resuelva la tarea bien: un solo agente bien instruido suele bastar para tareas simples.`,
  ].join('\n');
}

module.exports = {
  TIERS,
  TIER_ORDER,
  analyzeComplexity,
  buildTierGuidance,
  DOMAIN_KEYWORDS,
  EXECUTION_STEMS,
};
