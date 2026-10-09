/**
 * capabilityDiscovery.js — Capability Discovery Engine (FASE 3).
 *
 * Para cada agente de un plan, descubre qué capacidades necesita según su rol
 * e instrucciones, y las empareja con tools/skills/MCP servers REALMENTE
 * disponibles en el workspace. Selecciona el conjunto mínimo de tools que
 * cubre las capacidades requeridas y garantiza:
 *   - sin duplicados por agente (cada tool se asigna una sola vez en el plan),
 *   - sin instalaciones duplicadas (lo que ya está disponible nunca se
 *     sugiere como "instalar"; el marketplace se consulta solo para lo que
 *     falta, con claves canónicas deduplicadas).
 *
 * Reutiliza los NOMBRES de capacidad del CapabilityOrchestrator (Capability
 * Registry) para que todo el sistema hable el mismo idioma de capacidades.
 * El motor es 100% determinista (mapeo por palabras clave, sin LLM ni red),
 * lo que lo hace testeable; las dependencias externas (listAvailableTools,
 * searchSkillCatalog) se inyectan.
 */

const { Capabilities } = require('../CapabilityOrchestrator/constants/Types');

/* ─────────────────── Mapeo rol/instrucciones → capacidades ─────────────── */

/**
 * Palabras clave (stems) que activan cada capacidad a partir del rol y las
 * instrucciones del agente. Ordenado de específico a general.
 */
const ROLE_CAPABILITY_KEYWORDS = {
  [Capabilities.SEARCH]: [
    'investig',
    'busca',
    'fuentes',
    'research',
    'search',
    'consulta',
    'encuentra',
    'web',
  ],
  [Capabilities.RAG]: [
    'rag',
    'knowledge',
    'conocimiento',
    'vector',
    'knowledge base',
    'documentos previos',
  ],
  [Capabilities.ANALYSIS]: [
    'analiz',
    'análisis',
    'analisis',
    'evalua',
    'evalu',
    'examina',
    'estudia',
    'revisa',
    'audit',
  ],
  [Capabilities.CODE]: [
    'código',
    'codigo',
    'program',
    'implementa',
    'desarrolla',
    'script',
    'bug',
    'refactor',
    'typescript',
    'python',
    'javascript',
    'node',
    'backend',
    'frontend',
    'api',
  ],
  [Capabilities.FRONTEND]: [
    'frontend',
    'react',
    'html',
    'css',
    'ui',
    'interfaz',
    'componente',
    'diseño visual',
  ],
  [Capabilities.BACKEND]: [
    'backend',
    'servidor',
    'node',
    'express',
    'server',
    'api rest',
    'endpoint',
  ],
  [Capabilities.ARCHITECTURE]: [
    'arquitect',
    'diseño del sistema',
    'estructura del proyecto',
    'diagrama de',
  ],
  [Capabilities.SECURITY]: [
    'seguridad',
    'vulnerabilidad',
    'cifrado',
    'autentic',
    'permiso',
    'ssrf',
    'secreto',
    'auth',
    'xss',
    'inyección',
  ],
  [Capabilities.DEVOPS]: [
    'docker',
    'kubernetes',
    'deploy',
    'despliegue',
    'infra',
    'ci/cd',
    'helm',
    'contenedor',
  ],
  [Capabilities.DATABASE]: [
    'base de datos',
    'sql',
    'mongo',
    'postgres',
    'database',
    'dataset',
    'query',
    'schema',
  ],
  [Capabilities.MATH]: [
    'matemátic',
    'matematic',
    'cálculo',
    'calculo',
    'aritmét',
    'aritmet',
    'fórmula',
    'formula',
  ],
  [Capabilities.TRANSLATION]: ['traduc', 'traducción', 'traduccion', 'idioma', 'language'],
  [Capabilities.SUMMARIZATION]: ['resume', 'resumen', 'sintetiza', 'summariz', 'condensa'],
  [Capabilities.WRITING]: [
    'documenta',
    'documentación',
    'documentacion',
    'informe',
    'reporte',
    'manual',
    'guía',
    'guia',
    'redacta',
    'escribe',
    'docs',
  ],
  [Capabilities.CLASSIFICATION]: ['clasific', 'categoriz', 'etiquet'],
  [Capabilities.EMBEDDINGS]: ['embedding', 'vectorial', 'embeddings'],
  [Capabilities.IMAGE_GEN]: [
    'imagen',
    'imágenes',
    'imagenes',
    'genera imagen',
    'foto',
    'ilustra',
    'diseño visual',
    'comfyui',
    'stable diffusion',
    'dalle',
  ],
  [Capabilities.VIDEO_GEN]: ['video', 'animación', 'animacion', 'clip', 'secuencia visual'],
  [Capabilities.AUDIO]: [
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
  [Capabilities.VISION]: [
    'visión',
    'vision',
    'reconoce imagen',
    'ocr',
    'analiza imagen',
    'lee imagen',
  ],
  [Capabilities.TOOL_CALLING]: [
    'coordin',
    'delega',
    'junta resultados',
    'orquest',
    'asigna tareas',
    'sub-tareas',
    'subagente',
    'tool',
    'herramienta',
    'mcp',
  ],
  [Capabilities.REASONING]: [
    'razon',
    'lógica',
    'logica',
    'piensa',
    'justifica',
    'concluye',
    'infer',
    'planific',
    'estrategia',
  ],
};

const ROLE_DEFAULT_CAPABILITIES = [Capabilities.CHAT, Capabilities.REASONING];

/** Expande una lista de capacidades añadiendo implicaciones básicas (coherencia
 *  con CapabilityRegistry: code→reasoning, search→analysis…). */
const IMPLICATIONS = {
  [Capabilities.CODE]: [Capabilities.REASONING],
  [Capabilities.FRONTEND]: [Capabilities.CODE, Capabilities.REASONING],
  [Capabilities.BACKEND]: [Capabilities.CODE, Capabilities.REASONING],
  [Capabilities.ARCHITECTURE]: [Capabilities.REASONING],
  [Capabilities.SECURITY]: [Capabilities.ANALYSIS, Capabilities.REASONING],
  [Capabilities.DEVOPS]: [Capabilities.REASONING],
  [Capabilities.DATABASE]: [Capabilities.ANALYSIS],
  [Capabilities.SEARCH]: [Capabilities.ANALYSIS],
  [Capabilities.RAG]: [Capabilities.SEARCH, Capabilities.ANALYSIS],
  [Capabilities.SUMMARIZATION]: [Capabilities.ANALYSIS],
  [Capabilities.IMAGE_GEN]: [Capabilities.VISION, Capabilities.CREATIVE],
  [Capabilities.VIDEO_GEN]: [Capabilities.VISION, Capabilities.CREATIVE],
  [Capabilities.AUDIO]: [Capabilities.MULTIMODAL],
  [Capabilities.VISION]: [Capabilities.MULTIMODAL],
  [Capabilities.TOOL_CALLING]: [Capabilities.FUNCTION_CALLING, Capabilities.CHAT],
};

/**
 * @param {{ role?: string, instructions?: string }} agent - agente del plan
 * @returns {string[]} capacidades requeridas (expandidas con implicaciones)
 */
function mapRoleToCapabilities({ role = '', instructions = '' }) {
  const text = `${role} ${instructions}`.toLowerCase();
  const requested = new Set();

  for (const [capability, keywords] of Object.entries(ROLE_CAPABILITY_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k.toLowerCase()))) {
      requested.add(capability);
    }
  }

  if (requested.size === 0) {
    for (const cap of ROLE_DEFAULT_CAPABILITIES) requested.add(cap);
  }

  // Expandir implicaciones (transitivo).
  const expanded = new Set(requested);
  const queue = [...requested];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const implied of IMPLICATIONS[current] ?? []) {
      if (!expanded.has(implied)) {
        expanded.add(implied);
        queue.push(implied);
      }
    }
  }
  return [...expanded];
}

/* ─────────────────── Índice tools → capacidades ────────────────────────── */

/**
 * Índice canónico por nombre normalizado de tool conocido. La normalización
 * quita acentos, guiones y espacios (dalle-3 → dalle3, DuckDuckGo Search →
 * duckduckgosearch).
 */
const TOOL_CAPABILITY_INDEX = {
  // NOTA: las claves están NORMALIZADAS (normalize(): minúsculas sin acentos ni
  // símbolos), igual que se comparan en toolCapabilities().
  knowledgeengine: [
    Capabilities.SEARCH,
    Capabilities.RAG,
    Capabilities.ANALYSIS,
    Capabilities.TOOL_CALLING,
  ],
  tavilysearch: [Capabilities.SEARCH, Capabilities.ANALYSIS],
  traversaal: [Capabilities.SEARCH],
  google: [Capabilities.SEARCH],
  duckduckgosearch: [Capabilities.SEARCH],
  azureaisearch: [Capabilities.SEARCH, Capabilities.RAG],
  openweather: [Capabilities.SEARCH, Capabilities.ANALYSIS],
  calculator: [Capabilities.MATH, Capabilities.ANALYSIS],
  wolfram: [Capabilities.MATH, Capabilities.ANALYSIS, Capabilities.REASONING],
  dalle3: [Capabilities.IMAGE_GEN, Capabilities.VISION, Capabilities.CREATIVE],
  stablediffusion: [Capabilities.IMAGE_GEN, Capabilities.VISION, Capabilities.CREATIVE],
  flux: [Capabilities.IMAGE_GEN, Capabilities.VISION, Capabilities.CREATIVE],
  imagegenerator: [Capabilities.IMAGE_GEN, Capabilities.VISION, Capabilities.CREATIVE],
  openaiimagetools: [Capabilities.IMAGE_GEN, Capabilities.VISION, Capabilities.CREATIVE],
  geminiimagetools: [Capabilities.IMAGE_GEN, Capabilities.VISION, Capabilities.CREATIVE],
  askuser: [Capabilities.CHAT, Capabilities.TOOL_CALLING],
};

/** Inferencia por nombre/descripción para tools no indexadas (extensible). */
function inferCapabilitiesFromName(name = '', description = '') {
  const text = `${name} ${description}`.toLowerCase();
  const caps = new Set();
  if (/(search|busca|web|google|tavily|traversaal)/.test(text)) caps.add(Capabilities.SEARCH);
  if (/(image|imagen|dalle|diffusion|flux|photo)/.test(text)) caps.add(Capabilities.IMAGE_GEN);
  if (/(video|animaci)/.test(text)) caps.add(Capabilities.VIDEO_GEN);
  if (/(audio|voice|voz|tts|stt|speech)/.test(text)) caps.add(Capabilities.AUDIO);
  if (/(math|calculo|cálculo|wolfram)/.test(text)) caps.add(Capabilities.MATH);
  if (/(code|código|codigo|program)/.test(text)) caps.add(Capabilities.CODE);
  if (/(database|sql|mongo|query)/.test(text)) caps.add(Capabilities.DATABASE);
  if (/(rag|knowledge|document)/.test(text)) caps.add(Capabilities.RAG);
  if (/(translate|traduc)/.test(text)) caps.add(Capabilities.TRANSLATION);
  if (/(summar|resume|resumen)/.test(text)) caps.add(Capabilities.SUMMARIZATION);
  return [...caps];
}

function toolCapabilities(tool) {
  const normalized = normalize(tool.name);
  const exact = TOOL_CAPABILITY_INDEX[normalized];
  if (exact) return exact;
  const inferred = inferCapabilitiesFromName(tool.name, tool.description);
  if (inferred.length > 0) return inferred;
  return [];
}

function normalize(name = '') {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-z0-9]/g, ''); // quitar guiones/espacios
}

/* ─────────────────── Selección y asignación ────────────────────────────── */

/**
 * Puntúa cada tool disponible contra las capacidades requeridas.
 * score = nº de capacidades requeridas cubiertas + bonus por indexación exacta.
 */
function matchToolsToCapabilities({ capabilities, availableTools = [] }) {
  const required = new Set(capabilities);
  const matches = availableTools
    .map((tool) => {
      const caps = toolCapabilities(tool);
      const covered = caps.filter((c) => required.has(c));
      if (covered.length === 0) return null;
      const indexed = normalize(tool.name) in TOOL_CAPABILITY_INDEX;
      return {
        name: tool.name,
        source: tool.source || 'workspace',
        category: tool.category || '',
        covered,
        score: covered.length + (indexed ? 0.5 : 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return matches;
}

/**
 * Selección codiciosa del conjunto MÍNIMO de tools que cubre las capacidades
 * requeridas, sin asignar tools ya usadas por otro agente del plan.
 *
 * @returns {{ assigned: string[], coverage: string[], unmatched: string[], collisions: number }}
 */
function selectToolsForAgent({ capabilities, availableTools = [], alreadyAssigned = [] }) {
  const required = new Set(capabilities);
  const blocked = new Set(alreadyAssigned.map(normalize));

  const assigned = [];
  const coverage = new Set();
  let collisions = 0; // veces que se saltó el mejor candidato por estar ya asignado
  let changed = true;
  while (required.size > coverage.size && changed) {
    changed = false;
    let best = null;
    for (const match of matchToolsToCapabilities({ capabilities: [...required], availableTools })) {
      if (blocked.has(normalize(match.name))) {
        collisions += 1;
        continue;
      }
      if (coverage.has(match.name)) continue;
      if (!best || match.score > best.score) best = match;
    }
    if (!best) break;
    assigned.push(best.name);
    blocked.add(normalize(best.name));
    for (const c of best.covered) coverage.add(c);
    changed = true;
  }

  const unmatched = [...required].filter((c) => !coverage.has(c));
  return { assigned, coverage: [...coverage], unmatched, collisions };
}

/* ─────────────────── Orquestación por plan ─────────────────────────────── */

/**
 * Ejecuta el discovery para TODOS los agentes de un plan:
 *  - una sola lectura de `availableTools`,
 *  - capacidades por rol,
 *  - selección mínima con dedup global (cada tool se asigna a un solo agente),
 *  - marketplace consultado UNA vez por capacidad faltante y con claves
 *    canónicas únicas (nunca sugerir instalar lo que ya está disponible).
 *
 * @param {object} params
 * @param {{ agents: Array<{key: string, name?: string, role_description?: string, instructions?: string, tools?: string[]}> }} params.plan
 * @param {() => Promise<Array<{name: string, description?: string, category?: string, source?: string}>>} params.listAvailableTools
 * @param {(query: string) => Promise<Array<{name: string, source?: string}>>} [params.searchSkillCatalog]
 * @param {(agents: Array<{key: string, name?: string, capabilities: string[]}>) => Promise<object>} [params.routeModels]
 *   - FASE 4 (opcional): si se inyecta, se ejecuta tras el discovery y el
 *     reporte incluye `modelRouting` (modelo elegido por agente según
 *     capacidades). Aditivo: si no se inyecta, el reporte no cambia.
 * @returns {Promise<object>} reporte de discovery por agente + estadísticas de dedup
 */
async function discoverCapabilitiesForPlan({
  plan,
  listAvailableTools,
  searchSkillCatalog,
  routeModels,
}) {
  const agents = Array.isArray(plan?.agents) ? plan.agents : [];
  const availableTools = await listAvailableTools().catch(() => []);

  const alreadyAssigned = [];
  const perAgent = [];
  const marketQueries = new Map(); // capacidad -> primera búsqueda (dedup)
  const installsSuggested = [];
  let totalCollisions = 0;

  for (const agent of agents) {
    const capabilities = mapRoleToCapabilities({
      role: agent.role_description || '',
      instructions: agent.instructions || '',
    });

    const matches = matchToolsToCapabilities({ capabilities, availableTools });
    const selection = selectToolsForAgent({
      capabilities,
      availableTools,
      alreadyAssigned,
    });
    totalCollisions += selection.collisions;

    // El plan puede sugerir tools explícitas: se conservan las que existen.
    const suggestedExisting = (agent.tools || []).filter((t) =>
      availableTools.some((a) => normalize(a.name) === normalize(t)),
    );

    alreadyAssigned.push(...selection.assigned);

    // Capacidades sin tool disponible → marketplace (una vez por capacidad).
    const unresolvedCaps = [];
    const suggestedForAgent = [];
    for (const cap of selection.unmatched) {
      unresolvedCaps.push(cap);
      if (marketQueries.has(cap)) {
        const cached = marketQueries.get(cap);
        if (cached) suggestedForAgent.push(cached.name);
        continue;
      }
      let candidate = null;
      if (searchSkillCatalog) {
        const results = await searchSkillCatalog(cap).catch(() => []);
        candidate = results[0] ?? null;
      }
      marketQueries.set(cap, candidate);
      if (candidate) {
        suggestedForAgent.push(candidate.name);
        installsSuggested.push({
          capability: cap,
          name: candidate.name,
          source: candidate.source || 'marketplace',
          key: `${normalize(candidate.name)}::${normalize(candidate.source || 'marketplace')}`,
        });
      }
    }

    perAgent.push({
      key: agent.key,
      name: agent.name || agent.key,
      capabilities,
      matchedTools: matches.map((m) => ({ name: m.name, covered: m.covered, score: m.score })),
      assignedTools: [...new Set([...selection.assigned, ...suggestedExisting])],
      unresolvedCapabilities: unresolvedCaps,
      suggestedInstalls: [...new Set(suggestedForAgent)],
    });
  }

  // Dedup global de instalaciones sugeridas (clave canónica única).
  const seenInstalls = new Set();
  const uniqueInstalls = installsSuggested.filter((i) => {
    if (seenInstalls.has(i.key)) return false;
    seenInstalls.add(i.key);
    return true;
  });

  // Nada que ya exista en el workspace puede sugerirse como "instalar".
  const availableNames = new Set(availableTools.map((t) => normalize(t.name)));
  const finalInstalls = uniqueInstalls.filter((i) => !availableNames.has(normalize(i.name)));

  // FASE 4 (opcional): routing de modelos por capacidades, aditivo.
  let modelRouting = null;
  if (routeModels && agents.length > 0) {
    try {
      modelRouting = await routeModels(
        perAgent.map((a) => ({ key: a.key, name: a.name, capabilities: a.capabilities })),
      );
    } catch (err) {
      // El routing de modelos nunca rompe el discovery de tools.
      modelRouting = { error: err.message, agents: [], stats: null };
    }
  }

  return {
    planKey: plan?.summary ? normalize(plan.summary).slice(0, 24) : undefined,
    agents: perAgent,
    stats: {
      agents: agents.length,
      toolsAssigned: new Set(alreadyAssigned.map(normalize)).size,
      duplicateAssignmentsPrevented: totalCollisions,
      installsSuggested: finalInstalls.length,
      duplicateInstallsPrevented: uniqueInstalls.length - finalInstalls.length,
      unresolvedCapabilities: new Set(perAgent.flatMap((a) => a.unresolvedCapabilities)).size,
    },
    installsSuggested: finalInstalls,
    ...(modelRouting ? { modelRouting } : {}),
  };
}

module.exports = {
  mapRoleToCapabilities,
  matchToolsToCapabilities,
  selectToolsForAgent,
  discoverCapabilitiesForPlan,
  TOOL_CAPABILITY_INDEX,
  normalize,
};
