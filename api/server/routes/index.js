const accessPermissions = require('./accessPermissions');
const assistants = require('./assistants');
const categories = require('./categories');
const adminAuth = require('./admin/auth');
const adminConfig = require('./admin/config');
const adminGrants = require('./admin/grants');
const adminGroups = require('./admin/groups');
const adminRoles = require('./admin/roles');
const adminSkills = require('./admin/skills');
const adminUsers = require('./admin/users');
const adminAuditLog = require('./admin/audit');
const endpoints = require('./endpoints');
const staticRoute = require('./static');
const messages = require('./messages');
const memories = require('./memories');
const presets = require('./presets');
const projects = require('./projects');
const prompts = require('./prompts');
const skills = require('./skills');
const balance = require('./balance');
const actions = require('./actions');
const apiKeys = require('./apiKeys');
const banner = require('./banner');
const search = require('./search');
const universalSearch = require('./universalSearch');
const models = require('./models');
const convos = require('./convos');
const config = require('./config');
const agents = require('./agents');
const roles = require('./roles');
const oauth = require('./oauth');
const files = require('./files');
const share = require('./share');
const tags = require('./tags');
const auth = require('./auth');
const keys = require('./keys');
const user = require('./user');
const mcp = require('./mcp');
const rum = require('./rum');
const connectors = require('./connectors');
const comfyui = require('./comfyui');
const discovery = require('./discovery');
const marketplace = require('./marketplace');
const enterprise = require('./enterprise');
const sandbox = require('./sandbox');
const multiagent = require('./multiagent');
const autoConfig = require('./auto-config');
const rag = require('./rag');
const context = require('./context');
const scheduler = require('./scheduler');
const huggingface = require('./huggingface');
const settings = require('./settings');
// FASE 49 (auditoría): rutas que se montaban directamente en api/server/index.js
// se consolidan en el registry para tener UN solo patrón de registro.
const metrics = require('./metrics');
const telemetry = require('./telemetry');
const system = require('./system');
const performance = require('./performance');
const panel = require('./panel');
const tools = require('./tools');
const localModels = require('./localModels');
const aiRuntimes = require('./aiRuntimes');
const vision = require('./vision');
const ollamaProxy = require('./ollamaProxy');
const streak = require('./streak');
const sounds = require('./sounds');
const agentRuntime = require('./agentRuntime');
const skillsRegistry = require('./skillsRegistry');
const harness = require('./harness');
const workflows = require('./workflows');
const executiveLoop = require('./executiveLoop');
const research = require('./research');
const providerKeys = require('./providerKeys');
const webllm = require('./webllm');
const adminConstitution = require('./admin/constitution');
const learning = require('./learning');
const security = require('./security');
const fineTuning = require('./fineTuning');
const llmRouter = require('./llmRouter');
const cloner = require('./cloner');
const reputation = require('./reputation');
const ingestion = require('./ingestion');
const creative = require('./creative');
const creativeEngine = require('./creativeEngine');
const cognitive = require('./cognitive');
const visualIntelligence = require('./visualIntelligence');
const selfImprovement = require('./selfImprovement');
const capability = require('./capability');
const economy = require('./economy');
const webhooks = require('./webhooks');
const researchOS = require('./researchOS');
const socialIntelligence = require('./socialIntelligence');
// FASE 2-7: Integration Architecture, ModelRouter, ModelCatalog, AgentEngine
const integration = require('./integration');
const modelRouter = require('./modelRouter');
const modelCatalog = require('./modelCatalog');
const agentEngine = require('./agentEngine');
// New faces — CognitiveBehavior, IntelligenceEngines, SecurityScan
const cognitiveBehavior = require('./cognitiveBehavior');
const intelligenceEngines = require('./intelligenceEngines');
const securityScan = require('./securityScan');
const hardware = require('./hardware');
const dashboard = require('./dashboard');
const marketing = require('./marketing');
const socialMarketing = require('./social');
// Gen B Universal Agent phases 1-20
const universalAgent = require('./universalAgent');
// Gen B batch routes (phases 21-53)
const universalAgentBatchA = require('./universalAgentBatchA');
const universalAgentBatchB = require('./universalAgentBatchB');
const universalAgentBatchC = require('./universalAgentBatchC');
const universalAgentBatchD = require('./universalAgentBatchD');
const universalAgentBatchE = require('./universalAgentBatchE');
const universalAgentBatchF = require('./universalAgentBatchF');
const capabilities = require('./capabilities');
const executiveAi = require('./executive-ai');
const autonomousLearning = require('./autonomous-learning');
const capabilityDiscovery = require('./capability-discovery');
const selfLearning = require('./self-learning');
const modelDiscovery = require('./modelDiscovery');
const iaModelos = require('./iaModelos');

module.exports = {
  rum,
  mcp,
  connectors,
  comfyui,
  discovery,
  marketplace,
  auth,
  adminAuth,
  adminConfig,
  adminGrants,
  adminGroups,
  adminRoles,
  adminSkills,
  adminUsers,
  adminAuditLog,
  keys,
  apiKeys,
  user,
  tags,
  roles,
  oauth,
  files,
  share,
  banner,
  agents,
  convos,
  search,
  universalSearch,
  config,
  models,
  prompts,
  projects,
  skills,
  actions,
  presets,
  balance,
  messages,
  memories,
  endpoints,
  assistants,
  categories,
  staticRoute,
  accessPermissions,
  enterprise,
  sandbox,
  multiagent,
  autoConfig,
  rag,
  context,
  scheduler,
  huggingface,
  settings,
  metrics,
  telemetry,
  system,
  performance,
  panel,
  tools,
  localModels,
  aiRuntimes,
  vision,
  ollamaProxy,
  streak,
  sounds,
  agentRuntime,
  skillsRegistry,
  harness,
  workflows,
  executiveLoop,
  research,
  providerKeys,
  webllm,
  adminConstitution,
  learning,
  security,
  fineTuning,
  llmRouter,
  cloner,
  reputation,
  ingestion,
  creative,
  creativeEngine,
  cognitive,
  visualIntelligence,
  integration,
  modelRouter,
  modelCatalog,
  agentEngine,
  selfImprovement,
  capability,
  economy,
  webhooks,
  researchOS,
  socialIntelligence,
  cognitiveBehavior,
  intelligenceEngines,
  securityScan,
  hardware,
  dashboard,
  marketing,
  socialMarketing,
  universalAgent,
  universalAgentBatchA,
  universalAgentBatchB,
  universalAgentBatchC,
  universalAgentBatchD,
  universalAgentBatchE,
  universalAgentBatchF,
  capabilities,
  executiveAi,
  autonomousLearning,
  capabilityDiscovery,
  selfLearning,
  modelDiscovery,
  iaModelos,
};
