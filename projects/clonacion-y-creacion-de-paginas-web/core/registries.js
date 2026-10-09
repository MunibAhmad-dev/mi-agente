// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Registries
// ═══════════════════════════════════════════════════════════════════════════════

import { genId, timestamp, createLogger } from './utils.js';

const log = createLogger('Registry');

// ─── Skill Registry ───────────────────────────────────────────────────────────

export class SkillRegistry {
  #skills = new Map();
  #benchmarks = new Map();

  register(skill) {
    const id = skill.id || genId('skill');
    const entry = {
      id,
      name: skill.name || id,
      version: skill.version || '0.0.1',
      description: skill.description || '',
      category: skill.category || 'utility',
      capabilities: skill.capabilities || [],
      inputs: skill.inputs || [],
      outputs: skill.outputs || [],
      dependencies: skill.dependencies || [],
      tools: skill.tools || [],
      models: skill.models || [],
      license: skill.license || 'MIT',
      source: skill.source || 'internal',
      benchmark: skill.benchmark || { accuracy: 0, speed: 0, memory: 0, cost: 0, reliability: 0, compatibility: 0, visualQuality: 0 },
      confidence: skill.confidence ?? 0.5,
      cost: skill.cost || 0,
      runtime: skill.runtime || 'node',
      platform: skill.platform || 'all',
      status: skill.status || 'AVAILABLE',
      execute: skill.execute || null,
      registeredAt: timestamp(),
    };
    this.#skills.set(id, entry);
    log.info(`Skill registered: ${entry.name} (${id}) [${entry.status}]`);
    return entry;
  }

  get(id) { return this.#skills.get(id); }

  getByCapability(capability) {
    return [...this.#skills.values()].filter(s =>
      s.status === 'AVAILABLE' && s.capabilities.includes(capability)
    );
  }

  getByCategory(category) {
    return [...this.#skills.values()].filter(s => s.category === category);
  }

  getBestForCapability(capability) {
    const candidates = this.getByCapability(capability);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => {
      const scoreA = (a.benchmark.accuracy + a.benchmark.reliability + a.benchmark.visualQuality) / 3;
      const scoreB = (b.benchmark.accuracy + b.benchmark.reliability + b.benchmark.visualQuality) / 3;
      return scoreB - scoreA;
    })[0];
  }

  setStatus(id, status) {
    const skill = this.#skills.get(id);
    if (skill) { skill.status = status; skill.updatedAt = timestamp(); }
  }

  recordBenchmark(skillId, benchmark) {
    const skill = this.#skills.get(skillId);
    if (skill) {
      skill.benchmark = { ...skill.benchmark, ...benchmark };
      if (!this.#benchmarks.has(skillId)) this.#benchmarks.set(skillId, []);
      this.#benchmarks.get(skillId).push({ ...benchmark, timestamp: timestamp() });
    }
  }

  list(filter = {}) {
    let results = [...this.#skills.values()];
    if (filter.category) results = results.filter(s => s.category === filter.category);
    if (filter.status) results = results.filter(s => s.status === filter.status);
    if (filter.capability) results = results.filter(s => s.capabilities.includes(filter.capability));
    return results;
  }

  stats() {
    const all = [...this.#skills.values()];
    return {
      total: all.length,
      available: all.filter(s => s.status === 'AVAILABLE').length,
      active: all.filter(s => s.status === 'ACTIVE').length,
      disabled: all.filter(s => s.status === 'DISABLED').length,
      experimental: all.filter(s => s.status === 'EXPERIMENTAL').length,
      failed: all.filter(s => s.status === 'FAILED').length,
      categories: [...new Set(all.map(s => s.category))],
    };
  }
}

// ─── Agent Registry ───────────────────────────────────────────────────────────

export class AgentRegistry {
  #agents = new Map();
  #agentClasses = new Map();

  registerFactory(agentType, FactoryClass) {
    this.#agentClasses.set(agentType, FactoryClass);
    log.info(`Agent factory registered: ${agentType}`);
  }

  create(agentType, config = {}) {
    const FactoryClass = this.#agentClasses.get(agentType);
    if (!FactoryClass) {
      throw new Error(`No factory registered for agent type: ${agentType}`);
    }
    const agent = new FactoryClass(config);
    this.#agents.set(agent.id, agent);
    log.info(`Agent created: ${agentType} (${agent.id})`);
    return agent;
  }

  get(id) { return this.#agents.get(id); }

  getByType(type) {
    return [...this.#agents.values()].filter(a => a.type === type);
  }

  getAvailable() {
    return [...this.#agents.values()].filter(a => a.status === 'idle');
  }

  updateStatus(id, status) {
    const agent = this.#agents.get(id);
    if (agent) { agent.status = status; }
  }

  stats() {
    const all = [...this.#agents.values()];
    return {
      total: all.length,
      idle: all.filter(a => a.status === 'idle').length,
      busy: all.filter(a => a.status === 'busy').length,
      byType: Object.fromEntries(
        [...new Set(all.map(a => a.type))].map(t => [t, all.filter(a => a.type === t).length])
      ),
    };
  }
}

// ─── Tool Registry ────────────────────────────────────────────────────────────

export class ToolRegistry {
  #tools = new Map();

  register(tool) {
    const id = tool.id || genId('tool');
    const entry = {
      id,
      name: tool.name || id,
      category: tool.category || 'utility',
      description: tool.description || '',
      version: tool.version || '0.0.1',
      capabilities: tool.capabilities || [],
      config: tool.config || {},
      status: 'available',
      execute: tool.execute || null,
      registeredAt: timestamp(),
    };
    this.#tools.set(id, entry);
    log.info(`Tool registered: ${entry.name} (${id})`);
    return entry;
  }

  get(id) { return this.#tools.get(id); }

  getByCategory(category) {
    return [...this.#tools.values()].filter(t => t.category === category);
  }

  getBestForCapability(capability) {
    const candidates = [...this.#tools.values()].filter(t =>
      t.status === 'available' && t.capabilities.includes(capability)
    );
    return candidates[0] || null;
  }

  list(filter = {}) {
    let results = [...this.#tools.values()];
    if (filter.category) results = results.filter(t => t.category === filter.category);
    if (filter.status) results = results.filter(t => t.status === filter.status);
    return results;
  }

  stats() {
    const all = [...this.#tools.values()];
    return {
      total: all.length,
      available: all.filter(t => t.status === 'available').length,
      categories: [...new Set(all.map(t => t.category))],
    };
  }
}

// ─── Model Router ─────────────────────────────────────────────────────────────

export class ModelRouter {
  #models = new Map();
  #routingHistory = [];

  register(model) {
    const id = model.id || genId('model');
    const entry = {
      id,
      name: model.name || id,
      provider: model.provider || 'custom',
      capabilities: model.capabilities || [],
      contextWindow: model.contextWindow || 4096,
      costPerToken: model.costPerToken || 0,
      latency: model.latency || 1000,
      quality: model.quality || 0.5,
      status: model.status || 'available',
      config: model.config || {},
      registeredAt: timestamp(),
    };
    this.#models.set(id, entry);
    log.info(`Model registered: ${entry.name} (${id})`);
    return entry;
  }

  get(id) { return this.#models.get(id); }

  routeForTask(taskType) {
    const candidates = [...this.#models.values()].filter(m =>
      m.status === 'available' && m.capabilities.includes(taskType)
    );
    if (candidates.length === 0) return null;

    // Score by quality, cost-efficiency, and latency
    const scored = candidates.map(m => ({
      model: m,
      score: (m.quality * 0.5) + ((1 / (m.costPerToken + 0.0001)) * 0.3) + ((1 / (m.latency + 1)) * 0.2)
    }));
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0].model;
    this.#routingHistory.push({ taskType, modelId: best.id, timestamp: timestamp() });
    return best;
  }

  routeMultiModel(taskType, count = 3) {
    const candidates = [...this.#models.values()].filter(m =>
      m.status === 'available' && m.capabilities.includes(taskType)
    );
    const scored = candidates.map(m => ({
      model: m,
      score: (m.quality * 0.5) + ((1 / (m.costPerToken + 0.0001)) * 0.3) + ((1 / (m.latency + 1)) * 0.2)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map(s => s.model);
  }

  list(filter = {}) {
    let results = [...this.#models.values()];
    if (filter.capability) results = results.filter(m => m.capabilities.includes(filter.capability));
    if (filter.provider) results = results.filter(m => m.provider === filter.provider);
    if (filter.status) results = results.filter(m => m.status === filter.status);
    return results;
  }

  stats() {
    const all = [...this.#models.values()];
    return {
      total: all.length,
      available: all.filter(m => m.status === 'available').length,
      providers: [...new Set(all.map(m => m.provider))],
      capabilities: [...new Set(all.flatMap(m => m.capabilities))],
      routingHistory: this.#routingHistory.length,
    };
  }
}
