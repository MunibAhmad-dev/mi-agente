/**
 * HarnessEngine — the scaffolding + runtime orchestration that turns an LLM
 * into a production coding agent.
 *
 * Two phases (per OPENDEV arxiv 2603.05344):
 *   1. Scaffolding (before first prompt): system prompt, tool schemas,
 *      subagent registry.
 *   2. Harness (runtime): tool dispatch, context management, safety.
 *
 * Feature-flagged via env HARNESS_ENGINE_ENABLED. Without the flag every
 * method is a no-op so existing behaviour is unchanged.
 */

const crypto = require('crypto');
const SystemPromptBuilder = require('./Scaffolding/SystemPromptBuilder');
const ToolRegistry = require('./Scaffolding/ToolRegistry');
const SubagentRegistry = require('./Scaffolding/SubagentRegistry');
const InjectionPoints = require('./ContextEngine/InjectionPoints');
const ReminderQueue = require('./ContextEngine/ReminderQueue');
const CompactionManager = require('./ContextEngine/CompactionManager');
const ConversationState = require('./ContextEngine/ConversationState');
const StopConditions = require('./SafetyHarness/StopConditions');
const ToolEnforcement = require('./SafetyHarness/ToolEnforcement');
const SandboxRunner = require('./SafetyHarness/SandboxRunner');
const Checkpoint = require('./SessionManager/Checkpoint');
const GoalWorkflow = require('./SessionManager/GoalWorkflow');
const WorktreeIsolation = require('./WorktreeIsolation');

const enabled = () => process.env.HARNESS_ENGINE_ENABLED === 'true';

// Lazy-load MemorySystem to avoid circular dependency at module load time
let _memory = null;
function getMemory() {
  if (!_memory) {
    try { _memory = require('../CognitiveBehavior/MemorySystem').getMemorySystem(); } catch { _memory = null; }
  }
  return _memory;
}

// FASE 5 — WorldModel: lazy singleton
let _worldModel = null;
function getWorldModel() {
  if (!_worldModel) {
    try { _worldModel = require('../Harness/cognitive/WorldModel').getWorldModel(); } catch { _worldModel = null; }
  }
  return _worldModel;
}

// FASE 19 — EventSourcing: lazy singleton
let _eventSourcing = null;

// PolicyEngine: lazy singleton for command/tool permission checks
let _policyEngine = null;
function getPolicyEngine() {
  if (!_policyEngine) {
    try { _policyEngine = new (require('../Harness/tools/PolicyEngine'))(); } catch { _policyEngine = null; }
  }
  return _policyEngine;
}
function getEventSourcing() {
  if (!_eventSourcing) {
    try { _eventSourcing = require('../Harness/cognitive/EventSourcing').getEventSourcing(); } catch { _eventSourcing = null; }
  }
  return _eventSourcing;
}

/**
 * Build a fresh harness session. Returns a lightweight context object that
 * every downstream component can read/mutate.
 * @param {object} opts
 * @returns {object}
 */
function createSession(opts = {}) {
  const session = {
    id: opts.id || crypto.randomUUID(),
    agentId: opts.agentId || 'default',
    model: opts.model || null,
    userId: opts.userId || null,
    worktree: null,
    startedAt: new Date().toISOString(),
    turn: 0,
    toolCalls: 0,
    state: ConversationState.create(),
    reminders: ReminderQueue.create(),
    goals: [],
    checkpoints: [],
    flags: { compacted: false, sandboxed: false, stopped: false },
  };
  // FASE 17 — record session start in MemorySystem episodic layer
  try {
    getMemory()?.recordEvent(
      { type: 'session_started', agentId: session.agentId, model: session.model },
      { sessionId: session.id, userId: session.userId }
    );
  } catch { /* non-fatal */ }

  // FASE 5 — WorldModel: register the active user as a world entity
  try {
    const wm = getWorldModel();
    if (wm && session.userId) {
      wm.upsertEntity({ id: `user:${session.userId}`, type: 'user', name: session.userId, attributes: { lastSeen: session.startedAt } });
    }
    wm?.updateEnv({ activeUser: session.userId, sessionId: session.id, agentId: session.agentId });
  } catch { /* non-fatal */ }

  // FASE 19 — EventSourcing: durable audit record of session start
  try {
    getEventSourcing()?.append({ type: 'harness:session_started', userId: session.userId, sessionId: session.id, data: { agentId: session.agentId, model: session.model } });
  } catch { /* non-fatal */ }

  return session;
}

/**
 * Scaffolding phase: assemble the agent before the first prompt.
 * Returns { systemPrompt, tools, subagents } ready for the first LLM call.
 * @param {object} session
 * @param {object} opts { agentSpec, availableTools, userTask }
 * @returns {Promise<{systemPrompt:string, tools:object[], subagents:object[]}>}
 */
async function scaffold(session, opts = {}) {
  if (!enabled()) {
    return { systemPrompt: '', tools: opts.availableTools || [], subagents: [] };
  }
  const tools = ToolRegistry.resolve(opts.availableTools || [], opts.userTask || '');
  const subagents = SubagentRegistry.resolve(opts.subagentSpecs || []);
  const systemPrompt = await SystemPromptBuilder.build({
    agentSpec: opts.agentSpec || {},
    tools,
    subagents,
    userTask: opts.userTask || '',
    worktree: session.worktree,
    session,
  });
  return { systemPrompt, tools, subagents };
}

/**
 * Runtime hook called before each LLM call. Injects reminders and compacts
 * context when needed.
 * @param {object} session
 * @param {object} msg the message about to be sent
 * @returns {Promise<{injected:object[], compacted:boolean}>}
 */
async function preLLMCall(session, msg) {
  if (!enabled()) {
    return { injected: [], compacted: false };
  }
  const injected = InjectionPoints.beforeModelCall(session, msg);
  const compacted = await CompactionManager.maybeCompact(session);

  // ContextManagerService compression — fires before each LLM call
  try {
    const { getContextManagerService } = require('~/server/services/ContextManager');
    const cm = getContextManagerService();
    if (session?.id && msg) {
      cm.addMessage(session.id, { role: msg.role || 'user', content: msg.content || '' });
    }
  } catch { /* ContextManagerService optional */ }

  return { injected, compacted };
}

/**
 * Runtime hook called after a tool executes. Updates conversation state,
 * enforces tool output shape, and records the result.
 * @param {object} session
 * @param {object} toolCall
 * @param {object} result
 * @returns {object} normalized result
 */
function postToolCall(session, toolCall, result) {
  if (!enabled()) {
    return result;
  }
  const normalized = ToolEnforcement.normalize(toolCall, result);
  ConversationState.appendToolResult(session.state, toolCall, normalized);
  ReminderQueue.enqueueFromToolResult(session.reminders, toolCall, normalized);
  StopConditions.observe(session, toolCall, normalized);
  session.toolCalls += 1;

  // FASE 17 — record tool outcome in MemorySystem episodic layer
  try {
    const toolName = toolCall?.name || toolCall?.function?.name || 'unknown';
    const success = normalized?.success !== false;
    getMemory()?.recordEvent(
      { type: 'tool_call', tool: toolName, success, turn: session.turn },
      { sessionId: session.id, userId: session.userId }
    );
    // If it's a successful code/write operation, also store as semantic fact
    if (success && (toolName.includes('write') || toolName.includes('create') || toolName.includes('edit'))) {
      getMemory()?.storeFact(
        `Tool ${toolName} succeeded in session ${session.id} (turn ${session.turn})`,
        'agent_action',
        { confidence: 0.9 }
      );
    }
  } catch { /* non-fatal */ }

  // FASE 19 — EventSourcing: append tool call to durable audit trail
  try {
    const toolName = toolCall?.name || toolCall?.function?.name || 'unknown';
    const success = normalized?.success !== false;
    getEventSourcing()?.append({
      type: `harness:tool_call`,
      userId: session.userId,
      sessionId: session.id,
      severity: success ? 'info' : 'warn',
      data: { tool: toolName, success, turn: session.turn },
    });
  } catch { /* non-fatal */ }

  // FASE 5 — WorldModel: record tool call in environment state
  try {
    const toolName = toolCall?.name || toolCall?.function?.name || 'unknown';
    getWorldModel()?.updateEnv({ lastTool: toolName, lastToolTurn: session.turn, toolCalls: session.toolCalls });
  } catch { /* non-fatal */ }

  return normalized;
}

/**
 * Runtime hook called BEFORE a tool executes. Checks PolicyEngine permission.
 * Returns { allowed, reason } — callers must respect { allowed: false }.
 */
async function preToolCall(session, toolCall) {
  if (!enabled()) return { allowed: true };
  const toolName = toolCall?.name || toolCall?.function?.name || 'unknown';
  try {
    const policy = getPolicyEngine();
    if (policy) {
      const check = await policy.checkToolPermission(toolName, { policy: session.policyId || 'default' });
      if (!check.allowed) return check;
    }
  } catch { /* non-fatal — policy engine failure must not block execution */ }
  return { allowed: true };
}

/**
 * Decide whether the agent loop should continue. Combines our stop
 * conditions with any user-defined predicate.
 * @param {object} session
 * @returns {{stop:boolean, reason:string|null}}
 */
function shouldStop(session) {
  if (!enabled()) {
    return { stop: false, reason: null };
  }
  return StopConditions.evaluate(session);
}

/**
 * Run a shell command through the sandbox when available, falling back to
 * direct execution.
 * @param {object} session
 * @param {string} command
 * @param {object} opts
 * @returns {Promise<{stdout:string, stderr:string, code:number, sandboxed:boolean}>}
 */
async function runCommand(session, command, opts = {}) {
  // Phase 11 — SimulationBeforeAction: assess risk before any shell execution.
  // High-risk commands require explicit opts.skipSimulation = true to bypass.
  try {
    const { getSimulator } = require('../Harness/cognitive/SimulationBeforeAction');
    const sim = getSimulator();
    const risk = sim.assessRisk({ type: 'shell', command });
    if (risk >= 8 && !opts.skipSimulation) {
      const prediction = sim.simulate({ type: 'shell', command }, session.goals ? { constraints: [] } : {});
      if (!prediction.safe) {
        return { stdout: '', stderr: `[SimulationBeforeAction] Command blocked — risk ${risk}/10: ${prediction.blockedReason}`, code: 1, sandboxed: false, simulated: true };
      }
    }
  } catch { /* SimulationBeforeAction optional — never block execution on failure */ }

  // Never fall back to raw exec() when the harness is disabled — that would expose
  // an unisolated shell to authenticated users. Refuse explicitly so the operator
  // knows they must enable the harness (and a real sandbox) before shell execution.
  if (!enabled()) {
    return {
      stdout: '',
      stderr: '[HarnessEngine] Command execution refused — set HARNESS_ENGINE_ENABLED=true and configure a sandbox before enabling shell access.',
      code: 1,
      sandboxed: false,
      refused: true,
    };
  }
  // Verify sandbox is available before delegating — fail-safe if not installed.
  const sandboxType = SandboxRunner.detectSandbox();
  if (!sandboxType) {
    return {
      stdout: '',
      stderr: '[HarnessEngine] Command execution refused — no sandbox (bwrap/sandbox-exec) detected. Install a sandbox before enabling shell access.',
      code: 1,
      sandboxed: false,
      refused: true,
    };
  }
  // PolicyEngine: check command against active policy before sandbox execution
  try {
    const policy = getPolicyEngine();
    if (policy) {
      const check = await policy.checkCommand(command, { policy: session?.policyId || 'default' });
      if (!check.allowed) {
        return { stdout: '', stderr: `[PolicyEngine] Command blocked: ${check.reason}`, code: 1, sandboxed: false, policyBlocked: true };
      }
    }
  } catch { /* non-fatal */ }

  return SandboxRunner.run(session, command, opts);
}

/**
 * Persist the current session state so it can be resumed later.
 * @param {object} session
 * @returns {Promise<object>}
 */
async function checkpoint(session) {
  if (!enabled()) {
    return { saved: false };
  }
  const goal = session.goals[0] || null;
  const saved = await Checkpoint.save(session, goal);
  session.checkpoints.push(saved);
  return saved;
}

/**
 * Resume a previously checkpointed session.
 * @param {string} sessionId
 * @param {string} userId — must match the checkpoint owner
 * @returns {Promise<object|null>}
 */
async function resume(sessionId, userId) {
  if (!enabled()) {
    return null;
  }
  const data = await Checkpoint.load(sessionId, userId);
  if (!data) {
    return null;
  }
  const restored = data.session;

  // Gen B Phase 25 — HandoffProtocol: transfer context from old session to new one
  try {
    const { getHandoffProtocol } = require('../CognitiveBehavior/HandoffProtocol');
    const hp = getHandoffProtocol();
    const newSessionId = crypto.randomUUID();
    const handoff = hp.initiate(sessionId, newSessionId, {
      goals: restored.goals?.map((g) => g.description) || [],
      memorySummary: `Resumed from checkpoint (turn ${restored.turn || 0})`,
      currentTask: restored.goals?.[0]?.description || null,
      sessionId,
    }, 'session_resume');
    if (handoff.handoffId) {
      restored._resumedHandoffId = handoff.handoffId;
      hp.complete(handoff.handoffId, 'HarnessEngine.resume');
    }
  } catch { /* non-fatal */ }

  // FASE 19 — EventSourcing: audit the resume event
  try {
    getEventSourcing()?.logAction(userId, sessionId, 'session_resumed', { turn: restored.turn || 0 });
  } catch { /* non-fatal */ }

  return restored;
}

/**
 * Register a long-running goal so the agent can persist progress across
 * sessions (Codex /goal and Grok Build pattern).
 * @param {object} session
 * @param {string} description
 * @returns {Promise<object>}
 */
async function registerGoal(session, description) {
  if (!enabled()) {
    return { id: null, description };
  }
  const goal = await GoalWorkflow.create(session, description);
  session.goals.push(goal);

  // FASE 20 — create a LongHorizonPlan so the ExecutiveLoop can track multi-phase progress
  try {
    const { getLongHorizonExecution } = require('../Harness/cognitive/LongHorizonExecution');
    const lhe = getLongHorizonExecution();
    const plan = lhe.createPlan({ goal: description, userId: session.userId || session.id });
    goal.longHorizonPlanId = plan.id;
    session.longHorizonPlanId = plan.id;
  } catch { /* non-fatal */ }

  // FASE 17 — store goal as semantic fact so future sessions can recall it
  try {
    getMemory()?.storeFact(
      `Goal registered: ${description}`,
      'agent_goal',
      { confidence: 1.0, tags: [session.id, goal.id || ''] }
    );
    getMemory()?.recordEvent(
      { type: 'goal_registered', goalId: goal.id, description },
      { sessionId: session.id, userId: session.userId }
    );
  } catch { /* non-fatal */ }

  // FASE 5 — WorldModel: add goal as world entity so Director sees it
  try {
    getWorldModel()?.upsertEntity({ id: `goal:${goal.id || goal.description?.slice(0, 20)}`, type: 'goal', name: description.slice(0, 80), attributes: { sessionId: session.id, registeredAt: new Date().toISOString() } });
    getWorldModel()?.updateEnv({ activeGoals: (session.goals || []).map((g) => g.description?.slice(0, 60)) });
  } catch { /* non-fatal */ }

  // FASE 19 — EventSourcing: audit goal registration
  try {
    getEventSourcing()?.logAction(session.userId, session.id, 'goal_registered', { goalId: goal.id, description: description.slice(0, 200) });
  } catch { /* non-fatal */ }

  return goal;
}

/**
 * Isolate a subagent in its own git worktree (Grok Build 8-parallel pattern).
 * @param {object} session
 * @param {object} subagent
 * @returns {Promise<{worktree:string, path:string}>}
 */
async function isolateSubagent(session, subagent) {
  if (!enabled()) {
    return { worktree: null, path: null };
  }
  return WorktreeIsolation.create(session, subagent);
}

module.exports = {
  createSession,
  scaffold,
  preLLMCall,
  preToolCall,
  postToolCall,
  shouldStop,
  runCommand,
  checkpoint,
  resume,
  registerGoal,
  isolateSubagent,
  enabled,
  // expose internals for testing/inspection
  SystemPromptBuilder,
  ToolRegistry,
  SubagentRegistry,
  InjectionPoints,
  ReminderQueue,
  CompactionManager,
  ConversationState,
  StopConditions,
  ToolEnforcement,
  SandboxRunner,
  Checkpoint,
  GoalWorkflow,
  WorktreeIsolation,
};
