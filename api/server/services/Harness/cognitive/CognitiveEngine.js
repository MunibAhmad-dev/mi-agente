'use strict';

const { EventBus } = require('./EventBus');

/**
 * CognitiveEngine - Main orchestrator for the cognitive system.
 *
 * Connects: Memory, Knowledge, Evidence, RAG, Learning, Experience,
 * Skills, Experiments, Consolidation, Self-Improvement.
 *
 * Provider-agnostic: works with any LLM via adapters.
 */
class CognitiveEngine {
  constructor(config = {}) {
    this.config = config;
    this.bus = new EventBus();
    this.userId = config.userId || 'default';
    this.projectId = config.projectId || 'default';

    // Executive Brain
    try {
      const { ExecutiveBrain } = require('./ExecutiveBrain');
      this.executiveBrain = new ExecutiveBrain(config);
    } catch { this.executiveBrain = null; }

    // New memory systems
    try {
      const { ErrorLearningSystem } = require('./memory/ErrorLearningSystem');
      this.errorLearning = new ErrorLearningSystem(config);
    } catch { this.errorLearning = null; }
    try {
      const { UserProfileMemory } = require('./memory/UserProfileMemory');
      this.userProfile = new UserProfileMemory(config);
    } catch { this.userProfile = null; }
    try {
      const { MemoryCompressor } = require('./memory/MemoryCompressor');
      this.memoryCompressor = new MemoryCompressor(config);
    } catch { this.memoryCompressor = null; }
    try {
      const { SuggestedRepliesEngine } = require('./SuggestedRepliesEngine');
      this.suggestedReplies = new SuggestedRepliesEngine(config);
    } catch { this.suggestedReplies = null; }
    try {
      const { PersistentStorage } = require('./memory/PersistentStorage');
      this.storage = new PersistentStorage(config);
    } catch { this.storage = null; }
    try {
      const { MultiUserIsolation } = require('./memory/MultiUserIsolation');
      this.userIsolation = new MultiUserIsolation(config);
    } catch { this.userIsolation = null; }
    try {
      const { CognitiveSleep } = require('./consolidation/CognitiveSleep');
      this.cognitiveSleep = new CognitiveSleep(config);
    } catch { this.cognitiveSleep = null; }
    try {
      const { QueryExpander } = require('./rag/QueryExpander');
      this.queryExpander = new QueryExpander(config);
    } catch { this.queryExpander = null; }
    try {
      const { PromptInjectionDetector } = require('./evidence/PromptInjectionDetector');
      this.injectionDetector = new PromptInjectionDetector(config);
    } catch { this.injectionDetector = null; }
    try {
      const { TokenCostOptimizer } = require('./rag/TokenCostOptimizer');
      this.costOptimizer = new TokenCostOptimizer(config);
    } catch { this.costOptimizer = null; }

    // Token Optimization Engine
    try {
      const { TokenOptimizationEngine } = require('./optimization/TokenOptimizationEngine');
      this.tokenOptimizer = new TokenOptimizationEngine(config);
    } catch { this.tokenOptimizer = null; }

    // LLM Module (Router + Local LLM + Compression + Embeddings + Cost)
    try {
      const llm = require('./llm');
      this.llmRouter = new llm.UniversalLLMRouter(config);
      this.localLLM = new llm.LocalLLMManager(config);
      this.promptCompressor = new llm.PromptCompressor(config);
      this.embeddings = new llm.EmbeddingsModule(config);
      this.costOptimizer2 = new llm.CostOptimizer(config);
    } catch (e) { console.warn('[CognitiveEngine] LLM module partially loaded:', e.message); }

    // NLP Tokenizer (natural package)
    try {
      const { NLPTokenizer } = require('./llm/NLPTokenizer');
      this.nlp = new NLPTokenizer(config);
    } catch { this.nlp = null; }

    // Knowledge Graph (graphology)
    try {
      const { KnowledgeGraph } = require('./knowledge/KnowledgeGraph');
      this.knowledgeGraph = new KnowledgeGraph(config);
    } catch { this.knowledgeGraph = null; }

    // Sandbox Engine (vm2)
    try {
      const { SandboxEngine } = require('../capability/sandbox/SandboxEngine');
      this.sandbox = new SandboxEngine(config);
    } catch { this.sandbox = null; }

    // Self-Learning System (EventStream, LoopDetector, RootCause, Lessons, CausalMemory, etc.)
    try {
      const learning = require('./learning');
      this.eventStream = new learning.EventStream(config);
      this.loopDetector = new learning.LoopDetector(config);
      this.rootCauseAnalyzer = new learning.RootCauseAnalyzer(config);
      this.lessonEngine = new learning.LessonEngine(config);
      this.causalMemory = new learning.CausalMemory(config);
      this.gapDetector = new learning.KnowledgeGapDetector(config);
      this.failureMemory = new learning.FailureMemory(config);
      this.adaptiveRouter = new learning.AdaptiveRouter(config);
      this.learningMetrics = new learning.LearningMetrics(config);
    } catch (e) { console.warn('[CognitiveEngine] Self-Learning modules partially loaded:', e.message); }

    // Capability Manager (Discovery + Security + Evaluation + Registry + Installation)
    try {
      const { CapabilityManager } = require('../capability');
      this.capabilityManager = new CapabilityManager(config);
    } catch (e) { console.warn('[CognitiveEngine] CapabilityManager not loaded:', e.message); }

    // New Tools (HookSystem, Browser, CI/CD, etc.)
    try {
      const tools = require('../tools');
      this.hookSystem = new tools.HookSystem(config);
      this.browserManager = new tools.BrowserManager(config);
      this.cicdIntegration = new tools.CICDIntegration(config);
      this.deploymentEngine = new tools.DeploymentEngine(config);
      this.imageGenerator = new tools.ImageGenerator(config);
      this.ttsManager = new tools.TTSManager(config);
      this.presentationGen = new tools.PresentationGenerator(config);
      this.websiteGen = new tools.WebsiteGenerator(config);
      this.diagramGen = new tools.DiagramGenerator(config);
      this.agentTeams = new tools.AgentTeams(config);
      this.crossSession = new tools.CrossSessionMessaging(config);
      this.lspIntegration = new tools.LSPIntegration(config);
      this.policyEngine = new tools.PolicyEngine(config);
      this.videoGen = new tools.VideoGenerator(config);
    } catch (e) { console.warn('[CognitiveEngine] Tools module partially loaded:', e.message); }

    // Engines (lazy loaded)
    this.memory = null;
    this.knowledge = null;
    this.evidence = null;
    this.rag = null;
    this.learning = null;
    this.experience = null;
    this.skills = null;
    this.experiments = null;
    this.consolidation = null;
    this.improvement = null;

    this._initialized = false;
    this._loadEngines();
  }

  _loadEngines() {
    const tryLoad = (path, name) => {
      try {
        const mod = require(path);
        // Handle both direct class export and { ClassName } export
        const Cls = typeof mod === 'function' ? mod : (mod[name] || mod.default || Object.values(mod)[0]);
        if (!Cls || typeof Cls !== 'function') throw new Error('No class found');
        return new Cls({ ...this.config, bus: this.bus, userId: this.userId, projectId: this.projectId });
      } catch (e) {
        console.warn(`[CognitiveEngine] ${name} not available:`, e.message);
        return null;
      }
    };

    this.memory = tryLoad('./memory/MemoryEngine', 'MemoryEngine');
    this.knowledge = tryLoad('./knowledge/KnowledgeEngine', 'KnowledgeEngine');
    this.evidence = tryLoad('./evidence/EvidenceEngine', 'EvidenceEngine');
    this.rag = tryLoad('./rag/RAGEngine', 'RAGEngine');
    this.learning = tryLoad('./learning/LearningEngine', 'LearningEngine');
    this.experience = tryLoad('./experience/ExperienceEngine', 'ExperienceEngine');
    this.skills = tryLoad('./skills/SkillEngine', 'SkillEngine');
    this.experiments = tryLoad('./experiments/ExperimentEngine', 'ExperimentEngine');
    this.consolidation = tryLoad('./consolidation/ConsolidationEngine', 'ConsolidationEngine');
    this.improvement = tryLoad('./improvement/SelfImprovementEngine', 'SelfImprovementEngine');

    this._initialized = true;
    console.log('[CognitiveEngine] Initialized with engines:', this.getAvailableEngines().join(', '));
  }

  getAvailableEngines() {
    const engines = [];
    for (const [name, engine] of Object.entries({
      memory: this.memory, knowledge: this.knowledge, evidence: this.evidence,
      rag: this.rag, learning: this.learning, experience: this.experience,
      skills: this.skills, experiments: this.experiments,
      consolidation: this.consolidation, improvement: this.improvement,
    })) {
      if (engine) engines.push(name);
    }
    return engines;
  }

  // ===================== CORE OPERATIONS =====================

  /**
   * Remember something - stores in appropriate memory layer.
   */
  async remember(fact, context = {}) {
    if (!this.memory) throw new Error('MemoryEngine not available');
    const result = await this.memory.remember(fact, {
      ...context,
      userId: this.userId,
      projectId: this.projectId,
      timestamp: Date.now(),
    });

    // Also add to knowledge if it's a fact
    if (this.knowledge && context.type === 'fact') {
      await this.knowledge.addEntity({
        id: result.id,
        type: 'fact',
        content: fact,
        source: context.source || 'conversation',
        confidence: context.confidence || 0.8,
      });
    }

    await this.bus.emit('cognitive:remembered', { id: result.id, fact, context });
    return result;
  }

  /**
   * Recall information - retrieves from memory with context.
   */
  async recall(query, options = {}) {
    if (!this.memory) throw new Error('MemoryEngine not available');
    const memories = await this.memory.recall(query, {
      ...options,
      userId: this.userId,
      projectId: this.projectId,
    });

    // Enrich with knowledge if available
    let knowledge = null;
    if (this.knowledge) {
      knowledge = await this.knowledge.query(query, options);
    }

    // Enrich with evidence if available
    let evidence = null;
    if (this.evidence && memories.length > 0) {
      evidence = await this.evidence.verify(memories[0].id);
    }

    return { memories, knowledge, evidence };
  }

  /**
   * Learn from an experience.
   */
  async learn(experience) {
    if (!this.learning) throw new Error('LearningEngine not available');

    // Record the experience first
    if (this.experience) {
      await this.experience.record(experience);
    }

    // Reflect on it
    const reflection = await this.learning.reflect(experience);

    // Detect knowledge gaps
    const gaps = await this.learning.detectKnowledgeGap(experience.task);

    // Learn strategy if applicable
    let strategy = null;
    if (experience.result) {
      strategy = await this.learning.learnStrategy(experience.task, experience.result);
    }

    await this.bus.emit('cognitive:learned', { experience, reflection, gaps, strategy });
    return { reflection, gaps, strategy };
  }

  /**
   * Retrieve information using hybrid RAG.
   */
  async retrieve(query, options = {}) {
    if (!this.rag) throw new Error('RAGEngine not available');
    return this.rag.retrieve(query, options);
  }

  /**
   * Add a document to the knowledge base.
   */
  async ingest(document) {
    if (!this.rag) throw new Error('RAGEngine not available');
    return this.rag.ingest(document);
  }

  /**
   * Run consolidation (dedup, generalize, decay).
   */
  async consolidate() {
    if (!this.consolidation) throw new Error('ConsolidationEngine not available');
    return this.consolidation.run();
  }

  /**
   * Get full system status.
   */
  getStatus() {
    return {
      initialized: this._initialized,
      userId: this.userId,
      projectId: this.projectId,
      engines: this.getAvailableEngines(),
      memory: this.memory?.getStats() || null,
      knowledge: this.knowledge?.getStats() || null,
      evidence: this.evidence?.getStats() || null,
      rag: this.rag?.getStats() || null,
      learning: this.learning?.getStats() || null,
      experience: this.experience?.getStats() || null,
      skills: this.skills?.getStats() || null,
      experiments: this.experiments?.getStats() || null,
      consolidation: this.consolidation?.getStats() || null,
      improvement: this.improvement?.getStats() || null,
      eventBus: this.bus.getStats(),
      errorLearning: this.errorLearning?.getStats() || null,
      userProfile: this.userProfile?.getStats() || null,
      memoryCompressor: this.memoryCompressor?.getStats() || null,
      suggestedReplies: this.suggestedReplies?.getStats() || null,
      storage: this.storage?.getStats() || null,
      userIsolation: this.userIsolation?.getStats() || null,
      cognitiveSleep: this.cognitiveSleep?.getStats() || null,
      queryExpander: this.queryExpander?.getStats() || null,
      injectionDetector: this.injectionDetector?.getStats() || null,
      costOptimizer: this.costOptimizer?.getStats() || null,
      tokenOptimizer: this.tokenOptimizer?.getStats() || null,
      llmRouter: this.llmRouter?.getStats() || null,
      localLLM: this.localLLM?.getStats() || null,
      costOptimizer: this.costOptimizer2?.getStats() || null,
      nlp: this.nlp?.getStats() || null,
      knowledgeGraph: this.knowledgeGraph?.getStats() || null,
      sandbox: this.sandbox?.getStats() || null,
      hookSystem: this.hookSystem?.getStats() || null,
      browser: this.browserManager?.getStats() || null,
      cicd: this.cicdIntegration?.getStats() || null,
      deployment: this.deploymentEngine?.getStats() || null,
      agentTeams: this.agentTeams?.getStats() || null,
      crossSession: this.crossSession?.getStats() || null,
      policyEngine: this.policyEngine?.getStats() || null,
    };
  }

  // ===================== TOKEN OPTIMIZATION =====================

  /**
   * Optimize a request before sending to LLM.
   */
  async optimizeRequest(request) {
    if (!this.tokenOptimizer) return { request, stats: { enabled: false } };
    return this.tokenOptimizer.optimize(request);
  }

  /**
   * Cache a response after receiving from LLM.
   */
  cacheResponse(request, response) {
    if (this.tokenOptimizer) {
      this.tokenOptimizer.cacheResponse(request, response);
    }
  }

  /**
   * Get token optimization report.
   */
  getTokenReport() {
    return this.tokenOptimizer?.getReport() || null;
  }

  // ===================== LLM ROUTING =====================

  /**
   * Send a chat message to the best available LLM.
   */
  async chat(messages, options = {}) {
    // Optimize first
    const optimized = await this.optimizeRequest({
      model: options.model || 'local/default',
      system: options.system || '',
      messages,
      tools: options.tools,
      memory: options.memory,
      rag: options.rag,
    });

    const finalMessages = optimized.request ? optimized.request.messages : messages;

    // Route to LLM
    const response = await this.llmRouter.chat(finalMessages, options);

    // Cache response
    this.cacheResponse({ messages }, response);

    // Record spending
    if (this.costOptimizer2 && response.usage) {
      this.costOptimizer2.recordSpending(
        response.provider,
        response.usage.promptTokens,
        response.usage.completionTokens
      );
    }

    return response;
  }

  /**
   * Detect available local LLMs.
   */
  async detectLocalLLMs() {
    return this.localLLM?.detectAll() || {};
  }

  /**
   * Get cheapest model recommendation.
   */
  getCheapestModel(taskType = 'chat') {
    return this.costOptimizer2?.recommend({ taskType }) || null;
  }

  /**
   * Compress a prompt to reduce tokens.
   */
  compressPrompt(text, options = {}) {
    return this.promptCompressor?.compress(text, options) || { compressed: text, ratio: 1 };
  }

  /**
   * Generate embeddings for text.
   */
  embed(text) {
    return this.embeddings?.embed(text) || [];
  }

  /**
   * Find similar texts using embeddings.
   */
  findSimilar(query, collection, topK = 5) {
    return this.embeddings?.search(query, collection, topK) || [];
  }

  // ===================== CAPABILITY SYSTEM =====================

  /**
   * Discover capabilities from all sources.
   */
  async discoverCapabilities() {
    return this.capabilityManager?.runDiscovery() || [];
  }

  /**
   * Search capabilities by keyword.
   */
  searchCapabilities(query, options = {}) {
    return this.capabilityManager?.search(query, options) || { results: [], total: 0 };
  }

  /**
   * Find capabilities for a specific task.
   */
  async findCapabilitiesForTask(task) {
    return this.capabilityManager?.findForTask(task) || [];
  }

  /**
   * Install a capability.
   */
  async installCapability(id) {
    return this.capabilityManager?.installCapability(id) || { success: false, error: 'Not available' };
  }

  /**
   * Get top capabilities.
   */
  getTopCapabilities(n = 10) {
    return this.capabilityManager?.getTop(n) || [];
  }

  /**
   * Get capability statistics.
   */
  getCapabilityStats() {
    return this.capabilityManager?.getStatistics() || null;
  }

  /**
   * Recommend capabilities for a task.
   */
  recommendCapabilities(task, options = {}) {
    return this.capabilityManager?.recommend(task, options) || [];
  }

  // ===================== NLP =====================

  /**
   * Tokenize text into words.
   */
  tokenize(text) {
    return this.nlp?.tokenize(text) || text.split(/\s+/);
  }

  /**
   * Compute text similarity using TF-IDF.
   */
  textSimilarity(a, b) {
    return this.nlp?.similarity(a, b) || 0;
  }

  /**
   * Extract keywords from text.
   */
  extractKeywords(text, n = 10) {
    return this.nlp?.extractKeywords(text, n) || [];
  }

  /**
   * Classify text into categories.
   */
  classifyText(text) {
    return this.nlp?.classify(text) || 'unknown';
  }

  // ===================== KNOWLEDGE GRAPH =====================

  /**
   * Add entity to knowledge graph.
   */
  addGraphEntity(entity) {
    return this.knowledgeGraph?.addEntity(entity) || null;
  }

  /**
   * Add relation to knowledge graph.
   */
  addGraphRelation(relation) {
    return this.knowledgeGraph?.addRelation(relation) || null;
  }

  /**
   * Query knowledge graph.
   */
  queryGraph(query) {
    return this.knowledgeGraph?.query(query) || [];
  }

  /**
   * Find path in knowledge graph.
   */
  graphPath(from, to) {
    return this.knowledgeGraph?.findPath(from, to) || null;
  }

  // ===================== SANDBOX =====================

  /**
   * Execute code in sandbox.
   */
  async sandboxExecute(code, context = {}) {
    return this.sandbox?.execute(code, context) || { success: false, error: 'Sandbox not available' };
  }

  /**
   * Validate a manifest/code for security.
   */
  validateManifest(content) {
    return this.sandbox?.validateManifest(content) || { valid: false, issues: [{ message: 'Sandbox not available' }] };
  }

  // ===================== HOOKS =====================
  async triggerPreToolUse(toolName, args, ctx = {}) { return this.hookSystem?.triggerPreToolUse(toolName, args, ctx) || { context: ctx, blocked: false }; }
  async triggerPostToolUse(toolName, args, result, ctx = {}) { return this.hookSystem?.triggerPostToolUse(toolName, args, result, ctx) || { context: ctx, blocked: false }; }
  registerHook(event, callback, opts) { return this.hookSystem?.registerHook(event, callback, opts) || null; }

  // ===================== BROWSER =====================
  async browserLaunch(opts) { return this.browserManager?.launch(opts) || { success: false, error: 'Not available' }; }
  async browserNavigate(url, opts) { return this.browserManager?.navigate(url, opts) || { success: false }; }
  async browserScreenshot(opts) { return this.browserManager?.screenshot(opts) || { success: false }; }
  async browserClick(sel, opts) { return this.browserManager?.click(sel, opts) || { success: false }; }
  async browserType(sel, text, opts) { return this.browserManager?.type(sel, text, opts) || { success: false }; }
  async browserEvaluate(expr, opts) { return this.browserManager?.evaluate(expr, opts) || { success: false }; }

  // ===================== CI/CD =====================
  async triggerWorkflow(owner, repo, workflow) { return this.cicdIntegration?.triggerWorkflow(owner, repo, workflow) || { success: false }; }
  async getBuildStatus(owner, repo, runId) { return this.cicdIntegration?.getBuildStatus(owner, repo, runId) || { success: false }; }
  async createPR(owner, repo, title, body, head) { return this.cicdIntegration?.createPR(owner, repo, title, body, head) || { success: false }; }
  async gitStatus() { return this.cicdIntegration?.gitStatus() || { success: false }; }
  async gitCommit(msg) { return this.cicdIntegration?.gitCommit(msg) || { success: false }; }
  async gitPush(remote, branch) { return this.cicdIntegration?.gitPush(remote, branch) || { success: false }; }

  // ===================== DEPLOYMENT =====================
  async deployDocker(config) { return this.deploymentEngine?.deployDocker(config) || { success: false }; }
  async deploySSH(config) { return this.deploymentEngine?.deploySSH(config) || { success: false }; }
  async listContainers() { return this.deploymentEngine?.listContainers() || { success: false }; }
  async rollbackDeploy(id) { return this.deploymentEngine?.rollback(id) || { success: false }; }

  // ===================== IMAGE GENERATION =====================
  async generateImage(prompt, opts) { return this.imageGenerator?.generate(prompt, opts) || { success: false }; }

  // ===================== TTS =====================
  async synthesizeSpeech(text, opts) { return this.ttsManager?.synthesize(text, opts) || { success: false }; }

  // ===================== PRESENTATIONS =====================
  async generatePPTX(slides, path) { return this.presentationGen?.generatePPTX(slides, path) || { success: false }; }
  async generateHTMLPresentation(slides, path) { return this.presentationGen?.generateHTML(slides, path) || { success: false }; }

  // ===================== WEBSITES =====================
  async generateWebsite(template, data, path) { return this.websiteGen?.generateSite(template, data, path) || { success: false }; }
  async generateBlog(posts, title) { return this.websiteGen?.generateBlog(posts, title) || { success: false }; }
  async generateDocs(sections, title) { return this.websiteGen?.generateDocs(sections, title) || { success: false }; }

  // ===================== DIAGRAMS =====================
  async generateFlowchart(desc, path) { return this.diagramGen?.generateFlowchart(desc, path) || { success: false }; }
  async generateSequence(steps, path) { return this.diagramGen?.generateSequence(steps, path) || { success: false }; }
  async generateChart(type, data, path) { return this.diagramGen?.generateChart(type, data, path) || { success: false }; }
  async generateArchitecture(components, path) { return this.diagramGen?.generateArchitecture(components, path) || { success: false }; }

  // ===================== AGENT TEAMS =====================
  createTeam(id, config) { return this.agentTeams?.createTeam(id, config) || { success: false }; }
  async delegateTeamTask(teamId, task) { return this.agentTeams?.delegateTask(teamId, task) || { success: false }; }
  recordTeamResult(taskId, result) { return this.agentTeams?.recordResult(taskId, result) || { success: false }; }

  // ===================== CROSS-SESSION =====================
  subscribeChannel(channel, cb) { return this.crossSession?.subscribe(channel, cb) || { success: false }; }
  publishChannel(channel, msg) { return this.crossSession?.publish(channel, msg) || { success: false }; }
  broadcastMessage(msg) { return this.crossSession?.broadcast(msg) || { success: false }; }

  // ===================== POLICY =====================
  async checkToolPolicy(tool, ctx) { return this.policyEngine?.checkToolPermission(tool, ctx) || { allowed: true }; }
  async checkNetworkPolicy(url, ctx) { return this.policyEngine?.checkNetworkAccess(url, ctx) || { allowed: true }; }
  async checkFilePolicy(path, op, ctx) { return this.policyEngine?.checkFileAccess(path, op, ctx) || { allowed: true }; }
  async checkCommandPolicy(cmd, ctx) { return this.policyEngine?.checkCommand(cmd, ctx) || { allowed: true }; }

  // ===================== SELF-LEARNING SYSTEM =====================
  // Event Stream
  recordEvent(type, data) { return this.eventStream?.record(type, data) || null; }
  getEventTrace(taskId) { return this.eventStream?.getTrace(taskId) || []; }
  getRecentEvents(limit, type) { return this.eventStream?.getRecent(limit, type) || []; }

  // Loop Detection
  detectLoops(events) { return this.loopDetector?.analyze(events) || { loops: [], hasLoop: false }; }
  recordAction(action) { this.loopDetector?.recordAction(action); }

  // Root Cause Analysis
  analyzeRootCause(failure, context) { return this.rootCauseAnalyzer?.analyze(failure, context) || null; }
  findSimilarAnalyses(failure) { return this.rootCauseAnalyzer?.findSimilar(failure) || []; }

  // Lessons
  createLesson(data) { return this.lessonEngine?.createLesson(data) || null; }
  validateLesson(id, evidence, conf) { return this.lessonEngine?.validateLesson(id, evidence, conf) || null; }
  findLessons(query, opts) { return this.lessonEngine?.findRelevant(query, opts) || []; }
  detectLessonContradictions() { return this.lessonEngine?.detectContradictions() || []; }

  // Causal Memory
  addCausalRelation(cause, effect, data) { return this.causalMemory?.addRelation(cause, effect, data) || null; }
  findCauses(effect) { return this.causalMemory?.findCauses(effect) || []; }
  findEffects(cause) { return this.causalMemory?.findEffects(cause) || []; }
  findCausalChain(start, depth) { return this.causalMemory?.findChain(start, depth) || []; }
  findCausalPath(from, to) { return this.causalMemory?.findPath(from, to) || null; }

  // Knowledge Gaps
  detectKnowledgeGap(data) { return this.gapDetector?.detect(data) || null; }
  getUnresolvedGaps(type) { return this.gapDetector?.findUnresolved(type) || []; }

  // Failure Memory
  recordFailure(data) { return this.failureMemory?.record(data) || null; }
  recordRecovery(failId, recovery, prevention) { return this.failureMemory?.recordRecovery(failId, recovery, prevention) || null; }
  getRecurringFailures(minCount) { return this.failureMemory?.getRecurring(minCount) || []; }

  // Adaptive Router
  recordRoutingResult(data) { this.adaptiveRouter?.record(data); }
  recommendRoute(taskType, category) { return this.adaptiveRouter?.recommend(taskType, category) || null; }

  // Learning Metrics
  recordLearningMetric(data) { this.learningMetrics?.record(data); }
  compareLearning(before, after) { return this.learningMetrics?.compare(before, after) || null; }
  calculateLQS(data) { return this.learningMetrics?.calculateLQS(data) || 0; }

  // Full Learning Cycle
  async executeLearningCycle(taskId, result) {
    const events = this.getEventTrace(taskId);
    const loopResult = this.detectLoops(events);
    if (loopResult.hasLoop) {
      this.recordEvent('loop_detected', { taskId, loops: loopResult.loops });
    }
    if (!result.success) {
      const rca = this.analyzeRootCause(result, { taskId });
      const lesson = this.createLesson({
        type: 'error_learning',
        task: taskId,
        problem: result.error || 'Unknown',
        cause: rca?.rootCause?.cause || 'unknown',
        rootCause: rca?.rootCause || {},
        prevention: rca?.prevention || '',
      });
      this.recordFailure({ what: result.error, why: rca?.rootCause?.cause, tool: result.tool });
      return { learned: true, lesson, rca, loopDetected: loopResult.hasLoop };
    }
    return { learned: false, loopDetected: loopResult.hasLoop };
  }

  // ===================== VIDEO =====================
  async generateVideo(prompt, opts) { return this.videoGen?.generateFromText(prompt, opts) || { success: false }; }
}



module.exports = { CognitiveEngine };
