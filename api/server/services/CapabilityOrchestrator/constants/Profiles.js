/**
 * Capability Orchestrator - Perfiles Predefinidos
 *
 * Perfiles de configuración predefinidos que pueden aplicarse
 * a los usuarios para una configuración rápida.
 */

const { ExecutionModes, Strategies, Capabilities } = require('./Types');

/**
 * Perfiles predefinidos
 */
const PROFILES = {
  // === DESARROLLO ===
  development: {
    id: 'development',
    name: 'Desarrollo',
    description: 'Optimizado para desarrollo de software',
    icon: '💻',

    mode: ExecutionModes.SPECIALIZED,
    strategy: Strategies.PRIORITY,

    filters: {
      maxLatency: 5000,
      maxCostPer1K: 0.01,
    },

    defaultRoles: [
      {
        id: 'programming',
        name: 'Programación',
        requiredCapabilities: [
          Capabilities.CODE,
          Capabilities.REASONING,
          Capabilities.TOOL_CALLING,
        ],
        strategy: 'priority',
        modelPriorities: [],
      },
      {
        id: 'review',
        name: 'Code Review',
        requiredCapabilities: [Capabilities.CODE, Capabilities.ANALYSIS, Capabilities.SECURITY],
        strategy: 'priority',
        modelPriorities: [],
      },
      {
        id: 'debug',
        name: 'Debugging',
        requiredCapabilities: [Capabilities.CODE, Capabilities.REASONING, Capabilities.ANALYSIS],
        strategy: 'priority',
        modelPriorities: [],
      },
    ],
  },

  // === INVESTIGACIÓN ===
  research: {
    id: 'research',
    name: 'Investigación',
    description: 'Análisis profundo y razonamiento complejo',
    icon: '🔬',

    mode: ExecutionModes.INTELLIGENT,
    strategy: Strategies.REASONING,

    filters: {
      minContext: 100000,
      maxLatency: 15000,
    },

    defaultRoles: [
      {
        id: 'analysis',
        name: 'Análisis',
        requiredCapabilities: [
          Capabilities.REASONING,
          Capabilities.ANALYSIS,
          Capabilities.LONG_CONTEXT,
        ],
        strategy: 'reasoning',
        modelPriorities: [],
      },
      {
        id: 'research',
        name: 'Investigación',
        requiredCapabilities: [Capabilities.SEARCH, Capabilities.ANALYSIS, Capabilities.REASONING],
        strategy: 'auto',
        modelPriorities: [],
      },
    ],
  },

  // === BAJO COSTO ===
  cost_effective: {
    id: 'cost_effective',
    name: 'Bajo Costo',
    description: 'Minimizar gastos manteniendo calidad',
    icon: '💰',

    mode: ExecutionModes.SPECIALIZED,
    strategy: Strategies.COST,

    filters: {
      maxCostPer1K: 0.001,
      allowedProviders: ['groq', 'deepseek', 'cloudflare', 'mistral'],
    },

    defaultRoles: [
      {
        id: 'chat',
        name: 'Chat',
        requiredCapabilities: [Capabilities.CHAT],
        strategy: 'cost',
        modelPriorities: [],
      },
    ],
  },

  // === ALTA CALIDAD ===
  high_quality: {
    id: 'high_quality',
    name: 'Alta Calidad',
    description: 'Mejor resultado posible sin importar costo',
    icon: '⭐',

    mode: ExecutionModes.INTELLIGENT,
    strategy: Strategies.REASONING,

    filters: {
      // Sin límites de costo
    },

    defaultRoles: [
      {
        id: 'default',
        name: 'General',
        requiredCapabilities: [Capabilities.CHAT, Capabilities.REASONING],
        strategy: 'priority',
        modelPriorities: [],
      },
    ],
  },

  // === LOCAL ===
  local: {
    id: 'local',
    name: 'Trabajo Local',
    description: 'Usa modelos locales (Ollama, LM Studio)',
    icon: '🏠',

    mode: ExecutionModes.SPECIALIZED,
    strategy: Strategies.FIXED,

    filters: {
      allowedProviders: ['ollama', 'lmstudio'],
    },

    defaultRoles: [
      {
        id: 'chat',
        name: 'Chat Local',
        requiredCapabilities: [Capabilities.CHAT, Capabilities.REASONING],
        strategy: 'fixed',
        modelPriorities: [],
      },
    ],
  },

  // === HÍBRIDO ===
  hybrid: {
    id: 'hybrid',
    name: 'Híbrido',
    description: 'Combina proveedores locales y cloud',
    icon: '🌐',

    mode: ExecutionModes.INTELLIGENT,
    strategy: Strategies.AUTO,

    defaultRoles: [
      {
        id: 'default',
        name: 'General',
        requiredCapabilities: [Capabilities.CHAT],
        strategy: 'auto',
        modelPriorities: [],
      },
    ],
  },

  // === PRODUCTIVIDAD ===
  productivity: {
    id: 'productivity',
    name: 'Productividad',
    description: 'Balance entre velocidad y calidad',
    icon: '⚡',

    mode: ExecutionModes.SPECIALIZED,
    strategy: Strategies.LATENCY,

    filters: {
      maxLatency: 3000,
      maxCostPer1K: 0.005,
    },

    defaultRoles: [
      {
        id: 'writing',
        name: 'Escritura',
        requiredCapabilities: [Capabilities.WRITING, Capabilities.CHAT],
        strategy: 'latency',
        modelPriorities: [],
      },
      {
        id: 'quick',
        name: 'Respuestas Rápidas',
        requiredCapabilities: [Capabilities.CHAT],
        strategy: 'latency',
        modelPriorities: [],
      },
    ],
  },

  // === SEGURIDAD ===
  security: {
    id: 'security',
    name: 'Seguridad',
    description: 'Análisis de seguridad y vulnerabilidades',
    icon: '🔒',

    mode: ExecutionModes.SPECIALIZED,
    strategy: Strategies.PRIORITY,

    filters: {
      // Sin límites
    },

    defaultRoles: [
      {
        id: 'audit',
        name: 'Auditoría',
        requiredCapabilities: [Capabilities.SECURITY, Capabilities.CODE, Capabilities.ANALYSIS],
        strategy: 'priority',
        modelPriorities: [],
      },
      {
        id: 'penetration',
        name: 'Pentesting',
        requiredCapabilities: [Capabilities.SECURITY, Capabilities.REASONING, Capabilities.CODE],
        strategy: 'priority',
        modelPriorities: [],
      },
    ],
  },
};

// Freeze para evitar modificaciones
Object.freeze(PROFILES);

/**
 * Obtener perfil por ID
 */
function getProfile(profileId) {
  return PROFILES[profileId] || null;
}

/**
 * Listar todos los perfiles
 */
function listProfiles() {
  return Object.values(PROFILES);
}

/**
 * Listar IDs de perfiles
 */
function listProfileIds() {
  return Object.keys(PROFILES);
}

/**
 * Verificar si existe un perfil
 */
function hasProfile(profileId) {
  return profileId in PROFILES;
}

/**
 * Obtener perfil para un caso de uso
 */
function getProfileForUseCase(useCase) {
  const mapping = {
    coding: 'development',
    programming: 'development',
    debugging: 'development',
    research: 'research',
    analysis: 'research',
    cheap: 'cost_effective',
    budget: 'cost_effective',
    quality: 'high_quality',
    local: 'local',
    offline: 'local',
    hybrid: 'hybrid',
    fast: 'productivity',
    productivity: 'productivity',
    security: 'security',
    audit: 'security',
  };

  const profileId = mapping[useCase?.toLowerCase()];
  return profileId ? PROFILES[profileId] : null;
}

module.exports = {
  PROFILES,
  getProfile,
  listProfiles,
  listProfileIds,
  hasProfile,
  getProfileForUseCase,
};
