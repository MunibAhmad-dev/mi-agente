# 🔗 Especificación: Integración con LLMGateway Existente

**Fecha:** 2026-07-20  
**Propósito:** Definir cómo CapabilityOrchestrator coexiste con LLMGateway

---

## 1. ARQUITECTURA DE CONVIVENCIA

### 1.1 Diagrama de Integración

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT REQUEST                                       │
│                         { messages, options }                                     │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          OrchestratorFacade 🆕                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        FEATURE FLAG CHECK                                │  │
│  │  if (user.useCapabilityEngine || global.useCapabilityEngine) {       │  │
│  │    → CapabilityOrchestrator.process()                                  │  │
│  │  } else {                                                             │  │
│  │    → LegacyLLMGateway.complete()                                       │  │
│  │  }                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              ▼                         ▼                         ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│ CapabilityOrchestrator│    │     LLMGateway       │    │     LLMGateway       │
│    (Nuevo)          │    │   (Adaptado)        │    │    (Original)        │
│                     │    │                      │    │                      │
│ ┌────────────────┐ │    │ ┌────────────────┐ │    │ ┌────────────────┐ │
│ │ ModelRegistry  │ │    │ │ LLMGateway     │ │    │ │ complete()    │ │
│ │ StrategyEngine │ │    │ │ (modificado)   │ │    │ │ selectProv.. │ │
│ │ ConfigService  │ │    │ │                │ │    │ │ getFallback() │ │
│ └────────────────┘ │    │ │ ← usa LLMGateway│ │    │ └────────────────┘ │
│         │         │    │ │   Providers     │ │    │                      │
│         └─────────│────│─│────────────────│─│────│─────────────────────│
│                   │    │ └────────────────┘ │    └──────────────────────┘
└───────────────────┼────┼───────────────────┼─────────────────────────────────┘
                    │     │                   │
                    ▼     ▼                   ▼
            ┌───────────────────────────────────────────────────┐
            │              Provider Adapters                      │
            │  Groq │ DeepSeek │ Anthropic │ Gemini │ Ollama  │
            └───────────────────────────────────────────────────┘
```

### 1.2 Clases de Integración

```javascript
// api/server/services/CapabilityOrchestrator/
// ├── OrchestratorFacade.js 🆕
// ├── CapabilityOrchestrator.js
// ├── adapters/
// │   ├── LLMGatewayAdapter.js 🆕
// │   └── ProviderAdapter.js
// └── ...

/**
 * OrchestratorFacade - Punto de entrada unificado
 * Decide si usar CapabilityOrchestrator o LegacyLLMGateway
 */
class OrchestratorFacade {
  constructor(options = {}) {
    // Feature flags
    this.globalFlag = process.env.USE_CAPABILITY_ENGINE === 'true';
    this.defaultToNew = options.defaultToNew ?? false;
    
    // Instanciar ambos
    this.capabilityOrchestrator = new CapabilityOrchestrator({
      // Dependencies...
    });
    
    this.legacyGateway = new LegacyLLMGateway({
      // Existing config...
    });
  }
  
  /**
   * Procesar request - delega al motor apropiado
   */
  async process(context) {
    const shouldUseNew = await this.shouldUseCapabilityEngine(context);
    
    if (shouldUseNew) {
      logger.info('[OrchestratorFacade] Using CapabilityOrchestrator');
      return this.capabilityOrchestrator.process(context);
    }
    
    logger.info('[OrchestratorFacade] Using LegacyLLMGateway');
    return this.legacyGateway.complete(this.convertToLegacy(context));
  }
  
  /**
   * Determinar qué motor usar
   */
  async shouldUseCapabilityEngine(context) {
    // 1. Verificar flag global
    if (this.globalFlag) return true;
    
    // 2. Verificar flag del usuario
    if (context.userId) {
      const userConfig = await this.getUserConfig(context.userId);
      if (userConfig?.useCapabilityEngine) return true;
    }
    
    // 3. Usar default
    return this.defaultToNew;
  }
  
  /**
   * Convertir contexto nuevo a formato legacy
   */
  convertToLegacy(context) {
    return {
      messages: context.messages,
      model: context.options?.model || context.options?.preferredModel,
      provider: context.options?.provider,
      temperature: context.options?.temperature,
      maxTokens: context.options?.maxTokens,
      stream: context.options?.stream,
      userId: context.userId
    };
  }
}
```

### 1.3 LLMGatewayAdapter

```javascript
// api/server/services/CapabilityOrchestrator/adapters/LLMGatewayAdapter.js

/**
 * LLMGatewayAdapter - Permite usar LLMGateway como executor
 * dentro de CapabilityOrchestrator
 */
class LLMGatewayAdapter {
  constructor(llmGateway) {
    this.gateway = llmGateway;
  }
  
  /**
   * Ejecutar en un modelo específico
   */
  async execute({ modelId, messages, parameters }) {
    // Parse modelId: "provider/model-name" → provider, model
    const { provider, model } = this.parseModelId(modelId);
    
    return this.gateway.complete({
      model,
      provider,
      messages,
      temperature: parameters?.temperature,
      maxTokens: parameters?.maxTokens
    });
  }
  
  /**
   * Listar modelos disponibles (delegar a gateway)
   */
  async listModels() {
    return Object.entries(this.gateway.providers).flatMap(([provider, data]) =>
      data.models.map(model => ({
        id: `${provider}/${model}`,
        provider,
        model,
        capabilities: data.capabilities || [],
        health: data.health
      }))
    );
  }
  
  /**
   * Verificar salud de un modelo
   */
  async healthCheck(modelId) {
    const { provider } = this.parseModelId(modelId);
    return this.gateway.providers[provider]?.health === 'healthy';
  }
  
  /**
   * Parsear modelId
   */
  parseModelId(modelId) {
    // Formato: "provider/model-name"
    const parts = modelId.split('/');
    return {
      provider: parts[0],
      model: parts.slice(1).join('/')
    };
  }
}
```

---

## 2. MIGRACIÓN GRADUAL

### 2.1 Estrategia de Migración

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              MIGRATION PHASES                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  FASE 0: Coexistencia (NOW)                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────────┐    ┌─────────────────┐                            │  │
│  │  │ Capability     │    │ LLMGateway      │  ← Ambos activos          │  │
│  │  │ Orchestrator   │    │ (Legacy)        │                            │  │
│  │  └─────────────────┘    └─────────────────┘                            │  │
│  │           │                      │                                      │  │
│  │           └──────────┬───────────┘                                      │  │
│  │                      ▼                                                   │  │
│  │              OrchestratorFacade                                          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  FASE 1: Opt-in (Mes 1)                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  • Usuarios pueden activar Capability Engine en settings               │  │
│  │  • Feature flag por usuario                                           │  │
│  │  • Métricas comparativas                                              │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  FASE 2: Opt-out (Mes 3)                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  • Nuevo sistema activo por defecto                                    │  │
│  │  • Usuarios pueden desactivarlo                                        │  │
│  │  • LLMGateway legacy empieza a deprecated                             │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  FASE 3: Deprecation (Mes 6)                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  • LLMGateway legacy marcado como deprecated                          │  │
│  │  • Usuarios con legacy reciben migración guiada                        │  │
│  │  • Métricas: % de usuarios en nuevo sistema                          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  FASE 4: Legacy Removal (Mes 12)                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  • LLMGateway legacy removido del código                              │  │
│  │  • CapabilityOrchestrator es el único motor                           │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Feature Flags

```javascript
// config/featureFlags.js
const FEATURE_FLAGS = {
  // Habilitar nuevo sistema globalmente
  CAPABILITY_ENGINE_ENABLED: {
    env: 'USE_CAPABILITY_ENGINE',
    default: false,
    type: 'boolean',
    rollout: 0 // % de usuarios (0 = off)
  },
  
  // Modo de migración
  MIGRATION_MODE: {
    env: 'MIGRATION_MODE',
    default: 'opt-in', // 'opt-in' | 'opt-out' | 'forced'
    type: 'string',
    options: ['opt-in', 'opt-out', 'forced']
  },
  
  // Estrategias habilitadas
  STRATEGY_CONSENSUS: {
    env: 'ENABLE_CONSENSUS_STRATEGY',
    default: false,
    type: 'boolean'
  },
  
  STRATEGY_PARALLEL: {
    env: 'ENABLE_PARALLEL_STRATEGY',
    default: false,
    type: 'boolean'
  },
  
  // Proveedores adicionales
  ENABLE_LOCAL_PROVIDERS: {
    env: 'ENABLE_LOCAL_PROVIDERS',
    default: false,
    type: 'boolean'
  }
};

// Helper para verificar flags
function isEnabled(flag, userContext = {}) {
  const flagConfig = FEATURE_FLAGS[flag];
  if (!flagConfig) return false;
  
  const envValue = process.env[flagConfig.env];
  if (envValue !== undefined) {
    return flagConfig.type === 'boolean' 
      ? envValue === 'true' 
      : envValue;
  }
  
  // Rollout gradual
  if (flagConfig.rollout > 0 && userContext.userId) {
    const hash = hashString(userContext.userId);
    return (hash % 100) < flagConfig.rollout;
  }
  
  return flagConfig.default;
}
```

---

## 3. RUTEO CONDICIONAL

### 3.1 Lógica de Routing

```javascript
// api/server/services/CapabilityOrchestrator/RequestRouter.js

class RequestRouter {
  constructor(orchestrator, legacyGateway) {
    this.orchestrator = orchestrator;
    this.legacyGateway = legacyGateway;
  }
  
  /**
   * Determinar destino del request
   */
  async route(context) {
    // 1. Verificar tipo de request
    const requestType = this.classifyRequest(context);
    
    // 2. Verificar disponibilidad
    const orchestratorAvailable = await this.checkOrchestratorHealth();
    const legacyAvailable = await this.checkLegacyHealth();
    
    if (!orchestratorAvailable && !legacyAvailable) {
      throw new Error('No LLM backend available');
    }
    
    // 3. Reglas de routing
    return this.applyRoutingRules(context, requestType, {
      orchestratorAvailable,
      legacyAvailable
    });
  }
  
  /**
   * Clasificar tipo de request
   */
  classifyRequest(context) {
    // Request simple (1 mensaje)
    if (context.messages.length === 1) {
      return 'simple';
    }
    
    // Request con herramientas
    if (context.options?.tools?.length > 0) {
      return 'tool_calling';
    }
    
    // Request de streaming
    if (context.options?.stream) {
      return 'streaming';
    }
    
    // Request multi-modelo
    if (context.options?.multiModel || context.options?.strategy === 'consensus') {
      return 'multi_model';
    }
    
    // Default
    return 'standard';
  }
  
  /**
   * Aplicar reglas de routing
   */
  applyRoutingRules(context, requestType, availability) {
    const rules = [
      // Regla 1: Si orchestrator no disponible, usar legacy
      () => {
        if (!availability.orchestratorAvailable) {
          return { target: 'legacy', reason: 'orchestrator_unavailable' };
        }
      },
      
      // Regla 2: Request simple → puede usar cualquiera
      () => {
        if (requestType === 'simple' && isEnabled('CAPABILITY_ENGINE_ENABLED', context)) {
          return { target: 'orchestrator', reason: 'simple_request' };
        }
      },
      
      // Regla 3: Tool calling → requiere orchestrator
      () => {
        if (requestType === 'tool_calling' && availability.orchestratorAvailable) {
          return { target: 'orchestrator', reason: 'tool_calling_required' };
        }
      },
      
      // Regla 4: Multi-model → requiere orchestrator
      () => {
        if (requestType === 'multi_model' && availability.orchestratorAvailable) {
          return { target: 'orchestrator', reason: 'multi_model_required' };
        }
      },
      
      // Regla 5: Streaming → puede usar legacy (más estable)
      () => {
        if (requestType === 'streaming') {
          return { target: 'legacy', reason: 'streaming_more_stable' };
        }
      },
      
      // Regla 6: Por feature flag
      () => {
        if (isEnabled('CAPABILITY_ENGINE_ENABLED', context)) {
          return { target: 'orchestrator', reason: 'feature_flag' };
        }
      },
      
      // Default: Legacy
      () => {
        return { target: 'legacy', reason: 'default' };
      }
    ];
    
    for (const rule of rules) {
      const result = rule();
      if (result) return result;
    }
  }
}
```

---

## 4. SINCRONIZACIÓN DE DATOS

### 4.1 Migración de Configuraciones

```javascript
// scripts/migrate-to-capability-engine.js

/**
 * Migrar configuraciones de usuario de formato legacy a nuevo formato
 */
async function migrateUserConfig(userId) {
  const User = mongoose.model('User');
  const MultiLLMConfig = mongoose.model('MultiLLMConfig');
  
  // 1. Obtener usuario
  const user = await User.findById(userId);
  if (!user) throw new Error(`User ${userId} not found`);
  
  // 2. Verificar si ya migró
  const existingConfig = await MultiLLMConfig.findOne({ userId });
  if (existingConfig) {
    return { status: 'already_migrated', config: existingConfig };
  }
  
  // 3. Extraer settings legacy
  const legacyModel = user.settings?.defaultModel || 'groq/llama-3.3-70b-versatile';
  const legacyTemp = user.settings?.defaultTemperature ?? 0.7;
  
  // 4. Parsear provider/model
  const [provider, model] = legacyModel.split('/');
  
  // 5. Crear nueva config
  const newConfig = new MultiLLMConfig({
    userId,
    version: '1.0',
    migratedFrom: 'legacy',
    migratedAt: new Date(),
    
    // Config simple (Modo Simple por defecto en migración)
    mode: 'simple',
    strategy: 'fixed',
    
    // Un modelo activo
    activeModels: [{
      modelId: `${provider}/${model}`,
      enabled: true,
      priority: 100,
      parameters: {
        temperature: legacyTemp,
        maxTokens: user.settings?.maxTokens || 4096
      }
    }],
    
    // Roles por defecto
    roles: [{
      id: 'default',
      name: 'Default',
      requiredCapabilities: ['chat'],
      strategy: 'fixed',
      models: [{ modelId: `${provider}/${model}`, priority: 100 }]
    }],
    
    // Sin filtros
    filters: {}
  });
  
  // 6. Guardar
  await newConfig.save();
  
  // 7. Marcar usuario como migrado
  user.flags = user.flags || {};
  user.flags.capabilityEngineMigrated = true;
  user.flags.useCapabilityEngine = false; // Opt-in initially
  await user.save();
  
  return { status: 'migrated', config: newConfig };
}

/**
 * Migración batch
 */
async function migrateAllUsers(batchSize = 100) {
  const User = mongoose.model('User');
  const MultiLLMConfig = mongoose.model('MultiLLMConfig');
  
  let cursor = User.find({ 
    'flags.capabilityEngineMigrated': { $ne: true }
  }).cursor();
  
  let migrated = 0;
  let errors = 0;
  
  for await (const user of cursor) {
    try {
      await migrateUserConfig(user._id);
      migrated++;
      
      // Log progreso
      if (migrated % batchSize === 0) {
        logger.info(`Migrated ${migrated} users`);
      }
    } catch (error) {
      errors++;
      logger.error(`Error migrating user ${user._id}:`, error.message);
    }
  }
  
  return { migrated, errors };
}
```

### 4.2 Rollback

```javascript
/**
 * Rollback de migración
 */
async function rollbackMigration(userId) {
  const User = mongoose.model('User');
  const MultiLLMConfig = mongoose.model('MultiLLMConfig');
  
  // 1. Obtener config nueva
  const newConfig = await MultiLLMConfig.findOne({ userId });
  if (!newConfig) {
    return { status: 'not_migrated' };
  }
  
  // 2. Extraer modelo legacy
  const primaryModel = newConfig.activeModels.find(m => m.enabled);
  const legacyModelId = primaryModel ? primaryModel.modelId : 'groq/llama-3.3-70b-versatile';
  
  // 3. Restaurar settings de usuario
  const [provider, model] = legacyModelId.split('/');
  
  await User.findByIdAndUpdate(userId, {
    $set: {
      'settings.defaultModel': `${provider}/${model}`,
      'settings.defaultTemperature': primaryModel?.parameters?.temperature || 0.7,
      'settings.maxTokens': primaryModel?.parameters?.maxTokens || 4096
    },
    $unset: {
      'flags.capabilityEngineMigrated': '',
      'flags.useCapabilityEngine': ''
    }
  });
  
  // 4. Eliminar config nueva
  await MultiLLMConfig.deleteOne({ userId });
  
  // 5. Guardar snapshot para poder restaurar de nuevo
  await saveRollbackSnapshot(userId, newConfig);
  
  return { status: 'rolled_back' };
}
```

---

## 5. MONITOREO COMPARATIVO

### 5.1 Métricas de Validación

```javascript
// metrics/capability-engine-metrics.js

const METRICS = {
  // Contadores
  REQUESTS_NEW_SYSTEM: 'capability_engine_requests_total',
  REQUESTS_LEGACY: 'legacy_gateway_requests_total',
  
  // Latencia
  LATENCY_NEW_P50: 'capability_engine_latency_p50',
  LATENCY_NEW_P95: 'capability_engine_latency_p95',
  LATENCY_LEGACY_P50: 'legacy_gateway_latency_p50',
  LATENCY_LEGACY_P95: 'legacy_gateway_latency_p95',
  
  // Errores
  ERRORS_NEW_SYSTEM: 'capability_engine_errors_total',
  ERRORS_LEGACY: 'legacy_gateway_errors_total',
  
  // Calidad de respuestas (si se implementa)
  RESPONSE_QUALITY_NEW: 'capability_engine_response_quality',
  RESPONSE_QUALITY_LEGACY: 'legacy_response_quality'
};

/**
 * Registrar métricas para comparación
 */
async function recordMetrics(request, result, target) {
  const labels = {
    target, // 'orchestrator' | 'legacy'
    userId: request.userId,
    model: result.modelId
  };
  
  // Incrementar contador
  metrics.increment(
    target === 'orchestrator' ? METRICS.REQUESTS_NEW_SYSTEM : METRICS.REQUESTS_LEGACY,
    labels
  );
  
  // Registrar latencia
  const latencyBucket = getLatencyBucket(result.latency);
  metrics.histogram(
    target === 'orchestrator' ? METRICS.LATENCY_NEW_P50 : METRICS.LATENCY_LEGACY_P50,
    result.latency,
    labels
  );
}

/**
 * Generar reporte comparativo
 */
async function generateComparisonReport(dateRange) {
  const report = {
    period: dateRange,
    generated: new Date(),
    
    summary: {
      newSystemRequests: await getTotal(METRICS.REQUESTS_NEW_SYSTEM, dateRange),
      legacyRequests: await getTotal(METRICS.REQUESTS_LEGACY, dateRange),
      adoptionRate: calculateAdoptionRate()
    },
    
    latency: {
      newSystem: {
        p50: await getPercentile(METRICS.LATENCY_NEW_P50, 50),
        p95: await getPercentile(METRICS.LATENCY_NEW_P95, 95)
      },
      legacy: {
        p50: await getPercentile(METRICS.LATENCY_LEGACY_P50, 50),
        p95: await getPercentile(METRICS.LATENCY_LEGACY_P95, 95)
      }
    },
    
    errors: {
      newSystem: await getTotal(METRICS.ERRORS_NEW_SYSTEM, dateRange),
      legacy: await getTotal(METRICS.ERRORS_LEGACY, dateRange),
      newSystemRate: await calculateErrorRate(METRICS.ERRORS_NEW_SYSTEM, METRICS.REQUESTS_NEW_SYSTEM),
      legacyRate: await calculateErrorRate(METRICS.ERRORS_LEGACY, METRICS.REQUESTS_LEGACY)
    }
  };
  
  return report;
}
```

---

## 6. PRÓXIMOS PASOS

### 6.1 Checklist de Implementación

```markdown
## Antes de implementar SPEC-INTEGRATION:

- [ ] Crear OrchestratorFacade
- [ ] Crear LLMGatewayAdapter
- [ ] Implementar feature flags
- [ ] Implementar RequestRouter
- [ ] Crear script de migración
- [ ] Crear script de rollback
- [ ] Implementar métricas comparativas
- [ ] Tests de integración
- [ ] Tests E2E de migración
```

### 6.2 Dependencias

Este documento depende de:
- SPEC-SCHEMA.md (schema simplificado)
- SPEC-CONTAINER.md (service container)

Sin estos, la implementación de integración está incompleta.

---

## 7. CONCLUSIÓN

Esta especificación define claramente cómo el nuevo CapabilityOrchestrator coexistirá con el LLMGateway legacy, permitiendo:

1. **Migración gradual** - Sin big bang
2. **Rollback seguro** - Si algo falla
3. **Feature flags** - Control granular
4. **Monitoreo comparativo** - Validar mejora

La arquitectura de fachada (Facade) permite que ambos sistemas existan en paralelo, con routing inteligente basado en disponibilidad, tipo de request, y feature flags.
