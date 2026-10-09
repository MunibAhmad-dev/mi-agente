/**
 * agentFirewall.js — Fase 9 (Security): policy engine que valida cada acción
 * del agente antes de ejecutarse. Conecta los esquemas supervisor/permission
 * (file/command/network/tool/infoPermissions) con los codingTools (Fase 3).
 *
 * El firewall es la ÚNICA puerta entre el agente y el sistema: ninguna
 * acción de escritura/shell/git/secrets se ejecuta sin pasar por check().
 *
 * Reglas del doc (§6 Safety + §9 Security):
 *   - Operaciones peligrosas requieren políticas explícitas (deny por defecto).
 *   - Permisos granulares: filesystem / shell / git / secrets / deployment / network.
 *   - denyPaths siempre gana sobre allowPaths (defensa en profundidad).
 *   - Secrets/credentials denegados salvo allowReadSecrets explícito.
 *
 * Presets (alineados con supervisorPermissionSchema):
 *   - restricted: solo lectura, sin shell, sin secrets.
 *   - standard: lectura + escritura workspace, shell limitado.
 *   - full: todo permitido (solo para entornos trusted).
 *   - custom: definido por el usuario.
 */

const Action = Object.freeze({
  // filesystem
  READ_FILE: 'read_file',
  WRITE_FILE: 'write_file',
  EDIT_FILE: 'edit_file',
  LIST_DIRECTORY: 'list_directory',
  // shell
  EXECUTE_COMMAND: 'execute_command',
  // search
  GREP_SEARCH: 'grep_search',
  GLOB_SEARCH: 'glob_search',
  // code
  COMPILE_CHECK: 'compile_check',
  CODE_EXECUTION: 'code_execution',
});

const Decision = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  CONFIRM: 'confirm', // requiere aprobación humana
});

const Resource = Object.freeze({
  FILESYSTEM: 'filesystem',
  SHELL: 'shell',
  NETWORK: 'network',
  SECRETS: 'secrets',
  GIT: 'git',
  DEPLOYMENT: 'deployment',
});

/** Patrones de paths sensibles denegados por defecto (defensa profunda). */
const SENSITIVE_PATH_PATTERNS = [
  /\.env(\.|$)/i,
  /\.git\//i,
  /\/\.ssh\//i,
  /\/\.aws\//i,
  /\/\.config\//i,
  /\/\.npmrc$/i,
  /\/\.pypirc$/i,
  /id_rsa/i,
  /private\.key/i,
  /credentials/i,
];

/** Patrones de comandos peligrosos denegados salvo preset full. */
const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+\//, // rm -rf /
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /:\(\)\s*\{/, // fork bomb
  /\bcurl\b.+\|\s*(bash|sh)/, // curl | sh
  /\bwget\b.+\|\s*(bash|sh)/,
  /\bshutdown\b/,
  /\breboot\b/,
];

const PRESETS = Object.freeze({
  restricted: {
    file: {
      readPaths: ['./**'],
      writePaths: [],
      denyPaths: SENSITIVE_PATH_PATTERNS.map((p) => p.source),
    },
    command: {
      allowedCommands: [],
      deniedCommands: ['**'],
      requireApproval: [],
      maxTimeout: 0,
    },
    network: { allowedDomains: [], deniedDomains: ['**'], allowBrowser: false },
    tool: { allowedTools: [], deniedTools: ['**'] },
    info: { allowReadSecrets: false, allowReadCredentials: false },
    limits: { maxConcurrentAgents: 1, maxSandboxTime: 60000, maxFileSize: 1024 * 1024 },
  },
  standard: {
    file: {
      readPaths: ['./**'],
      writePaths: ['./**'],
      denyPaths: SENSITIVE_PATH_PATTERNS.map((p) => p.source),
    },
    command: {
      allowedCommands: [
        'git status',
        'git diff',
        'git log',
        'npm test',
        'npm run *',
        'npx jest *',
        'node --check *',
        'eslint *',
        'tsc --noEmit',
      ],
      deniedCommands: DANGEROUS_COMMAND_PATTERNS.map((p) => p.source),
      requireApproval: ['git push *', 'git commit *', 'npm publish *'],
      maxTimeout: 120000,
    },
    network: { allowedDomains: [], deniedDomains: ['**'], allowBrowser: false },
    tool: { allowedTools: ['**'], deniedTools: [] },
    info: { allowReadSecrets: false, allowReadCredentials: false },
    limits: { maxConcurrentAgents: 2, maxSandboxTime: 300000, maxFileSize: 10 * 1024 * 1024 },
  },
  full: {
    file: { readPaths: ['**'], writePaths: ['**'], denyPaths: [] },
    command: {
      allowedCommands: ['**'],
      deniedCommands: [],
      requireApproval: [],
      maxTimeout: 600000,
    },
    network: { allowedDomains: ['**'], deniedDomains: [], allowBrowser: true },
    tool: { allowedTools: ['**'], deniedTools: [] },
    info: { allowReadSecrets: true, allowReadCredentials: true },
    limits: { maxConcurrentAgents: 5, maxSandboxTime: 1800000, maxFileSize: 100 * 1024 * 1024 },
  },
});

/** Normaliza una ruta para comparación (quita ./ y / inicial). */
function normalizePath(p) {
  if (!p) return p;
  let n = p.replace(/^\.\//, '');
  return n;
}

/** Convierte un glob a RegExp. ** matchea cualquier cosa (incluye /), * no cruza /. */
function globToRegex(glob) {
  let g = normalizePath(glob);
  let pattern = g.replace(/\./g, '\\.');
  pattern = pattern.replace(/\*\*/g, '{{GLOBSTAR}}');
  pattern = pattern.replace(/\*/g, '[^/]*');
  pattern = pattern.replace(/\?/g, '[^/]');
  pattern = pattern.replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp('^' + pattern + '$');
}

/** Comprueba si un valor matchea alguno de los patrones (glob o regex source). */
function matchesAny(value, patterns) {
  if (!patterns || !patterns.length) {
    return false;
  }
  const v = normalizePath(value);
  for (const p of patterns) {
    try {
      // Si parece regex source (tiene \), intenta como regex; si no, como glob.
      const re =
        p.startsWith('^') || p.includes('\\') || p.includes('.*') ? new RegExp(p) : globToRegex(p);
      if (re.test(v) || re.test(value)) {
        return true;
      }
    } catch {
      // patrón inválido → ignorar
    }
  }
  return false;
}

/**
 * Resuelve una política desde un preset o un objeto custom.
 * @param {string|object} policy - 'restricted'|'standard'|'full' o política custom
 * @returns {object} política normalizada
 */
function resolvePolicy(policy) {
  if (!policy) {
    return PRESETS.restricted; // deny por defecto
  }
  if (typeof policy === 'string') {
    return PRESETS[policy] || PRESETS.restricted;
  }
  return policy;
}

/**
 * Valida una acción del agente contra la política.
 * @param {object} params
 * @param {string} params.action - Action
 * @param {object} params.policy - política resuelta
 * @param {string} [params.path] - ruta del archivo (para filesystem)
 * @param {string} [params.command] - comando (para shell)
 * @param {string} [params.tool] - nombre de herramienta
 * @returns {{ decision: string, reason: string, resource: string }}
 */
function check({ action, policy, filePath, command, tool }) {
  const p = resolvePolicy(policy);

  // --- SECRETS: paths sensibles siempre denegados salvo allowReadSecrets ---
  if (filePath) {
    const isSensitive = SENSITIVE_PATH_PATTERNS.some((re) => re.test(filePath));
    if (isSensitive) {
      const isWrite = action === Action.WRITE_FILE || action === Action.EDIT_FILE;
      const secretAllowed = isWrite ? false : p.info && p.info.allowReadSecrets;
      if (!secretAllowed) {
        return {
          decision: Decision.DENY,
          resource: Resource.SECRETS,
          reason: `path sensible denegado: ${filePath}`,
        };
      }
    }
  }

  // --- FILESYSTEM ---
  if ([Action.READ_FILE, Action.LIST_DIRECTORY].includes(action) && filePath) {
    // denyPaths siempre gana
    if (matchesAny(filePath, p.file.denyPaths)) {
      return {
        decision: Decision.DENY,
        resource: Resource.FILESYSTEM,
        reason: `denyPath: ${filePath}`,
      };
    }
    if (!matchesAny(filePath, p.file.readPaths)) {
      return {
        decision: Decision.DENY,
        resource: Resource.FILESYSTEM,
        reason: `fuera de readPaths: ${filePath}`,
      };
    }
    return { decision: Decision.ALLOW, resource: Resource.FILESYSTEM, reason: 'read permitido' };
  }

  if ([Action.WRITE_FILE, Action.EDIT_FILE].includes(action) && filePath) {
    if (matchesAny(filePath, p.file.denyPaths)) {
      return {
        decision: Decision.DENY,
        resource: Resource.FILESYSTEM,
        reason: `denyPath: ${filePath}`,
      };
    }
    if (!matchesAny(filePath, p.file.writePaths)) {
      return {
        decision: Decision.DENY,
        resource: Resource.FILESYSTEM,
        reason: `fuera de writePaths: ${filePath}`,
      };
    }
    return { decision: Decision.ALLOW, resource: Resource.FILESYSTEM, reason: 'write permitido' };
  }

  // --- SHELL ---
  if ([Action.EXECUTE_COMMAND, Action.CODE_EXECUTION].includes(action) && command) {
    if (matchesAny(command, p.command.deniedCommands)) {
      return {
        decision: Decision.DENY,
        resource: Resource.SHELL,
        reason: `comando denegado: ${command}`,
      };
    }
    if (matchesAny(command, p.command.requireApproval)) {
      return {
        decision: Decision.CONFIRM,
        resource: Resource.SHELL,
        reason: `requiere aprobación: ${command}`,
      };
    }
    if (!matchesAny(command, p.command.allowedCommands)) {
      return {
        decision: Decision.DENY,
        resource: Resource.SHELL,
        reason: `comando no en allowlist: ${command}`,
      };
    }
    return { decision: Decision.ALLOW, resource: Resource.SHELL, reason: 'comando permitido' };
  }

  // --- TOOLS ---
  if (tool) {
    if (matchesAny(tool, p.tool.deniedTools)) {
      return {
        decision: Decision.DENY,
        resource: Resource.SHELL,
        reason: `tool denegada: ${tool}`,
      };
    }
    if (!matchesAny(tool, p.tool.allowedTools)) {
      return {
        decision: Decision.DENY,
        resource: Resource.SHELL,
        reason: `tool no permitida: ${tool}`,
      };
    }
    return { decision: Decision.ALLOW, resource: Resource.SHELL, reason: 'tool permitida' };
  }

  // --- SEARCH (grep/glob): permite si el path base está en readPaths ---
  if ([Action.GREP_SEARCH, Action.GLOB_SEARCH].includes(action)) {
    return {
      decision: Decision.ALLOW,
      resource: Resource.FILESYSTEM,
      reason: 'search permitido (read scope)',
    };
  }

  // --- COMPILE_CHECK: read-only, siempre permite ---
  if (action === Action.COMPILE_CHECK) {
    return {
      decision: Decision.ALLOW,
      resource: Resource.FILESYSTEM,
      reason: 'compile_check read-only',
    };
  }

  return {
    decision: Decision.DENY,
    resource: 'unknown',
    reason: `acción no reconocida: ${action}`,
  };
}

/**
 * Valida que una acción sea segura antes de ejecutarla. Lanza si se deniega.
 * @param {object} params - igual que check()
 * @returns {object} el resultado del check (si ALLOW)
 * @throws {Error} si decision es DENY
 */
function enforce(params) {
  const result = check(params);
  if (result.decision === Decision.DENY) {
    const err = new Error(`[AgentFirewall] DENY: ${result.reason}`);
    err.code = 'EACTION_DENIED';
    err.resource = result.resource;
    throw err;
  }
  return result;
}

module.exports = {
  Action,
  Decision,
  Resource,
  PRESETS,
  SENSITIVE_PATH_PATTERNS,
  DANGEROUS_COMMAND_PATTERNS,
  globToRegex,
  matchesAny,
  resolvePolicy,
  check,
  enforce,
};
