/**
 * IntentParser Unit Tests
 * ========================
 */

const IntentParser = require('../intent/IntentParser');

describe('IntentParser', () => {
  let parser;

  beforeEach(() => {
    parser = new IntentParser();
  });

  describe('parse', () => {
    test('detects audience intent', () => {
      const result = parser.parse('Find people interested in ceramic workshops');
      expect(result.intentType).toBe('find_audience');
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('detects creator intent', () => {
      const result = parser.parse('Find YouTubers who make pottery videos');
      expect(result.intentType).toBe('find_creators');
    });

    test('detects community intent', () => {
      const result = parser.parse('Find Reddit community groups about ceramics');
      expect(result.intentType).toBe('find_communities');
    });

    test('detects market analysis intent', () => {
      const result = parser.parse('Analyze the market for ceramic wheels');
      expect(result.intentType).toBe('analyze_market');
    });

    test('detects trend intent', () => {
      const result = parser.parse('What are the trending topics in ceramics?');
      expect(result.intentType).toBe('detect_trends');
    });

    test('detects opportunity intent', () => {
      const result = parser.parse('Find unmet needs and pain points in pottery');
      expect(result.intentType).toBe('find_opportunities');
    });

    test('extracts topics', () => {
      const result = parser.parse('Find people interested in ceramic pottery wheels');
      expect(result.topics).toContain('ceramic');
      expect(result.topics).toContain('pottery');
      expect(result.topics).toContain('wheels');
    });

    test('extracts platform mentions', () => {
      const result = parser.parse('Search Reddit for ceramic discussions');
      expect(result.sources).toContain('reddit');
    });

    test('infers default sources', () => {
      const result = parser.parse('Find people interested in AI');
      expect(result.sources.length).toBeGreaterThan(0);
    });

    test('handles empty query', () => {
      const result = parser.parse('');
      expect(result.intentType).toBe('search_content');
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('handles null query', () => {
      const result = parser.parse(null);
      expect(result.intentType).toBe('search_content');
    });

    test('infers time range from query', () => {
      const result = parser.parse('What happened today in tech?');
      expect(result.timeRange).toBe('today');
    });

    test('defaults to 30d time range', () => {
      const result = parser.parse('Find ceramic trends');
      expect(result.timeRange).toBe('30d');
    });
  });

  describe('createSearchPlan', () => {
    test('creates a complete search plan', () => {
      const plan = parser.createSearchPlan('Find people interested in ceramic wheels on Reddit');
      expect(plan.objective).toBe('Find people interested in ceramic wheels on Reddit');
      expect(plan.queries.length).toBeGreaterThan(0);
      expect(plan.sources).toContain('reddit');
      expect(plan.maxResults).toBe(50);
      expect(plan.evidenceRequirements).toBeDefined();
    });

    test('decomposes complex queries', () => {
      const plan = parser.createSearchPlan('Find audience for ceramic workshops and classes');
      expect(plan.queries.length).toBeGreaterThan(1);
    });
  });
});
