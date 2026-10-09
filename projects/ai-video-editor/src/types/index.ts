/**
 * AI Creative OS - Core Type System
 * All contracts, interfaces, and domain types for the platform.
 */

import { z } from "zod";

// ─── Utility Types ───────────────────────────────────────────────────────────

export type UniqueId = string;
export type Timestamp = number;
export type FilePath = string;
export type URL = string;
export type Percentage = number;
export type Score = number;
export type Duration = number;
export type Bytes = number;

// ─── Type Aliases (replacing enums for TypeScript compatibility) ─────────────

export type MediaType = "video" | "image" | "audio" | "text" | "subtitle" | "animation" | "mixed";

export type CapabilityDomain = "editing" | "color" | "audio" | "motion_graphics" | "vfx" | "image" | "video_ai" | "compositing" | "rendering" | "export" | "import" | "animation" | "subtitles" | "thumbnails" | "script" | "storyboard";

export type ProviderSource = "native_api" | "cli" | "sdk" | "scripting" | "project_file" | "ipc" | "plugin" | "accessibility" | "gui_automation";

export type AutomationPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type LicenseType = "MIT" | "Apache-2.0" | "GPL-2.0" | "GPL-3.0" | "LGPL-2.1" | "LGPL-3.0" | "BSD-2-Clause" | "BSD-3-Clause" | "MPL-2.0" | "proprietary" | "custom" | "unknown";

export type LicenseScope = "permissive" | "copyleft" | "weak_copyleft" | "proprietary" | "restricted" | "unknown";

export type HealthStatus = "healthy" | "warning" | "degraded" | "broken" | "missing" | "unsupported";

export type ProviderStatus = "available" | "installed" | "missing" | "broken" | "outdated" | "incompatible" | "restricted";

export type TaskStatus = "queued" | "running" | "paused" | "completed" | "failed" | "recovering" | "cancelled";

export type ProjectStatus = "draft" | "in_progress" | "rendering" | "completed" | "failed" | "archived";

export type ExportFormat = "mp4" | "mov" | "webm" | "avi" | "mkv" | "gif" | "png_sequence" | "jpeg_sequence" | "exr" | "tiff" | "wav" | "flac" | "mp3" | "aac" | "otio" | "json";

export type Platform = "tiktok" | "youtube_shorts" | "instagram_reels" | "youtube" | "twitter" | "facebook" | "linkedin" | "generic";

export type TransitionType = "cut" | "crossfade" | "fade_to_black" | "fade_to_white" | "wipe" | "dissolve" | "push" | "slide" | "zoom" | "blur" | "glitch" | "custom";

export type CameraMovement = "static" | "pan" | "tilt" | "zoom" | "dolly" | "truck" | "pedestal" | "crane" | "handheld" | "tracking" | "orbit" | "fpv";

export type ShotType = "wide" | "medium_wide" | "medium" | "medium_close" | "close_up" | "extreme_close_up" | "over_the_shoulder" | "pov" | "establishing" | "insert" | "cutaway";

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "21:9" | "2.39:1";

export type Pacing = "very_fast" | "fast" | "medium" | "slow" | "very_slow";

export type QualityPreset = "fast" | "balanced" | "quality" | "maximum" | "low_resource";

export type FeatureStatus = "planned" | "researching" | "implementing" | "integrated" | "tested" | "production_ready";

// ─── Capability Types ────────────────────────────────────────────────────────

export interface Capability {
  id: UniqueId;
  domain: CapabilityDomain;
  name: string;
  description: string;
  subcapabilities: string[];
  requirements: CapabilityRequirements;
  required: boolean;
  category?: string;
  tags?: string[];
}

export interface CapabilityRequirements {
  minVRAM?: Bytes;
  minRAM?: Bytes;
  minCPUCores?: number;
  gpu?: boolean;
  network?: boolean;
  os?: string[];
  models?: string[];
  formats?: string[];
  maxResolution?: { width: number; height: number };
  maxDuration?: Duration;
}

export interface CapabilityMatch {
  capability: Capability;
  score: Score;
  matchType: "exact" | "functional" | "approximate" | "partial" | "none";
  provider: UniqueId;
  notes?: string;
}

// ─── Provider Types ──────────────────────────────────────────────────────────

export interface Provider {
  id: UniqueId;
  name: string;
  version: string;
  source: ProviderSource[];
  license: LicenseInfo;
  capabilities: UniqueId[];
  installation: InstallationInfo;
  hardware: HardwareRequirements;
  quality: Score;
  speed: Score;
  automationScore: Score;
  stability: Score;
  maintenanceScore: Score;
  fallbacks: UniqueId[];
  dependencies: ProviderDependency[];
  status: ProviderStatus;
  health: HealthStatus;
  healthDetails?: string;
  configuration?: Record<string, unknown>;
  projectFormat?: string;
  officialSource?: URL;
  commitTag?: string;
  lastHealthCheck?: Timestamp;
  score?: ProviderScore;
}

export interface ProviderScore {
  capability: Score;
  quality: Score;
  speed: Score;
  resource: Score;
  automation: Score;
  stability: Score;
  license: Score;
  maintenance: Score;
  compatibility: Score;
  overall: Score;
}

export interface LicenseInfo {
  softwareLicense: LicenseType;
  softwareLicenseScope: LicenseScope;
  modelLicense?: LicenseType;
  weightsLicense?: LicenseType;
  workflowLicense?: LicenseType;
  pluginLicense?: LicenseType;
  commercialUse: boolean;
  redistribution: boolean;
  modification: boolean;
  restrictions?: string[];
  licenseSource?: URL;
}

export interface InstallationInfo {
  installed: boolean;
  path?: FilePath;
  version?: string;
  checksumVerified?: boolean;
  autoInstallable: boolean;
  installCommand?: string;
  uninstallCommand?: string;
  updateCommand?: string;
  testCommand?: string;
}

export interface HardwareRequirements {
  minVRAM?: Bytes;
  recommendedVRAM?: Bytes;
  minRAM?: Bytes;
  recommendedRAM?: Bytes;
  minCPUCores?: number;
  gpu?: boolean;
  gpuVendor?: ("nvidia" | "amd" | "intel" | "apple")[];
  cudaCompute?: string;
  os?: string[];
}

export interface ProviderDependency {
  providerId: UniqueId;
  version?: string;
  optional: boolean;
}

// ─── Adapter Types ───────────────────────────────────────────────────────────

export interface AdapterConfig {
  executablePath?: FilePath;
  workingDirectory?: FilePath;
  timeout?: Duration;
  retries?: number;
  env?: Record<string, string>;
  args?: string[];
}

export interface AdapterResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
  duration: Duration;
  provider: UniqueId;
  command?: string;
  output?: string;
}

export interface AdapterCapability {
  name: string;
  supported: boolean;
  quality: Score;
  speed: Score;
  limitations?: string[];
}

// ─── Media Model Types ───────────────────────────────────────────────────────

export interface Vector2D { x: number; y: number; }
export interface Vector3D { x: number; y: number; z: number; }
export interface Color { r: number; g: number; b: number; a?: number; }
export interface Rect { x: number; y: number; width: number; height: number; }

export interface Transform {
  position: Vector2D;
  scale: Vector2D;
  rotation: number;
  anchor: Vector2D;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  skew: Vector2D;
}

export interface Crop {
  top: number;
  right: number;
  bottom: number;
  left: number;
  angle?: number;
}

export interface UniversalProject {
  id: UniqueId;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version: number;
  sequences: UniversalSequence[];
  assets: UniqueId[];
  metadata: ProjectMetadata;
  bible?: ProjectBible;
  styleDNA?: CreativeDNA;
  platform: Platform;
  aspectRatio: AspectRatio;
  resolution: { width: number; height: number };
  fps: number;
}

export interface ProjectMetadata {
  tags?: string[];
  genre?: string;
  language?: string;
  customFields?: Record<string, unknown>;
}

export interface UniversalSequence {
  id: UniqueId;
  name: string;
  tracks: UniversalTrack[];
  duration: Duration;
  fps: number;
  resolution: { width: number; height: number };
  locked: boolean;
}

export interface UniversalTrack {
  id: UniqueId;
  name: string;
  type: MediaType;
  clips: UniversalClip[];
  muted: boolean;
  solo: boolean;
  volume: number;
  locked: boolean;
  order: number;
}

export interface UniversalClip {
  id: UniqueId;
  source: UniqueId;
  type: MediaType;
  name?: string;
  start: Duration;
  end: Duration;
  inPoint: Duration;
  outPoint: Duration;
  duration: Duration;
  track: UniqueId;
  transform: Transform;
  crop?: Crop;
  opacity: number;
  effects: UniversalEffect[];
  transitions: UniversalTransition[];
  keyframes: UniversalKeyframe[];
  audio?: UniversalAudioClip;
  speed: number;
  reversed: boolean;
  locked: boolean;
  metadata?: Record<string, unknown>;
}

export interface UniversalAudioClip {
  id: UniqueId;
  source: UniqueId;
  volume: number;
  pan: number;
  muted: boolean;
  effects: UniversalEffect[];
  fadeIn?: Duration;
  fadeOut?: Duration;
  eq?: EqualizerSettings;
  compression?: CompressionSettings;
}

export interface EqualizerSettings {
  bands: { frequency: number; gain: number; q: number }[];
}

export interface CompressionSettings {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
}

export interface UniversalEffect {
  id: UniqueId;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
  order: number;
}

export interface UniversalTransition {
  id: UniqueId;
  type: TransitionType;
  duration: Duration;
  parameters?: Record<string, unknown>;
  clipIdA?: UniqueId;
  clipIdB?: UniqueId;
}

export interface UniversalKeyframe {
  id: UniqueId;
  time: Duration;
  property: string;
  value: number | string | Vector2D | Color;
  interpolation: "linear" | "bezier" | "step" | "ease_in" | "ease_out" | "ease_in_out";
  handles?: { in: Vector2D; out: Vector2D };
}

export interface UniversalAnimation {
  id: UniqueId;
  name: string;
  target: UniqueId;
  property: string;
  keyframes: UniversalKeyframe[];
  duration: Duration;
  loop: boolean;
  easing: string;
}

export interface UniversalCamera {
  id: UniqueId;
  type: ShotType;
  movement: CameraMovement;
  focalLength?: number;
  aperture?: number;
  position: Vector3D;
  lookAt: Vector3D;
  up: Vector3D;
}

export interface UniversalColorGrade {
  id: UniqueId;
  name: string;
  lut?: FilePath;
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  hueShift: number;
  curves?: { r: Vector2D[]; g: Vector2D[]; b: Vector2D[]; master: Vector2D[] };
  colorWheels?: { lift: Color; gamma: Color; gain: Color; offset: Color };
}

export interface UniversalMarker {
  id: UniqueId;
  time: Duration;
  duration?: Duration;
  name: string;
  color: string;
  notes?: string;
  type: "chapter" | "cue" | "todo" | "sync" | "custom";
}

export interface UniversalCaption {
  id: UniqueId;
  text: string;
  start: Duration;
  end: Duration;
  style: CaptionStyle;
  position: Vector2D;
  animation?: string;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: Color;
  backgroundColor?: Color;
  borderColor?: Color;
  borderWidth?: number;
  padding?: number;
  borderRadius?: number;
  shadow?: { color: Color; offsetX: number; offsetY: number; blur: number };
  highlightWords?: boolean;
  highlightColor?: Color;
  wordByWord?: boolean;
}

export interface UniversalMask {
  id: UniqueId;
  type: "rectangle" | "ellipse" | "polygon" | "freehand" | "image";
  points?: Vector2D[];
  feather?: number;
  invert?: boolean;
  imageSource?: UniqueId;
}

// ─── Timeline Export Types ───────────────────────────────────────────────────

export interface TimelineExportResult {
  format: string;
  file: FilePath;
  supported: string[];
  converted: string[];
  approximated: string[];
  unsupported: string[];
  warnings: string[];
}

// ─── Action Types ────────────────────────────────────────────────────────────

export interface ActionDefinition {
  id: UniqueId;
  name: string;
  capability: UniqueId;
  inputs: ActionInput[];
  outputs: ActionOutput[];
  providers: UniqueId[];
  fallbacks: UniqueId[];
  resourceRequirements: CapabilityRequirements;
  risk: "low" | "medium" | "high" | "critical";
  reversible: boolean;
  validation?: (input: unknown) => boolean;
}

export interface ActionInput {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ActionOutput {
  name: string;
  type: string;
  description?: string;
}

// ─── Workflow Types ──────────────────────────────────────────────────────────

export interface WorkflowDefinition {
  id: UniqueId;
  name: string;
  version: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  provider: UniqueId;
  models: UniqueId[];
  inputs: WorkflowInput[];
  outputs: WorkflowOutput[];
  hardware: HardwareRequirements;
  license: LicenseInfo;
  dependencies: string[];
  quality: Score;
  speed: Score;
  status: FeatureStatus;
}

export interface WorkflowNode {
  id: UniqueId;
  type: string;
  name: string;
  provider: UniqueId;
  config: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  from: UniqueId;
  fromPort: string;
  to: UniqueId;
  toPort: string;
}

export interface WorkflowInput {
  name: string;
  type: string;
  default?: unknown;
  required: boolean;
}

export interface WorkflowOutput {
  name: string;
  type: string;
}

// ─── Production Graph Types ──────────────────────────────────────────────────

export interface ProductionNode {
  id: UniqueId;
  type: string;
  name: string;
  capability: UniqueId;
  status: TaskStatus;
  inputs: UniqueId[];
  outputs: UniqueId[];
  config: Record<string, unknown>;
  provider?: UniqueId;
  estimatedDuration?: Duration;
  actualDuration?: Duration;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  error?: string;
  retries: number;
  maxRetries: number;
}

export interface ProductionEdge {
  from: UniqueId;
  to: UniqueId;
  type: "data" | "dependency" | "trigger";
}

export interface ProductionGraph {
  id: UniqueId;
  name: string;
  nodes: ProductionNode[];
  edges: ProductionEdge[];
  status: TaskStatus;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  error?: string;
}

// ─── Creative Specification Types ────────────────────────────────────────────

export interface CreativeSpecification {
  platform: Platform;
  duration: Duration;
  aspectRatio: AspectRatio;
  resolution: { width: number; height: number };
  fps: number;
  style: string;
  pacing: Pacing;
  storyStructure: StoryStructure;
  visualStyle: VisualStyle;
  animation: AnimationStyle;
  audio: AudioStyle;
  captions: CaptionSpecification;
  color: ColorSpecification;
  effects: string[];
  qualityTarget: QualityPreset;
  customParameters?: Record<string, unknown>;
}

export interface StoryStructure {
  hook: { duration: Duration; description: string };
  setup: { duration: Duration; description: string };
  development: { duration: Duration; description: string };
  payoff: { duration: Duration; description: string };
  cta?: { duration: Duration; description: string };
  scenes: SceneDescription[];
}

export interface SceneDescription {
  id: UniqueId;
  name: string;
  duration: Duration;
  description: string;
  shots: ShotDescription[];
  audio: string;
  mood: string;
}

export interface ShotDescription {
  id: UniqueId;
  camera: ShotType;
  movement: CameraMovement;
  duration: Duration;
  description: string;
  transition?: TransitionType;
  transitionDuration?: Duration;
}

export interface VisualStyle {
  colorPalette?: Color[];
  contrast: "low" | "medium" | "high";
  saturation: "desaturated" | "normal" | "vibrant";
  brightness: "dark" | "normal" | "bright";
  grain?: number;
  vignette?: number;
  sharpen?: number;
  references?: URL[];
}

export interface AnimationStyle {
  titles: "none" | "minimal" | "moderate" | "heavy";
  lowerThirds: boolean;
  kineticTypography: boolean;
  motionPaths: boolean;
  transitions: TransitionType[];
  zoomFrequency: "none" | "low" | "medium" | "high";
}

export interface AudioStyle {
  music: "none" | "background" | "prominent" | "foreground";
  sfx: "none" | "minimal" | "moderate" | "heavy";
  voiceover: boolean;
  ambient: boolean;
  dynamicRange: "compressed" | "normal" | "wide";
}

export interface CaptionSpecification {
  enabled: boolean;
  style?: CaptionStyle;
  position?: "top" | "center" | "bottom";
  animation?: "none" | "fade" | "pop" | "typewriter" | "word_by_word" | "karaoke";
  language?: string;
}

export interface ColorSpecification {
  grade?: string;
  lut?: FilePath;
  temperature?: number;
  tint?: number;
  contrast?: number;
  saturation?: number;
}

// ─── Style / DNA Types ───────────────────────────────────────────────────────

export interface CreativeDNA {
  editing: EditingDNA;
  pacing: PacingDNA;
  motion: MotionDNA;
  color: ColorDNA;
  audio: AudioDNA;
  typography: TypographyDNA;
  camera: CameraDNA;
  animation: AnimationDNA;
  narrative: NarrativeDNA;
  platform: PlatformDNA;
}

export interface EditingDNA {
  averageShotLength: number;
  medianShotLength: number;
  cutFrequency: number;
  brollDensity: number;
  transitionFrequency: number;
  transitionTypes: { type: TransitionType; probability: number }[];
}

export interface PacingDNA {
  tempo: Pacing;
  hookDuration: number;
  beatFrequency: number;
  silenceDensity: number;
  musicDensity: number;
  sfxDensity: number;
}

export interface MotionDNA {
  zoomFrequency: number;
  panFrequency: number;
  cameraMovement: { movement: CameraMovement; probability: number }[];
  motionIntensity: number;
}

export interface ColorDNA {
  averageBrightness: number;
  averageSaturation: number;
  averageContrast: number;
  colorTemperature: number;
  dominantColors: Color[];
  colorVariation: number;
}

export interface AudioDNA {
  musicPresence: number;
  sfxPresence: number;
  voicePresence: number;
  dynamicRange: number;
  loudness: number;
}

export interface TypographyDNA {
  captionDensity: number;
  captionAnimation: string;
  averageFontSize: number;
  fontCategory: string;
  textPosition: string;
  wordHighlighting: boolean;
}

export interface CameraDNA {
  shotDistribution: { type: ShotType; probability: number }[];
  movementDistribution: { movement: CameraMovement; probability: number }[];
  focalLengthRange: { min: number; max: number };
  staticPercentage: number;
}

export interface AnimationDNA {
  titleFrequency: number;
  lowerThirdFrequency: number;
  kineticTypography: number;
  motionGraphicsIntensity: number;
  transitionComplexity: number;
}

export interface NarrativeDNA {
  hookDuration: number;
  structure: string;
  dialogueRatio: number;
  visualStorytellingRatio: number;
  callToAction: boolean;
  ctaTiming: "early" | "middle" | "late" | "end";
}

export interface PlatformDNA {
  platform: Platform;
  aspectRatio: AspectRatio;
  resolution: { width: number; height: number };
  maxDuration: Duration;
  captionStyle: string;
  safeZones?: Rect;
}

// ─── Hardware Types ──────────────────────────────────────────────────────────

export interface HardwareProfile {
  os: string;
  osVersion: string;
  platform: string;
  arch: string;
  cpu: CPUInfo;
  gpus: GPUInfo[];
  totalRAM: Bytes;
  availableRAM: Bytes;
  diskSpace: DiskInfo;
  cudaAvailable: boolean;
  rocmAvailable: boolean;
  computeScore: Score;
  memoryScore: Score;
  videoScore: Score;
  aiScore: Score;
  recommendedModels: string[];
  recommendedWorkflows: string[];
}

export interface CPUInfo {
  model: string;
  cores: number;
  threads: number;
  speed: number;
  architecture: string;
}

export interface GPUInfo {
  name: string;
  vendor: "nvidia" | "amd" | "intel" | "apple" | "unknown";
  vram: Bytes;
  cudaCores?: number;
  computeCapability?: string;
  driverVersion?: string;
}

export interface DiskInfo {
  total: Bytes;
  available: Bytes;
  used: Bytes;
}

// ─── Memory / Learning Types ─────────────────────────────────────────────────

export interface UserPreference {
  key: string;
  value: unknown;
  category: string;
  confidence: number;
  learnedFrom: "explicit" | "implicit";
  count: number;
  lastUpdated: Timestamp;
}

export interface StyleProfile {
  id: UniqueId;
  name: string;
  source: "imported" | "learned" | "created" | "mixed";
  dna: CreativeDNA;
  sourceVideos?: string[];
  created: Timestamp;
  updated: Timestamp;
}

export interface FailureRecord {
  id: UniqueId;
  timestamp: Timestamp;
  provider: UniqueId;
  model?: string;
  capability: string;
  error: string;
  cause: string;
  hardware: string;
  solution?: string;
  resolved: boolean;
}

// ─── Project Bible Types ─────────────────────────────────────────────────────

export interface ProjectBible {
  characters: CharacterBible[];
  locations: LocationBible[];
  props: PropBible[];
  lighting: LightingProfile[];
  camera: CameraProfile[];
  color: ColorProfile[];
  audio: AudioProfile[];
  narrative: NarrativeProfile;
  style: StyleProfile[];
  constraints: string[];
  negativeRules: string[];
}

export interface CharacterBible {
  id: UniqueId;
  name: string;
  description: string;
  references: UniqueId[];
  appearance: {
    face?: string;
    body?: string;
    clothing?: string;
    accessories?: string[];
    colors?: Color[];
  };
  consistency: {
    embedding?: number[];
    referenceImages: UniqueId[];
    keyframes: UniqueId[];
  };
}

export interface LocationBible {
  id: UniqueId;
  name: string;
  description: string;
  references: UniqueId[];
  lighting: LightingProfile;
  objects: PropBible[];
}

export interface PropBible {
  id: UniqueId;
  name: string;
  description: string;
  references: UniqueId[];
}

export interface LightingProfile {
  type: string;
  intensity: number;
  temperature: number;
  direction: Vector3D;
  color: Color;
  shadows: "hard" | "soft" | "none";
}

export interface CameraProfile {
  defaultShot: ShotType;
  defaultMovement: CameraMovement;
  focalLength: number;
  style: string;
}

export interface ColorProfile {
  palette: Color[];
  grade: string;
  temperature: number;
  contrast: number;
  saturation: number;
}

export interface AudioProfile {
  musicGenre?: string;
  musicMood?: string;
  sfxStyle?: string;
  voiceStyle?: string;
  loudnessTarget?: number;
}

export interface NarrativeProfile {
  structure: string;
  tone: string;
  pacing: Pacing;
  dialogueStyle?: string;
}

// ─── Event Types ─────────────────────────────────────────────────────────────

export interface SystemEvent {
  type: string;
  timestamp: Timestamp;
  source: string;
  data: Record<string, unknown>;
  id: UniqueId;
}

// ─── Configuration Types ─────────────────────────────────────────────────────

export interface SystemConfig {
  dataDirectory: FilePath;
  cacheDirectory: FilePath;
  modelDirectory: FilePath;
  projectDirectory: FilePath;
  logLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  maxConcurrentTasks: number;
  maxVRAMUsage: number;
  maxRAMUsage: number;
  autoHealthCheck: boolean;
  healthCheckInterval: Duration;
  defaultQuality: QualityPreset;
  offlineMode: boolean;
  proxyEnabled: boolean;
  proxyUrl?: string;
  licenseAgreed: Record<string, boolean>;
}

// ─── Database Record Types ───────────────────────────────────────────────────

export interface DBRecord {
  id: UniqueId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
