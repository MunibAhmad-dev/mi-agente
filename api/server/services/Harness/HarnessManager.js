/**
 * HarnessManager — Central orchestrator for DeepSeek Harness integration.
 *
 * Bridges our existing architecture (Provider Registry, LLMGateway,
 * ExecutionEngine, ToolService) with DSH's plugin-based agent runtime.
 *
 * Architecture:
 *   IntegrationManager
 *       ↓
 *   HarnessManager (this)
 *       ├── DSHModelPlugin (connects our LLM providers)
 *       ├── DSHToolAdapter (connects our tools)
 *       ├── DSHSessionManager (conversation state)
 *       ├── DSHContextManager (context window management)
 *       ├── DSHSandboxPlugin (isolated execution)
 *       └── AgentLoop (understand → plan → execute → observe → evaluate)
 *
 * Design principle: We WRAP DSH concepts, not COPY them.
 * Our existing services remain the primary layer.
 * DSH provides the agent runtime patterns we adopt.
 */

// Lazy load EventBus to avoid circular dependency
let _eventBus = null;
function getEventBusLazy() {
  if (!_eventBus) {
    try { _eventBus = require('../EventBus').getEventBus(); } catch {}
  }
  return _eventBus;
}
const path = require('path');
const { DSHModelPlugin } = require('./DSHModelPlugin');
const { DSHToolAdapter } = require('./DSHToolAdapter');
const { DSHSessionManager } = require('./DSHSessionManager');
const { DSHContextManager } = require('./DSHContextManager');
const { DSHAgentLoop } = require('./DSHAgentLoop');
let MemoryManagerClass = null;
try { MemoryManagerClass = require('./MemoryManager').MemoryManager; } catch {}
let DeepSearchAgentClass = null;
try { DeepSearchAgentClass = require('./DeepSearchAgent').DeepSearchAgent; } catch {}
let AgentOrchestratorClass = null;
try { AgentOrchestratorClass = require('./AgentOrchestrator').AgentOrchestrator; } catch {}
let ConnectorManagerClass = null;
try { ConnectorManagerClass = require('./connectors/ConnectorManager').ConnectorManager; } catch {}
let TaskPlannerClass = null;
try { TaskPlannerClass = require('./TaskPlanner').TaskPlanner; } catch {}
let CheckpointManagerClass = null;
try { CheckpointManagerClass = require('./CheckpointManager').CheckpointManager; } catch {}
let RecoveryManagerClass = null;
try { RecoveryManagerClass = require('./RecoveryManager').RecoveryManager; } catch {}
let ProviderOrchestratorClass = null;
try { ProviderOrchestratorClass = require('./ProviderOrchestrator').ProviderOrchestrator; } catch {}
let VerificationAgentClass = null;
try { VerificationAgentClass = require('./VerificationAgent').VerificationAgent; } catch {}
let ObservabilityHubClass = null;
try { ObservabilityHubClass = require('./ObservabilityHub').ObservabilityHub; } catch {}
let CostTrackerClass = null;
try { CostTrackerClass = require('./CostTracker').CostTracker; } catch {}
let SecurityHardeningClass = null;
try { SecurityHardeningClass = require('./SecurityHardening').SecurityHardening; } catch {}
let AuditReportClass = null;
try { AuditReportClass = require('./AuditReport').AuditReport; } catch {}
let VectorStoreManagerClass = null;
try { VectorStoreManagerClass = require('./VectorStoreManager'); } catch {}
let FileProcessorClass = null;
try { FileProcessorClass = require('./FileProcessor'); } catch {}
let VoiceManagerClass = null;
try { VoiceManagerClass = require('./VoiceManager'); } catch {}
let SchedulerManagerClass = null;
try { SchedulerManagerClass = require('./SchedulerManager'); } catch {}
let ReportGeneratorClass = null;
try { ReportGeneratorClass = require('./ReportGenerator'); } catch {}
let MCPServerClass = null;
try { MCPServerClass = require('./MCPServer'); } catch {}
let SandboxRunnerClass = null;
try { SandboxRunnerClass = require('./SandboxRunner'); } catch {}
let SocialMediaSearchClass = null;
try { SocialMediaSearchClass = require('./SocialMediaSearch'); } catch {}
let VoiceConversationClass = null;
try { VoiceConversationClass = require('./VoiceConversation'); } catch {}
let StreamingManagerClass = null;
try { StreamingManagerClass = require('./StreamingManager'); } catch {}
let BackgroundTaskManagerClass = null;
try { BackgroundTaskManagerClass = require('./BackgroundTaskManager'); } catch {}
let CitationTrackerClass = null;
try { CitationTrackerClass = require('./CitationTracker'); } catch {}
let SuggestedActionsEngineClass = null;
try { SuggestedActionsEngineClass = require('./SuggestedActionsEngine'); } catch {}
let CognitiveEngineClass = null;
try { CognitiveEngineClass = require('./cognitive').CognitiveEngine; } catch {}
let ExecutiveBrainClass = null;
try { ExecutiveBrainClass = require('./cognitive').ExecutiveBrain; } catch {}

const logger = {
  debug: (...args) => console.log('[HarnessManager]', ...args),
  info: (...args) => console.info('[HarnessManager]', ...args),
  warn: (...args) => console.warn('[HarnessManager]', ...args),
  error: (...args) => console.error('[HarnessManager]', ...args),
};

/**
 * Agent execution states
 */
const AgentState = {
  IDLE: 'idle',
  UNDERSTANDING: 'understanding',
  PLANNING: 'planning',
  EXECUTING: 'executing',
  OBSERVING: 'observing',
  EVALUATING: 'evaluating',
  WAITING_APPROVAL: 'waiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * HarnessManager — manages the DSH-style agent runtime.
 */
class HarnessManager {
  constructor(config = {}) {
    this.config = {
      defaultProvider: config.defaultProvider || process.env.LLM_DEFAULT_PROVIDER || 'openai',
      defaultModel: config.defaultModel || process.env.LLM_DEFAULT_MODEL || 'gpt-4o-mini',
      maxIterations: config.maxIterations || 20,
      maxTokens: config.maxTokens || 16384,
      temperature: config.temperature || 0.7,
      timeout: config.timeout || 300000, // 5 minutes per tool call
      enableSandbox: config.enableSandbox !== false,
      enableApproval: config.enableApproval !== false,
      approvalTimeout: config.approvalTimeout || 300000, // 5 minutes
      ...config,
    };

    this.eventBus = null; // Lazy loaded via getEventBusLazy()
    this.modelPlugin = new DSHModelPlugin(this.config);
    this.toolAdapter = new DSHToolAdapter(this.config);
    this.sessionManager = new DSHSessionManager(this.config);
    this.contextManager = new DSHContextManager(this.config);
    this.agentLoop = new DSHAgentLoop(this.config);

    // Memory system
    this.memoryManager = null;
    if (MemoryManagerClass) {
      this.memoryManager = new MemoryManagerClass({
        persistDir: config.memoryPersistDir || null,
        ...config,
      });
      this.contextManager.setMemoryManager(this.memoryManager);
      logger.info('[HarnessManager] Memory system enabled');
    }

    // DeepSearch agent
    this.deepSearch = null;
    if (DeepSearchAgentClass) {
      this.deepSearch = new DeepSearchAgentClass(config);
      logger.info('[HarnessManager] DeepSearch agent enabled');
    }

    // Multi-agent orchestrator
    this.orchestrator = null;
    if (AgentOrchestratorClass) {
      this.orchestrator = new AgentOrchestratorClass(config);
      logger.info('[HarnessManager] Agent orchestrator enabled');
    }

    // Service connectors (Gmail, Slack, GitHub, Calendar)
    this.connectorManager = null;
    if (ConnectorManagerClass) {
      this.connectorManager = new ConnectorManagerClass(config);
      const registered = this.connectorManager.listIds();
      if (registered.length > 0) {
        logger.info('[HarnessManager] Connectors enabled:', registered.join(', '));
      }
    }

    // Planning, checkpoints, recovery
    this.taskPlanner = null;
    this.checkpointManager = null;
    this.recoveryManager = null;
    if (TaskPlannerClass) this.taskPlanner = new TaskPlannerClass(config);
    if (CheckpointManagerClass) {
      this.checkpointManager = new CheckpointManagerClass({
        persistDir: config.checkpointDir || null,
        ...config,
      });
    }
    if (RecoveryManagerClass) {
      this.recoveryManager = new RecoveryManagerClass(config);
      if (this.checkpointManager) this.recoveryManager.setCheckpointManager(this.checkpointManager);
      if (this.taskPlanner) this.recoveryManager.setTaskPlanner(this.taskPlanner);
      if (this.memoryManager) this.recoveryManager.setMemoryManager(this.memoryManager);
      if (this.agentLoop) this.recoveryManager.setAgentLoop(this.agentLoop);
      logger.info('[HarnessManager] Recovery system enabled');
    }

    // Multi-provider orchestrator
    this.providerOrchestrator = null;
    if (ProviderOrchestratorClass) {
      this.providerOrchestrator = new ProviderOrchestratorClass(config);
      logger.info('[HarnessManager] Provider orchestrator enabled');
    }

    // Verification + Observability
    this.verificationAgent = null;
    this.observability = null;
    this.costTracker = null;
    if (VerificationAgentClass) this.verificationAgent = new VerificationAgentClass(config);
    if (ObservabilityHubClass) {
      this.observability = new ObservabilityHubClass(config);
      logger.info('[HarnessManager] Observability enabled');
    }
    if (CostTrackerClass) {
      this.costTracker = new CostTrackerClass(config);
      logger.info('[HarnessManager] Cost tracking enabled');
    }

    // Security hardening
    this.security = null;
    if (SecurityHardeningClass) {
      this.security = new SecurityHardeningClass(config);
      logger.info('[HarnessManager] Security hardening enabled');
    }

    // === NEW GAP MODULES ===
    this.vectorStore = null;
    if (VectorStoreManagerClass) {
      this.vectorStore = new VectorStoreManagerClass(config);
      logger.info('[HarnessManager] VectorStore (RAG) enabled');
    }
    this.fileProcessor = null;
    if (FileProcessorClass) {
      this.fileProcessor = new FileProcessorClass(config);
      logger.info('[HarnessManager] FileProcessor enabled');
    }
    this.voiceManager = null;
    if (VoiceManagerClass) {
      this.voiceManager = new VoiceManagerClass(config);
      logger.info('[HarnessManager] VoiceManager enabled');
    }
    this.schedulerManager = null;
    if (SchedulerManagerClass) {
      this.schedulerManager = new SchedulerManagerClass(config);
      logger.info('[HarnessManager] SchedulerManager enabled');
    }
    this.reportGenerator = null;
    if (ReportGeneratorClass) {
      this.reportGenerator = new ReportGeneratorClass(config);
      logger.info('[HarnessManager] ReportGenerator enabled');
    }
    this.mcpServer = null;
    if (MCPServerClass) {
      this.mcpServer = new MCPServerClass(config);
      logger.info('[HarnessManager] MCPServer enabled');
    }
    this.sandboxRunner = null;
    if (SandboxRunnerClass) {
      this.sandboxRunner = new SandboxRunnerClass(config);
      logger.info('[HarnessManager] SandboxRunner enabled');
    }

    // === NEW: Social Media, Voice, Streaming, Background, Citations, Suggestions ===
    this.socialMedia = null;
    if (SocialMediaSearchClass) {
      this.socialMedia = new SocialMediaSearchClass(config);
      logger.info('[HarnessManager] SocialMediaSearch enabled');
    }
    this.voiceConversation = null;
    if (VoiceConversationClass) {
      this.voiceConversation = new VoiceConversationClass(config);
      logger.info('[HarnessManager] VoiceConversation enabled');
    }
    this.streaming = null;
    if (StreamingManagerClass) {
      this.streaming = new StreamingManagerClass(config);
      logger.info('[HarnessManager] StreamingManager enabled');
    }
    this.backgroundTasks = null;
    if (BackgroundTaskManagerClass) {
      this.backgroundTasks = new BackgroundTaskManagerClass(config);
      logger.info('[HarnessManager] BackgroundTaskManager enabled');
    }
    this.citationTracker = null;
    if (CitationTrackerClass) {
      this.citationTracker = new CitationTrackerClass(config);
      logger.info('[HarnessManager] CitationTracker enabled');
    }
    this.suggestedActions = null;
    if (SuggestedActionsEngineClass) {
      this.suggestedActions = new SuggestedActionsEngineClass(config);
      logger.info('[HarnessManager] SuggestedActionsEngine enabled');
    }

    // === COGNITIVE ENGINE ===
    this.cognitiveEngine = null;
    if (CognitiveEngineClass) {
      this.cognitiveEngine = new CognitiveEngineClass(config);
      logger.info('[HarnessManager] CognitiveEngine enabled');
    }
    this.executiveBrain = null;
    if (ExecutiveBrainClass) {
      this.executiveBrain = new ExecutiveBrainClass(config);
      logger.info('[HarnessManager] ExecutiveBrain enabled');
    }

    this.activeSessions = new Map();
    this._stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalToolCalls: 0,
      totalTokens: { prompt: 0, completion: 0 },
    };

    logger.info('[HarnessManager] Initialized');
  }

  /**
   * Initialize the harness with providers and tools.
   */
  async initialize() {
    await this.modelPlugin.initialize();
    await this.toolAdapter.initialize();

    // Connect DeepSearch agent to our plugins
    if (this.deepSearch) {
      this.deepSearch.setModelPlugin(this.modelPlugin);
      this.deepSearch.setToolAdapter(this.toolAdapter);
    }

    // Connect orchestrator to our plugins
    if (this.orchestrator) {
      this.orchestrator.setModelPlugin(this.modelPlugin);
      this.orchestrator.setToolAdapter(this.toolAdapter);
    }

    // Connect provider orchestrator
    if (this.providerOrchestrator) {
      this.providerOrchestrator.setModelPlugin(this.modelPlugin);
    }

    // Register connector tools with the tool adapter
    if (this.connectorManager) {
      const connectorTools = this.connectorManager.getToolDefinitions();
      for (const toolDef of connectorTools) {
        const fnName = toolDef.function.name;
        const connectorId = fnName.substring(0, fnName.indexOf('_'));
        const action = fnName.substring(fnName.indexOf('_') + 1);
        this.toolAdapter.register({
          name: fnName,
          description: toolDef.function.description,
          parameters: toolDef.function.parameters,
          capabilities: ['connector', connectorId],
          permissions: [connectorId],
          timeout: 30000,
          execute: async (args) => this.connectorManager.executeTool(fnName, args),
        });
      }
      if (connectorTools.length > 0) {
        logger.info(`[HarnessManager] Registered ${connectorTools.length} connector tools`);
      }
    }

    if (this.memoryManager) {
      logger.info('[HarnessManager] Memory layers:', JSON.stringify(this.memoryManager.getStats().layers));
    }
    logger.info('[HarnessManager] Ready — providers:', this.modelPlugin.getProviderIds());
    logger.info('[HarnessManager] Ready — tools:', this.toolAdapter.getToolIds());
    return true;
  }

  /**
   * Run an agent task through the harness.
   *
   * @param {object} params
   * @param {string} params.task - The task description
   * @param {Array} [params.messages] - Conversation history
   * @param {string} [params.provider] - Override provider
   * @param {string} [params.model] - Override model
   * @param {string[]} [params.tools] - Specific tools to enable
   * @param {object} [params.context] - Additional context
   * @param {string} [params.sessionId] - Resume existing session
   * @param {AbortSignal} [params.signal]
   *
   * @returns {Promise<AgentResult>}
   */
  async run(params) {
    const startTime = Date.now();
    const sessionId = params.sessionId || this.sessionManager.createSession();
    const state = {
      sessionId,
      state: AgentState.IDLE,
      iterations: 0,
      toolCalls: [],
      messages: params.messages || [],
      result: null,
      error: null,
    };

    this.activeSessions.set(sessionId, state);
    this._stats.totalRuns++;

    getEventBusLazy()?.publish('harness:started', {
      sessionId,
      task: params.task,
      provider: params.provider || this.config.defaultProvider,
      model: params.model || this.config.defaultModel,
    });

    try {
      // Phase 1: UNDERSTAND
      state.state = AgentState.UNDERSTANDING;
      const understanding = await this._understand(params, state);

      // Phase 2: PLAN
      state.state = AgentState.PLANNING;
      const plan = await this._plan(understanding, params, state);

      // Phase 3-6: EXECUTE LOOP
      let finalResult = null;
      for (let i = 0; i < this.config.maxIterations; i++) {
        state.iterations = i + 1;

        // Execute next step (with self-healing)
        state.state = AgentState.EXECUTING;
        let stepResult;
        try {
          const healingResult = await this.agentLoop.executeWithHealing(
            (ctx) => this._executeStep(plan, ctx.state, ctx.params),
            { state, params },
          );
          stepResult = healingResult.result;
        } catch (healingError) {
          // Self-healing exhausted — record failure
          stepResult = {
            content: `Step failed after self-healing: ${healingError.message}`,
            toolCall: null,
            toolResults: [],
            step: plan.steps[state.iterations - 1],
            error: healingError.message,
          };
        }

        // Observe result
        state.state = AgentState.OBSERVING;
        const observation = await this._observe(stepResult, state);

        // Evaluate
        state.state = AgentState.EVALUATING;
        const evaluation = await this._evaluate(observation, plan, state);

        // Record tool call
        if (stepResult.toolCall) {
          state.toolCalls.push(stepResult.toolCall);
          this._stats.totalToolCalls++;
        }

        // Check if done
        if (evaluation.done) {
          finalResult = evaluation.result;
          break;
        }

        // Check if needs approval
        if (evaluation.needsApproval && this.config.enableApproval) {
          state.state = AgentState.WAITING_APPROVAL;
          const approved = await this._requestApproval(evaluation.approvalRequest, state);
          if (!approved) {
            finalResult = { content: 'Task cancelled by user.', cancelled: true };
            break;
          }
        }

        // Replan if needed
        if (evaluation.replan) {
          state.state = AgentState.PLANNING;
          await this._replan(evaluation.replanReason, plan, state);
        }
      }

      // Complete
      state.state = AgentState.COMPLETED;
      state.result = finalResult;
      this._stats.successfulRuns++;

      // Store result in memory for future reference
      if (this.memoryManager) {
        this.memoryManager.addToTaskMemory(
          `task_result:${params.task.slice(0, 80)}`,
          finalResult?.content || 'Task completed',
          { importance: 'high', tags: ['task', 'result'] },
        );
        this.memoryManager.summarizeTaskToSession();
        this.memoryManager.clearWorkingMemory();
      }

      const latency = Date.now() - startTime;
      getEventBusLazy()?.publish('harness:completed', {
        sessionId,
        iterations: state.iterations,
        toolCalls: state.toolCalls.length,
        latency,
      });

      this.activeSessions.delete(sessionId);

      return {
        sessionId,
        success: true,
        content: finalResult?.content || '',
        iterations: state.iterations,
        toolCalls: state.toolCalls,
        latency,
      };
    } catch (error) {
      state.state = AgentState.FAILED;
      state.error = error.message;
      this._stats.failedRuns++;

      // Record error in memory for self-healing
      if (this.memoryManager) {
        this.memoryManager.recordError(
          error.message,
          'Task failed — review error context for future reference',
          { category: 'task_failure', taskId: params.task?.slice(0, 80) },
        );
      }

      getEventBusLazy()?.publish('harness:failed', {
        sessionId,
        error: error.message,
        iterations: state.iterations,
      });

      this.activeSessions.delete(sessionId);

      return {
        sessionId,
        success: false,
        content: '',
        error: error.message,
        iterations: state.iterations,
        toolCalls: state.toolCalls,
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Phase 1: UNDERSTAND — analyze the task and determine what's needed.
   */
  async _understand(params, state) {
    const messages = this.contextManager.buildUnderstandingMessages(params, state);
    const response = await this.modelPlugin.complete({
      messages,
      provider: params.provider,
      model: params.model,
      temperature: 0.3, // Low temp for analysis
      maxTokens: 2048,
    });

    return {
      analysis: response.content,
      intent: params.task,
      capabilities: this._detectCapabilities(params.task),
    };
  }

  /**
   * Phase 2: PLAN — create a step-by-step plan.
   */
  async _plan(understanding, params, state) {
    const messages = this.contextManager.buildPlanningMessages(understanding, params, state);
    const response = await this.modelPlugin.complete({
      messages,
      provider: params.provider,
      model: params.model,
      temperature: 0.3,
      maxTokens: 4096,
    });

    return {
      steps: this._parsePlan(response.content),
      analysis: understanding.analysis,
      originalTask: params.task,
    };
  }

  /**
   * Phase 3: EXECUTE — run the next step.
   */
  async _executeStep(plan, state, params) {
    const currentStep = plan.steps[state.iterations - 1] || plan.steps[plan.steps.length - 1];
    const availableTools = this.toolAdapter.getToolsForCapability(
      currentStep?.capability || 'general',
    );

    const messages = this.contextManager.buildExecutionMessages(
      plan,
      currentStep,
      state,
      availableTools,
      params,
    );

    const response = await this.modelPlugin.complete({
      messages,
      provider: params.provider,
      model: params.model,
      tools: availableTools.map((t) => t.definition),
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    // Check if model wants to call a tool
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolResults = [];
      for (const toolCall of response.toolCalls) {
        const result = await this._executeTool(toolCall, state);
        toolResults.push(result);
      }
      return {
        content: response.content,
        toolCall: response.toolCalls,
        toolResults,
        step: currentStep,
      };
    }

    return {
      content: response.content,
      toolCall: null,
      toolResults: [],
      step: currentStep,
    };
  }

  /**
   * Execute a single tool call.
   */
  async _executeTool(toolCall, state) {
    const toolName = toolCall.function?.name || toolCall.name;
    const toolArgs = JSON.parse(toolCall.function?.arguments || '{}');

    logger.debug(`[HarnessManager] Tool call: ${toolName}`, Object.keys(toolArgs));

    try {
      const result = await this.toolAdapter.execute(toolName, toolArgs, {
        sessionId: state.sessionId,
        timeout: this.config.timeout,
      });

      return {
        toolName,
        args: toolArgs,
        result,
        success: true,
      };
    } catch (error) {
      logger.error(`[HarnessManager] Tool ${toolName} failed:`, error.message);
      return {
        toolName,
        args: toolArgs,
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Phase 4: OBSERVE — process the execution result.
   */
  async _observe(stepResult, state) {
    return {
      stepResult,
      iteration: state.iterations,
      previousToolCalls: state.toolCalls,
    };
  }

  /**
   * Phase 5: EVALUATE — determine if we're done, need to replan, or continue.
   */
  async _evaluate(observation, plan, state) {
    const lastResult = observation.stepResult;
    const isLastStep = state.iterations >= plan.steps.length;

    // Check if the last tool call indicates completion
    if (lastResult.content && !lastResult.toolCall) {
      return {
        done: true,
        result: { content: lastResult.content },
        replan: false,
        needsApproval: false,
      };
    }

    // Check if we've hit max iterations
    if (state.iterations >= this.config.maxIterations) {
      return {
        done: true,
        result: { content: 'Maximum iterations reached.' },
        replan: false,
        needsApproval: false,
      };
    }

    // Check if all steps are done
    if (isLastStep && lastResult.toolResults.every((r) => r.success)) {
      return {
        done: true,
        result: { content: lastResult.content || 'All steps completed.' },
        replan: false,
        needsApproval: false,
      };
    }

    // Continue
    return {
      done: false,
      replan: false,
      needsApproval: false,
    };
  }

  /**
   * Request human approval for a critical action.
   */
  async _requestApproval(request, state) {
    getEventBusLazy()?.publish('harness:approval_needed', {
      sessionId: state.sessionId,
      request,
    });

    // Wait for approval (in real implementation, this would be via WebSocket/API)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(false); // Auto-deny after timeout
      }, this.config.approvalTimeout);

      // Listen for approval event via EventBus
      const eb = getEventBusLazy();
      if (!eb) {
        clearTimeout(timer);
        resolve(false);
        return;
      }
      const handler = (event) => {
        if (event.sessionId === state.sessionId) {
          clearTimeout(timer);
          eb.off?.('harness:approval_response', handler);
          resolve(event.approved);
        }
      };
      eb.on('harness:approval_response', handler);
    });
  }

  /**
   * Replan after a failure or change in circumstances.
   * Calls the planner again with error context to create a new plan.
   */
  async _replan(reason, plan, state) {
    logger.info(`[HarnessManager] Replanning: ${reason}`);

    const systemPrompt = [
      'You are an AI agent replanning after a failure.',
      '',
      'The previous plan failed. Analyze what went wrong and create a new plan.',
      'Consider the error reason and previous steps attempted.',
      '',
      'Respond with a JSON array of NEW steps:',
      '[{"step": 1, "description": "...", "capability": "code|search|filesystem|git|browser|general"}]',
    ].join('\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Original task: ${plan.originalTask}`,
          `Previous plan had ${plan.steps.length} steps`,
          `Failed at step ${state.iterations}`,
          `Error reason: ${reason}`,
          `Previous tool calls: ${JSON.stringify(state.toolCalls.map(tc => ({ tool: tc.tool || tc.function?.name, success: tc.success })))}`,
          '',
          'Create a new plan that avoids the previous failure.',
        ].join('\n'),
      },
    ];

    const response = await this.modelPlugin.complete({
      messages,
      temperature: 0.3,
      maxTokens: 4096,
    });

    // Update the plan in-place
    const newSteps = this._parsePlan(response.content);
    plan.steps = newSteps;
    plan.replanCount = (plan.replanCount || 0) + 1;
    plan.replanHistory = plan.replanHistory || [];
    plan.replanHistory.push({ reason, timestamp: new Date().toISOString(), stepsCount: newSteps.length });

    logger.info(`[HarnessManager] Replanned: ${newSteps.length} new steps (replan #${plan.replanCount})`);
  }

  /**
   * Detect capabilities needed from task description.
   */
  _detectCapabilities(task) {
    const capabilities = ['general'];
    const lower = (task || '').toLowerCase();

    if (lower.includes('code') || lower.includes('program') || lower.includes('debug')) {
      capabilities.push('code');
    }
    if (lower.includes('search') || lower.includes('find') || lower.includes('research')) {
      capabilities.push('search');
    }
    if (lower.includes('file') || lower.includes('read') || lower.includes('write')) {
      capabilities.push('filesystem');
    }
    if (lower.includes('git') || lower.includes('commit') || lower.includes('branch')) {
      capabilities.push('git');
    }
    if (lower.includes('browser') || lower.includes('web') || lower.includes('url')) {
      capabilities.push('browser');
    }
    if (lower.includes('test') || lower.includes('verify')) {
      capabilities.push('testing');
    }

    return capabilities;
  }

  /**
   * Parse plan from LLM response.
   */
  _parsePlan(response) {
    try {
      // Try to extract JSON plan
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall back to line-based parsing
    }

    // Parse numbered list
    const steps = [];
    const lines = response.split('\n');
    for (const line of lines) {
      const match = line.match(/^\d+[\.\)]\s*(.+)/);
      if (match) {
        steps.push({
          description: match[1].trim(),
          capability: 'general',
        });
      }
    }

    return steps.length > 0 ? steps : [{ description: response, capability: 'general' }];
  }

  /**
   * Cancel a running session.
   */
  cancel(sessionId) {
    const state = this.activeSessions.get(sessionId);
    if (state) {
      state.state = AgentState.CANCELLED;
      this.activeSessions.delete(sessionId);
      getEventBusLazy()?.publish('harness:cancelled', { sessionId });
    }
  }

  /**
   * Get harness stats.
   */
  getStats() {
    return {
      ...this._stats,
      activeSessions: this.activeSessions.size,
    };
  }

  /**
   * Get session state.
   */
  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  // ============================================================
  // CONVENIENCE METHODS
  // ============================================================

  /**
   * Run a deep research task.
   */
  async deepResearch(params) {
    if (!this.deepSearch) {
      throw new Error('DeepSearch agent not available');
    }
    return this.deepSearch.research(params);
  }

  /**
   * Orchestrate a complex task across specialist agents.
   */
  async orchestrateTask(params) {
    if (!this.orchestrator) {
      throw new Error('Agent orchestrator not available');
    }
    return this.orchestrator.orchestrate(params);
  }

  /**
   * Run a full forensic audit of the harness system.
   */
  async runAudit() {
    if (!AuditReportClass) throw new Error('AuditReport not available');
    const harnessDir = path.join(__dirname);
    const audit = new AuditReportClass(harnessDir);
    return audit.runFullAudit();
  }

  /**
   * Get full system status including all sub-components.
   */
  getFullStatus() {
    return {
      harness: this.getStats(),
      memory: this.memoryManager?.getStats() || null,
      deepSearch: this.deepSearch?.getStats() || null,
      orchestrator: this.orchestrator?.getStats() || null,
      connectors: this.connectorManager?.listAll() || [],
      taskPlanner: this.taskPlanner ? { tasks: this.taskPlanner._tasks.size } : null,
      checkpoints: this.checkpointManager?.getStats() || null,
      recovery: this.recoveryManager?.getStats() || null,
      providerOrchestrator: this.providerOrchestrator?.getStats() || null,
      observability: this.observability?.exportDashboard() || null,
      costTracker: this.costTracker?.export() || null,
      security: this.security?.getStats() || null,
      tools: this.toolAdapter?.getStats() || null,
      providers: this.modelPlugin?.getProviderIds() || [],
      // New gap modules
      vectorStore: this.vectorStore?.getStats() || null,
      fileProcessor: this.fileProcessor?.getStats() || null,
      voice: this.voiceManager?.getStatus() || null,
      scheduler: this.schedulerManager?.getStats() || null,
      reports: this.reportGenerator?.getStats() || null,
      mcp: this.mcpServer?.getStatus() || null,
      sandbox: this.sandboxRunner?.getStats() || null,
      socialMedia: this.socialMedia?.getStats() || null,
      voiceConversation: this.voiceConversation?.getStats() || null,
      streaming: this.streaming?.getStats() || null,
      backgroundTasks: this.backgroundTasks?.getStats() || null,
      citationTracker: this.citationTracker?.getStats() || null,
      suggestedActions: this.suggestedActions?.getStats() || null,
      cognitive: this.cognitiveEngine?.getStatus() || null,
      executiveBrain: this.executiveBrain?.getStats() || null,
    };
  }

  // ============================================================
  // GAP MODULE CONVENIENCE METHODS
  // ============================================================

  /**
   * Search the vector store for relevant documents.
   */
  async vectorSearch(query, options) {
    if (!this.vectorStore) throw new Error('VectorStore not available');
    return this.vectorStore.search(query, options);
  }

  /**
   * Add a document to the vector store.
   */
  async vectorAddDocument(doc) {
    if (!this.vectorStore) throw new Error('VectorStore not available');
    return this.vectorStore.addDocument(doc);
  }

  /**
   * Process a file (PDF, image, spreadsheet, etc.).
   */
  async processFile(filePath, options) {
    if (!this.fileProcessor) throw new Error('FileProcessor not available');
    return this.fileProcessor.processFile(filePath, options);
  }

  /**
   * Convert text to speech.
   */
  async textToSpeech(text, options) {
    if (!this.voiceManager) throw new Error('VoiceManager not available');
    return this.voiceManager.textToSpeech(text, options);
  }

  /**
   * Convert speech to text.
   */
  async speechToText(audioPath, options) {
    if (!this.voiceManager) throw new Error('VoiceManager not available');
    return this.voiceManager.speechToText(audioPath, options);
  }

  /**
   * Schedule a cron job.
   */
  scheduleJob(id, cronExpr, callback, options) {
    if (!this.schedulerManager) throw new Error('SchedulerManager not available');
    return this.schedulerManager.schedule(id, cronExpr, callback, options);
  }

  /**
   * Generate a report from Markdown.
   */
  async generateReport(markdown, options) {
    if (!this.reportGenerator) throw new Error('ReportGenerator not available');
    return this.reportGenerator.markdownToPDF(markdown, options);
  }

  /**
   * Handle an MCP request.
   */
  async handleMCPRequest(request) {
    if (!this.mcpServer) throw new Error('MCPServer not available');
    return this.mcpServer.handleRequest(request);
  }

  /**
   * Execute code in sandbox.
   */
  async sandboxExecute(language, code, options) {
    if (!this.sandboxRunner) throw new Error('SandboxRunner not available');
    return this.sandboxRunner.execute(language, code, options);
  }
}

// Singleton
let instance = null;

function getHarnessManager(config) {
  if (!instance) {
    instance = new HarnessManager(config);
  }
  return instance;
}

function createHarnessManager(config) {
  instance = new HarnessManager(config);
  return instance;
}

module.exports = {
  HarnessManager,
  AgentState,
  getHarnessManager,
  createHarnessManager,
};
