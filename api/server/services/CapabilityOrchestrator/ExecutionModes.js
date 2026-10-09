/**
 * Execution Modes - Modos de ejecución del Orchestrator
 *
 * Implementa los tres modos de ejecución:
 * - Simple: Un modelo para todo
 * - Specialized: Modelos por rol/tarea
 * - Intelligent: Routing automático
 */

const { ExecutionModes, Capabilities } = require('./constants/Types');

/**
 * Interfaz base para modos de ejecución
 */
class BaseExecutionMode {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Procesar request
   */
  async execute(context) {
    throw new Error('execute() must be implemented');
  }

  /**
   * Detectar capabilities desde mensajes
   */
  detectCapabilitiesFromMessages(messages) {
    const content = messages
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join(' ')
      .toLowerCase();

    const capabilities = new Set([Capabilities.CHAT]);

    // Detectar código
    if (/\b(code|function|class|implement|debug|refactor|programming)\b/.test(content)) {
      capabilities.add(Capabilities.CODE);
      capabilities.add(Capabilities.REASONING);
    }

    // Detectar análisis
    if (/\b(analyze|review|evaluate|assess|critique|audit)\b/.test(content)) {
      capabilities.add(Capabilities.ANALYSIS);
      capabilities.add(Capabilities.REASONING);
    }

    // Detectar matemáticas
    if (/\b(calculate|math|equation|formula|compute|number)\b/.test(content)) {
      capabilities.add(Capabilities.MATH);
    }

    // Detectar búsqueda
    if (/\b(search|find|lookup|research|information)\b/.test(content)) {
      capabilities.add(Capabilities.SEARCH);
    }

    // Detectar visión
    if (/\b(image|picture|photo|visual|see|look)\b/.test(content)) {
      capabilities.add(Capabilities.VISION);
    }

    // Detectar frontend
    if (/\b(html|css|javascript|react|vue|angular|frontend|ui|design)\b/.test(content)) {
      capabilities.add(Capabilities.FRONTEND);
    }

    // Detectar backend
    if (/\b(api|server|database|backend|sql|mongodb|express)\b/.test(content)) {
      capabilities.add(Capabilities.BACKEND);
    }

    // Detectar DevOps
    if (/\b(deploy|docker|kubernetes|ci\/cd|infrastructure|devops)\b/.test(content)) {
      capabilities.add(Capabilities.DEVOPS);
    }

    // Detectar seguridad
    if (/\b(security|vulnerability|penetration|audit|auth|encrypt)\b/.test(content)) {
      capabilities.add(Capabilities.SECURITY);
    }

    return [...capabilities];
  }
}

/**
 * SimpleExecutionMode - Un modelo para todo
 *
 * Selecciona un modelo fijo basado en la configuración del usuario
 */
class SimpleExecutionMode extends BaseExecutionMode {
  async execute(context) {
    const { configService, modelRegistry } = this.orchestrator.services;

    // Obtener modelo primario del usuario
    const userId = context.userId;
    const config = await configService.getConfig(userId);
    const primaryModel = await configService.getPrimaryModel(userId);

    if (!primaryModel) {
      throw new Error('No model configured. Please configure a model in settings.');
    }

    // Obtener modelo del registry
    const model = modelRegistry.getModel(primaryModel.modelId);

    if (!model) {
      throw new Error(`Model not found: ${primaryModel.modelId}`);
    }

    // Ejecutar
    const result = await this.orchestrator.executeOnModel(model.modelId, {
      messages: context.messages,
      parameters: {
        temperature: primaryModel.temperature ?? 0.7,
        maxTokens: primaryModel.maxTokens ?? 4096,
        topP: primaryModel.topP,
        topK: primaryModel.topK,
      },
    });

    return {
      ...result,
      metadata: {
        ...result.metadata,
        mode: ExecutionModes.SIMPLE,
        strategy: 'fixed',
        modelId: model.modelId,
        modelName: model.name,
      },
    };
  }
}

/**
 * SpecializedExecutionMode - Modelos por rol/tarea
 *
 * Selecciona modelos específicos según el rol o tarea
 */
class SpecializedExecutionMode extends BaseExecutionMode {
  async execute(context) {
    const { configService, modelRegistry, strategyEngine } = this.orchestrator.services;

    const userId = context.userId;

    // Determinar rol
    const roleId = context.options?.role || context.options?.taskType || 'default';

    // Obtener configuración del usuario
    const config = await configService.getConfig(userId);

    // Obtener rol
    const role = configService.getRole(userId, roleId) || {
      id: 'default',
      name: 'Default',
      requiredCapabilities: [Capabilities.CHAT],
      strategy: config.strategy || 'priority',
    };

    // Detectar capabilities si no están definidas
    const capabilities =
      context.options?.capabilities?.length > 0
        ? context.options.capabilities
        : this.detectCapabilitiesFromMessages(context.messages);

    // Encontrar candidatos
    const candidates = modelRegistry.findByCapabilities(capabilities, {
      healthyOnly: true,
      exclude: config.filters?.excludedProviders,
    });

    if (candidates.length === 0) {
      // Fallback al modo simple
      const fallbackMode = new SimpleExecutionMode(this.orchestrator);
      return fallbackMode.execute(context);
    }

    // Aplicar estrategia del rol
    const strategy = role.strategy || config.strategy || 'priority';
    const result = strategyEngine.selectWithFallback({
      candidates,
      config,
      capabilities,
      strategy,
    });

    if (!result.primaryModel) {
      throw new Error('No suitable model found for requested capabilities');
    }

    // Obtener parámetros del modelo
    const activeModel = config.activeModels?.find((m) => m.modelId === result.primaryModel.modelId);

    // Ejecutar
    const response = await this.orchestrator.executeOnModel(result.primaryModel.modelId, {
      messages: context.messages,
      parameters: {
        temperature: activeModel?.temperature ?? 0.7,
        maxTokens: activeModel?.maxTokens ?? 4096,
      },
    });

    return {
      ...response,
      metadata: {
        ...response.metadata,
        mode: ExecutionModes.SPECIALIZED,
        strategy: result.strategy,
        roleId,
        capabilities,
        modelId: result.primaryModel.modelId,
        fallbackAttempted: result.selectedModels.length === 0,
      },
    };
  }
}

/**
 * IntelligentExecutionMode - Routing automático
 *
 * Selecciona automáticamente el mejor modelo según múltiples criterios
 */
class IntelligentExecutionMode extends BaseExecutionMode {
  async execute(context) {
    const { configService, modelRegistry, strategyEngine } = this.orchestrator.services;

    const userId = context.userId;

    // Obtener configuración del usuario
    const config = await configService.getConfig(userId);

    // Detectar capabilities automáticamente
    const capabilities =
      context.options?.capabilities?.length > 0
        ? context.options.capabilities
        : this.detectCapabilitiesFromMessages(context.messages);

    // Estimar tokens
    const estimatedTokens = this.estimateTokens(context.messages);

    // Encontrar candidatos
    const candidates = modelRegistry.findByCapabilities(capabilities, {
      healthyOnly: true,
      maxLatency: config.filters?.maxLatency,
      maxCostPer1K: config.filters?.maxCostPer1K,
      minContext: config.filters?.minContext,
    });

    if (candidates.length === 0) {
      throw new Error('No models available for requested capabilities and constraints');
    }

    // Seleccionar estrategia automáticamente
    const strategy = this.selectOptimalStrategy(capabilities, candidates, config, estimatedTokens);

    // Ejecutar con la estrategia seleccionada
    const result = await strategyEngine.executeWithFallback(
      { candidates, config, capabilities, estimatedTokens, strategy },
      async (candidate) => {
        return this.orchestrator.executeOnModel(candidate.modelId, {
          messages: context.messages,
          parameters: {
            temperature: 0.7,
            maxTokens: Math.min(candidate.maxContext || 4096, estimatedTokens * 2),
          },
        });
      },
    );

    return {
      ...result,
      metadata: {
        ...result.metadata,
        mode: ExecutionModes.INTELLIGENT,
        strategy: result.strategy,
        capabilities,
        estimatedTokens,
        autoSelected: true,
      },
    };
  }

  /**
   * Seleccionar estrategia óptima automáticamente
   */
  selectOptimalStrategy(capabilities, candidates, config, estimatedTokens) {
    // Alta complejidad de razonamiento
    if (
      capabilities.includes(Capabilities.REASONING) ||
      capabilities.includes(Capabilities.ANALYSIS) ||
      capabilities.includes(Capabilities.MATH)
    ) {
      return 'reasoning';
    }

    // Contexto largo
    if (estimatedTokens > 50000 || capabilities.includes(Capabilities.LONG_CONTEXT)) {
      return 'context';
    }

    // Restricción de costo
    if (config.filters?.maxCostPer1K && config.filters.maxCostPer1K < 0.001) {
      return 'cost';
    }

    // Restricción de latencia
    if (config.filters?.maxLatency && config.filters.maxLatency < 2000) {
      return 'latency';
    }

    // Alta calidad requerida
    if (capabilities.includes(Capabilities.CODE)) {
      return 'priority'; // Priorizar modelos de código
    }

    // Default
    return 'priority';
  }

  /**
   * Estimar tokens en los mensajes
   */
  estimateTokens(messages) {
    // Aproximación: 1 token ≈ 4 caracteres
    const totalChars = messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : '';
      return sum + content.length;
    }, 0);

    return Math.ceil(totalChars / 4);
  }
}

/**
 * Factory para crear modos de ejecución
 */
class ExecutionModeFactory {
  static create(mode, orchestrator) {
    switch (mode) {
      case ExecutionModes.SIMPLE:
        return new SimpleExecutionMode(orchestrator);

      case ExecutionModes.SPECIALIZED:
        return new SpecializedExecutionMode(orchestrator);

      case ExecutionModes.INTELLIGENT:
        return new IntelligentExecutionMode(orchestrator);

      default:
        return new SimpleExecutionMode(orchestrator);
    }
  }
}

module.exports = {
  BaseExecutionMode,
  SimpleExecutionMode,
  SpecializedExecutionMode,
  IntelligentExecutionMode,
  ExecutionModeFactory,
};
