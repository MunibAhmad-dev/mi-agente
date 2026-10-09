/**
 * codingTools.js — Fase 3 (Tool Runtime): activa el motor de coding tools
 * locales del SDK @librechat/agents.
 *
 * El SDK (@librechat/agents v3.2.65) trae un motor completo de coding tools
 * (read/write/edit_file, grep/glob_search, list_directory, compile_check,
 * bash_execution, code_execution) que la app NO usaba. Este servicio lo
 * expone con una configuración SEGURA por defecto:
 *
 *   - readOnly: true       → las tools mutadoras se desactivan salvo opt-in.
 *   - fileCheckpointing: true  → snapshots pre-escritura para rewind().
 *   - postEditSyntaxCheck: true  → validación de sintaxis tras cada edición.
 *   - workspace.root acotado  → nunca opera fuera del workspace indicado.
 *
 * SEGURIDAD (Regla 6 del doc: "las operaciones peligrosas requieren
 * políticas"). Estas tools ejecutan bash y escriben archivos directamente
 * en el host del proceso API. Por eso NO se cablean al chat general hasta
 * que el Agent Firewall + Sandbox (Fase 9) estén listos. Mientras tanto,
 * se exponen como un servicio versionado para que el Coding Agent las use
 * DENTRO de un sandbox (SandboxManager) cuando llegue esa fase.
 *
 * Regla 2 del doc: "las tools son independientes del modelo" — estas tools
 * tienen interfaces estructuradas (no dependen de DeepSeek ni de ningún LLM).
 */

const { logger } = require('@librechat/data-schemas');
const agentsPkg = require('@librechat/agents');

const {
  createLocalCodingToolBundle,
  createLocalCodingToolDefinitions,
  createLocalCodingToolRegistry,
  Constants: AgentConstants,
} = agentsPkg;

/** Niveles de riesgo para el Tool Router (doc §23). */
const RiskLevel = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

/** Categorías de tools para el Tool Router (doc §24). */
const ToolCategory = Object.freeze({
  FILESYSTEM: 'filesystem',
  SHELL: 'shell',
  SEARCH: 'search',
  VERIFICATION: 'verification',
  CODE_EXECUTION: 'code_execution',
});

/**
 * Metadatos por tool name para el Tool Router. Define categoría, riesgo y
 * si la tool es mutadora (requiere permiso de escritura).
 */
const TOOL_METADATA = Object.freeze({
  [AgentConstants.READ_FILE]: {
    category: ToolCategory.FILESYSTEM,
    risk: RiskLevel.LOW,
    mutates: false,
    requiresPermission: 'read',
  },
  [AgentConstants.GLOB_SEARCH]: {
    category: ToolCategory.SEARCH,
    risk: RiskLevel.LOW,
    mutates: false,
    requiresPermission: 'read',
  },
  [AgentConstants.GREP_SEARCH]: {
    category: ToolCategory.SEARCH,
    risk: RiskLevel.LOW,
    mutates: false,
    requiresPermission: 'read',
  },
  [AgentConstants.LIST_DIRECTORY]: {
    category: ToolCategory.FILESYSTEM,
    risk: RiskLevel.LOW,
    mutates: false,
    requiresPermission: 'read',
  },
  [AgentConstants.WRITE_FILE]: {
    category: ToolCategory.FILESYSTEM,
    risk: RiskLevel.MEDIUM,
    mutates: true,
    requiresPermission: 'write',
  },
  [AgentConstants.EDIT_FILE]: {
    category: ToolCategory.FILESYSTEM,
    risk: RiskLevel.MEDIUM,
    mutates: true,
    requiresPermission: 'write',
  },
  [AgentConstants.COMPILE_CHECK]: {
    category: ToolCategory.VERIFICATION,
    risk: RiskLevel.LOW,
    mutates: false,
    requiresPermission: 'read',
  },
  [AgentConstants.BASH_TOOL]: {
    category: ToolCategory.SHELL,
    risk: RiskLevel.HIGH,
    mutates: true,
    requiresPermission: 'execute',
  },
  [AgentConstants.EXECUTE_CODE]: {
    category: ToolCategory.CODE_EXECUTION,
    risk: RiskLevel.HIGH,
    mutates: true,
    requiresPermission: 'execute',
  },
});

/**
 * Construye la configuración de ejecución local segura.
 * @param {object} opts
 * @param {string} [opts.workspaceRoot] - directorio raíz del workspace.
 * @param {boolean} [opts.readOnly=true] - desactiva tools mutadoras.
 * @param {boolean} [opts.fileCheckpointing=true] - snapshots para rewind.
 * @param {boolean} [opts.postEditSyntaxCheck=true] - validar tras editar.
 * @param {number} [opts.timeoutMs=120000] - timeout de procesos locales.
 * @param {number} [opts.maxOutputChars=50000] - límite de salida para el modelo.
 */
function buildLocalExecutionConfig(opts = {}) {
  const {
    workspaceRoot,
    readOnly = true,
    fileCheckpointing = true,
    postEditSyntaxCheck = true,
    timeoutMs = 120000,
    maxOutputChars = 50000,
  } = opts;

  const config = {
    readOnly,
    fileCheckpointing,
    postEditSyntaxCheck,
    timeoutMs,
    maxOutputChars,
  };
  if (workspaceRoot) {
    config.workspace = { root: workspaceRoot };
    config.cwd = workspaceRoot;
  }
  return config;
}

/**
 * Crea el bundle de coding tools locales con configuración segura.
 * Devuelve { tools, checkpointer } — el checkpointer permite rewind().
 * @param {object} [opts] - ver buildLocalExecutionConfig.
 * @returns {{ tools: any[], checkpointer?: any } | null}
 */
function createCodingToolBundle(opts = {}) {
  if (typeof createLocalCodingToolBundle !== 'function') {
    logger.warn('[codingTools] createLocalCodingToolBundle no disponible en este SDK');
    return null;
  }
  const config = buildLocalExecutionConfig(opts);
  try {
    return createLocalCodingToolBundle(config);
  } catch (error) {
    logger.error('[codingTools] Error creando coding tool bundle:', redact(error));
    return null;
  }
}

/**
 * Filtra las tools según los permisos concedidos. En readOnly:true, las
 * tools mutadoras (write/edit/bash/execute) se excluyen. Implementa la
 * política "operaciones peligrosas requieren políticas" (Regla 6).
 * @param {any[]} tools - tools del bundle.
 * @param {object} [permissions] - { read, write, execute } concedidos.
 * @returns {any[]}
 */
function filterToolsByPermission(tools, permissions = { read: true }) {
  const granted = {
    read: permissions.read !== false,
    write: permissions.write === true,
    execute: permissions.execute === true,
  };
  return tools.filter((tool) => {
    const meta = TOOL_METADATA[tool?.name];
    if (!meta) {
      return true;
    }
    if (!meta.mutates) {
      return granted.read;
    }
    return meta.requiresPermission === 'write' ? granted.write : granted.execute;
  });
}

/**
 * Devuelve el catálogo de definiciones de coding tools (esquemas), sin
 * instanciar ejecutores. Útil para registrar en un tool registry.
 * @returns {any[]}
 */
function getCodingToolDefinitions() {
  if (typeof createLocalCodingToolDefinitions !== 'function') {
    return [];
  }
  return createLocalCodingToolDefinitions();
}

/**
 * Devuelve un Map name → definition de coding tools (registry).
 * @returns {Map<string, any>}
 */
function getCodingToolRegistry() {
  if (typeof createLocalCodingToolRegistry !== 'function') {
    return new Map();
  }
  return createLocalCodingToolRegistry();
}

/**
 * Tool Router mínimo (doc §3 — Tool Router): dada una lista de tool names
 * solicitada y los permisos, devuelve las instancias de coding tools
 * autorizadas, listas para inyectar en el agent loop.
 * @param {string[]} requestedNames - nombres de tools solicitadas.
 * @param {object} opts - { permissions, ...buildLocalExecutionConfig opts }.
 * @returns {any[]} tools autorizadas.
 */
function resolveCodingTools(requestedNames = [], opts = {}) {
  const { permissions, ...bundleOpts } = opts;
  const bundle = createCodingToolBundle(bundleOpts);
  if (!bundle || !bundle.tools) {
    return [];
  }
  const allowed = filterToolsByPermission(bundle.tools, permissions);
  if (!requestedNames.length) {
    return allowed;
  }
  const requested = new Set(requestedNames);
  return allowed.filter((tool) => requested.has(tool.name));
}

/** Lista los nombres de coding tools disponibles (catálogo estático). */
function listAvailableCodingToolNames() {
  return Object.keys(TOOL_METADATA);
}

function redact(error) {
  return error?.message ? error.message : String(error);
}

module.exports = {
  RiskLevel,
  ToolCategory,
  TOOL_METADATA,
  buildLocalExecutionConfig,
  createCodingToolBundle,
  filterToolsByPermission,
  getCodingToolDefinitions,
  getCodingToolRegistry,
  resolveCodingTools,
  listAvailableCodingToolNames,
};
