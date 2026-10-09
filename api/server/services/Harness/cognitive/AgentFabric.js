'use strict';

/**
 * AgentFabric — FASE 8: Multi-agent orchestration fabric.
 *
 * Manages a pool of specialized sub-agents (personas) and routes tasks to the
 * most capable agent. Supports parallel execution of independent sub-tasks and
 * result aggregation.
 *
 * Personas (built-in):
 *   - researcher  : retrieves + synthesizes information
 *   - coder       : generates + reviews code
 *   - critic      : adversarial review of outputs
 *   - planner     : breaks goals into ordered steps
 *   - writer      : drafts prose, docs, emails
 *   - analyst     : data interpretation + trend detection
 *
 * Integration: called by ExecutiveLoop when complexity === 'high' or when the
 * Director picks 'plan_and_execute' / 'research_first' approach.
 */

const crypto = require('crypto');

// ── Agent personas ────────────────────────────────────────────────────────────

const PERSONAS = {
  researcher: {
    name: 'researcher',
    capabilities: ['search', 'summarize', 'fact_check', 'cite'],
    systemPromptHint: 'You are a precise research agent. Retrieve facts, cite sources, and summarize findings concisely.',
    maxTurns: 6,
  },
  coder: {
    name: 'coder',
    capabilities: ['write_code', 'debug', 'review_code', 'test'],
    systemPromptHint: 'You are a senior software engineer. Write clean, correct, secure code and explain your reasoning.',
    maxTurns: 8,
  },
  critic: {
    name: 'critic',
    capabilities: ['review', 'find_flaws', 'suggest_improvements'],
    systemPromptHint: 'You are an adversarial reviewer. Find flaws, edge cases, and improvements in the given output.',
    maxTurns: 4,
  },
  planner: {
    name: 'planner',
    capabilities: ['decompose', 'sequence', 'estimate'],
    systemPromptHint: 'You are a task planner. Decompose goals into ordered, concrete steps with time estimates.',
    maxTurns: 4,
  },
  writer: {
    name: 'writer',
    capabilities: ['draft', 'edit', 'summarize', 'format'],
    systemPromptHint: 'You are a skilled technical writer. Produce clear, well-structured prose tailored to the audience.',
    maxTurns: 6,
  },
  analyst: {
    name: 'analyst',
    capabilities: ['analyze', 'interpret', 'trend', 'visualize'],
    systemPromptHint: 'You are a data analyst. Interpret data, identify patterns, and provide actionable insights.',
    maxTurns: 5,
  },
};

// ── Task routing ─────────────────────────────────────────────────────────────

const INTENT_TO_PERSONAS = {
  research_request: ['researcher', 'critic'],
  code_task: ['coder', 'critic'],
  multi_step_task: ['planner', 'coder', 'critic'],
  simple_query: ['researcher'],
  general_task: ['planner', 'writer'],
  creative_task: ['writer', 'critic'],
  analysis_task: ['analyst', 'critic'],
};

function selectPersonas(intent, complexity = 'medium') {
  const candidates = INTENT_TO_PERSONAS[intent] || INTENT_TO_PERSONAS.general_task;
  // For low complexity, use only the primary persona
  if (complexity === 'low') return [candidates[0]];
  // For high complexity, use all recommended personas
  return candidates;
}

// ── Task records ──────────────────────────────────────────────────────────────

class AgentTask {
  constructor({ id, persona, input, parentId = null }) {
    this.id = id || crypto.randomUUID();
    this.persona = persona;
    this.input = input;
    this.parentId = parentId;
    this.status = 'pending'; // pending | running | done | failed
    this.result = null;
    this.error = null;
    this.createdAt = Date.now();
    this.completedAt = null;
    this.turns = 0;
  }

  complete(result) {
    this.status = 'done';
    this.result = result;
    this.completedAt = Date.now();
  }

  fail(error) {
    this.status = 'failed';
    this.error = String(error).slice(0, 500);
    this.completedAt = Date.now();
  }
}

// ── AgentFabric ───────────────────────────────────────────────────────────────

class AgentFabric {
  constructor(options = {}) {
    this._maxParallel = options.maxParallel || 4;
    this._tasks = new Map();        // taskId → AgentTask
    this._sessions = new Map();     // sessionId → { tasks, startedAt, status }
    this._stats = { sessions: 0, tasks: 0, parallel: 0, failed: 0 };
  }

  // ── Session management ────────────────────────────────────────────────────

  createSession(opts = {}) {
    const sessionId = opts.sessionId || crypto.randomUUID();
    this._sessions.set(sessionId, {
      id: sessionId,
      userId: opts.userId || null,
      intent: opts.intent || 'general_task',
      complexity: opts.complexity || 'medium',
      tasks: [],
      startedAt: Date.now(),
      status: 'active',
    });
    this._stats.sessions++;
    return sessionId;
  }

  getSession(sessionId) {
    return this._sessions.get(sessionId) || null;
  }

  // ── Task dispatch ─────────────────────────────────────────────────────────

  /**
   * Spawn a task on a specific persona.
   * @param {string} sessionId
   * @param {string} personaName
   * @param {string} input  — the sub-task description or message
   * @param {string} [parentId] — parent task id if this is a sub-task
   * @returns {AgentTask}
   */
  spawnTask(sessionId, personaName, input, parentId = null) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`AgentFabric: unknown session ${sessionId}`);

    const persona = PERSONAS[personaName] || PERSONAS.researcher;
    const task = new AgentTask({ persona, input, parentId });
    this._tasks.set(task.id, task);
    session.tasks.push(task.id);
    this._stats.tasks++;
    return task;
  }

  /**
   * Route a message to the right persona(s) based on intent, spawn tasks, and
   * return the task plan — the caller decides when/how to execute them.
   * @param {string} sessionId
   * @param {string} message
   * @param {{ intent: string, complexity: string }} context
   * @returns {{ tasks: AgentTask[], personas: string[], parallel: boolean }}
   */
  routeAndPlan(sessionId, message, context = {}) {
    const { intent = 'general_task', complexity = 'medium' } = context;
    const personaNames = selectPersonas(intent, complexity);

    // Split message into sub-tasks by persona role
    const tasks = personaNames.map((name) => {
      const persona = PERSONAS[name];
      const subtaskInput = `[${name.toUpperCase()}] ${persona.systemPromptHint}\n\nTask: ${message}`;
      return this.spawnTask(sessionId, name, subtaskInput);
    });

    // Tasks are independent — can run in parallel up to _maxParallel
    const parallel = tasks.length > 1 && tasks.length <= this._maxParallel;
    if (parallel) this._stats.parallel += tasks.length;

    return { tasks, personas: personaNames, parallel };
  }

  /**
   * Execute a task using a provided LLM executor function.
   * Marks task done/failed and returns the result.
   * @param {string} taskId
   * @param {function} executor  async (persona, input) => string
   * @returns {Promise<AgentTask>}
   */
  async executeTask(taskId, executor) {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`AgentFabric: task ${taskId} not found`);
    if (task.status !== 'pending') return task;

    task.status = 'running';
    try {
      const result = await executor(task.persona, task.input);
      task.complete(String(result || ''));
    } catch (e) {
      task.fail(e.message);
      this._stats.failed++;
    }
    return task;
  }

  /**
   * Execute all pending tasks in a session, up to _maxParallel at a time.
   * Returns aggregated results once all tasks complete.
   * @param {string} sessionId
   * @param {function} executor  async (persona, input) => string
   * @returns {Promise<{ results: object[], summary: string }>}
   */
  async executeSession(sessionId, executor) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`AgentFabric: session ${sessionId} not found`);

    const pendingIds = session.tasks.filter((id) => {
      const t = this._tasks.get(id);
      return t && t.status === 'pending';
    });

    // Execute in batches of _maxParallel
    const results = [];
    for (let i = 0; i < pendingIds.length; i += this._maxParallel) {
      const batch = pendingIds.slice(i, i + this._maxParallel);
      const batchResults = await Promise.allSettled(batch.map((id) => this.executeTask(id, executor)));
      batchResults.forEach((r, idx) => {
        const task = this._tasks.get(batch[idx]);
        results.push({
          taskId: batch[idx],
          persona: task?.persona?.name || 'unknown',
          status: task?.status || 'failed',
          result: task?.result || null,
          error: task?.error || null,
        });
      });
    }

    session.status = 'done';

    // Aggregate: combine all successful results
    const successes = results.filter((r) => r.status === 'done' && r.result);
    const summary = successes.map((r) => `[${r.persona}]: ${r.result.slice(0, 300)}`).join('\n\n');

    return { results, summary, sessionId };
  }

  // ── Task queries ──────────────────────────────────────────────────────────

  getTask(taskId) {
    return this._tasks.get(taskId) || null;
  }

  getSessionTasks(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) return [];
    return session.tasks.map((id) => this._tasks.get(id)).filter(Boolean);
  }

  getPersona(name) {
    return PERSONAS[name] || null;
  }

  listPersonas() {
    return Object.values(PERSONAS).map(({ name, capabilities }) => ({ name, capabilities }));
  }

  getStats() {
    return { ...this._stats, activeSessions: this._sessions.size, totalTasks: this._tasks.size };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance = null;
function getAgentFabric(options) {
  if (!_instance) _instance = new AgentFabric(options);
  return _instance;
}

module.exports = { AgentFabric, getAgentFabric, PERSONAS, selectPersonas };
