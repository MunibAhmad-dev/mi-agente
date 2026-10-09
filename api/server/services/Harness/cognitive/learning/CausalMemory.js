'use strict';

/**
 * CausalMemory - Stores and queries cause-effect relationships
 */
class CausalMemory {
  constructor(config = {}) {
    this.config = config;
    this.relations = new Map();
    this.relationCount = 0;
  }

  /**
   * Add a causal relation
   */
  addRelation(cause, effect, data = {}) {
    const id = `causal_${++this.relationCount}`;
    const relation = {
      id,
      cause,
      effect,
      type: data.type || 'general', // cause_effect, error_cause, cause_solution, solution_outcome, action_failure, action_success, tool_failure, environment_failure, model_failure, skill_failure
      confidence: data.confidence || 0.5,
      evidence: data.evidence || [],
      occurrences: 1,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      source: data.source || 'system',
    };
    this.relations.set(id, relation);
    return relation;
  }

  /**
   * Record an occurrence of a known relation
   */
  recordOccurrence(relationId) {
    const rel = this.relations.get(relationId);
    if (!rel) return null;
    rel.occurrences++;
    rel.lastSeen = new Date().toISOString();
    rel.confidence = Math.min(0.95, rel.confidence + 0.05);
    return rel;
  }

  /**
   * Find what caused a given effect
   */
  findCauses(effect) {
    return Array.from(this.relations.values())
      .filter(r => r.effect === effect)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find what effects a given cause produces
   */
  findEffects(cause) {
    return Array.from(this.relations.values())
      .filter(r => r.cause === cause)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find causal chain: cause1 -> cause2 -> ... -> effect
   */
  findChain(startCause, maxDepth = 5) {
    const chains = [];
    const visited = new Set();

    const dfs = (current, chain) => {
      if (chain.length > maxDepth) return;
      visited.add(current);

      const effects = this.findEffects(current);
      for (const rel of effects) {
        if (!visited.has(rel.effect)) {
          const newChain = [...chain, { cause: current, effect: rel.effect, confidence: rel.confidence }];
          chains.push(newChain);
          dfs(rel.effect, newChain);
        }
      }
      visited.delete(current);
    };

    dfs(startCause, []);
    return chains;
  }

  /**
   * Find path between two concepts
   */
  findPath(from, to, maxDepth = 5) {
    const queue = [[from]];
    const visited = new Set([from]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === to) return path;
      if (path.length > maxDepth) continue;

      const effects = this.findEffects(current);
      for (const rel of effects) {
        if (!visited.has(rel.effect)) {
          visited.add(rel.effect);
          queue.push([...path, rel.effect]);
        }
      }
    }
    return null;
  }

  /**
   * Get all relations
   */
  getAll(limit = 100) { return Array.from(this.relations.values()).slice(-limit); }

  /**
   * Get statistics
   */
  getStats() {
    const typeCounts = {};
    for (const r of this.relations.values()) {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    }
    return { total: this.relations.size, typeCounts };
  }
}

module.exports = CausalMemory;
