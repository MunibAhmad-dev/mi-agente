/**
 * runtimeHooks.js — Conector central entre el flujo de ejecución del agente
 * (initialize.js / client.js / ToolService.js) y los servicios F5-F15.
 *
 * Principio: NO INTRUSIVO. Cada hook es un try/catch que no propaga errores
 * al flujo de chat. El feature flag AGENT_RUNTIME_WIRED desactiva todo:
 * cuando está apagado, los hooks son no-op y LibreChat funciona sin cambios.
 *
 * Servicios conectados:
 *   - F5  CodeIntelligence: indexación de archivos cambiados.
 *   - F6  BlastRadius: análisis de impacto + nivel de riesgo.
 *   - F7  Verification: lint/typecheck/tests/build tras editar archivos.
 *   - F8  Repair: loop de reparación si la verificación falla.
 *   - F9  AgentFirewall: gate antes de ejecutar tools mutadoras.
 *   - F10 Memory: persistencia de artefactos/decisiones por relevancia.
 *   - F11 Subagents: dispatch de roles (vía REST route, no en hot path).
 *   - F12 AdaptiveRouter: selección de modelo por capacidad + métricas.
 *   - F13 Observability: trace de ejecución (model/tokens/tools/latency).
 *   - F15 Optimization: recomendaciones (vía REST route, no en hot path).
 */

const { logger } = require('@librechat/data-schemas');

// Lazy requires para evitar ciclos en el arranque
let _firewall,
  _observability,
  _memory,
  _adaptiveRouter,
  _codeIntel,
  _blast,
  _verification,
  _repair,
  _codingTools,
  _policyEngine,
  _securityScanner,
  _decisionLedger,
  _learningGate;

function firewall() {
  if (!_firewall) {
    _firewall = require('~/server/services/Security/agentFirewall');
  }
  return _firewall;
}

function observability() {
  if (!_observability) {
    const {
      ObservabilityService,
    } = require('~/server/services/Observability/observabilityService');
    _observability = new ObservabilityService();
  }
  return _observability;
}

function memory() {
  if (!_memory) {
    const { MemoryService } = require('~/server/services/Memory/memoryService');
    _memory = new MemoryService();
  }
  return _memory;
}

function adaptiveRouter() {
  if (!_adaptiveRouter) {
    const { AdaptiveModelRouter } = require('~/server/services/AgentArchitect/adaptiveRouter');
    let registry = null;
    try {
      const { ModelRegistry } = require('~/server/services/CapabilityOrchestrator/models/ModelRegistry');
      registry = new ModelRegistry();
    } catch { /* optional — falls back to overrideModelId path */ }
    _adaptiveRouter = new AdaptiveModelRouter({ registry });
  }
  return _adaptiveRouter;
}

function codeIntel() {
  if (!_codeIntel) {
    const {
      CodeIntelligenceService,
    } = require('~/server/services/CodeIntelligence/codeIntelligence');
    _codeIntel = new CodeIntelligenceService();
  }
  return _codeIntel;
}

function blast() {
  if (!_blast) {
    _blast = require('~/server/services/CodeIntelligence/blastRadius');
  }
  return _blast;
}

function verification() {
  if (!_verification) {
    _verification = require('~/server/services/Verification/verificationService');
  }
  return _verification;
}

function repair() {
  if (!_repair) {
    _repair = require('~/server/services/Repair/repairService');
  }
  return _repair;
}

function codingTools() {
  if (!_codingTools) {
    _codingTools = require('~/server/services/AgentRuntime/codingTools');
  }
  return _codingTools;
}

function policyEngine() {
  if (!_policyEngine) {
    _policyEngine = require('~/server/services/PolicyEngine');
  }
  return _policyEngine;
}

function securityScanner() {
  if (!_securityScanner) {
    _securityScanner = require('~/server/services/SecurityScanner').ScanOrchestrator;
  }
  return _securityScanner;
}

function decisionLedger() {
  if (!_decisionLedger) {
    try { _decisionLedger = require('~/server/services/ExecutiveLoop/DecisionLedger').getDecisionLedger(); } catch { _decisionLedger = null; }
  }
  return _decisionLedger;
}

function learningGate() {
  if (!_learningGate) {
    try { _learningGate = require('~/server/services/Learning/LearningEvaluationGate').getLearningEvaluationGate(); } catch { _learningGate = null; }
  }
  return _learningGate;
}

let _contextManager;
function contextManager() {
  if (!_contextManager) {
    const { getContextManagerService } = require('~/server/services/ContextManager');
    _contextManager = getContextManagerService();
  }
  return _contextManager;
}

let _subagentService;
function subagentService() {
  if (!_subagentService) {
    _subagentService = require('~/server/services/Subagents/subagentService');
  }
  return _subagentService;
}

let _skillsDiscovery;
function skillsDiscovery() {
  if (!_skillsDiscovery) {
    _skillsDiscovery = require('~/server/services/SkillsDiscovery');
  }
  return _skillsDiscovery;
}

let _harnessEngine;
function harnessEngine() {
  if (!_harnessEngine) {
    _harnessEngine = require('./HarnessEngine');
  }
  return _harnessEngine;
}

/** Feature flag: cuando es false, todos los hooks son no-op. */
function isWired() {
  return process.env.AGENT_RUNTIME_WIRED === 'true';
}

function safe(fn, hookName) {
  if (!isWired()) {
    return;
  }
  try {
    return fn();
  } catch (error) {
    logger.warn(`[runtimeHooks] ${hookName} error: ${error.message}`);
  }
}

async function safeAsync(fn, hookName) {
  if (!isWired()) {
    return;
  }
  try {
    return await fn();
  } catch (error) {
    logger.warn(`[runtimeHooks] ${hookName} error: ${error.message}`);
  }
}

// Estado por-request: traceId activo, archivos modificados en el turno.
const _requestState = new Map(); // streamId → { traceId, changedFiles }

function getRequestState(streamId) {
  if (!_requestState.has(streamId)) {
    _requestState.set(streamId, { traceId: null, changedFiles: new Set() });
  }
  return _requestState.get(streamId);
}

function clearRequestState(streamId) {
  _requestState.delete(streamId);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Hook al iniciar initializeClient: prepara memoria relevante para el agente.
 * @param {object} ctx - { streamId, agentId, conversationId, userId, projectId }
 */
function onInitializeClient(ctx) {
  return safe(() => {
    getRequestState(ctx.streamId);
    // Pre-cargar memoria del proyecto si hay projectId
    if (ctx.projectId) {
      memory().recall({ layer: 'project', projectId: ctx.projectId, topK: 5 });
    }
    logger.debug(`[runtimeHooks] onInitializeClient: streamId=${ctx.streamId}`);
  }, 'onInitializeClient');
}

/**
 * Hook al cargar tools: mergea las coding tools del SDK en las tools cargadas.
 * @param {object} ctx - { loadedTools, agent, permissions }
 * @returns {object[]} tools mergedadas (o las originales si no wired)
 */
function onToolLoad(ctx) {
  if (!isWired()) {
    return ctx.loadedTools;
  }
  return (
    safe(() => {
      const ct = codingTools();
      const codingToolInstances = ct.resolveCodingTools([], {
        permissions: { read: true, write: true, execute: true },
        workspaceRoot: ctx.workspaceRoot || process.cwd(),
      });

      // Inject agent action tools: BrowserTool, FilesystemOps, ComputerControl
      const agentActionTools = [];
      try {
        const BrowserTool = require('~/app/clients/tools/structured/BrowserTool');
        const FilesystemOps = require('~/app/clients/tools/structured/FilesystemOps');
        const ComputerControl = require('~/app/clients/tools/structured/ComputerControl');
        agentActionTools.push(new BrowserTool(), new FilesystemOps(), new ComputerControl());
      } catch (e) {
        logger.debug(`[runtimeHooks] agent action tools unavailable: ${e.message}`);
      }

      const allNew = [...codingToolInstances, ...agentActionTools];
      if (!allNew.length) {
        return ctx.loadedTools;
      }
      // Merge without duplicating names
      const existing = new Set((ctx.loadedTools || []).map((t) => t.name));
      const merged = [...(ctx.loadedTools || [])];
      for (const tool of allNew) {
        if (!existing.has(tool.name)) {
          merged.push(tool);
          existing.add(tool.name);
        }
      }
      logger.debug(`[runtimeHooks] onToolLoad: +${allNew.length} tools merged (coding+browser+fs+desktop)`);
      return merged;
    }, 'onToolLoad') ?? ctx.loadedTools
  );
}

/**
 * Hook antes de ejecutar una tool: gate de AgentFirewall (F9).
 * @param {object} ctx - { toolName, args, policy }
 * @returns {{ allowed: boolean, reason: string } | null} null = no-op
 */
function onToolExecute(ctx) {
  if (!isWired()) {
    return null;
  }
  return safe(() => {
    const { check, Decision } = firewall();
    const meta = codingTools().TOOL_METADATA[ctx.toolName];
    if (!meta || !meta.mutates) {
      return { allowed: true, reason: 'read-only tool' };
    }
    const result = check({
      action: meta.requiresPermission === 'execute' ? 'shell_command' : 'file_write',
      tool: ctx.toolName,
      filePath: ctx.args?.path || ctx.args?.file,
      command: ctx.args?.command,
      policy: ctx.policy,
    });
    const allowed = result.decision === Decision.ALLOW;
    if (!allowed) {
      logger.info(
        `[runtimeHooks] onToolExecute DENY (firewall): ${ctx.toolName} — ${result.reason}`,
      );
      return { allowed, reason: result.reason };
    }
    // PolicyEngine gate (Fase 5: Cedar policies)
    try {
      const pe = policyEngine();
      const policyResult = pe.checkSync
        ? pe.checkSync({ action: ctx.toolName, resource: ctx.args?.path || ctx.args?.file })
        : null;
      if (policyResult && !policyResult.allowed) {
        logger.info(`[runtimeHooks] onToolExecute DENY (policy): ${ctx.toolName}`);
        return { allowed: false, reason: policyResult.reason || 'Denied by policy' };
      }
    } catch (e) {
      logger.debug(`[runtimeHooks] PolicyEngine check skipped: ${e.message}`);
    }
    return { allowed, reason: result.reason };
  }, 'onToolExecute');
}

/**
 * Hook tras ejecutar una tool mutadora: pipeline de verificación + reparación.
 * WS-5: codeIntelligence → blastRadius → verification → repair → memory.
 * @param {object} ctx - { streamId, toolName, args, result, cwd }
 */
function onToolEnd(ctx) {
  return safeAsync(async () => {
    const ct = codingTools();
    const meta = ct.TOOL_METADATA[ctx.toolName];
    if (!meta || !meta.mutates) {
      return;
    }

    const state = getRequestState(ctx.streamId);
    const changedFile = ctx.args?.path || ctx.args?.file;
    if (changedFile) {
      state.changedFiles.add(changedFile);
    }

    // F5: indexar el archivo cambiado
    const ci = codeIntel();
    try {
      ci.indexFile(changedFile);
    } catch {
      // indexFile puede fallar si el archivo no existe todavía
    }

    const changedFiles = Array.from(state.changedFiles);
    if (!changedFiles.length) {
      return;
    }

    // F6: blast radius → nivel de riesgo
    let riskLevel = 'medium';
    try {
      const impact = blast().analyzeChangeImpact({
        changedFiles,
        codeIntelligence: ci,
      });
      riskLevel = impact.riskLevel || 'medium';
    } catch {
      // fallback a medium
    }

    // F7: verificación según riesgo
    const verify = verification();
    const verifyResult = verify.runVerification({
      riskLevel,
      files: changedFiles,
      cwd: ctx.cwd || process.cwd(),
    });

    // F10: registrar artefacto en memoria
    memory().remember({
      layer: 'artifact',
      type: 'learning',
      content: JSON.stringify({
        tool: ctx.toolName,
        files: changedFiles,
        riskLevel,
        passed: verifyResult.passed,
        summary: verifyResult.summary,
      }),
      projectId: ctx.projectId,
      userId: ctx.userId,
      tags: [ctx.toolName, riskLevel],
      importance: verifyResult.passed ? 0.3 : 0.8,
    });

    // F8: si falló, intentar reparación
    if (!verifyResult.passed) {
      try {
        const repairResult = repair().repairLoop({
          verifyFn: () =>
            verify.runVerification({
              riskLevel,
              files: changedFiles,
              cwd: ctx.cwd || process.cwd(),
            }),
          ctx: { files: changedFiles, cwd: ctx.cwd || process.cwd() },
        });
        logger.info(`[runtimeHooks] onToolEnd repair: ${repairResult.summary}`);
      } catch (error) {
        logger.warn(`[runtimeHooks] repair failed: ${error.message}`);
      }
    }
  }, 'onToolEnd');
}

/**
 * Hook al iniciar processStream: empieza el trace de observabilidad (F13).
 * @param {object} ctx - { streamId, task, modelId }
 * @returns {string|null} traceId
 */
function onRunStart(ctx) {
  return safe(() => {
    const traceId = observability().startTrace({
      task: ctx.task,
      modelId: ctx.modelId,
      input: { streamId: ctx.streamId },
    });
    const state = getRequestState(ctx.streamId);
    state.traceId = traceId;
    logger.debug(`[runtimeHooks] onRunStart: traceId=${traceId}`);
    return traceId;
  }, 'onRunStart');
}

/**
 * Hook al terminar processStream: cierra el trace + registra métricas del router.
 * @param {object} ctx - { streamId, success, tokens, latencyMs, cost, modelId }
 */
function onRunEnd(ctx) {
  return safe(() => {
    const state = getRequestState(ctx.streamId);
    if (state.traceId) {
      observability().endTrace(state.traceId, ctx.success ? 'completed' : 'failed');
    }
    // F12: alimentar métricas del adaptive router
    if (ctx.modelId) {
      try {
        adaptiveRouter().recordCall({
          modelId: ctx.modelId,
          success: ctx.success,
          latencyMs: ctx.latencyMs || 0,
          cost: ctx.cost || 0,
        });
      } catch {
        // router opcional
      }
    }
    // F10: registrar decisión de la sesión
    memory().remember({
      layer: 'session',
      type: 'decision',
      content: JSON.stringify({
        task: ctx.task,
        success: ctx.success,
        tokens: ctx.tokens,
        latencyMs: ctx.latencyMs,
      }),
      userId: ctx.userId,
      tags: ['run', ctx.success ? 'success' : 'failure'],
    });

    // F8: record per-decision confidence + risk in DecisionLedger
    try {
      const dl = decisionLedger();
      if (dl) {
        dl.record({
          sessionId: ctx.streamId,
          userId: ctx.userId,
          intent: ctx.intent || 'unknown',
          confidence: ctx.confidence || null,
          outcome: ctx.success ? 'completed' : 'failed',
          latencyMs: ctx.latencyMs || null,
          meta: { tokens: ctx.tokens, modelId: ctx.modelId },
        });
      }
    } catch { /* non-fatal */ }

    // F16: run learning evaluation gate — score this response quality
    try {
      const gate = learningGate();
      if (gate && ctx.baseline_score != null && ctx.new_score != null) {
        gate.gate({
          model_id: ctx.modelId || 'unknown',
          baseline_score: ctx.baseline_score,
          new_score: ctx.new_score,
          metric: 'overall',
        });
      }
    } catch { /* non-fatal */ }

    clearRequestState(ctx.streamId);
  }, 'onRunEnd');
}

/**
 * Hook de selección de modelo: consulta el adaptive router (F12).
 * @param {object} ctx - { capabilities, overrideModelId }
 * @returns {{ modelId: string, candidates: object[], reason: string } | null}
 */
function onModelSelect(ctx) {
  if (!isWired()) {
    return null;
  }
  return safe(() => {
    return adaptiveRouter().select({
      capabilities: ctx.capabilities,
      overrideModelId: ctx.overrideModelId,
    });
  }, 'onModelSelect');
}

/**
 * Hook para registrar un step intermedio en el trace (eventos de tool/model).
 * @param {object} ctx - { streamId, event }
 */
function onTraceStep(ctx) {
  return safe(() => {
    const state = getRequestState(ctx.streamId);
    if (state.traceId) {
      observability().recordStep(state.traceId, ctx.event);
    }
  }, 'onTraceStep');
}

/**
 * Hook asíncrono de pre-ejecución: SecurityScanner (Fase 4).
 * Escanea el contenido que el agente va a escribir/ejecutar antes de
 * aplicar el cambio. Bloquea si hay secrets o patrones críticos.
 * @param {object} ctx - { content, fileName, toolName }
 * @returns {Promise<{allowed: boolean, reason: string, findings: Array} | null>}
 */
async function onPreWriteScan(ctx) {
  if (!isWired()) {
    return null;
  }
  try {
    if (!ctx?.content || typeof ctx.content !== 'string') {
      return null;
    }
    const scanner = securityScanner();
    const scanResult = await scanner.preExecutionCheck(ctx.content, {
      fileName: ctx.fileName,
      scanSecrets: true,
      scanSAST: true,
      scanDeps: ctx.fileName === 'package.json',
    });
    if (!scanResult.allowed) {
      logger.info(`[runtimeHooks] onPreWriteScan BLOCK: ${ctx.toolName} — ${scanResult.reason}`);
    }
    return scanResult;
  } catch (e) {
    logger.debug(`[runtimeHooks] onPreWriteScan skipped: ${e.message}`);
    return null;
  }
}

/**
 * Hook asíncrono al iniciar un run: AutoSkillMatcher (Fase 10).
 * Analiza la tarea del usuario y, si necesita un skill no instalado,
 * lo busca en el CuratedRegistry, lo instala y lo configura automáticamente.
 * @param {object} ctx - { task, installedSkills }
 * @returns {Promise<object|null>}
 */
async function onRunStartSkillMatch(ctx) {
  if (!isWired()) {
    return null;
  }
  try {
    if (!ctx?.task) {
      return null;
    }
    const sd = skillsDiscovery();
    const installed = ctx.installedSkills || sd.listInstalled();
    const result = await sd.autoMatch({
      userTask: ctx.task,
      llmResponse: ctx.llmResponse,
      installedSkills: installed,
    });
    if (result.installed && result.installed.length > 0) {
      logger.info(
        `[runtimeHooks] onRunStartSkillMatch: installed ${result.installed.length} skill(s) for task`,
      );
    }
    return result;
  } catch (e) {
    logger.debug(`[runtimeHooks] onRunStartSkillMatch skipped: ${e.message}`);
    return null;
  }
}

/**
 * ContextManager compression: runs messages through the sliding-window compressor
 * before the LLM call so the context stays within token limits.
 * @param {object} ctx - { conversationId, messages, maxTokens }
 * @returns {object[]} compressed messages array (internal _tokens/_addedAt fields stripped)
 */
function onContextMessages(ctx) {
  if (!isWired()) return ctx.messages;
  return (
    safe(() => {
      const cm = contextManager();
      const convId = ctx.conversationId || 'default';
      const existing = cm.getContext(convId);
      if (!existing) {
        cm.createContext(convId, { maxTokens: ctx.maxTokens || 8192, strategy: 'sliding' });
      }
      for (const msg of ctx.messages) {
        cm.addMessage(convId, msg);
      }
      const compressed = (cm.getContext(convId)?.messages || ctx.messages).map((m) => {
        const { _tokens, _addedAt, ...clean } = m;
        return clean;
      });
      return compressed;
    }, 'onContextMessages') ?? ctx.messages
  );
}

/**
 * F11 Subagents: dispatch de un rol especializado vía REST (no en hot path).
 * Llama a SubagentService.dispatch() cuando la complejidad de la tarea supera
 * el umbral o cuando el orquestador solicita explícitamente un sub-agente.
 * @param {object} ctx - { role, task, projectId, userId, extraContext, complexityScore }
 * @returns {Promise<object|null>} task descriptor o null
 */
async function onSubagentDispatch(ctx) {
  if (!isWired()) return null;
  return safeAsync(async () => {
    const svc = subagentService();
    const dispatch = svc.dispatch || svc.default?.dispatch;
    if (typeof dispatch !== 'function') return null;
    const descriptor = await dispatch({
      role: ctx.role,
      task: ctx.task,
      projectId: ctx.projectId,
      userId: ctx.userId,
      extraContext: ctx.extraContext,
    });
    logger.debug(`[runtimeHooks] onSubagentDispatch: role=${ctx.role} taskId=${descriptor?.taskId}`);
    return descriptor;
  }, 'onSubagentDispatch');
}

// ---------------------------------------------------------------------------
// HarnessEngine hooks (F11-F15)
// ---------------------------------------------------------------------------

/**
 * Create or resume a harness session and scaffold the agent (system prompt,
 * tools, subagents). Called at run start when the harness is enabled.
 * @param {object} ctx - { streamId, agentId, model, agentSpec, availableTools, userTask, resumeSessionId }
 * @returns {Promise<{session:object, systemPrompt:string, tools:object[], subagents:object[]}>}
 */
async function onHarnessScaffold(ctx) {
  if (!isWired()) {
    return null;
  }
  return safeAsync(async () => {
    const he = harnessEngine();
    let session;
    if (ctx.resumeSessionId) {
      session = await he.resume(ctx.resumeSessionId);
    }
    if (!session) {
      session = he.createSession({ agentId: ctx.agentId, model: ctx.model });
    }
    const { systemPrompt, tools, subagents } = await he.scaffold(session, {
      agentSpec: ctx.agentSpec,
      availableTools: ctx.availableTools,
      userTask: ctx.userTask,
    });
    return { session, systemPrompt, tools, subagents };
  }, 'onHarnessScaffold');
}

/**
 * Inject reminders and run compaction before the next LLM call.
 * @param {object} ctx - { session, message }
 * @returns {Promise<{injected:object[], compacted:boolean}>}
 */
async function onHarnessPreLLM(ctx) {
  if (!isWired()) {
    return { injected: [], compacted: false };
  }
  // Token optimization hook (reduccion-de-tokens engine, FASE 2)
  if (process.env.CONTEXT_ENGINE_ENABLED === 'true' && ctx.message) {
    try {
      const axios = require('axios');
      const url = (process.env.CONTEXT_ENGINE_URL || 'http://localhost:8100') + '/context/optimize';
      const resp = await axios.post(url, { messages: ctx.message }, { timeout: 5000 });
      if (resp.data && resp.data.messages) {
        ctx.message = resp.data.messages;
      }
    } catch {
      // optimizer unavailable — proceed with original messages
    }
  }
  return safeAsync(async () => {
    return harnessEngine().preLLMCall(ctx.session, ctx.message);
  }, 'onHarnessPreLLM');
}

/**
 * PolicyEngine check BEFORE a tool executes. Returns { allowed, reason }.
 * Callers must abort execution when allowed === false.
 * @param {object} ctx - { session, toolCall }
 * @returns {Promise<{allowed:boolean, reason?:string}>}
 */
async function onHarnessPreTool(ctx) {
  if (!isWired()) {
    return { allowed: true };
  }
  const result = await safeAsync(
    async () => harnessEngine().preToolCall(ctx.session, ctx.toolCall),
    'onHarnessPreTool',
  );
  return result || { allowed: true };
}

/**
 * Normalize tool result, update conversation state, enqueue reminders,
 * observe for stop conditions.
 * @param {object} ctx - { session, toolCall, result }
 * @returns {object} normalized result
 */
function onHarnessPostTool(ctx) {
  if (!isWired()) {
    return ctx.result;
  }
  return safe(
    () => harnessEngine().postToolCall(ctx.session, ctx.toolCall, ctx.result),
    'onHarnessPostTool',
  );
}

/**
 * Evaluate whether the agent loop should stop based on what happened.
 * @param {object} ctx - { session }
 * @returns {{stop:boolean, reason:string|null}}
 */
function onHarnessShouldStop(ctx) {
  if (!isWired()) {
    return { stop: false, reason: null };
  }
  return (
    safe(() => harnessEngine().shouldStop(ctx.session), 'onHarnessShouldStop') || {
      stop: false,
      reason: null,
    }
  );
}

/**
 * Persist the current session state as a checkpoint.
 * @param {object} ctx - { session }
 * @returns {Promise<object>}
 */
async function onHarnessCheckpoint(ctx) {
  if (!isWired()) {
    return { saved: false };
  }
  return safeAsync(async () => harnessEngine().checkpoint(ctx.session), 'onHarnessCheckpoint');
}

/**
 * Run a shell command through the sandbox.
 * @param {object} ctx - { session, command, cwd, timeout }
 * @returns {Promise<{stdout:string, stderr:string, code:number, sandboxed:boolean}>}
 */
async function onHarnessRunCommand(ctx) {
  if (!isWired()) {
    return null;
  }
  return safeAsync(
    async () =>
      harnessEngine().runCommand(ctx.session, ctx.command, { cwd: ctx.cwd, timeout: ctx.timeout }),
    'onHarnessRunCommand',
  );
}

module.exports = {
  isWired,
  onInitializeClient,
  onToolLoad,
  onToolExecute,
  onToolEnd,
  onRunStart,
  onRunEnd,
  onModelSelect,
  onTraceStep,
  onPreWriteScan,
  onRunStartSkillMatch,
  onContextMessages,
  onSubagentDispatch,
  // HarnessEngine hooks (F11-F15)
  onHarnessScaffold,
  onHarnessPreLLM,
  onHarnessPreTool,
  onHarnessPostTool,
  onHarnessShouldStop,
  onHarnessCheckpoint,
  onHarnessRunCommand,
  // Exportar singletons para acceso desde otros módulos
  getServices: () => ({
    firewall: firewall(),
    observability: observability(),
    memory: memory(),
    adaptiveRouter: adaptiveRouter(),
    codeIntel: codeIntel(),
    codingTools: codingTools(),
    policyEngine: policyEngine(),
    securityScanner: securityScanner(),
    skillsDiscovery: skillsDiscovery(),
    harnessEngine: harnessEngine(),
    decisionLedger: decisionLedger(),
    learningGate: learningGate(),
  }),
};
