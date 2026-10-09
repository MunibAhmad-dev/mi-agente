/**
 * subagentService.js — Fase 11 (Subagents): roles especializados bajo demanda
 * que comparten el motor DeepSeek con contextos/tools independientes.
 *
 * Roles (doc §11): Explorer, Researcher, Coder, Tester, Reviewer, Security.
 * Cada rol tiene:
 *   - systemPrompt: directiva de comportamiento,
 *   - allowedTools: subconjunto de codingTools (Fase 3) filtrado por rol,
 *   - policy: preset del AgentFirewall (Fase 9),
 *   - contextLayers: qué capas de contexto/memory inyectar (Fase 4/10).
 *
 * El dispatcher no genera código: orquesta el rol seleccionado, ensambla
 * su contexto independiente, y devuelve un "task descriptor" listo para
 * ejecutarse por el AgentLoop. La ejecución real (LLM) es responsabilidad
 * del modelo compartido (DeepSeek).
 *
 * Regla del doc: "comparten DeepSeek con contextos independientes".
 */

const { Action } = require('../Security/agentFirewall');
const { MemoryLayer } = require('../Memory/memoryService');

/** Roles de subagentes. */
const SubagentRole = Object.freeze({
  EXPLORER: 'explorer',
  RESEARCHER: 'researcher',
  CODER: 'coder',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
  SECURITY: 'security',
});

/** Perfiles de rol: system prompt + tools + policy + capas de memoria. */
const ROLE_PROFILES = Object.freeze({
  [SubagentRole.EXPLORER]: {
    systemPrompt:
      'Eres el agente Explorer. Tu objetivo es ENTENDER el código: leer, mapear estructura, identificar símbolos y dependencias. NO modificas archivos. Reportas hallazgos.',
    allowedTools: ['read_file', 'list_directory', 'grep_search', 'glob_search'],
    allowedActions: [
      Action.READ_FILE,
      Action.LIST_DIRECTORY,
      Action.GREP_SEARCH,
      Action.GLOB_SEARCH,
    ],
    policy: 'restricted',
    memoryLayers: [MemoryLayer.PROJECT, MemoryLayer.SHORT],
    canWrite: false,
  },
  [SubagentRole.RESEARCHER]: {
    systemPrompt:
      'Eres el agente Researcher. Investigas APIs, documentación y patrones. Síntesis información y devuelves recomendaciones accionables.',
    allowedTools: ['grep_search', 'glob_search', 'read_file'],
    allowedActions: [Action.GREP_SEARCH, Action.GLOB_SEARCH, Action.READ_FILE],
    policy: 'restricted',
    memoryLayers: [MemoryLayer.HISTORICAL, MemoryLayer.PROJECT],
    canWrite: false,
  },
  [SubagentRole.CODER]: {
    systemPrompt:
      'Eres el agente Coder. Implementas cambios de código mínimos y enfocados. Escribes tests. Verificas con compile_check antes de reportar.',
    allowedTools: [
      'read_file',
      'write_file',
      'edit_file',
      'compile_check',
      'grep_search',
      'glob_search',
    ],
    allowedActions: [
      Action.READ_FILE,
      Action.WRITE_FILE,
      Action.EDIT_FILE,
      Action.COMPILE_CHECK,
      Action.GREP_SEARCH,
      Action.GLOB_SEARCH,
    ],
    policy: 'standard',
    memoryLayers: [MemoryLayer.PROJECT, MemoryLayer.SESSION, MemoryLayer.SHORT],
    canWrite: true,
  },
  [SubagentRole.TESTER]: {
    systemPrompt:
      'Eres el agente Tester. Escribes y ejecutas tests. Reportas fallos con reproducibilidad. No modificas código de producción salvo fixtures.',
    allowedTools: ['read_file', 'write_file', 'execute_command', 'compile_check'],
    allowedActions: [
      Action.READ_FILE,
      Action.WRITE_FILE,
      Action.EXECUTE_COMMAND,
      Action.COMPILE_CHECK,
    ],
    policy: 'standard',
    memoryLayers: [MemoryLayer.PROJECT, MemoryLayer.SESSION],
    canWrite: true,
  },
  [SubagentRole.REVIEWER]: {
    systemPrompt:
      'Eres el agente Reviewer. Revisas cambios por calidad, simplicidad, seguridad y riesgo. Das feedback accionable. NO modificas archivos.',
    allowedTools: ['read_file', 'grep_search', 'glob_search'],
    allowedActions: [Action.READ_FILE, Action.GREP_SEARCH, Action.GLOB_SEARCH],
    policy: 'restricted',
    memoryLayers: [MemoryLayer.PROJECT, MemoryLayer.HISTORICAL],
    canWrite: false,
  },
  [SubagentRole.SECURITY]: {
    systemPrompt:
      'Eres el agente Security. Auditas cambios por vulnerabilidades, secretos expuestos y violaciones de política. Deniegas operaciones peligrosas.',
    allowedTools: ['read_file', 'grep_search', 'glob_search'],
    allowedActions: [Action.READ_FILE, Action.GREP_SEARCH, Action.GLOB_SEARCH],
    policy: 'restricted',
    memoryLayers: [MemoryLayer.PROJECT, MemoryLayer.HISTORICAL],
    canWrite: false,
  },
});

/**
 * SubagentService: dispatch de roles bajo demanda.
 */
class SubagentService {
  /**
   * @param {object} deps - { memoryService, codeIntelligence, firewall }
   */
  constructor(deps = {}) {
    this.memoryService = deps.memoryService || null;
    this.codeIntelligence = deps.codeIntelligence || null;
    this.firewall = deps.firewall || null;
  }

  /**
   * Despacha un subagente para una tarea.
   * No ejecuta el LLM: devuelve un task descriptor con contexto independiente
   * ensamblado, listo para que el AgentLoop lo ejecute con el modelo compartido.
   * @param {object} params
   * @param {string} params.role - SubagentRole
   * @param {string} params.task - descripción de la tarea
   * @param {string} [params.projectId]
   * @param {string} [params.userId]
   * @param {object} [params.extraContext] - contexto adicional inyectado
   * @returns {object} task descriptor
   */
  dispatch({ role, task, projectId, userId, extraContext }) {
    const profile = ROLE_PROFILES[role];
    if (!profile) {
      throw new Error(`Rol de subagente desconocido: ${role}`);
    }

    // Ensamblar contexto independiente del rol (memoria por relevancia).
    let memoryContext = [];
    if (this.memoryService) {
      memoryContext = this.memoryService
        .recall({
          query: task,
          projectId,
          userId,
          topK: 5,
        })
        .filter((e) => profile.memoryLayers.includes(e.layer));
    }

    return {
      role,
      task,
      systemPrompt: profile.systemPrompt,
      allowedTools: profile.allowedTools,
      allowedActions: profile.allowedActions,
      policy: profile.policy,
      canWrite: profile.canWrite,
      memoryContext,
      extraContext: extraContext || null,
      // el contexto es INDEPENDIENTE por rol: cada dispatch tiene su propio
      // system prompt + tools + memoria, aunque compartan el motor DeepSeek.
    };
  }

  /** Lista los roles disponibles. */
  listRoles() {
    return Object.keys(ROLE_PROFILES);
  }

  /** Devuelve el perfil de un rol (para inspección/UI). */
  getProfile(role) {
    return ROLE_PROFILES[role] || null;
  }

  /**
   * Valida que una acción esté permitida para el rol (usando el firewall).
   * @param {string} role
   * @param {object} actionParams - { action, filePath, command, tool }
   * @returns {object} decisión del firewall
   */
  authorizeAction(role, actionParams) {
    const profile = ROLE_PROFILES[role];
    if (!profile) {
      return { decision: 'deny', reason: `rol desconocido: ${role}` };
    }
    if (!profile.allowedActions.includes(actionParams.action)) {
      return {
        decision: 'deny',
        reason: `acción ${actionParams.action} no permitida para rol ${role}`,
      };
    }
    if (this.firewall) {
      return this.firewall.check({ ...actionParams, policy: profile.policy });
    }
    return { decision: 'allow', reason: 'sin firewall (modo testing)' };
  }
}

module.exports = {
  SubagentRole,
  ROLE_PROFILES,
  SubagentService,
};
