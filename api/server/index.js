// OTel bootstrap — must be first so instrumentations patch modules before they load
require('../tracing');
const telemetry = require('./telemetry');
const fs = require('fs');
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..') });
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const express = require('express');
const passport = require('passport');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const { logger, runAsSystem, tenantStorage } = require('@librechat/data-schemas');

// ============================================================================
// SECURITY: CORS Configuration
// ============================================================================

/**
 * Configuración segura de CORS
 *
 * Permite configurar orígenes específicos via ALLOWED_ORIGINS
 * Soporta desarrollo local y producción
 */
const getCorsOptions = () => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : [];

  const corsOptions = {
    origin: function (origin, callback) {
      // Permitir requests sin origin (mobile apps, Postman, curl, etc.)
      if (!origin) {
        return callback(null, true);
      }

      const nodeEnv = process.env.NODE_ENV || 'development';

      // En desarrollo, permitir localhost
      if (nodeEnv === 'development') {
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
      }

      // En producción, verificar whitelist
      if (allowedOrigins.length > 0) {
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Permitir subdominios si endsWith
        for (const allowed of allowedOrigins) {
          if (origin.endsWith(allowed) || origin === `https://${allowed}`) {
            return callback(null, true);
          }
        }

        return callback(new Error('Origin not allowed by CORS policy'));
      }

      // Si no hay whitelist y no estamos en desarrollo, denegar
      if (nodeEnv === 'production') {
        return callback(new Error('CORS policy violation'));
      }

      // Por defecto, permitir
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Api-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400, // 24 hours
    preflightContinue: false,
  };

  return corsOptions;
};

const corsOptions = getCorsOptions();

/**
 * CORS con bypass same-origin: las peticiones cuyo Origin coincide con el Host de la
 * propia UI (localhost:3080, etc.) nunca se bloquean, aunque la whitelist (ALLOWED_ORIGINS)
 * no las liste. Solo las cross-origin reales pasan por la whitelist.
 */
const corsWithSameOriginBypass = (req, res, next) => {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host && (origin === `http://${host}` || origin === `https://${host}`)) {
    return next();
  }
  return cors(corsOptions)(req, res, next);
};

// ============================================================================
// SECURITY: Helmet.js Configuration
// ============================================================================

/**
 * Configuración completa de Helmet.js para headers de seguridad
 *
 * Headers configurados:
 * - Content-Security-Policy (CSP)
 * - X-Frame-Options (previene clickjacking)
 * - X-Content-Type-Options (previene MIME sniffing)
 * - X-XSS-Protection (filtro XSS legacy)
 * - Strict-Transport-Security (fuerza HTTPS)
 * - Referrer-Policy
 * - Permissions-Policy
 */
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      mediaSrc: ["'self'", 'https:', 'blob:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      ...(process.env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
    },
    reportOnly: process.env.NODE_ENV !== 'production',
  },
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
};

const {
  isEnabled,
  apiNotFound,
  createMetrics,
  ErrorController,
  memoryDiagnostics,
  performStartupChecks,
  handleJsonParseError,
  GenerationJobManager,
  QUERY_DEVTOOLS_HEADER,
  createStreamServices,
  deleteAgentCheckpoint,
  initializeFileStorage,
  initializeDeploymentSkills,
  loadToolApprovalHooks,
  maybeInjectQueryDevtoolsBootstrap,
  preAuthTenantMiddleware,
  setupGracefulShutdown,
  updateInterfacePermissions,
} = require('@librechat/api');
const { connectDb, indexSync } = require('~/db');
const {
  updateAccessPermissions,
  sweepOrphanedPreviews,
  getRoleByName,
  seedDatabase,
  seedDefaultRoles,
} = require('~/models');
const initializeOAuthReconnectManager = require('./services/initializeOAuthReconnectManager');
const { capabilityContextMiddleware } = require('./middleware/roles/capabilities');
const createValidateImageRequest = require('./middleware/validateImageRequest');
const { startExpiredFileSweep } = require('./services/Files/process');
const { initializeGitHubSkillSync } = require('./services/Skills/sync');
const { jwtLogin, ldapLogin, passportLogin } = require('~/strategies');
const { checkMigrations } = require('./services/start/migration');
const optionalJwtAuth = require('./middleware/optionalJwtAuth');
const initializeMCPs = require('./services/initializeMCPs');

// Phase G: wire file transport onto the main logger when LOG_TO_FILE is enabled
if (process.env.LOG_TO_FILE && process.env.LOG_TO_FILE.toLowerCase() !== 'false') {
  try {
    const winston = require('winston');
    const { logger: mainLogger } = require('@librechat/data-schemas');
    const logDir = process.env.LOG_DIR || 'logs';
    require('fs').mkdirSync(logDir, { recursive: true });
    mainLogger.add(
      new winston.transports.File({
        filename: require('path').join(logDir, 'app-error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
        tailable: true,
      }),
    );
    mainLogger.add(
      new winston.transports.File({
        filename: require('path').join(logDir, 'app-combined.log'),
        maxsize: 20 * 1024 * 1024,
        maxFiles: 7,
        tailable: true,
      }),
    );
  } catch (e) {
    // Non-fatal — app continues without file logging
  }
}
const configureSocialLogins = require('./socialLogins');
const createSpaFallback = require('./utils/fallback');
const { getAppConfig } = require('./services/Config');
const staticCache = require('./utils/staticCache');
const noIndex = require('./middleware/noIndex');
const routes = require('./routes');

const { PORT, HOST, ALLOW_SOCIAL_LOGIN, DISABLE_COMPRESSION, TRUST_PROXY } = process.env ?? {};

// Allow PORT=0 to be used for automatic free port assignment
const port = isNaN(Number(PORT)) ? 3080 : Number(PORT);
const host = HOST || 'localhost';
const trusted_proxy = Number(TRUST_PROXY) || 1; /* trust first proxy by default */

const app = express();
let serverReady = false;

const SERVER_NOT_READY_CODE = 'SERVER_NOT_READY';
const CHAT_START_RETRY_AFTER_SECONDS = '1';

const rejectChatStartsUntilReady = (req, res, next) => {
  if (serverReady || req.method !== 'POST' || req.path === '/abort') {
    return next();
  }

  res.set('Retry-After', CHAT_START_RETRY_AFTER_SECONDS);
  return res.status(503).json({
    code: SERVER_NOT_READY_CODE,
    error: 'Server is still starting. Please retry shortly.',
  });
};

const configureGenerationStreams = () => {
  const streamServices = createStreamServices();
  GenerationJobManager.configure({
    ...streamServices,
    cleanupOnComplete: !isEnabled(process.env.STREAM_KEEP_COMPLETED_JOBS),
  });
  GenerationJobManager.initialize();
  // Prune the paused run's durable checkpoint when its approval EXPIRES (periodic sweeper
  // or a stale submit) instead of leaving it until the Mongo TTL. streamId === conversationId
  // === the LangGraph thread_id. Config is resolved lazily per expiry so the prune always
  // targets the currently configured checkpoint collections.
  GenerationJobManager.setApprovalExpiredHandler(async (conversationId, job) => {
    // Resolve config in the PAUSED JOB's tenant/user scope — the expiry runs outside any
    // request context. Passing ids to getAppConfig only keys the cache; the Config query
    // itself is ALS-scoped by the tenant-isolation plugin, so ENTER the tenant context.
    await tenantStorage.run({ tenantId: job?.tenantId, userId: job?.userId }, async () => {
      const appConfig = await getAppConfig({ userId: job?.userId, tenantId: job?.tenantId });
      await deleteAgentCheckpoint(conversationId, appConfig?.endpoints?.agents?.checkpointer);
    });
  });
};

const startServer = async () => {
  const { metricsMiddleware, metricsRouter } = createMetrics();
  if (!process.env.METRICS_SECRET) {
    logger.warn('[metrics] METRICS_SECRET is not set - /metrics will return 401 for all requests');
  }

  if (typeof Bun !== 'undefined') {
    axios.defaults.headers.common['Accept-Encoding'] = 'gzip';
  }
  await connectDb();

  logger.info('Connected to MongoDB');
  indexSync().catch((err) => {
    logger.error('[indexSync] Background sync failed:', err);
  });

  app.disable('x-powered-by');
  app.set('trust proxy', trusted_proxy);

  if (isEnabled(process.env.TENANT_ISOLATION_STRICT)) {
    logger.warn(
      '[Security] TENANT_ISOLATION_STRICT is active. Ensure your reverse proxy strips or sets ' +
        'the X-Tenant-Id header — untrusted clients must not be able to set it directly.',
    );
  }

  await runAsSystem(seedDatabase);
  /* Seed ACL resource roles (AGENT_OWNER/EDITOR/VIEWER, etc.) required by the
   * permission system. This is idempotent — safe to run on every boot. */
  await runAsSystem(seedDefaultRoles).catch((err) => {
    logger.warn('[seedDefaultRoles] Failed to seed ACL roles:', err.message);
  });
  /* Recover stuck `status: 'pending'` records from a crash mid-render.
   * `runAsSystem` is required — `File` is tenant-isolated and strict
   * mode rejects unscoped queries. Lazy sweep in the preview endpoint
   * covers anything younger than the boot cutoff. */
  runAsSystem(sweepOrphanedPreviews).catch((err) => {
    logger.error('[sweepOrphanedPreviews] Background sweep failed:', err);
  });
  const appConfig = await getAppConfig({ baseOnly: true });
  initializeFileStorage(appConfig);
  await initializeDeploymentSkills({ projectRoot: path.resolve(__dirname, '../..') });
  initializeGitHubSkillSync(appConfig);
  startExpiredFileSweep({ appConfig, loadAppConfig: getAppConfig });
  // Register any programmatic tool-approval policy hooks declared in
  // `endpoints.agents.toolApproval.hooks`. Honor the `enabled` kill switch: when tool
  // approval is off we pass no hooks, so a disabled endpoint imports/runs nothing (and any
  // previously loaded batch is unregistered). Hooks are read from the BASE config only —
  // they register once, process-wide; per-user/tenant differences belong inside the hook
  // (via its context), not in per-override module lists.
  const toolApproval = appConfig?.endpoints?.agents?.toolApproval;
  await loadToolApprovalHooks(toolApproval?.enabled ? toolApproval.hooks : undefined, {
    basePath: path.resolve(__dirname, '../..'),
  });
  await runAsSystem(async () => {
    await performStartupChecks(appConfig);
    await updateInterfacePermissions({ appConfig, getRoleByName, updateAccessPermissions });
  });

  const indexPath = path.join(appConfig.paths.dist, 'index.html');
  let indexHTML = fs.readFileSync(indexPath, 'utf8');

  // In order to provide support to serving the application in a sub-directory
  // We need to update the base href if the DOMAIN_CLIENT is specified and not the root path
  if (process.env.DOMAIN_CLIENT) {
    const clientUrl = new URL(process.env.DOMAIN_CLIENT);
    const baseHref = clientUrl.pathname.endsWith('/')
      ? clientUrl.pathname
      : `${clientUrl.pathname}/`;
    if (baseHref !== '/') {
      logger.info(`Setting base href to ${baseHref}`);
      indexHTML = indexHTML.replace(/base href="\/"/, `base href="${baseHref}"`);
    }
  }

  const sendIndexHtml = (req, res) => {
    res.set({
      'Cache-Control': process.env.INDEX_CACHE_CONTROL || 'no-cache, no-store, must-revalidate',
      Pragma: process.env.INDEX_PRAGMA || 'no-cache',
      Expires: process.env.INDEX_EXPIRES || '0',
    });
    res.vary(QUERY_DEVTOOLS_HEADER);

    const lang = req.cookies.lang || req.headers['accept-language']?.split(',')[0] || 'en-US';
    const saneLang = lang.replace(/"/g, '&quot;');
    let updatedIndexHtml = indexHTML.replace(/lang="en-US"/g, `lang="${saneLang}"`);
    updatedIndexHtml = maybeInjectQueryDevtoolsBootstrap(updatedIndexHtml, req);

    res.type('html');
    res.send(updatedIndexHtml);
  };

  app.get('/health', async (_req, res) => {
    const mongoose = require('mongoose');
    const dbOk = mongoose.connection.readyState === 1;
    const uptimeSec = Math.floor(process.uptime());
    let redisOk = false;
    try {
      const { USE_REDIS } = process.env;
      if (USE_REDIS === 'true') {
        const getLogStores = require('../cache/getLogStores');
        const store = getLogStores('pendingRequests');
        await store?.get?.('__health__');
        redisOk = true;
      } else {
        redisOk = null; // not configured — not a failure
      }
    } catch {
      redisOk = false;
    }
    const healthy = dbOk;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'disconnected',
      redis: redisOk === null ? 'not_configured' : redisOk ? 'connected' : 'disconnected',
      uptime: uptimeSec,
    });
  });
  app.get('/livez', (_req, res) => res.status(200).send('OK'));
  app.get('/readyz', (_req, res) => {
    if (!serverReady) {
      return res.status(503).send('NOT_READY');
    }
    return res.status(200).send('OK');
  });

  /* Middleware */
  app.use(metricsMiddleware);
  app.use(noIndex);
  app.use(express.json({ limit: '3mb' }));
  app.use(express.urlencoded({ extended: true, limit: '3mb' }));
  app.use(handleJsonParseError);

  /**
   * Express 5 Compatibility: Make req.query writable for mongoSanitize
   * In Express 5, req.query is read-only by default, but express-mongo-sanitize needs to modify it
   */
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'query', {
      ...Object.getOwnPropertyDescriptor(req, 'query'),
      value: req.query,
      writable: true,
    });
    next();
  });

  app.use(mongoSanitize());
  app.use(corsWithSameOriginBypass); // ⚠️ Seguridad: CORS con whitelist + bypass same-origin
  app.use(helmet(helmetOptions)); // ⚠️ Seguridad: Helmet.js headers HTTP
  app.use(cookieParser());

  if (!isEnabled(DISABLE_COMPRESSION)) {
    app.use(
      compression({
        filter: (req, res) => {
          // FASE 17: el SSE de descarga de modelos locales (/api/local-models/*)
          // se excluye de la compresión — el progreso fluye en vivo sin buffer.
          // Se usa req.originalUrl (URL completa) porque req.path es relativo
          // al mount point del router dentro del que corre el middleware.
          if (req.originalUrl?.startsWith('/api/local-models/')) {
            return false;
          }
          return compression.filter(req, res);
        },
      }),
    );
  } else {
    console.warn('Response compression has been disabled via DISABLE_COMPRESSION.');
  }

  app.get('/index.html', sendIndexHtml);
  app.use(staticCache(appConfig.paths.dist));
  app.use(staticCache(appConfig.paths.fonts));
  app.use(staticCache(appConfig.paths.assets));

  if (telemetry.enabled) {
    app.use(telemetry.telemetryMiddleware);
  }

  if (!ALLOW_SOCIAL_LOGIN) {
    console.warn('Social logins are disabled. Set ALLOW_SOCIAL_LOGIN=true to enable them.');
  }

  /* OAUTH */
  app.use(passport.initialize());
  passport.use(jwtLogin());
  passport.use(passportLogin());

  /* LDAP Auth */
  if (process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE) {
    passport.use(ldapLogin);
  }

  if (isEnabled(ALLOW_SOCIAL_LOGIN)) {
    await configureSocialLogins(app);
  }

  /* Per-request capability cache — must be registered before any route that calls hasCapability */
  app.use(capabilityContextMiddleware);

  /* Pre-auth tenant context for unauthenticated routes that need tenant scoping.
   * The reverse proxy / auth gateway sets `X-Tenant-Id` header for multi-tenant deployments. */
  app.use('/oauth', preAuthTenantMiddleware, routes.oauth);
  /* API Endpoints */
  app.use('/api/auth', preAuthTenantMiddleware, routes.auth);
  app.use('/api/admin', routes.adminAuth);
  app.use('/api/admin/config', routes.adminConfig);
  app.use('/api/admin/grants', routes.adminGrants);
  app.use('/api/admin/groups', routes.adminGroups);
  app.use('/api/admin/roles', routes.adminRoles);
  app.use('/api/admin/skills', routes.adminSkills);
  app.use('/api/admin/users', routes.adminUsers);
  app.use('/api/admin/audit-log', routes.adminAuditLog);
  // Face 7: Agent Constitution (configurable system prompt)
  app.use('/api/admin/constitution', routes.adminConstitution);
  app.use('/api/actions', routes.actions);
  app.use('/api/keys', routes.keys);
  app.use('/api/api-keys', routes.apiKeys);
  app.use('/api/user', routes.user);
  app.use('/api/search', routes.search);
  app.use('/api/universal-search', routes.universalSearch);
  app.use('/api/messages', routes.messages);
  app.use('/api/convos', routes.convos);
  app.use('/api/presets', routes.presets);
  app.use('/api/projects', routes.projects);
  app.use('/api/prompts', routes.prompts);
  app.use('/api/skills', routes.skills);
  app.use('/api/categories', routes.categories);
  app.use('/api/endpoints', routes.endpoints);
  app.use('/api/balance', routes.balance);
  app.use('/api/models', routes.models);
  app.use('/api/models', routes.modelDiscovery);
  app.use('/api/ia-modelos', routes.iaModelos);
  app.use('/api/config', preAuthTenantMiddleware, optionalJwtAuth, routes.config);
  app.use('/api/assistants', routes.assistants);
  // Enterprise Architecture Routes (nueva arquitectura)
  app.use('/api/enterprise', routes.enterprise);

  // FASE 49 (auditoría): todas las rutas se montan vía el registry central
  // (routes/index.js) — un solo patrón de registro en todo el proyecto.

  // Métricas y Telemetry (FASE 9 & 10)
  app.use('/api/metrics', routes.metrics.router);
  app.use('/api/telemetry', routes.telemetry.router);
  app.use('/api', routes.system.router);

  // Performance (FASE 14)
  app.use('/api/performance', routes.performance.router);

  // Panel Enterprise (FASE D): rutas que el panel espera y no estaban montadas
  // (runtimes/execute, capabilities, workflows, cache, ratelimit) — servicios reales.
  app.use('/api', routes.panel);

  // Tools de mi-opencode (FASE D — D1/D2/D3): catálogo de tools, toggle en
  // config, sesiones y mensajes — proxy hacia el server real de mi-opencode.
  app.use('/api/tools', routes.tools);
  // Agent Runtime (Fases 5-15): expone firewall, memory, subagents,
  // observability, evaluation y optimization al frontend.
  app.use('/api/agent-runtime', routes.agentRuntime);

  // Skills Discovery (Fase 10): zona visible de skills/plugins/MCP en configuración.
  // Permite buscar, seleccionar, instalar y configurar skills. Auto-match conecta
  // al LLM para recomendar skills según la tarea del usuario.
  app.use('/api/config/skills-registry', routes.skillsRegistry);
  app.use('/api/harness', routes.harness);
  // Face 9: Agent Learning & Experience Replay
  app.use('/api/learning', routes.learning);
  // Face 11: Security Scanning & Self-Repair
  app.use('/api/security', routes.security);
  // Face 15-16: Fine-tuning & Dataset Builder
  app.use('/api/fine-tuning', routes.fineTuning);
  // Face 16: Self-Improvement Engine — propose, sandbox, benchmark, approve, deploy, rollback
  app.use('/api/self-improvement', routes.selfImprovement);
  // Face 17: Universal Cognitive System — model-agnostic LLM router
  app.use('/api/llm-router', routes.llmRouter);
  // Face 18: Website Cloning & Reverse Engineering
  app.use('/api/cloner', routes.cloner);
  // FASE 2 — Integration Architecture (unified facade)
  app.use('/api/integration', routes.integration);
  // FASE 3 — Multi-LLM Model Router (capability-based selection)
  app.use('/api/model-router', routes.modelRouter);
  // FASE 4 — Model Discovery + Benchmark
  app.use('/api/model-catalog', routes.modelCatalog);
  // FASE 6 — Agent Engine (18 specialist agents)
  app.use('/api/agent-engine', routes.agentEngine);
  // Face 19-20: Digital Reputation Monitoring
  app.use('/api/reputation', routes.reputation);
  // Face 21: Mass Document Ingestion + Knowledge Base Search
  app.use('/api/ingestion', routes.ingestion);
  // Face 22-23: Creative Engine — video generation (FFmpeg) + music (MusicGen/Suno)
  app.use('/api/creative', routes.creative);
  // Face 17: Universal Cognitive System — memory, knowledge, learning, RAG, etc.
  app.use('/api/cognitive', routes.cognitive);
  // Face 9: Visual Intelligence & Visual Software Engineering
  app.use('/api/visual-intelligence', routes.visualIntelligence);
  // Face 22: Creative Engine Orchestrator (IDEA → PLANNING → CHARACTERS → … → EXPORT)
  app.use('/api/creative-engine', routes.creativeEngine);
  app.use('/api/workflows', routes.workflows);
  app.use('/api/executive-loop', routes.executiveLoop);
  app.use('/api/research', routes.research);
  app.use('/api/provider-keys', routes.providerKeys);
  app.use('/api/webllm', routes.webllm);

  // Modelos locales (FASE 14): proveedores locales (Ollama primero; LM Studio,
  // llama.cpp, vLLM después) con descubrimiento, refresh y configuración.
  app.use('/api/local-models', routes.localModels);
  // FASE 29: runtimes locales TTS/STT (proxy hacia rag_api:8500).
  app.use('/api/ai-runtimes', routes.aiRuntimes);
  app.use('/api/vision', routes.vision);
  // ComfyUI se monta en el agregado (routes/index.js → routes.comfyui.router).

  // Ollama Fast Proxy (FASE 26): endpoint OpenAI-compatible que fuerza
  // think:false + num_ctx 16K vía API nativa (el /v1 de Ollama ignora `think`
  // y los modelos de razonamiento se sienten lentísimos en CPU).
  app.use('/api/ollama-proxy', routes.ollamaProxy);

  // Racha de días de uso (FASE 27): GET /api/streak.
  app.use('/api/streak', routes.streak);

  // Sonidos y notificaciones (FASE 20/22): preferencias por usuario + biblioteca
  // con proveedores (local sintetizado, Mixkit curado, Pixabay/Freesound con
  // key) y subida de sonidos personalizados — bajo /api.
  require('./controllers/SoundController').ensureUploadDir();
  app.use('/api', routes.sounds);

  // (D7) Conectar las instancias REALES a los routers de sistema/metrics/telemetry
  // para que /api/health y /api/system/status dejen de reportar "degradado"
  // (antes: setInstances nunca se llamaba).
  {
    const {
      getIntegrationManager,
      shouldUseNewArchitecture,
    } = require('~/server/services/ExecutionBridge');
    const { getMetricsCollector } = require('~/server/services/MetricsCollector');
    const { getTelemetry } = require('~/server/services/Telemetry');
    const { system: systemRoutes, metrics: metricsRoutes, telemetry: telemetryRoutes } = routes;

    // (D7) Si la arquitectura enterprise está habilitada, inicializar el
    // manager en el arranque (getIntegrationManager() lo inicializa; si falla,
    // el arranque aborta con el error real — fail-fast honesto). Si está
    // deshabilitada, se cablea el objeto sin inicializarlo (sin coste de boot;
    // health reporta initialized:false, enabled:false = healthy).
    const manager = shouldUseNewArchitecture()
      ? await getIntegrationManager()
      : require('~/server/services/IntegrationManager').getIntegrationManager();
    const collector = getMetricsCollector();
    const tel = getTelemetry();
    systemRoutes.setInstances(manager, collector, tel);
    metricsRoutes.setInstances(collector, tel);
    telemetryRoutes.setInstances(tel);
  }

  // Rutas integradas en Fase 9 (servicios reales detrás)
  app.use('/api/auto-config', routes.autoConfig);
  app.use('/api/rag', routes.rag);
  app.use('/api/context', routes.context);
  app.use('/api/scheduler', routes.scheduler);
  app.use('/api/huggingface', routes.huggingface);
  app.use('/api/settings', routes.settings);

  // Documentación API (FASE 11)
  app.use('/api/docs', require('./services/DocsService').getDocsService().getRouter());

  app.use('/api/files', await routes.files.initialize());
  app.use('/images/', createValidateImageRequest(appConfig.secureImageLinks), routes.staticRoute);
  app.use('/api/share', preAuthTenantMiddleware, routes.share);
  app.use('/api/roles', routes.roles);
  app.use('/api/connectors', routes.connectors);
  app.use('/api/comfyui', routes.comfyui.router);
  app.use('/api/discovery', routes.discovery);
  app.use('/api/marketplace', routes.marketplace);
  app.use('/api/agents/chat', rejectChatStartsUntilReady);
  // FASE 23: Model Routing por agente (Automático/Manual) — se monta ANTES del
  // router de agentes para que /api/agents/routing/:agentId no colisione.
  app.use('/api/agents/routing', require('./routes/agentRouting'));
  app.use('/api/agents', routes.agents);
  app.use('/api/banner', routes.banner);
  app.use('/api/memories', routes.memories);
  app.use('/api/permissions', routes.accessPermissions);

  app.use('/api/tags', routes.tags);
  app.use('/api/mcp', routes.mcp);
  app.use('/api/rum', routes.rum);
  app.use('/api/sandbox', routes.sandbox);
  app.use('/api/capabilities', routes.capabilities);
  app.use('/api/executive-ai', routes.executiveAi);
  app.use('/api/autonomous-learning', routes.autonomousLearning);
  app.use('/api/capability-discovery', routes.capabilityDiscovery);
  app.use('/api/self-learning', routes.selfLearning);
  app.use('/api/multiagent', routes.multiagent);
  app.use('/api/capability', routes.capability);
  app.use('/api/economy', routes.economy);
  app.use('/api/webhooks', routes.webhooks);
  app.use('/api/research-os', routes.researchOS);
  app.use('/api/social-intelligence', routes.socialIntelligence);
  app.use('/api/cognitive/behavior', routes.cognitiveBehavior);
  app.use('/api/intelligence', routes.intelligenceEngines);
  app.use('/api/security-scan', routes.securityScan);
  app.use('/api/hardware', routes.hardware);
  app.use('/api/dashboard', routes.dashboard);
  app.use('/api/marketing', routes.marketing);
  app.use('/api/social', routes.socialMarketing);
  // Gen B Universal Agent phases 1-20
  app.use('/api/agent', routes.universalAgent);
  // Gen B batch routes — phases 21-53 (reasoning, safety, memory, runtime)
  app.use('/api/agent/reasoning', routes.universalAgentBatchA);
  app.use('/api/agent/safety', routes.universalAgentBatchB);
  app.use('/api/agent/memory', routes.universalAgentBatchC);
  app.use('/api/agent/runtime', routes.universalAgentBatchD);
  app.use('/api/agent/advanced',   routes.universalAgentBatchE);
  app.use('/api/agent/knowledge',  routes.universalAgentBatchF);

  app.use('/metrics', metricsRouter);

  /** 404 for unmatched API routes */
  app.use('/api', apiNotFound);

  /** SPA fallback - serve index.html for all unmatched routes */
  app.use(createSpaFallback(sendIndexHtml));

  /** Record trace errors before the final error controller. */
  if (telemetry.enabled) {
    app.use(telemetry.telemetryErrorMiddleware);
  }
  /** Error handler (must be last - Express identifies error middleware by its 4-arg signature) */
  app.use(ErrorController);

  configureGenerationStreams();

  const server = app.listen(port, host, async (err) => {
    if (err) {
      logger.error('Failed to start server:', err);
      process.exit(1);
    }

    if (host === '0.0.0.0') {
      logger.info(
        `Server listening on all interfaces at port ${port}. Use http://localhost:${port} to access it`,
      );
    } else {
      logger.info(`Server listening at http://${host == '0.0.0.0' ? 'localhost' : host}:${port}`);
    }

    /**
     * The listen callback is async, so any rejection from these awaits would
     * otherwise be detached from `startServer().catch(...)` (which only
     * catches errors that happen before `app.listen`). Without explicit
     * handling, the global `unhandledRejection` handler would swallow init
     * failures and leave the server listening but only partially
     * initialized — passing liveness checks while serving broken requests.
     */
    try {
      await runAsSystem(async () => {
        await initializeMCPs();
        await initializeOAuthReconnectManager();
      });
      await checkMigrations();

      const { getSchedulerService } = require('~/server/services/Scheduler');
      await getSchedulerService().initialize();

      // Phase H: seed Face 7 AgentConstitution if none active
      try {
        const { seedConstitution } = require('~/server/scripts/seedConstitution');
        const result = await seedConstitution();
        if (result.skipped) {
          logger.debug('[AgentConstitution] Active constitution already present — skipping seed.');
        } else {
          logger.info('[AgentConstitution] Face 7 constitution seeded and activated.', result);
        }
      } catch (constitutionErr) {
        logger.warn('[AgentConstitution] Failed to seed Face 7 constitution:', constitutionErr.message);
      }

      // Memory consolidation job — dedup/prune MongoDB session+historical memories
      try {
        const memConsolidation = require('~/server/services/Harness/cognitive/memory/MemoryConsolidationService');
        memConsolidation.start();
      } catch (memErr) {
        logger.warn('[MemoryConsolidation] Failed to start:', memErr.message);
      }

      // HarnessManager: initialize at startup so memory, checkpoints and sub-agents are ready from first request
      if (process.env.HARNESS_ENGINE_ENABLED === 'true') {
        try {
          const { initHarness } = require('~/server/services/Harness/HarnessInit');
          await initHarness();
          logger.info('[HarnessManager] Initialized at startup.');
        } catch (harnessErr) {
          logger.warn('[HarnessManager] Startup init failed (non-fatal):', harnessErr.message);
        }
      }

      // Face 16 — SelfImprovementLoop: periodic quality feedback cycle
      if (process.env.SELF_IMPROVEMENT_ENABLED === 'true') {
        try {
          const { getSelfImprovementLoop } = require('~/server/services/Learning/SelfImprovementLoop');
          getSelfImprovementLoop().start(300000); // 5-minute cycle
          logger.info('[SelfImprovementLoop] Started (5-minute cycle).');
        } catch (silErr) {
          logger.warn('[SelfImprovementLoop] Failed to start:', silErr.message);
        }
      }

      // Face 19/20 — ReputationMonitor: periodic scan of due targets
      try {
        const { scanDueTargets } = require('~/server/services/ReputationMonitor/ReputationMonitorService');
        const repInterval = setInterval(async () => {
          try { await scanDueTargets(); } catch (e) { logger.warn('[ReputationMonitor] Scan error:', e.message); }
        }, 30 * 60 * 1000); // every 30 minutes
        if (repInterval.unref) repInterval.unref();
        logger.info('[ReputationMonitor] Scheduled scan started (30-minute cycle).');
      } catch (repErr) {
        logger.warn('[ReputationMonitor] Failed to start scheduler:', repErr.message);
      }

      const inspectFlags = process.execArgv.some((arg) => arg.startsWith('--inspect'));
      if (inspectFlags || isEnabled(process.env.MEM_DIAG)) {
        memoryDiagnostics.start();
      }
      serverReady = true;
      logger.info('Server readiness checks passing.');
    } catch (initErr) {
      serverReady = false;
      logger.error('Post-listen initialization failed:', initErr);
      process.exit(1);
    }
  });

  setupGracefulShutdown(server);
};

/**
 * Boot rejections (e.g. `connectDb`, `getAppConfig`, `performStartupChecks`)
 * must remain fail-fast: a half-initialized process with no listening HTTP
 * server should die immediately so the orchestrator restarts it, instead of
 * being kept alive by the `unhandledRejection` handler below until the
 * liveness probe eventually times out. Mirrors the pattern in
 * `experimental.js`.
 */
startServer().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});

let messageCount = 0;
process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    logger.error('There was an uncaught error:', err);
  }

  if (err.message && err.message?.toLowerCase()?.includes('abort')) {
    logger.warn('There was an uncatchable abort error.');
    return;
  }

  if (err.message.includes('GoogleGenerativeAI')) {
    logger.warn(
      '\n\n`GoogleGenerativeAI` errors cannot be caught due to an upstream issue, see: https://github.com/google-gemini/generative-ai-js/issues/303',
    );
    return;
  }

  if (err.message.includes('fetch failed')) {
    if (messageCount === 0) {
      logger.warn('Meilisearch error, search will be disabled');
      messageCount++;
    }

    return;
  }

  if (err.message.includes('OpenAIError') || err.message.includes('ChatCompletionMessage')) {
    logger.error(
      '\n\nAn Uncaught `OpenAIError` error may be due to your reverse-proxy setup or stream configuration, or a bug in the `openai` node package.',
    );
    return;
  }

  if (err.stack && err.stack.includes('@librechat/agents')) {
    logger.error(
      '\n\nAn error occurred in the agents system. The error has been logged and the app will continue running.',
      {
        message: err.message,
        stack: err.stack,
      },
    );
    return;
  }

  if (isEnabled(process.env.CONTINUE_ON_UNCAUGHT_EXCEPTION)) {
    logger.error('Unhandled error encountered. The app will continue running.', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    });
    return;
  }

  process.exit(1);
});

/**
 * Unhandled promise rejection handler.
 *
 * Node 15+ terminates the process by default when a promise rejection is
 * unhandled. MCP OAuth reconnect storms and streamable-HTTP transport resets
 * can produce transient fire-and-forget rejections (ECONNRESET, token refresh
 * races) that are recoverable — the server should log and keep serving other
 * requests rather than silently crash under load.
 *
 * Non-Error reasons are forwarded as-is so structured payloads (e.g.
 * `{ code: "ECONNRESET", errno: -104 }`) survive instead of being collapsed to
 * "[object Object]" by `String()`.
 */
process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error) {
    logger.error('Unhandled promise rejection. The app will continue running.', {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
      cause: reason.cause,
    });
    return;
  }
  logger.error('Unhandled promise rejection. The app will continue running.', { reason });
});

/** Export app for easier testing purposes */
module.exports = app;
