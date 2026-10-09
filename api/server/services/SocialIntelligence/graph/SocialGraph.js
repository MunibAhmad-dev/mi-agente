/**
 * SocialGraph — In-memory graph for social relationships
 * ========================================================
 * Maps entities (accounts, content, topics, communities) and their relationships.
 */

const { createLogger } = require('../logger');
const { RelationshipType } = require('../types');

const logger = createLogger('SocialGraph');

class SocialGraph {
  constructor() {
    this._nodes = new Map(); // id → node
    this._edges = new Map(); // sourceId:targetId → edge
    this._adjacency = new Map(); // nodeId → Set of edge keys
  }

  /**
   * Add a node to the graph.
   * @param {object} params
   * @returns {object} Node
   */
  addNode({ id, type, label = '', data = {} }) {
    if (this._nodes.has(id)) {
      // Merge data
      const existing = this._nodes.get(id);
      Object.assign(existing.data, data);
      return existing;
    }
    const node = { id, type, label, data, createdAt: Date.now() };
    this._nodes.set(id, node);
    this._adjacency.set(id, new Set());
    return node;
  }

  /**
   * Add an edge (relationship) between two nodes.
   * @param {object} params
   * @returns {object} Edge
   */
  addEdge({ source, target, type, weight = 1.0, data = {} }) {
    const edgeKey = `${source}:${target}:${type}`;
    if (this._edges.has(edgeKey)) {
      const existing = this._edges.get(edgeKey);
      existing.weight = Math.min(existing.weight + 0.1, 10);
      return existing;
    }
    const edge = { source, target, type, weight, data, createdAt: Date.now() };
    this._edges.set(edgeKey, edge);
    this._adjacency.get(source)?.add(edgeKey);
    this._adjacency.get(target)?.add(edgeKey);
    return edge;
  }

  /**
   * Get all nodes connected to a given node.
   * @param {string} nodeId
   * @param {string} [edgeType] - Filter by relationship type
   * @returns {object[]}
   */
  getNeighbors(nodeId, edgeType = null) {
    const edgeKeys = this._adjacency.get(nodeId) || new Set();
    const neighbors = [];
    for (const key of edgeKeys) {
      const edge = this._edges.get(key);
      if (!edge) continue;
      if (edgeType && edge.type !== edgeType) continue;
      const neighborId = edge.source === nodeId ? edge.target : edge.source;
      const neighborNode = this._nodes.get(neighborId);
      if (neighborNode) {
        neighbors.push({ node: neighborNode, edge });
      }
    }
    return neighbors.sort((a, b) => b.edge.weight - a.edge.weight);
  }

  /**
   * Find shortest path between two nodes.
   * @param {string} startId
   * @param {string} endId
   * @param {number} maxDepth
   * @returns {object[]|null} Path or null
   */
  findPath(startId, endId, maxDepth = 5) {
    if (startId === endId) return [{ id: startId }];
    const visited = new Set([startId]);
    const queue = [[startId]];

    while (queue.length > 0) {
      const path = queue.shift();
      if (path.length > maxDepth) return null;
      const current = path[path.length - 1];
      const edgeKeys = this._adjacency.get(current) || new Set();

      for (const key of edgeKeys) {
        const edge = this._edges.get(key);
        if (!edge) continue;
        const next = edge.source === current ? edge.target : edge.source;
        if (next === endId) return [...path, next].map((id) => ({ id, node: this._nodes.get(id) }));
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }
    return null;
  }

  /**
   * Detect communities (simple label propagation).
   * @returns {object[]} Communities
   */
  detectCommunities() {
    const communities = new Map(); // communityId → Set of nodeIds
    const labels = new Map(); // nodeId → communityLabel

    // Initialize: each node is its own community
    let label = 0;
    for (const [id] of this._nodes) {
      labels.set(id, label++);
    }

    // Iterate label propagation
    for (let iter = 0; iter < 10; iter++) {
      let changed = false;
      for (const [nodeId] of this._nodes) {
        const edgeKeys = this._adjacency.get(nodeId) || new Set();
        const neighborLabels = {};
        for (const key of edgeKeys) {
          const edge = this._edges.get(key);
          if (!edge) continue;
          const neighbor = edge.source === nodeId ? edge.target : edge.source;
          const nl = labels.get(neighbor);
          if (nl !== undefined) {
            neighborLabels[nl] = (neighborLabels[nl] || 0) + edge.weight;
          }
        }
        if (Object.keys(neighborLabels).length === 0) continue;
        const maxLabel = Object.entries(neighborLabels).sort((a, b) => b[1] - a[1])[0][0];
        if (labels.get(nodeId) !== maxLabel) {
          labels.set(nodeId, parseInt(maxLabel));
          changed = true;
        }
      }
      if (!changed) break;
    }

    // Group by community
    for (const [nodeId, communityLabel] of labels) {
      if (!communities.has(communityLabel)) communities.set(communityLabel, new Set());
      communities.get(communityLabel).add(nodeId);
    }

    return Array.from(communities.entries()).map(([label, members]) => ({
      id: `comm_${label}`,
      members: [...members],
      size: members.size,
    })).filter((c) => c.size >= 2).sort((a, b) => b.size - a.size);
  }

  /**
   * Calculate influence score for a node.
   * @param {string} nodeId
   * @returns {number} 0-1 influence score
   */
  calculateInfluence(nodeId) {
    const edgeKeys = this._adjacency.get(nodeId) || new Set();
    if (edgeKeys.size === 0) return 0;

    let totalWeight = 0;
    let connections = 0;
    for (const key of edgeKeys) {
      const edge = this._edges.get(key);
      if (edge) {
        totalWeight += edge.weight;
        connections++;
      }
    }

    const degreeScore = Math.min(connections / 50, 1);
    const weightScore = Math.min(totalWeight / 100, 1);
    return Math.round((degreeScore * 0.5 + weightScore * 0.5) * 100) / 100;
  }

  /**
   * Get graph statistics.
   */
  getStats() {
    const nodeTypes = {};
    const edgeTypes = {};
    for (const [, node] of this._nodes) {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    }
    for (const [, edge] of this._edges) {
      edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
    }
    return {
      nodes: this._nodes.size,
      edges: this._edges.size,
      nodeTypes,
      edgeTypes,
      avgConnections: this._nodes.size > 0 ? Math.round((this._edges.size * 2) / this._nodes.size * 10) / 10 : 0,
    };
  }

  /**
   * Get node by ID.
   */
  getNode(id) { return this._nodes.get(id) || null; }

  /**
   * Get all nodes.
   */
  getAllNodes() { return Array.from(this._nodes.values()); }

  /**
   * Get all edges.
   */
  getAllEdges() { return Array.from(this._edges.values()); }

  /**
   * Clear the graph.
   */
  clear() {
    this._nodes.clear();
    this._edges.clear();
    this._adjacency.clear();
  }
}

module.exports = SocialGraph;
