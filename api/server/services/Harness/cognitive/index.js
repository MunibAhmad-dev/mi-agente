'use strict';

const { CognitiveEngine } = require('./CognitiveEngine');
const { ExecutiveBrain } = require('./ExecutiveBrain');
const { EventBus, getEventBus } = require('./EventBus');
const { ContextCompactor } = require('./ContextCompactor');
const { CriticAgent } = require('./CriticAgent');
const { ParallelExecutor } = require('./ParallelExecutor');
const { AskUserModule } = require('./AskUserModule');
const { ResourceProfiles } = require('./ResourceProfiles');
const { PromptCache } = require('./PromptCache');
const { ExperienceReplay } = require('./ExperienceReplay');
const { DynamicWorkflows } = require('./DynamicWorkflows');
const { CrossSessionMemory } = require('./CrossSessionMemory');
const { PlanMode } = require('./PlanMode');
const { HookSystem, HookType } = require('./HookSystem');
const { SkillsSystem } = require('./SkillsSystem');
const { ToolResultCompressor } = require('./ToolResultCompressor');
const { FileIndexer } = require('./FileIndexer');
const { ApprovalGates, PermissionLevel } = require('./ApprovalGates');
const { CheckpointManager } = require('./CheckpointManager');
const { DAGScheduler } = require('./DAGScheduler');
const { ProviderHealthChecker } = require('./ProviderHealthChecker');
const { APIKeyRotation } = require('./APIKeyRotation');
const { QuotaManager } = require('./QuotaManager');
const { ModelPipeline } = require('./ModelPipeline');
const { SourceEvaluator } = require('./SourceEvaluator');
const { FactChecker } = require('./FactChecker');
const { AdaptiveRAG } = require('./AdaptiveRAG');
const { HybridSearch } = require('./HybridSearch');
const { WorkspaceManager } = require('./WorkspaceManager');
const { DistributedTracer } = require('./DistributedTracer');
const { ModelEvaluator } = require('./ModelEvaluator');
const { RAGEvaluator } = require('./RAGEvaluator');
const { PeerReviewer } = require('./PeerReviewer');
const { AccessibilityTree } = require('./AccessibilityTree');
const { GhostDetector } = require('./GhostDetector');
const { DuplicateDetector } = require('./DuplicateDetector');
const { MicroVMManager } = require('./MicroVMManager');
const { RemoteExecutor } = require('./RemoteExecutor');
const { PromptManager } = require('./PromptManager');
const { ContextualRetriever } = require('./ContextualRetriever');
const { NewsEngine } = require('./NewsEngine');
const { EditorialAnalyzer } = require('./EditorialAnalyzer');
const { GPUManager } = require('./GPUManager');
const { BenchmarkSuite } = require('./BenchmarkSuite');
const { CodebaseForensics } = require('./CodebaseForensics');
const { MCPClient } = require('./mcp/MCPClient');
const { VisionComplexityRouter, VISION_TIERS } = require('./vision/VisionComplexityRouter');
const { WebLLMManager, WEBLLM_MODELS } = require('./llm/WebLLMManager');
const { FineTuningManager, PRESET_CONFIGS } = require('./llm/FineTuningManager');
const { AutoLauncher, SERVICES } = require('./AutoLauncher');
const { SuggestedRepliesEngine } = require('./SuggestedRepliesEngine');

module.exports = {
  CognitiveEngine,
  ExecutiveBrain,
  EventBus,
  getEventBus,
  ContextCompactor,
  CriticAgent,
  ParallelExecutor,
  AskUserModule,
  ResourceProfiles,
  PromptCache,
  ExperienceReplay,
  DynamicWorkflows,
  CrossSessionMemory,
  PlanMode,
  HookSystem,
  HookType,
  SkillsSystem,
  ToolResultCompressor,
  FileIndexer,
  ApprovalGates,
  PermissionLevel,
  CheckpointManager,
  DAGScheduler,
  ProviderHealthChecker,
  APIKeyRotation,
  QuotaManager,
  ModelPipeline,
  SourceEvaluator,
  FactChecker,
  AdaptiveRAG,
  HybridSearch,
  WorkspaceManager,
  DistributedTracer,
  ModelEvaluator,
  RAGEvaluator,
  PeerReviewer,
  AccessibilityTree,
  GhostDetector,
  DuplicateDetector,
  MicroVMManager,
  RemoteExecutor,
  PromptManager,
  ContextualRetriever,
  NewsEngine,
  EditorialAnalyzer,
  GPUManager,
  BenchmarkSuite,
  CodebaseForensics,
  MCPClient,
  VisionComplexityRouter,
  VISION_TIERS,
  WebLLMManager,
  WEBLLM_MODELS,
  FineTuningManager,
  PRESET_CONFIGS,
  AutoLauncher,
  SERVICES,
  SuggestedRepliesEngine,

  // Lazy-load sub-engines
  get MemoryEngine() { try { return require('./memory/MemoryEngine').MemoryEngine; } catch { return null; } },
  get KnowledgeEngine() { try { return require('./knowledge/KnowledgeEngine').KnowledgeEngine; } catch { return null; } },
  get EvidenceEngine() { try { return require('./evidence/EvidenceEngine').EvidenceEngine; } catch { return null; } },
  get RAGEngine() { try { return require('./rag/RAGEngine').RAGEngine; } catch { return null; } },
  get LearningEngine() { try { return require('./learning/LearningEngine').LearningEngine; } catch { return null; } },
  get ExperienceEngine() { try { return require('./experience/ExperienceEngine').ExperienceEngine; } catch { return null; } },
  get SkillEngine() { try { return require('./skills/SkillEngine').SkillEngine; } catch { return null; } },
  get ExperimentEngine() { try { return require('./experiments/ExperimentEngine').ExperimentEngine; } catch { return null; } },
  get ConsolidationEngine() { try { return require('./consolidation/ConsolidationEngine').ConsolidationEngine; } catch { return null; } },
  get SelfImprovementEngine() { try { return require('./improvement/SelfImprovementEngine').SelfImprovementEngine; } catch { return null; } },
};
