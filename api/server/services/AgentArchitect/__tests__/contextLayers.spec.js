/**
 * contextLayers.spec.js — Fase 4: capas L0–L7 + artifacts del Context Engine.
 */

const {
  Layer,
  LAYER_PRIORITY,
  LAYER_META,
  makeBlock,
  assembleLayeredContext,
  ArtifactStore,
  toArtifactBlock,
} = require('../contextLayers');

describe('contextLayers (Fase 4 — Context Engine)', () => {
  describe('constantes de capas', () => {
    it('define 8 capas L0–L7', () => {
      expect(LAYER_PRIORITY).toHaveLength(8);
      expect(LAYER_PRIORITY[0]).toBe(Layer.L0_SYSTEM);
      expect(LAYER_PRIORITY[7]).toBe(Layer.L7_ARTIFACT);
    });

    it('cada capa tiene metadatos con label', () => {
      for (const layer of LAYER_PRIORITY) {
        expect(LAYER_META[layer]).toBeDefined();
        expect(LAYER_META[layer].label).toBeTruthy();
      }
    });
  });

  describe('makeBlock', () => {
    it('crea un bloque con layer, content y tokens estimados', () => {
      const block = makeBlock(Layer.L2_TASK, 'analiza el login');
      expect(block.layer).toBe(Layer.L2_TASK);
      expect(block.content).toBe('analiza el login');
      expect(block.tokens).toBeGreaterThan(0);
      expect(block.source).toBe(Layer.L2_TASK);
    });

    it('respeta tokens explícitos y metadata', () => {
      const block = makeBlock(Layer.L3_CODE, 'fn foo() {}', {
        tokens: 42,
        metadata: { file: 'a.ts' },
        relevance: 0.8,
      });
      expect(block.tokens).toBe(42);
      expect(block.metadata).toEqual({ file: 'a.ts' });
      expect(block.relevance).toBe(0.8);
    });

    it('usa score como relevancia si no hay relevance', () => {
      const block = makeBlock(Layer.L5_RAG, 'texto', { score: 0.33 });
      expect(block.relevance).toBe(0.33);
    });
  });

  describe('assembleLayeredContext', () => {
    it('respeta prioridad de capa: system antes que rag', () => {
      const blocks = [
        makeBlock(Layer.L5_RAG, 'resultado rag relevante'),
        makeBlock(Layer.L0_SYSTEM, 'eres un agente de coding'),
        makeBlock(Layer.L2_TASK, 'corrige el bug'),
      ];
      const { included } = assembleLayeredContext({ blocks, budgetTokens: 10000 });
      expect(included[0].layer).toBe(Layer.L0_SYSTEM);
      expect(included[1].layer).toBe(Layer.L2_TASK);
      expect(included[2].layer).toBe(Layer.L5_RAG);
    });

    it('dedup elimina contenido exacto duplicado', () => {
      const blocks = [
        makeBlock(Layer.L4_MEMORY, 'convención: usar tabs'),
        makeBlock(Layer.L5_RAG, 'convención: usar tabs'),
      ];
      const { included, dropped } = assembleLayeredContext({ blocks, budgetTokens: 10000 });
      expect(included).toHaveLength(1);
      expect(dropped).toHaveLength(1);
      expect(dropped[0].dropReason).toBe('duplicate');
    });

    it('respeta el presupuesto y marca dropReason=budget', () => {
      const big = 'x'.repeat(1000);
      const blocks = [
        makeBlock(Layer.L0_SYSTEM, 'sys'), // no truncable
        makeBlock(Layer.L5_RAG, big, { tokens: 5000 }),
        makeBlock(Layer.L5_RAG, big + '2', { tokens: 5000 }),
      ];
      const { included, dropped, totalTokens } = assembleLayeredContext({
        blocks,
        budgetTokens: 6000,
      });
      // system entra (no truncable), uno de los rag entra, el otro cae por budget
      expect(included.some((b) => b.layer === Layer.L0_SYSTEM)).toBe(true);
      expect(dropped.some((b) => b.dropReason === 'budget')).toBe(true);
      expect(totalTokens).toBeLessThanOrEqual(6000 + 10);
    });

    it('capas no truncables entran aunque excedan el budget', () => {
      const big = 'y'.repeat(2000);
      const blocks = [makeBlock(Layer.L0_SYSTEM, big)];
      const { included } = assembleLayeredContext({ blocks, budgetTokens: 100 });
      expect(included).toHaveLength(1);
    });

    it('devuelve byLayer con conteos', () => {
      const blocks = [
        makeBlock(Layer.L0_SYSTEM, 's'),
        makeBlock(Layer.L4_MEMORY, 'm1'),
        makeBlock(Layer.L4_MEMORY, 'm2'),
      ];
      const { byLayer } = assembleLayeredContext({ blocks, budgetTokens: 10000 });
      expect(byLayer[Layer.L0_SYSTEM]).toBe(1);
      expect(byLayer[Layer.L4_MEMORY]).toBe(2);
    });

    it('ordena por relevancia dentro de la misma capa', () => {
      const blocks = [
        makeBlock(Layer.L5_RAG, 'poco relevante', { relevance: 0.1 }),
        makeBlock(Layer.L5_RAG, 'muy relevante', { relevance: 0.9 }),
      ];
      const { included } = assembleLayeredContext({ blocks, budgetTokens: 10000 });
      expect(included[0].relevance).toBe(0.9);
      expect(included[1].relevance).toBe(0.1);
    });
  });

  describe('ArtifactStore', () => {
    it('put devuelve artifact:// URI y get recupera el contenido', () => {
      const store = new ArtifactStore();
      const uri = store.put('log', 'linea1\nlinea2\n'.repeat(100));
      expect(uri).toMatch(/^artifact:\/\/log\/\d+$/);
      const item = store.get(uri);
      expect(item.kind).toBe('log');
      expect(item.content).toContain('linea1');
      expect(item.tokens).toBeGreaterThan(0);
    });

    it('summary devuelve un resumen sin el contenido grande', () => {
      const store = new ArtifactStore();
      const uri = store.put('diff', 'x'.repeat(5000), { title: 'big diff' });
      const s = store.summary(uri);
      expect(s.uri).toBe(uri);
      expect(s.kind).toBe('diff');
      expect(s.tokens).toBeGreaterThan(0);
      expect(s.preview.length).toBeLessThanOrEqual(200);
      expect(s.title).toBe('big diff');
    });

    it('list devuelve todos los artifacts', () => {
      const store = new ArtifactStore();
      store.put('log', 'a');
      store.put('diff', 'b');
      expect(store.list()).toHaveLength(2);
    });

    it('clear vacía el store', () => {
      const store = new ArtifactStore();
      store.put('log', 'a');
      store.clear();
      expect(store.list()).toHaveLength(0);
    });
  });

  describe('toArtifactBlock', () => {
    it('guarda el contenido y devuelve un bloque L7 con resumen + URI', () => {
      const store = new ArtifactStore();
      const block = toArtifactBlock(store, 'log', 'output enorme'.repeat(500), {
        title: 'build log',
      });
      expect(block.layer).toBe(Layer.L7_ARTIFACT);
      expect(block.artifactUri).toMatch(/^artifact:\/\/log\//);
      expect(block.content).toContain('artifact:log');
      expect(block.content).toContain(block.artifactUri);
      // el contenido grande NO está en el bloque, solo el resumen
      expect(block.content.length).toBeLessThan(300);
      // pero sí está en el store
      expect(store.get(block.artifactUri).content).toContain('output enorme');
    });
  });
});
