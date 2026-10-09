/**
 * NLPService Unit Tests
 * =======================
 */

const NLPService = require('../nlp/NLPService');

describe('NLPService', () => {
  let nlp;

  beforeEach(() => {
    nlp = new NLPService();
  });

  describe('tokenize', () => {
    test('tokenizes text into words', () => {
      const tokens = nlp.tokenize('Hello world this is a test');
      // tokenize filters words with length <= 1, keeps length >= 2
      expect(tokens).toEqual(['hello', 'world', 'this', 'is', 'test']);
    });

    test('handles empty string', () => {
      expect(nlp.tokenize('')).toEqual([]);
    });

    test('handles null', () => {
      expect(nlp.tokenize(null)).toEqual([]);
    });

    test('removes punctuation', () => {
      const tokens = nlp.tokenize('Hello, world! How are you?');
      expect(tokens).not.toContain('hello,');
      expect(tokens).not.toContain('world!');
    });
  });

  describe('removeStopWords', () => {
    test('removes common stop words', () => {
      const tokens = nlp.removeStopWords(['the', 'quick', 'brown', 'fox']);
      expect(tokens).toEqual(['quick', 'brown', 'fox']);
    });

    test('keeps meaningful words', () => {
      const tokens = nlp.removeStopWords(['ceramic', 'is', 'great']);
      expect(tokens).toContain('ceramic');
      expect(tokens).toContain('great');
      expect(tokens).not.toContain('is');
    });
  });

  describe('stem', () => {
    test('stems common suffixes', () => {
      expect(nlp.stem('running')).toBe('runn');
      expect(nlp.stem('connection')).toBe('connect');
      expect(nlp.stem('happiness')).toBe('happi');
      expect(nlp.stem('beautiful')).toBe('beauti');
    });

    test('handles short words', () => {
      expect(nlp.stem('is')).toBe('is');
      expect(nlp.stem('a')).toBe('a');
    });
  });

  describe('extractKeywords', () => {
    test('extracts most frequent meaningful words', () => {
      const keywords = nlp.extractKeywords('ceramic ceramic pottery pottery pottery wheel wheel', 3);
      expect(keywords.length).toBeLessThanOrEqual(3);
      expect(keywords).toContain('ceramic');
    });

    test('removes stop words from keywords', () => {
      const keywords = nlp.extractKeywords('the ceramic is very good', 5);
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('is');
    });
  });

  describe('similarity', () => {
    test('returns 1 for identical texts', () => {
      expect(nlp.similarity('hello world', 'hello world')).toBe(1);
    });

    test('returns 0 for completely different texts', () => {
      expect(nlp.similarity('cat dog', 'xyz abc')).toBe(0);
    });

    test('returns partial similarity', () => {
      const sim = nlp.similarity('ceramic wheel pottery', 'ceramic studio pottery');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('sentiment', () => {
    test('detects positive sentiment', () => {
      expect(nlp.sentiment('This is great and awesome')).toBeGreaterThan(0);
    });

    test('detects negative sentiment', () => {
      expect(nlp.sentiment('This is terrible and awful')).toBeLessThan(0);
    });

    test('returns 0 for neutral text', () => {
      expect(nlp.sentiment('The weather is today')).toBe(0);
    });
  });

  describe('ngrams', () => {
    test('generates bigrams', () => {
      const bigrams = nlp.ngrams('ceramic wheel pottery', 2);
      expect(bigrams).toContain('ceramic wheel');
      expect(bigrams).toContain('wheel pottery');
    });

    test('generates trigrams', () => {
      const trigrams = nlp.ngrams('one two three four', 3);
      expect(trigrams).toContain('one two three');
      expect(trigrams).toContain('two three four');
    });
  });
});
