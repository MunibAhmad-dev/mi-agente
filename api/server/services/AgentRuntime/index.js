/**
 * AgentRuntime — FASE 1 (Sistema Universal de Agentes).
 *
 * Fachada VERSIONADA del runtime de ejecución de agentes.
 *
 * El runtime real (LangChain streaming, buildAgentInput, generación por SSE,
 * gestión de jobs) vive en los paquetes `@librechat/api` y `@librechat/agents`
 * (dependencias del proyecto). Este módulo es la SUPERFICIE que el repo posee
 * y versiona: centraliza TODAS las llamadas al runtime para que el código de
 * la app no dependa de imports dispersos de `@librechat/*`.
 *
 * Regla de uso:
 *   - El código nuevo DEBE importar el runtime desde `~/server/services/AgentRuntime`.
 *   - El código existente puede migrarse incrementalmente (build.js/initialize.js
 *     ya pasan por los wrappers `loadAgent`/`initializeAgent` de aquí).
 *   - Nunca se escribe lógica de ejecución nueva directamente contra el paquete
 *     compilado: primero se expone aquí (con su contrato), después se usa.
 *
 * RUNTIME_VERSION: se incrementa cuando cambia el contrato que la app usa.
 * TARGET_API_VERSION: versión de @librechat/api contra la que se validó este
 * contrato (ver AgentRuntime.spec.js — pin del contrato).
 */

const { logger } = require('@librechat/data-schemas');

const RUNTIME_VERSION = 1;
/** Versión del paquete objetivo (si el exports map permite leer package.json). */
function resolveApiVersion() {
  try {
    return require('@librechat/api/package.json').version;
  } catch {
    try {
      // Fallback: versión desde el package.json resuelto del módulo principal.
      const pkgPath = require.resolve('@librechat/api');
      const fs = require('fs');
      let dir = pkgPath;
      for (let i = 0; i < 6; i += 1) {
        dir = dir.substring(0, dir.lastIndexOf('/'));
        const candidate = `${dir}/package.json`;
        if (fs.existsSync(candidate)) {
          return JSON.parse(fs.readFileSync(candidate, 'utf8')).version || 'unknown';
        }
      }
    } catch {
      /* sin versión */
    }
    return 'unknown';
  }
}
const TARGET_API_VERSION = resolveApiVersion();

/* ------------------------------------------------------------------ */
/* @librechat/api — núcleo del runtime                                */
/* ------------------------------------------------------------------ */
const api = require('@librechat/api');

/** Inicializa un agente (config + modelo + memoria + skills) y devuelve el
 *  objeto `config` listo para el runtime. Es el punto de entrada principal
 *  del chat de agentes (controllers/agents/request.js → initializeAgent). */
function initializeAgent(params) {
  return api.initializeAgent(params);
}

/** Carga un agente desde la BD (con sus tools/MCP/skills resueltos). */
function loadAgent(params, deps) {
  return api.loadAgent(params, deps);
}

/** Descubre subagentes conectados (onAgentInitialized → routing por config). */
function discoverConnectedAgents(params) {
  return api.discoverConnectedAgents(params);
}

/** ¿El agente tiene memoria activa (modo + config)? */
function isMemoryEnabled(agent) {
  return api.isMemoryEnabled(agent);
}

/** Valida que el modelo del agente exista en el endpoint (antes de ejecutar).
 *  Contrato real: validateAgentModel({ req, res, agent, modelsConfig, logViolation })
 *  → { isValid: boolean, error?: object }. Ver addedConvo.js. */
function validateAgentModel(params) {
  return api.validateAgentModel(params);
}

/** Construye el contexto con adjuntos por agente (subagentes con archivos). */
function buildAgentContextAttachmentsByAgentId(configs, req, options) {
  return api.buildAgentContextAttachmentsByAgentId(configs, req, options);
}

/** Manager de jobs de generación (una petición por job, abort coordinado). */
const GenerationJobManager = api.GenerationJobManager;

/* ------------------------------------------------------------------ */
/* @librechat/agents — agregación de contenido del stream              */
/* ------------------------------------------------------------------ */
const agentsPkg = require('@librechat/agents');

/** Agrega el contenido incremental del stream SSE (delitas → mensaje final). */
function createContentAggregator(config, handlers) {
  return agentsPkg.createContentAggregator(config, handlers);
}

module.exports = {
  RUNTIME_VERSION,
  TARGET_API_VERSION,
  // @librechat/api
  initializeAgent,
  loadAgent,
  discoverConnectedAgents,
  isMemoryEnabled,
  validateAgentModel,
  buildAgentContextAttachmentsByAgentId,
  GenerationJobManager,
  // @librechat/agents
  createContentAggregator,
  // Para diagnóstico/versión del paquete real (no usar para ejecución).
  _apiPackageVersion: TARGET_API_VERSION,
};

// El módulo debe poder cargarse en tests unitarios SIN el paquete real
// (jest.mock de '@librechat/api'/'@librechat/agents'); se valida aquí.
try {
  logger.debug(`[AgentRuntime] v${RUNTIME_VERSION} · @librechat/api ${TARGET_API_VERSION}`);
} catch {
  /* sin logger en tests minimalistas */
}
