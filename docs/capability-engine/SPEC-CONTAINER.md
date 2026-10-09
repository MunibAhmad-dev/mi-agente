# 📦 Especificación: Service Container y Dependency Injection

**Fecha:** 2026-07-20  
**Propósito:** Definir ServiceContainer con DI para el Capability Orchestrator

---

## 1. ARQUITECTURA DE DEPENDENCIAS

### 1.1 Diagrama de Dependencias

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SERVICE CONTAINER                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                          CONTAINER                                       │  │
│   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │  │
│   │  │  Registry  │ │  Factory    │ │   Cache    │ │  Lifecyle   │        │  │
│   │  │  services  │ │  functions  │ │   manager  │ │  manager    │        │  │
│   │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘        │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                        │                                            │
│         ┌─────────────────────────────┼─────────────────────────────┐        │
│         │                             │                             │        │
│         ▼                             ▼                             ▼        │
│   ┌───────────┐               ┌───────────┐               ┌───────────┐       │
│   │  SINGLETON │               │ TRANSIENT │               │  SCOPED   │       │
│   │  services  │               │  services │               │  services │       │
│   └─────┬─────┘               └─────┬─────┘               └─────┬─────┘       │
│         │                             │                             │             │
│   ┌─────┴─────────────────────────────┴─────────────────────────────┴─────┐    │
│   │                         SERVICE GRAPH                                  │    │
│   │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │    │
│   │  │  Model     │  │Capability  │  │   Config   │  │ Strategy   │  │    │
│   │  │  Registry  │──│  Registry  │──│  Service   │──│  Engine    │  │    │
│   │  └────────────┘  └────────────┘  └────────────┘  └─────┬──────┘  │    │
│   │       │                                                  │          │    │
│   │       │              ┌────────────────────────────┐       │          │    │
│   │       └──────────────│   OrchestratorFacade     │───────┘          │    │
│   │                      └────────────────────────────┘                 │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Ciclo de Vida de Servicios

| Tipo | Creación | Uso | Destrucción |
|------|----------|-----|-------------|
| **Singleton** | Primera vez | Toda la app | Nunca (o restart) |
| **Transient** | Cada request | Request actual | Después del request |
| **Scoped** | Por scope | Scope actual | Fin del scope |

---

## 2. IMPLEMENTACIÓN DEL CONTAINER

### 2.1 ServiceContainer Base

```javascript
// api/server/services/CapabilityOrchestrator/container/ServiceContainer.js

/**
 * ServiceContainer - Contenedor simple de servicios con DI
 * 
 * Soporta tres ciclos de vida:
 * - SINGLETON: Una instancia por aplicación
 * - TRANSIENT: Nueva instancia por resolución
 * - SCOPED: Una instancia por scope
 */
class ServiceContainer {
  constructor() {
    // Registro de servicios
    this.services = new Map();
    
    // Instancias singletons
    this.instances = new Map();
    
    // Scopes activos
    this.scopes = new Map();
    
    // Opciones globales
    this.options = {
      enableAutoResolve: true,
      cacheTransients: false
    };
  }
  
  /**
   * Registrar un servicio
   * 
   * @param {string} name - Nombre del servicio
   * @param {Function|Object} factory - Factory function o instancia
   * @param {Object} options - Opciones del servicio
   */
  register(name, factory, options = {}) {
    const service = {
      name,
      factory: typeof factory === 'function' ? factory : () => factory,
      lifecycle: options.lifecycle || 'singleton',
      dependencies: options.dependencies || [],
      resolved: false
    };
    
    this.services.set(name, service);
    
    return this;
  }
  
  /**
   * Registrar un singleton
   */
  registerSingleton(name, factory, dependencies = []) {
    return this.register(name, factory, { lifecycle: 'singleton', dependencies });
  }
  
  /**
   * Registrar un transient
   */
  registerTransient(name, factory, dependencies = []) {
    return this.register(name, factory, { lifecycle: 'transient', dependencies });
  }
  
  /**
   * Registrar un scoped
   */
  registerScoped(name, factory, dependencies = []) {
    return this.register(name, factory, { lifecycle: 'scoped', dependencies });
  }
  
  /**
   * Resolver un servicio
   */
  resolve(name, scopeId = null) {
    const service = this.services.get(name);
    
    if (!service) {
      if (this.options.enableAutoResolve) {
        // Auto-resolve: crear transient automáticamente
        return this.registerTransient(name, class {}).resolve(name);
      }
      throw new Error(`Service not registered: ${name}`);
    }
    
    // Verificar ciclo de vida
    switch (service.lifecycle) {
      case 'singleton':
        return this.resolveSingleton(service);
      case 'transient':
        return this.resolveTransient(service);
      case 'scoped':
        return this.resolveScoped(service, scopeId);
      default:
        throw new Error(`Unknown lifecycle: ${service.lifecycle}`);
    }
  }
  
  /**
   * Resolver singleton
   */
  resolveSingleton(service) {
    if (!this.instances.has(service.name)) {
      this.instances.set(service.name, this.createInstance(service));
    }
    return this.instances.get(service.name);
  }
  
  /**
   * Resolver transient
   */
  resolveTransient(service) {
    return this.createInstance(service);
  }
  
  /**
   * Resolver scoped
   */
  resolveScoped(service, scopeId) {
    if (!scopeId) {
      throw new Error('Scope ID required for scoped service');
    }
    
    if (!this.scopes.has(scopeId)) {
      this.scopes.set(scopeId, new Map());
    }
    
    const scopeInstances = this.scopes.get(scopeId);
    
    if (!scopeInstances.has(service.name)) {
      scopeInstances.set(service.name, this.createInstance(service));
    }
    
    return scopeInstances.get(service.name);
  }
  
  /**
   * Crear instancia resolviendo dependencias
   */
  createInstance(service) {
    if (service.resolved) {
      return service.factory();
    }
    
    // Resolver dependencias
    const deps = service.dependencies.map(dep => {
      if (typeof dep === 'string') {
        return this.resolve(dep);
      }
      
      // Dependencia con nombre específico
      return this.resolve(dep.name);
    });
    
    // Crear instancia
    const instance = service.factory(...deps);
    
    return instance;
  }
  
  /**
   * Crear un scope
   */
  createScope() {
    const scopeId = `scope_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.scopes.set(scopeId, new Map());
    
    return {
      id: scopeId,
      container: this,
      
      // Resolver en este scope
      resolve: (name) => this.resolve(name, scopeId),
      
      // Dispose del scope
      dispose: () => this.disposeScope(scopeId)
    };
  }
  
  /**
   * Disponer un scope
   */
  disposeScope(scopeId) {
    const scopeInstances = this.scopes.get(scopeId);
    
    if (scopeInstances) {
      // Llamar dispose en cada instancia que lo soporte
      for (const instance of scopeInstances.values()) {
        if (typeof instance.dispose === 'function') {
          instance.dispose();
        }
      }
      
      this.scopes.delete(scopeId);
    }
  }
  
  /**
   * Clear todos los singletons
   */
  clear() {
    // Dispose de singletons
    for (const instance of this.instances.values()) {
      if (typeof instance.dispose === 'function') {
        instance.dispose();
      }
    }
    
    this.instances.clear();
    this.scopes.clear();
  }
  
  /**
   * Verificar si un servicio está registrado
   */
  has(name) {
    return this.services.has(name);
  }
  
  /**
   * Listar servicios registrados
   */
  listServices() {
    return [...this.services.keys()];
  }
}

// Singleton global
const globalContainer = new ServiceContainer();

module.exports = { ServiceContainer, globalContainer };
```

### 2.2 Helper para Decorators (Opcional)

```javascript
// api/server/services/CapabilityOrchestrator/container/decorators.js

/**
 * Decorator para inyección de dependencias
 * 
 * Uso:
 * 
 * class MyService {
 *   constructor(container) {
 *     this.modelRegistry = container.resolve('ModelRegistry');
 *     this.configService = container.resolve('ConfigService');
 *   }
 * }
 */
function injectable(target) {
  target.__injectable = true;
  return target;
}

/**
 * Decorator para dependencia
 */
function inject(name) {
  return function(target, propertyName) {
    if (!target.__injections) {
      target.__injections = [];
    }
    target.__injections.push({ property: propertyName, service: name });
  };
}

// Factory decorator
function singleton(target) {
  const original = target;
  
  function construct(...args) {
    if (!construct.__instance) {
      construct.__instance = new original(...args);
    }
    return construct.__instance;
  }
  
  construct.prototype = original.prototype;
  
  return construct;
}

// Usage example:
// @singleton
// class ModelRegistry {
//   constructor(container) {
//     this.container = container;
//   }
// }
```

---

## 3. REGISTRO DE SERVICIOS

### 3.1 Bootstrap del Container

```javascript
// api/server/services/CapabilityOrchestrator/container/bootstrap.js

const { ServiceContainer, globalContainer } = require('./ServiceContainer');
const PROFILES = require('../constants/PROFILES');

/**
 * Configurar el container con todos los servicios
 */
function configureContainer(container = globalContainer) {
  
  // === SINGLETONS ===
  
  // Logger
  container.registerSingleton('Logger', () => {
    return require('../../../utils/logger');
  });
  
  // MongoDB Connection
  container.registerSingleton('MongoConnection', () => {
    const mongoose = require('mongoose');
    return {
      model: (name) => mongoose.model(name),
      connection: mongoose.connection
    };
  });
  
  // Model Registry
  container.registerSingleton('ModelRegistry', (logger) => {
    const { ModelRegistry } = require('../models/ModelRegistry');
    return new ModelRegistry({ logger });
  }, ['Logger']);
  
  // Capability Registry
  container.registerSingleton('CapabilityRegistry', () => {
    const { CapabilityRegistry } = require('../models/CapabilityRegistry');
    return new CapabilityRegistry();
  });
  
  // Config Service (usa el container para resolver ModelRegistry)
  container.registerSingleton('ConfigService', (logger) => {
    const MultiLLMConfig = require('../models/MultiLLMConfig');
    
    // Closure con container para dependencias
    const service = new ConfigService({ model: MultiLLMConfig });
    service.setContainer(globalContainer);
    
    return service;
  }, ['Logger']);
  
  // Strategy Engine
  container.registerSingleton('StrategyEngine', () => {
    const { StrategyEngine } = require('../strategies/StrategyEngine');
    return new StrategyEngine({
      strategies: [
        require('../strategies/strategies/PriorityStrategy'),
        require('../strategies/strategies/LatencyStrategy'),
        require('../strategies/strategies/CostStrategy'),
        require('../strategies/strategies/RoundRobinStrategy'),
        require('../strategies/strategies/ContextStrategy'),
        require('../strategies/strategies/ReasoningStrategy'),
        require('../strategies/strategies/AutoStrategy')
      ]
    });
  });
  
  // === TRANSIENTS ===
  
  // Cada request obtiene nueva instancia
  container.registerTransient('RequestContext', () => {
    return class RequestContext {
      constructor() {
        this.messages = [];
        this.options = {};
        this.startTime = Date.now();
      }
    };
  });
  
  // === SCOPED ===
  
  // Por request de usuario
  container.registerScoped('UserContext', (logger) => {
    return class UserContext {
      constructor(userId) {
        this.userId = userId;
        this.config = null;
        this.logger = logger;
      }
      
      async loadConfig() {
        if (!this.config) {
          const ConfigService = globalContainer.resolve('ConfigService');
          this.config = await ConfigService.getConfig(this.userId);
        }
        return this.config;
      }
    };
  }, ['Logger']);
  
  // LLM Gateway Adapter (scoped porque puede tener estado)
  container.registerScoped('LLMGatewayAdapter', (logger) => {
    const { LLMGatewayAdapter } = require('../adapters/LLMGatewayAdapter');
    const LLMGateway = globalContainer.resolve('LLMGateway');
    return new LLMGatewayAdapter(LLMGateway);
  }, ['Logger']);
  
  return container;
}

/**
 * Inicializar container global
 */
function initializeContainer() {
  configureContainer(globalContainer);
  
  console.log('[Container] Initialized with services:', globalContainer.listServices());
  
  return globalContainer;
}

/**
 * Obtener container para testing
 */
function createTestContainer() {
  const container = new ServiceContainer();
  
  // Mock Logger
  container.registerSingleton('Logger', () => ({
    info: () => {},
    warn: () => {},
    error: () => {}
  }));
  
  // Mock Model Registry
  container.registerSingleton('ModelRegistry', () => ({
    findByCapabilities: async () => [],
    getModel: async () => null,
    listModels: async () => []
  }));
  
  // Mock Capability Registry
  container.registerSingleton('CapabilityRegistry', () => ({
    listCapabilities: () => []
  }));
  
  return container;
}

module.exports = {
  ServiceContainer,
  globalContainer,
  configureContainer,
  initializeContainer,
  createTestContainer
};
```

---

## 4. USO EN EL ORCHESTRATOR

### 4.1 IntegrationManager con DI

```javascript
// api/server/services/CapabilityOrchestrator/OrchestratorFacade.js

const { globalContainer } = require('./container/bootstrap');

/**
 * OrchestratorFacade - Punto de entrada con DI
 */
class OrchestratorFacade {
  constructor() {
    // Los servicios se resuelven lazily
  }
  
  /**
   * Obtener los servicios necesarios
   */
  get services() {
    if (!this._services) {
      this._services = {
        orchestrator: globalContainer.resolve('CapabilityOrchestrator'),
        legacyGateway: globalContainer.resolve('LegacyLLMGateway'),
        featureFlags: globalContainer.resolve('FeatureFlags'),
        metrics: globalContainer.resolve('Metrics')
      };
    }
    return this._services;
  }
  
  /**
   * Procesar request
   */
  async process(context) {
    const startTime = Date.now();
    
    // Crear scope para este request
    const scope = globalContainer.createScope();
    
    try {
      // Resolver servicios en el scope
      const orchestrator = scope.resolve('CapabilityOrchestrator');
      const legacyGateway = scope.resolve('LegacyLLMGateway');
      
      // Determinar destino
      const target = await this.selectTarget(context);
      
      // Ejecutar
      const result = target === 'orchestrator'
        ? await orchestrator.process(context)
        : await legacyGateway.complete(this.convertContext(context));
      
      // Registrar métricas
      this.recordMetrics(context, result, target, Date.now() - startTime);
      
      return result;
      
    } finally {
      // Limpiar scope
      scope.dispose();
    }
  }
  
  /**
   * Seleccionar target (orchestrator vs legacy)
   */
  async selectTarget(context) {
    const { featureFlags } = this.services;
    
    if (!featureFlags.isEnabled('CAPABILITY_ENGINE_ENABLED', context)) {
      return 'legacy';
    }
    
    // Verificar disponibilidad
    const orchestrator = this.services.orchestrator;
    if (!await orchestrator.isAvailable()) {
      return 'legacy';
    }
    
    return 'orchestrator';
  }
}
```

### 4.2 CapabilityOrchestrator con DI

```javascript
// api/server/services/CapabilityOrchestrator/CapabilityOrchestrator.js

/**
 * CapabilityOrchestrator con Dependency Injection
 */
class CapabilityOrchestrator {
  /**
   * @param {Object} services - Servicios inyectados
   */
  constructor(services) {
    this.modelRegistry = services.modelRegistry;
    this.capabilityRegistry = services.capabilityRegistry;
    this.configService = services.configService;
    this.strategyEngine = services.strategyEngine;
    this.logger = services.logger;
    this.metrics = services.metrics;
  }
  
  /**
   * Verificar disponibilidad
   */
  async isAvailable() {
    try {
      // Health check básico
      await this.modelRegistry.healthCheck();
      return true;
    } catch (error) {
      this.logger.error('[CapabilityOrchestrator] Health check failed:', error);
      return false;
    }
  }
  
  /**
   * Procesar request
   */
  async process(context) {
    const startTime = Date.now();
    
    // 1. Obtener config del usuario
    const config = await this.configService.getConfig(context.userId);
    
    // 2. Detectar capabilities
    const capabilities = this.detectCapabilities(context);
    
    // 3. Encontrar candidatos
    const candidates = await this.findCandidates(capabilities, config);
    
    // 4. Seleccionar estrategia
    const strategy = config.strategy || 'priority';
    const selected = await this.strategyEngine.select(strategy, {
      candidates,
      config,
      context
    });
    
    // 5. Ejecutar
    const result = await this.execute(selected.model, context);
    
    // 6. Registrar métricas
    this.metrics.record({
      type: 'capability_orchestrator',
      latency: Date.now() - startTime,
      model: selected.model.id,
      capabilities
    });
    
    return result;
  }
}
```

---

## 5. TESTING CON DI

### 5.1 Unit Tests

```javascript
// tests/unit/strategy-engine.test.js

describe('StrategyEngine', () => {
  let container;
  let strategyEngine;
  let mockModelRegistry;
  let mockConfigService;
  
  beforeEach(() => {
    // Crear container de test
    container = createTestContainer();
    
    // Configurar mocks
    mockModelRegistry = {
      findByCapabilities: jest.fn()
    };
    
    mockConfigService = {
      getConfig: jest.fn()
    };
    
    container.registerSingleton('ModelRegistry', () => mockModelRegistry);
    container.registerSingleton('ConfigService', () => mockConfigService);
    
    // Resolver StrategyEngine
    strategyEngine = container.resolve('StrategyEngine');
  });
  
  afterEach(() => {
    container.clear();
  });
  
  describe('Priority Strategy', () => {
    it('should select highest priority model', async () => {
      // Arrange
      mockModelRegistry.findByCapabilities.mockResolvedValue([
        { id: 'model-a', priority: 50 },
        { id: 'model-b', priority: 100 },
        { id: 'model-c', priority: 75 }
      ]);
      
      // Act
      const result = await strategyEngine.select('priority', {
        candidates: await mockModelRegistry.findByCapabilities(['chat']),
        config: { strategy: 'priority' }
      });
      
      // Assert
      expect(result.selectedModel.id).toBe('model-b');
    });
    
    it('should fallback if primary fails', async () => {
      // Arrange
      const candidates = [
        { id: 'model-a', execute: jest.fn().mockRejectedValue(new Error('fail')) },
        { id: 'model-b', execute: jest.fn().mockResolvedValue({ content: 'ok' }) }
      ];
      
      // Act
      const result = await strategyEngine.executeWithFallback(candidates);
      
      // Assert
      expect(result.content).toBe('ok');
      expect(candidates[1].execute).toHaveBeenCalled();
    });
  });
});
```

### 5.2 Integration Tests

```javascript
// tests/integration/orchestrator.test.js

describe('CapabilityOrchestrator Integration', () => {
  let container;
  let orchestrator;
  
  beforeAll(async () => {
    // Container real para integration tests
    container = await createIntegrationContainer();
    orchestrator = container.resolve('CapabilityOrchestrator');
  });
  
  afterAll(async () => {
    // Cleanup
    container.clear();
  });
  
  it('should route programming task to best model', async () => {
    // Arrange
    const context = {
      userId: 'test-user',
      messages: [{
        role: 'user',
        content: 'Write a function that calculates fibonacci'
      }],
      options: {
        capabilities: ['code']
      }
    };
    
    // Act
    const result = await orchestrator.process(context);
    
    // Assert
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('metadata');
  });
});
```

### 5.3 Mock Container

```javascript
// tests/mocks/mockContainer.js

/**
 * Crear container con mocks para testing
 */
function createMockContainer(overrides = {}) {
  const container = new ServiceContainer();
  
  // Mocks por defecto
  const defaults = {
    Logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    ModelRegistry: {
      findByCapabilities: jest.fn().mockResolvedValue([]),
      getModel: jest.fn().mockResolvedValue(null),
      listModels: jest.fn().mockResolvedValue([]),
      healthCheck: jest.fn().mockResolvedValue(true)
    },
    CapabilityRegistry: {
      listCapabilities: jest.fn().mockReturnValue(['chat', 'code']),
      expandCapabilities: jest.fn().mockImplementation(caps => caps)
    },
    ConfigService: {
      getConfig: jest.fn().mockResolvedValue({
        mode: 'specialized',
        strategy: 'priority',
        activeModels: []
      }),
      updateConfig: jest.fn().mockResolvedValue({})
    },
    StrategyEngine: {
      select: jest.fn().mockResolvedValue({ selectedModel: null }),
      executeWithFallback: jest.fn().mockResolvedValue({ content: 'mocked' })
    }
  };
  
  // Combinar defaults con overrides
  const services = { ...defaults, ...overrides };
  
  // Registrar todos
  for (const [name, mock] of Object.entries(services)) {
    container.registerSingleton(name, () => mock);
  }
  
  return container;
}

module.exports = { createMockContainer };
```

---

## 6. PATTERNS DE DI

### 6.1 Constructor Injection (Recomendado)

```javascript
// Pattern recomendado
class MyService {
  constructor(deps) {
    this.modelRegistry = deps.modelRegistry;
    this.logger = deps.logger;
  }
}

// Registro
container.registerSingleton('MyService', (modelRegistry, logger) => {
  return new MyService({ modelRegistry, logger });
}, ['ModelRegistry', 'Logger']);
```

### 6.2 Property Injection

```javascript
// Para casos donde constructor injection no es posible
class MyService {
  setLogger(logger) {
    this.logger = logger;
  }
}

// Registro con setter
container.registerSingleton('MyService', () => {
  const service = new MyService();
  service.setLogger(container.resolve('Logger'));
  return service;
});
```

### 6.3 Method Injection

```javascript
// Para dependencias que varían por llamada
class RequestProcessor {
  process(context, modelSelector) {
    const model = modelSelector(this.modelRegistry);
    // ...
  }
}

// El modelo selector se pasa como parámetro
const processor = container.resolve('RequestProcessor');
processor.process(context, (registry) => registry.findByCapabilities(['chat']));
```

---

## 7. CONCLUSIÓN

El ServiceContainer proporciona:

| Aspecto | Beneficio |
|---------|----------|
| **Desacoplamiento** | Servicios no conocen sus dependencias directamente |
| **Testabilidad** | Fácil mockear servicios en tests |
| **Lifecycle management** | Singleton, Transient, Scoped |
| **Lazy loading** | Servicios se crean solo cuando se necesitan |
| **Centralizado** | Un lugar para configurar todas las dependencias |

El patrón permite que el código sea más limpio, testeable y mantenible.
