'use strict';

// === P0 CORE AGENT TOOLS (3) ===
const FilesystemTools = require('./FilesystemTools');
const ShellTool = require('./ShellTool');
const SearchTools = require('./SearchTools');

// === P2-P4 TOOLS (4) ===
const CodeExecutor = require('./CodeExecutor');
const GitWorktreeManager = require('./GitWorktreeManager');
const GitRollback = require('./GitRollback');
const ComputerUseVision = require('./ComputerUseVision');
const ComputerUseTool = require('./ComputerUseTool');

// === IMPROVEMENT TOOLS (2) ===
const DockerSandbox = require('./DockerSandbox');
const MultiModalLocal = require('./MultiModalLocal');
const VideoProcessor = require('./VideoProcessor');
const VideoGenerator = require('./VideoGenerator');

// === ORIGINAL TOOLS (14) ===
const HookSystem = require('./HookSystem');
const BrowserManager = require('./BrowserManager');
const CICDIntegration = require('./CICDIntegration');
const DeploymentEngine = require('./DeploymentEngine');
const ImageGenerator = require('./ImageGenerator');
const TTSManager = require('./TTSManager');
const PresentationGenerator = require('./PresentationGenerator');
const WebsiteGenerator = require('./WebsiteGenerator');
const DiagramGenerator = require('./DiagramGenerator');
const AgentTeams = require('./AgentTeams');
const CrossSessionMessaging = require('./CrossSessionMessaging');
const LSPIntegration = require('./LSPIntegration');
const PolicyEngine = require('./PolicyEngine');

// === GAP COVERAGE TOOLS (12) ===
const CanvasManager = require('./CanvasManager');
const PluginMarketplace = require('./PluginMarketplace');
const CloudAgent = require('./CloudAgent');
const PlanModeManager = require('./PlanModeManager');
const CompanionManager = require('./CompanionManager');
const PlaybookManager = require('./PlaybookManager');
const DesktopController = require('./DesktopController');
const CollectionsEngine = require('./CollectionsEngine');
const CredentialVault = require('./CredentialVault');
const GoalManager = require('./GoalManager');
const DoctorModule = require('./DoctorModule');
const DeeperSearchV2 = require('./DeeperSearchV2');

// === NEW TOOLS (13) ===
const WebScraper = require('./WebScraper');
const STTManager = require('./STTManager');
const BackupManager = require('./BackupManager');
const GitIntegration = require('./GitIntegration');
const HealthDashboard = require('./HealthDashboard');
const WebhookManager = require('./WebhookManager');
const QueueManager = require('./QueueManager');
const LogManager = require('./LogManager');
const MetricsCollector = require('./MetricsCollector');
const ClipboardManager = require('./ClipboardManager');
const RateLimiter = require('./RateLimiter');
const CacheManager = require('./CacheManager');
const AlertManager = require('./AlertManager');

// === PROTOCOL-BASED TOOLS (4) - Replaces googleapis & Meta Graph API ===
const EmailManager = require('./EmailManager');
const CalendarManager = require('./CalendarManager');
const DriveManager = require('./DriveManager');
const SocialScraper = require('./SocialScraper');
const RSSAggregator = require('./RSSAggregator');

module.exports = {
  // Original (14)
  HookSystem, BrowserManager, CICDIntegration, DeploymentEngine,
  ImageGenerator, TTSManager, PresentationGenerator, WebsiteGenerator,
  DiagramGenerator, AgentTeams, CrossSessionMessaging, LSPIntegration,
  PolicyEngine,
  // Gap Coverage (12)
  CanvasManager, PluginMarketplace, CloudAgent, PlanModeManager,
  CompanionManager, PlaybookManager, DesktopController, CollectionsEngine,
  CredentialVault, GoalManager, DoctorModule, DeeperSearchV2,
  // New (13)
  WebScraper, STTManager, BackupManager, GitIntegration,
  HealthDashboard, WebhookManager, QueueManager, LogManager,
  MetricsCollector, ClipboardManager, RateLimiter, CacheManager, AlertManager,
  // Protocol-Based (5) - $0, no API keys, no limits
  EmailManager, CalendarManager, DriveManager, SocialScraper, RSSAggregator,
  // Protocol Config Wizard
  ProtocolConfigWizard: require('./ProtocolConfigWizard').ProtocolConfigWizard,
  // P0 Core Agent (3) - Critical for agent functionality
  FilesystemTools, ShellTool, SearchTools,
  // P2-P4 (5) - Advanced features
  CodeExecutor, GitWorktreeManager, GitRollback, ComputerUseVision, ComputerUseTool,
  // Improvements (4) - Free, permissive, low-resource
  DockerSandbox, MultiModalLocal, VideoProcessor, VideoGenerator,
};

/**
 * Get all tool definitions (for LLM consumption).
 */
function getAllToolDefinitions() {
  const definitions = [];
  const coreTools = [
    new FilesystemTools.FilesystemTools(),
    new ShellTool.ShellTool(),
    new SearchTools.SearchTools(),
  ];
  for (const tool of coreTools) {
    if (tool.getToolDefinitions) {
      definitions.push(...tool.getToolDefinitions());
    }
  }
  return definitions;
}

module.exports.getAllToolDefinitions = getAllToolDefinitions;
