# 📋 Plan de Implementación: Multi-LLM Configurable

**Proyecto:** Mi-LibreChat Enterprise  
**Fecha:** 2026-07-20

---

## Resumen de Fases

| Fase | Nombre | Entregable | Semanas | Estado |
|------|--------|-------------|---------|--------|
| 1 | Infrastructure | ConfigService + Schema | 1 | 🟡 Pendiente |
| 2 | Core | MultiLLMOrchestrator | 2 | ⬜ Pendiente |
| 3 | Strategies | StrategyEngine + 8 estrategias | 1.5 | ⬜ Pendiente |
| 4 | UI | MultiLLMConfigPanel | 2 | ⬜ Pendiente |
| 5 | Providers | Adapters (Ollama, LM Studio, LiteLLM) | 1 | ⬜ Pendiente |
| 6 | Testing | Unit + Integration + E2E | 1 | ⬜ Pendiente |
| 7 | Optimization | Performance + Monitoring | 0.5 | ⬜ Pendiente |

**Total estimado:** 8.5 semanas

---

## FASE 1: Infrastructure (ConfigService + Schema)

### Objetivo
Crear la capa de persistencia y configuración sin modificar código existente.

### Archivos a Crear

```
api/server/services/MultiLLM/
├── config/
│   ├── MultiLLMConfigService.js    # Servicio principal
│   ├── ConfigSchema.js             # Schema de validación
│   ├── ConfigPersistence.js         # Persistencia MongoDB
│   └── ConfigDefaults.js           # Valores por defecto
└── index.js
```

### Tasks

- [ ] **1.1** Crear directorio `api/server/services/MultiLLM/`
- [ ] **1.2** Definir `ConfigSchema.js` con Joi/Zod
- [ ] **1.3** Crear `MultiLLMConfigService.js` singleton
- [ ] **1.4** Implementar CRUD operations
- [ ] **1.5** Crear `ConfigPersistence.js` para MongoDB
- [ ] **1.6** Agregar schema a MongoDB (`multiLLMConfigs` collection)
- [ ] **1.7** Implementar migración de config default
- [ ] **1.8** Tests unitarios

### Criterios de Aceptación

```javascript
// Test: ConfigService CRUD
const config = await ConfigService.create({
  userId: 'user123',
  maxActiveModels: 3,
  activeModels: [{ modelId: 'gpt-4o', provider: 'openai' }]
});

const loaded = await ConfigService.get('user123');
assert(loaded.maxActiveModels === 3);
assert(loaded.activeModels.length === 1);
```

### Commits Sugeridos

```
commit 1: "feat(multi-llm): Add MultiLLMConfig schema and validation"
commit 2: "feat(multi-llm): Add MultiLLMConfigService with CRUD operations"
commit 3: "feat(multi-llm): Add MongoDB persistence layer"
```

---

## FASE 2: Core (MultiLLMOrchestrator)

### Objetivo
Extender LLMGateway para soportar múltiples modelos simultáneos.

### Archivos a Crear/Modificar

```
api/server/services/MultiLLM/
├── MultiLLMOrchestrator.js        # Orquestador principal 🆕
├── Registry/
│   ├── ModelRegistry.js          # Registro de modelos 🆕
│   └── ModelMetadata.js          # Metadata normalizada 🆕
├── Executors/
│   ├── BaseExecutor.js           # Clase base 🆕
│   ├── SingleExecutor.js         # Un modelo 🆕
│   ├── ParallelExecutor.js       # Múltiples modelos 🆕
│   └── SequentialExecutor.js     # Chain 🆕
└── index.js
```

### Tasks

- [ ] **2.1** Crear `ModelRegistry.js` con modelo de datos
- [ ] **2.2** Implementar `ModelMetadata.js` para metadata normalizada
- [ ] **2.3** Crear `BaseExecutor.js` abstracto
- [ ] **2.4** Implementar `SingleExecutor.js` (modelo único)
- [ ] **2.5** Implementar `ParallelExecutor.js` (múltiples)
- [ ] **2.6** Implementar `SequentialExecutor.js` (chain)
- [ ] **2.7** Crear `MultiLLMOrchestrator.js` principal
- [ ] **2.8** Integrar con LLMGateway existente
- [ ] **2.9** Implementar fallback chain
- [ ] **2.10** Tests unitarios e integración

### Criterios de Aceptación

```javascript
// Test: SingleExecutor
const executor = new SingleExecutor(config);
const result = await executor.execute({
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'gpt-4o'
});
assert(result.content);

// Test: ParallelExecutor
const parallel = new ParallelExecutor(config);
const results = await parallel.execute({
  messages: [{ role: 'user', content: 'Hello' }],
  models: ['gpt-4o', 'claude-3-5-sonnet']
});
assert(results.responses.length === 2);
```

### Commits Sugeridos

```
commit 4: "feat(multi-llm): Add ModelRegistry and metadata normalization"
commit 5: "feat(multi-llm): Add executor classes (Single, Parallel, Sequential)"
commit 6: "feat(multi-llm): Add MultiLLMOrchestrator with routing"
commit 7: "test(multi-llm): Add orchestrator tests"
```

---

## FASE 3: Strategies (StrategyEngine)

### Objetivo
Implementar motor de estrategias con 8 estrategias configurables.

### Archivos a Crear

```
api/server/services/MultiLLM/
├── Strategies/
│   ├── StrategyEngine.js          # Motor de estrategias 🆕
│   ├── BaseStrategy.js           # Clase base 🆕
│   ├── strategies/
│   │   ├── FixedStrategy.js     # Modelo fijo 🆕
│   │   ├── RoundRobinStrategy.js # Rotación 🆕
│   │   ├── PriorityStrategy.js   # Por prioridad 🆕
│   │   ├── LatencyStrategy.js   # Menor latencia 🆕
│   │   ├── CostStrategy.js      # Menor costo 🆕
│   │   ├── ContextStrategy.js   # Mayor contexto 🆕
│   │   ├── ReasoningStrategy.js # Mejor razonamiento 🆕
│   │   ├── ConsensusStrategy.js # Consenso 🆕
│   │   └── AutoStrategy.js      # Automático 🆕
│   └── index.js
```

### Tasks

- [ ] **3.1** Crear `BaseStrategy.js` abstracto
- [ ] **3.2** Implementar `FixedStrategy.js`
- [ ] **3.3** Implementar `RoundRobinStrategy.js`
- [ ] **3.4** Implementar `PriorityStrategy.js`
- [ ] **3.5** Implementar `LatencyStrategy.js`
- [ ] **3.6** Implementar `CostStrategy.js`
- [ ] **3.7** Implementar `ContextStrategy.js`
- [ ] **3.8** Implementar `ReasoningStrategy.js`
- [ ] **3.9** Implementar `ConsensusStrategy.js` (requiere ParallelExecutor)
- [ ] **3.10** Implementar `AutoStrategy.js`
- [ ] **3.11** Crear `StrategyEngine.js` central
- [ ] **3.12** Tests para cada estrategia

### Criterios de Aceptación

```javascript
// Test: Strategy selection
const engine = new StrategyEngine(config);

// Fixed
const fixed = engine.select('fixed', models, context);
assert(fixed.id === config.primaryModel);

// Round Robin
const rr1 = engine.select('round_robin', models, context);
const rr2 = engine.select('round_robin', models, context);
assert(rr1.id !== rr2.id);

// Consensus
const consensus = engine.select('consensus', models, context);
assert(consensus.agreement >= 0.6);
```

### Commits Sugeridos

```
commit 8: "feat(multi-llm): Add base strategy and simple strategies (Fixed, RoundRobin, Priority)"
commit 9: "feat(multi-llm): Add performance-based strategies (Latency, Cost, Context)"
commit 10: "feat(multi-llm): Add advanced strategies (Reasoning, Consensus, Auto)"
commit 11: "test(multi-llm): Add strategy engine tests"
```

---

## FASE 4: UI (MultiLLMConfigPanel)

### Objetivo
Crear panel de configuración en el frontend.

### Archivos a Crear

```
frontend/src/components/MultiLLM/
├── MultiLLMConfigPanel.jsx       # Panel principal 🆕
├── ModelSelector.jsx            # Selector de modelos 🆕
├── ModelCard.jsx                # Tarjeta de modelo 🆕
├── TaskMappingEditor.jsx        # Editor de mapeo 🆕
├── StrategyConfig.jsx           # Config de estrategias 🆕
├── FilterConfig.jsx             # Filtros de parámetros 🆕
└── index.js
```

### Tasks

- [ ] **4.1** Crear `ModelCard.jsx` (tarjeta individual)
- [ ] **4.2** Crear `ModelSelector.jsx` (lista de modelos)
- [ ] **4.3** Crear `TaskMappingEditor.jsx` (mapeo por tarea)
- [ ] **4.4** Crear `StrategyConfig.jsx` (selector de estrategia)
- [ ] **4.5** Crear `FilterConfig.jsx` (filtros de parámetros)
- [ ] **4.6** Crear `MultiLLMConfigPanel.jsx` (panel completo)
- [ ] **4.7** Agregar ruta `/admin/multi-llm` al router
- [ ] **4.8** Integrar con AdminPanel existente
- [ ] **4.9** API endpoints para frontend
- [ ] **4.10** Tests E2E con Playwright

### API Endpoints Requeridos

```javascript
// GET /api/multi-llm/config
// Response: MultiLLMConfig

// PUT /api/multi-llm/config
// Body: Partial<MultiLLMConfig>
// Response: MultiLLMConfig

// GET /api/multi-llm/models
// Response: { models: ModelInfo[] }

// POST /api/multi-llm/test
// Body: { modelId, messages }
// Response: { content, latency, tokens }
```

### Commits Sugeridos

```
commit 12: "feat(multi-llm): Add ModelCard and ModelSelector components"
commit 13: "feat(multi-llm): Add TaskMappingEditor component"
commit 14: "feat(multi-llm): Add StrategyConfig and FilterConfig"
commit 15: "feat(multi-llm): Add MultiLLMConfigPanel main component"
commit 16: "feat(multi-llm): Add API routes for MultiLLM configuration"
commit 17: "test(multi-llm): Add E2E tests for config panel"
```

---

## FASE 5: Providers (Adapters Adicionales)

### Objetivo
Implementar adapters para Ollama, LM Studio y LiteLLM.

### Archivos a Crear

```
api/server/services/MultiLLM/
├── Registry/
│   └── adapters/
│       ├── BaseAdapter.js       # Clase base 🆕
│       ├── OpenAIAdapter.js     # OpenAI 🆕
│       ├── AnthropicAdapter.js # Anthropic 🆕
│       ├── GoogleAdapter.js     # Google 🆕
│       ├── GroqAdapter.js       # Groq 🆕
│       ├── OllamaAdapter.js     # Ollama 🆕
│       ├── LMStudioAdapter.js   # LM Studio 🆕
│       └── LiteLLMAdapter.js    # LiteLLM 🆕
```

### Tasks

- [ ] **5.1** Crear `BaseAdapter.js` con interfaz común
- [ ] **5.2** Implementar `OpenAIAdapter.js`
- [ ] **5.3** Implementar `AnthropicAdapter.js`
- [ ] **5.4** Implementar `GoogleAdapter.js`
- [ ] **5.5** Implementar `GroqAdapter.js`
- [ ] **5.6** Implementar `OllamaAdapter.js`
- [ ] **5.7** Implementar `LMStudioAdapter.js`
- [ ] **5.8** Implementar `LiteLLMAdapter.js`
- [ ] **5.9** Tests para cada adapter
- [ ] **5.10** Documentación de configuración

### Ollama Adapter Example

```javascript
// OllamaAdapter.js
class OllamaAdapter extends BaseAdapter {
  constructor(config) {
    super({
      name: 'ollama',
      baseUrl: config.baseUrl || 'http://localhost:11434',
      capabilities: ['chat', 'code']
    });
    
    this.models = config.models || [];
  }
  
  async complete({ messages, model, temperature, maxTokens }) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3.1',
        messages: this.formatMessages(messages),
        stream: false,
        options: { temperature, num_predict: maxTokens }
      })
    });
    
    return this.parseResponse(await response.json());
  }
  
  async listModels() {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    
    return data.models.map(m => ({
      id: m.name,
      name: m.name,
      parameters: null, // Ollama no expone
      contextWindow: 8192
    }));
  }
}
```

### Commits Sugeridos

```
commit 18: "feat(multi-llm): Add BaseAdapter and core adapters (OpenAI, Anthropic)"
commit 19: "feat(multi-llm): Add local model adapters (Ollama, LM Studio)"
commit 20: "feat(multi-llm): Add LiteLLM adapter"
commit 21: "test(multi-llm): Add adapter tests"
```

---

## FASE 6: Testing

### Objetivo
Testing comprehensivo de todo el sistema.

### Tasks

- [ ] **6.1** Unit tests para ConfigService
- [ ] **6.2** Unit tests para ModelRegistry
- [ ] **6.3** Unit tests para StrategyEngine
- [ ] **6.4** Unit tests para Executors
- [ ] **6.5** Unit tests para Adapters
- [ ] **6.6** Integration tests Orchestrator
- [ ] **6.7** Integration tests MongoDB persistence
- [ ] **6.8** E2E tests ConfigPanel (Playwright)
- [ ] **6.9** Load tests (k6 o Artillery)
- [ ] **6.10** Coverage report

### Coverage Target

| Componente | Target |
|------------|--------|
| ConfigService | >90% |
| StrategyEngine | >95% |
| Executors | >90% |
| Adapters | >80% |
| **Total** | **>85%** |

### Commits Sugeridos

```
commit 22: "test(multi-llm): Add unit tests for core services"
commit 23: "test(multi-llm): Add integration tests"
commit 24: "test(multi-llm): Add E2E and load tests"
```

---

## FASE 7: Optimization

### Objetivo
Optimización de performance y monitoring.

### Tasks

- [ ] **7.1** Implementar connection pooling
- [ ] **7.2** Add model caching (LRU)
- [ ] **7.3** Optimizar token counting
- [ ] **7.4** Add metrics dashboard
- [ ] **7.5** Implement circuit breaker
- [ ] **7.6** Performance benchmarks

### Commits Sugeridos

```
commit 25: "perf(multi-llm): Add connection pooling and caching"
commit 26: "perf(multi-llm): Add metrics and monitoring"
```

---

## Dependencias Entre Fases

```
FASE 1 (Config)
    │
    └───────────────┐
                    ▼
FASE 2 (Core) ────────────► FASE 5 (Providers)
    │                              │
    └───────────────┬───────────────┘
                    ▼
FASE 3 (Strategies)
    │
    └───────────────────────┐
                            ▼
FASE 4 (UI) ◄────────────────┘
    │
    └───────────────────────┐
                            ▼
FASE 6 (Testing) ──► FASE 7 (Optimization)
```

---

## Risk Mitigation

| Fase | Risk | Mitigation |
|------|------|------------|
| All | Breaking changes | Feature flags, backwards compat |
| 2 | Performance | Lazy loading, caching |
| 3 | Strategy complexity | Clear interfaces, tests |
| 4 | UI state management | React Context, optimistic updates |
| 5 | Adapter inconsistencies | BaseAdapter contract |
| 6 | Test flakiness | CI/CD stability |

---

## Rollback Plan

Para cada fase, mantener scripts de rollback:

```javascript
// rollback-fase-1.js
db.multiLLMConfigs.drop();
db.multiLLMConfigsSchema.remove(); // Si migramos schema
```

Feature flags para disable instantáneo:

```javascript
const MULTI_LLM_ENABLED = process.env.MULTI_LLM_ENABLED === 'true';
if (!MULTI_LLM_ENABLED) {
  // Usar lógica original
}
```

---

## Definition of Done

- [ ] Todos los tests pasan (>85% coverage)
- [ ] No hay console errors
- [ ] UI funciona en mobile/desktop
- [ ] API backwards compatible
- [ ] Documentación actualizada
- [ ] Changetrace actualizado
- [ ] Code review aprobado

---

**Siguiente paso:** Comenzar con FASE 1 - Infrastructure
