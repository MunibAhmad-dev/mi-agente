const { generatePlan } = require('./planner');
const { resolveMissingCapabilities } = require('./skillResolver');
const { runToolCallLoop } = require('./toolCallLoop');
const { architectPlanSchema, MAX_AGENTS } = require('./schemas');
const { analyzeComplexity, buildTierGuidance, TIERS } = require('./complexity');
const {
  mapRoleToCapabilities,
  matchToolsToCapabilities,
  selectToolsForAgent,
  discoverCapabilitiesForPlan,
} = require('./capabilityDiscovery');
const {
  capabilitiesForOllamaModel,
  estimateSizeFromName,
  fetchOllamaModels,
  buildModelRegistryFromOllama,
  routeModelForAgent,
  routePlanToModels,
  routePlanWithOllamaModels,
} = require('./modelRouter');
const {
  estimateTokens,
  relevanceScore,
  deduplicateItems,
  compressToBudget,
  buildAgentContext,
  fetchContextForAgent,
  DEFAULT_BUDGET_TOKENS,
} = require('./contextManager');
const {
  deepResearch,
  decomposeQuestion,
  questionKeywords,
  collectSources,
  verifySubQueries,
  buildAnswer,
  buildFallbackAnswer,
  DEFAULT_MAX_SUBQUERIES,
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_EVIDENCE,
} = require('./deepResearch');

module.exports = {
  generatePlan,
  resolveMissingCapabilities,
  runToolCallLoop,
  architectPlanSchema,
  MAX_AGENTS,
  analyzeComplexity,
  buildTierGuidance,
  TIERS,
  mapRoleToCapabilities,
  matchToolsToCapabilities,
  selectToolsForAgent,
  discoverCapabilitiesForPlan,
  capabilitiesForOllamaModel,
  estimateSizeFromName,
  fetchOllamaModels,
  buildModelRegistryFromOllama,
  routeModelForAgent,
  routePlanToModels,
  routePlanWithOllamaModels,
  estimateTokens,
  relevanceScore,
  deduplicateItems,
  compressToBudget,
  buildAgentContext,
  fetchContextForAgent,
  DEFAULT_BUDGET_TOKENS,
  deepResearch,
  decomposeQuestion,
  questionKeywords,
  collectSources,
  verifySubQueries,
  buildAnswer,
  buildFallbackAnswer,
  DEFAULT_MAX_SUBQUERIES,
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_EVIDENCE,
};
