'use strict';

const Graph = require('graphology');

/**
 * KnowledgeGraph - Real knowledge graph using graphology.
 * Stores entities and relations with properties, supports
 * traversal, path finding, communities, and causal chains.
 */
class KnowledgeGraph {
  constructor(config = {}) {
    this.config = config;
    this.graph = new Graph({ multi: true, allowSelfLoops: true });
    this.stats = { entities: 0, relations: 0, queries: 0, paths: 0 };
  }

  /**
   * Add an entity (node) to the graph.
   */
  addEntity(entity) {
    const id = entity.id || entity.name || `entity_${Date.now()}`;
    if (this.graph.hasNode(id)) {
      // Merge properties
      const attrs = this.graph.getNodeAttributes(id);
      this.graph.setNodeAttribute(id, 'updatedAt', Date.now());
      for (const [k, v] of Object.entries(entity)) {
        if (k !== 'id' && k !== 'name') this.graph.setNodeAttribute(id, k, v);
      }
    } else {
      this.graph.addNode(id, {
        name: entity.name || id,
        type: entity.type || 'unknown',
        content: entity.content || '',
        confidence: entity.confidence || 0.5,
        source: entity.source || 'unknown',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...entity,
      });
      this.stats.entities++;
    }
    return id;
  }

  /**
   * Add a relation (edge) between two entities.
   */
  addRelation(relation) {
    const from = relation.from || relation.source;
    const to = relation.to || relation.target;
    if (!from || !to) return null;

    // Ensure nodes exist
    if (!this.graph.hasNode(from)) this.addEntity({ id: from, name: from });
    if (!this.graph.hasNode(to)) this.addEntity({ id: to, name: to });

    const edgeKey = `${from}->${to}:${relation.type || 'related'}`;
    if (!this.graph.hasEdge(edgeKey)) {
      this.graph.addEdge(from, to, {
        key: edgeKey,
        type: relation.type || 'related',
        weight: relation.weight || 1,
        confidence: relation.confidence || 0.5,
        source: relation.source || 'unknown',
        createdAt: Date.now(),
        ...relation,
      });
      this.stats.relations++;
    }
    return edgeKey;
  }

  /**
   * Query entities by type or content.
   */
  query(queryText) {
    this.stats.queries++;
    const results = [];

    this.graph.forEachNode((id, attrs) => {
      const text = `${attrs.name || ''} ${attrs.content || ''} ${attrs.type || ''}`.toLowerCase();
      if (text.includes(String(queryText).toLowerCase())) {
        results.push({ id, ...attrs });
      }
    });

    return results;
  }

  /**
   * Get neighbors of an entity.
   */
  getNeighbors(entityId, depth = 1) {
    if (!this.graph.hasNode(entityId)) return [];

    const visited = new Set();
    const result = [];

    const traverse = (nodeId, currentDepth) => {
      if (currentDepth > depth || visited.has(nodeId)) return;
      visited.add(nodeId);

      this.graph.forEachNeighbor(nodeId, (neighborId, attrs) => {
        if (!visited.has(neighborId)) {
          const nodeAttrs = this.graph.getNodeAttributes(neighborId);
          result.push({ id: neighborId, ...nodeAttrs, depth: currentDepth });
          traverse(neighborId, currentDepth + 1);
        }
      });
    };

    traverse(entityId, 1);
    return result;
  }

  /**
   * Find shortest path between two entities.
   */
  findPath(from, to) {
    this.stats.paths++;
    if (!this.graph.hasNode(from) || !this.graph.hasNode(to)) return null;

    // BFS shortest path
    const queue = [[from]];
    const visited = new Set([from]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === to) {
        return path.map(id => ({ id, ...this.graph.getNodeAttributes(id) }));
      }

      this.graph.forEachNeighbor(current, (neighborId) => {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push([...path, neighborId]);
        }
      });
    }

    return null; // No path found
  }

  /**
   * Get causal chain from a starting entity.
   */
  getCausalChain(entityId, maxDepth = 5) {
    const chain = [];
    const visited = new Set();

    const traverse = (nodeId, depth) => {
      if (depth > maxDepth || visited.has(nodeId)) return;
      visited.add(nodeId);

      this.graph.forEachOutEdge(nodeId, (edgeKey, attrs, targetId) => {
        if (attrs.type === 'causes' || attrs.type === 'leads_to' || attrs.type === 'enables') {
          const targetAttrs = this.graph.getNodeAttributes(targetId);
          chain.push({
            from: nodeId,
            to: targetId,
            relation: attrs.type,
            targetName: targetAttrs.name,
          });
          traverse(targetId, depth + 1);
        }
      });
    };

    traverse(entityId, 0);
    return chain;
  }

  /**
   * Get all entities of a specific type.
   */
  getByType(type) {
    const result = [];
    this.graph.forEachNode((id, attrs) => {
      if (attrs.type === type) result.push({ id, ...attrs });
    });
    return result;
  }

  /**
   * Get graph statistics.
   */
  getGraphStats() {
    return {
      nodes: this.graph.order,
      edges: this.graph.size,
      density: this.graph.order > 1
        ? (this.graph.size / (this.graph.order * (this.graph.order - 1))).toFixed(4)
        : 0,
    };
  }

  /**
   * Export graph as JSON.
   */
  exportJson() {
    const nodes = [];
    this.graph.forEachNode((id, attrs) => nodes.push({ id, ...attrs }));

    const edges = [];
    this.graph.forEachEdge((key, attrs, source, target) => {
      edges.push({ source, target, ...attrs });
    });

    return { nodes, edges };
  }

  /**
   * Clear the graph.
   */
  clear() {
    this.graph.clear();
    this.stats = { entities: 0, relations: 0, queries: 0, paths: 0 };
  }

  getStats() {
    return {
      ...this.stats,
      graph: this.getGraphStats(),
    };
  }
}

module.exports = { KnowledgeGraph };
