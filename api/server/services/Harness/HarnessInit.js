/**
 * HarnessInit — Production initializer for the Harness system.
 *
 * Handles:
 *   1. Loading environment variables
 *   2. Configuring providers from env
 *   3. Initializing HarnessManager
 *   4. Registering API routes with Express
 *   5. Connecting to existing EventBus
 *   6. Graceful shutdown
 *
 * Usage:
 *   const { initHarness } = require('./services/Harness/HarnessInit');
 *   const harness = await initHarness(app);
 */

const logger = {
  info: (...args) => console.info('[HarnessInit]', ...args),
  warn: (...args) => console.warn('[HarnessInit]', ...args),
  error: (...args) => console.error('[HarnessInit]', ...args),
};

/**
 * Build HarnessManager config from environment variables.
 */
function buildConfigFromEnv() {
  const fallbackChain = (process.env.LLM_FALLBACK_CHAIN || 'openai,xai')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return {
    // Provider config
    defaultProvider: process.env.LLM_DEFAULT_PROVIDER || 'openai',
    defaultModel: process.env.LLM_DEFAULT_MODEL || 'gpt-4o-mini',
    fallbackChain,

    // Harness config
    maxIterations: parseInt(process.env.HARNESS_MAX_ITERATIONS || '20', 10),
    timeout: parseInt(process.env.HARNESS_TIMEOUT || '300000', 10),
    temperature: parseFloat(process.env.HARNESS_TEMPERATURE || '0.7'),

    // Security
    enableSandbox: process.env.HARNESS_SANDBOX !== 'false',
    enableApproval: process.env.HARNESS_APPROVAL !== 'false',

    // Budget
    budgetLimitUSD: process.env.HARNESS_MAX_BUDGET_USD
      ? parseFloat(process.env.HARNESS_MAX_BUDGET_USD)
      : null,

    // Routing
    routingStrategy: process.env.HARNESS_ROUTING_STRATEGY || 'fallback',

    // Persistence
    checkpointDir: process.env.HARNESS_CHECKPOINT_DIR || null,
    memoryPersistDir: process.env.HARNESS_MEMORY_PERSIST_DIR || null,
  };
}

/**
 * Initialize the Harness system.
 *
 * @param {object} [app] - Express app (optional, for route registration)
 * @returns {Promise<HarnessManager>}
 */
async function initHarness(app) {
  const path = require('path');

  let HarnessManagerClass, createHarnessAPI;
  try {
    ({ getHarnessManager } = require(path.join(__dirname, 'index')));
    ({ createHarnessAPI } = require(path.join(__dirname, 'HarnessAPI')));
  } catch (error) {
    logger.error('[HarnessInit] Failed to load Harness modules:', error.message);
    throw error;
  }

  // Build config
  const config = buildConfigFromEnv();
  logger.info('[HarnessInit] Config:', JSON.stringify({
    provider: config.defaultProvider,
    model: config.defaultModel,
    chain: config.fallbackChain.join(' → '),
    strategy: config.routingStrategy,
  }));

  // Create singleton
  const harness = getHarnessManager(config);

  // Initialize
  await harness.initialize();

  // Register API keys from env
  if (harness.security) {
    if (process.env.OPENAI_API_KEY) {
      harness.security.setApiKey('openai', process.env.OPENAI_API_KEY);
      logger.info('[HarnessInit] OpenAI API key registered');
    }
    if (process.env.XAI_API_KEY) {
      harness.security.setApiKey('xai', process.env.XAI_API_KEY);
      logger.info('[HarnessInit] xAI API key registered');
    }
    if (process.env.GITHUB_TOKEN) {
      harness.security.setApiKey('github', process.env.GITHUB_TOKEN);
    }
    if (process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN) {
      harness.security.setApiKey('slack', process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN);
    }
  }

  // Register routes with Express
  if (app && typeof app.use === 'function') {
    try {
      const router = createHarnessAPI(harness);
      app.use('/harness', router);
      logger.info('[HarnessInit] Routes registered at /harness/*');
    } catch (error) {
      logger.warn('[HarnessInit] Could not register routes:', error.message);
    }
  }

  // Log initial status
  const status = harness.getFullStatus();
  logger.info('[HarnessInit] System ready:');
  logger.info(`  Providers: ${status.providers.join(', ')}`);
  logger.info(`  Tools: ${harness.toolAdapter.getToolIds().length}`);
  logger.info(`  Connectors: ${status.connectors.length}`);
  logger.info(`  Memory: ${status.memory ? 'enabled' : 'disabled'}`);
  logger.info(`  DeepSearch: ${status.deepSearch ? 'enabled' : 'disabled'}`);
  logger.info(`  Orchestrator: ${status.orchestrator ? 'enabled' : 'disabled'}`);
  logger.info(`  Observability: ${status.observability ? 'enabled' : 'disabled'}`);
  logger.info(`  Cost tracking: ${status.costTracker ? 'enabled' : 'disabled'}`);
  logger.info(`  Security: ${status.security ? 'enabled' : 'disabled'}`);

  return harness;
}

/**
 * Graceful shutdown handler.
 */
function setupGracefulShutdown(harness) {
  const shutdown = async (signal) => {
    logger.info(`[HarnessInit] ${signal} received — shutting down gracefully`);

    // Cancel active sessions
    if (harness) {
      for (const [id] of harness.activeSessions) {
        harness.cancel(id);
      }
    }

    // Log final stats
    if (harness) {
      const stats = harness.getFullStatus();
      logger.info('[HarnessInit] Final stats:', JSON.stringify({
        runs: stats.harness?.totalRuns || 0,
        toolCalls: stats.harness?.totalToolCalls || 0,
        cost: stats.costTracker?.totals?.totalCostUSD || 0,
      }));
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { initHarness, buildConfigFromEnv, setupGracefulShutdown };
