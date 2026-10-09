# 🎨 Diseño de Arquitectura: Multi-LLM Configurable

**Proyecto:** Mi-LibreChat Enterprise  
**Fecha:** 2026-07-20

---

## 1. VISIÓN GENERAL

La arquitectura Multi-LLM permitirá:
- Utilizar **1 a N modelos** simultáneamente
- Asignar modelos por **tipo de tarea**
- Configurar **estrategias de selección**
- Persistir configuración **sin código**
- Mantener **100% compatibilidad** con sistema existente

---

## 2. ARQUITECTURA PROPUESTA

### 2.1 Diagrama de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT REQUEST                                  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MultiLLMOrchestrator 🆕                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │ ConfigLoader    │  │ StrategyEngine  │  │ ModelRegistry   │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
            ▼                         ▼                         ▼
    ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
    │   Strategy    │         │   Strategy    │         │   Strategy    │
    │   FIXED       │         │   ROUND_ROBIN │         │   PARALLEL    │
    └───────────────┘         └───────────────┘         └───────────────┘
            │                         │                         │
            └─────────────────────────┼─────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LLMGateway (Extended)                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                         Model Pool                                     │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │ │
│  │  │ Model 1 │ │ Model 2 │ │ Model 3 │ │ Model 4 │ │ Model N │      │ │
│  │  │ GPT-4   │ │Claude-3 │ │Gemini-1 │ │ Llama-3 │ │ DeepSeek│      │ │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘      │ │
│  └───────┼───────────┼───────────┼───────────┼───────────┼────────────┘ │
└──────────┼───────────┼───────────┼───────────┼───────────┼──────────────┘
           │           │           │           │           │
           ▼           ▼           ▼           ▼           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Providers Layer                                    │
│      OpenAI    │   Anthropic   │   Google   │   Groq   │   DeepSeek       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Componentes Nuevos

```
api/server/services/
├── MultiLLM/                              🆕 NUEVO
│   ├── MultiLLMOrchestrator.js            🆕 Orquestador central
│   ├── Config/
│   │   ├── MultiLLMConfigService.js       🆕 Servicio de configuración
│   │   ├── ConfigSchema.js                🆕 Schema de validación
│   │   └── ConfigPersistence.js           🆕 Persistencia MongoDB
│   ├── Registry/
│   │   ├── ModelRegistry.js               🆕 Registro de modelos
│   │   ├── ProviderAdapter.js             🆕 Adaptador base
│   │   └── adapters/
│   │       ├── OpenAIAdapter.js           🆕
│   │       ├── AnthropicAdapter.js       🆕
│   │       ├── GoogleAdapter.js           🆕
│   │       ├── GroqAdapter.js             🆕
│   │       └── ...                        🆕
│   ├── Strategies/
│   │   ├── StrategyEngine.js              🆕 Motor de estrategias
│   │   ├── strategies/
│   │   │   ├── FixedStrategy.js           🆕
│   │   │   ├── RoundRobinStrategy.js     🆕
│   │   │   ├── PriorityStrategy.js        🆕
│   │   │   ├── LatencyStrategy.js         🆕
│   │   │   ├── CostStrategy.js           🆕
│   │   │   ├── ContextStrategy.js         🆕
│   │   │   ├── ReasoningStrategy.js       🆕
│   │   │   ├── ConsensusStrategy.js       🆕
│   │   │   └── AutoStrategy.js           🆕
│   │   └── index.js
│   ├── Executors/
│   │   ├── SingleExecutor.js              🆕 Un modelo
│   │   ├── ParallelExecutor.js            🆕 Múltiples modelos
│   │   ├── SequentialExecutor.js          🆕 Chain de modelos
│   │   └── ConsensusExecutor.js           🆕 Agregación
│   └── Utils/
│       ├── ModelMetadata.js                🆕 Metadata normalizada
│       ├── TokenCounter.js                 🆕 Conteo de tokens
│       └── CostCalculator.js               🆕 Estimación de costos
```

---

## 3. MODELO DE DATOS

### 3.1 Schema de Configuración Multi-LLM

```javascript
// MultiLLMConfig.js
{
  _id: ObjectId,
  userId: String,                    // null = global
  
  // Configuración global
  enabled: Boolean,                 // true
  maxActiveModels: Number,           // 1-10, default: 3
  
  // Modelos activos
  activeModels: [
    {
      id: String,                   // "gpt-4o", "claude-3-5-sonnet"
      provider: String,             // "openai", "anthropic"
      enabled: Boolean,             // true
      priority: Number,             // 1-100, default: 50
      isFallback: Boolean,          // true si es fallback
      
      // Parámetros
      temperature: Number,          // 0-2
      topP: Number,                // 0-1
      topK: Number,                // 1-100 (opcional)
      maxTokens: Number,           // 1-32000
      contextLimit: Number,        // Tokens máximo
      
      // Metadata (auto-calculada)
      parameters: Number | null,   // Billones de parámetros
      contextWindow: Number,       // Tokens máximos
      capabilities: [String],      // ["chat", "vision", "code"]
      costPer1K: {                 // USD
        input: Number,
        output: Number
      },
      avgLatency: Number,          // ms (calculada)
      lastUsed: Date,
      usageCount: Number
    }
  ],
  
  // Mapeo por tarea
  taskMappings: {
    conversation: {
      primaryModel: String,        // ID del modelo
      fallbackModels: [String],    // IDs de fallback
      strategy: String            // "fixed", "priority", "latency"
    },
    programming: {
      primaryModel: String,
      fallbackModels: [String],
      strategy: String
    },
    reasoning: {
      primaryModel: String,
      fallbackModels: [String],
      strategy: String
    },
    // ... 15+ tipos de tareas
  },
  
  // Parámetros de filtro
  filters: {
    minParameters: Number | null,  // Mínimo de parámetros (billones)
    maxParameters: Number | null,   // Máximo de parámetros
    minContext: Number | null,      // Mínimo contexto
    maxCostPer1K: Number | null    // Máximo costo por 1K tokens
  },
  
  // Estrategia global
  defaultStrategy: String,          // "fixed", "round_robin", "auto"
  
  createdAt: Date,
  updatedAt: Date
}
```

### 3.2 Tipos de Tarea

```javascript
const TaskTypes = {
  CONVERSATION: 'conversation',      // Chat general
  PROGRAMMING: 'programming',        // Generación de código
  REASONING: 'reasoning',            // Razonamiento complejo
  ARCHITECTURE: 'architecture',      // Diseño de sistemas
  SECURITY: 'security',              // Análisis de seguridad
  AUDITING: 'auditing',              // Auditoría de código
  FRONTEND: 'frontend',             // UI/UX
  BACKEND: 'backend',               // APIs, servers
  DEVOPS: 'devops',                 // CI/CD, infrastructure
  RESEARCH: 'research',             // Búsqueda, análisis
  DOCUMENTATION: 'documentation',   // Docs técnicas
  PLANNING: 'planning',            // Planificación de proyectos
  QA: 'qa',                        // Testing, calidad
  MEMORY: 'memory',                // Persistencia de memoria
  CLASSIFICATION: 'classification', // Clasificación
  SUMMARIZATION: 'summarization',  // Resúmenes
  TRANSLATION: 'translation',      // Traducción
  CREATIVE: 'creative',           // Generación creativa
  IMAGE: 'image',                  // Generación de imágenes
  VIDEO: 'video'                   // Generación de video
};
```

### 3.3 Estrategias de Selección

```javascript
const SelectionStrategies = {
  // Un solo modelo fijo
  FIXED: 'fixed',
  
  // Rotación simple
  ROUND_ROBIN: 'round_robin',
  
  // Por prioridad configurada
  PRIORITY: 'priority',
  
  // Menor latencia medida
  LATENCY: 'latency',
  
  // Menor costo
  COST: 'cost',
  
  // Mayor contexto disponible
  CONTEXT: 'context',
  
  // Mejor razonamiento (razón parámetros/performance)
  REASONING: 'reasoning',
  
  // Consenso entre múltiples modelos
  CONSENSUS: 'consensus',
  
  // Automático según tipo de tarea
  AUTO: 'auto'
};
```

---

## 4. FLUJO DE EJECUCIÓN

### 4.1 Flujo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER REQUEST                                  │
│         { messages, taskType?, options? }                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              MultiLLMOrchestrator.route()                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. Load MultiLLMConfig (user-specific o global)            │ │
│  │ 2. Apply filters (min/max parameters, cost, context)      │ │
│  │ 3. Get models for taskType or use default                  │ │
│  │ 4. Select strategy (from config or auto-detect)            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   StrategyEngine.select()                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ SELECT * FROM active_models                                │ │
│  │ WHERE enabled = true                                       │ │
│  │   AND capabilities CONTAINS taskType                       │ │
│  │   AND parameters >= minParams                              │ │
│  │   AND parameters <= maxParams                              │ │
│  │ ORDER BY priority_strategy_value DESC                      │ │
│  │ LIMIT active_limit                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │ SingleExecute │ │ParallelExecute│ │SequentialExec │
    │ (Fixed/Latency│ │ (Consensus/   │ │ (Chain de     │
    │  Cost/Context)│ │  RoundRobin)  │ │  modelos)     │
    └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLMGateway.complete()                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Single: model1.complete(messages)                         │ │
│  │ Parallel: Promise.all([model1, model2].complete())         │ │
│  │ Sequential: model1 → model2 → model3                       │ │
│  │ Consensus: Aggregate responses                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Response Handler                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. Parse response(s)                                      │ │
│  │ 2. Calculate metrics (latency, tokens, cost)              │ │
│  │ 3. Update model statistics                                 │ │
│  │ 4. Log execution for optimization                         │ │
│  │ 5. Return unified response                                │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Estrategia AUTO (Detección Automática)

```javascript
async function autoSelectStrategy(taskType, context) {
  const messageContent = context.messages.join(' ').toLowerCase();
  
  // Detección por keywords
  if (containsKeywords(messageContent, ['code', 'function', 'implement'])) {
    return {
      strategy: 'priority',
      models: ['gpt-4o', 'claude-3-5-sonnet'],
      reason: 'Detected programming task'
    };
  }
  
  if (containsKeywords(messageContent, ['analyze', 'reason', 'think'])) {
    return {
      strategy: 'reasoning',
      models: ['claude-3-5-sonnet', 'gemini-1.5-pro'],
      reason: 'Detected reasoning task'
    };
  }
  
  if (containsKeywords(messageContent, ['search', 'find', 'lookup'])) {
    return {
      strategy: 'cost',
      models: ['gemini-1.5-flash', 'gpt-4o-mini'],
      reason: 'Detected search task, optimizing cost'
    };
  }
  
  // Default
  return {
    strategy: 'round_robin',
    models: null, // Usar todos los activos
    reason: 'No specific task detected'
  };
}
```

---

## 5. ADAPTADORES DE PROVEEDOR

### 5.1 Interfaz Base

```javascript
class ProviderAdapter {
  constructor(config) {
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.models = config.models;
  }
  
  // Métodos requeridos
  async complete(params) {
    // { messages, model, temperature, maxTokens, stream }
    throw new Error('Not implemented');
  }
  
  async listModels() {
    // Retorna lista de modelos disponibles
    throw new Error('Not implemented');
  }
  
  async getModelInfo(modelId) {
    // Retorna metadata del modelo
    throw new Error('Not implemented');
  }
  
  async healthCheck() {
    // Verifica disponibilidad
    throw new Error('Not implemented');
  }
  
  // Utilidades
  formatMessages(messages) {
    // Normaliza formato de mensajes
  }
  
  parseResponse(response) {
    // Normaliza respuesta
  }
}
```

### 5.2 Adaptador OpenAI (Nuevo)

```javascript
class OpenAIAdapter extends ProviderAdapter {
  constructor(config) {
    super({
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      ...config
    });
  }
  
  async complete({ messages, model, temperature, maxTokens, stream }) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: this.formatMessages(messages),
        temperature: temperature ?? 1.0,
        max_tokens: maxTokens ?? 4096,
        stream: stream ?? false
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    return this.parseResponse(await response.json());
  }
  
  async listModels() {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    
    const data = await response.json();
    return data.data
      .filter(m => m.id.startsWith('gpt-'))
      .map(m => ({
        id: m.id,
        contextWindow: m.context_window,
        parameters: m.parameters || null // No siempre disponible
      }));
  }
  
  parseResponse(data) {
    return {
      content: data.choices[0].message.content,
      usage: data.usage,
      model: data.model,
      provider: 'openai'
    };
  }
}
```

### 5.3 Adaptador Ollama (Nuevo)

```javascript
class OllamaAdapter extends ProviderAdapter {
  constructor(config) {
    super({
      name: 'ollama',
      baseUrl: config.baseUrl || 'http://localhost:11434',
      models: [], // Dinámico
      ...config
    });
  }
  
  async complete({ messages, model, temperature, maxTokens, stream }) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3.1',
        messages: this.formatMessages(messages),
        stream: stream ?? false,
        options: {
          temperature: temperature ?? 0.8,
          num_predict: maxTokens ?? 4096
        }
      })
    });
    
    return this.parseStreamResponse(await response.json());
  }
  
  async listModels() {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    
    return data.models.map(m => ({
      id: m.name,
      parameters: null, // Ollama no expone esto
      contextWindow: 8192 // Default, podría ser configurable
    }));
  }
}
```

---

## 6. ESTRATEGIAS DETALLADAS

### 6.1 FixedStrategy

```javascript
class FixedStrategy {
  select(models, context) {
    // Siempre retorna el modelo con priority más alta
    return models
      .filter(m => m.enabled && !m.isFallback)
      .sort((a, b) => b.priority - a.priority)[0];
  }
  
  getFallback(models) {
    return models
      .filter(m => m.enabled && m.isFallback)
      .sort((a, b) => b.priority - a.priority)[0];
  }
}
```

### 6.2 RoundRobinStrategy

```javascript
class RoundRobinStrategy {
  constructor() {
    this.currentIndex = 0;
  }
  
  select(models, context) {
    const enabled = models.filter(m => m.enabled && !m.isFallback);
    if (enabled.length === 0) return null;
    
    const selected = enabled[this.currentIndex % enabled.length];
    this.currentIndex++;
    
    return selected;
  }
  
  reset() {
    this.currentIndex = 0;
  }
}
```

### 6.3 LatencyStrategy

```javascript
class LatencyStrategy {
  select(models, context) {
    return models
      .filter(m => m.enabled && m.avgLatency > 0)
      .sort((a, b) => a.avgLatency - b.avgLatency)[0];
  }
}
```

### 6.4 CostStrategy

```javascript
class CostStrategy {
  select(models, context) {
    // Ordenar por costo total estimado (input + output)
    const estimatedCost = (model) => {
      const inputTokens = context.messages.reduce((sum, m) => 
        sum + (m.tokenCount || 100), 0);
      const outputTokens = model.maxTokens || 1000;
      
      return (inputTokens / 1000 * model.costPer1K.input) +
             (outputTokens / 1000 * model.costPer1K.output);
    };
    
    return models
      .filter(m => m.enabled && m.costPer1K?.input)
      .sort((a, b) => estimatedCost(a) - estimatedCost(b))[0];
  }
}
```

### 6.5 ConsensusStrategy

```javascript
class ConsensusStrategy {
  async execute(models, context, options = {}) {
    const { minAgreement = 0.6, maxModels = 3 } = options;
    
    const enabled = models
      .filter(m => m.enabled && !m.isFallback)
      .slice(0, maxModels);
    
    // Ejecutar en paralelo
    const responses = await Promise.all(
      enabled.map(model => this.executeModel(model, context))
    );
    
    // Calcular consenso
    const consensus = this.calculateConsensus(responses, minAgreement);
    
    return {
      content: consensus.content,
      agreement: consensus.agreement,
      responses: responses.map((r, i) => ({
        model: enabled[i].id,
        content: r.content
      }))
    };
  }
  
  calculateConsensus(responses, threshold) {
    // Implementar lógica de consenso
    // Por ejemplo: TF-IDF similarity, voting, etc.
  }
}
```

---

## 7. API ENDPOINTS

### 7.1 Endpoints Nuevos

```javascript
// api/server/routes/multi-llm.js

const router = express.Router();

// Configuración
router.get('/config', authMiddleware, getMultiLLMConfig);
router.put('/config', authMiddleware, updateMultiLLMConfig);
router.delete('/config', authMiddleware, resetMultiLLMConfig);

// Modelos
router.get('/models', authMiddleware, listAvailableModels);
router.get('/models/:modelId', authMiddleware, getModelInfo);
router.post('/models/refresh', authMiddleware, refreshModelList);

// Testing
router.post('/test', authMiddleware, testMultiLLMConfig);
router.post('/benchmark', authMiddleware, benchmarkModels);

// Stats
router.get('/stats', authMiddleware, getMultiLLMStats);
router.get('/stats/history', authMiddleware, getStatsHistory);
```

### 7.2 Request/Response Examples

```javascript
// PUT /api/multi-llm/config
{
  "maxActiveModels": 4,
  "activeModels": [
    {
      "id": "gpt-4o",
      "provider": "openai",
      "enabled": true,
      "priority": 90,
      "temperature": 0.7,
      "maxTokens": 4096
    },
    {
      "id": "claude-3-5-sonnet",
      "provider": "anthropic",
      "enabled": true,
      "priority": 80,
      "temperature": 0.7,
      "maxTokens": 8192
    }
  ],
  "taskMappings": {
    "conversation": {
      "primaryModel": "gpt-4o",
      "strategy": "round_robin"
    },
    "programming": {
      "primaryModel": "claude-3-5-sonnet",
      "strategy": "fixed"
    }
  },
  "filters": {
    "minParameters": 7,      // Mínimo 7B parámetros
    "maxCostPer1K": 0.01    // Máximo $0.01/1K tokens
  },
  "defaultStrategy": "priority"
}
```

---

## 8. FRONTEND - PANEL DE CONFIGURACIÓN

### 8.1 Estructura del Componente

```
frontend/src/components/MultiLLM/
├── MultiLLMConfig.jsx              # Panel principal
├── ModelSelector.jsx               # Selector de modelos
├── TaskMappingEditor.jsx           # Editor de mapeo por tarea
├── StrategyConfig.jsx              # Configuración de estrategias
├── ModelCard.jsx                  # Tarjeta de modelo
├── FilterConfig.jsx               # Filtros de parámetros
└── StatsPanel.jsx                 # Estadísticas de uso
```

### 8.2 Wireframe del Panel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ Multi-LLM Configuration                                            [Save] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ 📊 Active Models: [1] [2] [3] [4] [5] [6] [Custom: ___]            │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ ┌─ Available Models ──────────────────────────────────────────────────┐   │
│ │                                                                      │   │
│ │  ☑ GPT-4o           OpenAI    1.5T params  128K ctx  $0.005/1K    │   │
│ │  ☑ Claude 3.5 Son   Anthropic  -            200K ctx  $0.003/1K    │   │
│ │  ☐ GPT-4o-mini      OpenAI    8B params    128K ctx  $0.00015/1K  │   │
│ │  ☑ Gemini 1.5 Flash Google    -            1M ctx   $0.000075/1K  │   │
│ │  ☐ Llama 3.1 70B    Groq       70B params   128K ctx  Free        │   │
│ │  ☐ DeepSeek Chat   DeepSeek   67B params   64K ctx   Free        │   │
│ │                                                                      │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ ┌─ Task Mappings ─────────────────────────────────────────────────────┐   │
│ │                                                                      │   │
│ │  Conversation  → [GPT-4o ▼] [Strategy: Round Robin ▼]              │   │
│ │  Programming   → [Claude 3.5 ▼] [Strategy: Fixed ▼]              │   │
│ │  Reasoning     → [Claude 3.5 ▼] [+ Gemini ▼] [Consensus ▼]         │   │
│ │  Security      → [GPT-4o ▼] [Strategy: Priority ▼]                 │   │
│ │  ...                                                              │   │
│ │  [+ Add Task Mapping]                                              │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ ┌─ Parameter Filters ───────────────────────────────────────────────┐   │
│ │                                                                      │   │
│ │  Min Parameters: [7]B ─────●───── [700B] Max                       │   │
│ │  Max Cost/1K: $[0.0001] ───●───── [$1.00]                          │   │
│ │                                                                      │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ ┌─ Default Strategy ────────────────────────────────────────────────┐   │
│ │                                                                      │   │
│ │  (●) Fixed     ( ) Round Robin   ( ) Priority                       │   │
│ │  ( ) Latency   ( ) Cost         ( ) Auto                           │   │
│ │                                                                      │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ ┌─ Model Details (GPT-4o) ───────────────────────────────────────────┐   │
│ │                                                                      │   │
│ │  Temperature:  [0.7]                                                 │   │
│ │  Max Tokens:   [4096]                                               │   │
│ │  Top P:        [1.0]                                                │   │
│ │  Top K:        [40]                                                 │   │
│ │                                                                      │   │
│ │  ⚡ Avg Latency: 1.2s    📊 Usage: 142 requests                      │   │
│ │  💰 Est. Cost: $0.34    🎯 Success Rate: 99.2%                      │   │
│ │                                                                      │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. PERSISTENCIA

### 9.1 MongoDB Schema

```javascript
// api/server/services/Database/schemas.js

const multiLLMConfigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null = global config
  },
  
  enabled: { type: Boolean, default: true },
  maxActiveModels: { type: Number, default: 3, min: 1, max: 10 },
  
  activeModels: [{
    modelId: { type: String, required: true },
    provider: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 50, min: 1, max: 100 },
    isFallback: { type: Boolean, default: false },
    
    parameters: {
      temperature: { type: Number, default: 0.7, min: 0, max: 2 },
      topP: { type: Number, default: 1.0, min: 0, max: 1 },
      topK: { type: Number, default: null },
      maxTokens: { type: Number, default: 4096 },
      contextLimit: { type: Number, default: null }
    },
    
    stats: {
      usageCount: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      totalCost: { type: Number, default: 0 },
      avgLatency: { type: Number, default: 0 },
      lastUsed: { type: Date },
      errorCount: { type: Number, default: 0 }
    }
  }],
  
  taskMappings: {
    type: Map,
    of: {
      primaryModel: String,
      fallbackModels: [String],
      strategy: { type: String, enum: Object.values(SelectionStrategies) }
    },
    default: {}
  },
  
  filters: {
    minParameters: { type: Number, default: null },
    maxParameters: { type: Number, default: null },
    minContext: { type: Number, default: null },
    maxCostPer1K: { type: Number, default: null }
  },
  
  defaultStrategy: {
    type: String,
    enum: Object.values(SelectionStrategies),
    default: 'priority'
  }
}, {
  timestamps: true
});

// Índices
multiLLMConfigSchema.index({ userId: 1 });
multiLLMConfigSchema.index({ 'activeModels.modelId': 1 });
```

---

## 10. COMPATIBILIDAD

### 10.1 Backwards Compatibility

```javascript
// LLMGateway.js - Mantener API existente
class LLMGateway {
  // ... código existente ...
  
  // NUEVO: Método compatible con versión anterior
  async complete(params) {
    // Si no hay config MultiLLM, usar comportamiento original
    if (!multiLLMConfigService.isEnabled(params.userId)) {
      return this.legacyComplete(params);
    }
    
    // NUEVO: Usar MultiLLMOrchestrator
    return multiLLMOrchestrator.route(params);
  }
  
  // Para uso interno de herramientas existentes
  async completeLegacy(params) {
    return this.legacyComplete(params);
  }
}
```

### 10.2 Feature Flags

```javascript
const FEATURE_FLAGS = {
  MULTI_LLM_ENABLED: process.env.MULTI_LLM_ENABLED === 'true',
  MULTI_LLM_AUTO_DETECT: process.env.MULTI_LLM_AUTO_DETECT === 'true',
  MULTI_LLM_STRATEGIES: {
    CONSENSUS: true,
    PARALLEL: true,
    SEQUENTIAL: true
  }
};
```

---

## 11. TESTING

### 11.1 Plan de Testing

```
Unit Tests
├── ModelRegistry.test.js
├── StrategyEngine.test.js
│   ├── FixedStrategy.test.js
│   ├── RoundRobinStrategy.test.js
│   ├── LatencyStrategy.test.js
│   └── ...
├── ProviderAdapters.test.js
│   ├── OpenAIAdapter.test.js
│   └── ...
└── ConfigService.test.js

Integration Tests
├── MultiLLMOrchestrator.test.js
├── EndToEndFlow.test.js
└── FallbackChain.test.js

E2E Tests
└── Playwright
    ├── ConfigFlow.test.js
    └── ModelSelection.test.js

Load Tests
├── ConcurrentRequests.test.js
└── ModelPoolStress.test.js
```

---

## 12. CONCLUSIONES

La arquitectura propuesta:

1. **Extiende sin reemplazar** - Compatible 100% con sistema actual
2. **Modular** - Cada componente tiene responsabilidad única
3. **Escalable** - Nuevos providers/estrategias son plug-and-play
4. **Configurable** - Todo persistido y editable via UI
5. **Medible** - Métricas para optimización continua

**Siguiente paso:** Ver Plan de Implementación (03-PLAN-IMPLEMENTACION.md)
