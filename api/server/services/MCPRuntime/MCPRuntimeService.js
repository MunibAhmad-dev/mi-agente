/**
 * MCPRuntimeService.js — Fase 3 (Tool Runtime): policy gateway sobre el
 * MCPManager existente de @librechat/api.
 *
 * El repo ya tiene MCPManager + MCPServersRegistry (gestión real de
 * servidores MCP), pero sin capa de policy/retry/timeout/audit por tool.
 * Este servicio envuelve esas llamadas con:
 *
 *   - authorizeToolCall(toolName, args): delega en AgentFirewall (F9) para
 *     validar que la tool puede ejecutarse según la política activa.
 *   - invokeTool(toolName, args, opts): retry + timeout + audit log, delega
 *     la invocación real en MCPManager.callTool.
 *   - listAvailableTools(): catálogo de tools MCP disponibles.
 *
 * Regla del doc §3: "activar MCPRuntime con policy gateway". Este módulo
 * NO duplica MCPManager; lo envuelve con la política de seguridad.
 */

const { logger } = require('@librechat/data-schemas');
const { getMCPManager, getMCPServersRegistry } = require('~/config');
const { check: firewallCheck, Decision } = require('~/server/services/Security/agentFirewall');

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 1;
const AUDIT_LOG = [];

function audit(entry) {
  AUDIT_LOG.push({ ...entry, ts: Date.now() });
  if (AUDIT_LOG.length > 500) {
    AUDIT_LOG.splice(0, AUDIT_LOG.length - 500);
  }
  if (entry.status === 'denied' || entry.status === 'error') {
    logger.warn(
      `[MCPRuntime] ${entry.status}: tool=${entry.toolName} reason=${entry.reason || ''}`,
    );
  }
}

class MCPRuntimeService {
  constructor() {
    this._instance = null;
  }

  /** Resuelve perezosamente el MCPManager singleton. */
  _manager() {
    if (!this._instance) {
      try {
        this._instance = getMCPManager();
      } catch {
        logger.warn('[MCPRuntime] MCPManager no disponible todavía');
      }
    }
    return this._instance;
  }

  /**
   * Autoriza una llamada a tool MCP vía AgentFirewall (F9).
   * @param {string} toolName - nombre de la tool MCP.
   * @param {object} args - argumentos de la tool.
   * @param {object} [policy] - política de firewall (preset o custom).
   * @returns {{ allowed: boolean, reason: string }}
   */
  authorizeToolCall(toolName, args = {}, policy) {
    try {
      const result = firewallCheck({
        action: 'shell_command',
        tool: toolName,
        command: JSON.stringify(args),
        policy,
      });
      const allowed = result.decision === Decision.ALLOW;
      audit({ toolName, status: allowed ? 'allowed' : 'denied', reason: result.reason });
      return { allowed, reason: result.reason };
    } catch (error) {
      audit({ toolName, status: 'error', reason: error.message });
      return { allowed: false, reason: `firewall error: ${error.message}` };
    }
  }

  /**
   * Invoca una tool MCP con retry + timeout + audit.
   * @param {object} params
   * @param {string} params.serverName - nombre del servidor MCP.
   * @param {string} params.toolName - nombre de la tool.
   * @param {object} [params.toolArguments] - argumentos para la tool.
   * @param {object} [params.user] - usuario de la sesión.
   * @param {object} [params.provider] - provider MCP.
   * @param {object} [params.serverConfig] - config pre-resuelta.
   * @param {object} [params.options] - opciones (signal, etc).
   * @param {object} [opts] - opciones de runtime.
   * @param {number} [opts.timeoutMs=60000] - timeout por intento.
   * @param {number} [opts.retries=1] - reintentos tras fallo transitorio.
   * @returns {Promise<{ result: unknown, attempts: number }>}
   */
  async invokeTool(
    { serverName, toolName, toolArguments, user, provider, serverConfig, options },
    opts = {},
  ) {
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    const maxRetries = opts.retries ?? DEFAULT_RETRIES;

    const authz = this.authorizeToolCall(toolName, toolArguments);
    if (!authz.allowed) {
      const err = new Error(`[MCPRuntime] DENY: ${authz.reason}`);
      err.code = 'EACTION_DENIED';
      throw err;
    }

    const manager = this._manager();
    if (!manager) {
      throw new Error('[MCPRuntime] MCPManager no inicializado');
    }

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const signal = options?.signal
        ? this._mergeSignals(options.signal, controller.signal)
        : controller.signal;
      try {
        const result = await manager.callTool({
          serverName,
          serverConfig,
          toolName,
          provider,
          toolArguments,
          options: { ...options, signal },
          user,
        });
        audit({ toolName, serverName, status: 'success', attempt });
        clearTimeout(timer);
        return { result, attempts: attempt + 1 };
      } catch (error) {
        lastError = error;
        clearTimeout(timer);
        const transient = error?.name === 'AbortError' || error?.code === 'ETIMEDOUT';
        audit({ toolName, serverName, status: 'error', attempt, reason: error.message });
        if (!transient || attempt === maxRetries) {
          break;
        }
      }
    }
    throw lastError || new Error(`[MCPRuntime] invocación fallida: ${toolName}`);
  }

  /** Combina dos AbortSignal: aborta si cualquiera lo hace. */
  _mergeSignals(a, b) {
    if (a.aborted || b.aborted) {
      const c = new AbortController();
      c.abort();
      return c.signal;
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
    return controller.signal;
  }

  /**
   * Lista las tools MCP disponibles (catálogo).
   * @returns {Promise<object[]>}
   */
  async listAvailableTools() {
    const registry = getMCPServersRegistry?.();
    if (!registry) {
      return [];
    }
    try {
      let servers;
      if (typeof registry.listServers === 'function') {
        servers = registry.listServers();
      } else if (registry.servers) {
        servers = Object.keys(registry.servers);
      } else {
        servers = [];
      }
      const tools = [];
      for (const serverName of servers) {
        tools.push({ serverName, tools: '(delegado a MCPManager)' });
      }
      return tools;
    } catch (error) {
      logger.warn(`[MCPRuntime] listAvailableTools error: ${error.message}`);
      return [];
    }
  }

  /** Devuelve el log de auditoría reciente. */
  auditLog() {
    return AUDIT_LOG.slice(-100);
  }

  /** Limpia el log de auditoría. */
  clearAudit() {
    AUDIT_LOG.length = 0;
  }
}

let _instance = null;

function getInstance() {
  if (!_instance) {
    _instance = new MCPRuntimeService();
  }
  return _instance;
}

module.exports = {
  MCPRuntimeService,
  getInstance,
};
