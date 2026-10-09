# 🎯 Capability Orchestrator

**Motor de Orquestación Multi-LLM basado en capacidades**

Sistema que permite routing inteligente entre múltiples modelos de lenguaje basándose en las capacidades requeridas, no en nombres de modelos específicos.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    CapabilityOrchestrator                         │
├─────────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ Capability     │  │    Model      │  │    Config     │    │
│  │  Registry     │  │   Registry   │  │   Service    │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Service Container (DI)                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Características

### Capabilities (25+ capacidades)

```
Core:       chat, reasoning, code, analysis
Domain:     frontend, backend, architecture, security, devops
Advanced:    vision, tool_calling, long_context, math
Utility:     search, translation, summarization, embeddings
Creative:    creative, writing, image_generation
```

### Modos de Ejecución

| Modo | Descripción |
|------|-------------|
| `simple` | Un modelo para todo |
| `specialized` | Modelos por rol/tarea |
| `intelligent` | Routing automático |

### Estrategias

| Estrategia | Descripción |
|------------|-------------|
| `fixed` | Modelo fijo |
| `priority` | Por prioridad configurada |
| `round_robin` | Rotación |
| `latency` | Menor latencia |
| `cost` | Menor costo |
| `auto` | Selección automática |

---

## Uso Básico

```javascript
const { initialize, globalContainer } = require('./CapabilityOrchestrator');

// Inicializar
const { capabilityRegistry, modelRegistry } = await initialize();

// Registrar un modelo
await modelRegistry.registerModel({
  provider: 'openai',
  model: 'gpt-4o',
  capabilities: { capabilities: ['chat', 'code', 'reasoning'] },
});

// Encontrar modelos por capacidades
const candidates = modelRegistry.findByCapabilities(['code', 'reasoning']);

// Seleccionar el mejor
const selected = candidates[0];
console.log(`Selected: ${selected.modelId} (score: ${selected.matchScore})`);
```

---

## Service Container (DI)

```javascript
const { ServiceContainer } = require('./container/ServiceContainer');

const container = new ServiceContainer();

// Registrar servicios
container.singleton('Logger', () => ({
  info: () => {},
  error: () => {},
}));

container.singleton('MyService', (logger) => {
  return new MyService({ logger });
}, ['Logger']);

// Resolver
const service = container.resolve('MyService');
```

---

## ConfigService

```javascript
const { getConfigService } = require('./models/ConfigService');

const configService = getConfigService();

// Obtener config de usuario
const config = await configService.getConfig(userId);

// Actualizar modelos activos
await configService.updateActiveModels(userId, [
  { modelId: 'openai/gpt-4o', enabled: true, priority: 100 },
  { modelId: 'anthropic/claude-3', enabled: true, priority: 90 },
]);

// Aplicar perfil
await configService.applyProfile(userId, 'development');
```

---

## Estructura del Proyecto

```
CapabilityOrchestrator/
├── container/
│   └── ServiceContainer.js      # Dependency Injection
├── models/
│   ├── CapabilityRegistry.js   # Registro de capacidades
│   ├── ModelRegistry.js        # Registro de modelos (índice invertido)
│   ├── ConfigService.js        # Persistencia de config
│   └── Schema.js              # Schemas de MongoDB
├── constants/
│   ├── Types.js               # Tipos y constantes
│   └── Profiles.js            # Perfiles predefinidos
├── __tests__/
│   └── foundation.test.js     # Tests unitarios
├── index.js                    # Punto de entrada
└── README.md                  # Este archivo
```

---

## Perfiles Predefinidos

| Perfil | Descripción | Caso de Uso |
|--------|-------------|-------------|
| `development` | Optimizado para código | Programación |
| `research` | Análisis profundo | Investigación |
| `cost_effective` | Bajo costo | Budget limitado |
| `high_quality` | Mejor calidad | Resultados óptimos |
| `local` | Modelos locales | Ollama, LM Studio |
| `hybrid` | Cloud + Local | Balance flexible |

---

## Benchmarks

| Operación | Tiempo |
|----------|--------|
| Registro de modelo | ~1ms |
| Búsqueda por capacidad (índice) | O(1) |
| Resolución de servicio | ~0.5ms |
| Config load (cache) | ~1ms |

---

## Tests

```bash
npm test -- --testPathPattern=CapabilityOrchestrator
```

---

## Licencia

MIT
