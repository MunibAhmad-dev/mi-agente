'use strict';

/**
 * ResearchOS public surface. Every engine is importable and replaceable:
 * the orchestrator depends only on interfaces, not implementations.
 */

module.exports = {
  // Face 24
  IntentAnalyzer: require('./intent/IntentAnalyzer'),
  ClarificationEngine: require('./intent/ClarificationEngine'),
  ResearchProfile: require('./intent/ResearchProfile'),
  // Face 25
  ComplexityRouter: require('./router/ComplexityRouter'),
  ResourceGovernor: require('./router/ResourceGovernor'),
  // Face 26
  AcquisitionCascade: require('./acquisition/AcquisitionCascade'),
  DocumentExtractor: require('./acquisition/DocumentExtractor'),
  HttpTransport: require('./acquisition/HttpTransport'),
  SsrfGuard: require('./acquisition/SsrfGuard'),
  providers: require('./acquisition/providers'),
  // Face 27
  ContentPipeline: require('./content/ContentPipeline'),
  // Face 28
  SourceProfiler: require('./sources/SourceProfiler'),
  DependencyAnalyzer: require('./sources/DependencyAnalyzer'),
  // Face 29
  ClaimExtractor: require('./claims/ClaimExtractor'),
  EvidenceEngine: require('./claims/EvidenceEngine'),
  ContradictionEngine: require('./claims/ContradictionEngine'),
  // Face 30
  OrientationClassifier: require('./bias/OrientationClassifier'),
  BiasForensics: require('./bias/BiasForensics'),
  // Face 31
  PerspectiveEngine: require('./perspectives/PerspectiveEngine'),
  AdversarialEngine: require('./perspectives/AdversarialEngine'),
  // Face 32
  GapEngine: require('./research/GapEngine'),
  StopEngine: require('./research/StopEngine'),
  ConfidenceEngine: require('./research/ConfidenceEngine'),
  // Face 33
  HybridRAG: require('./rag/HybridRAG'),
  VectorStore: require('./rag/VectorStore'),
  KeywordStore: require('./rag/KeywordStore'),
  RetrievalRouter: require('./rag/RetrievalRouter'),
  // Face 34
  ResearchOrchestrator: require('./orchestrator/ResearchOrchestrator'),
  CheckpointManager: require('./orchestrator/CheckpointManager'),
  ModelRouter: require('./orchestrator/ModelRouter'),
  DomainPolicies: require('./orchestrator/DomainPolicies'),
  // Face 35
  HypothesisEngine: require('./experiment/HypothesisEngine'),
  ExperimentEngine: require('./experiment/ExperimentEngine'),
  SandboxProvider: require('./experiment/SandboxProvider'),
  // Face 36
  KnowledgeConsolidator: require('./knowledge/KnowledgeConsolidator'),
  FreshnessManager: require('./knowledge/FreshnessManager'),
  KnowledgeVersioning: require('./knowledge/KnowledgeVersioning'),
  // Face 37
  MemoryManager: require('./memory/MemoryManager'),
  EvaluationEngine: require('./learning/EvaluationEngine'),
  ActiveLearning: require('./learning/ActiveLearning'),
  // Face 38
  api: require('./api/server'),
  // core
  config: require('./core/config'),
  eventbus: require('./core/eventbus'),
  store: require('./core/store'),
};
