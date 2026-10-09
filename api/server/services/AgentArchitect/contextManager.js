/**
 * contextManager.js — Context Manager para agentes (FASE 5).
 *
 * Ensambla para CADA agente del plan SOLO el contexto relevante a su tarea y
 * rol, combinando tres fuentes reales:
 *   - memoria del proyecto/usuario (sistema de Memories de LibreChat, Mongo),
 *   - RAG vectorial (RAGService con embeddings reales de Ollama),
 *   - historial de ejecuciones previas (sesión multi-agente),
 *
 * con tres garantías:
 *   1. RELEVANCIA: cada fragmento se puntúa contra la tarea + rol del agente
 *      (solapamiento léxico determinista, sin LLM) y se ordena por ella.
 *   2. DEDUPLICACIÓN: fragmentos con el mismo contenido normalizado (p. ej. una
 *      memoria que repite un chunk del RAG) se fusionan; se reporta cuántos se
 *      eliminaron.
 *   3. COMPRESIÓN: se respeta un presupuesto de tokens por agente
 *      (AGENT_CONTEXT_BUDGET_TOKENS, default 3000); lo que no entra se reporta
 *      como "dropped" en lugar de inflar el prompt.
 *
 * El núcleo (buildAgentContext) es 100% determinista y testeable; las fuentes
 * reales se inyectan (memoriesLoader / ragSearch / executionHistory).
 */

const DEFAULT_BUDGET_TOKENS = 3000;

/** Estimación de tokens (≈4 chars/token para español/inglés). */
function estimateTokens(text = '') {
  return Math.max(1, Math.round(String(text).length / 4));
}

/** Tokenización simple por palabras (minúsculas, sin acentos). */
function tokenize(text = '') {
  return new Set(
    String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/**
 * Puntúa la relevancia de un texto frente a una consulta (0..1): fracción de
 * términos de la consulta presentes en el texto, ponderada por longitud.
 */
function relevanceScore(text = '', query = '') {
  const qTokens = tokenize(query);
  if (qTokens.size === 0) return 0;
  const tTokens = tokenize(text);
  if (tTokens.size === 0) return 0;
  let matched = 0;
  for (const t of qTokens) {
    if (tTokens.has(t)) matched += 1;
  }
  const coverage = matched / qTokens.size;
  // Penaliza levemente fragmentos muy cortos (menos informativos).
  const lengthBonus = Math.min(1, tTokens.size / 12);
  return Math.round(coverage * (0.6 + 0.4 * lengthBonus) * 100) / 100;
}

/** Hash del contenido normalizado (para dedup exacto). */
function contentHash(text = '') {
  const normalized = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  let h = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    h = (h * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/** Jaccard entre conjuntos de palabras (para dedup aproximado). */
function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / union.size;
}

/**
 * Deduplicación: elimina fragmentos cuyo contenido es idéntico (hash) o casi
 * idéntico (Jaccard ≥ 0.85) a otro con mayor o igual relevancia.
 * @returns {{ items: object[], removed: number }}
 */
function deduplicateItems(items = []) {
  const sorted = [...items].sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  const kept = [];
  let removed = 0;
  for (const item of sorted) {
    const tokens = tokenize(item.content);
    const hash = contentHash(item.content);
    const dup = kept.find((k) => {
      if (contentHash(k.content) === hash) return true;
      const kTokens = tokenize(k.content);
      return jaccard(tokens, kTokens) >= 0.85;
    });
    if (dup) {
      removed += 1;
      continue;
    }
    kept.push(item);
  }
  return { items: kept, removed };
}

/**
 * Compresión por presupuesto: ordena por relevancia y conserva el prefijo que
 * quepa en `budgetTokens`.
 * @returns {{ included: object[], dropped: object[], totalTokens: number }}
 */
function compressToBudget({ items = [], budgetTokens = DEFAULT_BUDGET_TOKENS }) {
  const ranked = [...items].sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  const included = [];
  const dropped = [];
  let totalTokens = 0;
  for (const item of ranked) {
    const tokens = item.tokens ?? estimateTokens(item.content);
    if (totalTokens + tokens > budgetTokens) {
      dropped.push(item);
      continue;
    }
    included.push(item);
    totalTokens += tokens;
  }
  return { included, dropped, totalTokens };
}

/**
 * Ensamblador puro del contexto de un agente.
 *
 * @param {object} params
 * @param {string} params.task - descripción de la tarea del agente
 * @param {{ name?: string, type?: string }} [params.agent]
 * @param {Array<{key?: string, value?: string, content?: string}>} [params.memories]
 * @param {Array<{content: string, score?: number, metadata?: object}>} [params.ragResults]
 * @param {Array<{title?: string, description?: string, result?: string}>} [params.executionHistory]
 * @param {number} [params.budgetTokens]
 * @returns {object} contexto estructurado + estadísticas
 */
function buildAgentContext({
  task = '',
  agent = {},
  memories = [],
  ragResults = [],
  executionHistory = [],
  budgetTokens = DEFAULT_BUDGET_TOKENS,
}) {
  const query = `${task} ${agent.name || ''} ${agent.type || ''}`;

  const asItem = (content, source, extra = {}, relevanceOverride) => ({
    content,
    source,
    relevance:
      relevanceOverride ??
      (typeof extra.score === 'number'
        ? Math.max(0, Math.min(1, extra.score))
        : relevanceScore(content, query)),
    tokens: estimateTokens(content),
    ...extra,
  });

  const raw = [
    ...memories.map((m) =>
      asItem(m.value ?? m.content ?? '', 'memory', { key: m.key, score: m.score }),
    ),
    ...ragResults.map((r) =>
      asItem(r.content, 'rag', {
        score: typeof r.score === 'number' ? r.score : undefined,
        metadata: r.metadata,
      }),
    ),
    ...executionHistory.map((h) =>
      asItem(h.result ?? h.description ?? '', 'execution', {
        taskId: h.taskId,
        title: h.title,
        score: undefined,
      }),
    ),
  ].filter((i) => i.content && i.content.trim().length > 0);

  const { items: deduped, removed: dedupRemoved } = deduplicateItems(raw);
  const { included, dropped, totalTokens } = compressToBudget({
    items: deduped,
    budgetTokens,
  });

  const bySource = {};
  for (const i of included) bySource[i.source] = (bySource[i.source] || 0) + 1;

  return {
    blocks: included.map((i) => ({
      source: i.source,
      content: i.content,
      relevance: i.relevance,
      tokens: i.tokens,
      ...(i.key ? { key: i.key } : {}),
      ...(i.metadata ? { metadata: i.metadata } : {}),
    })),
    stats: {
      sourcesConsidered: {
        memory: memories.length,
        rag: ragResults.length,
        execution: executionHistory.length,
      },
      dedupRemoved,
      dropped: dropped.length,
      included: included.length,
      totalTokens,
      budgetTokens,
      bySource,
    },
  };
}

/**
 * Wiring real: carga memorias del usuario (sistema Memories), busca en el RAG
 * real (RAGService con embeddings de Ollama) y adjunta el historial previo.
 * Todas las dependencias son inyectables para tests; los defaults son lazy y
 * con try/catch para que un fallo de fuente NUNCA rompa la ejecución del
 * agente (el contexto es un enriquecimiento, no un requisito).
 *
 * @param {object} params
 * @param {string} params.task
 * @param {object} [params.agent]
 * @param {string} [params.userId]
 * @param {() => Promise<Array<{key?: string, value?: string}>>} [params.memoriesLoader]
 * @param {(query: string) => Promise<Array<{content: string, score?: number}>>} [params.ragSearch]
 * @param {Array<object>} [params.executionHistory]
 * @param {number} [params.budgetTokens]
 * @param {object} [params.logger]
 * @returns {Promise<object>} contexto + stats + errores por fuente (no fatales)
 */
async function fetchContextForAgent({
  task,
  agent = {},
  userId,
  memoriesLoader,
  ragSearch,
  executionHistory = [],
  budgetTokens,
  logger = console,
}) {
  const sourceErrors = [];
  let memories = [];
  let ragResults = [];

  if (memoriesLoader) {
    try {
      memories = await memoriesLoader();
    } catch (err) {
      sourceErrors.push({ source: 'memory', error: err.message });
    }
  } else if (userId) {
    try {
      const { getAllUserMemories } = require('~/models');
      const docs = await getAllUserMemories(userId);
      memories = (docs || []).map((m) => ({ key: m.key, value: m.value }));
    } catch (err) {
      sourceErrors.push({ source: 'memory', error: err.message });
    }
  }

  if (ragSearch) {
    try {
      ragResults = await ragSearch(task);
    } catch (err) {
      sourceErrors.push({ source: 'rag', error: err.message });
    }
  } else {
    try {
      const { getRAGService } = require('../RAG');
      // getRAGService() devuelve una Promise (inicialización async con Redis).
      const rag = await getRAGService();
      ragResults = await rag.search(task, { topK: 4, minSimilarity: 0.15 });
    } catch (err) {
      sourceErrors.push({ source: 'rag', error: err.message });
    }
  }

  const context = buildAgentContext({
    task,
    agent,
    memories,
    ragResults,
    executionHistory,
    budgetTokens,
  });

  return { ...context, sourceErrors };
}

module.exports = {
  estimateTokens,
  relevanceScore,
  deduplicateItems,
  compressToBudget,
  buildAgentContext,
  fetchContextForAgent,
  DEFAULT_BUDGET_TOKENS,
};
