/**
 * SocialGraph Unit Tests
 * =======================
 */

const SocialGraph = require('../graph/SocialGraph');

describe('SocialGraph', () => {
  let graph;

  beforeEach(() => {
    graph = new SocialGraph();
  });

  describe('addNode', () => {
    test('adds a node', () => {
      const node = graph.addNode({ id: 'n1', type: 'account', label: 'John' });
      expect(node.id).toBe('n1');
      expect(node.type).toBe('account');
    });

    test('merges data for existing node', () => {
      graph.addNode({ id: 'n1', type: 'account', data: { followers: 100 } });
      const updated = graph.addNode({ id: 'n1', type: 'account', data: { posts: 50 } });
      expect(updated.data.followers).toBe(100);
      expect(updated.data.posts).toBe(50);
    });
  });

  describe('addEdge', () => {
    test('adds an edge between nodes', () => {
      graph.addNode({ id: 'n1', type: 'account' });
      graph.addNode({ id: 'n2', type: 'account' });
      const edge = graph.addEdge({ source: 'n1', target: 'n2', type: 'follows', weight: 1.0 });
      expect(edge.source).toBe('n1');
      expect(edge.target).toBe('n2');
      expect(edge.type).toBe('follows');
    });

    test('increases weight for duplicate edges', () => {
      graph.addNode({ id: 'n1', type: 'account' });
      graph.addNode({ id: 'n2', type: 'account' });
      graph.addEdge({ source: 'n1', target: 'n2', type: 'follows', weight: 1.0 });
      const edge2 = graph.addEdge({ source: 'n1', target: 'n2', type: 'follows', weight: 1.0 });
      expect(edge2.weight).toBeGreaterThan(1.0);
    });
  });

  describe('getNeighbors', () => {
    test('returns neighbors of a node', () => {
      graph.addNode({ id: 'n1', type: 'account' });
      graph.addNode({ id: 'n2', type: 'account' });
      graph.addNode({ id: 'n3', type: 'account' });
      graph.addEdge({ source: 'n1', target: 'n2', type: 'follows' });
      graph.addEdge({ source: 'n1', target: 'n3', type: 'mentions' });
      const neighbors = graph.getNeighbors('n1');
      expect(neighbors.length).toBe(2);
    });

    test('filters by edge type', () => {
      graph.addNode({ id: 'n1', type: 'account' });
      graph.addNode({ id: 'n2', type: 'account' });
      graph.addNode({ id: 'n3', type: 'account' });
      graph.addEdge({ source: 'n1', target: 'n2', type: 'follows' });
      graph.addEdge({ source: 'n1', target: 'n3', type: 'mentions' });
      const follows = graph.getNeighbors('n1', 'follows');
      expect(follows.length).toBe(1);
      expect(follows[0].node.id).toBe('n2');
    });
  });

  describe('findPath', () => {
    test('finds path between connected nodes', () => {
      graph.addNode({ id: 'n1', type: 'account' });
      graph.addNode({ id: 'n2', type: 'account' });
      graph.addNode({ id: 'n3', type: 'account' });
      graph.addEdge({ source: 'n1', target: 'n2', type: 'follows' });
      graph.addEdge({ source: 'n2', target: 'n3', type: 'follows' });
      const path = graph.findPath('n1', 'n3');
      expect(path).not.toBeNull();
      expect(path.length).toBe(3);
    });

    test('returns null for disconnected nodes', () => {
      graph.addNode({ id: 'n1', type: 'account' });
      graph.addNode({ id: 'n2', type: 'account' });
      const path = graph.findPath('n1', 'n2');
      expect(path).toBeNull();
    });
  });

  describe('detectCommunities', () => {
    test('detects communities', () => {
      // Create two communities
      graph.addNode({ id: 'a1', type: 'account' });
      graph.addNode({ id: 'a2', type: 'account' });
      graph.addNode({ id: 'b1', type: 'account' });
      graph.addNode({ id: 'b2', type: 'account' });
      graph.addEdge({ source: 'a1', target: 'a2', type: 'follows', weight: 5 });
      graph.addEdge({ source: 'b1', target: 'b2', type: 'follows', weight: 5 });
      const communities = graph.detectCommunities();
      expect(communities.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('calculateInfluence', () => {
    test('calculates influence score', () => {
      graph.addNode({ id: 'n1', type: 'account' });
      for (let i = 0; i < 10; i++) {
        graph.addNode({ id: `n${i + 2}`, type: 'account' });
        graph.addEdge({ source: 'n1', target: `n${i + 2}`, type: 'follows', weight: 2 });
      }
      const influence = graph.calculateInfluence('n1');
      expect(influence).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    test('returns graph statistics', () => {
      graph.addNode({ id: 'n1', type: 'account' });
      graph.addNode({ id: 'n2', type: 'content' });
      graph.addEdge({ source: 'n1', target: 'n2', type: 'posted' });
      const stats = graph.getStats();
      expect(stats.nodes).toBe(2);
      expect(stats.edges).toBe(1);
      expect(stats.nodeTypes.account).toBe(1);
      expect(stats.nodeTypes.content).toBe(1);
    });
  });
});
