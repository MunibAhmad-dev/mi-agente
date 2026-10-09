/**
 * memoryService.spec.js — Fase 10: Memory por capas + recuperación por relevancia.
 */

const { MemoryLayer, MemoryType, MemoryService } = require('../memoryService');

describe('memoryService (Fase 10 — Memory)', () => {
  let mem;
  beforeEach(() => {
    mem = new MemoryService();
  });

  describe('remember / get / forget', () => {
    it('guarda y recupera por id', () => {
      const e = mem.remember({ layer: MemoryLayer.PROJECT, content: 'usa Jest' });
      expect(e.id).toBeDefined();
      expect(mem.get(e.id).content).toBe('usa Jest');
    });

    it('forget elimina', () => {
      const e = mem.remember({ layer: MemoryLayer.SESSION, content: 'x' });
      expect(mem.forget(e.id)).toBe(true);
      expect(mem.get(e.id)).toBeNull();
    });

    it('guarda metadatos (type, tags, importance, projectId)', () => {
      const e = mem.remember({
        layer: MemoryLayer.HISTORICAL,
        type: MemoryType.PATTERN,
        content: 'patrón X',
        projectId: 'p1',
        userId: 'u1',
        tags: ['lint'],
        importance: 0.9,
      });
      expect(e.type).toBe(MemoryType.PATTERN);
      expect(e.projectId).toBe('p1');
      expect(e.tags).toContain('lint');
      expect(e.importance).toBe(0.9);
    });
  });

  describe('recall por relevancia', () => {
    it('devuelve top-K ordenado por score', () => {
      mem.remember({ layer: MemoryLayer.SHORT, content: 'reciente' });
      mem.remember({ layer: MemoryLayer.HISTORICAL, content: 'viejo', importance: 0.1 });
      const r = mem.recall({ topK: 2 });
      expect(r).toHaveLength(2);
      // SHORT tiene mayor layerWeight (1.5) y es más reciente → primero
      expect(r[0].content).toBe('reciente');
    });

    it('boost por match de query en content', () => {
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'usa Jest para tests' });
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'otra cosa' });
      const r = mem.recall({ query: 'jest', topK: 2 });
      expect(r[0].content).toContain('Jest');
    });

    it('boost por match de query en tags', () => {
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'a', tags: ['testing'] });
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'b', tags: ['other'] });
      const r = mem.recall({ query: 'test', topK: 2 });
      expect(r[0].content).toBe('a');
    });

    it('filtra por capa', () => {
      mem.remember({ layer: MemoryLayer.SHORT, content: 's' });
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'p' });
      const r = mem.recall({ layer: MemoryLayer.PROJECT });
      expect(r).toHaveLength(1);
      expect(r[0].layer).toBe(MemoryLayer.PROJECT);
    });

    it('incrementa frecuencia al recuperar (refuerzo)', () => {
      const e = mem.remember({ layer: MemoryLayer.SHORT, content: 'x' });
      mem.recall({ topK: 5 });
      expect(e.frequency).toBeGreaterThan(0);
    });

    it('importance alta sube el score', () => {
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'normal', importance: 0 });
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'critico', importance: 1 });
      const r = mem.recall({ topK: 2 });
      expect(r[0].content).toBe('critico');
    });
  });

  describe('evicción SHORT (LRU)', () => {
    it('evicta los más viejos al exceder maxShort', () => {
      mem.maxShort = 3;
      const ids = [];
      for (let i = 0; i < 5; i += 1) {
        const e = mem.remember({ layer: MemoryLayer.SHORT, content: `e${i}` });
        ids.push(e.id);
      }
      // solo quedan 3 SHORT
      const shorts = mem.recall({ layer: MemoryLayer.SHORT, topK: 50 });
      expect(shorts).toHaveLength(3);
      // los más nuevos sobreviven
      const survivingIds = shorts.map((s) => s.id);
      expect(survivingIds).toContain(ids[4]);
      expect(survivingIds).not.toContain(ids[0]);
    });
  });

  describe('clear', () => {
    it('limpia una capa', () => {
      mem.remember({ layer: MemoryLayer.SHORT, content: 's' });
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'p' });
      mem.clear(MemoryLayer.SHORT);
      const s = mem.stats();
      expect(s.byLayer[MemoryLayer.SHORT]).toBeUndefined();
      expect(s.byLayer[MemoryLayer.PROJECT]).toBe(1);
    });

    it('limpia todo', () => {
      mem.remember({ layer: MemoryLayer.SHORT, content: 's' });
      mem.clear();
      expect(mem.stats().total).toBe(0);
    });
  });

  describe('stats', () => {
    it('cuenta por capa', () => {
      mem.remember({ layer: MemoryLayer.SHORT, content: 'a' });
      mem.remember({ layer: MemoryLayer.SHORT, content: 'b' });
      mem.remember({ layer: MemoryLayer.PROJECT, content: 'c' });
      const s = mem.stats();
      expect(s.total).toBe(3);
      expect(s.byLayer[MemoryLayer.SHORT]).toBe(2);
      expect(s.byLayer[MemoryLayer.PROJECT]).toBe(1);
    });
  });
});
