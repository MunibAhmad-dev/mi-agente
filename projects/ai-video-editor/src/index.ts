/**
 * AI Creative OS
 * 
 * Universal Local-First Creative Automation Platform.
 * 
 * Architecture: Modular Monolith prepared for decoupling.
 * Principle: Capability-centric, not application-centric.
 * The AI never thinks "I need DaVinci." It thinks "I need editing + color + audio + compositing."
 */

// ─── Core Infrastructure ─────────────────────────────────────────────────────
export { EventBus, Config, Logger, StorageEngine, Registry,
  generateId, generateShortId, timestamp,
  execCommand, commandExists, getPlatform, fileHash,
  withRetry,
  type LogLevel, type RetryOptions } from "./core/index.js";

// ─── Type System ─────────────────────────────────────────────────────────────
export * from "./types/index.js";

// ─── Capability Engine ───────────────────────────────────────────────────────
export {
  CapabilityRegistry, CapabilityEquivalenceEngine, CapabilityResolver,
  createBuiltinCapabilities, createCapability,
  type ProviderCandidate, type EquivalenceResult,
} from "./capability-engine/index.js";

// ─── Provider Engine ─────────────────────────────────────────────────────────
export {
  ProviderRegistry, ProviderRouter, ProviderDiscovery, ProviderHealthMonitor,
  createProvider,
  type RouteResult, type DiscoveryResult,
} from "./provider-engine/index.js";

// ─── Adapter Engine ──────────────────────────────────────────────────────────
export {
  AdapterRegistry, BaseAdapter, createAllAdapters, createAdapterRegistry,
  FFmpegAdapter, OpenCVAdapter, WhisperAdapter, PySceneDetectAdapter,
  OpenTimelineIOAdapter, ComfyUIAdapter, DaVinciAdapter, CapCutAdapter,
  AfterEffectsAdapter, CanvaAdapter, KdenliveAdapter, BlenderAdapter,
  NatronAdapter, WanAdapter,
  type AdapterDetectionResult, type AutomationMethod,
  type WanFamily, type WanGenerationOptions,
} from "./adapter-engine/index.js";

// ─── Hardware Engine ─────────────────────────────────────────────────────────
export { HardwareEngine } from "./hardware-engine/index.js";

// ─── License Engine ──────────────────────────────────────────────────────────
export { LicenseEngine, type LicenseRecord, type LicenseVerdict, type LicenseMatrixRow } from "./license-engine/index.js";

// ─── Installation Engine ─────────────────────────────────────────────────────
export { InstallationEngine, type InstallStep, type InstallResult } from "./installation-engine/index.js";

// ─── Creative Compiler ───────────────────────────────────────────────────────
export { CreativeCompiler, type IntentAnalysis } from "./creative-compiler/index.js";

// ─── Creative Director ───────────────────────────────────────────────────────
export { CreativeDirector, type CreativeSession } from "./creative-director/index.js";

// ─── Production Graph & Planner ──────────────────────────────────────────────
export {
  ProductionGraphEngine, ProductionPlanner,
  type ProductionPlan,
} from "./production-graph/index.js";

// ─── Workflow Engine ─────────────────────────────────────────────────────────
export { WorkflowComposer, WorkflowExecutor } from "./workflow-engine/index.js";

// ─── Style Engine ────────────────────────────────────────────────────────────
export {
  StyleAnalyzer, StyleComparator, StyleMixer, StyleLearningEngine,
  type StyleComparison,
} from "./style-engine/index.js";

// ─── Memory ──────────────────────────────────────────────────────────────────
export { CreativeMemory } from "./memory/index.js";

// ─── Asset Engine ────────────────────────────────────────────────────────────
export { AssetEngine, type Asset, type AssetGraph } from "./asset-engine/index.js";

// ─── Quality Engine ──────────────────────────────────────────────────────────
export { QualityEngine, type QualityReport, type QualityIssue } from "./quality-engine/index.js";

// ─── Scheduler ───────────────────────────────────────────────────────────────
export { ResourceScheduler, type ScheduledTask } from "./scheduler/index.js";

// ─── Observability ───────────────────────────────────────────────────────────
export { ObservabilityEngine, type Metric, type TraceSpan } from "./observability/index.js";

// ─── Security ────────────────────────────────────────────────────────────────
export { SecuritySandbox, type SecurityPolicy, type SecurityViolation } from "./security/index.js";

// ─── Plugin Engine ───────────────────────────────────────────────────────────
export { PluginEngine, type Plugin } from "./plugin-engine/index.js";

// ─── Project Engine ──────────────────────────────────────────────────────────
export { ProjectEngine, type ProjectVersion, type ProjectCheckpoint } from "./project/index.js";

// ─── Media Model ─────────────────────────────────────────────────────────────
export { UniversalMediaModel } from "./media-model/index.js";

// ─── Color Engine ────────────────────────────────────────────────────────────
export {
  ColorEngine,
  type ColorGradingOptions, type CurvePoint, type ColorWheelValues,
  type LUTApplicationOptions, type ColorAnalysis, type ColorMatchResult,
  type HDRMetadata, type ScopesResult,
} from "./engines/color.js";

// ─── Voice Engine ────────────────────────────────────────────────────────────
export {
  VoiceEngine,
  type VoiceProfile, type NoiseReductionOptions, type EQBand, type EQSettings,
  type CompressionSettings as VoiceCompressionSettings, type TTSOptions,
  type VoiceIsolationOptions, type AudioMixTrack, type MasteringOptions,
  type VoiceAnalysis,
} from "./engines/voice.js";

// ─── Thumbnail Engine ────────────────────────────────────────────────────────
export {
  ThumbnailEngine,
  type ThumbnailOptions, type ThumbnailResult, type ThumbnailScore,
  type BatchThumbnailResult,
} from "./engines/thumbnail.js";

// ─── OCR Engine ──────────────────────────────────────────────────────────────
export {
  OCREngine,
  type OCRDetectedText, type OCRFrameResult, type VideoTextAnalysis, type OCROptions,
} from "./engines/ocr.js";

// ─── Caption Style Learning ──────────────────────────────────────────────────
export {
  CaptionStyleLearningEngine,
  type CaptionStyleDNA,
} from "./style-engine/caption-learning.js";

// ─── Model Manager ───────────────────────────────────────────────────────────
export { ModelManager, type ModelEntry } from "./model-manager/index.js";

// ─── Workflow Manager ────────────────────────────────────────────────────────
export { WorkflowManager, type ManagedWorkflow } from "./workflow-manager/index.js";

// ─── Task Manager ────────────────────────────────────────────────────────────
export { TaskManager, type ManagedTask } from "./task-manager/index.js";

// ─── System Facade ───────────────────────────────────────────────────────────

import { EventBus, Config, Logger, StorageEngine, generateId } from "./core/index.js";
import { CapabilityRegistry, CapabilityEquivalenceEngine, CapabilityResolver, createBuiltinCapabilities } from "./capability-engine/index.js";
import { ProviderRegistry, ProviderRouter, ProviderDiscovery, ProviderHealthMonitor } from "./provider-engine/index.js";
import { AdapterRegistry, createAdapterRegistry } from "./adapter-engine/index.js";
import { HardwareEngine } from "./hardware-engine/index.js";
import { LicenseEngine } from "./license-engine/index.js";
import { InstallationEngine } from "./installation-engine/index.js";
import { CreativeDirector } from "./creative-director/index.js";
import { CreativeCompiler } from "./creative-compiler/index.js";
import { ProductionPlanner, ProductionGraphEngine } from "./production-graph/index.js";
import { WorkflowComposer, WorkflowExecutor } from "./workflow-engine/index.js";
import { StyleAnalyzer, StyleComparator, StyleLearningEngine } from "./style-engine/index.js";
import { CreativeMemory } from "./memory/index.js";
import { AssetEngine } from "./asset-engine/index.js";
import { QualityEngine } from "./quality-engine/index.js";
import { ResourceScheduler } from "./scheduler/index.js";
import { ObservabilityEngine } from "./observability/index.js";
import { SecuritySandbox } from "./security/index.js";
import { PluginEngine } from "./plugin-engine/index.js";
import { ProjectEngine } from "./project/index.js";
import { StyleLearningPipeline } from "./style-engine/pipeline.js";
import { WorkflowSimulator } from "./workflow-engine/simulator.js";
import { createBuiltinProviders } from "./provider-engine/builtin-providers.js";
import {
  AudioEngine, ImageEngine, VideoEngine, AnimationEngine,
  EditingEngine, CompositingEngine, RenderEngine, SubtitleEngine,
} from "./engines/index.js";
import {
  ScriptEngine, StoryboardEngine, ShotPlanner,
  ConsistencyEngine, createBuiltinActions,
} from "./engines/creative.js";
import { ImportExportEngine } from "./import-export/index.js";
import { DatabaseEngine } from "./engines/database.js";
import { CacheEngine } from "./cache-engine/index.js";
import {
  HumanInTheLoop, ExperimentManager, PlatformOptimizer,
  TemplateEngine, LongVideoEngine, FailureMemory,
  CheckpointSystem,
} from "./engines/feedback.js";
import { WorkflowCatalog } from "./workflow-engine/catalog.js";
import { VideoIngestionPipeline } from "./style-engine/ingestion.js";
import { ColorEngine } from "./engines/color.js";
import { VoiceEngine } from "./engines/voice.js";
import { ThumbnailEngine } from "./engines/thumbnail.js";
import { OCREngine } from "./engines/ocr.js";
import { CaptionStyleLearningEngine } from "./style-engine/caption-learning.js";
import { ModelManager } from "./model-manager/index.js";
import { WorkflowManager } from "./workflow-manager/index.js";
import { TaskManager } from "./task-manager/index.js";

/**
 * AICreativeOS — the main system facade.
 * Instantiate this to get a fully-wired system.
 */
export class AICreativeOS {
  readonly eventBus: EventBus;
  readonly config: Config;
  readonly logger: Logger;
  readonly storage: StorageEngine;

  // Engines
  readonly capabilityRegistry: CapabilityRegistry;
  readonly capabilityEquivalence: CapabilityEquivalenceEngine;
  readonly capabilityResolver: CapabilityResolver;
  readonly providerRegistry!: ProviderRegistry;
  readonly providerRouter: ProviderRouter;
  readonly providerDiscovery: ProviderDiscovery;
  readonly providerHealth: ProviderHealthMonitor;
  readonly adapterRegistry: AdapterRegistry;
  readonly hardware: HardwareEngine;
  readonly license: LicenseEngine;
  readonly installation: InstallationEngine;
  readonly creativeDirector: CreativeDirector;
  readonly creativeCompiler: CreativeCompiler;
  readonly productionPlanner: ProductionPlanner;
  readonly productionGraph: ProductionGraphEngine;
  readonly workflowComposer: WorkflowComposer;
  readonly workflowExecutor: WorkflowExecutor;
  readonly styleAnalyzer: StyleAnalyzer;
  readonly styleComparator: StyleComparator;
  readonly styleLearning: StyleLearningEngine;
  readonly memory: CreativeMemory;
  readonly assets: AssetEngine;
  readonly quality: QualityEngine;
  readonly scheduler: ResourceScheduler;
  readonly observability: ObservabilityEngine;
  readonly security: SecuritySandbox;
  readonly plugins: PluginEngine;
  readonly projects: ProjectEngine;
  readonly stylePipeline: StyleLearningPipeline;
  readonly workflowSimulator: WorkflowSimulator;
  readonly audio: AudioEngine;
  readonly image: ImageEngine;
  readonly video: VideoEngine;
  readonly animation: AnimationEngine;
  readonly editing: EditingEngine;
  readonly compositing: CompositingEngine;
  readonly render: RenderEngine;
  readonly subtitles: SubtitleEngine;
  readonly scriptEngine: ScriptEngine;
  readonly storyboardEngine: StoryboardEngine;
  readonly shotPlanner: ShotPlanner;
  readonly consistency: ConsistencyEngine;
  readonly importExport: ImportExportEngine;
  readonly database: DatabaseEngine;
  readonly cache: CacheEngine;
  readonly humanLoop: HumanInTheLoop;
  readonly experiments: ExperimentManager;
  readonly platformOptimizer: PlatformOptimizer;
  readonly templates: TemplateEngine;
  readonly longVideo: LongVideoEngine;
  readonly failureMemory: FailureMemory;
  readonly checkpoints: CheckpointSystem;
  readonly catalog: WorkflowCatalog;
  readonly ingestion: VideoIngestionPipeline;
  readonly color: ColorEngine;
  readonly voice: VoiceEngine;
  readonly thumbnail: ThumbnailEngine;
  readonly ocr: OCREngine;
  readonly captionLearning: CaptionStyleLearningEngine;
  readonly modelManager: ModelManager;
  readonly workflowManager: WorkflowManager;
  readonly taskManager: TaskManager;

  constructor(dataDirectory = "./data") {
    // Core infrastructure
    this.eventBus = new EventBus();
    this.config = new Config(`${dataDirectory}/config.json`);
    this.logger = new Logger("AICreativeOS");
    this.storage = new StorageEngine(dataDirectory, this.logger);

    // Capability Engine
    this.capabilityRegistry = new CapabilityRegistry("CapabilityRegistry");
    this.capabilityEquivalence = new CapabilityEquivalenceEngine();
    this.capabilityResolver = new CapabilityResolver(this.capabilityRegistry, this.capabilityEquivalence);

    // Register built-in capabilities
    for (const cap of createBuiltinCapabilities()) {
      this.capabilityRegistry.register(cap);
    }

    // Provider Engine
    this.providerRegistry = new ProviderRegistry(this.eventBus);

    // Register built-in providers
    for (const provider of createBuiltinProviders()) {
      this.providerRegistry.register(provider);
    }

    // Register built-in actions
    const _actions = createBuiltinActions();
    this.providerRouter = new ProviderRouter(this.providerRegistry);
    this.providerDiscovery = new ProviderDiscovery();
    this.providerHealth = new ProviderHealthMonitor(this.providerRegistry, this.eventBus);

    // Adapter Engine
    this.adapterRegistry = createAdapterRegistry(this.eventBus);

    // System Engines
    this.hardware = new HardwareEngine();
    this.license = new LicenseEngine(this.eventBus);
    this.installation = new InstallationEngine(this.eventBus);

    // Creative Pipeline
    this.creativeCompiler = new CreativeCompiler(this.eventBus);
    this.creativeDirector = new CreativeDirector(this.eventBus);
    this.productionPlanner = new ProductionPlanner(this.eventBus);
    this.productionGraph = new ProductionGraphEngine(this.eventBus);
    this.workflowComposer = new WorkflowComposer(this.eventBus);
    this.workflowExecutor = new WorkflowExecutor(this.eventBus);

    // Style Engine
    this.styleAnalyzer = new StyleAnalyzer();
    this.styleComparator = new StyleComparator();
    this.styleLearning = new StyleLearningEngine(this.eventBus);

    // Support Engines
    this.memory = new CreativeMemory(this.eventBus, this.storage);
    this.assets = new AssetEngine(this.eventBus, this.storage);
    this.quality = new QualityEngine(this.eventBus);
    this.scheduler = new ResourceScheduler(this.eventBus);
    this.observability = new ObservabilityEngine(this.eventBus);
    this.security = new SecuritySandbox(this.eventBus);
    this.plugins = new PluginEngine(this.eventBus);
    this.projects = new ProjectEngine(this.eventBus, this.storage);

    // Advanced pipelines
    this.stylePipeline = new StyleLearningPipeline(this.eventBus);
    this.workflowSimulator = new WorkflowSimulator(this.eventBus);

    // Domain engines
    this.audio = new AudioEngine("Audio", this.eventBus, this.adapterRegistry, this.providerRouter);
    this.image = new ImageEngine("Image", this.eventBus, this.adapterRegistry, this.providerRouter);
    this.video = new VideoEngine("Video", this.eventBus, this.adapterRegistry, this.providerRouter);
    this.animation = new AnimationEngine("Animation", this.eventBus, this.adapterRegistry, this.providerRouter);
    this.editing = new EditingEngine("Editing", this.eventBus, this.adapterRegistry, this.providerRouter);
    this.compositing = new CompositingEngine("Compositing", this.eventBus, this.adapterRegistry, this.providerRouter);
    this.render = new RenderEngine("Render", this.eventBus, this.adapterRegistry, this.providerRouter);
    this.subtitles = new SubtitleEngine("Subtitles", this.eventBus, this.adapterRegistry, this.providerRouter);

    // Creative sub-engines
    this.scriptEngine = new ScriptEngine();
    this.storyboardEngine = new StoryboardEngine();
    this.shotPlanner = new ShotPlanner();
    this.consistency = new ConsistencyEngine();
    this.importExport = new ImportExportEngine(this.eventBus);
    this.database = new DatabaseEngine(this.storage);

    // Feedback & optimization engines
    this.cache = new CacheEngine();
    this.humanLoop = new HumanInTheLoop(this.eventBus);
    this.experiments = new ExperimentManager();
    this.platformOptimizer = new PlatformOptimizer();
    this.templates = new TemplateEngine();
    this.templates.createPresets();
    this.longVideo = new LongVideoEngine(this.eventBus);
    this.failureMemory = new FailureMemory();
    this.checkpoints = new CheckpointSystem();
    this.catalog = new WorkflowCatalog();
    this.ingestion = new VideoIngestionPipeline(this.eventBus);

    // New engines
    this.color = new ColorEngine(this.eventBus);
    this.voice = new VoiceEngine(this.eventBus);
    this.thumbnail = new ThumbnailEngine(this.eventBus);
    this.ocr = new OCREngine(this.eventBus);
    this.captionLearning = new CaptionStyleLearningEngine(this.eventBus);
    this.modelManager = new ModelManager(this.eventBus);
    this.workflowManager = new WorkflowManager(this.eventBus);
    this.taskManager = new TaskManager(this.eventBus);
  }

  /**
   * Initialize the system: detect hardware, providers, adapters.
   */
  async initialize(): Promise<{
    hardware: Awaited<ReturnType<HardwareEngine["detect"]>>;
    adapters: Awaited<ReturnType<AdapterRegistry["detectAll"]>>;
    capabilities: number;
    providers: number;
  }> {
    this.logger.info("Initializing AI Creative OS...");

    // Detect hardware
    const hardwareProfile = await this.hardware.detect();
    this.scheduler.setHardwareProfile(hardwareProfile);

    // Detect adapters
    const adapterResults = await this.adapterRegistry.detectAll();
    this.logger.info(`Adapter detection complete: ${adapterResults.filter((r) => r.detected).length}/${adapterResults.length} found`);

    const capCount = this.capabilityRegistry.count();
    const provCount = this.providerRegistry.count();

    this.logger.info(`System initialized: ${capCount} capabilities, ${provCount} providers`);

    await this.eventBus.emit("SYSTEM_INITIALIZED", "AICreativeOS", {
      hardwareScore: hardwareProfile.aiScore,
      adaptersDetected: adapterResults.filter((r) => r.detected).length,
      capabilities: capCount,
    });

    return {
      hardware: hardwareProfile,
      adapters: adapterResults,
      capabilities: capCount,
      providers: provCount,
    };
  }

  /**
   * Process a creative request through the full pipeline.
   */
  async processCreativeRequest(
    intent: string,
    options?: Record<string, unknown>,
  ) {
    const traceId = this.observability.startTrace("processCreativeRequest", "AICreativeOS");
    try {
      const session = await this.creativeDirector.processRequest(intent, options as any);
      this.observability.endTrace(traceId, "ok");
      return session;
    } catch (err) {
      this.observability.endTrace(traceId, "error");
      this.observability.recordError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Get system status overview.
   */
  getStatus(): Record<string, unknown> {
    return {
      capabilities: this.capabilityRegistry.count(),
      providers: this.providerRegistry.count(),
      adapters: this.adapterRegistry.count(),
      installedAdapters: this.adapterRegistry.getInstalled().length,
      projects: this.projects.getStats(),
      assets: this.assets.getStats(),
      memory: this.memory.getStats(),
      quality: this.quality.getReports().length,
      observability: this.observability.getOverview(),
      security: this.security.getOverview(),
      plugins: this.plugins.count(),
    };
  }
}
