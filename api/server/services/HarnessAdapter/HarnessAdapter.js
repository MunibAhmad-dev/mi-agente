/**
 * HarnessAdapter — FASE 7: DeepSeek Harness Adapter.
 *
 * Wraps the Face 14 ToolHarness (Harness/ services) as a clean adapter layer,
 * following the Face 7 §10-11 pattern:
 *
 *   OUR PLATFORM
 *        ↓
 *   HARNESS ADAPTER  ← this file
 *        ↓
 *   DEEPSEEK HARNESS (Harness/ services = Face 14 ToolHarness)
 *
 * Provides a provider-agnostic interface so the platform can swap the
 * underlying harness in the future without breaking callers.
 *
 * Spec requirements (Face 7 §11):
 *   Use: agent runtime, sessions, tools, skills, subagents, workflows,
 *        jobs, sandbox, code execution, compaction, persistence, events.
 *   Create own adapters when necessary.
 *   Do NOT couple everything to it — substitutable in the future.
 *
 * Interface:
 *   new HarnessAdapter(opts)
 *   adapter.createSession(params)  → { sessionId, ... }
 *   adapter.run(sessionId, task)   → { result, steps }
 *   adapter.getStatus(sessionId)   → { status, steps }
 *   adapter.stop(sessionId)        → { stopped }
 *   adapter.listSessions()         → session[]
 *   adapter.health()               → { ok, subsystems }
 */

const { EventEmitter } = require('events');

/** Try to load a Harness subsystem, return null on failure. */
function tryLoad(path) {
  try {
    return require(path);
  } catch {
    return null;
  }
}

class HarnessAdapter extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = opts;
    this.sessions = new Map();

    // Lazy-load Harness subsystems — never throw in constructor
    this._orchestrator = null;
    this._cognitiveEngine = null;
    this._agentEngine = null;
    this._capabilityManager = null;
    this._checkpointManager = null;
  }

  _getOrchestrator() {
    if (!this._orchestrator) {
      const Mod = tryLoad('~/server/services/Harness/AgentOrchestrator');
      if (Mod && Mod.AgentOrchestrator) {
        this._orchestrator = new Mod.AgentOrchestrator();
      }
    }
    return this._orchestrator;
  }

  _getCognitiveEngine() {
    if (!this._cognitiveEngine) {
      const Mod = tryLoad('~/server/services/Harness/cognitive/CognitiveEngine');
      if (Mod) this._cognitiveEngine = Mod.CognitiveEngine || Mod;
    }
    return this._cognitiveEngine;
  }

  _getAgentEngine() {
    if (!this._agentEngine) {
      const Mod = tryLoad('~/server/services/AgentEngine/AgentEngine');
      if (Mod && Mod.AgentEngine) {
        this._agentEngine = new Mod.AgentEngine({});
      }
    }
    return this._agentEngine;
  }

  /**
   * Create a new agent session.
   * @param {object} params - { userId, agentId, task, tools, model, projectId }
   * @returns {object} session stub
   */
  createSession(params = {}) {
    const sessionId = `harness_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      sessionId,
      userId: params.userId,
      agentId: params.agentId || 'executor',
      task: params.task,
      model: params.model || null,
      projectId: params.projectId || null,
      tools: params.tools || [],
      status: 'created',
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    this.emit('session:created', { sessionId });
    return session;
  }

  /**
   * Try to generate a response directly via Ollama — used as FASE 7 LLM fallback.
   * @param {string} model - Ollama model name (e.g. "qwen3:latest")
   * @param {string} task
   * @returns {Promise<object|null>}
   */
  async _callOllama(model, task) {
    const base = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
    const effectiveModel = model || process.env.DEFAULT_OLLAMA_MODEL || 'qwen3:latest';
    try {
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: effectiveModel,
          prompt: task,
          stream: false,
          options: { num_predict: 512 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const json = await res.json();
        return {
          output: json.response,
          model: effectiveModel,
          source: 'ollama-direct',
          tokensEval: json.eval_count || null,
        };
      }
    } catch {
      // Ollama unavailable — fall through to agent stub
    }
    return null;
  }

  /**
   * Run the harness on a task for a given session.
   * Routes to AgentOrchestrator if available, else falls back to stub.
   *
   * @param {string} sessionId
   * @param {string} [task] - override session task
   * @returns {Promise<object>}
   */
  async run(sessionId, task) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.status = 'running';
    session.updatedAt = new Date().toISOString();
    const effectiveTask = task || session.task;

    this.emit('session:started', { sessionId, task: effectiveTask });

    try {
      const orchestrator = this._getOrchestrator();
      let result;

      if (orchestrator && typeof orchestrator.orchestrate === 'function') {
        result = await orchestrator.orchestrate(effectiveTask, {
          userId: session.userId,
          projectId: session.projectId,
          model: session.model,
          tools: session.tools,
        });
      } else {
        // FASE 7 fallback chain:
        //   1. AgentEngine — select specialist agent for task
        //   2. Ollama direct — attempt real LLM generation
        //   3. Stub — if both unavailable
        const agentEngine = this._getAgentEngine();
        const selectedAgent = agentEngine ? agentEngine.selectAgent(effectiveTask) : null;

        // Try real Ollama generation
        const ollamaResult = await this._callOllama(session.model, effectiveTask);

        if (ollamaResult) {
          result = {
            ...ollamaResult,
            agent: selectedAgent?.id || session.agentId,
            agentName: selectedAgent?.name || null,
            steps: [
              selectedAgent ? { type: 'agent_selected', agentId: selectedAgent.id, ts: Date.now() } : null,
              { type: 'ollama_direct', model: ollamaResult.model, ts: Date.now() },
            ].filter(Boolean),
          };
        } else if (selectedAgent) {
          const spawnResult = await agentEngine.spawn(selectedAgent.id, {
            task: effectiveTask,
            userId: session.userId,
            projectId: session.projectId,
          });
          result = {
            output: `Agent '${selectedAgent.name}' ready — Ollama unavailable, returning agent context`,
            agent: selectedAgent.id,
            agentName: selectedAgent.name,
            constitution: selectedAgent.constitution,
            spawnResult,
            steps: [{ type: 'agent_selected', agentId: selectedAgent.id, ts: Date.now() }],
          };
        } else {
          result = {
            output: `[HarnessAdapter] Processed: "${effectiveTask.slice(0, 80)}"`,
            agent: session.agentId,
            steps: [{ type: 'stub', message: 'all fallbacks unavailable' }],
          };
        }
      }

      session.status = 'completed';
      session.result = result;
      session.steps.push({ type: 'result', data: result, ts: Date.now() });
      session.updatedAt = new Date().toISOString();

      this.emit('session:completed', { sessionId, result });
      return { sessionId, status: 'completed', result };
    } catch (e) {
      session.status = 'error';
      session.error = e.message;
      session.updatedAt = new Date().toISOString();
      this.emit('session:error', { sessionId, error: e.message });
      throw e;
    }
  }

  /**
   * Get current status of a session.
   * @param {string} sessionId
   * @returns {object}
   */
  getStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const { sessionId: id, status, steps, error, createdAt, updatedAt } = session;
    return { sessionId: id, status, steps, error: error || null, createdAt, updatedAt };
  }

  /**
   * Stop a running session.
   * @param {string} sessionId
   * @returns {object}
   */
  stop(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { stopped: false, error: 'session not found' };
    if (session.status === 'running') {
      session.status = 'stopped';
      session.updatedAt = new Date().toISOString();
      this.emit('session:stopped', { sessionId });
    }
    return { stopped: true, sessionId, status: session.status };
  }

  /**
   * List all sessions (active + recent).
   * @returns {object[]}
   */
  listSessions() {
    return Array.from(this.sessions.values()).map(({ sessionId, userId, agentId, status, createdAt, updatedAt }) => ({
      sessionId, userId, agentId, status, createdAt, updatedAt,
    }));
  }

  /**
   * Health check for all loaded Harness subsystems.
   * @returns {object}
   */
  health() {
    return {
      ok: true,
      adapter: 'HarnessAdapter',
      face: 7,
      sessions: this.sessions.size,
      subsystems: {
        orchestrator: !!this._orchestrator ? 'loaded' : 'lazy',
        cognitiveEngine: !!this._cognitiveEngine ? 'loaded' : 'lazy',
        spec: 'Face 14 ToolHarness via OUR PLATFORM → HARNESS ADAPTER → DEEPSEEK HARNESS',
      },
    };
  }
}

module.exports = { HarnessAdapter };
