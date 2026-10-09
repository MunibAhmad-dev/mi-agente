# 🔄 Estrategia de Migración
## De la Arquitectura Actual a la Nueva Arquitectura Multi-LLM

**Fecha:** 2026-07-21
**Versión:** 1.0
**Autor:** OpenHands Agent

---

## TABLA DE CONTENIDOS

1. [Resumen de la Migración](#1-resumen-de-la-migración)
2. [Análisis del Estado Actual](#2-análisis-del-estado-actual)
3. [Estrategia de Migración](#3-estrategia-de-migración)
4. [Plan de Transición](#4-plan-de-transición)
5. [Validación y Rollback](#5-validación-y-rollback)
6. [Timeline](#6-timeline)

---

## 1. RESUMEN DE LA MIGRACIÓN

### 1.1 Objetivos

| Objetivo | Descripción |
|----------|-------------|
| **Cero Downtime** | La migración debe ser transparente para usuarios |
| **Backward Compatibility** | Mantener APIs existentes funcionando |
| **Incremental** | Migrar componente por componente |
| **Reversible** | Capacidad de rollback en cada fase |

### 1.2 Scope

**Incluido:**
- Backend (Node.js + Python)
- API Key Manager
- Capability Router
- LLM Gateway
- Event Bus
- Provider Registry
- Dashboard

**Excluido (mantener como está):**
- Frontend (por ahora)
- Database schema (evolución incremental)
- Autenticación existente
- Features no relacionadas con Multi-LLM

### 1.3 Riesgos Principales

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Duplicación de estado | Media | Alto | Migrar datos antes de nuevo código |
| Breaking changes | Baja | Alto | Compatibilidad hacia atrás |
| Performance regression | Media | Medio | Benchmarking en cada fase |
| Fallo en producción | Baja | Crítico | Rollback planificado |

---

## 2. ANÁLISIS DEL ESTADO ACTUAL

### 2.1 Componentes Existentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA ACTUAL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LibreChat Frontend                                                        │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      Execution Engine (Node.js)                         │ │
│  │  - Conoce providers directamente                                      │ │
│  │  - Tiene lógica de routing mezclada                                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      LLM Gateway (Node.js)                            │ │
│  │  - Providers hardcoded                                              │ │
│  │  - Sin abstracción de capabilities                                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      API Key Manager (Python)                         │ │
│  │  - Intelligent Router                                                │ │
│  │  - Key Manager                                                       │ │
│  │  - No conectado a LibreChat directamente                            │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Problemas Identificados

| # | Problema | Ubicación Actual | Impacto |
|---|----------|------------------|---------|
| 1 | Routing hardcoded | `LLMGateway.js` | Agregar provider requiere código |
| 2 | API Keys dispersas | Múltiples locations | Inconsistencia |
| 3 | Sin Policy Engine | Lógica en múltiples lugares | Difícil auditar |
| 4 | Sin capability routing | Por nombre de modelo | Frágil |
| 5 | Account Manager ausente | Solo API Keys | No soporta OAuth |
| 6 | Token tracking parcial | Solo en API Key Manager | Sin granularidad |

### 2.3 Componentes a Crear/Nuevo

| Componente | Tipo | Complejidad |
|------------|------|-------------|
| Policy Engine | Nuevo | Alta |
| Provider Manager | Nuevo | Media |
| Account Manager | Nuevo | Media |
| Token Manager | Nuevo | Alta |
| Capability Router Extendido | Evolución | Media |
| Provider Registry V2 | Evolución | Baja |
| FCC Adapter | Nuevo | Baja |

---

## 3. ESTRATEGIA DE MIGRACIÓN

### 3.1 Principio Fundamental

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MIGRACIÓN STRangler FIG PATTERN                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FASE 1: Crear nuevo componente junto al antiguo                            │
│  FASE 2: Ruteo gradual de tráfico al nuevo                                  │
│  FASE 3: Descomisionar código antiguo                                       │
│                                                                              │
│  Ejemplo:                                                                   │
│                                                                              │
│  ANTES:                                                                     │
│  User → OldRouter → Provider                                               │
│                                                                              │
│  TRANSICIÓN:                                                                │
│  User → [OldRouter] → Provider                                             │
│        ↘ [NewRouter] (shadow mode)                                          │
│                                                                              │
│  DESPUÉS:                                                                   │
│  User → NewRouter → Provider                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Estrategia de Datos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MIGRACIÓN DE DATOS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. READ (fase inicial)                                                    │
│  ────────────────────────────                                                │
│  Nuevos componentes LEEN de fuentes existentes                              │
│  Sin escribir datos nuevos                                                  │
│                                                                              │
│  2. WRITE (fase media)                                                      │
│  ────────────────────────────                                                │
│  Nuevos componentes ESCRIBEN en nuevo schema                                 │
│  Seguimos escribiendo en schema antiguo                                     │
│                                                                              │
│  3. SYNC (fase de transición)                                               │
│  ───────────────────────────────                                             │
│  Sincronización bidireccional                                               │
│  Detección y resolución de conflictos                                       │
│                                                                              │
│  4. CUTOVER (fase final)                                                    │
│  ────────────────────────────                                                │
│  Nuevos componentes solo usan nuevo schema                                   │
│  Descomisionar schema antiguo                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. PLAN DE TRANSICIÓN

### Fase 0: Preparación (Semana 1-2)

**Objetivo:** Establecer infraestructura para la migración

#### Tareas

| # | Tarea | Responsable | Entregable |
|---|-------|--------------|-------------|
| 0.1 | Crear branches de feature | DevOps | `feature/multi-llm-v2` |
| 0.2 | Configurar environment de staging | DevOps | Staging funcional |
| 0.3 | Establecer baseline de metrics | DevOps | Dashboard inicial |
| 0.4 | Crear scripts de rollback | DevOps | Scripts de rollback |
| 0.5 | Documentar APIs actuales | Backend | OpenAPI specs |

#### Scripts de Rollback

```bash
#!/bin/bash
# rollback.sh

# Rollback a commit específico
git checkout <previous-commit>

# Restaurar environment variables
cp .env.backup .env

# Reiniciar servicios
docker-compose restart

# Verificar health
curl -f http://localhost:3080/health || exit 1
```

### Fase 1: Provider Registry + Capability Router (Semana 3-4)

**Objetivo:** Establecer el registro central de providers

#### Arquitectura Resultante

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FASE 1: Provider Registry                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ANTES:                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ LLMGateway.js                                                         │ │
│  │ providers = { groq: {...}, deepseek: {...} } // hardcoded           │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  DESPUÉS:                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ ProviderRegistry                                                      │ │
│  │ - Lee providers desde config/DB                                     │ │
│  │ - Expone capacidades de cada provider                               │ │
│  │ - Capability Router consulta Registry                               │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  LLMGateway sigue funcionando (legacy mode)                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Migración de Datos

```sql
-- Crear nuevo schema
CREATE TABLE providers (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  capabilities JSONB NOT NULL,
  config JSONB,
  priority INTEGER DEFAULT 100,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Poblar desde config existente
INSERT INTO providers (id, name, capabilities, config, priority)
SELECT 
  'groq',
  'Groq',
  '["llm.chat", "llm.reasoning"]'::jsonb,
  '{"api_base": "https://api.groq.com"}',
  10
ON CONFLICT DO NOTHING;
```

#### Código Nuevo

```typescript
// api/server/services/ProviderRegistry/
export class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();
  
  // Cargado desde DB/config
  async initialize(): Promise<void> {
    const providers = await db.providers.findAll();
    for (const p of providers) {
      this.providers.set(p.id, p);
    }
  }
  
  // Búsqueda por capabilities
  findByCapabilities(caps: Capability[]): Provider[] {
    return Array.from(this.providers.values())
      .filter(p => caps.every(c => p.capabilities.includes(c)));
  }
}
```

#### Validación

```bash
# Test de integración
npm run test:integration -- --phase=phase1

# Verificar que routing funciona
curl -X POST http://localhost:3080/api/chat \
  -d '{"capabilities": ["llm.chat"]}' \
  | jq '.provider'
# Esperado: Proveedor seleccionado basado en capabilities
```

### Fase 2: Policy Engine (Semana 5-6)

**Objetivo:** Centralizar reglas de negocio

#### Arquitectura Resultante

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FASE 2: Policy Engine                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Policy Engine                                                         │ │
│  │                                                                      │ │
│  │ rules: [                                                            │ │
│  │   { type: 'cost', max: 0.01, tier: 'free' },                     │ │
│  │   { type: 'priority', providers: ['groq', 'fcc'] },               │ │
│  │ ]                                                                    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Capability Router                                                     │ │
│  │ - Consulta Policy Engine antes de rutear                           │ │
│  │ - Aplica reglas de costo/latencia/prioridad                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Código Nuevo

```typescript
// api/server/services/PolicyEngine/
export class PolicyEngine {
  private rules: PolicyRule[] = [];
  
  evaluate(context: PolicyContext): PolicyDecision {
    const applicableRules = this.rules
      .filter(r => r.enabled)
      .filter(r => r.condition(context))
      .sort((a, b) => b.priority - a.priority);
    
    return this.applyRules(applicableRules, context);
  }
}
```

#### Migración de Reglas Existentes

```typescript
// Migrar reglas hardcoded de LLMGateway
const legacyRules = [
  { name: 'max_cost', value: 0.001, location: 'LLMGateway:line 45' },
  { name: 'priority', value: { groq: 1, deepseek: 2 }, location: 'LLMGateway:line 78' },
];

// Convertir a Policy Rules
for (const rule of legacyRules) {
  await db.policy_rules.create({
    name: rule.name,
    type: inferType(rule.name),
    config: rule.value,
    source: rule.location,
    enabled: true
  });
}
```

### Fase 3: Account Manager + Token Manager (Semana 7-8)

**Objetivo:** Gestión centralizada de cuentas y tokens

#### Arquitectura Resultante

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FASE 3: Account + Token Manager                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Account Manager                                                       │ │
│  │ - Abstrae tipo de auth                                              │ │
│  │ - Soporta API Keys, OAuth, JWT, etc.                               │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Token Manager                                                         │ │
│  │ - Tracking por usuario/proveedor/modelo                            │ │
│  │ - Predicción de cuota                                               │ │
│  │ - Alertas proactivas                                                │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Código Nuevo

```typescript
// api/server/services/AccountManager/
export class AccountManager {
  async getCredentials(providerId: string): Promise<Credentials> {
    const account = await db.accounts.findOne({
      providerId,
      isActive: true
    });
    
    // Refresh si es necesario
    if (account.expiresAt && account.expiresAt < new Date()) {
      return this.refreshAccount(account);
    }
    
    return this.decryptCredentials(account.credentials);
  }
}

// api/server/services/TokenManager/
export class TokenManager {
  async checkQuota(dimensions: UsageDimensions): Promise<QuotaStatus> {
    const usage = await this.getUsage(dimensions);
    const limit = await this.getLimit(dimensions);
    
    return {
      used: usage,
      limit,
      remaining: limit - usage,
      percentage: (usage / limit) * 100,
      isNearLimit: usage / limit > 0.8
    };
  }
}
```

### Fase 4: API Key Manager Integration (Semana 9-10)

**Objetivo:** Unificar gestión de credenciales

#### Arquitectura Resultante

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FASE 4: API Key Manager Unificado                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ANTES (disperso):                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                              │
│  │ LiteLLM  │  │ LibreChat│  │  API Key │                              │
│  │ config   │  │   DB     │  │ Manager  │                              │
│  └──────────┘  └──────────┘  └──────────┘                              │
│                                                                              │
│  DESPUÉS (unificado):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    API Key Manager                                   │ │
│  │         (Única fuente de verdad)                                   │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                              │
│  │ LiteLLM │  │ LibreChat│  │ Dashboard│                              │
│  │  (lee)  │  │   (lee)  │  │  (CRUD)  │                              │
│  └──────────┘  └──────────┘  └──────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### API de Integración

```typescript
// api/server/services/APIClient/
export class APIKeyManagerClient {
  private baseUrl: string;
  
  async getKey(providerId: string): Promise<{ key: string }> {
    const response = await fetch(`${this.baseUrl}/api/v1/keys/provider/${providerId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`API Key Manager error: ${response.status}`);
    }
    
    return response.json();
  }
  
  async reportUsage(keyId: string, usage: UsageReport): Promise<void> {
    await fetch(`${this.baseUrl}/api/v1/keys/${keyId}/usage`, {
      method: 'POST',
      body: JSON.stringify(usage)
    });
  }
}
```

### Fase 5: Free Claude Code Integration (Semana 11-12)

**Objetivo:** Integrar FCC como provider

#### Arquitectura Resultante

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FASE 5: Free Claude Code                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Provider Registry                                                    │ │
│  │ providers = {                                                       │ │
│  │   groq: {...},                                                       │ │
│  │   deepseek: {...},                                                   │ │
│  │   fcc: { endpoint: 'http://localhost:8082', ... }                  │ │
│  │ }                                                                    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ FCC Adapter                                                          │ │
│  │ - Normaliza request a formato FCC                                   │ │
│  │ - Traduce response a formato estándar                              │ │
│  │ - Maneja autenticación (si existe)                                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Free Claude Code (Puerto 8082)                                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Código del Adapter

```typescript
// api/server/services/Providers/FCCAdapter/
export class FCCAdapter implements ProviderAdapter {
  constructor(private config: FCCConfig) {}
  
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.config.endpoint}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      },
      body: JSON.stringify(this.toFCCFormat(request))
    });
    
    return this.fromFCCFormat(response);
  }
  
  private toFCCFormat(request: LLMRequest) {
    return {
      model: request.model || 'openrouter/auto',
      messages: request.messages,
      stream: request.stream
    };
  }
  
  private fromFCCFormat(response: FCCResponse): LLMResponse {
    return {
      message: response.content,
      usage: response.usage,
      model: response.model
    };
  }
}
```

### Fase 6: Dashboard Evolution (Semana 13-14)

**Objetivo:** Actualizar dashboard con nuevos componentes

#### Paneles a Implementar

| Panel | Descripción | Complejidad |
|-------|-------------|-------------|
| Provider Health | Estado de todos los providers | Baja |
| Token Usage | Consumo por dimensión | Media |
| API Keys | Gestión visual de keys | Media |
| Accounts | Cuentas por provider | Media |
| Policies | Visualización de reglas | Alta |
| Audit Log | Log de operaciones | Media |

---

## 5. VALIDACIÓN Y ROLLBACK

### 5.1 Validación en Cada Fase

```bash
#!/bin/bash
# validate_phase.sh <phase>

PHASE=$1
echo "Validando Fase $PHASE..."

# 1. Health check
curl -f http://localhost:3080/health || { echo "Health check failed"; exit 1; }

# 2. Smoke tests
npm run test:smoke -- --phase=$PHASE || { echo "Smoke tests failed"; exit 1; }

# 3. Performance regression
npm run benchmark -- --compare=baseline || { echo "Performance regression detected"; exit 1; }

# 4. Integration tests
npm run test:integration -- --phase=$PHASE || { echo "Integration tests failed"; exit 1; }

echo "Fase $PHASE validada correctamente"
```

### 5.2 Criterios de Rollback

| Métrica | Threshold | Acción |
|---------|-----------|--------|
| Error rate | > 1% | Alertar |
| Error rate | > 5% | Rollback |
| Latency P99 | > 2000ms | Alertar |
| Latency P99 | > 5000ms | Rollback |
| Availability | < 99% | Alertar |
| Availability | < 95% | Rollback |

### 5.3 Procedimiento de Rollback

```bash
#!/bin/bash
# rollback_phase.sh <phase>

PHASE=$1
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "Iniciando rollback de Fase $PHASE..."

# 1. Backup estado actual
mkdir -p /backups/$TIMESTAMP
kubectl get pods -o yaml > /backups/$TIMESTAMP/pods.yaml
kubectl get configmap -o yaml > /backups/$TIMESTAMP/configmaps.yaml

# 2. Restaurar imágenes anteriores
docker-compose pull
git checkout HEAD~1

# 3. Reiniciar servicios
kubectl rollout undo deployment/librechat-api
kubectl rollout status deployment/librechat-api

# 4. Verificar
curl -f http://localhost:3080/health || { 
  echo "Rollback falló, restaurando backup manual..."
  kubectl apply -f /backups/$TIMESTAMP/pods.yaml
  exit 1 
}

echo "Rollback completado para Fase $PHASE"
```

---

## 6. TIMELINE

### 6.1 Vista General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TIMELINE DE MIGRACIÓN                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Semana  1-2   │ Fase 0: Preparación                                      │
│  ══════════════════════════════════════════════════════════════════════  │
│                │                                                          │
│  Semana  3-4   │ Fase 1: Provider Registry + Capability Router           │
│  ══════════════════════════════════════════════════════════════════════  │
│                │                                                          │
│  Semana  5-6   │ Fase 2: Policy Engine                                   │
│  ══════════════════════════════════════════════════════════════════════  │
│                │                                                          │
│  Semana  7-8   │ Fase 3: Account Manager + Token Manager                │
│  ══════════════════════════════════════════════════════════════════════  │
│                │                                                          │
│  Semana  9-10  │ Fase 4: API Key Manager Integration                     │
│  ══════════════════════════════════════════════════════════════════════  │
│                │                                                          │
│  Semana 11-12  │ Fase 5: Free Claude Code Integration                    │
│  ══════════════════════════════════════════════════════════════════════  │
│                │                                                          │
│  Semana 13-14  │ Fase 6: Dashboard Evolution + QA                        │
│  ══════════════════════════════════════════════════════════════════════  │
│                │                                                          │
│  Semana 15-16 │ Estabilización + Documentación                           │
│  ══════════════════════════════════════════════════════════════════════  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Detalle Semanal

| Semana | Fase | Entregables | Criterio de Éxito |
|--------|------|-------------|-------------------|
| 1 | Prep | Branch, staging, baseline | Staging = producción |
| 2 | Prep | Scripts rollback, docs | Rollback < 5min |
| 3 | F1 | Provider Registry | Lee providers de DB |
| 4 | F1 | Capability Router v2 | Routing por capabilities |
| 5 | F2 | Policy Engine base | Evalúa contexto |
| 6 | F2 | Reglas migradas | Policies = legacy logic |
| 7 | F3 | Account Manager | Abstrae auth types |
| 8 | F3 | Token Manager | Tracking por dimensión |
| 9 | F4 | AKM integration | Unified credentials |
| 10 | F4 | Sync bidirectional | Datos consistentes |
| 11 | F5 | FCC Adapter | FCC como provider |
| 12 | F5 | Fallback testing | FCC en fallback chain |
| 13 | F6 | Dashboard panels | Panels operativos |
| 14 | F6 | QA completo | Todos los tests pasan |
| 15 | Estab | Performance tuning | P99 < baseline |
| 16 | Estab | Docs actualizadas | Documentación completa |

### 6.3 Recursos Requeridos

| Rol | Cantidad | Semanas |
|-----|----------|---------|
| Backend Engineer | 2 | 16 |
| DevOps | 1 | 8 |
| QA Engineer | 1 | 6 |
| Tech Lead | 1 | 16 |

---

## 7. RIESGOS Y MITIGACIONES

### 7.1 Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Breaking changes en API | Media | Alto | Versioning + backward compat |
| Duplicación de estado | Alta | Medio | Sync temprano |
| Performance regression | Media | Medio | Benchmarking continuo |
| Datos corruptos | Baja | Crítico | Backups + validación |

### 7.2 Riesgos de Negocio

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Downtime users | Baja | Alto | Migración en low traffic |
| Features rotos | Media | Medio | QA exhaustivo |
| Delay en timeline | Media | Medio | Buffer de 2 semanas |

---

## 8. GO/NO-GO CHECKLIST

### Antes de Cada Fase

- [ ] Tests pasan en CI
- [ ] Staging validado
- [ ] Rollback script probado
- [ ] Comunicación a stakeholders
- [ ] Monitorización configurada
- [ ] On-call preparado

### Antes de Cutover

- [ ] 100% de features funcionales
- [ ] Performance igual o mejor
- [ ] 0 errores críticos en logs
- [ ] Datos sincronizados
- [ ] Documentación actualizada
- [ ] Training completado

---

**Fin de Estrategia de Migración**
