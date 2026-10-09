/**
 * IntegrationFacade — FASE 2: Architecture Integration Layer.
 *
 * Single entry point that boots and connects all FASE 2–7 subsystems:
 *   - ModelRouter (FASE 3)   → model selection by capability
 *   - ModelCatalog (FASE 4)  → discovery + benchmark
 *   - AgentMemory (FASE 5)   → 5-layer persistent memory
 *   - AgentEngine (FASE 6)   → 18-specialist agent registry
 *   - HarnessAdapter (FASE 7)→ DeepSeek/ToolHarness runtime
 *   - ExecutiveLoop (Face 8) → 13-phase orchestration pipeline
 *
 * Usage:
 *   const facade = require('./IntegrationFacade');
 *   await facade.boot();
 *   const health = await facade.health();
 *   const result = await facade.route({ task, userId, projectId });
 */

const { routeModelForAgent, buildModelRegistryFromOllama } = require('../AgentArchitect/modelRouter');
const { MemoryService, MemoryLayer, MemoryType } = require('../Memory/memoryService');

let _booted = false;
let _registry = null;
let _memory = null;
let _agentEngine = null;
let _harness = null;
let _executiveLoop = null;

const _subsystemStatus = {
  modelRouter: 'uninitialized',
  modelCatalog: 'uninitialized',
  agentMemory: 'uninitialized',
  agentEngine: 'uninitialized',
  harness: 'uninitialized',
  executiveLoop: 'uninitialized',
};

/** Lazy-load with fallback so a missing subsystem never crashes boot. */
function tryRequire(path) {
  try {
    return require(path);
  } catch {
    return null;
  }
}

/** Boot all subsystems in dependency order. Idempotent. */
async function boot() {
  if (_booted) return { already: true, status: _subsystemStatus };

  // FASE 3 — ModelRouter: build registry from Ollama (best-effort)
  try {
    const { fetchOllamaModels } = require('../AgentArchitect/modelRouter');
    const models = await fetchOllamaModels().catch(() => []);
    _registry = buildModelRegistryFromOllama(models);
    _subsystemStatus.modelRouter = 'ok';
  } catch {
    _registry = buildModelRegistryFromOllama([]);
    _subsystemStatus.modelRouter = 'degraded-no-ollama';
  }

  // FASE 4 — ModelCatalog
  const catalogMod = tryRequire('../ModelCatalog');
  if (catalogMod) {
    _subsystemStatus.modelCatalog = 'ok';
  } else {
    _subsystemStatus.modelCatalog = 'unavailable';
  }

  // FASE 5 — AgentMemory
  try {
    _memory = new MemoryService();
    _subsystemStatus.agentMemory = 'ok';
  } catch {
    _subsystemStatus.agentMemory = 'error';
  }

  // FASE 6 — AgentEngine
  const engineMod = tryRequire('../AgentEngine/AgentEngine');
  if (engineMod) {
    _agentEngine = new engineMod.AgentEngine({ registry: _registry });
    _subsystemStatus.agentEngine = 'ok';
  } else {
    _subsystemStatus.agentEngine = 'unavailable';
  }

  // FASE 7 — HarnessAdapter
  const harnessMod = tryRequire('../HarnessAdapter/HarnessAdapter');
  if (harnessMod) {
    _harness = new harnessMod.HarnessAdapter();
    _subsystemStatus.harness = 'ok';
  } else {
    _subsystemStatus.harness = 'unavailable';
  }

  // Face 8 — ExecutiveLoop
  const loopMod = tryRequire('../ExecutiveLoop/ExecutiveLoop');
  if (loopMod) {
    _executiveLoop = loopMod;
    _subsystemStatus.executiveLoop = 'ok';
  } else {
    _subsystemStatus.executiveLoop = 'unavailable';
  }

  _booted = true;
  return { booted: true, status: _subsystemStatus };
}

/** Health check across all subsystems. */
async function health() {
  return {
    booted: _booted,
    subsystems: { ..._subsystemStatus },
    memory: _memory ? _memory.stats() : null,
    registry: _registry ? { registeredModels: _registry.models?.size ?? 0 } : null,
    agentEngine: _agentEngine ? _agentEngine.listAgents().length + ' agents' : null,
  };
}

/**
 * Route a task through the full pipeline:
 *   1. Recall relevant memories (FASE 5)
 *   2. Select best agent type (FASE 6)
 *   3. Route to model (FASE 3)
 *   4. Execute via ExecutiveLoop (Face 8)
 *   5. Store result memory (FASE 5)
 *
 * @param {object} params
 * @param {string} params.task - user task description
 * @param {string} params.userId
 * @param {string} [params.projectId]
 * @param {string[]} [params.requiredCapabilities]
 * @returns {object}
 */
async function route({ task, userId, projectId, requiredCapabilities = [] }) {
  if (!_booted) await boot();

  const memories = _memory
    ? _memory.recall({ query: task, userId, projectId, topK: 5 })
    : [];

  let agentSpec = null;
  if (_agentEngine) {
    agentSpec = _agentEngine.selectAgent(task, requiredCapabilities);
  }

  const caps = agentSpec ? agentSpec.capabilities : requiredCapabilities;
  const modelDecision = _registry
    ? routeModelForAgent({ capabilities: caps, registry: _registry })
    : null;

  const context = {
    task,
    userId,
    projectId,
    memories,
    agentSpec,
    model: modelDecision?.chosen ?? null,
  };

  let result = null;
  if (_executiveLoop && typeof _executiveLoop.run === 'function') {
    try {
      result = await _executiveLoop.run({ intent: task, userId, projectId });
    } catch (e) {
      result = { error: e.message, fallback: true };
    }
  }

  if (_memory && result && !result.error) {
    _memory.remember({
      layer: MemoryLayer.SESSION,
      type: MemoryType.FACT,
      content: `Task completed: ${task.slice(0, 200)}`,
      userId,
      projectId,
    });
  }

  return { context, result, subsystems: _subsystemStatus };
}

/**
 * Detailed health — includes uptime, process memory, per-subsystem metrics.
 * Used by the admin dashboard to render a real-time status panel.
 */
async function healthDetailed() {
  const base = await health();
  const mem = process.memoryUsage();
  return {
    ...base,
    uptime: Math.round(process.uptime()),
    uptimeHuman: formatUptime(process.uptime()),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    processMemory: {
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
    },
    agentCount: _agentEngine ? _agentEngine.listAgents().length : 0,
    registeredModels: _registry?.models?.size ?? 0,
    memoryStat: _memory ? _memory.stats() : null,
  };
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

/**
 * Prune memory entries — delegates to MemoryService.prune().
 * @param {object} opts - { olderThanMs, minImportance, layer, userId, projectId }
 */
function pruneMemory(opts = {}) {
  if (!_memory) throw new Error('AgentMemory not initialized');
  return _memory.prune(opts);
}

/** Remember something — exposed for direct memory write. */
function remember(params) {
  if (!_memory) throw new Error('AgentMemory not initialized — call boot() first');
  return _memory.remember(params);
}

/** Recall from memory. */
function recall(params) {
  if (!_memory) return [];
  return _memory.recall(params);
}

/** Reset for testing. */
function _reset() {
  _booted = false;
  _registry = null;
  _memory = null;
  _agentEngine = null;
  _harness = null;
  _executiveLoop = null;
  Object.keys(_subsystemStatus).forEach((k) => { _subsystemStatus[k] = 'uninitialized'; });
}

const _exports = { boot, health, healthDetailed, route, remember, recall, pruneMemory, _reset, _subsystemStatus };
/** Live reference to MemoryService instance — used by admin routes (e.g. auto-decay). */
Object.defineProperty(_exports, '_memory', { get: () => _memory, enumerable: false });
module.exports = _exports;
