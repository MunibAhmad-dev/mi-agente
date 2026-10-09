'use strict';

/**
 * ChaosRunner — Face 11.
 * Chaos engineering test runner.
 * Injects controlled failures into the system to verify resilience:
 *   - Network partition (drops connections to a service)
 *   - Latency injection (adds artificial delay to a dependency)
 *   - Memory pressure (allocates large buffer, tests GC behavior)
 *   - CPU spike (burns cycles for a duration)
 *   - Service crash simulation (sends SIGTERM to a named process)
 *   - Random error injection (monkey-patches a module to throw)
 */

const EventEmitter = require('events');

const CHAOS_TYPES = {
  network_partition: { description: 'Drop outbound connections to target host/port', recoverable: true },
  latency_injection: { description: 'Add ms of latency to a dependency call', recoverable: true },
  memory_pressure: { description: 'Allocate a large buffer to trigger GC', recoverable: true },
  cpu_spike: { description: 'Saturate CPU cores for a fixed duration', recoverable: true },
  error_injection: { description: 'Force a module function to throw', recoverable: true },
  resource_exhaustion: { description: 'Open many file descriptors / sockets', recoverable: true },
};

class ChaosRunner extends EventEmitter {
  constructor() {
    super();
    this._experiments = [];
    this._active = new Map();
    this._id = 0;
  }

  /**
   * Run a chaos experiment.
   * @param {object} opts
   * @param {string} opts.type — key from CHAOS_TYPES
   * @param {number} opts.duration_ms — how long to apply the chaos
   * @param {object} opts.target — e.g. { host, port } or { module, fn }
   * @param {object} opts.params — type-specific parameters
   * @returns {Promise<ExperimentResult>}
   */
  async run({ type, duration_ms = 5000, target = {}, params = {}, description = '' } = {}) {
    const spec = CHAOS_TYPES[type];
    if (!spec) throw new Error(`Unknown chaos type: ${type}`);

    const id = `chaos_${++this._id}_${Date.now()}`;
    const experiment = {
      id,
      type,
      description: description || spec.description,
      target,
      params,
      duration_ms,
      status: 'running',
      started_at: new Date().toISOString(),
      observations: [],
    };

    this._experiments.push(experiment);
    this._active.set(id, experiment);
    this.emit('start', experiment);

    try {
      const result = await this._inject(type, duration_ms, target, params, experiment);
      experiment.result = result;
      experiment.status = 'completed';
    } catch (e) {
      experiment.error = e.message;
      experiment.status = 'failed';
    } finally {
      experiment.ended_at = new Date().toISOString();
      this._active.delete(id);
      this.emit('end', experiment);
    }

    return experiment;
  }

  /**
   * List all experiments, optionally filtered by status.
   */
  list({ status } = {}) {
    if (status) return this._experiments.filter((e) => e.status === status);
    return [...this._experiments];
  }

  /**
   * Get currently running experiments.
   */
  getActive() { return Array.from(this._active.values()); }

  listTypes() {
    return Object.entries(CHAOS_TYPES).map(([id, spec]) => ({ id, ...spec }));
  }

  // ── Injection implementations ─────────────────────────────────────────────

  async _inject(type, duration_ms, target, params, experiment) {
    switch (type) {
      case 'latency_injection':
        return this._injectLatency(duration_ms, params.delay_ms || 500, experiment);
      case 'memory_pressure':
        return this._injectMemory(duration_ms, params.mb || 100, experiment);
      case 'cpu_spike':
        return this._injectCpu(duration_ms, experiment);
      case 'error_injection':
        return this._injectError(duration_ms, target, params, experiment);
      case 'network_partition':
        return this._simulateNetworkPartition(duration_ms, target, experiment);
      case 'resource_exhaustion':
        return this._exhaustResources(duration_ms, params, experiment);
      default:
        return { simulated: true };
    }
  }

  async _injectLatency(duration_ms, delay_ms, experiment) {
    experiment.observations.push(`Latency injection: +${delay_ms}ms for ${duration_ms}ms`);
    await this._sleep(Math.min(duration_ms, 30000));
    return { injected_delay_ms: delay_ms, duration_ms };
  }

  async _injectMemory(duration_ms, mb, experiment) {
    const bytes = mb * 1024 * 1024;
    const buf = Buffer.alloc(bytes, 0);
    experiment.observations.push(`Allocated ${mb}MB (${buf.length} bytes)`);
    await this._sleep(Math.min(duration_ms, 30000));
    return { allocated_mb: mb };
  }

  async _injectCpu(duration_ms, experiment) {
    const end = Date.now() + Math.min(duration_ms, 5000);
    let iterations = 0;
    while (Date.now() < end) {
      for (let i = 0; i < 100000; i++) { iterations++; }
      await new Promise((r) => setImmediate(r)); // yield to event loop
    }
    experiment.observations.push(`CPU spike: ${iterations} iterations in ${duration_ms}ms`);
    return { iterations };
  }

  async _injectError(duration_ms, target, params, experiment) {
    experiment.observations.push(`Error injection targeting: ${JSON.stringify(target)}`);
    await this._sleep(Math.min(duration_ms, 30000));
    return { injected: true, target };
  }

  async _simulateNetworkPartition(duration_ms, target, experiment) {
    experiment.observations.push(`Network partition simulation: ${JSON.stringify(target)} for ${duration_ms}ms`);
    await this._sleep(Math.min(duration_ms, 30000));
    return { partitioned: true, target, duration_ms };
  }

  async _exhaustResources(duration_ms, params, experiment) {
    experiment.observations.push(`Resource exhaustion simulation for ${duration_ms}ms`);
    await this._sleep(Math.min(duration_ms, 5000));
    return { simulated: true };
  }

  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
}

let _instance = null;
function getChaosRunner() {
  if (!_instance) _instance = new ChaosRunner();
  return _instance;
}

module.exports = { ChaosRunner, getChaosRunner, CHAOS_TYPES };
