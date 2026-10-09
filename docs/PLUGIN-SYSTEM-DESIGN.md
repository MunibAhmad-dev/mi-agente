# 🔌 DISEÑO DEL SISTEMA DE PLUGINS
## Universal AI Gateway - Plugin Architecture

**Fecha:** 2026-07-21
**Versión:** 1.0
**Autor:** OpenHands Agent

---

## TABLA DE CONTENIDOS

1. [Resumen](#1-resumen)
2. [Arquitectura del Plugin System](#2-arquitectura-del-plugin-system)
3. [Tipos de Plugins](#3-tipos-de-plugins)
4. [Interfaz Base de Plugin](#4-interfaz-base-de-plugin)
5. [Plugin Manager](#5-plugin-manager)
6. [Plugin Lifecycle](#6-plugin-lifecycle)
7. [Discovery & Loading](#7-discovery--loading)
8. [Ejemplos de Plugins](#8-ejemplos-de-plugins)
9. [API del Plugin System](#9-api-del-plugin-system)

---

## 1. RESUMEN

### 1.1 Objetivo

El Plugin System permite que el Universal AI Gateway sea extensible sin modificar su código base. Cualquier funcionalidad puede agregarse mediante plugins.

### 1.2 Principios

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRINCIPIOS DEL PLUGIN SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. plugins son INDEPENDIENTES                                              │
│     - Pueden cargarse y descargarse sin afectar otros                      │
│                                                                              │
│  2. El NÚCLEO no conoce plugins específicos                                │
│     - Solo conoce la interfaz Plugin                                       │
│                                                                              │
│  3. plugins pueden DEPENDER de otros plugins                               │
│     - Sistema de dependencias                                             │
│                                                                              │
│  4. plugins son VERSIONADOS                                               │
│     - Compatibilidad semántica                                             │
│                                                                              │
│  5. plugins son AISLADOS                                                 │
│     - Cada plugin tiene su propio contexto                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. ARQUITECTURA DEL PLUGIN SYSTEM

### 2.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PLUGIN SYSTEM ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      PLUGIN MANAGER                                   │   │
│  │                                                                      │   │
│  │  Responsibilities:                                                  │   │
│  │  - Load/unload plugins                                              │   │
│  │  - Manage plugin lifecycle                                           │   │
│  │  - Handle dependencies                                             │   │
│  │  - Provide plugin context                                           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     PLUGIN REGISTRY                                    │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │   │
│  │  │  openai    │  │  anthropic  │  │   ollama   │           │   │
│  │  │  adapter   │  │  adapter    │  │   adapter   │           │   │
│  │  │  plugin    │  │  plugin     │  │   plugin    │           │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │   │
│  │  │ litellm    │  │   custom   │  │   mcp     │           │   │
│  │  │  adapter   │  │  adapter   │  │   server   │           │   │
│  │  │  plugin    │  │  plugin    │  │   plugin   │           │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      PLUGIN CONTEXT                                     │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │   │
│  │  │  Model     │  │  Provider  │  │   Auth    │           │   │
│  │  │  Registry  │  │  Registry  │  │   Center  │           │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │   │
│  │  │  EventBus  │  │   Logger   │  │   Config   │           │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Flujo de Carga

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN LOADING FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DISCOVER                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  pluginManager.discover()                                                   │
│       │                                                                   │
│       ├── Scan plugin directories                                         │
│       ├── Read plugin manifests (package.json / plugin.json)              │
│       └── Return list of discovered plugins                               │
│                                                                              │
│                                    ▼                                        │
│                                                                              │
│  2. RESOLVE DEPENDENCIAS                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  for each plugin:                                                          │
│       │                                                                   │
│       ├── Read dependencies from manifest                                 │
│       ├── Check if dependencies are installed                             │
│       └── Build dependency graph                                         │
│                                                                              │
│                                    ▼                                        │
│                                                                              │
│  3. TOPOLOGICAL SORT                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ┌─────────┐                                                             │
│  │Plugin A │                                                             │
│  └────┬────┘                                                             │
│       │ depends on                                                        │
│       ▼                                                                   │
│  ┌─────────┐                                                             │
│  │Plugin B │                                                             │
│  └────┬────┘                                                             │
│       │ depends on                                                        │
│       ▼                                                                   │
│  ┌─────────┐                                                             │
│  │Plugin C │  ← Load first                                              │
│  └─────────┘                                                             │
│                                                                              │
│                                    ▼                                        │
│                                                                              │
│  4. INITIALIZE                                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  for each plugin in sorted order:                                         │
│       │                                                                   │
│       ├── Create plugin context                                           │
│       ├── Load plugin module                                              │
│       ├── Call plugin.initialize(context)                                 │
│       └── Register plugin in registry                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. TIPOS DE PLUGINS

### 3.1 Catálogo de Tipos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN TYPES                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TYPE                    DESCRIPTION                    INTERFACE            │
│  ─────────────────────────────────────────────────────────────────────────
│                                                                              │
│  provider-adapter       Conectar a un provider AI    AIProviderAdapter       │
│  model-provider         Registrar modelos             ModelProvider           │
│  auth-strategy         Nuevo método de auth         AuthStrategy           │
│  tool                  Herramienta disponible        Tool                    │
│  memory-system         Sistema de memoria           MemorySystem            │
│  workflow-engine       Motor de workflows           WorkflowEngine          │
│  agent                 Definición de agente          Agent                  │
│  mcp-server           Servidor MCP                 MCPServer              │
│  inference-engine      Motor de inferencia local   InferenceEngine         │
│  embedding-provider    Sistema de embeddings        EmbeddingProvider       │
│  metrics-exporter     Exportar métricas           MetricsExporter         │
│  logging-driver       Driver de logging          LoggingDriver           │
│  cache-backend        Backend de cache            CacheBackend            │
│  storage-backend      Backend de almacenamiento   StorageBackend           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Provider Adapter Plugin

```typescript
// plugins/provider-adapter/interface.ts

/**
 * Interface que deben implementar todos los provider adapters
 */
export interface ProviderAdapterPlugin extends Plugin {
  readonly pluginType: 'provider-adapter';
  
  // AIProviderAdapter implementation
  readonly adapterId: string;
  readonly capabilities: Capability[];
  
  complete(request: AdapterRequest): Promise<AdapterResponse>;
  stream(request: AdapterRequest): AsyncIterable<AdapterStreamChunk>;
  getModels(): Promise<AdapterModel[]>;
  healthCheck(): Promise<AdapterHealth>;
  
  // Lifecycle
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
}

// Ejemplo de manifest
const manifest: PluginManifest = {
  id: 'openai-adapter',
  name: 'OpenAI Adapter',
  version: '1.0.0',
  type: 'provider-adapter',
  description: 'Adapter for OpenAI API',
  author: 'Universal AI Gateway Team',
  exports: ['complete', 'stream', 'getModels', 'healthCheck'],
  dependencies: [],
  configSchema: {
    type: 'object',
    properties: {
      apiKey: { type: 'string' },
      organization: { type: 'string' },
      baseUrl: { type: 'string' },
    },
    required: ['apiKey'],
  },
};
```

### 3.3 Tool Plugin

```typescript
// plugins/tool/interface.ts

/**
 * Interface para plugins de herramientas
 */
export interface ToolPlugin extends Plugin {
  readonly pluginType: 'tool';
  
  // Tool implementation
  readonly toolName: string;
  readonly toolDescription: string;
  readonly toolParameters: JSONSchema;
  
  execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult>;
}

interface ToolExecutionContext {
  userId: string;
  conversationId: string;
  sessionId: string;
  sandboxId?: string;
}

interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### 3.4 Agent Plugin

```typescript
// plugins/agent/interface.ts

/**
 * Interface para plugins de agentes
 */
export interface AgentPlugin extends Plugin {
  readonly pluginType: 'agent';
  
  // Agent implementation
  readonly agentType: string;
  readonly agentDescription: string;
  readonly capabilities: Capability[];
  
  createAgent(config: AgentConfig): Agent;
  getDefaultSystemPrompt(): string;
}

interface Agent {
  id: string;
  execute(task: AgentTask): Promise<AgentResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}
```

---

## 4. INTERFAZ BASE DE PLUGIN

### 4.1 Plugin Interface

```typescript
// plugin-system/interfaces/Plugin.ts

/**
 * Interface base que todos los plugins deben implementar
 */
export interface Plugin {
  // === Metadatos (requeridos) ===
  readonly pluginId: string;
  readonly pluginName: string;
  readonly version: string;
  readonly description: string;
  readonly author: string;
  
  // === Tipo de plugin ===
  readonly pluginType: PluginType;
  
  // === Dependencias (opcional) ===
  readonly dependencies?: PluginDependency[];
  
  // === Lifecycle (requeridos) ===
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
  
  // === Manifest ===
  getManifest(): PluginManifest;
}

/**
 * Tipos de plugins soportados
 */
export type PluginType = 
  | 'provider-adapter'
  | 'model-provider'
  | 'auth-strategy'
  | 'tool'
  | 'memory-system'
  | 'workflow-engine'
  | 'agent'
  | 'mcp-server'
  | 'inference-engine'
  | 'embedding-provider'
  | 'metrics-exporter'
  | 'logging-driver'
  | 'cache-backend'
  | 'storage-backend'
  | 'custom';

/**
 * Dependencia de plugin
 */
export interface PluginDependency {
  pluginId: string;
  versionRange: string;  // semver range
  optional?: boolean;
}

/**
 * Contexto proporcionado al plugin
 */
export interface PluginContext {
  // === Registries ===
  modelRegistry: ModelRegistry;
  providerRegistry: ProviderRegistry;
  authCenter: AuthenticationCenter;
  eventBus: EventBus;
  
  // === Core Services ===
  logger: Logger;
  config: ConfigManager;
  httpClient: HTTPClient;
  crypto: CryptoService;
  
  // === Utilities ===
  sandbox: SandboxManager;
  cache: CacheService;
  storage: StorageService;
  
  // === Plugin-specific ===
  getService<T>(serviceName: string): T | undefined;
  registerService(name: string, service: unknown): void;
}

/**
 * Manifest del plugin
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  description: string;
  author: string;
  license?: string;
  homepage?: string;
  repository?: string;
  
  // Exports
  exports: string[];
  
  // Configuration
  configSchema?: JSONSchema;
  defaultConfig?: Record<string, unknown>;
  
  // Dependencies
  dependencies?: PluginDependency[];
  
  // Lifecycle hooks
  hooks?: {
    onLoad?: string;
    onUnload?: string;
    onError?: string;
  };
}
```

---

## 5. PLUGIN MANAGER

### 5.1 Clase PluginManager

```typescript
// plugin-system/PluginManager.ts

/**
 * PluginManager - Gestiona el lifecycle de plugins
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private contexts: Map<string, PluginContext> = new Map();
  private registry: PluginRegistry;
  
  constructor(
    private config: PluginManagerConfig,
    private services: CoreServices
  ) {
    this.registry = new PluginRegistry();
  }
  
  // === Discovery ===
  
  /**
   * Descubrir plugins disponibles
   */
  async discover(searchPaths?: string[]): Promise<DiscoveredPlugin[]> {
    const paths = searchPaths || this.config.pluginPaths;
    const discovered: DiscoveredPlugin[] = [];
    
    for (const path of paths) {
      const manifests = await this.findManifests(path);
      for (const manifest of manifests) {
        discovered.push({
          manifest,
          path,
          status: 'discovered',
        });
      }
    }
    
    return discovered;
  }
  
  /**
   * Encontrar manifests en un directorio
   */
  private async findManifests(dirPath: string): Promise<PluginManifest[]> {
    // Buscar plugin.json o package.json con "universalAiGatewayPlugin"
    const entries = await fs.readdir(dirPath, { recursive: true });
    const manifests: PluginManifest[] = [];
    
    for (const entry of entries) {
      if (entry.endsWith('plugin.json')) {
        const manifest = JSON.parse(await fs.readFile(entry));
        manifests.push(manifest);
      }
    }
    
    return manifests;
  }
  
  // === Loading ===
  
  /**
   * Cargar un plugin
   */
  async load(pluginId: string, config?: Record<string, unknown>): Promise<void> {
    const manifest = await this.loadManifest(pluginId);
    await this.validateDependencies(manifest);
    
    // Crear contexto
    const context = this.createContext(manifest, config);
    this.contexts.set(pluginId, context);
    
    // Cargar módulo
    const module = await this.loadModule(manifest);
    
    // Instanciar plugin
    const plugin = this.instantiatePlugin(module, manifest);
    
    // Inicializar
    await plugin.initialize(context);
    
    // Registrar
    this.plugins.set(pluginId, plugin);
    this.registry.register(plugin);
    
    // Hook post-load
    await this.runHook(manifest, 'onLoad');
  }
  
  /**
   * Descargar un plugin
   */
  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not loaded`);
    }
    
    // Verificar dependencias
    const dependents = this.getDependents(pluginId);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unload ${pluginId}: ${dependents.join(', ')} depend on it`
      );
    }
    
    const manifest = plugin.getManifest();
    
    // Hook pre-unload
    await this.runHook(manifest, 'onUnload');
    
    // Shutdown
    await plugin.shutdown();
    
    // Remover
    this.plugins.delete(pluginId);
    this.contexts.delete(pluginId);
    this.registry.unregister(pluginId);
  }
  
  // === Lifecycle ===
  
  /**
   * Inicializar todos los plugins descubiertos
   */
  async initializeAll(configs?: Map<string, Record<string, unknown>>): Promise<void> {
    const discovered = await this.discover();
    
    // Topological sort para dependencias
    const sorted = this.topologicalSort(discovered);
    
    for (const plugin of sorted) {
      const pluginConfig = configs?.get(plugin.manifest.id);
      await this.load(plugin.manifest.id, pluginConfig);
    }
  }
  
  /**
   * Shutdown de todos los plugins
   */
  async shutdownAll(): Promise<void> {
    const plugins = Array.from(this.plugins.values());
    
    // Reversed order (last loaded = first unloaded)
    for (const plugin of plugins.reverse()) {
      try {
        await this.unload(plugin.pluginId);
      } catch (error) {
        this.services.logger.error(
          `Error unloading plugin ${plugin.pluginId}`,
          { error }
        );
      }
    }
  }
  
  // === Queries ===
  
  /**
   * Obtener plugin por ID
   */
  getPlugin<T extends Plugin = Plugin>(pluginId: string): T | undefined {
    return this.plugins.get(pluginId) as T | undefined;
  }
  
  /**
   * Listar plugins cargados
   */
  listPlugins(type?: PluginType): Plugin[] {
    const all = Array.from(this.plugins.values());
    if (type) {
      return all.filter(p => p.pluginType === type);
    }
    return all;
  }
  
  // === Internals ===
  
  private createContext(manifest: PluginManifest, config?: Record<string, unknown>): PluginContext {
    return {
      modelRegistry: this.services.modelRegistry,
      providerRegistry: this.services.providerRegistry,
      authCenter: this.services.authCenter,
      eventBus: this.services.eventBus,
      logger: this.services.logger.child({ plugin: manifest.id }),
      config: this.services.config.forPlugin(manifest.id, config),
      httpClient: this.services.httpClient,
      crypto: this.services.crypto,
      sandbox: this.services.sandbox,
      cache: this.services.cache,
      storage: this.services.storage,
      getService: (name) => this.getService(name),
      registerService: (name, service) => this.registerService(name, service),
    };
  }
  
  private async loadModule(manifest: PluginManifest): Promise<unknown> {
    // Dynamic import del módulo
    const modulePath = this.resolveModulePath(manifest);
    return import(modulePath);
  }
  
  private instantiatePlugin(module: unknown, manifest: PluginManifest): Plugin {
    // Buscar export default o export named
    if (typeof module === 'function') {
      return module();
    }
    if ((module as any).default) {
      return (module as any).default;
    }
    if ((module as any)[manifest.id]) {
      return (module as any)[manifest.id];
    }
    throw new Error(`Cannot instantiate plugin ${manifest.id}`);
  }
  
  private topologicalSort(plugins: DiscoveredPlugin[]): DiscoveredPlugin[] {
    // Implementación de topological sort
    // Retorna plugins en orden de dependencias
    const sorted: DiscoveredPlugin[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = async (plugin: DiscoveredPlugin) => {
      if (visited.has(plugin.manifest.id)) return;
      if (visiting.has(plugin.manifest.id)) {
        throw new Error(`Circular dependency: ${plugin.manifest.id}`);
      }
      
      visiting.add(plugin.manifest.id);
      
      for (const dep of plugin.manifest.dependencies || []) {
        const depPlugin = plugins.find(p => p.manifest.id === dep.pluginId);
        if (depPlugin) {
          await visit(depPlugin);
        }
      }
      
      visiting.delete(plugin.manifest.id);
      visited.add(plugin.manifest.id);
      sorted.push(plugin);
    };
    
    for (const plugin of plugins) {
      await visit(plugin);
    }
    
    return sorted;
  }
}

interface DiscoveredPlugin {
  manifest: PluginManifest;
  path: string;
  status: 'discovered' | 'loaded' | 'error';
}
```

### 5.2 Plugin Registry

```typescript
// plugin-system/PluginRegistry.ts

/**
 * Registro central de plugins cargados
 */
export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  private byType: Map<PluginType, Set<string>> = new Map();
  private byCapability: Map<string, Set<string>> = new Map();
  
  register(plugin: Plugin): void {
    this.plugins.set(plugin.pluginId, plugin);
    
    // Index by type
    if (!this.byType.has(plugin.pluginType)) {
      this.byType.set(plugin.pluginType, new Set());
    }
    this.byType.get(plugin.pluginType)!.add(plugin.pluginId);
  }
  
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    this.plugins.delete(pluginId);
    this.byType.get(plugin.pluginType)?.delete(pluginId);
  }
  
  get(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  getByType(type: PluginType): Plugin[] {
    const ids = this.byType.get(type) || new Set();
    return Array.from(ids).map(id => this.plugins.get(id)!).filter(Boolean);
  }
  
  getByCapability(capability: string): Plugin[] {
    const ids = this.byCapability.get(capability) || new Set();
    return Array.from(ids).map(id => this.plugins.get(id)!).filter(Boolean);
  }
  
  listAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}
```

---

## 6. PLUGIN LIFECYCLE

### 6.1 Estados del Plugin

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN LIFECYCLE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐                                                              │
│  │DISCOVERED│  Plugin encontrado pero no cargado                           │
│  └────┬────┘                                                              │
│       │ load()                                                              │
│       ▼                                                                     │
│  ┌─────────┐                                                              │
│  │ LOADING │  Resolviendo dependencias                                    │
│  └────┬────┘                                                              │
│       │ dependencies resolved                                               │
│       ▼                                                                     │
│  ┌─────────┐                                                              │
│  │ INITIALIZING│  Ejecutando initialize()                                 │
│  └────┬────┘                                                              │
│       │ initialized successfully                                           │
│       ▼                                                                     │
│  ┌─────────┐                                                              │
│  │  ACTIVE │  Plugin funcionando normalmente                              │
│  └────┬────┘                                                              │
│       │                                                                      │
│       ├── unload() ──▶ UNLOADING ──▶ UNLOADED                            │
│       │                                                                      │
│       ├── error ──▶ ERROR (puede retry a ACTIVE)                          │
│       │                                                                      │
│       └── shutdown() ──▶ SHUTDOWN ──▶ UNLOADED                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Lifecycle Hooks

```typescript
// hooks en PluginManifest

const manifest: PluginManifest = {
  id: 'my-plugin',
  // ...
  
  hooks: {
    // Ejecutado después de cargar el plugin
    onLoad: 'onLoad',
    
    // Ejecutado antes de descargar el plugin
    onUnload: 'onUnload',
    
    // Ejecutado cuando ocurre un error no manejado
    onError: 'onError',
  },
};

// En el plugin
class MyPlugin implements Plugin {
  async onLoad(): Promise<void> {
    console.log('Plugin loaded');
  }
  
  async onUnload(): Promise<void> {
    console.log('Cleaning up...');
    await this.cleanup();
  }
  
  async onError(error: Error): Promise<void> {
    console.error('Plugin error:', error);
    await this.reportError(error);
  }
}
```

---

## 7. DISCOVERY & LOADING

### 7.1 Directorios de Plugins

```
project-root/
├── plugins/                    # Plugins locales
│   ├── openai-adapter/
│   │   ├── plugin.json
│   │   ├── dist/
│   │   │   └── index.js
│   │   └── package.json
│   │
│   ├── custom-auth/
│   │   ├── plugin.json
│   │   └── dist/
│   │
│   └── my-tool/
│       ├── plugin.json
│       └── dist/
│
├── node_modules/               # Plugins instalados
│   ├── @universal-ai-gateway/
│   │   ├── adapter-openai/
│   │   ├── adapter-anthropic/
│   │   └── adapter-litellm/
│   │
│   └── @community/
│       ├── adapter-ollama/
│       └── tool-image-generator/
│
└── universal-ai-gateway/
    └── plugin-system/
```

### 7.2 Plugin Manifest

```json
// plugin.json
{
  "id": "openai-adapter",
  "name": "OpenAI Adapter",
  "version": "1.0.0",
  "type": "provider-adapter",
  "description": "Adapter for OpenAI API with full OpenAI compatibility",
  "author": "Universal AI Gateway Team",
  "license": "MIT",
  
  "exports": [
    "complete",
    "stream", 
    "getModels",
    "healthCheck"
  ],
  
  "dependencies": [],
  
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "description": "OpenAI API Key",
        "required": true,
        "secret": true
      },
      "organization": {
        "type": "string",
        "description": "OpenAI Organization ID (optional)"
      },
      "baseUrl": {
        "type": "string",
        "description": "Custom API base URL (optional)",
        "default": "https://api.openai.com"
      }
    }
  },
  
  "defaultConfig": {
    "baseUrl": "https://api.openai.com"
  }
}
```

### 7.3 npm Package con Plugin

```json
// package.json
{
  "name": "@my-org/custom-model-adapter",
  "version": "1.0.0",
  "main": "dist/index.js",
  "universalAiGatewayPlugin": {
    "id": "custom-model-adapter",
    "name": "Custom Model Adapter",
    "type": "provider-adapter",
    "version": "1.0.0"
  }
}
```

---

## 8. EJEMPLOS DE PLUGINS

### 8.1 Provider Adapter Plugin

```typescript
// plugins/my-provider-adapter/index.ts

import { ProviderAdapterPlugin, PluginContext, Capability } from '@universal-ai-gateway/plugin-system';

class MyProviderAdapter implements ProviderAdapterPlugin {
  readonly pluginId = 'my-provider';
  readonly pluginName = 'My Custom AI Provider';
  readonly version = '1.0.0';
  readonly description = 'Adapter for My Custom AI Provider';
  readonly author = 'My Organization';
  readonly pluginType = 'provider-adapter' as const;
  
  readonly capabilities = [
    Capability.LLM_CHAT,
    Capability.LLM_STREAMING,
  ];
  
  private context!: PluginContext;
  private client!: MyProviderClient;
  
  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    
    const config = context.config.get<MyProviderConfig>();
    
    this.client = new MyProviderClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
    
    // Register provider in registry
    context.providerRegistry.register({
      providerId: this.pluginId,
      providerName: this.pluginName,
      adapterId: this.pluginId,
      connection: { baseUrl: config.baseUrl },
      // ... other config
    });
    
    context.logger.info(`Plugin ${this.pluginId} initialized`);
  }
  
  async shutdown(): Promise<void> {
    await this.client.close();
    this.context.logger.info(`Plugin ${this.pluginId} shutdown`);
  }
  
  async complete(request: any): Promise<any> {
    const response = await this.client.chat(request);
    return this.translateResponse(response);
  }
  
  async *stream(request: any): AsyncIterable<any> {
    for await (const chunk of this.client.chatStream(request)) {
      yield this.translateChunk(chunk);
    }
  }
  
  async getModels(): Promise<any[]> {
    return this.client.listModels();
  }
  
  async healthCheck(): Promise<any> {
    try {
      await this.client.ping();
      return { status: 'healthy', latencyMs: 0 };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
  
  getManifest() {
    return {
      id: this.pluginId,
      name: this.pluginName,
      version: this.version,
      type: this.pluginType,
      description: this.description,
      author: this.author,
      exports: ['complete', 'stream', 'getModels', 'healthCheck'],
      configSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', required: true },
          baseUrl: { type: 'string', default: 'https://api.myprovider.com' },
        },
      },
    };
  }
}

export default MyProviderAdapter;
module.exports = MyProviderAdapter;
```

### 8.2 Tool Plugin

```typescript
// plugins/image-generator-tool/index.ts

import { ToolPlugin, PluginContext } from '@universal-ai-gateway/plugin-system';

class ImageGeneratorTool implements ToolPlugin {
  readonly pluginId = 'image-generator';
  readonly pluginName = 'Image Generator';
  readonly version = '1.0.0';
  readonly description = 'Generate images using AI';
  readonly author = 'My Organization';
  readonly pluginType = 'tool' as const;
  
  readonly toolName = 'generate_image';
  readonly toolDescription = 'Generate an image from a text description';
  readonly toolParameters = {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Image description' },
      size: { 
        type: 'string', 
        enum: ['1024x1024', '1024x1792', '1792x1024'],
        default: '1024x1024'
      },
      model: { type: 'string', default: 'dall-e-3' },
    },
    required: ['prompt'],
  };
  
  private context!: PluginContext;
  
  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.info('Image Generator tool initialized');
  }
  
  async shutdown(): Promise<void> {
    // Cleanup
  }
  
  async execute(params: any, context: any): Promise<any> {
    const { prompt, size, model } = params;
    
    try {
      // Call image generation API
      const result = await this.generateImage({ prompt, size, model });
      
      return {
        success: true,
        output: {
          url: result.url,
          revisedPrompt: result.revised_prompt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  private async generateImage(params: any): Promise<any> {
    // Implementation
    return { url: 'https://example.com/image.png' };
  }
  
  getManifest() {
    return {
      id: this.pluginId,
      name: this.pluginName,
      version: this.version,
      type: this.pluginType,
      description: this.description,
      author: this.author,
      exports: ['execute'],
    };
  }
}

export default ImageGeneratorTool;
module.exports = ImageGeneratorTool;
```

### 8.3 Auth Strategy Plugin

```typescript
// plugins/oauth-auth-strategy/index.ts

import { AuthStrategyPlugin, PluginContext, Credentials } from '@universal-ai-gateway/plugin-system';

class OAuthAuthStrategy implements AuthStrategyPlugin {
  readonly pluginId = 'oauth-auth';
  readonly pluginName = 'OAuth Authentication';
  readonly version = '1.0.0';
  readonly description = 'OAuth 2.0 authentication strategy';
  readonly author = 'My Organization';
  readonly pluginType = 'auth-strategy' as const;
  
  private context!: PluginContext;
  
  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    this.context.authCenter.registerStrategy('oauth', this);
  }
  
  async shutdown(): Promise<void> {}
  
  async authenticate(config: OAuthConfig): Promise<Credentials> {
    // OAuth flow implementation
    const tokens = await this.performOAuthFlow(config);
    
    return {
      type: 'oauth',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    };
  }
  
  async refresh(credentials: Credentials): Promise<Credentials> {
    // Refresh token implementation
    const newTokens = await this.refreshTokens(credentials.refreshToken);
    
    return {
      type: 'oauth',
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: new Date(Date.now() + newTokens.expiresIn * 1000),
    };
  }
  
  async verify(credentials: Credentials): Promise<boolean> {
    try {
      await this.validateToken(credentials.accessToken);
      return true;
    } catch {
      return false;
    }
  }
  
  getManifest() {
    return {
      id: this.pluginId,
      name: this.pluginName,
      version: this.version,
      type: this.pluginType,
      description: this.description,
      author: this.author,
      exports: ['authenticate', 'refresh', 'verify'],
    };
  }
}

export default OAuthAuthStrategy;
module.exports = OAuthAuthStrategy;
```

---

## 9. API DEL PLUGIN SYSTEM

### 9.1 API Pública

```typescript
// plugin-system/api.ts

export class PluginSystem {
  private manager: PluginManager;
  
  /**
   * Inicializar el sistema de plugins
   */
  async initialize(config: PluginSystemConfig): Promise<void> {
    this.manager = new PluginManager(config, this.services);
    await this.manager.initializeAll();
  }
  
  /**
   * Instalar un plugin desde npm
   */
  async installPlugin(packageName: string, config?: Record<string, unknown>): Promise<void> {
    // npm install
    await exec(`npm install ${packageName}`);
    
    // Load it
    await this.manager.load(packageName, config);
  }
  
  /**
   * Desinstalar un plugin
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    await this.manager.unload(pluginId);
    // npm uninstall
    await exec(`npm uninstall ${pluginId}`);
  }
  
  /**
   * Listar plugins instalados
   */
  listInstalledPlugins(): PluginInfo[] {
    return this.manager.listPlugins().map(p => ({
      id: p.pluginId,
      name: p.pluginName,
      version: p.version,
      type: p.pluginType,
    }));
  }
  
  /**
   * Listar plugins disponibles (desde registry)
   */
  async listAvailablePlugins(): Promise<AvailablePlugin[]> {
    // Query plugin registry / npm
    return [];
  }
  
  /**
   * Habilitar plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    await this.manager.load(pluginId);
  }
  
  /**
   * Deshabilitar plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    await this.manager.unload(pluginId);
  }
  
  /**
   * Obtener plugin
   */
  getPlugin<T extends Plugin = Plugin>(pluginId: string): T | undefined {
    return this.manager.getPlugin<T>(pluginId);
  }
  
  /**
   * Buscar plugins por tipo
   */
  getPluginsByType<T extends Plugin = Plugin>(type: PluginType): T[] {
    return this.manager.listPlugins(type) as T[];
  }
}

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  enabled: boolean;
}

interface AvailablePlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  downloads: number;
}
```

### 9.2 CLI Commands

```bash
# Listar plugins instalados
universal-ai-gateway plugins list

# Instalar plugin
universal-ai-gateway plugins install @my-org/adapter

# Desinstalar plugin
universal-ai-gateway plugins uninstall @my-org/adapter

# Habilitar plugin
universal-ai-gateway plugins enable my-adapter

# Deshabilitar plugin
universal-ai-gateway plugins disable my-adapter

# Info de plugin
universal-ai-gateway plugins info my-adapter

# Actualizar plugin
universal-ai-gateway plugins update my-adapter
```

---

## 10. CONCLUSIÓN

### 10.1 Beneficios del Plugin System

| Beneficio | Descripción |
|-----------|-------------|
| **Extensibilidad** | Agregar funcionalidad sin modificar código base |
| **Modularidad** | Cada plugin es independiente |
| **Testabilidad** | Testear plugins en isolation |
| **Mantenibilidad** | Actualizar plugins sin afectar el sistema |
| **Distribución** | Compartir plugins via npm |
| **Versioning** | Control de versiones con semver |

### 10.2 Seguridad

- Plugins ejecutan en sandbox aislado
- Permisos granulares
- Validación de manifest
- Firmas digitales (futuro)

---

**Fin del Documento de Plugin System**
