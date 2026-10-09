'use strict';

/**
 * KnowledgeGapDetector - Detects knowledge gaps and missing capabilities
 */
class KnowledgeGapDetector {
  constructor(config = {}) {
    this.config = config;
    this.gaps = new Map();
    this.gapCount = 0;
    this.gapTypes = {
      KNOWLEDGE: 'knowledge_gap',
      SKILL: 'skill_gap',
      TOOL: 'tool_gap',
      CONTEXT: 'context_gap',
      REASONING: 'reasoning_gap',
      PLANNING: 'planning_gap',
      EXECUTION: 'execution_gap',
      ENVIRONMENT: 'environment_gap',
      PERMISSION: 'permission_gap',
      MODEL_LIMITATION: 'model_limitation',
      INFORMATION: 'information_gap',
    };
  }

  /**
   * Detect gaps from a failure or unknown task
   */
  detect(data) {
    const gap = {
      id: `gap_${++this.gapCount}`,
      type: this._classifyGap(data),
      description: data.description || data.message || 'Unknown gap',
      task: data.task || '',
      context: data.context || {},
      detectedAt: new Date().toISOString(),
      status: 'detected', // detected, researching, resolved, abandoned
      resolution: null,
      confidence: data.confidence || 0.5,
    };

    this.gaps.set(gap.id, gap);
    return gap;
  }

  /**
   * Classify the type of gap
   */
  _classifyGap(data) {
    const msg = (data.message || data.description || '').toLowerCase();

    if (/doesn't know|don't know|not sure|uncertain/.test(msg)) return this.gapTypes.KNOWLEDGE;
    if (/skill|can't do|unable to|not able/.test(msg)) return this.gapTypes.SKILL;
    if (/tool|no tool|missing tool|need tool/.test(msg)) return this.gapTypes.TOOL;
    if (/context|missing info|no context/.test(msg)) return this.gapTypes.CONTEXT;
    if (/reason|logic|understand|confused/.test(msg)) return this.gapTypes.REASONING;
    if (/plan|strategy|approach/.test(msg)) return this.gapTypes.PLANNING;
    if (/execute|run|implement/.test(msg)) return this.gapTypes.EXECUTION;
    if (/environment|server|network|connection/.test(msg)) return this.gapTypes.ENVIRONMENT;
    if (/permission|access|denied|forbidden/.test(msg)) return this.gapTypes.PERMISSION;
    if (/model|token|limit|context window/.test(msg)) return this.gapTypes.MODEL_LIMITATION;
    if (/data|information|document|source/.test(msg)) return this.gapTypes.INFORMATION;
    return this.gapTypes.KNOWLEDGE;
  }

  /**
   * Update gap status
   */
  updateGap(gapId, status, resolution = null) {
    const gap = this.gaps.get(gapId);
    if (!gap) return null;
    gap.status = status;
    gap.resolution = resolution;
    gap.updatedAt = new Date().toISOString();
    return gap;
  }

  /**
   * Find unresolved gaps
   */
  findUnresolved(type = null) {
    let gaps = Array.from(this.gaps.values()).filter(g => g.status === 'detected' || g.status === 'researching');
    if (type) gaps = gaps.filter(g => g.type === type);
    return gaps;
  }

  /**
   * Get statistics
   */
  getStats() {
    const typeCounts = {};
    const statusCounts = {};
    for (const g of this.gaps.values()) {
      typeCounts[g.type] = (typeCounts[g.type] || 0) + 1;
      statusCounts[g.status] = (statusCounts[g.status] || 0) + 1;
    }
    return { total: this.gaps.size, typeCounts, statusCounts };
  }
}

module.exports = KnowledgeGapDetector;
