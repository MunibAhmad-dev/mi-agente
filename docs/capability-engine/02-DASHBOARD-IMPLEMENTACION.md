# 🎯 Motor de Orquestación Multi-LLM - PARTE 2

**Proyecto:** Mi-LibreChat Enterprise  
**Versión:** 1.0  
**Fecha:** 2026-07-20

---

## 10. FRONTEND DASHBOARD

### 10.1 Estructura de Componentes

```
frontend/src/components/CapabilityOrchestrator/
├── CapabilityDashboard.jsx          # Panel principal
├── CapabilityPanel.jsx             # Panel de capacidades
├── ModelRegistryPanel.jsx         # Panel de modelos
├── RoleEditor.jsx                 # Editor de roles
├── StrategySelector.jsx           # Selector de estrategias
├── ProfileManager.jsx             # Gestor de perfiles
├── RealTimeMonitor.jsx            # Monitor en tiempo real
├── metrics/
│   ├── LatencyChart.jsx          # Gráfico de latencia
│   ├── CostChart.jsx             # Gráfico de costos
│   └── ModelUsage.jsx            # Uso por modelo
├── config/
│   ├── ModelCard.jsx              # Tarjeta de modelo
│   ├── CapabilityBadge.jsx       # Badge de capacidad
│   └── StrategyCard.jsx          # Tarjeta de estrategia
└── index.js
```

### 10.2 Wireframes Detallados

#### Panel Principal (CapabilityDashboard)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ Capability Orchestrator                                          [Save] [⚡] │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│ ┌─ Modes ─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                              │ │
│ │   (●) Simple    (○) Specialized    (○) Intelligent                         │ │
│ │                                                                              │ │
│ │   Un modelo    Modelos por rol   Routing automático                        │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│ ┌─ Mode: INTELLIGENT ────────────────────────────────────────────────────────┐ │
│ │                                                                              │ │
│ │ ┌─ Default Strategy ──────────────────────────────────────────────────┐   │ │
│ │ │                                                                              │ │ │
│ │ │   (○) Fixed    (○) Priority    (●) Latency    (○) Cost    (○) Auto  │   │ │
│ │ │                                                                              │ │ │
│ │ └───────────────────────────────────────────────────────────────────────┘   │ │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│ ┌─ Profiles ────────────────────────────────────────────────────────────────┐ │
│ │                                                                              │ │
│ │  [💻 Desarrollo]  [🔬 Investigación]  [💰 Bajo Costo]  [⭐ Alta Calidad] │ │
│ │  [🏠 Local]  [🌐 Híbrido]  [+ Custom Profile]                              │ │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Panel de Capacidades (CapabilityPanel)

```
┌─ CAPABILITIES ──────────────────────────────────────────────────────────────────┐
│                                                                                  │
│ Search: [________________________]  [+ Add Capability]                           │
│                                                                                  │
│ ┌─ Core ───────────────────────────────────────────────────────────────────┐   │
│ │                                                                              │ │
│ │  ☑ chat           Conversación general                          🔴 Priority │   │
│ │  ☑ reasoning      Razonamiento complejo                       🟡 Latency  │   │
│ │  ☑ code           Generación de código                         🟢 Cost    │   │
│ │  ☐ analysis       Análisis de datos y textos                                │   │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ ┌─ Domain-Specific ──────────────────────────────────────────────────────┐   │
│ │                                                                              │ │
│ │  ☑ frontend         UI/UX, HTML/CSS/JS                      [Priority: 90]│   │
│ │  ☐ backend          APIs, servidores                              [Priority: 80]│ │
│ │  ☐ architecture     Diseño de sistemas                            [Priority: 70]│ │
│ │  ☐ security         Análisis de vulnerabilidades                   [Priority: 60]│ │
│ │  ☐ devops           CI/CD, infraestructura                        [Priority: 50]│ │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ ┌─ Advanced ───────────────────────────────────────────────────────────────┐   │
│ │                                                                              │ │
│ │  ☐ vision            Análisis de imágenes                               │   │
│ │  ☐ multimodal        Múltiples modalidades                              │   │
│ │  ☐ tool_calling     Llamada de funciones                               │   │
│ │  ☐ long_context      Contexto > 100K tokens                             │   │
│ │  ☐ embeddings        Generación de embeddings                            │   │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ Selected: 5 capabilities                                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Editor de Roles (RoleEditor)

```
┌─ ROLES ──────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│ ┌─ Role: PROGRAMMING ──────────────────────────────────────────────────────┐   │
│ │                                                                              │ │
│ │  Name: [Programación____________]  Icon: [💻_]                            │ │
│ │                                                                              │ │
│ │  Description:                                                                │ │
│ │  [Modelos optimizados para desarrollo de software___________________]       │ │
│ │                                                                              │ │
│ │  Required Capabilities:                                                      │ │
│ │  ┌────────────────────────────────────────────────────────────────────┐      │ │
│ │  │ [code ×]  [reasoning ×]  [tool_calling ×]  [+ Add]               │      │ │
│ │  └────────────────────────────────────────────────────────────────────┘      │ │
│ │                                                                              │ │
│ │  Strategy: [Priority ________________________▼]                             │ │
│ │                                                                              │ │
│ │  Model Priorities (drag to reorder):                                          │ │
│ │  ┌────────────────────────────────────────────────────────────────────┐      │ │
│ │  │ ≡ 1. Anthropic Claude 3.5 Sonnet    [━━━━━━━ 100] 🔴 Primary     │      │ │
│ │  │ ≡ 2. OpenAI GPT-4o                     [━━━━━━━ 90] 🟡             │      │ │
│ │  │ ≡ 3. DeepSeek Coder                    [━━━━━━ 80] 🟢 Fallback     │      │ │
│ │  │ ≡ 4. Groq Llama 3.3 70B               [━━━━━━ 70]                │      │ │
│ │  └────────────────────────────────────────────────────────────────────┘      │ │
│ │                                                                              │ │
│ │  [+ Add Model]                                                              │ │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ ┌─ Role: RESEARCH ────────────────────────────────────────────────────────┐   │
│ │  ... (similar structure)                                                  │   │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ [+ Add New Role]                                                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Monitor en Tiempo Real (RealTimeMonitor)

```
┌─ REAL-TIME MONITOR ────────────────────────────────────────────────────────────┐
│                                                                                  │
│ ● Connected    Refresh: [2s ▼]    [⏸ Pause]  [📊 Export]                        │
│                                                                                  │
│ ┌─ Current Request ───────────────────────────────────────────────────────┐   │
│ │                                                                              │ │
│ │  Model:     [Anthropic Claude 3.5 Sonnet]                                 │ │
│ │  Provider:  [Anthropic]                          ✅ Healthy                │ │
│ │  Strategy:  [Priority]                                                        │ │
│ │  Mode:      [Specialized]                     🎯 94% match                  │ │
│ │                                                                              │ │
│ │  Capabilities: [chat] [reasoning] [tool_calling]                            │ │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ ┌─ Metrics ───────────────────────────────────────────────────────────────┐   │
│ │                                                                              │ │
│ │  Latency:     [████████░░] 850ms   p95: 1.2s   p99: 2.1s                │ │
│ │  Cost:        [██████░░░░] $0.003  Today: $2.45                         │ │
│ │  Requests:    [██████████] 1,247   Failed: 3 (0.24%)                     │ │
│ │  Fallbacks:   [█░░░░░░░░░] 12      Success after fallback: 11           │ │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ ┌─ Active Models ──────────────────────────────────────────────────────────┐   │
│ │                                                                              │ │
│ │  ┌─ Claude 3.5 Sonnet ──────────────────────────────────────────────┐   │ │
│ │  │  Provider: Anthropic   Status: 🟢   Latency: 850ms   Requests: 523│   │ │
│ │  │  Last used: 2s ago    Success: 99.4%                              │   │ │
│ │  └────────────────────────────────────────────────────────────────────┘   │ │
│ │                                                                              │ │
│ │  ┌─ GPT-4o ────────────────────────────────────────────────────────┐   │ │
│ │  │  Provider: OpenAI      Status: 🟢   Latency: 620ms   Requests: 412│   │ │
│ │  │  Last used: 5s ago    Success: 99.1%                              │   │ │
│ │  └────────────────────────────────────────────────────────────────────┘   │ │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│ ┌─ Recent Activity ────────────────────────────────────────────────────────┐   │
│ │                                                                              │ │
│ │  12:34:56  [Claude 3.5]  ✅  850ms  "Programming"                       │   │
│ │  12:34:52  [GPT-4o]      ✅  620ms  "Analysis" (fallback from Groq)     │   │
│ │  12:34:45  [Groq]        ⚠️  -     "Analysis" (rate limited)            │   │
│ │  12:34:41  [Claude 3.5]  ✅  920ms  "Programming"                       │   │
│ │                                                                              │ │
│ └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Componente Principal

```jsx
// CapabilityDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { CapabilityPanel } from './CapabilityPanel';
import { ModelRegistryPanel } from './ModelRegistryPanel';
import { RoleEditor } from './RoleEditor';
import { StrategySelector } from './StrategySelector';
import { ProfileManager } from './ProfileManager';
import { RealTimeMonitor } from './RealTimeMonitor';
import { MetricsCharts } from './metrics/';

export function CapabilityDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState(null);

  // Cargar configuración
  useEffect(() => {
    loadConfig();
    loadStats();
    
    // WebSocket para tiempo real
    const ws = new WebSocket(`${API_BASE}/ws/capability-orchestrator`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'stats_update') {
        setStats(data.stats);
      }
    };
    
    return () => ws.close();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/multi-llm/config');
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await fetch('/api/multi-llm/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      // Mostrar toast de éxito
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'overview', label: '📊 Overview', icon: '📊' },
    { id: 'models', label: '🤖 Models', icon: '🤖' },
    { id: 'capabilities', label: '🎯 Capabilities', icon: '🎯' },
    { id: 'roles', label: '👥 Roles', icon: '👥' },
    { id: 'strategies', label: '⚙️ Strategies', icon: '⚙️' },
    { id: 'profiles', label: '📋 Profiles', icon: '📋' },
    { id: 'monitor', label: '📈 Monitor', icon: '📈' }
  ];

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="capability-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <h1>⚙️ Capability Orchestrator</h1>
        <div className="header-actions">
          <button onClick={saveConfig} disabled={saving}>
            {saving ? 'Saving...' : '💾 Save'}
          </button>
          <button onClick={() => setActiveTab('monitor')}>
            📈 Live Stats
          </button>
        </div>
      </header>

      {/* Mode Selector */}
      <section className="mode-selector">
        <h2>Execution Mode</h2>
        <div className="mode-options">
          {['simple', 'specialized', 'intelligent'].map(mode => (
            <label key={mode} className="mode-option">
              <input
                type="radio"
                name="mode"
                value={mode}
                checked={config.global.mode === mode}
                onChange={(e) => setConfig({
                  ...config,
                  global: { ...config.global, mode: e.target.value }
                })}
              />
              <span className="mode-label">
                <strong>{mode.charAt(0).toUpperCase() + mode.slice(1)}</strong>
                <small>{getModeDescription(mode)}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Tabs */}
      <nav className="dashboard-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="dashboard-content">
        {activeTab === 'overview' && (
          <OverviewTab config={config} stats={stats} />
        )}
        {activeTab === 'models' && (
          <ModelRegistryPanel config={config} setConfig={setConfig} />
        )}
        {activeTab === 'capabilities' && (
          <CapabilityPanel config={config} setConfig={setConfig} />
        )}
        {activeTab === 'roles' && (
          <RoleEditor config={config} setConfig={setConfig} />
        )}
        {activeTab === 'strategies' && (
          <StrategySelector config={config} setConfig={setConfig} />
        )}
        {activeTab === 'profiles' && (
          <ProfileManager config={config} setConfig={setConfig} />
        )}
        {activeTab === 'monitor' && (
          <RealTimeMonitor stats={stats} />
        )}
      </main>
    </div>
  );
}

function getModeDescription(mode) {
  const descriptions = {
    simple: 'Un modelo para todo',
    specialized: 'Modelos por rol/tarea',
    intelligent: 'Routing automático'
  };
  return descriptions[mode];
}
```

---

## 11. PLAN DE IMPLEMENTACIÓN DETALLADO

### 11.1 Fases de Implementación

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              IMPLEMENTATION ROADMAP                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  FASE 1: Foundation (Semana 1-2)                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • CapabilityRegistry (core)                                           │   │
│  │  • ModelRegistry (basic)                                              │   │
│  │  • ConfigService (persistence)                                         │   │
│  │  • Basic types & interfaces                                           │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                              │
│                                    ▼                                              │
│  FASE 2: Core Orchestration (Semana 3-4)                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • CapabilityOrchestrator (basic)                                     │   │
│  │  • StrategyEngine (5 strategies)                                      │   │
│  │  • Execution Modes (Simple, Specialized)                              │   │
│  │  • Request Parser                                                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                              │
│                                    ▼                                              │
│  FASE 3: Advanced Strategies (Semana 5)                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • Intelligent Execution Mode                                          │   │
│  │  • Consensus Strategy                                                  │   │
│  │  • Parallel Execution                                                 │   │
│  │  • Auto Strategy                                                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                              │
│                                    ▼                                              │
│  FASE 4: Provider Adapters (Semana 6-7)                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • BaseAdapter (abstract)                                             │   │
│  │  • OpenAI Adapter                                                     │   │
│  │  • Anthropic Adapter                                                  │   │
│  │  • Ollama Adapter (local)                                             │   │
│  │  • LM Studio Adapter (local)                                          │   │
│  │  • LiteLLM Adapter                                                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                              │
│                                    ▼                                              │
│  FASE 5: Frontend Dashboard (Semana 8-10)                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • CapabilityDashboard                                                │   │
│  │  • ModelRegistryPanel                                                 │   │
│  │  • CapabilityPanel                                                    │   │
│  │  • RoleEditor                                                         │   │
│  │  • RealTimeMonitor                                                    │   │
│  │  • MetricsCharts                                                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                              │
│                                    ▼                                              │
│  FASE 6: Integration & Testing (Semana 11-12)                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • LLMGateway integration                                             │   │
│  │  • Backwards compatibility                                            │   │
│  │  • Unit tests                                                         │   │
│  │  • Integration tests                                                 │   │
│  │  • E2E tests (Playwright)                                            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                              │
│                                    ▼                                              │
│  FASE 7: Optimization & Polish (Semana 13-14)                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  • Performance optimization                                           │   │
│  │  • Caching strategies                                                 │   │
│  │  • Circuit breakers                                                   │   │
│  │  • Documentation                                                     │   │
│  │  • Migration scripts                                                  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Tasks Detallados por Fase

#### FASE 1: Foundation

```markdown
## FASE 1: Foundation

### 1.1 CapabilityRegistry
- [ ] Crear archivo `CapabilityRegistry.js`
- [ ] Definir constantes Capability
- [ ] Implementar métodos:
  - [ ] register(capability, metadata)
  - [ ] addImplication(cap, implies)
  - [ ] getImplications(cap)
  - [ ] isCompatible(caps)
  - [ ] expandCapabilities(caps)
- [ ] Agregar capacidades por defecto
- [ ] Tests unitarios

### 1.2 ModelRegistry
- [ ] Crear archivo `ModelRegistry.js`
- [ ] Definir interfaces TypeScript:
  - [ ] ModelInfo
  - [ ] ModelCapabilities
  - [ ] ModelProvider
  - [ ] ModelCandidate
- [ ] Implementar métodos:
  - [ ] registerModel(modelInfo)
  - [ ] registerFromProvider(provider)
  - [ ] detectCapabilities(model)
  - [ ] findByCapabilities(required, options)
  - [ ] updateMetrics(modelId, metrics)
- [ ] Crear índices:
  - [ ] capabilityIndex
  - [ ] providerIndex
- [ ] Tests unitarios

### 1.3 ConfigService
- [ ] Crear schema de MongoDB
- [ ] Crear `MultiLLMConfigService.js`
- [ ] Implementar métodos:
  - [ ] getConfig(userId)
  - [ ] updateConfig(userId, updates)
  - [ ] resetToProfile(userId, profileId)
  - [ ] exportConfig(userId)
  - [ ] importConfig(userId, configJson)
- [ ] Implementar cache en memoria
- [ ] Tests unitarios

### 1.4 Base Types
- [ ] Crear `types.js` con:
  - [ ] CapabilityType enum
  - [ ] StrategyType enum
  - [ ] ExecutionModeType enum
  - [ ] RoleDefinition interface
  - [ ] Profile interface
  - [ ] MultiLLMConfiguration interface
- [ ] Crear `constants.js` con:
  - [ ] DEFAULT_CAPABILITIES
  - [ ] DEFAULT_PROFILES
  - [ ] DEFAULT_CONFIG

### Entregable FASE 1
- Directorio `api/server/services/CapabilityOrchestrator/` creado
- Tests pasando
- Documentación de API
```

#### FASE 2: Core Orchestration

```markdown
## FASE 2: Core Orchestration

### 2.1 StrategyEngine
- [ ] Crear `StrategyEngine.js`
- [ ] Crear `BaseStrategy.js` (abstracta)
- [ ] Implementar estrategias:
  - [ ] PriorityStrategy
  - [ ] RoundRobinStrategy
  - [ ] LatencyStrategy
  - [ ] CostStrategy
  - [ ] ContextStrategy
- [ ] Implementar métodos:
  - [ ] select(strategy, context)
  - [ ] register(strategy)
  - [ ] listStrategies()
- [ ] Tests para cada estrategia

### 2.2 Execution Modes
- [ ] Crear `BaseExecutionMode.js`
- [ ] Implementar:
  - [ ] SimpleExecutionMode
  - [ ] SpecializedExecutionMode
- [ ] Implementar fallback chain
- [ ] Tests de integración

### 2.3 CapabilityOrchestrator
- [ ] Crear `CapabilityOrchestrator.js`
- [ ] Implementar:
  - [ ] process(request)
  - [ ] extractCapabilities(context)
  - [ ] detectCapabilitiesFromMessages(messages)
  - [ ] findCandidates(capabilities, config)
  - [ ] applyStrategy(strategy, candidates, config)
  - [ ] executeOnModel(modelId, context)
- [ ] Integrar con servicios existentes
- [ ] Tests de integración

### 2.4 Request Parser
- [ ] Crear `RequestParser.js`
- [ ] Implementar detección de capabilities desde:
  - [ ] Mensajes de chat
  - [ ] Metadatos de solicitud
  - [ ] Configuración de rol
- [ ] Tests unitarios

### Entregable FASE 2
- Orchestrator funcional
- 5 estrategias implementadas
- 2 modos de ejecución
- Tests de integración pasando
```

### 11.3 Commit Strategy

```
FASE 1 (Foundation):
├── commit 1: "feat(capability-engine): Add CapabilityRegistry core"
├── commit 2: "feat(capability-engine): Add ModelRegistry with auto-detection"
├── commit 3: "feat(capability-engine): Add ConfigService with MongoDB persistence"
├── commit 4: "feat(capability-engine): Add base types and constants"
└── commit 5: "test(capability-engine): Add unit tests for foundation"

FASE 2 (Core Orchestration):
├── commit 6: "feat(capability-engine): Add StrategyEngine with 5 strategies"
├── commit 7: "feat(capability-engine): Add execution modes (Simple, Specialized)"
├── commit 8: "feat(capability-engine): Add CapabilityOrchestrator core"
├── commit 9: "feat(capability-engine): Add RequestParser"
└── commit 10: "test(capability-engine): Add orchestration tests"

FASE 3 (Advanced):
├── commit 11: "feat(capability-engine): Add Intelligent execution mode"
├── commit 12: "feat(capability-engine): Add Consensus and Parallel strategies"
└── commit 13: "feat(capability-engine): Add Auto strategy with ML-like selection"

... (continuar para cada fase)
```

---

## 12. IMPACTO EN PERFORMANCE

### 12.1 Latencia Esperada

| Operación | Latencia Base | Con Cache | Optimizado |
|-----------|---------------|-----------|------------|
| Config load | 50-100ms | 1-5ms | 1ms |
| Model selection | 10-20ms | 5-10ms | 2ms |
| Strategy execution | 5-10ms | 2-5ms | 1ms |
| Total overhead | 65-130ms | 8-20ms | 4ms |

### 12.2 Memory Usage

| Componente | Memoria Base | Con 10 Models | Con 50 Models |
|------------|--------------|---------------|---------------|
| CapabilityRegistry | 50KB | 50KB | 50KB |
| ModelRegistry | 100KB | 500KB | 2MB |
| ConfigCache | 20KB | 20KB | 20KB |
| StrategyCache | 10KB | 10KB | 10KB |
| **Total** | **~200KB** | **~600KB** | **~2MB** |

### 12.3 Optimizaciones Planificadas

```javascript
// 1. LRU Cache para configs frecuentemente usadas
class ConfigCache {
  constructor(maxSize = 100) {
    this.cache = new LRUCache(maxSize);
  }
  
  get(key) {
    return this.cache.get(key);
  }
  
  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
}

// 2. Connection Pooling
class ModelConnectionPool {
  constructor(maxConnectionsPerModel = 10) {
    this.pools = new Map();
    this.maxConnections = maxConnectionsPerModel;
  }
  
  async getConnection(modelId) {
    if (!this.pools.has(modelId)) {
      this.pools.set(modelId, {
        connections: [],
        waiting: []
      });
    }
    
    const pool = this.pools.get(modelId);
    
    if (pool.connections.length < this.maxConnections) {
      const conn = await this.createConnection(modelId);
      pool.connections.push(conn);
      return conn;
    }
    
    // Wait for available connection
    return new Promise(resolve => {
      pool.waiting.push(resolve);
    });
  }
}

// 3. Circuit Breaker para modelos problemáticos
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.state = 'CLOSED';
    this.failures = 0;
  }
  
  async execute(fn) {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN');
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
  }
  
  onFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      setTimeout(() => {
        this.state = 'HALF_OPEN';
      }, this.resetTimeout);
    }
  }
}
```

---

## 13. ESTRATEGIA DE PRUEBAS

### 13.1 Plan de Testing

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                TESTING PYRAMID                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                    ▲                                            │
│                                   /E\                                           │
│                                  /2E \          E2E Tests (Playwright)          │
│                                 /─────\         - User flows                      │
│                                /  Int  \        - Integration                    │
│                               /─────────\                                          │
│                              /  Unit     \       Integration Tests (Jest)        │
│                             /─────────────\      - Service integration            │
│                            /   Component    \     - API contracts                 │
│                           /─────────────────\                                     │
│                          /     Unit Tests     \   Unit Tests (Jest)              │
│                         /─────────────────────\  - Functions                       │
│                        /       Mocks           \ - Utilities                       │
│                       /─────────────────────────\                                   │
│                                                                                  │
│  Target Coverage:                                                                   │
│  - Unit: 90%+                                                                      │
│  - Integration: 80%+                                                              │
│  - E2E: Critical paths only                                                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Test Categories

```javascript
// 1. Unit Tests - CapabilityRegistry
describe('CapabilityRegistry', () => {
  describe('register()', () => {
    it('should register a new capability');
    it('should throw on duplicate registration');
    it('should accept partial metadata');
  });
  
  describe('getImplications()', () => {
    it('should return direct implications');
    it('should return transitive implications');
    it('should return empty set for unknown capability');
  });
  
  describe('isCompatible()', () => {
    it('should return true for compatible capabilities');
    it('should return false for incompatible capabilities');
  });
  
  describe('expandCapabilities()', () => {
    it('should include original capabilities');
    it('should include implied capabilities');
    it('should deduplicate results');
  });
});

// 2. Unit Tests - ModelRegistry
describe('ModelRegistry', () => {
  describe('findByCapabilities()', () => {
    it('should return models with all required capabilities');
    it('should filter by minCompetency');
    it('should filter by maxLatency');
    it('should filter by maxCost');
    it('should sort by match score');
    it('should exclude specified models');
  });
  
  describe('detectCapabilities()', () => {
    it('should detect vision from model name');
    it('should detect code from model name');
    it('should detect long context from model name');
    it('should default to chat for unknown models');
  });
});

// 3. Strategy Tests
describe('StrategyEngine', () => {
  describe('PriorityStrategy', () => {
    it('should select highest priority model');
    it('should handle missing priorities');
  });
  
  describe('LatencyStrategy', () => {
    it('should select lowest latency model');
    it('should respect maxLatency constraint');
  });
  
  describe('CostStrategy', () => {
    it('should select lowest cost model');
    it('should filter models without cost data');
  });
});

// 4. Integration Tests
describe('CapabilityOrchestrator', () => {
  describe('process()', () => {
    it('should route to correct model for programming task');
    it('should apply user constraints');
    it('should fallback on model failure');
    it('should record metrics');
  });
});

// 5. E2E Tests (Playwright)
describe('Capability Dashboard', () => {
  it('should allow switching between modes');
  it('should save and load configuration');
  it('should display real-time stats');
  it('should allow role editing');
  it('should apply profile');
});
```

### 13.3 Mock Strategy

```javascript
// mocks/model-registry.mock.js
export function createMockModelRegistry() {
  const models = new Map();
  
  return {
    models,
    
    async registerModel(modelInfo) {
      models.set(modelInfo.id, modelInfo);
    },
    
    async findByCapabilities(required, options = {}) {
      const candidates = [];
      
      for (const [id, model] of models) {
        if (required.every(c => model.capabilities.includes(c))) {
          candidates.push({
            model,
            matchScore: 1,
            estimatedLatency: model.metrics?.avgLatency || 1000,
            estimatedCost: model.metrics?.avgCostPer1K || 0
          });
        }
      }
      
      return candidates;
    },
    
    async updateMetrics(modelId, metrics) {
      const model = models.get(modelId);
      if (model) {
        Object.assign(model.metrics, metrics);
      }
    },
    
    // Reset for testing
    clear() {
      models.clear();
    },
    
    // Add test fixtures
    addTestModels() {
      this.registerModel({
        id: 'test/claude-3.5',
        name: 'Claude 3.5 Sonnet',
        capabilities: { capabilities: ['chat', 'reasoning', 'code', 'vision'] },
        metrics: { avgLatency: 1000, avgCostPer1K: 0.003 }
      });
      
      this.registerModel({
        id: 'test/gpt-4o',
        name: 'GPT-4o',
        capabilities: { capabilities: ['chat', 'reasoning', 'code', 'vision'] },
        metrics: { avgLatency: 800, avgCostPer1K: 0.005 }
      });
    }
  };
}
```

---

## 14. MIGRACIÓN Y ROLLBACK

### 14.1 Plan de Migración

```javascript
// 1. Feature Flag
const FEATURE_FLAGS = {
  CAPABILITY_ENGINE_ENABLED: process.env.CAPABILITY_ENGINE_ENABLED === 'true',
  CAPABILITY_ENGINE_DEFAULT: process.env.CAPABILITY_ENGINE_DEFAULT === 'true'
};

// 2. Hybrid Mode (migrate gradually)
class HybridOrchestrator {
  constructor(legacyGateway, capabilityOrchestrator) {
    this.legacy = legacyGateway;
    this.capability = capabilityOrchestrator;
  }
  
  async process(context) {
    if (FEATURE_FLAGS.CAPABILITY_ENGINE_ENABLED) {
      return this.capability.process(context);
    }
    return this.legacy.complete(context);
  }
}

// 3. Migration Script
async function migrateUserConfigs() {
  const users = await User.find({ 'settings.defaultModel': { $exists: true } });
  
  for (const user of users) {
    const config = await ConfigService.getConfig(user.id);
    
    // Solo migrar si no existe config
    if (!config) {
      // Crear config basada en settings existentes
      const modelId = user.settings.defaultModel;
      const provider = inferProvider(modelId);
      
      await ConfigService.updateConfig(user.id, {
        global: {
          mode: 'simple',
          defaultStrategy: 'fixed'
        },
        activeModels: [{
          modelId,
          enabled: true,
          priority: 100,
          parameters: {
            temperature: user.settings.defaultTemperature || 0.7,
            maxTokens: user.settings.maxTokens || 4096
          }
        }]
      });
    }
  }
}

// 4. Rollback
async function rollbackToLegacy() {
  await FeatureFlag.updateOne(
    { key: 'CAPABILITY_ENGINE_ENABLED' },
    { value: 'false' }
  );
  
  // Limpiar configs nuevas si es necesario
  // Mantenerlas por si se quiere revertir el rollback
}
```

### 14.2 Validation

```javascript
// Validar configuración antes de guardar
function validateConfig(config) {
  const errors = [];
  
  // Validar modos
  if (!['simple', 'specialized', 'intelligent'].includes(config.global.mode)) {
    errors.push('Invalid execution mode');
  }
  
  // Validar modelos activos
  if (config.activeModels.length === 0) {
    errors.push('At least one model must be active');
  }
  
  if (config.activeModels.length > config.global.limits.maxActiveModels) {
    errors.push(`Maximum ${config.global.limits.maxActiveModels} models allowed`);
  }
  
  // Validar roles
  for (const [roleId, role] of Object.entries(config.roles)) {
    if (role.requiredCapabilities.length === 0) {
      errors.push(`Role ${roleId} requires at least one capability`);
    }
    
    if (role.modelPriorities.length === 0) {
      errors.push(`Role ${roleId} requires at least one model priority`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

## 15. DOCUMENTACIÓN

### 15.1 Documentación de API

```markdown
# Capability Orchestrator API

## Configuración

### GET /api/multi-llm/config
Obtener configuración del usuario.

**Response:**
```json
{
  "global": {
    "mode": "specialized",
    "defaultStrategy": "priority",
    "limits": { "maxActiveModels": 5 }
  },
  "activeModels": [...],
  "roles": {...}
}
```

### PUT /api/multi-llm/config
Actualizar configuración.

**Body:**
```json
{
  "global": { "mode": "intelligent" },
  "activeModels": [...]
}
```

## Modelos

### GET /api/multi-llm/models
Listar modelos disponibles.

### GET /api/multi-llm/models/:id
Obtener detalle de un modelo.

## Capacidades

### GET /api/multi-llm/capabilities
Listar todas las capacidades disponibles.

## Estrategias

### GET /api/multi-llm/strategies
Listar estrategias disponibles.

## Perfiles

### GET /api/multi-llm/profiles
Listar perfiles predefinidos.

### POST /api/multi-llm/profiles/:id/activate
Activar un perfil.

## Procesamiento

### POST /api/multi-llm/process
Procesar solicitud con routing inteligente.

**Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Write a function" }
  ],
  "options": {
    "role": "programming"
  }
}
```

## Export/Import

### POST /api/multi-llm/export
Exportar configuración.

### POST /api/multi-llm/import
Importar configuración.
```

---

## 16. CONCLUSIÓN

Este documento presenta un diseño completo para un **Motor de Orquestación Multi-LLM basado en capacidades** que:

### Objetivos Logrados

| Objetivo | Estado | Implementación |
|----------|--------|----------------|
| Capacidad > Modelo | ✅ | Registry extensible |
| Desacoplamiento | ✅ | Interfaces claras |
| Extensibilidad | ✅ | Plugin system |
| Configurabilidad | ✅ | Persistencia MongoDB |
| Resiliencia | ✅ | Fallback + Circuit Breaker |
| Observabilidad | ✅ | Métricas en tiempo real |
| Performance | ✅ | Caching + Pooling |

### Arquitectura Clara

```
CLIENT → CapabilityOrchestrator → StrategyEngine → ExecutionMode → ProviderAdapter
                ↓                      ↓
        CapabilityRegistry      ModelRegistry
                ↓
        ConfigService (MongoDB)
```

### Próximos Pasos

1. **Revisar y aprobar diseño**
2. **Comenzar FASE 1: Foundation**
3. **Iterar basándose en feedback**
4. **Integrar gradualmente con sistema existente**

---

**Documentos relacionados:**
- `01-DISENO-CAPABILITY-ENGINE.md` - Parte 1: Arquitectura Core
- `03-PLAN-IMPLEMENTACION.md` - Plan detallado (FASE 3)
