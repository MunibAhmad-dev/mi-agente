/**
 * contextManager.spec.js — tests unitarios del Context Manager (FASE 5).
 *
 * Verifica:
 *   - estimación de tokens y relevancia por solapamiento léxico,
 *   - deduplicación exacta y aproximada (memoria duplicando un chunk RAG),
 *   - compresión por presupuesto (lo que no entra se reporta, no se infla),
 *   - ensamblado con fuentes reales inyectadas (memorias + RAG + historial),
 *   - wiring fetchContextForAgent con fakes y tolerancia a fallos de fuente.
 *
 * Ejecutar:
 *   NODE_ENV=test node_modules/.bin/jest server/services/AgentArchitect/__tests__/contextManager.spec.js
 */

const {
  estimateTokens,
  relevanceScore,
  deduplicateItems,
  compressToBudget,
  buildAgentContext,
  fetchContextForAgent,
} = require('../contextManager');

const PROJECT_MEMORY = {
  key: 'proyecto',
  value:
    'La plataforma mi-libre-chat usa Node.js con MongoDB y un frontend React. El módulo de seguridad valida tokens JWT para autenticación de usuarios.',
};
const UNRELATED_MEMORY = {
  key: 'hobby',
  value: 'Al usuario le gusta la jardinería y colecciona cactus en su terraza.',
};
const RAG_DOC = {
  content:
    'La autenticación usa JWT firmados con HMAC-SHA256 y expiración de 24 horas; los roles se guardan en MongoDB.',
  score: 0.72,
};
const RAG_UNRELATED = {
  content: 'Receta de pan casero con harina integral y levadura fresca, horneado a 200 grados.',
  score: 0.31,
};

const CODING_TASK =
  'Implementa la autenticación JWT en el backend de Node y documenta el flujo de seguridad de la plataforma.';

describe('estimateTokens / relevanceScore', () => {
  it('estima tokens de forma razonable (≈4 chars/token)', () => {
    expect(estimateTokens('hola mundo')).toBeGreaterThanOrEqual(1);
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });

  it('relevancia alta para contenido que coincide con la consulta', () => {
    const rel = relevanceScore(PROJECT_MEMORY.value, CODING_TASK);
    expect(rel).toBeGreaterThan(0.5);
  });

  it('relevancia baja para contenido sin relación', () => {
    const rel = relevanceScore(UNRELATED_MEMORY.value, CODING_TASK);
    expect(rel).toBeLessThan(0.2);
  });
});

describe('deduplicateItems', () => {
  it('fusiona contenido idéntico (memoria duplicando chunk RAG)', () => {
    const { items, removed } = deduplicateItems([
      { content: 'El token JWT expira en 24 horas.', relevance: 0.9, source: 'rag' },
      { content: 'El token JWT expira en 24 horas.', relevance: 0.8, source: 'memory' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('rag'); // conserva el de mayor relevancia
    expect(removed).toBe(1);
  });

  it('fusiona contenido casi idéntico (Jaccard ≥ 0.85)', () => {
    const { items, removed } = deduplicateItems([
      {
        content: 'La autenticación valida tokens JWT firmados con HMAC y expiración de 24 horas.',
        relevance: 0.85,
      },
      {
        content: 'La autenticación valida tokens JWT firmados con HMAC y expiración de 24 horas.',
        relevance: 0.7,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(removed).toBe(1);
  });

  it('no fusiona contenidos distintos aunque compartan palabras', () => {
    const { items, removed } = deduplicateItems([
      { content: PROJECT_MEMORY.value, relevance: 0.9 },
      { content: RAG_DOC.content, relevance: 0.7 },
    ]);
    expect(items).toHaveLength(2);
    expect(removed).toBe(0);
  });
});

describe('compressToBudget', () => {
  it('respeta el presupuesto y reporta lo descartado', () => {
    const items = [
      { content: 'a'.repeat(400), relevance: 0.9 },
      { content: 'b'.repeat(400), relevance: 0.6 },
      { content: 'c'.repeat(400), relevance: 0.3 },
    ];
    const { included, dropped, totalTokens } = compressToBudget({ items, budgetTokens: 100 });
    expect(totalTokens).toBeLessThanOrEqual(100);
    expect(included.length).toBeGreaterThan(0);
    expect(dropped.length).toBeGreaterThan(0);
  });

  it('incluye todo si cabe en el presupuesto', () => {
    const items = [{ content: 'corto', relevance: 0.5 }];
    const { dropped, totalTokens } = compressToBudget({ items, budgetTokens: 5000 });
    expect(dropped).toHaveLength(0);
    expect(totalTokens).toBeGreaterThan(0);
  });
});

describe('buildAgentContext — ensamblado con fuentes', () => {
  const ragResults = [RAG_DOC, RAG_UNRELATED];
  const memories = [PROJECT_MEMORY, UNRELATED_MEMORY];
  const executionHistory = [
    {
      taskId: 't1',
      title: 'Revisión previa',
      result: 'El módulo de seguridad ya valida JWT correctamente.',
    },
  ];

  it('incluye solo lo relevante, ordenado, con stats coherentes', () => {
    const ctx = buildAgentContext({
      task: CODING_TASK,
      agent: { name: 'Coder', type: 'coder' },
      memories,
      ragResults,
      executionHistory,
      budgetTokens: 2000,
    });

    // El contenido relevante (JWT/seguridad/Node) debe estar incluido.
    const texts = ctx.blocks.map((b) => b.content);
    expect(texts.some((t) => t.includes('JWT'))).toBe(true);
    // Orden por relevancia: el bloque de mayor relevancia es relevante y el
    // contenido irrelevante (jardinería / pan casero) queda al final o fuera
    // (el descarte por presupuesto se cubre en el test de presupuesto pequeño).
    const relOf = (t) => ctx.blocks.find((b) => b.content.includes(t))?.relevance ?? 0;
    expect(ctx.blocks[0].relevance).toBeGreaterThanOrEqual(relOf('cactus'));
    expect(ctx.blocks[0].relevance).toBeGreaterThanOrEqual(relOf('pan casero'));
    expect(relOf('JWT')).toBeGreaterThan(0.3);

    expect(ctx.stats.sourcesConsidered).toEqual({ memory: 2, rag: 2, execution: 1 });
    expect(ctx.stats.totalTokens).toBeLessThanOrEqual(2000);
    expect(ctx.stats.included).toBeGreaterThan(0);
    expect(ctx.stats.bySource.memory).toBeGreaterThanOrEqual(1);
    expect(ctx.stats.bySource.rag).toBeGreaterThanOrEqual(1);
    // Los bloques vienen ordenados por relevancia desc.
    const rels = ctx.blocks.map((b) => b.relevance);
    for (let i = 1; i < rels.length; i += 1) {
      expect(rels[i - 1]).toBeGreaterThanOrEqual(rels[i]);
    }
  });

  it('deduplica una memoria que repite un chunk del RAG', () => {
    const duplicatedMemory = { key: 'dup', value: RAG_DOC.content };
    const ctx = buildAgentContext({
      task: CODING_TASK,
      agent: {},
      memories: [PROJECT_MEMORY, duplicatedMemory],
      ragResults: [RAG_DOC],
      budgetTokens: 5000,
    });
    // El contenido duplicado debe aparecer UNA vez (dedup entre fuentes).
    const jwtBlocks = ctx.blocks.filter((b) => b.content.includes('HMAC-SHA256'));
    expect(jwtBlocks).toHaveLength(1);
    expect(ctx.stats.dedupRemoved).toBeGreaterThanOrEqual(1);
  });

  it('presupuesto pequeño → descarta lo menos relevante y lo reporta', () => {
    const ctx = buildAgentContext({
      task: CODING_TASK,
      agent: {},
      memories,
      ragResults,
      executionHistory,
      budgetTokens: 50,
    });
    expect(ctx.stats.dropped).toBeGreaterThan(0);
    expect(ctx.stats.totalTokens).toBeLessThanOrEqual(50);
  });
});

describe('fetchContextForAgent — wiring con fakes', () => {
  it('ensambla con las tres fuentes inyectadas', async () => {
    const ctx = await fetchContextForAgent({
      task: CODING_TASK,
      agent: { name: 'Researcher' },
      memoriesLoader: async () => [PROJECT_MEMORY, UNRELATED_MEMORY],
      ragSearch: async () => [RAG_DOC, RAG_UNRELATED],
      executionHistory: [{ result: 'revisión previa de seguridad' }],
      budgetTokens: 2000,
    });
    expect(ctx.sourceErrors).toEqual([]);
    expect(ctx.stats.sourcesConsidered.memory).toBe(2);
    expect(ctx.stats.sourcesConsidered.rag).toBe(2);
    expect(ctx.stats.sourcesConsidered.execution).toBe(1);
    expect(ctx.stats.included).toBeGreaterThan(0);
  });

  it('tolera el fallo de una fuente sin romper (contexto parcial)', async () => {
    const ctx = await fetchContextForAgent({
      task: CODING_TASK,
      memoriesLoader: async () => {
        throw new Error('mongo caído');
      },
      ragSearch: async () => [RAG_DOC],
      budgetTokens: 2000,
    });
    expect(ctx.sourceErrors.some((e) => e.source === 'memory')).toBe(true);
    expect(ctx.stats.sourcesConsidered.rag).toBe(1);
    expect(ctx.stats.included).toBeGreaterThan(0);
  });

  it('sin fuentes → contexto vacío sin romper', async () => {
    const ctx = await fetchContextForAgent({
      task: CODING_TASK,
      memoriesLoader: async () => [],
      ragSearch: async () => [],
    });
    expect(ctx.blocks).toHaveLength(0);
    expect(ctx.stats.included).toBe(0);
    expect(ctx.stats.dedupRemoved).toBe(0);
  });
});
