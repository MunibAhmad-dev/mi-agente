/**
 * DedupEngine Unit Tests
 * =======================
 */

const DedupEngine = require('../dedup/DedupEngine');

describe('DedupEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new DedupEngine();
  });

  describe('checkDuplicate', () => {
    test('detects duplicate by source ID', () => {
      const content1 = { id: 'c1', source: 'reddit', sourceId: 'abc123', url: '', hash: 'h1', body: 'test' };
      const content2 = { id: 'c2', source: 'reddit', sourceId: 'abc123', url: '', hash: 'h2', body: 'test' };
      engine.register(content1);
      const result = engine.checkDuplicate(content2);
      expect(result.isDuplicate).toBe(true);
      expect(result.method).toBe('source_id');
    });

    test('detects duplicate by URL', () => {
      const content1 = { id: 'c1', source: 'reddit', sourceId: '', url: 'https://example.com/post', hash: 'h1', body: 'test' };
      const content2 = { id: 'c2', source: 'bluesky', sourceId: 'bs_123', url: 'https://example.com/post', hash: 'h2', body: 'test' };
      engine.register(content1);
      const result = engine.checkDuplicate(content2);
      expect(result.isDuplicate).toBe(true);
      expect(result.method).toBe('url');
    });

    test('detects duplicate by hash', () => {
      const content1 = { id: 'c1', source: 'reddit', sourceId: 'r1', url: '', hash: 'same_hash', body: 'test' };
      const content2 = { id: 'c2', source: 'bluesky', sourceId: 'bs1', url: '', hash: 'same_hash', body: 'test' };
      engine.register(content1);
      const result = engine.checkDuplicate(content2);
      expect(result.isDuplicate).toBe(true);
      expect(result.method).toBe('hash');
    });

    test('allows unique content', () => {
      const content1 = { id: 'c1', source: 'reddit', sourceId: 'r1', url: 'https://a.com', hash: 'h1', body: 'unique content one' };
      const content2 = { id: 'c2', source: 'bluesky', sourceId: 'bs1', url: 'https://b.com', hash: 'h2', body: 'different content two' };
      engine.register(content1);
      const result = engine.checkDuplicate(content2);
      expect(result.isDuplicate).toBe(false);
    });

    test('handles null content', () => {
      const result = engine.checkDuplicate(null);
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe('deduplicateBatch', () => {
    test('removes duplicates from batch', () => {
      const contents = [
        { id: 'c1', source: 'reddit', sourceId: 'r1', url: 'https://a.com', hash: 'h1', body: 'content one' },
        { id: 'c2', source: 'reddit', sourceId: 'r1', url: 'https://a.com', hash: 'h1', body: 'content one' }, // duplicate
        { id: 'c3', source: 'bluesky', sourceId: 'bs1', url: 'https://b.com', hash: 'h2', body: 'content two' },
      ];
      const result = engine.deduplicateBatch(contents);
      expect(result.unique.length).toBe(2);
      expect(result.duplicates.length).toBe(1);
      expect(result.stats.reductionRate).toBe(33);
    });

    test('keeps all unique content', () => {
      const contents = [
        { id: 'c1', source: 'reddit', sourceId: 'r1', url: 'https://a.com', hash: 'h1', body: 'one' },
        { id: 'c2', source: 'bluesky', sourceId: 'bs1', url: 'https://b.com', hash: 'h2', body: 'two' },
        { id: 'c3', source: 'hn', sourceId: 'hn1', url: 'https://c.com', hash: 'h3', body: 'three' },
      ];
      const result = engine.deduplicateBatch(contents);
      expect(result.unique.length).toBe(3);
      expect(result.duplicates.length).toBe(0);
    });
  });

  describe('getStats', () => {
    test('returns correct stats', () => {
      engine.register({ id: 'c1', source: 'reddit', sourceId: 'r1', url: 'https://a.com', hash: 'h1', body: 'test' });
      const stats = engine.getStats();
      expect(stats.urls).toBe(1);
      expect(stats.hashes).toBe(1);
      expect(stats.sourceIds).toBe(1);
    });
  });
});
