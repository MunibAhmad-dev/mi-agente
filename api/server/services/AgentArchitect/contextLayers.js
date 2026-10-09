/**
 * contextLayers.js — Fase 4 (Context Engine): capas de contexto L0–L7 + artifacts.
 *
 * Complementa (NO reemplaza) a AgentArchitect/contextManager.js, que ya aporta
 * relevancia + dedup + compresión a presupuesto de tokens. Aquí se añaden las
 * dos piezas que faltan para el Context Engine del doc (§6, §42):
 *
 *   1. CAPAS DE CONTEXTO (L0–L7): el contexto no es una bolsa plana, vive en
 *      niveles con prioridad y coste distinto. El ensamblador decide qué capas
 *      entran primero en el presupuesto.
 *   2. ARTIFACTS (artifact://): resultados grandes (logs, dumps, diffs) se
 *      guardan fuera del prompt y se referencian por URI; el modelo recibe
 *      solo un resumen + puntero, no el contenido completo.
 *
 * Regla 4 del doc: "el contexto es dinámico — nunca introducir información
 * innecesaria". Regla 5: "la memoria es externa — no depender únicamente de
 * la ventana de contexto".
 */

const { estimateTokens } = require('./contextManager');

/** Capas de contexto (doc §42 — estrategia de memoria en niveles). */
const Layer = Object.freeze({
  L0_SYSTEM: 'L0_system', // prompt del sistema / instrucciones del agente
  L1_PROJECT: 'L1_project', // AGENT.md, convenciones, arquitectura del repo
  L2_TASK: 'L2_task', // descripción de la tarea actual + plan
  L3_CODE: 'L3_code', // código relevante (símbolos/archivos recuperados)
  L4_MEMORY: 'L4_memory', // memoria del proyecto/usuario
  L5_RAG: 'L5_rag', // recuperación semántica/vectorial
  L6_HISTORY: 'L6_history', // historial de ejecución (turnos previos)
  L7_ARTIFACT: 'L7_artifact', // referencias a artifacts (resumen + URI)
});

/** Prioridad de inclusión: las capas más bajas entran primero en el budget. */
const LAYER_PRIORITY = Object.freeze([
  Layer.L0_SYSTEM,
  Layer.L1_PROJECT,
  Layer.L2_TASK,
  Layer.L3_CODE,
  Layer.L4_MEMORY,
  Layer.L5_RAG,
  Layer.L6_HISTORY,
  Layer.L7_ARTIFACT,
]);

const LAYER_META = Object.freeze({
  [Layer.L0_SYSTEM]: { label: 'Sistema', truncateable: false },
  [Layer.L1_PROJECT]: { label: 'Proyecto', truncateable: true },
  [Layer.L2_TASK]: { label: 'Tarea', truncateable: false },
  [Layer.L3_CODE]: { label: 'Código', truncateable: true },
  [Layer.L4_MEMORY]: { label: 'Memoria', truncateable: true },
  [Layer.L5_RAG]: { label: 'RAG', truncateable: true },
  [Layer.L6_HISTORY]: { label: 'Historial', truncateable: true },
  [Layer.L7_ARTIFACT]: { label: 'Artifact', truncateable: false },
});

/**
 * Crea un bloque de contexto perteneciente a una capa.
 * @param {string} layer - ver Layer.
 * @param {string} content
 * @param {object} [extra] - { source, relevance, score, metadata, artifactUri }
 * @returns {object} block con { layer, content, tokens, ...extra }
 */
function makeBlock(layer, content, extra = {}) {
  let relevance = 0;
  if (typeof extra.relevance === 'number') {
    relevance = extra.relevance;
  } else if (typeof extra.score === 'number') {
    relevance = extra.score;
  }
  return {
    layer,
    content,
    tokens: extra.tokens ?? estimateTokens(content),
    source: extra.source ?? layer,
    relevance,
    ...(extra.metadata ? { metadata: extra.metadata } : {}),
    ...(extra.artifactUri ? { artifactUri: extra.artifactUri } : {}),
  };
}

/**
 * Ensambla el contexto respetando capas + presupuesto. A diferencia de
 * compressToBudget (que ordena solo por relevancia), aquí se respeta la
 * prioridad de capa PRIMERO y la relevancia DENTRO de cada capa. Las capas
 * no truncables (system/task) se incluyen siempre aunque excedan el budget.
 *
 * @param {object} params
 * @param {object[]} params.blocks - bloques makeBlock(...)
 * @param {number} [params.budgetTokens=8000]
 * @param {boolean} [params.dedup=true] - eliminar duplicados exactos de contenido
 * @returns {{ included: object[], dropped: object[], totalTokens: number, byLayer: object }}
 */
function assembleLayeredContext({ blocks = [], budgetTokens = 8000, dedup = true } = {}) {
  const seenHashes = new Set();
  const normHash = (text = '') => {
    const n = String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    let h = 0;
    for (let i = 0; i < n.length; i += 1) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };

  const layerOrder = new Map(LAYER_PRIORITY.map((layer, idx) => [layer, idx]));
  const orderOf = (layer) =>
    layerOrder.has(layer) ? layerOrder.get(layer) : LAYER_PRIORITY.length;

  const sorted = [...blocks].sort((a, b) => {
    const d = orderOf(a.layer) - orderOf(b.layer);
    if (d !== 0) return d;
    return (b.relevance || 0) - (a.relevance || 0);
  });

  const included = [];
  const dropped = [];
  let totalTokens = 0;
  const byLayer = {};

  for (const block of sorted) {
    const meta = LAYER_META[block.layer] || { truncateable: true };
    if (dedup) {
      const h = normHash(block.content);
      if (seenHashes.has(h)) {
        dropped.push({ ...block, dropReason: 'duplicate' });
        continue;
      }
      seenHashes.add(h);
    }
    const tokens = block.tokens ?? estimateTokens(block.content);
    const fits = totalTokens + tokens <= budgetTokens;
    if (fits || meta.truncateable === false) {
      included.push({ ...block, tokens });
      totalTokens += tokens;
    } else {
      dropped.push({ ...block, tokens, dropReason: 'budget' });
    }
    byLayer[block.layer] = (byLayer[block.layer] || 0) + 1;
  }

  return { included, dropped, totalTokens, byLayer };
}

/**
 * Sistema de Artifacts (doc §6 — artifact://). Los resultados grandes
 * (logs, dumps, diffs largos) se guardan en un store externo y se
 * referencian por URI; el modelo recibe un resumen + puntero, no el
 * contenido completo. Esto evita inflar el contexto.
 *
 * Store en memoria por defecto (para sesiones); en producción se persiste
 * en el sistema de archivos o BD (la interfaz es la misma).
 */
class ArtifactStore {
  constructor() {
    this._items = new Map();
    this._counter = 0;
  }

  /**
   * Guarda un artifact grande y devuelve su URI.
   * @param {string} kind - 'log' | 'diff' | 'dump' | 'output' | 'file'
   * @param {string} content - contenido completo (grande)
   * @param {object} [meta] - metadata arbitraria
   * @returns {string} artifact://<kind>/<id>
   */
  put(kind, content, meta = {}) {
    this._counter += 1;
    const id = `${this._counter}`;
    const uri = `artifact://${kind}/${id}`;
    this._items.set(uri, {
      uri,
      kind,
      content,
      tokens: estimateTokens(content),
      createdAt: Date.now(),
      ...meta,
    });
    return uri;
  }

  /**
   * Recupera el contenido completo de un artifact por su URI.
   * @param {string} uri
   * @returns {object | undefined}
   */
  get(uri) {
    return this._items.get(uri);
  }

  /** Lista todos los artifacts (para auditoría/observabilidad). */
  list() {
    return Array.from(this._items.values());
  }

  /** Resumen compacto para inyectar en el contexto (sin el contenido grande). */
  summary(uri) {
    const item = this._items.get(uri);
    if (!item) return null;
    const preview = String(item.content).slice(0, 200);
    return {
      uri: item.uri,
      kind: item.kind,
      tokens: item.tokens,
      preview,
      ...(item.title ? { title: item.title } : {}),
    };
  }

  clear() {
    this._items.clear();
    this._counter = 0;
  }
}

/**
 * Convierte un resultado grande en un bloque de contexto L7_artifact: guarda
 * el contenido en el store y devuelve un makeBlock con artifactUri + resumen.
 * @param {ArtifactStore} store
 * @param {string} kind
 * @param {string} content
 * @param {object} [meta]
 * @returns {object} block L7 con resumen (no el contenido grande)
 */
function toArtifactBlock(store, kind, content, meta = {}) {
  const uri = store.put(kind, content, meta);
  const summary = store.summary(uri);
  const summaryText = `[artifact:${kind}] ${summary.preview}… (${summary.tokens} tokens) → ${uri}`;
  return makeBlock(Layer.L7_ARTIFACT, summaryText, {
    source: 'artifact',
    artifactUri: uri,
    metadata: { kind, tokens: summary.tokens, title: meta.title },
  });
}

module.exports = {
  Layer,
  LAYER_PRIORITY,
  LAYER_META,
  makeBlock,
  assembleLayeredContext,
  ArtifactStore,
  toArtifactBlock,
};
