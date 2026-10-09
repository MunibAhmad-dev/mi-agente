// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Core Types
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Project Types ────────────────────────────────────────────────────────────

export type ProjectStatus = 'created' | 'analyzing' | 'building' | 'testing' | 'repairing' | 'completed' | 'failed' | 'paused';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  input: ProjectInput;
  config: ProjectConfig;
  designDNA: DesignDNA | null;
  pageKnowledgeGraph: PageKnowledgeGraph | null;
  iterations: Iteration[];
  currentIteration: number;
  maxIterations: number;
  scores: ReconstructionScore[];
  agents: AgentAssignment[];
  memory: ProjectMemory;
  createdAt: string;
  updatedAt: string;
}

export type InputType = 'url' | 'screenshot' | 'multi-screenshot' | 'video' | 'figma' | 'codebase' | 'description';

export interface ProjectInput {
  type: InputType;
  sources: InputSource[];
  viewport: Viewport;
}

export interface InputSource {
  id: string;
  type: InputType;
  path?: string;       // local file path
  url?: string;         // URL to analyze
  data?: Buffer;        // raw data (screenshot, video frame)
  metadata?: Record<string, any>;
}

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface ProjectConfig {
  targetFramework: 'html' | 'react' | 'vue' | 'svelte' | 'auto';
  cssFramework: 'tailwind' | 'css-modules' | 'styled-components' | 'auto' | 'none';
  maxIterations: number;
  qualityThreshold: number;  // 0-100
  enableAutoRepair: boolean;
  enableMultiAgent: boolean;
  enableSkillDiscovery: boolean;
  browserConfig: BrowserConfig;
}

export interface BrowserConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  viewport: Viewport;
  deviceScaleFactor: number;
  locale: string;
  timezone: string;
  userAgent?: string;
}

// ─── Agent Types ──────────────────────────────────────────────────────────────

export type AgentType =
  | 'supervisor'
  | 'research'
  | 'discovery'
  | 'browser'
  | 'vision'
  | 'design-forensics'
  | 'ui-architect'
  | 'frontend'
  | 'geometry'
  | 'typography'
  | 'color'
  | 'shadow'
  | 'asset'
  | 'responsive'
  | 'animation'
  | 'interaction'
  | 'visual-qa'
  | 'debug'
  | 'auto-repair'
  | 'security'
  | 'final-verification';

export type AgentStatus = 'idle' | 'busy' | 'waiting' | 'error' | 'completed';

export interface Agent {
  id: string;
  type: AgentType;
  name: string;
  status: AgentStatus;
  capabilities: string[];
  requiredSkills: string[];
  currentTask: TaskMessage | null;
  completedTasks: string[];
  metrics: AgentMetrics;
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  averageDuration: number;
  lastActive: string;
  tokensUsed: number;
  estimatedCost: number;
}

export interface AgentAssignment {
  agentType: AgentType;
  agentId: string;
  role: string;
  status: 'assigned' | 'working' | 'completed' | 'failed' | 'waiting';
  assignedAt: string;
  completedAt?: string;
}

// ─── Task Communication ───────────────────────────────────────────────────────

export type MessageType = 'TASK' | 'RESULT' | 'ERROR' | 'EVIDENCE' | 'REQUEST' | 'REVIEW' | 'APPROVAL' | 'REJECTION' | 'STATUS';

export interface TaskMessage {
  id: string;
  type: MessageType;
  from: AgentType;
  to: AgentType;
  taskId: string;
  payload: any;
  evidence?: Evidence[];
  timestamp: string;
}

export interface Evidence {
  type: 'screenshot' | 'diff' | 'metric' | 'log' | 'file' | 'code';
  description: string;
  path?: string;
  data?: any;
  score?: number;
}

// ─── Skill Types ──────────────────────────────────────────────────────────────

export type SkillStatus = 'AVAILABLE' | 'ACTIVE' | 'DISABLED' | 'EXPERIMENTAL' | 'DEPRECATED' | 'FAILED' | 'BLOCKED';

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  category: SkillCategory;
  capabilities: string[];
  inputs: SkillIO[];
  outputs: SkillIO[];
  dependencies: string[];
  tools: string[];
  models: string[];
  license: string;
  source: string;
  benchmark: SkillBenchmark;
  confidence: number;
  cost: number;
  runtime: 'node' | 'python' | 'browser' | 'hybrid';
  platform: 'all' | 'windows' | 'macos' | 'linux';
  status: SkillStatus;
  adapter?: SkillAdapter;
}

export type SkillCategory =
  | 'vision'
  | 'browser'
  | 'code-generation'
  | 'analysis'
  | 'comparison'
  | 'testing'
  | 'repair'
  | 'research'
  | 'security'
  | 'utility';

export interface SkillIO {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface SkillBenchmark {
  accuracy: number;
  speed: number;
  memory: number;
  cost: number;
  reliability: number;
  compatibility: number;
  visualQuality: number;
}

export interface SkillAdapter {
  from: string;   // external skill source
  to: string;     // internal skill interface
  transform: (input: any) => any;
}

// ─── Tool Types ───────────────────────────────────────────────────────────────

export type ToolCategory = 'browser' | 'filesystem' | 'image' | 'code' | 'git' | 'network' | 'database' | 'testing';

export interface Tool {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  version: string;
  capabilities: string[];
  config: Record<string, any>;
  status: 'available' | 'configured' | 'error';
}

// ─── Model Types ──────────────────────────────────────────────────────────────

export type ModelTask = 'VISION' | 'CODING' | 'REASONING' | 'PLANNING' | 'OCR' | 'CLASSIFICATION' | 'FAST_TASK';

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'local' | 'ollama' | 'custom';

export interface Model {
  id: string;
  name: string;
  provider: ModelProvider;
  capabilities: ModelTask[];
  contextWindow: number;
  costPerToken: number;
  latency: number;
  quality: number;
  status: 'available' | 'configured' | 'unavailable';
  config?: Record<string, any>;
}

// ─── Design DNA Types ─────────────────────────────────────────────────────────

export interface DesignDNA {
  version: string;
  viewport: Viewport;
  colors: ColorPalette;
  typography: TypographySystem;
  spacing: SpacingSystem;
  layout: LayoutSystem;
  components: ComponentDefinition[];
  shadows: ShadowDefinition[];
  borders: BorderDefinition[];
  radii: RadiusDefinition[];
  assets: AssetDefinition[];
  animations: AnimationDefinition[];
  responsive: ResponsiveDefinition[];
  states: StateDefinition[];
  interactions: InteractionDefinition[];
  screens: ScreenDefinition[];
}

export interface ColorPalette {
  primary: string[];
  secondary: string[];
  accent: string[];
  neutral: string[];
  background: string[];
  text: string[];
  border: string[];
  semantic: Record<string, string>;
  custom: Record<string, string>;
  gradients: GradientDefinition[];
}

export interface GradientDefinition {
  id: string;
  type: 'linear' | 'radial' | 'conic';
  stops: { color: string; position: number }[];
  angle?: number;
}

export interface TypographySystem {
  fontFamilies: FontFamily[];
  fontSizes: { name: string; value: string; px: number }[];
  fontWeights: { name: string; value: number }[];
  lineHeights: { name: string; value: number }[];
  letterSpacings: { name: string; value: string }[];
}

export interface FontFamily {
  name: string;
  fallbacks: string[];
  weights: number[];
  source?: string;
}

export interface SpacingSystem {
  unit: number;
  scale: { name: string; value: number; px: number }[];
  gaps: { name: string; value: number }[];
}

export interface LayoutSystem {
  display: string[];
  position: string[];
  grid: GridDefinition[];
  flex: FlexDefinition[];
  container: ContainerDefinition[];
}

export interface GridDefinition {
  id: string;
  columns: string;
  rows?: string;
  gap: string;
}

export interface FlexDefinition {
  id: string;
  direction: string;
  justify: string;
  align: string;
  gap: string;
}

export interface ContainerDefinition {
  id: string;
  maxWidth: string;
  padding: string;
  margin: string;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  type: string;
  selector?: string;
  bbox: BBox;
  styles: Record<string, string>;
  children: string[];
  states: string[];
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShadowDefinition {
  id: string;
  type: 'box' | 'text';
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadRadius: number;
  color: string;
  opacity: number;
}

export interface BorderDefinition {
  id: string;
  width: string;
  style: string;
  color: string;
}

export interface RadiusDefinition {
  id: string;
  value: string;
}

export interface AssetDefinition {
  id: string;
  type: 'image' | 'svg' | 'icon' | 'font' | 'video' | 'background';
  url: string;
  localPath?: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface AnimationDefinition {
  id: string;
  name: string;
  type: 'transition' | 'keyframe';
  property: string;
  duration: string;
  timingFunction: string;
  delay?: string;
  keyframes?: Record<string, Record<string, string>>;
}

export interface ResponsiveDefinition {
  breakpoint: number;
  layout: LayoutOverride[];
  visibility: Record<string, boolean>;
}

export interface LayoutOverride {
  component: string;
  property: string;
  value: string;
}

export interface StateDefinition {
  component: string;
  state: string;
  styles: Record<string, string>;
}

export interface InteractionDefinition {
  component: string;
  event: string;
  action: string;
  target?: string;
}

export interface ScreenDefinition {
  id: string;
  name: string;
  route: string;
  components: string[];
  viewport: Viewport;
  screenshot?: string;
}

// ─── Page Knowledge Graph Types ───────────────────────────────────────────────

export interface PageKnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: 'page' | 'component' | 'element' | 'state' | 'route';
  label: string;
  data: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'contains' | 'links_to' | 'opens' | 'closes' | 'triggers' | 'depends_on' | 'renders' | 'navigates_to';
}

// ─── Iteration Types ──────────────────────────────────────────────────────────

export interface Iteration {
  number: number;
  startedAt: string;
  completedAt?: string;
  changes: FileChange[];
  score: ReconstructionScore | null;
  agentActions: AgentAction[];
  errors: IterationError[];
  status: 'running' | 'completed' | 'failed';
}

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
  diff?: string;
}

export interface AgentAction {
  agent: AgentType;
  action: string;
  duration: number;
  result: 'success' | 'failure' | 'partial';
  details: string;
}

export interface IterationError {
  agent: AgentType;
  error: string;
  stack?: string;
  recoverable: boolean;
}

// ─── Score Types ──────────────────────────────────────────────────────────────

export interface ReconstructionScore {
  iteration: number;
  timestamp: string;
  overall: number;
  pixel: number;
  visual: number;
  layout: number;
  geometry: number;
  color: number;
  typography: number;
  shadow: number;
  asset: number;
  responsive: number;
  interaction: number;
  animation: number;
  accessibility: number;
  security: number;
  diffs: ScoreDiff[];
}

export interface ScoreDiff {
  region: string;
  type: 'pixel' | 'layout' | 'color' | 'typography' | 'geometry' | 'shadow';
  severity: 'minor' | 'moderate' | 'major';
  description: string;
  coordinates?: BBox;
  suggestedFix?: string;
  agent?: AgentType;
}

// ─── Visual Comparison Types ──────────────────────────────────────────────────

export interface VisualDiffResult {
  score: number;
  diffImagePath: string;
  heatmapPath?: string;
  regions: DiffRegion[];
  pixelDiffCount: number;
  totalPixels: number;
}

export interface DiffRegion {
  id: string;
  bbox: BBox;
  severity: 'minor' | 'moderate' | 'major';
  type: string;
  description: string;
  colorDiff?: { r: number; g: number; b: number };
}

// ─── Memory Types ─────────────────────────────────────────────────────────────

export interface ProjectMemory {
  projectId: string;
  lessons: Lesson[];
  decisions: Decision[];
  errors: MemoryError[];
  solutions: Solution[];
  benchmarks: BenchmarkResult[];
}

export interface Lesson {
  id: string;
  category: string;
  content: string;
  source: string;
  confidence: number;
  timestamp: string;
}

export interface Decision {
  id: string;
  context: string;
  options: string[];
  chosen: string;
  reasoning: string;
  outcome: 'success' | 'failure';
  timestamp: string;
}

export interface MemoryError {
  id: string;
  error: string;
  rootCause: string;
  solution: string;
  skill?: string;
  tool?: string;
  model?: string;
  timestamp: string;
}

export interface Solution {
  id: string;
  problem: string;
  approach: string;
  result: string;
  confidence: number;
  reusable: boolean;
  timestamp: string;
}

export interface BenchmarkResult {
  id: string;
  target: string;
  score: number;
  iteration: number;
  duration: number;
  timestamp: string;
}

// ─── API Types ────────────────────────────────────────────────────────────────

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface WSMessage {
  type: string;
  projectId?: string;
  data: any;
  timestamp: string;
}
