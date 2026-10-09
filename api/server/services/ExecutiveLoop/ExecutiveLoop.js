/**
 * ExecutiveLoop — Face 8: Full Intent→Director→TaskGraph→Policy→Agent→Verifier→Critic→Memory pipeline.
 *
 * Upgraded pipeline (vs original flat loop):
 *   1. Classify  — keyword + heuristic intent detection (IntentClassifier)
 *   2. Decompose — subgoals, constraints, success criteria extracted
 *   3. Direct    — Executive Director picks approach + model (Director)
 *   4. Plan      — Planner produces dynamic step list
 *   5. TaskGraph — Steps converted to a DAG (parallel where possible) via TaskGraphBuilder
 *   6. Policy    — Each step risk-assessed (PolicyEngine, levels 0–7)
 *   7. Execute   — LLM calls per step (StepExecutor + UniversalLLMRouter)
 *   8. Verify    — Quality score per step (LoopVerifier, 0.0–1.0)
 *   9. Critic    — LLM adversarial review on low-quality/high-risk steps (CriticAgent)
 *  10. Checkpoint— State saved after each step group (CheckpointManager)
 *  11. Memory    — Session outcome saved for future recall (CrossSessionMemory)
 *  12. Complete  — Final summary with quality, risk profile, critic notes
 */

'use strict';

const crypto = require('crypto');
const { classify, classifyAsync } = require('./IntentClassifier');
const { decide, decideWithJudge, replan } = require('./Director');
const { getDecisionLog } = require('./DecisionLog');
const { plan } = require('./Planner');
const { executeStep } = require('./StepExecutor');
const { verify, verifyAsync } = require('./LoopVerifier');
const { buildGraph } = require('./TaskGraphBuilder');
const { assessStep } = require('./PolicyEngine');

// Lazy-load heavy cognitive services to avoid circular deps at boot
let _critic = null;
let _checkpoint = null;
let _memory = null;
let _learning = null;
let _llmRouter = null;
let _repair = null;
let _worldModel = null;
let _eventSourcing = null;
let _memoriaMulticapa = null;
let _longHorizon = null;
let _agentFabric = null;

function getLLMRouter() {
  if (!_llmRouter) {
    try {
      const { UniversalLLMRouter } = require('../Harness/cognitive/llm/UniversalLLMRouter');
      _llmRouter = new UniversalLLMRouter({});
    } catch {
      _llmRouter = null;
    }
  }
  return _llmRouter;
}

function getCritic() {
  if (!_critic) {
    try {
      const { CriticAgent } = require('../Harness/cognitive/CriticAgent');
      _critic = new CriticAgent({ enabled: true });
    } catch {
      _critic = { evaluate: async () => ({ evaluated: false, reason: 'unavailable' }) };
    }
  }
  return _critic;
}

function getCheckpoint() {
  if (!_checkpoint) {
    try {
      const { CheckpointManager } = require('../Harness/cognitive/CheckpointManager');
      _checkpoint = new CheckpointManager({ autoCheckpoint: true });
    } catch {
      _checkpoint = { save: () => ({ success: false }), load: () => null };
    }
  }
  return _checkpoint;
}

function getMemory() {
  if (!_memory) {
    try {
      const { CrossSessionMemory } = require('../Harness/cognitive/CrossSessionMemory');
      _memory = new CrossSessionMemory();
    } catch {
      _memory = { saveSession: () => {} };
    }
  }
  return _memory;
}

function getLearning() {
  if (!_learning) {
    try {
      const { LearningEngine } = require('../Harness/cognitive/learning/LearningEngine');
      _learning = new LearningEngine();
    } catch {
      _learning = { reflect: () => null, learnStrategy: () => null };
    }
  }
  return _learning;
}

function getRepair() {
  if (!_repair) {
    try {
      _repair = require('../Repair/repairService');
    } catch {
      _repair = { classifyFailure: () => null, decideRepairAction: () => 'escalate' };
    }
  }
  return _repair;
}

function getWorldModel() {
  if (!_worldModel) {
    try { ({ getWorldModel: _worldModel } = require('../Harness/cognitive/WorldModel')); }
    catch { _worldModel = () => ({ updateEnv: () => {}, getContextSummary: () => '', upsertEntity: () => {} }); }
  }
  return typeof _worldModel === 'function' ? _worldModel() : _worldModel;
}

function getEventSourcing() {
  if (!_eventSourcing) {
    try { ({ getEventSourcing: _eventSourcing } = require('../Harness/cognitive/EventSourcing')); }
    catch { _eventSourcing = () => ({ append: () => {}, logAction: () => {} }); }
  }
  return typeof _eventSourcing === 'function' ? _eventSourcing() : _eventSourcing;
}

function getMemoriaMulticapa() {
  if (!_memoriaMulticapa) {
    try { ({ getMemoriaMulticapa: _memoriaMulticapa } = require('../Harness/cognitive/MemoriaMulticapa')); }
    catch { _memoriaMulticapa = () => ({ getContext: () => ({ context: '', episodicCount: 0 }), recordEpisode: () => {}, learnProcedure: () => {} }); }
  }
  return typeof _memoriaMulticapa === 'function' ? _memoriaMulticapa() : _memoriaMulticapa;
}

function getLongHorizonExecution() {
  if (!_longHorizon) {
    try { ({ getLongHorizonExecution: _longHorizon } = require('../Harness/cognitive/LongHorizonExecution')); }
    catch { _longHorizon = () => ({ getActivePlan: () => null }); }
  }
  return typeof _longHorizon === 'function' ? _longHorizon() : _longHorizon;
}

// FASE 8 — AgentFabric
function getAgentFabric() {
  if (!_agentFabric) {
    try { ({ getAgentFabric: _agentFabric } = require('../Harness/cognitive/AgentFabric')); }
    catch { _agentFabric = () => ({ routeAndPlan: () => ({ tasks: [], parallel: false }), createSession: () => 'stub', getStats: () => ({}) }); }
  }
  return typeof _agentFabric === 'function' ? _agentFabric() : _agentFabric;
}

// ── Risk estimation for director (FASE 15/16) ────────────────────────────────

function _estimateMessageRisk(message, classification) {
  const lower = message.toLowerCase();
  let risk = 0;

  // Intent-based baseline
  if (classification.intent === 'code_task') risk += 3;
  else if (classification.intent === 'multi_step_task') risk += 2;

  // Content signals
  if (/delete|drop|remove|destroy|truncate|wipe|erase/i.test(lower)) risk += 4;
  if (/production|prod|live|deploy|release|publish/i.test(lower)) risk += 3;
  if (/password|secret|token|credential|api.?key/i.test(lower)) risk += 4;
  if (/sudo|root|admin|privilege|elevat/i.test(lower)) risk += 3;
  if (/money|payment|transaction|bank|transfer/i.test(lower)) risk += 5;
  if (/all users|everyone|bulk|mass/i.test(lower)) risk += 2;

  return Math.min(10, risk);
}

// ── Session pub/sub ───────────────────────────────────────────────────────────

const sessions = new Map();

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { listeners: new Set(), events: [], done: false });
  }
  return sessions.get(sessionId);
}

function subscribe(sessionId, listener) {
  const session = getOrCreateSession(sessionId);
  session.events.forEach(listener);
  session.listeners.add(listener);
  return () => session.listeners.delete(listener);
}

function emit(sessionId, event) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.events.push(event);
  session.listeners.forEach((fn) => { try { fn(event); } catch {} });
}

function closeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) session.done = true;
  setTimeout(() => sessions.delete(sessionId), 5 * 60 * 1000);
}

// ── Session MongoDB persistence (Face 8 §restart-recovery) ──────────────────

/**
 * Persist an ExecutiveLoop session to MongoDB so it survives server restarts.
 * Best-effort — never throws. Stores intent, steps, quality, errors.
 */
async function _persistSessionToMongo(sessionId, { intent, direction, steps, avgQuality, errors, userId }) {
  try {
    const { AgentMemory } = require('~/models');
    if (typeof AgentMemory?.create !== 'function') return;
    await AgentMemory.create({
      memId: `exec_session_${sessionId}`,
      layer: 'session',
      type: 'decision',
      content: JSON.stringify({ intent, direction, steps: (steps || []).map((s) => ({ name: s.name, status: s.status, quality: s.quality })), avgQuality, errors }),
      userId: userId || 'default',
      projectId: null,
      tags: ['executive_loop', 'session_snapshot'],
      importance: avgQuality || 0.5,
      timestamp: new Date(),
    });
  } catch {
    // MongoDB unavailable — silently skip; the CheckpointManager disk snapshot is the fallback
  }
}

/**
 * Load a previously persisted ExecutiveLoop session from MongoDB.
 * Returns the snapshot object or null if not found / unavailable.
 */
async function loadSession(sessionId) {
  try {
    const { AgentMemory } = require('~/models');
    if (typeof AgentMemory?.findOne !== 'function') return null;
    const doc = await AgentMemory.findOne({ memId: `exec_session_${sessionId}` }).lean();
    if (!doc) return null;
    return JSON.parse(doc.content);
  } catch {
    return null;
  }
}

// ── Goal decomposition (Phase 2) ─────────────────────────────────────────────

function decomposeGoal(message, intent) {
  const lower = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  // Extract explicit constraints from message text
  const constraints = [];
  if (/don't|do not|without|avoid|no \w+/i.test(message)) constraints.push('Avoid specified exclusions');
  if (/must|required|mandatory|need to/i.test(message)) constraints.push('Required conditions present');
  if (/within|by|before|deadline|asap|urgently/i.test(lower)) constraints.push('Time constraint detected');

  // Success criteria heuristics
  const successCriteria = [];
  if (intent === 'code_task') {
    successCriteria.push('Code executes without errors', 'Meets stated requirements', 'Handles edge cases');
  } else if (intent === 'research_request') {
    successCriteria.push('Facts are accurate and cited', 'All sub-questions addressed');
  } else if (intent === 'multi_step_task') {
    successCriteria.push('All sub-tasks completed', 'Results integrated coherently');
  } else {
    successCriteria.push('Question answered clearly and accurately');
  }

  // Extract subgoals by splitting on connectors
  const subgoals = message
    .split(/\band\b|\bthen\b|\bafter(?:ward)?s?\b|\bfinally\b|\bfirst\b/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && s.length < 120)
    .slice(0, 4);

  return {
    subgoals: subgoals.length >= 2 ? subgoals : [message.slice(0, 100)],
    constraints,
    successCriteria,
    estimatedComplexity: wordCount > 50 ? 'high' : wordCount > 20 ? 'medium' : 'low',
  };
}

// ── Critic evaluation (Phase 9 — applied selectively) ────────────────────────

async function runCritic(stepName, result, riskLevel) {
  if (!result || typeof result !== 'string' || result.length < 20) return null;

  const critic = getCritic();
  try {
    const evaluation = await critic.evaluate(stepName, result, { riskLevel });
    return evaluation;
  } catch {
    return null;
  }
}

// ── Checkpoint helpers (Phase 12) ─────────────────────────────────────────────

function saveCheckpoint(sessionId, state) {
  const cp = getCheckpoint();
  return cp.save(sessionId, state, { label: `step_${state.lastCompletedStep}` });
}

// ── Memory persistence (Phase 17) ─────────────────────────────────────────────

function persistToMemory(sessionId, { intent, steps, avgQuality, errors, taskType, userId }) {
  const mem = getMemory();
  try {
    mem.saveSession({
      id: sessionId,
      userId: userId || 'default',
      summary: `${taskType} task completed with ${Math.round(avgQuality * 100)}% quality`,
      keyFacts: steps.filter((s) => s.status === 'done').map((s) => s.name),
      errors: errors,
      taskType,
      toolsUsed: ['ExecutiveLoop', 'StepExecutor', 'CriticAgent'],
      decisions: [{ intent, avgQuality }],
    });
  } catch {}
}

// ── Directive builder ─────────────────────────────────────────────────────────

/**
 * Build a concise XML-style directive tag from loop results.
 * Injected into the system prompt so the LLM response is guided by the
 * executive analysis — this is what wires the loop to the real chat reply.
 */
function _buildDirective({ intent, direction, steps, goal, avgQuality }) {
  try {
    const intentStr = intent?.intent || 'general';
    const approach = direction?.approach || 'direct';
    const complexity = goal?.estimatedComplexity || 'medium';
    const subgoalsStr = (goal?.subgoals || []).slice(0, 3).join(' | ');
    const criteriaStr = (goal?.successCriteria || []).slice(0, 2).join('; ');
    const quality = typeof avgQuality === 'number' ? Math.round(avgQuality * 100) : 0;

    // Include top step results that have content (max 2 steps)
    const stepSummary = (steps || [])
      .filter((s) => s.resultContent && s.status === 'done')
      .slice(0, 2)
      .map((s) => `[${s.name}]: ${s.resultContent.slice(0, 200)}`)
      .join('\n');

    const parts = [
      `<executive_brief intent="${intentStr}" approach="${approach}" complexity="${complexity}" quality="${quality}%">`,
      subgoalsStr ? `Subgoals: ${subgoalsStr}` : null,
      criteriaStr ? `Success criteria: ${criteriaStr}` : null,
      stepSummary ? `Analysis:\n${stepSummary}` : null,
      '</executive_brief>',
    ].filter(Boolean);

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ── Main run ─────────────────────────────────────────────────────────────────

/**
 * Run the full Face 8 executive loop.
 *
 * @param {string} sessionId - unique run ID
 * @param {string} message   - user message
 * @returns {Promise<{ intent, direction, steps, goal }>}
 */
async function run(sessionId, message, userId) {
  getOrCreateSession(sessionId);
  const errors = [];
  const auditTrail = []; // Event sourcing (Phase 19)

  function log(event) {
    auditTrail.push({ ...event, ts: Date.now() });
    emit(sessionId, event);
  }

  // ── Phase 0: EventSourcing — record session start in audit trail (Phase 19) ─
  try {
    getEventSourcing().append({ type: 'executive_loop:start', userId, sessionId, data: { message: message.slice(0, 200) } });
  } catch { /* non-fatal */ }

  // ── Phase 0a: Recall prior context — MemoriaMulticapa (Phase 17) ────────────
  let priorContext = '';
  try {
    // Prefer MemoriaMulticapa (three-layer) over flat CrossSessionMemory
    const mm = getMemoriaMulticapa();
    const { context: mmContext, episodicCount } = mm.getContext(userId || 'default', message, { episodicLimit: 3 });
    if (episodicCount > 0) {
      priorContext = mmContext;
      log({ phase: 'multilayer_memory_recalled', episodicCount });
    } else {
      // Fallback to CrossSessionMemory
      const mem = getMemory();
      const { context, sessions: priorSessions } = mem.getContext(userId || 'default', message, 3);
      if (priorSessions.length > 0) {
        priorContext = context;
        log({ phase: 'memory_recalled', count: priorSessions.length });
      }
    }
  } catch {
    // Non-fatal — proceed without prior context
  }

  // ── Phase 0b: WorldModel — get situational context (Phase 5) ────────────────
  let worldContext = '';
  try {
    const wm = getWorldModel();
    wm.updateEnv({ activeUser: userId, lastMessage: message.slice(0, 100), sessionId });
    worldContext = wm.getContextSummary();
    log({ phase: 'world_model_updated', entities: wm.getStats().entities });
  } catch { /* non-fatal */ }

  // ── Phase 0c: LongHorizon — check if there's an active plan (Phase 20) ──────
  let activePlan = null;
  try {
    const lhe = getLongHorizonExecution();
    activePlan = lhe.getActivePlan(userId || 'default');
    if (activePlan) {
      log({ phase: 'long_horizon_plan_found', planId: activePlan.id, progress: activePlan.progress });
    }
  } catch { /* non-fatal */ }

  // ── Phase 0b: Load active Agent Constitution (Face 7) ────────────────────
  let constitutionText = '';
  try {
    const { getActiveConstitution } = require('~/models/AgentConstitution');
    const activeConst = await getActiveConstitution();
    if (activeConst?.fullText) {
      constitutionText = activeConst.fullText;
      log({ phase: 'constitution_loaded', version: activeConst.version });
    }
  } catch {
    // Non-fatal — proceed without constitution
  }

  try {
    // ── Phase 1: Classify ─────────────────────────────────────────────────────
    log({ phase: 'classifying', message: 'Understanding your request…' });
    await tick();

    const classification = await classifyAsync(message, getLLMRouter());
    log({
      phase: 'classified',
      intent: classification.intent,
      confidence: classification.confidence,
      signals: classification.signals,
      method: classification.method,
    });

    // ── Phase 2: Decompose goal ──────────────────────────────────────────────
    const goal = decomposeGoal(message, classification.intent);
    log({
      phase: 'decomposed',
      subgoals: goal.subgoals,
      constraints: goal.constraints,
      successCriteria: goal.successCriteria,
      complexity: goal.estimatedComplexity,
    });

    // ── Phase 3: Director — FASE 16 MultiModelJudge for high-risk decisions ──
    log({ phase: 'directing', message: 'Deciding approach…' });
    await tick();

    const msgRisk = _estimateMessageRisk(message, classification);
    const direction = await decideWithJudge(classification, message, msgRisk, worldContext);

    // FASE 15: Record decision to DecisionLog
    try {
      getDecisionLog().record({
        sessionId,
        userId,
        intent: classification.intent,
        approach: direction.approach,
        risk: msgRisk,
        confidence: classification.confidence,
        evidence: [message.slice(0, 100), worldContext ? worldContext.slice(0, 80) : null].filter(Boolean),
        assumptions: ['Classification is accurate', 'WorldModel state is current'],
        reversibility: msgRisk >= 7 ? 'irreversible' : msgRisk >= 4 ? 'partial' : 'reversible',
        judgeVerdict: direction.judgeVerdict,
        judgeConfidence: direction.judgeConfidence,
        judgeReasoning: direction.judgeReasoning,
      });
    } catch { /* non-fatal */ }

    log({
      phase: 'directed',
      approach: direction.approach,
      model: direction.model,
      estimatedDurationSec: direction.estimatedDurationSec,
      judgeVerdict: direction.judgeVerdict || 'not_required',
      msgRisk,
    });

    // If judge explicitly denied this plan, log it prominently
    if (direction.judgeVerdict === 'deny') {
      log({ phase: 'judge_denied', reason: direction.judgeReasoning?.[0] || 'MultiModelJudge denied execution' });
    }

    // ── Phase 3b: AgentFabric — FASE 8 multi-agent routing for complex tasks ─
    let fabricPlan = null;
    if (goal.estimatedComplexity === 'high' || direction.approach === 'plan_and_execute' || direction.approach === 'research_first') {
      try {
        const fabric = getAgentFabric();
        const fabricSessionId = fabric.createSession({ sessionId, userId, intent: classification.intent, complexity: goal.estimatedComplexity });
        fabricPlan = fabric.routeAndPlan(fabricSessionId, message, { intent: classification.intent, complexity: goal.estimatedComplexity });
        log({ phase: 'agent_fabric_planned', personas: fabricPlan.personas, parallel: fabricPlan.parallel, taskCount: fabricPlan.tasks.length });
      } catch { /* non-fatal */ }
    }

    // ── Phase 3c: ResearchOS — Gen B Phase 33 for research-intent messages ────
    let researchContext = '';
    if (classification.intent === 'research_request' && goal.estimatedComplexity !== 'low') {
      try {
        const { research } = require('../ResearchOS/orchestrator/ResearchOrchestrator');
        log({ phase: 'research_os_starting', question: message.slice(0, 100) });
        const timeout = new Promise((resolve) => setTimeout(resolve, 8000));
        const researchResult = await Promise.race([
          research(message, { mode: 'auto', budget: { maxRounds: 2 }, offline: false }),
          timeout,
        ]);
        if (researchResult && researchResult.answer) {
          researchContext = researchResult.answer.slice(0, 1000);
          log({ phase: 'research_os_done', confidence: researchResult.confidence, claimCount: researchResult.claims?.length || 0 });
        }
      } catch { /* ResearchOS is optional — non-fatal */ }
    }

    // ── Phase 4: Plan ────────────────────────────────────────────────────────
    log({ phase: 'planning', message: 'Building task graph…' });
    await tick();

    const { steps: plannedStepNames, rationale } = plan(classification, message);

    // ── Phase 5: Build DAG (TaskGraph) ────────────────────────────────────────
    const graphId = `${sessionId}_${Date.now()}`;

    // Shared result store, keyed by step id
    const stepResults = new Map();

    // Step state list (for UI and final report)
    const stepList = plannedStepNames.map((name, i) => ({
      id: `s${i}`,
      index: i,
      name,
      status: 'pending',
      quality: null,
      riskLevel: null,
      parallel: false,
      criticNotes: null,
      provider: null,
    }));

    log({ phase: 'planned', steps: stepList, rationale, graphId });

    // ── Phase 6 + 7 + 8 + 9: Execute via DAG (with Policy, Verify, Critic) ──

    const { scheduler, stepDefs } = buildGraph({
      graphId,
      steps: plannedStepNames,
      executor: async (def) => {
        const stepIdx = parseInt(def.id.replace('s', ''), 10);
        const step = stepList[stepIdx];

        // Apply policy (Phase 6)
        const policy = assessStep(def.name);
        step.riskLevel = policy.riskLevel;
        step.parallel = def.parallel;

        if (policy.blocked) {
          step.status = 'blocked';
          log({ phase: 'step_blocked', stepIndex: stepIdx, stepName: def.name, riskLevel: policy.riskLevel });
          throw new Error(`Blocked by policy (risk 7): ${def.name}`);
        }

        // Checkpoint before high-risk steps (Phase 12)
        if (policy.requiresCheckpoint) {
          saveCheckpoint(sessionId, {
            lastCompletedStep: stepIdx - 1,
            steps: stepList,
            intent: classification.intent,
          });
        }

        log({
          phase: 'executing',
          stepIndex: stepIdx,
          stepName: def.name,
          total: stepList.length,
          riskLevel: policy.riskLevel,
          riskLabel: policy.label,
          parallel: def.parallel,
        });

        // Build history from completed steps for context
        const history = stepList
          .filter((s) => s.status === 'done' && stepResults.has(s.id))
          .slice(-2)
          .map((s) => ({ stepName: s.name, result: stepResults.get(s.id)?.result || '' }));

        // Log step start to EventSourcing audit trail (Phase 19)
        try { getEventSourcing().logAction(userId, sessionId, `step:${def.name}`, { stepIndex: stepIdx, riskLevel: policy.riskLevel }); } catch {}

        // Execute (Phase 7)
        const stepResult = await executeStep({
          stepName: def.name,
          stepIndex: stepIdx,
          message,
          intent: classification.intent,
          history,
          model: direction.model,
          priorContext: priorContext || null,
          constitutionText: constitutionText || null,
          worldContext: worldContext || null,       // Phase 5: WorldModel context
          activePlan: activePlan || null,           // Phase 20: LongHorizon active plan
        });

        // Verify (Phase 8) — LLM-backed when router available
        const verification = await verifyAsync(stepResult, getLLMRouter());
        step.quality = verification.quality;
        step.provider = stepResult.provider || null;

        // Critic (Phase 9) — only for low quality OR medium+ risk steps
        let criticEval = null;
        const shouldCritique = verification.quality < 0.75 || policy.riskLevel >= 3;
        if (shouldCritique && stepResult.result && !stepResult.fallback) {
          criticEval = await runCritic(def.name, stepResult.result, policy.riskLevel);
        }

        if (criticEval?.evaluated) {
          const criticPassed = criticEval.pass !== false;
          step.criticNotes = criticEval.issues?.map((i) => i.message || String(i)).slice(0, 3) || null;

          // If critic says FAIL and quality is already low → classify failure and decide repair action
          if (!criticPassed && verification.quality < 0.5) {
            step.status = 'failed';
            const repair = getRepair();
            const failCategory = repair.classifyFailure({
              status: 'FAIL',
              kind: 'quality',
              stepName: def.name,
              quality: verification.quality,
            });
            const repairAction = repair.decideRepairAction(failCategory, errors.length);
            step.repairAction = repairAction;
            errors.push(`${def.name}: critic FAIL — repair=${repairAction} category=${failCategory}`);
            log({ phase: 'repair_decision', stepName: def.name, failCategory, repairAction });
          } else {
            step.status = verification.passed ? 'done' : 'partial';
          }
        } else {
          step.status = verification.passed ? 'done' : (stepResult.fallback ? 'fallback' : 'partial');
        }

        stepResults.set(def.id, stepResult);
        // Store result content on the step for callers that need it
        step.resultContent = typeof stepResult.result === 'string' ? stepResult.result.slice(0, 500) : null;

        log({
          phase: 'step_done',
          stepIndex: stepIdx,
          stepName: def.name,
          quality: verification.quality,
          passed: verification.passed,
          riskLevel: policy.riskLevel,
          provider: stepResult.provider || null,
          fallback: stepResult.fallback || false,
          criticPass: criticEval?.evaluated ? (criticEval.pass !== false) : null,
          criticNotes: step.criticNotes,
          parallel: def.parallel,
        });

        return stepResult;
      },
    });

    // Wire DAG events to session emit
    scheduler.on('nodeStarted', ({ nodeId }) => {
      const idx = parseInt(nodeId.replace('s', ''), 10);
      if (stepList[idx]) stepList[idx].status = 'running';
    });

    // Execute DAG (steps run in parallel where deps allow)
    await scheduler.execute(graphId);

    // ── FASE 13: Replanning — if critical steps failed, generate recovery plan ─
    const failedSteps = stepList.filter((s) => s.status === 'failed');
    if (failedSteps.length > 0) {
      const replanDirection = replan(
        classification,
        message,
        failedSteps[0].name,
        failedSteps[0].criticNotes?.[0] || failedSteps[0].repairAction || 'step failed',
        direction,
        worldContext,
      );
      // Record replan decision to DecisionLog
      try {
        getDecisionLog().record({
          sessionId,
          userId,
          intent: classification.intent,
          approach: replanDirection.approach,
          risk: msgRisk + 1,
          confidence: classification.confidence * 0.8,
          evidence: [`Failed step: ${failedSteps[0].name}`, `Original approach: ${direction.approach}`],
          assumptions: ['Recovery steps address root cause', 'Escalated approach is available'],
          reversibility: 'partial',
          judgeVerdict: null,
          stepName: `replan:${failedSteps[0].name}`,
        });
      } catch { /* non-fatal */ }
      log({
        phase: 'replanned',
        failedSteps: failedSteps.map((s) => s.name),
        replanApproach: replanDirection.approach,
        recoverySteps: replanDirection.steps,
        isReplan: true,
      });
    }

    // ── Phase 10: Final verification ─────────────────────────────────────────
    log({ phase: 'verifying', message: 'Checking overall output quality…' });
    await tick(30);

    const doneSteps = stepList.filter((s) => s.status === 'done' || s.status === 'partial' || s.status === 'fallback');
    const avgQuality = doneSteps.length
      ? doneSteps.reduce((sum, s) => sum + (s.quality || 0), 0) / doneSteps.length
      : 0;

    const overallPassed = avgQuality >= 0.55 && doneSteps.length > 0;

    // Check against success criteria
    const successCriteriaResults = goal.successCriteria.map((c) => ({
      criterion: c,
      met: overallPassed,
    }));

    // ── Phase 11: Save experience + learn (Face 9) ───────────────────────────
    try {
      const learning = getLearning();
      await learning.reflect({
        id: sessionId,
        sessionId,
        task: message,
        actions: stepList.map((s) => s.name),
        observations: stepList.map((s) => ({ step: s.name, quality: s.quality, status: s.status })),
        result: {
          success: overallPassed,
          quality: avgQuality,
          duration: Date.now(),
          toolCalls: stepList.length,
        },
        score: avgQuality,
        feedback: overallPassed ? 'passed' : 'partial',
      });
      await learning.learnStrategy(message, {
        success: overallPassed,
        approach: direction.approach,
        quality: avgQuality,
      });
    } catch {
      // learning failure must not interrupt the response
    }

    // ── Phase 12: Save to memory (CrossSessionMemory + MemoriaMulticapa) ───────
    persistToMemory(sessionId, {
      intent: classification.intent,
      steps: stepList,
      avgQuality,
      errors,
      taskType: classification.intent,
      userId,
    });

    // Phase 17 — MemoriaMulticapa: record episode + learn successful procedure
    try {
      const mm = getMemoriaMulticapa();
      const summary = `${classification.intent} task: ${message.slice(0, 150)} — quality ${Math.round(avgQuality * 100)}%`;
      mm.recordEpisode(userId || 'default', summary, [classification.intent, direction.approach]);
      if (overallPassed) {
        mm.learnProcedure(classification.intent, stepList.map((s) => s.name), avgQuality);
      }
    } catch { /* non-fatal */ }

    // Phase 5 — WorldModel: update with completed task context
    try {
      const wm = getWorldModel();
      wm.updateEnv({
        lastIntent: classification.intent,
        lastApproach: direction.approach,
        lastQuality: avgQuality,
        activeGoals: activePlan ? [activePlan.goal] : [],
        knownConstraints: goal.constraints,
      });
      wm.upsertEntity({ id: `session:${sessionId}`, type: 'session', name: sessionId, attributes: { intent: classification.intent, quality: avgQuality, ts: new Date().toISOString() } });
    } catch { /* non-fatal */ }

    // Phase 19 — EventSourcing: log completion
    try {
      getEventSourcing().append({ type: 'executive_loop:complete', userId, sessionId, severity: overallPassed ? 'info' : 'warn', data: { avgQuality, stepsTotal: stepList.length, stepsDone: doneSteps.length, intent: classification.intent } });
    } catch { /* non-fatal */ }

    // ── Phase 13: Final checkpoint + MongoDB session snapshot ────────────────
    saveCheckpoint(sessionId, { complete: true, steps: stepList, avgQuality });
    _persistSessionToMongo(sessionId, {
      intent: classification.intent,
      direction,
      steps: stepList,
      avgQuality,
      errors,
      userId,
    }).catch(() => {});

    log({
      phase: 'complete',
      quality: +avgQuality.toFixed(2),
      passed: overallPassed,
      stepsTotal: stepList.length,
      stepsDone: doneSteps.length,
      stepsFailed: stepList.filter((s) => s.status === 'failed').length,
      stepsBlocked: stepList.filter((s) => s.status === 'blocked').length,
      successCriteriaResults,
      errors: errors.slice(0, 5),
      auditEvents: auditTrail.length,
      summary: overallPassed
        ? `Completed ${doneSteps.length}/${stepList.length} steps with ${Math.round(avgQuality * 100)}% quality`
        : `Partial completion — ${doneSteps.length}/${stepList.length} steps succeeded`,
    });

    // Build a concise directive string so callers can inject it as LLM context
    const directive = _buildDirective({ intent: classification, direction, steps: stepList, goal, avgQuality });
    // Append ResearchOS context if available
    const fullDirective = researchContext ? `${directive}\n<research_context>${researchContext.slice(0, 800)}</research_context>` : directive;

    closeSession(sessionId);
    return { intent: classification, direction, steps: stepList, goal, directive: fullDirective };
  } catch (err) {
    errors.push(err.message);
    log({ phase: 'error', message: err.message });
    saveCheckpoint(sessionId, { error: err.message, ts: Date.now() });
    closeSession(sessionId);
    throw err;
  }
}

function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { run, subscribe, sessions, loadSession };
