/**
 * SignalEngine Unit Tests
 * ========================
 */

const SignalEngine = require('../signals/SignalEngine');
const EvidenceEngine = require('../evidence/EvidenceEngine');

describe('SignalEngine', () => {
  let engine;
  let evidence;

  beforeEach(() => {
    evidence = new EvidenceEngine();
    engine = new SignalEngine(evidence);
  });

  describe('analyzeContent', () => {
    test('detects purchase intent', () => {
      const content = {
        id: 'test_1',
        source: 'reddit',
        title: 'Where can I buy a ceramic wheel?',
        body: 'I want to purchase a pottery wheel for my studio. What is the best deal?',
        url: 'https://reddit.com/test',
        author: { username: 'testuser', platform: 'reddit' },
        topics: ['ceramics'],
      };
      const signals = engine.analyzeContent(content);
      expect(signals.length).toBeGreaterThan(0);
      const purchaseSignal = signals.find((s) => s.type === 'purchase_intent');
      expect(purchaseSignal).toBeDefined();
      expect(purchaseSignal.confidence).toBeGreaterThan(0);
    });

    test('detects questions', () => {
      const content = {
        id: 'test_2',
        source: 'bluesky',
        title: '',
        body: 'How do I set up a ceramic studio? Any suggestions for beginners?',
        url: 'https://bsky.app/test',
        author: { username: 'testuser', platform: 'bluesky' },
        topics: ['ceramics'],
      };
      const signals = engine.analyzeContent(content);
      const questionSignal = signals.find((s) => s.type === 'question');
      expect(questionSignal).toBeDefined();
    });

    test('detects complaints', () => {
      const content = {
        id: 'test_3',
        source: 'reddit',
        title: 'This wheel is terrible',
        body: 'My ceramic wheel is broken and doesn\'t work. Total waste of money. So frustrating.',
        url: 'https://reddit.com/test',
        author: { username: 'testuser', platform: 'reddit' },
        topics: ['ceramics'],
      };
      const signals = engine.analyzeContent(content);
      const complaintSignal = signals.find((s) => s.type === 'complaint');
      expect(complaintSignal).toBeDefined();
    });

    test('detects comparisons', () => {
      const content = {
        id: 'test_4',
        source: 'hackernews',
        title: '',
        body: 'Which is better, Brand A vs Brand B for pottery wheels?',
        url: 'https://news.ycombinator.com/test',
        author: { username: 'testuser', platform: 'hackernews' },
        topics: ['pottery'],
      };
      const signals = engine.analyzeContent(content);
      const comparisonSignal = signals.find((s) => s.type === 'comparison');
      expect(comparisonSignal).toBeDefined();
    });

    test('returns empty for neutral content', () => {
      const content = {
        id: 'test_5',
        source: 'rss',
        title: 'Weather Update',
        body: 'Today will be sunny with a high of 75 degrees.',
        url: 'https://example.com/weather',
        author: { username: 'weatherbot', platform: 'rss' },
        topics: ['weather'],
      };
      const signals = engine.analyzeContent(content);
      expect(signals.length).toBe(0);
    });

    test('handles null content', () => {
      const signals = engine.analyzeContent(null);
      expect(signals).toEqual([]);
    });

    test('handles empty body', () => {
      const signals = engine.analyzeContent({ id: 'test', source: 'reddit', body: '' });
      expect(signals).toEqual([]);
    });

    test('limits signals per content to 5', () => {
      const content = {
        id: 'test_6',
        source: 'reddit',
        title: '',
        body: 'I want to buy the best cheap alternative. How much does it cost? Where can I get it? Need help recommendation suggestion.',
        url: 'https://reddit.com/test',
        author: { username: 'testuser', platform: 'reddit' },
        topics: [],
      };
      const signals = engine.analyzeContent(content);
      expect(signals.length).toBeLessThanOrEqual(5);
    });
  });

  describe('analyzeBatch', () => {
    test('analyzes multiple content items', () => {
      const contents = [
        { id: 'c1', source: 'reddit', body: 'Want to buy a wheel', url: '', author: { username: 'u1', platform: 'reddit' }, topics: [] },
        { id: 'c2', source: 'bluesky', body: 'How to make pottery?', url: '', author: { username: 'u2', platform: 'bluesky' }, topics: [] },
        { id: 'c3', source: 'rss', body: 'Sunny today', url: '', author: { username: 'u3', platform: 'rss' }, topics: [] },
      ];
      const signals = engine.analyzeBatch(contents);
      expect(signals.length).toBeGreaterThan(0);
    });
  });

  describe('getSignalSummary', () => {
    test('returns summary statistics', () => {
      const content = {
        id: 'test_summary',
        source: 'reddit',
        body: 'I want to buy a wheel. How much does it cost?',
        url: '',
        author: { username: 'u', platform: 'reddit' },
        topics: [],
      };
      engine.analyzeContent(content);
      const summary = engine.getSignalSummary();
      expect(summary.totalSignals).toBeGreaterThan(0);
      expect(summary.byType).toBeDefined();
      expect(summary.avgConfidence).toBeGreaterThan(0);
    });
  });
});
