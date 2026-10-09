'use strict';

jest.mock('~/server/services/UniversalSearch/UniversalSearchService', () => ({
  universalSearch: jest.fn(async (query) => ({
    results: [
      { url: 'https://example.com/1', title: 'Result 1', snippet: `Info about ${query}`, score: 0.9 },
      { url: 'https://example.com/2', title: 'Result 2', snippet: 'More info', score: 0.7 },
    ],
  })),
}), { virtual: true });

const DeeperSearchV2 = require('../DeeperSearchV2');

describe('DeeperSearchV2._multiSourceSearch — real wiring', () => {
  let ds;

  beforeEach(() => {
    ds = new DeeperSearchV2({ maxSources: 10 });
    ds.initialize();
  });

  test('_multiSourceSearch returns results from UniversalSearch', async () => {
    const results = await ds._multiSourceSearch('test query');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).not.toBe('local');
    expect(results[0].url).toMatch(/example\.com/);
  });

  test('research() returns sources from real search', async () => {
    const result = await ds.research('AI market trends');
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('falls back to placeholder when UniversalSearch throws', async () => {
    const { universalSearch } = require('~/server/services/UniversalSearch/UniversalSearchService');
    universalSearch.mockRejectedValueOnce(new Error('network error'));
    const results = await ds._multiSourceSearch('fallback test');
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('local');
    expect(results[0].reliability).toBe(0.3);
  });

  test('additionalSources are prepended to results', async () => {
    const extra = [{ url: 'https://custom.io', title: 'Custom', snippet: 'extra', reliability: 0.8 }];
    const results = await ds._multiSourceSearch('query', extra);
    expect(results[0].url).toBe('https://custom.io');
    expect(results.length).toBeGreaterThan(1);
  });

  test('reliability is clamped to [0, 1]', async () => {
    const { universalSearch } = require('~/server/services/UniversalSearch/UniversalSearchService');
    universalSearch.mockResolvedValueOnce({ results: [{ url: 'x', snippet: 's', score: 9.5 }] });
    const results = await ds._multiSourceSearch('q');
    expect(results.find((r) => r.url === 'x').reliability).toBeLessThanOrEqual(1);
  });
});
