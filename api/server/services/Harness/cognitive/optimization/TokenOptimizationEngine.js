'use strict';

const { TokenAnalyzer } = require('./TokenAnalyzer');
const { ExactCache } = require('./ExactCache');
const { SemanticCache } = require('./SemanticCache');
const { DeduplicationEngine } = require('./DeduplicationEngine');
const { MemoryOptimizer } = require('./MemoryOptimizer');
const { RAGOptimizer } = require('./RAGOptimizer');
const { ContextPruner } = require('./ContextPruner');
const { ConversationCompressor } = require('./ConversationCompressor');
const { TaskClassifier } = require('./TaskClassifier');
const { AdaptiveCompressor } = require('./AdaptiveCompressor');
const { TokenBudgetManager } = require('./TokenBudgetManager');
const { QualityGate } = require('./QualityGate');
const { ToolOptimizer } = require('./ToolOptimizer');
const { PrefixCacheManager } = require('./PrefixCacheManager');

/**
 * TokenOptimizationEngine - Universal middleware layer between
 * agents and LLM providers. Maximizes token savings while
 * preserving information quality.
 *
 * Pipeline: Cache → Dedup → Memory Opt → RAG Opt → Context Prune
 *          → Tool Opt → Conversation Compress → Adaptive Compress
 *          → Quality Gate → Token Budget → LLM
 */
class TokenOptimizationEngine {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      model: config.model || 'local/default',
      taskType: config.taskType || null,
      totalBudget: config.totalBudget || 16000,
      ...config,
    };

    // Initialize all sub-engines
    this.analyzer = new TokenAnalyzer(config.analyzer || {});
    this.exactCache = new ExactCache(config.exactCache || {});
    this.semanticCache = new SemanticCache(config.semanticCache || {});
    this.deduplication = new DeduplicationEngine(config.deduplication || {});
    this.memoryOptimizer = new MemoryOptimizer(config.memory || {});
    this.ragOptimizer = new RAGOptimizer(config.rag || {});
    this.contextPruner = new ContextPruner(config.pruning || {});
    this.conversationCompressor = new ConversationCompressor(config.compression || {});
    this.taskClassifier = new TaskClassifier(config.classification || {});
    this.adaptiveCompressor = new AdaptiveCompressor(config.adaptive || {});
    this.budgetManager = new TokenBudgetManager(config.budget || {});
    this.qualityGate = new QualityGate(config.quality || {});
    this.toolOptimizer = new ToolOptimizer(config.tools || {});
    this.prefixCache = new PrefixCacheManager(config.prefixCache || {});

    this._countFn = null;
    this._tryLoadTokenizer();
  }

  /**
   * Try to load gpt-tokenizer for precise counting.
   */
  _tryLoadTokenizer() {
    try {
      const { encode } = require('gpt-tokenizer');
      this._countFn = (text) => encode(String(text || '')).length;
    } catch {
      this._countFn = (text) => Math.ceil(String(text || '').length / 4);
    }
  }

  /**
   * Set the tokenizer function.
   */
  setTokenizer(fn) {
    this._countFn = fn;
  }

  /**
   * Count tokens in text.
   */
  countTokens(text) {
    return this._countFn ? this._countFn(text) : Math.ceil(String(text || '').length / 4);
  }

  /**
   * Main optimization pipeline.
   * Takes a raw request and returns an optimized request + stats.
   */
  async optimize(request) {
    if (!this.config.enabled) {
      return { request, stats: { enabled: false } };
    }

    const startTokens = this.analyzer.analyze(request);
    const stats = { stages: [], originalTokens: startTokens.total };

    // 1. Check exact cache
    const exactHit = this.exactCache.get(request);
    if (exactHit) {
      stats.stages.push({ name: 'exact_cache', hit: true, saved: startTokens.total });
      return { request: null, response: exactHit.response, stats };
    }

    // 2. Check semantic cache
    const semanticHit = this.semanticCache.get(request);
    if (semanticHit) {
      stats.stages.push({ name: 'semantic_cache', hit: true, saved: startTokens.total });
      return { request: null, response: semanticHit.response, stats };
    }

    // 3. Classify task type
    const classification = this.taskClassifier.classify(request);
    const taskType = this.config.taskType || classification.type;
    const policy = this.taskClassifier.getPolicy(taskType);
    stats.taskType = taskType;

    // 4. Get token budget
    const budget = this.budgetManager.allocate(this.config.model, taskType);
    stats.budget = budget;

    // 5. Optimize messages (dedup)
    let messages = request.messages || [];
    const beforeDedup = messages.length;
    messages = this.deduplication.deduplicateMessages(messages);
    stats.stages.push({
      name: 'dedup',
      before: beforeDedup,
      after: messages.length,
      removed: beforeDedup - messages.length,
    });

    // 6. Compress conversation history
    const historyBudget = budget.categories.history || 2000;
    const compressed = this.conversationCompressor.compress(messages, this._countFn, historyBudget);
    messages = compressed.messages;
    stats.stages.push({
      name: 'conversation_compress',
      compressed: compressed.compressed,
      saved: compressed.saved,
    });

    // 7. Optimize memory
    if (request.memory && request.memory.length > 0) {
      const memBudget = budget.categories.memory || 1500;
      const memOpt = this.memoryOptimizer.optimize(request.memory, this._requestQuery(request), this._countFn, memBudget);
      stats.stages.push({
        name: 'memory_optimize',
        before: request.memory.length,
        after: memOpt.selected.length,
        saved: memOpt.tokensUsed,
      });
      request.memory = memOpt.selected;
    }

    // 8. Optimize RAG
    if (request.rag && request.rag.length > 0) {
      const ragBudget = budget.categories.rag || 4000;
      const ragOpt = this.ragOptimizer.optimize(request.rag, this._requestQuery(request), this._countFn, ragBudget);
      stats.stages.push({
        name: 'rag_optimize',
        before: request.rag.length,
        after: ragOpt.selected.length,
        saved: ragOpt.tokensUsed,
      });
      request.rag = ragOpt.selected;
    }

    // 9. Optimize tools
    if (request.tools && request.tools.length > 0) {
      const toolsBudget = budget.categories.tools || 2000;
      let tools = this.toolOptimizer.selectTools(request.tools, this._requestQuery(request));
      tools = tools.map(t => this.toolOptimizer.compressSchema(t));
      stats.stages.push({
        name: 'tool_optimize',
        before: request.tools.length,
        after: tools.length,
      });
      request.tools = tools;
    }

    // 10. Context pruning on system prompt
    if (request.system) {
      const systemTokens = this.countTokens(request.system);
      const systemBudget = budget.categories.system || 1000;
      if (systemTokens > systemBudget) {
        const pruned = this.adaptiveCompressor.adaptiveCompress(
          request.system, taskType, this._countFn, policy.compressionRatio
        );
        if (pruned.retention.passed) {
          request.system = pruned.compressed;
          stats.stages.push({
            name: 'system_compress',
            before: pruned.originalTokens,
            after: pruned.compressedTokens,
            mode: pruned.mode,
          });
        }
      }
    }

    // Rebuild optimized request
    const optimizedRequest = {
      ...request,
      messages,
    };

    // 11. Final analysis
    const endTokens = this.analyzer.analyze(optimizedRequest);
    const comparison = this.analyzer.compare(startTokens, endTokens);

    // 12. Quality gate (if compression was aggressive)
    if (comparison.ratio > 50) {
      const originalText = request.messages?.map(m => m.content).join(' ') || '';
      const optimizedText = optimizedRequest.messages?.map(m => m.content).join(' ') || '';
      const quality = this.qualityGate.validate(originalText, optimizedText);
      stats.quality = quality;

      if (!quality.passed) {
        // Retry with safer compression
        this.stats.retries = (this.stats.retries || 0) + 1;
        stats.stages.push({ name: 'quality_gate_retry', reason: quality.reason });
      }
    }

    stats.finalTokens = endTokens.total;
    stats.saved = comparison.saved;
    stats.reductionPercent = comparison.ratio;

    return { request: optimizedRequest, stats };
  }

  /**
   * Extract query text from request for relevance matching.
   */
  _requestQuery(request) {
    const msgs = request.messages || [];
    const lastUser = msgs.filter(m => m.role === 'user').pop();
    return lastUser?.content || '';
  }

  /**
   * Cache a successful response.
   */
  cacheResponse(request, response) {
    this.exactCache.set(request, response);
    this.semanticCache.set(request, response);
  }

  /**
   * Get comprehensive stats.
   */
  getStats() {
    return {
      analyzer: this.analyzer.getStats(),
      exactCache: this.exactCache.getStats(),
      semanticCache: this.semanticCache.getStats(),
      deduplication: this.deduplication.getStats(),
      memoryOptimizer: this.memoryOptimizer.getStats(),
      ragOptimizer: this.ragOptimizer.getStats(),
      contextPruner: this.contextPruner.getStats(),
      conversationCompressor: this.conversationCompressor.getStats(),
      adaptiveCompressor: this.adaptiveCompressor.getStats(),
      budgetManager: this.budgetManager.getStats(),
      qualityGate: this.qualityGate.getStats(),
      toolOptimizer: this.toolOptimizer.getStats(),
      prefixCache: this.prefixCache.getStats(),
    };
  }

  /**
   * Get summary report.
   */
  getReport() {
    const stats = this.getStats();
    return {
      totalCacheHits: stats.exactCache.hits + stats.semanticCache.hits,
      totalCacheMisses: stats.exactCache.misses + stats.semanticCache.misses,
      deduplicationSaved: stats.deduplication.exactRemoved + stats.deduplication.semanticRemoved,
      compressionSaved: stats.conversationCompressor.tokensSaved,
      ragSaved: stats.ragOptimizer.tokensSaved,
      memorySaved: stats.memoryOptimizer.tokensSaved,
      toolsOptimized: stats.toolOptimizer.toolsSkipped,
      qualityPassRate: stats.qualityGate.passRate,
      adaptiveCompression: stats.adaptiveCompressor.stats,
    };
  }
}

module.exports = { TokenOptimizationEngine };
