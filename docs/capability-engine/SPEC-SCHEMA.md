# 📊 Especificación: Schema Simplificado de MongoDB

**Fecha:** 2026-07-20  
**Propósito:** Definir schema simplificado y mantenible para Multi-LLM Configuration

---

## 1. PRINCIPIOS DE DISEÑO

### 1.1 Objetivos

1. **Simplicidad** - Máximo 2-3 niveles de anidación
2. **Query-friendly** - Estructura optimizada para consultas frecuentes
3. **Evolucionable** - Fácil agregar campos sin migraciones complejas
4. **Type-safe** - Compatible con TypeScript/Mongoose

### 1.2 Estructura Actual vs Propuesta

```
ACTUAL (Muy anidado):
┌─────────────────────────────────────────┐
│ MultiLLMConfig {                         │
│   global: {                               │
│     mode, strategy, limits: {...},        │
│     providers: {...},                     │
│     filters: {...}                        │
│   },                                      │
│   activeModels: [...],                    │
│   roles: Map<roleId, Role>               │ ← Map en MongoDB = difícil
│   profiles: [...],                        │
│   strategyConfig: Map<...>              │ ← Map = difícil
│   userConstraints: {...}                  │
│ }                                        │
└─────────────────────────────────────────┘

PROPUESTO (Simplificado):
┌─────────────────────────────────────────┐
│ MultiLLMConfig {                         │
│   userId: ObjectId,                      │
│   mode: String,                          │
│   strategy: String,                       │
│   activeModels: [{...}],                 │ ← Array simple
│   roles: [{...}],                        │ ← Array simple (no Map)
│   profileId: String | null,              │
│   filters: {...}                          │ ← Solo 2 niveles
│ }                                        │
└─────────────────────────────────────────┘
```

---

## 2. SCHEMA DEFINITIVO

### 2.1 Schema Principal

```javascript
// api/server/services/CapabilityOrchestrator/models/MultiLLMConfig.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * MultiLLMConfig Schema - Configuración de usuario para Multi-LLM
 * 
 * Diseño: Máximo 2 niveles de anidación para simplicidad
 */
const multiLLMConfigSchema = new Schema({
  // === IDENTIFICACIÓN ===
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  
  // === CONFIGURACIÓN GLOBAL ===
  mode: {
    type: String,
    enum: ['simple', 'specialized', 'intelligent'],
    default: 'specialized'
  },
  
  strategy: {
    type: String,
    enum: [
      'fixed', 
      'round_robin', 
      'priority', 
      'latency', 
      'cost', 
      'context', 
      'reasoning', 
      'consensus', 
      'parallel', 
      'auto'
    ],
    default: 'priority'
  },
  
  // === MODELOS ACTIVOS ===
  // Array simple en lugar de Map
  activeModels: {
    type: [{
      modelId: {
        type: String,
        required: true,
        description: 'provider/model-name (e.g., "openai/gpt-4o")'
      },
      enabled: {
        type: Boolean,
        default: true
      },
      priority: {
        type: Number,
        min: 1,
        max: 100,
        default: 50
      },
      temperature: {
        type: Number,
        min: 0,
        max: 2,
        default: 0.7
      },
      topP: {
        type: Number,
        min: 0,
        max: 1,
        default: null
      },
      topK: {
        type: Number,
        min: 1,
        max: 100,
        default: null
      },
      maxTokens: {
        type: Number,
        min: 1,
        max: 32000,
        default: 4096
      },
      tags: [{
        type: String,
        description: 'Etiquetas para categorización (e.g., "fast", "cheap", "coding")'
      }]
    }],
    default: [],
    validate: {
      validator: function(models) {
        return models.length <= 20; // Máximo 20 modelos activos
      },
      message: 'Maximum 20 active models allowed'
    }
  },
  
  // === ROLES ===
  // Array embebido en lugar de Map
  roles: {
    type: [{
      id: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true
      },
      description: String,
      
      // Capabilities requeridas (array simple)
      requiredCapabilities: [{
        type: String,
        enum: [
          'chat', 'reasoning', 'code', 'analysis',
          'frontend', 'backend', 'architecture', 'security',
          'devops', 'database', 'vision', 'audio', 'multimodal',
          'tool_calling', 'function_calling', 'long_context',
          'math', 'reasoning_chain', 'search', 'translation',
          'summarization', 'classification', 'embeddings', 'rag',
          'creative', 'writing', 'image_generation', 'video_generation'
        ]
      }],
      
      // Estrategia para este rol
      strategy: {
        type: String,
        enum: ['fixed', 'round_robin', 'priority', 'latency', 'cost', 'auto'],
        default: 'priority'
      },
      
      // Modelos en orden de prioridad
      modelPriorities: {
        type: [{
          modelId: String,
          priority: { type: Number, min: 1, max: 100 },
          maxRetries: { type: Number, default: 3 }
        }],
        default: []
      },
      
      // Constraints específicos del rol
      constraints: {
        maxLatency: { type: Number, default: null },
        maxCostPerRequest: { type: Number, default: null },
        requireFallback: { type: Boolean, default: true }
      }
    }],
    default: [],
    // Roles predefinidos se crean automáticamente
    validate: {
      validator: function(roles) {
        // Máximo 10 roles
        return roles.length <= 10;
      },
      message: 'Maximum 10 roles allowed'
    }
  },
  
  // === FILTROS ===
  filters: {
    // Proveedores
    allowedProviders: [{ type: String }],
    excludedProviders: [{ type: String }],
    
    // Latencia
    maxLatency: { type: Number, default: null }, // ms
    
    // Costo
    maxCostPer1K: { type: Number, default: null }, // USD
    
    // Contexto
    minContext: { type: Number, default: null },
    maxContext: { type: Number, default: null },
    
    // Parámetros del modelo
    minParameters: { type: Number, default: null }, // Billones
    maxParameters: { type: Number, default: null }
  },
  
  // === PERFIL ===
  profileId: {
    type: String,
    enum: ['development', 'research', 'cost_effective', 'high_quality', 'local', 'hybrid', null],
    default: null
  },
  
  // === METADATA ===
  version: {
    type: String,
    default: '1.0'
  },
  
  migratedFrom: {
    type: String,
    default: null
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  // Opciones de schema
  collection: 'multi_llm_configs',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// === ÍNDICES ===
multiLLMConfigSchema.index({ userId: 1 }, { unique: true });
multiLLMConfigSchema.index({ 'activeModels.modelId': 1 });
multiLLMConfigSchema.index({ 'roles.requiredCapabilities': 1 });
multiLLMConfigSchema.index({ profileId: 1 });
multiLLMConfigSchema.index({ mode: 1, strategy: 1 });

// === MIDDLEWARES ===
multiLLMConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// === MÉTODOS DE INSTANCIA ===
multiLLMConfigSchema.methods = {
  /**
   * Obtener modelo primario (prioridad más alta)
   */
  getPrimaryModel() {
    return this.activeModels
      .filter(m => m.enabled)
      .sort((a, b) => b.priority - a.priority)[0];
  },
  
  /**
   * Obtener modelos activos ordenados por prioridad
   */
  getActiveModels() {
    return this.activeModels
      .filter(m => m.enabled)
      .sort((a, b) => b.priority - a.priority);
  },
  
  /**
   * Obtener rol por ID
   */
  getRole(roleId) {
    return this.roles.find(r => r.id === roleId);
  },
  
  /**
   * Verificar si un modelo está activo
   */
  isModelEnabled(modelId) {
    const model = this.activeModels.find(m => m.modelId === modelId);
    return model?.enabled ?? false;
  },
  
  /**
   * Obtener modelo para una capability
   */
  getModelForCapability(capability) {
    // Buscar rol que requiera esta capability
    const role = this.roles.find(r => 
      r.requiredCapabilities.includes(capability)
    );
    
    if (!role || !role.modelPriorities.length) {
      return this.getPrimaryModel();
    }
    
    // Devolver el de mayor prioridad
    const prioritized = role.modelPriorities
      .sort((a, b) => b.priority - a.priority);
    
    return this.activeModels.find(m => 
      m.modelId === prioritized[0].modelId && m.enabled
    );
  },
  
  /**
   * Crear snapshot para rollback
   */
  createSnapshot() {
    return {
      version: this.version,
      snapshot: this.toObject(),
      createdAt: new Date()
    };
  },
  
  /**
   * Aplicar perfil predefinido
   */
  applyProfile(profileId) {
    const profile = PROFILES[profileId];
    if (!profile) {
      throw new Error(`Unknown profile: ${profileId}`);
    }
    
    // Aplicar configuraciones del perfil
    this.mode = profile.mode;
    this.strategy = profile.strategy;
    this.filters = { ...this.filters, ...profile.filters };
    this.profileId = profileId;
    
    return this;
  },
  
  /**
   * Validar configuración
   */
  validate() {
    const errors = [];
    
    // Al menos un modelo activo
    if (this.activeModels.filter(m => m.enabled).length === 0) {
      errors.push('At least one model must be enabled');
    }
    
    // Roles sin capabilities son inválidos
    for (const role of this.roles) {
      if (!role.requiredCapabilities?.length) {
        errors.push(`Role ${role.id} requires at least one capability`);
      }
    }
    
    // Modelo en modelPriorities debe existir en activeModels
    for (const role of this.roles) {
      for (const mp of role.modelPriorities) {
        if (!this.activeModels.find(m => m.modelId === mp.modelId)) {
          errors.push(`Model ${mp.modelId} in role ${role.id} is not in activeModels`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};

// === MÉTODOS ESTÁTICOS ===
multiLLMConfigSchema.statics = {
  /**
   * Obtener o crear config para usuario
   */
  async getOrCreate(userId) {
    let config = await this.findOne({ userId });
    
    if (!config) {
      config = new this({ userId });
      await config.save();
    }
    
    return config;
  },
  
  /**
   * Buscar configs por provider
   */
  async findByProvider(providerId) {
    return this.find({
      'activeModels.modelId': { $regex: `^${providerId}/` }
    });
  },
  
  /**
   * Buscar configs por capability
   */
  async findByCapability(capability) {
    return this.find({
      'roles.requiredCapabilities': capability
    });
  }
};

// === EXPORT ===
module.exports = mongoose.model('MultiLLMConfig', multiLLMConfigSchema);
```

### 2.2 Schema de Modelo Registry (Cache)

```javascript
// api/server/services/CapabilityOrchestrator/models/ModelMetadata.js

/**
 * ModelMetadata - Cache de metadata de modelos
 * No es configuración de usuario, es cache de información de modelos
 */
const modelMetadataSchema = new Schema({
  // === IDENTIFICACIÓN ===
  modelId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  providerId: {
    type: String,
    required: true,
    index: true
  },
  
  // === METADATA ESTÁTICA ===
  name: String,
  description: String,
  version: String,
  
  // === CAPABILITIES ===
  capabilities: [{
    type: String,
    enum: ['chat', 'reasoning', 'code', 'analysis', 'vision', 'tool_calling', ...]
  }],
  
  competencyLevels: {
    type: Map,
    of: Number, // 0-1
    default: {}
  },
  
  // === LIMITES ===
  limits: {
    maxTokens: Number,
    maxContext: Number,
    maxBatchSize: Number,
    rpm: Number, // Requests per minute
    tpm: Number  // Tokens per minute
  },
  
  // === COSTOS ===
  costPer1K: {
    input: Number,  // USD
    output: Number   // USD
  },
  
  // === MÉTRICAS (dinámicas) ===
  metrics: {
    avgLatency: { type: Number, default: 0 },
    p50Latency: { type: Number, default: 0 },
    p95Latency: { type: Number, default: 0 },
    p99Latency: { type: Number, default: 0 },
    successRate: { type: Number, default: 1.0 },
    totalRequests: { type: Number, default: 0 },
    totalErrors: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    lastUsed: Date
  },
  
  // === SALUD ===
  status: {
    type: String,
    enum: ['active', 'degraded', 'unavailable', 'deprecated'],
    default: 'active'
  },
  
  healthCheck: {
    lastCheck: Date,
    isHealthy: Boolean,
    errorMessage: String
  },
  
  // === UTILIDADES ===
  deprecated: {
    type: Boolean,
    default: false
  },
  
  deprecationDate: Date,
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'model_metadata',
  timestamps: true
});

// Índices
modelMetadataSchema.index({ modelId: 1 }, { unique: true });
modelMetadataSchema.index({ providerId: 1 });
modelMetadataSchema.index({ status: 1 });
modelMetadataSchema.index({ 'capabilities': 1 });

// TTL index para auto-limpieza de modelos no usados
modelMetadataSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 días

module.exports = mongoose.model('ModelMetadata', modelMetadataSchema);
```

### 2.3 Schema de Snapshots (Versionado)

```javascript
// api/server/services/CapabilityOrchestrator/models/ConfigSnapshot.js

/**
 * ConfigSnapshot - Versionado de configuraciones
 */
const configSnapshotSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  version: {
    type: String,
    required: true
  },
  
  snapshot: {
    type: Schema.Types.Mixed,
    required: true
  },
  
  description: String,
  
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'config_snapshots',
  timestamps: false
});

// Índice compuesto
configSnapshotSchema.index({ userId: 1, createdAt: -1 });

// Máximo 10 snapshots por usuario
configSnapshotSchema.index({ userId: 1, createdAt: 1 }, { 
  expireAfterSeconds: undefined // No TTL
});

module.exports = mongoose.model('ConfigSnapshot', configSnapshotSchema);
```

---

## 3. PERFILES PREDEFINIDOS

```javascript
// api/server/services/CapabilityOrchestrator/constants/PROFILES.js

/**
 * Perfiles predefinidos - Constantes, no se guardan en DB
 * Se aplican a la config del usuario
 */
const PROFILES = {
  // === DESARROLLO ===
  development: {
    id: 'development',
    name: 'Desarrollo',
    description: 'Optimizado para desarrollo de software',
    icon: '💻',
    
    mode: 'specialized',
    strategy: 'priority',
    
    // Filtros permisivos
    filters: {
      maxLatency: 5000,
      maxCostPer1K: 0.01
    },
    
    // Roles predefinidos
    defaultRoles: [
      {
        id: 'programming',
        name: 'Programación',
        requiredCapabilities: ['code', 'reasoning', 'tool_calling'],
        strategy: 'priority',
        modelPriorities: []
      },
      {
        id: 'review',
        name: 'Code Review',
        requiredCapabilities: ['code', 'analysis', 'security'],
        strategy: 'priority'
      }
    ]
  },
  
  // === INVESTIGACIÓN ===
  research: {
    id: 'research',
    name: 'Investigación',
    description: 'Análisis profundo y razonamiento',
    icon: '🔬',
    
    mode: 'intelligent',
    strategy: 'reasoning',
    
    filters: {
      minContext: 100000,
      maxLatency: 15000
    },
    
    defaultRoles: [
      {
        id: 'analysis',
        name: 'Análisis',
        requiredCapabilities: ['reasoning', 'analysis', 'long_context'],
        strategy: 'reasoning'
      }
    ]
  },
  
  // === BAJO COSTO ===
  cost_effective: {
    id: 'cost_effective',
    name: 'Bajo Costo',
    description: 'Minimizar gastos manteniendo calidad',
    icon: '💰',
    
    mode: 'specialized',
    strategy: 'cost',
    
    filters: {
      maxCostPer1K: 0.001
    },
    
    // Preferir proveedores free
    filters: {
      allowedProviders: ['groq', 'deepseek', 'cloudflare', 'mistral']
    },
    
    defaultRoles: [
      {
        id: 'chat',
        name: 'Chat',
        requiredCapabilities: ['chat'],
        strategy: 'cost'
      }
    ]
  },
  
  // === ALTA CALIDAD ===
  high_quality: {
    id: 'high_quality',
    name: 'Alta Calidad',
    description: 'Mejor resultado posible',
    icon: '⭐',
    
    mode: 'intelligent',
    strategy: 'reasoning',
    
    filters: {
      // Sin límites de costo
    },
    
    defaultRoles: [
      {
        id: 'default',
        name: 'General',
        requiredCapabilities: ['chat', 'reasoning'],
        strategy: 'priority'
      }
    ]
  },
  
  // === LOCAL ===
  local: {
    id: 'local',
    name: 'Trabajo Local',
    description: 'Modelos locales (Ollama, LM Studio)',
    icon: '🏠',
    
    mode: 'specialized',
    strategy: 'fixed',
    
    // Solo proveedores locales
    filters: {
      allowedProviders: ['ollama', 'lmstudio']
    },
    
    defaultRoles: [
      {
        id: 'chat',
        name: 'Chat Local',
        requiredCapabilities: ['chat'],
        strategy: 'fixed'
      }
    ]
  },
  
  // === HÍBRIDO ===
  hybrid: {
    id: 'hybrid',
    name: 'Híbrido',
    description: 'Combina proveedores locales y cloud',
    icon: '🌐',
    
    mode: 'intelligent',
    strategy: 'auto',
    
    defaultRoles: []
  }
};

// Freeze para evitar modificaciones
Object.freeze(PROFILES);

// Exports
module.exports = PROFILES;
```

---

## 4. MIGRACIÓN DE DATOS

### 4.1 Script de Migración

```javascript
// scripts/migrate-multi-llm-config.js

/**
 * Migrar de schema legacy (Map-based) a schema nuevo (Array-based)
 */
async function migrateToNewSchema() {
  const MultiLLMConfig = mongoose.model('MultiLLMConfig');
  
  // Contadores
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Buscar configs con formato legacy (que tengan roles como Map)
  const legacyConfigs = await MultiLLMConfig.find({
    $or: [
      { roles: { $type: 'object' } }, // Map en lugar de array
      { 'roles Programming': { $exists: true } } // Acceso por llave
    ]
  });
  
  console.log(`Found ${legacyConfigs.length} configs to migrate`);
  
  for (const config of legacyConfigs) {
    try {
      // Convertir roles de Map a Array
      if (config.roles && typeof config.roles === 'object' && !Array.isArray(config.roles)) {
        const rolesArray = Object.entries(config.roles).map(([id, role]) => ({
          id,
          name: role.name || id,
          description: role.description || '',
          requiredCapabilities: role.requiredCapabilities || [],
          strategy: role.strategy || 'priority',
          modelPriorities: role.modelPriorities || [],
          constraints: role.constraints || {}
        }));
        
        config.roles = rolesArray;
      }
      
      // Convertir strategyConfig si existe
      if (config.strategyConfig && typeof config.strategyConfig === 'object') {
        // strategyConfig ya no se usa, solo mantener strategy global
        config.strategy = config.strategy || config.strategyConfig.default || 'priority';
        delete config.strategyConfig;
      }
      
      // Agregar version
      config.version = '2.0';
      config.migratedFrom = 'legacy';
      
      await config.save();
      migrated++;
      
    } catch (error) {
      console.error(`Error migrating config ${config._id}:`, error.message);
      errors++;
    }
  }
  
  console.log(`
=== Migration Complete ===
Migrated: ${migrated}
Skipped: ${skipped}
Errors: ${errors}
  `);
}
```

### 4.2 Validación de Schema

```javascript
// tests/unit/config-schema.test.js

describe('MultiLLMConfig Schema', () => {
  describe('Validation', () => {
    it('should require userId', async () => {
      const config = new MultiLLMConfig({});
      await expect(config.validate()).rejects.toThrow('userId required');
    });
    
    it('should validate mode enum', async () => {
      const config = new MultiLLMConfig({
        userId: 'user123',
        mode: 'invalid'
      });
      await expect(config.validate()).rejects.toThrow('invalid enum value');
    });
    
    it('should limit activeModels to 20', async () => {
      const models = Array(25).fill().map((_, i) => ({
        modelId: `test/model-${i}`,
        enabled: true,
        priority: 50
      }));
      
      const config = new MultiLLMConfig({
        userId: 'user123',
        activeModels: models
      });
      
      const { valid, errors } = config.validate();
      expect(valid).toBe(false);
      expect(errors).toContain('Maximum 20 active models allowed');
    });
    
    it('should require role capabilities', async () => {
      const config = new MultiLLMConfig({
        userId: 'user123',
        roles: [{
          id: 'test',
          name: 'Test Role',
          requiredCapabilities: [] // Vacío
        }]
      });
      
      const { valid, errors } = config.validate();
      expect(valid).toBe(false);
      expect(errors).toContain('Role test requires at least one capability');
    });
    
    it('should validate model references in roles', async () => {
      const config = new MultiLLMConfig({
        userId: 'user123',
        activeModels: [{
          modelId: 'openai/gpt-4o',
          enabled: true
        }],
        roles: [{
          id: 'test',
          name: 'Test',
          requiredCapabilities: ['chat'],
          modelPriorities: [{
            modelId: 'nonexistent/model', // No existe
            priority: 100
          }]
        }]
      });
      
      const { valid, errors } = config.validate();
      expect(valid).toBe(false);
      expect(errors).toContain('Model nonexistent/model in role test is not in activeModels');
    });
  });
  
  describe('Methods', () => {
    it('getPrimaryModel returns highest priority', () => {
      const config = new MultiLLMConfig({
        userId: 'user123',
        activeModels: [
          { modelId: 'a', enabled: true, priority: 50 },
          { modelId: 'b', enabled: true, priority: 100 },
          { modelId: 'c', enabled: false, priority: 90 }
        ]
      });
      
      const primary = config.getPrimaryModel();
      expect(primary.modelId).toBe('b');
    });
    
    it('applyProfile sets correct values', () => {
      const config = new MultiLLMConfig({
        userId: 'user123',
        mode: 'simple',
        strategy: 'fixed'
      });
      
      config.applyProfile('development');
      
      expect(config.mode).toBe('specialized');
      expect(config.strategy).toBe('priority');
      expect(config.profileId).toBe('development');
    });
  });
});
```

---

## 5. CONSULTAS FRECUENTES

### 5.1 Índices para Performance

```javascript
// Consultas optimizadas con índices

// 1. Buscar configs por usuario (índice único)
const config = await MultiLLMConfig.findOne({ userId: 'user123' });

// 2. Buscar configs con modelo específico (índice compuesto)
const configs = await MultiLLMConfig.find({
  'activeModels.modelId': 'openai/gpt-4o'
});

// 3. Buscar configs por capability (índice en array)
const configs = await MultiLLMConfig.find({
  'roles.requiredCapabilities': 'code'
});

// 4. Buscar configs por perfil
const configs = await MultiLLMConfig.find({ profileId: 'development' });

// 5. Agregación: Contar modelos por provider
const stats = await MultiLLMConfig.aggregate([
  { $unwind: '$activeModels' },
  { $match: { 'activeModels.enabled': true } },
  { $group: {
      _id: { $arrayElemAt: [{ $split: ['$activeModels.modelId', '/'] }, 0] },
      count: { $sum: 1 }
    }
  }
]);
```

### 5.2 Projection para Reducir Datos

```javascript
// Solo obtener campos necesarios
const config = await MultiLLMConfig.findOne(
  { userId: 'user123' },
  {
    mode: 1,
    strategy: 1,
    'activeModels.modelId': 1,
    'activeModels.priority': 1,
    'activeModels.enabled': 1
  }
);
```

---

## 6. CONCLUSIÓN

El schema simplificado ofrece:

| Aspecto | Antes | Después |
|---------|-------|---------|
| Niveles de anidación | 4+ | 2 |
| Uso de Map | Sí | No |
| Complejidad | Alta | Media |
| Queryabilidad | Difícil | Fácil |
| Mantenimiento | Complejo | Simple |

La migración es straightforward y reversible gracias a los snapshots.
