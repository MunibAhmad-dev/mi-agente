/**
 * Harness module — DeepSeek Harness integration layer.
 *
 * Provides:
 * - HarnessManager: Central orchestrator
 * - DSHModelPlugin: LLM provider adapter
 * - DSHToolAdapter: Tool registry and execution
 * - DSHSessionManager: Session state management
 * - DSHContextManager: Context window management
 * - DSHAgentLoop: Agent loop with self-healing
 */

const {
  HarnessManager,
  AgentState,
  getHarnessManager,
  createHarnessManager,
} = require('./HarnessManager');

const { DSHModelPlugin, detectProvider } = require('./DSHModelPlugin');
const { DSHToolAdapter } = require('./DSHToolAdapter');
const { DSHSessionManager, Session } = require('./DSHSessionManager');
const { DSHContextManager, CONTEXT_WINDOWS } = require('./DSHContextManager');
const {
  DSHAgentLoop,
  ErrorCategory,
  classifyError,
  getSuggestedFix,
} = require('./DSHAgentLoop');

let ToolSecurity = null;
try {
  ToolSecurity = require('./ToolSecurity').ToolSecurity;
} catch {
  // ToolSecurity not available
}

let MemoryManager = null;
let MemoryEntry = null;
try {
  MemoryManager = require('./MemoryManager').MemoryManager;
  MemoryEntry = require('./MemoryManager').MemoryEntry;
} catch {
  // MemoryManager not available
}

let DeepSearchAgent = null;
let SOURCE_AUTHORITY = null;
try {
  DeepSearchAgent = require('./DeepSearchAgent').DeepSearchAgent;
  SOURCE_AUTHORITY = require('./DeepSearchAgent').SOURCE_AUTHORITY;
} catch {
  // DeepSearchAgent not available
}

let AgentOrchestrator = null;
let SPECIALIST_AGENTS = null;
try {
  AgentOrchestrator = require('./AgentOrchestrator').AgentOrchestrator;
  SPECIALIST_AGENTS = require('./AgentOrchestrator').SPECIALIST_AGENTS;
} catch {
  // AgentOrchestrator not available
}

module.exports = {
  // Main
  HarnessManager,
  AgentState,
  getHarnessManager,
  createHarnessManager,

  // Model
  DSHModelPlugin,
  detectProvider,

  // Tools
  DSHToolAdapter,

  // Security
  ToolSecurity,

  // Memory
  MemoryManager,
  MemoryEntry,

  // Sessions
  DSHSessionManager,
  Session,

  // Context
  DSHContextManager,
  CONTEXT_WINDOWS,

  // Agent Loop
  DSHAgentLoop,
  ErrorCategory,
  classifyError,
  getSuggestedFix,

  // DeepSearch
  DeepSearchAgent,
  SOURCE_AUTHORITY,

  // Multi-Agent Orchestrator
  AgentOrchestrator,
  SPECIALIST_AGENTS,

  // Providers (lazy — may need npm install for openai package)
  get GPTProvider() { try { return require('../LLMProviders/GPTProvider').GPTProvider; } catch { return null; } },
  get GrokProvider() { try { return require('../LLMProviders/GrokProvider').GrokProvider; } catch { return null; } },
  get LLMProvider() { try { return require('../LLMProviders/LLMProvider').LLMProvider; } catch { return null; } },

  // Connectors
  get ConnectorManager() { try { return require('./connectors').ConnectorManager; } catch { return null; } },
  get BaseConnector() { try { return require('./connectors').BaseConnector; } catch { return null; } },
  get GmailConnector() { try { return require('./connectors').GmailConnector; } catch { return null; } },
  get SlackConnector() { try { return require('./connectors').SlackConnector; } catch { return null; } },
  get GitHubConnector() { try { return require('./connectors').GitHubConnector; } catch { return null; } },
  get CalendarConnector() { try { return require('./connectors').CalendarConnector; } catch { return null; } },

  // Computer Use
  ComputerUse: require('./ComputerUse').ComputerUse,
  getPlatform: require('./ComputerUse').getPlatform,

  // Planning + Recovery
  TaskPlanner: require('./TaskPlanner').TaskPlanner,
  TaskNode: require('./TaskPlanner').TaskNode,
  TaskState: require('./TaskPlanner').TaskState,
  CheckpointManager: require('./CheckpointManager').CheckpointManager,
  RecoveryManager: require('./RecoveryManager').RecoveryManager,
  RecoveryStrategy: require('./RecoveryManager').RecoveryStrategy,

  // Multi-Provider Orchestration
  ProviderOrchestrator: require('./ProviderOrchestrator').ProviderOrchestrator,
  HealthState: require('./ProviderOrchestrator').HealthState,
  PROVIDER_COSTS: require('./ProviderOrchestrator').PROVIDER_COSTS,
  PROVIDER_CAPABILITIES: require('./ProviderOrchestrator').PROVIDER_CAPABILITIES,

  // Verification + Observability
  VerificationAgent: require('./VerificationAgent').VerificationAgent,
  ObservabilityHub: require('./ObservabilityHub').ObservabilityHub,
  CostTracker: require('./CostTracker').CostTracker,

  // Security + Audit
  SecurityHardening: require('./SecurityHardening').SecurityHardening,
  AuditReport: require('./AuditReport').AuditReport,

  // Production Init
  initHarness: require('./HarnessInit').initHarness,
  buildConfigFromEnv: require('./HarnessInit').buildConfigFromEnv,
  setupGracefulShutdown: require('./HarnessInit').setupGracefulShutdown,

  // Gap Modules: Vector Store / RAG
  get VectorStoreManager() { try { return require('./VectorStoreManager'); } catch { return null; } },

  // Gap Modules: File Processing
  get FileProcessor() { try { return require('./FileProcessor'); } catch { return null; } },

  // Gap Modules: Voice (TTS/STT)
  get VoiceManager() { try { return require('./VoiceManager'); } catch { return null; } },

  // Gap Modules: Scheduler
  get SchedulerManager() { try { return require('./SchedulerManager'); } catch { return null; } },

  // Gap Modules: Reports
  get ReportGenerator() { try { return require('./ReportGenerator'); } catch { return null; } },

  // Gap Modules: MCP
  get MCPServer() { try { return require('./MCPServer'); } catch { return null; } },

  // Gap Modules: Sandbox
  get SandboxRunner() { try { return require('./SandboxRunner'); } catch { return null; } },

  // NEW: Social Media Search
  get SocialMediaSearch() { try { return require('./SocialMediaSearch'); } catch { return null; } },

  // NEW: Voice Conversation
  get VoiceConversation() { try { return require('./VoiceConversation'); } catch { return null; } },

  // NEW: Streaming
  get StreamingManager() { try { return require('./StreamingManager'); } catch { return null; } },

  // NEW: Background Tasks
  get BackgroundTaskManager() { try { return require('./BackgroundTaskManager'); } catch { return null; } },

  // NEW: Citations
  get CitationTracker() { try { return require('./CitationTracker'); } catch { return null; } },

  // NEW: Suggested Actions
  get SuggestedActionsEngine() { try { return require('./SuggestedActionsEngine'); } catch { return null; } },

  // COGNITIVE ENGINE
  get CognitiveEngine() { try { return require('./cognitive').CognitiveEngine; } catch { return null; } },
  get ExecutiveBrain() { try { return require('./cognitive').ExecutiveBrain; } catch { return null; } },
  get CognitiveEventBus() { try { return require('./cognitive').EventBus; } catch { return null; } },
  get cognitive() { try { return require('./cognitive'); } catch { return null; } },
};
