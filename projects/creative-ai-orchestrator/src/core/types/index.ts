// ============================================================================
// Creative AI Orchestrator - Core Type System
// ============================================================================
// Every component in the system is defined by these types.
// No implementation — pure type contracts.
// ============================================================================

import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// IDs & Primitives
// ---------------------------------------------------------------------------

export type ProjectId = string & { __brand: "ProjectId" };
export type RuntimeId = string & { __brand: "RuntimeId" };
export type WorkflowId = string & { __brand: "WorkflowId" };
export type ModelId = string & { __brand: "ModelId" };
export type NodeId = string & { __brand: "NodeId" };
export type ExperimentId = string & { __brand: "ExperimentId" };
export type ExecutionId = string & { __brand: "ExecutionId" };
export type SnapshotId = string & { __brand: "SnapshotId" };
export type ResourceId = string & { __brand: "ResourceId" };

export function newId<T extends string>(): T {
  return uuidv4() as T;
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum AutonomyLevel {
  Manual = "manual",
  Assisted = "assisted",
  Automatic = "automatic",
  Autonomous = "autonomous",
}

export enum OperationMode {
  MaxQuality = "max_quality",
  MaxSpeed = "max_speed",
  MinVram = "min_vram",
  MinCost = "min_cost",
  Balanced = "balanced",
}

export type CompatibilityLevel = "green" | "yellow" | "red";

export enum RiskLevel {
  Read = "read",
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

export enum Permission {
  // Read
  InspectHardware = "inspect_hardware",
  InspectModels = "inspect_models",
  InspectWorkflow = "inspect_workflow",
  ReadLogs = "read_logs",
  InspectOutput = "inspect_output",

  // Safe Write
  CreateProject = "create_project",
  ModifyWorkflow = "modify_workflow",
  SaveWorkflow = "save_workflow",
  GenerateOutput = "generate_output",

  // Privileged
  InstallRuntime = "install_runtime",
  InstallNode = "install_node",
  InstallModel = "install_model",
  ExecuteExternalScript = "execute_external_script",
  ModifySystem = "modify_system",
  DeleteFiles = "delete_files",
}

export enum NetworkPolicy {
  Offline = "offline",
  Restricted = "restricted",
  Normal = "normal",
  Full = "full",
}

export enum EventType {
  // Runtime
  RuntimeInstalled = "runtime.installed",
  RuntimeStarted = "runtime.started",
  RuntimeStopped = "runtime.stopped",
  RuntimeFailed = "runtime.failed",

  // Project
  ProjectCreated = "project.created",
  ProjectImported = "project.imported",
  ProjectUpdated = "project.updated",

  // Workflow
  WorkflowCreated = "workflow.created",
  WorkflowModified = "workflow.modified",
  WorkflowExecuted = "workflow.executed",
  WorkflowFailed = "workflow.failed",

  // Model
  ModelInstalled = "model.installed",
  NodeInstalled = "node.installed",

  // Experiment
  ExperimentStarted = "experiment.started",
  ExperimentCompleted = "experiment.completed",

  // Vision
  VisionAnalysisCompleted = "vision.analysis.completed",
  QualityImproved = "quality.improved",

  // Agent
  AgentStepStarted = "agent.step.started",
  AgentStepCompleted = "agent.step.completed",
  AgentStepFailed = "agent.step.failed",

  // Rollback
  RollbackCompleted = "rollback.completed",

  // System
  SystemHealthChanged = "system.health.changed",
  ErrorOccurred = "error.occurred",
  DiscoveryCompleted = "discovery.completed",
}

export enum HealthStatus {
  Healthy = "healthy",
  Degraded = "degraded",
  Unhealthy = "unhealthy",
  Unknown = "unknown",
}

export enum ErrorCode {
  InstallationError = "INSTALLATION_ERROR",
  DependencyError = "DEPENDENCY_ERROR",
  GpuError = "GPU_ERROR",
  VramError = "VRAM_ERROR",
  ModelError = "MODEL_ERROR",
  NodeError = "NODE_ERROR",
  WorkflowError = "WORKFLOW_ERROR",
  CudaError = "CUDA_ERROR",
  PythonError = "PYTHON_ERROR",
  NetworkError = "NETWORK_ERROR",
  SecurityError = "SECURITY_ERROR",
  LicenseError = "LICENSE_ERROR",
  ResourceError = "RESOURCE_ERROR",
  NotFound = "NOT_FOUND",
  Timeout = "TIMEOUT",
  PermissionDenied = "PERMISSION_DENIED",
  ValidationError = "VALIDATION_ERROR",
}

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------

export interface GpuInfo {
  name: string;
  vendor: "nvidia" | "amd" | "intel" | "apple" | "unknown";
  vramMb: number;
  architecture?: string;
  cudaVersion?: string;
  rocmVersion?: string;
  driverVersion?: string;
  pcieGen?: number;
  pcieWidth?: number;
}

export interface HardwareProfile {
  os: string;
  osVersion: string;
  arch: string;
  cpu: {
    model: string;
    cores: number;
    threads: number;
  };
  ramMb: number;
  gpus: GpuInfo[];
  cudaAvailable: boolean;
  rocmAvailable: boolean;
  pythonVersion?: string;
  totalDiskMb: number;
  freeDiskMb: number;
  detectedAt: Date;
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export interface RuntimeCapabilities {
  imageGeneration: boolean;
  videoGeneration: boolean;
  audioGeneration: boolean;
  musicGeneration: boolean;
  tts: boolean;
  stt: boolean;
  threeD: boolean;
  editing: boolean;
  upscaling: boolean;
  training: boolean;
  loraTraining: boolean;
  workflowGraph: boolean;
  localExecution: boolean;
  remoteExecution: boolean;
}

export interface RuntimeInfo {
  id: RuntimeId;
  name: string;
  version: string;
  path: string;
  pythonPath?: string;
  capabilities: RuntimeCapabilities;
  status: "not_installed" | "installed" | "starting" | "running" | "stopped" | "error";
  port?: number;
  pid?: number;
  apiEndpoint?: string;
}

export interface RuntimeAdapter {
  readonly id: string;
  readonly name: string;
  detect(): Promise<RuntimeInfo>;
  install(config: RuntimeInstallConfig): Promise<InstallResult>;
  configure(config: RuntimeConfig): Promise<void>;
  start(config?: RuntimeStartConfig): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  getSystemInfo(): Promise<RuntimeSystemInfo>;
  listModels(): Promise<RuntimeModel[]>;
  installModel(model: ModelInstallRequest): Promise<InstallResult>;
  listExtensions(): Promise<RuntimeExtension[]>;
  installExtension(ext: RuntimeExtensionInstallRequest): Promise<InstallResult>;
  removeExtension(id: string): Promise<void>;
  execute(request: WorkflowExecutionRequest): Promise<ExecutionResult>;
  getExecutionStatus(id: ExecutionId): Promise<ExecutionStatus>;
  getLogs(id: ExecutionId): Promise<LogEntry[]>;
  rollback(snapshotId: SnapshotId): Promise<void>;
}

export interface RuntimeInstallConfig {
  path?: string;
  pythonPath?: string;
  version?: string;
  isolatedEnvironment?: boolean;
}

export interface RuntimeConfig {
  port?: number;
  host?: string;
  extraArgs?: string[];
}

export interface RuntimeStartConfig {
  port?: number;
  extraArgs?: string[];
}

export interface RuntimeSystemInfo {
  runtimeVersion: string;
  pythonVersion: string;
  cudaVersion?: string;
  rocmVersion?: string;
  installedNodes: number;
  installedModels: number;
}

export interface RuntimeModel {
  name: string;
  path: string;
  hash?: string;
  sizeBytes: number;
  type: string;
  format?: string;
}

export interface RuntimeExtension {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  author?: string;
  description?: string;
  license?: string;
}

export interface RuntimeExtensionInstallRequest {
  id: string;
  source?: string;
  version?: string;
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

export interface InstallResult {
  success: boolean;
  path?: string;
  version?: string;
  error?: CaioError;
  duration: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export interface WorkflowNode {
  id: string;
  type: string;
  title?: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowLink {
  fromNode: string;
  fromOutput: string;
  toNode: string;
  toInput: string;
}

export interface Workflow {
  id: WorkflowId;
  name: string;
  description?: string;
  version: string;
  nodes: WorkflowNode[];
  links: WorkflowLink[];
  metadata: WorkflowMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowMetadata {
  author?: string;
  license?: string;
  tags: string[];
  requiredNodes: string[];
  requiredModels: WorkflowModelRef[];
  estimatedVramMb?: number;
  estimatedRamMb?: number;
  estimatedRuntimeSeconds?: number;
  source?: string;
}

export interface WorkflowModelRef {
  name: string;
  hash?: string;
  type: string;
  required: boolean;
  alternatives?: string[];
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
  warnings: string[];
  missingNodes: string[];
  missingModels: WorkflowModelRef[];
}

export interface WorkflowValidationError {
  nodeId?: string;
  type: "missing_node" | "missing_model" | "invalid_connection" | "invalid_parameter" | "unsupported";
  message: string;
}

export interface WorkflowExecutionRequest {
  workflow: Workflow;
  parameters?: Record<string, unknown>;
  seed?: number;
  mode?: OperationMode;
}

export interface ExecutionResult {
  id: ExecutionId;
  success: boolean;
  outputs: ExecutionOutput[];
  duration: number;
  error?: CaioError;
  resourceUsage: ResourceUsage;
}

export interface ExecutionOutput {
  type: "image" | "video" | "audio" | "text" | "3d";
  path: string;
  hash?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionStatus {
  id: ExecutionId;
  state: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  currentStep?: string;
  startTime: Date;
  endTime?: Date;
  error?: CaioError;
}

export interface ResourceUsage {
  peakVramMb?: number;
  peakRamMb?: number;
  cpuTimeMs: number;
  gpuTimeMs?: number;
  diskReadMb?: number;
  diskWriteMb?: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface ModelDefinition {
  id: ModelId;
  name: string;
  type: ModelType;
  source: ModelSource;
  url: string;
  hash?: string;
  sizeBytes: number;
  license: LicenseInfo;
  format?: string;
  vramEstimateMb?: number;
  diskRequirementMb?: number;
  tags: string[];
  installed: boolean;
  installedPath?: string;
  installedHash?: string;
}

export type ModelType =
  | "checkpoint"
  | "lora"
  | "vae"
  | "controlnet"
  | "embedding"
  | "upscaler"
  | "video_model"
  | "encoder"
  | "decoder"
  | "vlm"
  | "llm"
  | "audio"
  | "style"
  | "other";

export interface ModelSource {
  provider: "github" | "huggingface" | "civitai" | "comfy" | "local" | "url";
  url: string;
  author?: string;
  repository?: string;
}

export interface ModelInstallRequest {
  model: ModelDefinition;
  targetPath?: string;
}

// ---------------------------------------------------------------------------
// License
// ---------------------------------------------------------------------------

export interface LicenseInfo {
  spdxId?: string;
  name: string;
  url?: string;
  commercialUse: boolean;
  modificationAllowed: boolean;
  redistributionAllowed: boolean;
  copyleft: boolean;
  additionalTerms?: string;
}

export interface ModelLicenseInfo extends LicenseInfo {
  modelLicense: string;
  assetLicense?: string;
}

export interface DependencyLicense {
  name: string;
  version: string;
  repository?: string;
  license: LicenseInfo;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface DiscoveryResult {
  provider: string;
  query: string;
  results: DiscoveredResource[];
  totalResults: number;
  searchTime: number;
  cached: boolean;
}

export interface DiscoveredResource {
  id: string;
  name: string;
  description: string;
  url: string;
  source: "github" | "huggingface" | "civitai" | "comfy";
  stars?: number;
  downloads?: number;
  lastUpdated?: Date;
  language?: string;
  license: LicenseInfo;
  securityScore?: SecurityScore;
  compatibilityScore?: number;
  overallScore: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export interface ResourceScore {
  overall: number;
  license: number;
  maintenance: number;
  activity: number;
  documentation: number;
  quality: number;
  compatibility: number;
  hardwareFit: number;
  security: number;
  dependencies: number;
  popularity: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

export interface SecurityScore {
  repositoryReputation: number;
  dependencies: number;
  codeRisk: number;
  networkBehavior: number;
  licenseClarity: number;
  overall: number;
}

export interface SecurityScanResult {
  score: SecurityScore;
  risks: SecurityRisk[];
  blocked: boolean;
  warnings: string[];
}

export interface SecurityRisk {
  category: "shell_command" | "script" | "download" | "filesystem" | "network" | "executable" | "suspicious_dependency" | "malware";
  severity: RiskLevel;
  description: string;
  file?: string;
  line?: number;
}

export interface SandboxConfig {
  networkPolicy: NetworkPolicy;
  filesystemRoots: string[];
  maxDiskMb: number;
  maxRamMb: number;
  maxExecutionSeconds: number;
  allowedPermissions: Permission[];
}

// ---------------------------------------------------------------------------
// Compatibility
// ---------------------------------------------------------------------------

export interface CompatibilityCheck {
  os: CompatibilityLevel;
  cpu: CompatibilityLevel;
  gpu: CompatibilityLevel;
  vram: CompatibilityLevel;
  ram: CompatibilityLevel;
  storage: CompatibilityLevel;
  python: CompatibilityLevel;
  cuda: CompatibilityLevel;
  overall: CompatibilityLevel;
  issues: CompatibilityIssue[];
  recommendation?: string;
}

export interface CompatibilityIssue {
  component: string;
  required?: string;
  available?: string;
  level: CompatibilityLevel;
  fix?: string;
}

// ---------------------------------------------------------------------------
// Vision
// ---------------------------------------------------------------------------

export interface ImageAnalysis {
  path: string;
  width: number;
  height: number;
  channels: number;
  format: string;
  sizeBytes: number;
  sharpness: number;
  noise: number;
  blur: number;
  contrast: number;
  brightness: number;
  colorfulness: number;
  composition?: number;
  artifacts?: number;
  faces?: number;
  text?: boolean;
  overallQuality: number;
  analyzedAt: Date;
}

export interface VideoAnalysis {
  path: string;
  frameCount: number;
  fps: number;
  duration: number;
  width: number;
  height: number;
  averageQuality: number;
  temporalConsistency: number;
  flickerScore: number;
  motionScore: number;
  analyzedAt: Date;
}

export interface QualityScore {
  sharpness: number;
  noise: number;
  composition: number;
  lighting: number;
  artifacts: number;
  resolution: number;
  overall: number;
  weights: QualityWeights;
}

export interface QualityWeights {
  sharpness: number;
  noise: number;
  composition: number;
  lighting: number;
  artifacts: number;
  resolution: number;
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export interface Experiment {
  id: ExperimentId;
  projectId: ProjectId;
  name: string;
  variables: ExperimentVariables;
  workflowVersion: WorkflowId;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  result?: ExperimentResult;
  createdAt: Date;
  completedAt?: Date;
}

export interface ExperimentVariables {
  model?: string;
  resolution?: string;
  steps?: number;
  cfg?: number;
  sampler?: string;
  seed?: number;
  lora?: string;
  upscaler?: string;
  denoise?: number;
  frames?: number;
  [key: string]: unknown;
}

export interface ExperimentResult {
  output: ExecutionOutput;
  qualityScore: QualityScore;
  resourceUsage: ResourceUsage;
  duration: number;
  success: boolean;
  error?: CaioError;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface Project {
  id: ProjectId;
  name: string;
  description?: string;
  path: string;
  workflowIds: WorkflowId[];
  modelRefs: ModelDefinition[];
  config: ProjectConfig;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  versions: ProjectVersion[];
}

export interface ProjectConfig {
  runtimeId?: RuntimeId;
  mode: OperationMode;
  autonomyLevel: AutonomyLevel;
  networkPolicy: NetworkPolicy;
  maxVramMb?: number;
  maxExperiments?: number;
  customSettings: Record<string, unknown>;
}

export interface ProjectVersion {
  id: SnapshotId;
  label: string;
  timestamp: Date;
  workflows: WorkflowId[];
  models: string[];
  snapshot: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  projectId?: ProjectId;
  type: "short_term" | "project" | "long_term" | "experiment";
  category: string;
  content: string;
  metadata: Record<string, unknown>;
  relevance: number;
  createdAt: Date;
  expiresAt?: Date;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface CaioEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  projectId?: ProjectId;
  runtimeId?: RuntimeId;
  data: Record<string, unknown>;
  error?: CaioError;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface CaioError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  userMessage?: string;
  suggestion?: string;
  recoverable: boolean;
  timestamp: Date;
}

export function createError(
  code: ErrorCode,
  message: string,
  opts?: {
    details?: Record<string, unknown>;
    userMessage?: string;
    suggestion?: string;
    recoverable?: boolean;
  }
): CaioError {
  return {
    code,
    message,
    details: opts?.details,
    userMessage: opts?.userMessage,
    suggestion: opts?.suggestion,
    recoverable: opts?.recoverable ?? false,
    timestamp: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  lastChecked: Date;
  details?: Record<string, unknown>;
}

export interface SystemHealthReport {
  overall: HealthStatus;
  components: ComponentHealth[];
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// LLM Provider
// ---------------------------------------------------------------------------

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: LLMCapabilities;
  isAvailable(): Promise<boolean>;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
  estimateTokens(text: string): number;
}

export interface LLMCapabilities {
  maxTokens: number;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
  costPer1kInputTokens?: number;
  costPer1kOutputTokens?: number;
  contextWindow: number;
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: LLMTool[];
  toolChoice?: "auto" | "none" | "required";
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LLMContentPart[];
  toolCallId?: string;
  name?: string;
}

export interface LLMContentPart {
  type: "text" | "image";
  text?: string;
  imageUrl?: string;
  mimeType?: string;
}

export interface LLMTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMCompletionResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  permission: Permission;
  risk: RiskLevel;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  runtime?: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: CaioError;
  timestamp: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

// Re-export config type
export type { CaioConfig } from "../config/index.js";

// Re-export database type
export type { CaioDatabase } from "../database/index.js";
