/**
 * Capability Router - Selección de Runtime/Provider/Modelo por capacidades (JavaScript)
 *
 * Responsabilidades:
 * - Analizar requerimientos de capacidad
 * - Seleccionar el mejor runtime disponible
 * - Seleccionar el mejor provider para la tarea
 * - Seleccionar el modelo óptimo
 *
 * FLUJO:
 * Solicitud → CapabilityRouter → RuntimeRegistry + ProviderRegistry
 */

const { getEventBus, EventType } = require('../EventBus');
const { getRuntimeRegistry, Capability } = require('../RuntimeRegistry');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const logger = {
  debug: (...args) => console.log('[CapabilityRouter]', ...args),
  info: (...args) => console.log('[CapabilityRouter]', ...args),
  warn: (...args) => console.warn('[CapabilityRouter]', ...args),
  error: (...args) => console.error('[CapabilityRouter]', ...args),
};

/**
 * Estrategia de selección
 */
const SelectionStrategy = {
  COST: 'cost', // Priorizar menor costo
  LATENCY: 'latency', // Priorizar menor latencia
  QUALITY: 'quality', // Priorizar mejor calidad
  AVAILABILITY: 'availability', // Priorizar disponibilidad
  HYBRID: 'hybrid', // Balance de factores
};

/**
 * Configuración de provider por capacidad
 * 
 * Incluye GPT (OpenAI) y Grok (xAI) como opciones principales.
 * Fallback chain: GPT → Grok → Groq → OpenRouter
 */
const DEFAULT_MODEL_CONFIG = {
  [Capability.LLM_CHAT]: {
    primary: { provider: 'openai', model: 'gpt-4o-mini' },
    fallback: [
      { provider: 'xai', model: 'grok-4-0709-fast' },
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'gemini', model: 'gemini-2.0-flash' },
    ],
  },
  [Capability.LLM_VISION]: {
    primary: { provider: 'openai', model: 'gpt-4o-mini' },
    fallback: [
      { provider: 'xai', model: 'grok-4-0709' },
      { provider: 'openrouter', model: 'anthropic/claude-3-sonnet' },
    ],
  },
  [Capability.LLM_REASONING]: {
    primary: { provider: 'openai', model: 'o3' },
    fallback: [
      { provider: 'xai', model: 'grok-4-0709' },
      { provider: 'openrouter', model: 'anthropic/claude-3-opus' },
    ],
  },
  [Capability.CODE_EXECUTION]: {
    primary: { provider: 'openai', model: 'gpt-4o-mini' },
    fallback: [
      { provider: 'xai', model: 'grok-4.5' },
      { provider: 'deepseek', model: 'deepseek-coder' },
    ],
  },
  [Capability.IMAGE_GENERATION]: {
    primary: { provider: 'openai', model: 'gpt-image-1' },
    fallback: [],
  },
  [Capability.WEB_SEARCH]: {
    primary: { provider: 'xai', model: 'grok-4-0709' },
    fallback: [
      { provider: 'perplexity', model: 'sonar' },
      { provider: 'openrouter', model: 'openai/gpt-4o-search' },
    ],
  },
  [Capability.BROWSER_AUTOMATION]: {
    primary: { provider: 'internal', model: 'browser-runtime' },
    fallback: [],
  },
};

/**
 * Capability Router
 */
class CapabilityRouter {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.registry = getRuntimeRegistry();
    this.modelConfig = { ...DEFAULT_MODEL_CONFIG, ...config.modelConfig };
    this.strategy = config.strategy || SelectionStrategy.HYBRID;

    logger.info('[CapabilityRouter] Initialized');
  }

  /**
   * Determinar capacidades requeridas basadas en la intención
   */
  detectCapabilities(intent, options = {}) {
    const capabilities = [Capability.LLM_CHAT]; // Siempre requerido
    const content = (intent || '').toLowerCase();

    // Detección por palabras clave
    if (
      content.includes('codigo') ||
      content.includes('programa') ||
      content.includes('debug') ||
      content.includes('funcion')
    ) {
      capabilities.push(Capability.CODE_EXECUTION);
    }

    if (
      content.includes('imagen') ||
      content.includes('foto') ||
      content.includes('dibuja') ||
      content.includes('genera')
    ) {
      capabilities.push(Capability.IMAGE_GENERATION);
    }

    if (content.includes('video')) {
      capabilities.push(Capability.VIDEO_GENERATION);
    }

    if (content.includes('busca') || content.includes('internet') || content.includes('web')) {
      capabilities.push(Capability.WEB_SEARCH);
    }

    if (content.includes('archivo') || content.includes('lee') || content.includes('escribe')) {
      capabilities.push(Capability.CODE_FILESYSTEM);
    }

    if (content.includes('naveg') || content.includes('click') || content.includes('pagina')) {
      capabilities.push(Capability.BROWSER_AUTOMATION);
    }

    if (content.includes('habla') || content.includes('audio') || content.includes('voz')) {
      capabilities.push(Capability.AUDIO_TTS);
    }

    // Si hay capacidades explícitas, usarlas
    if (options.capabilities && options.capabilities.length > 0) {
      return [...new Set([...capabilities, ...options.capabilities])];
    }

    return capabilities;
  }

  /**
   * Seleccionar el mejor runtime para las capacidades requeridas
   */
  selectRuntime(requiredCapabilities) {
    const runtime = this.registry.findForTask(requiredCapabilities);

    if (runtime) {
      this.eventBus.publish(
        EventType.RUNTIME_SELECTED,
        {
          capabilities: requiredCapabilities,
          runtime: runtime.name,
        },
        'CapabilityRouter',
      );

      return runtime;
    }

    // Fallback a LLM por defecto
    return { name: 'LLMRuntime', type: 'llm' };
  }

  /**
   * Seleccionar provider y modelo basado en capacidades
   */
  selectProvider(capabilities, constraints = {}) {
    // Prioridad: constraints > capabilities > default
    const primaryCapability = Array.isArray(capabilities) ? capabilities[0] : capabilities;
    const config = this.modelConfig[primaryCapability] || this.modelConfig[Capability.LLM_CHAT];

    // Verificar si el provider está en excluidos
    const isExcluded = (provider) => {
      return constraints.excludedProviders?.includes(provider);
    };

    const isPreferred = (provider) => {
      return constraints.preferredProviders?.includes(provider);
    };

    // Seleccionar provider primario
    let selected = config.primary;

    if (isExcluded(selected.provider) && config.fallback.length > 0) {
      selected = config.fallback.find((f) => !isExcluded(f.provider)) || selected;
    }

    // Priorizar providers preferidos si hay restricciones de costo/latencia
    if (constraints.maxCost || constraints.maxLatency) {
      const allOptions = [config.primary, ...config.fallback].filter(
        (f) => !isExcluded(f.provider),
      );

      if (constraints.preferredProviders?.length) {
        const preferred = allOptions.find((f) => isPreferred(f.provider));
        if (preferred) {
          selected = preferred;
        }
      }
    }

    this.eventBus.publish(
      EventType.PROVIDER_SELECTED,
      {
        capability: primaryCapability,
        provider: selected.provider,
        model: selected.model,
      },
      'CapabilityRouter',
    );

    return selected;
  }

  /**
   * Route principal - toma una decisión completa de routing
   */
  route(requirements) {
    const startTime = Date.now();

    // 1. Determinar capacidades
    const capabilities = this.detectCapabilities(requirements.intent, {
      capabilities: requirements.capabilities,
    });

    // 2. Seleccionar runtime
    const runtime = this.selectRuntime(capabilities);

    // 3. Seleccionar provider y modelo
    const providerConfig = this.selectProvider(capabilities, requirements.constraints);

    // 4. Construir perfil de ejecución
    const executionProfile = {
      id: uuidv4(),
      runtime: runtime.name,
      provider: providerConfig.provider,
      model: providerConfig.model,
      capabilities: capabilities,
      constraints: requirements.constraints,
      strategy: this.strategy,
    };

    const duration = Date.now() - startTime;

    this.eventBus.publish(
      EventType.CAPABILITY_ROUTED,
      {
        capabilities,
        runtime: runtime.name,
        provider: providerConfig.provider,
        model: providerConfig.model,
        duration,
      },
      'CapabilityRouter',
    );

    return {
      runtime: runtime.name,
      runtimeInstance: runtime,
      provider: providerConfig.provider,
      model: providerConfig.model,
      executionProfile,
      capabilities,
      reason: `Selected based on ${capabilities.length} capabilities`,
      score: 1.0,
      fallbackProviders: providerConfig.fallback?.map((f) => f.provider) || [],
      routingDuration: duration,
    };
  }

  /**
   * Obtener recomendaciones para una capacidad específica
   */
  getRecommendations(capability) {
    const config = this.modelConfig[capability];
    if (!config) {
      return [];
    }

    return [config.primary, ...config.fallback].map((f) => ({
      provider: f.provider,
      model: f.model,
    }));
  }

  /**
   * Actualizar configuración de modelo
   */
  updateModelConfig(capability, config) {
    this.modelConfig[capability] = config;
    logger.info(`[CapabilityRouter] Updated model config for ${capability}`);
  }
}

// Singleton
let routerInstance = null;

function getCapabilityRouter(config) {
  if (!routerInstance) {
    routerInstance = new CapabilityRouter(config);
  }
  return routerInstance;
}

function createCapabilityRouter(config) {
  routerInstance = new CapabilityRouter(config);
  return routerInstance;
}

module.exports = {
  CapabilityRouter,
  getCapabilityRouter,
  createCapabilityRouter,
  Capability,
  SelectionStrategy,
};
