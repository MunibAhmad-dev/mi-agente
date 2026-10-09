# 🏗️ DISEÑO DE ARQUITECTURA: INTEGRACIÓN API-KEY MANAGER + LLMGateway

**Fecha:** 2026-07-19  
**Auditor:** OpenHands AI Agent  
**Objetivo:** Diseñar la arquitectura de integración para cumplir el flujo objetivo

---

## 1. ANÁLISIS DEL REPOSITORIO API-KEY

### Situación Actual
El repositorio `https://github.com/aoi555/api-key` **no existe públicamente** o no es accesible.

### Alternativa: One API
**Recomendación:** Usar [One API](https://github.com/songquanpeng/one-api) como base o referencia.

**Ventajas de One API:**
- 35,800+ estrellas, producción probada
- Soporta 100+ proveedores
- Tokenización con cuotas y límites
- Balanceo de carga entre canales
- Sistema de canje de créditos
- API RESTful completa

### Decisión de Diseño
Para este diseño, asumimos que `api-key` será:
1. Un microservicio Go (similar a One API)
2. O un servicio Node.js dentro del monorepo
3. O una integración con One API existente

---

## 2. ARQUITECTURA OBJETIVO COMPLETA

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USUARIO                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         LIBRECHAT FRONTEND                                      │
│                                                                                 │
│  ChatForm.tsx → useSubmitMessage → useChatFunctions → useResumableSSE           │
│                                                                                 │
│  Responsabilidad: Solo construye el payload y envía al backend                  │
│  Límite: NO sabe nada de proveedores, keys, ni routing                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼ HTTP POST
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         LIBRECHAT BACKEND                                       │
│                                                                                 │
│  Middlewares (en orden):                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ 1. requireJwtAuth ────────► Autenticación JWT                          │   │
│  │ 2. checkBan ─────────────► Verificar baneo                              │   │
│  │ 3. uaParser ─────────────► User agent                                   │   │
│  │ 4. messageIpLimiter ────► Rate limiting por IP                         │   │
│  │ 5. messageUserLimiter ───► Rate limiting por usuario                     │   │
│  │ 6. createMessageFilterPii ► Filtrado PII                               │   │
│  │ 7. moderateText ─────────► Moderación de contenido                      │   │
│  │ 8. checkAgentAccess ─────► Verifica permisos de agente                  │   │
│  │ 9. validateConvoAccess ─► Valida acceso a conversación                │   │
│  │ 10. buildEndpointOption ─► Construye opciones del endpoint              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Responsabilidad: Preprocesamiento, seguridad, validación                     │
│  Límite: NO sabe nada de proveedores, keys, ni routing                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         AI-OS / ORQUESTADOR                                     │
│                                                                                 │
│  AgentController → AgentClient → createRun()                                   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ PACKAGES/AGENTS/RUN.TS                                                   │   │
│  │                                                                          │   │
│  │ async function createRun({ messages, ... }) {                           │   │
│  │                                                                          │   │
│  │   // 1. Preparar contexto del agente                                    │   │
│  │   const agentContext = await prepareAgentContext(messages, tools);       │   │
│  │                                                                          │   │
│  │   // 2. Analizar capabilities requeridas                                 │   │
│  │   const capabilities = analyzeCapabilities(messages);                     │   │
│  │   //   → code: ¿requiere código?                                        │   │
│  │   //   → search: ¿requiere búsqueda web?                               │   │
│  │   //   → vision: ¿requiere visión?                                     │   │
│  │   //   → reasoning: ¿requiere razonamiento?                            │   │
│  │                                                                          │   │
│  │   // 3. Llamar a LLMGateway (ÚNICO PUNTO)                              │   │
│  │   const response = await LLMGateway.complete({                          │   │
│  │     messages,                                                            │   │
│  │     capabilities,                                                        │   │
│  │     signal: abortController.signal,                                      │   │
│  │   });                                                                     │   │
│  │                                                                          │   │
│  │   // 4. Procesar respuesta                                              │   │
│  │   return processResponse(response, callbacks);                           │   │
│  │ }                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Responsabilidad: Orquestación de agentes y herramientas                      │
│  Límite: NO llama modelos directamente, NO selecciona proveedores             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FREE CLAUDE CODE                                       │
│                                                                                 │
│  packages/librechat-agents/                                                    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ PROVEEDOR CAPACIDADES (NO PROVEEDOR LLM)                                │   │
│  │                                                                          │   │
│  │ • Ejecución de código                                                    │   │
│  │ • Análisis de archivos                                                   │   │
│  │ • Uso de herramientas (tools)                                            │   │
│  │ • Procesamiento de artefactos                                            │   │
│  │ • Integración con terminal                                              │   │
│  │                                                                          │   │
│  │ NOTA: Esto es independiente de qué LLM se use                           │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Responsabilidad: Proporcionar capacidades de Claude Code                      │
│  Límite: NO selecciona proveedor LLM, NO maneja API keys                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         LITELLM GATEWAY                                        │
│                                                                                 │
│  api/server/services/LLMGateway/                                               │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ LLMGateway.complete({ messages, capabilities, signal })                │   │
│  │                                                                          │   │
│  │   │                                                                      │   │
│  │   ├─► 1. apiKeyManager.getKey(provider)  ◄── INTEGRACIÓN API-KEY      │   │
│  │   │    Returns: { apiKey, quota, expiresAt, models[] }                │   │
│  │   │                                                                      │   │
│  │   ├─► 2. selectProviderAndModel(capabilities)  ◄── ÚNICO ROUTING     │   │
│  │   │    │                                                                │   │
│  │   │    ├─ code required → Groq (free), DeepSeek                       │   │
│  │   │    ├─ search required → Perplexity, Google                        │   │
│  │   │    ├─ vision required → Claude, Gemini                             │   │
│  │   │    └─ default → Groq (fastest free)                               │   │
│  │   │                                                                      │   │
│  │   ├─► 3. Execute with fallback                                          │   │
│  │   │    │                                                                │   │
│  │   │    ├─ Try: Groq                                                    │   │
│  │   │    ├─ If fails → Try: DeepSeek                                     │   │
│  │   │    ├─ If fails → Try: Cloudflare                                   │   │
│  │   │    └─ If fails → Return error                                      │   │
│  │   │                                                                      │   │
│  │   └─► 4. Record usage                                                   │   │
│  │        apiKeyManager.recordUsage({ userId, provider, model, tokens })  │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Responsabilidad: Routing, fallback, retry, API key management                │
│  Límite: NO tiene lógica de negocio, solo routing y execution                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         API-KEY MANAGER                                        │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ INTEGRACIÓN: Dentro de LLMGateway.js                                    │   │
│  │                                                                          │   │
│  │ class ApiKeyManager {                                                  │   │
│  │                                                                          │   │
│  │   async getKey(provider) {                                              │   │
│  │     // 1. Check cache                                                  │   │
│  │     const cached = this.cache.get(provider);                           │   │
│  │     if (cached && !this.isExpired(cached)) {                           │   │
│  │       return cached;                                                    │   │
│  │     }                                                                  │   │
│  │                                                                          │   │
│  │     // 2. Fetch from API-Key Service                                   │   │
│  │     const response = await fetch(`${API_KEY_URL}/channel/key`, {       │   │
│  │       method: 'GET',                                                    │   │
│  │       headers: { 'Authorization': `Bearer ${SYSTEM_TOKEN}` },          │   │
│  │     });                                                                 │   │
│  │                                                                          │   │
│  │     // 3. Cache the result                                              │   │
│  │     this.cache.set(provider, response.data);                            │   │
│  │                                                                          │   │
│  │     return response.data;                                               │   │
│  │   }                                                                     │   │
│  │                                                                          │   │
│  │   async recordUsage({ userId, provider, model, tokens }) {            │   │
│  │     // 4. Log usage for audit                                           │   │
│  │     await fetch(`${API_KEY_URL}/usage/log`, {                          │   │
│  │       method: 'POST',                                                   │   │
│  │       body: JSON.stringify({ userId, provider, model, tokens }),      │   │
│  │     });                                                                 │   │
│  │   }                                                                     │   │
│  │                                                                          │   │
│  │   async rotateKey(provider) {                                           │   │
│  │     // 5. Rotate if needed (quota exhausted)                           │   │
│  │     await fetch(`${API_KEY_URL}/channel/rotate`, {                     │   │
│  │       method: 'POST',                                                   │   │
│  │       body: JSON.stringify({ provider }),                              │   │
│  │     });                                                                 │   │
│  │     this.cache.delete(provider);                                       │   │
│  │   }                                                                     │   │
│  │ }                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Responsabilidad: Gestión centralizada de API keys                            │
│  Límite: NO hace routing, solo provee keys y audita uso                      │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         API-KEY SERVICE (Microservicio)                       │
│                                                                                 │
│  https://github.com/aoi555/api-key (futuro)                                   │
│  O alternativa: One API https://github.com/songquanpeng/one-api               │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ ENDPOINTS PRINCIPALES                                                   │   │
│  │                                                                          │   │
│  │ GET  /channel/key ────────────► Obtener clave activa del canal         │   │
│  │ POST /channel/rotate ──────────► Rotar clave                            │   │
│  │ POST /usage/log ──────────────► Registrar uso                          │   │
│  │ GET  /quota/:userId ─────────► Obtener cuota del usuario              │   │
│  │ POST /token/validate ────────► Validar token del usuario               │   │
│  │                                                                          │   │
│  │ MODELS:                                                                 │   │
│  │ • Channel (proveedor + key)                                            │   │
│  │ • Token (key del usuario)                                              │   │
│  │ • User (cuota)                                                         │   │
│  │ • UsageLog (auditoría)                                                 │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Responsabilidad: Persistencia y gestión de API keys                          │
│  Límite: NO hace llamadas LLM, solo administra keys                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PROVEEDORES LLM                                       │
│                                                                                 │
│  Groq | DeepSeek | Cloudflare | Mistral | Anthropic | Gemini | etc.          │
│                                                                                 │
│  Responsabilidad: Solo ejecutar modelos                                       │
│  Límite: NO tienen lógica de negocio, solo inference                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USUARIO RECIBE RESPUESTA                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. DISEÑO DE INTEGRACIÓN: ARCHIVOS A MODIFICAR

### 3.1 NUEVOS ARCHIVOS

#### A. ApiKeyManager (Nuevo)
```
api/server/services/ApiKeyManager/
├── ApiKeyManager.js          ← Clase principal
├── ApiKeyCache.js           ← Cache de keys
├── UsageLogger.js           ← Logger de uso
└── index.js                 ← Exports
```

**Código:**
```javascript
// api/server/services/ApiKeyManager/ApiKeyManager.js

class ApiKeyManager {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.API_KEY_SERVICE_URL;
    this.systemToken = config.systemToken || process.env.API_KEY_SYSTEM_TOKEN;
    this.cache = new Map();
    this.cacheTTL = config.cacheTTL || 5 * 60 * 1000; // 5 minutos
  }

  async getKey(provider) {
    // 1. Check cache
    const cached = this.getCachedKey(provider);
    if (cached) {
      return cached;
    }

    // 2. Fetch from API-Key Service
    const response = await fetch(`${this.apiUrl}/channel/key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.systemToken}`,
      },
      body: JSON.stringify({ provider }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get API key for ${provider}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // 3. Cache the result
    this.cacheKey(provider, data);
    
    return data;
  }

  async recordUsage({ userId, provider, model, inputTokens, outputTokens }) {
    await fetch(`${this.apiUrl}/usage/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.systemToken}`,
      },
      body: JSON.stringify({
        userId,
        provider,
        model,
        inputTokens,
        outputTokens,
        timestamp: Date.now(),
      }),
    });
  }

  async rotateKey(provider) {
    await fetch(`${this.apiUrl}/channel/rotate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.systemToken}`,
      },
      body: JSON.stringify({ provider }),
    });
    this.cache.delete(provider);
  }

  async validateUserToken(token) {
    const response = await fetch(`${this.apiUrl}/token/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
    return response.json();
  }

  getCachedKey(provider) {
    const cached = this.cache.get(provider);
    if (cached && Date.now() < cached.expiresAt) {
      return cached;
    }
    return null;
  }

  cacheKey(provider, data) {
    this.cache.set(provider, {
      ...data,
      expiresAt: Date.now() + this.cacheTTL,
    });
  }
}

module.exports = ApiKeyManager;
```

#### B. Integración en LLMGateway
**Modificar:** `api/server/services/LLMGateway/LLMGateway.js`

```javascript
// Agregar al constructor:
const ApiKeyManager = require('../ApiKeyManager');

class LLMGateway {
  constructor(config = {}) {
    // ... código existente ...
    
    // NUEVO: Integrar ApiKeyManager
    this.apiKeyManager = new ApiKeyManager({
      apiUrl: config.apiKeyServiceUrl,
      systemToken: config.systemToken,
    });
  }

  // Modificar método complete():
  async complete({ messages, model, provider, temperature, maxTokens, stream, userId }) {
    // 1. Obtener capabilities
    const capabilities = this.analyzeCapabilities(messages);
    
    // 2. Seleccionar provider si no especificado
    let selectedProvider = provider;
    if (!selectedProvider) {
      const selection = this.selectProviderAndModel({ model, capabilities });
      selectedProvider = selection.provider;
      model = selection.model;
    }
    
    // 3. Obtener API key del manager
    const { apiKey } = await this.apiKeyManager.getKey(selectedProvider);
    
    // 4. Ejecutar con el provider
    const result = await this.executeOnProvider({
      provider: selectedProvider,
      model,
      messages,
      temperature,
      maxTokens,
      stream,
      apiKey, // Pasar la key
    });
    
    // 5. Registrar uso
    if (!stream) {
      await this.apiKeyManager.recordUsage({
        userId,
        provider: selectedProvider,
        model,
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
      });
    }
    
    return result;
  }
}
```

---

### 3.2 ARCHIVOS A MODIFICAR

#### A. packages/api/src/agents/run.ts (CRÍTICO)

**Cambio:** Reemplazar `getLLMConfig()` por `LLMGateway.complete()`

```diff
- // packages/api/src/agents/run.ts
+ // packages/api/src/agents/run.ts

  import { getLLMConfig } from '~/endpoints/anthropic/llm';
  import { getOpenAIConfig } from '~/endpoints/openai/config';
+ import { LLMGateway } from '../../../server/services/LLMGateway';
  
  async function createRun({ messages, tools, ... }) {
    
-   // ANTES: Llamada directa al LLM
-   const llmConfig = await getLLMConfig({
-     req,
-     provider,
-     model,
-     endpointOption,
-     appConfig,
-     tools,
-   });
+   // DESPUÉS: Llamada a través del Gateway
+   const gateway = new LLMGateway({
+     apiKeyServiceUrl: process.env.API_KEY_SERVICE_URL,
+     systemToken: process.env.API_KEY_SYSTEM_TOKEN,
+   });
    
+   const capabilities = analyzeCapabilities(messages);
+   
+   const response = await gateway.complete({
+     messages,
+     model,
+     capabilities,
+     temperature,
+     maxTokens,
+     stream: true,
+     userId: req.user?.id,
+   });
    
-   // Continuar con el flujo existente...
-   const client = new OpenAIClient(llmConfig);
-   const result = await client.chat.completions(...)
+   // Ahora el gateway devuelve la respuesta lista para procesar
+   return response;
  }
```

#### B. api/server/services/LLMGateway/LLMGateway.js

**Cambio:** Integrar ApiKeyManager

```diff
  class LLMGateway {
    constructor(config = {}) {
+     this.apiKeyManager = new ApiKeyManager(config.apiKeyManager);
    }
    
    async complete({ messages, model, provider, ... }) {
      
+     // 1. Obtener API key
+     const { apiKey, quota } = await this.apiKeyManager.getKey(provider);
+     
+     // 2. Verificar cuota
+     if (quota <= 0) {
+       throw new Error('Quota exhausted, please contact admin');
+     }
+     
      // 3. Continuar con ejecución...
    }
  }
```

#### C. Deprecar servicios directos

**Marcarlos como deprecated:**

| Archivo | Acción | Razón |
|---------|--------|-------|
| `api/server/services/Claude/ClaudeService.js` | Deprecate | Debe usar LLMGateway |
| `api/server/services/AgentArchitect/anthropicClient.js` | Deprecate | Debe usar LLMGateway |
| `api/app/clients/tools/structured/DALLE3.js` | Modificar | Usar provider del gateway |
| `api/server/services/Files/Audio/TTSService.js` | Modificar | Usar provider del gateway |
| `api/server/services/Files/Audio/STTService.js` | Modificar | Usar provider del gateway |
| `api/middleware/moderateText.js` | Modificar | Usar gateway |

---

## 4. DIAGRAMA DE SECUENCIA

```
┌────────┐     ┌──────────────┐     ┌────────────┐     ┌─────────────┐     ┌──────────┐
│Usuario │     │ LibreChat    │     │ AI-OS      │     │ LLMGateway  │     │ API-Key  │
│        │     │ Backend      │     │ (run.ts)   │     │             │     │ Manager  │
└───┬────┘     └──────┬───────┘     └─────┬──────┘     └──────┬──────┘     └────┬─────┘
    │                 │                    │                    │                │
    │ 1. POST /chat   │                    │                    │                │
    │────────────────>│                    │                    │                │
    │                 │                    │                    │                │
    │                 │ 2. Middlewares     │                    │                │
    │                 │───────────────────>│                    │                │
    │                 │                    │                    │                │
    │                 │                    │ 3. createRun()     │                │
    │                 │                    │───────────────────>│                │
    │                 │                    │                    │                │
    │                 │                    │                    │ 4. getKey()   │
    │                 │                    │                    │───────────────>│
    │                 │                    │                    │                │
    │                 │                    │                    │ 5. API Key     │
    │                 │                    │                    │<───────────────│
    │                 │                    │                    │                │
    │                 │                    │                    │ 6. execute()  │
    │                 │                    │                    │──┐           │
    │                 │                    │                    │  │ Provider    │
    │                 │                    │                    │<──┘            │
    │                 │                    │                    │                │
    │                 │                    │                    │ 7. recordUsage│
    │                 │                    │                    │───────────────>│
    │                 │                    │                    │                │
    │                 │ 8. Response       │<───────────────────│                │
    │<────────────────│<──────────────────│                    │                │
    │                 │                    │                    │                │
```

---

## 5. CONFIGURACIÓN REQUERIDA

### 5.1 Variables de Entorno

```env
# API-Key Service
API_KEY_SERVICE_URL=http://localhost:3001
API_KEY_SYSTEM_TOKEN=your_system_token_here

# LLMGateway
LLM_GATEWAY_TIMEOUT=60000
LLM_GATEWAY_MAX_RETRIES=3
LLM_GATEWAY_ENABLE_FALLBACK=true

# Proveedores (ya existentes)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
```

### 5.2 Configuración del Gateway

```yaml
# config/llm-gateway.yaml

gateway:
  timeout: 60000
  maxRetries: 3
  enableFallback: true
  apiKeyManager:
    enabled: true
    serviceUrl: ${API_KEY_SERVICE_URL}
    systemToken: ${API_KEY_SYSTEM_TOKEN}
    cacheTTL: 300000  # 5 minutes

providers:
  groq:
    enabled: true
    tier: free
    capabilities: [code, chat]
    
  deepseek:
    enabled: true  
    tier: free_credit
    capabilities: [code, math, chat]
    
  # ... más providers
```

---

## 6. MIGRACIÓN GRADUAL

### Fase 1: Paralelo (Sin romper existente)
```
                        ┌─────────────────────────────────────┐
                        │         LibreChat Backend           │
                        │                                      │
Usuario ───────────────>│                                     │
                        │  ┌─────────────────────────────────┐│
                        │  │ if (useNewGateway) {            ││
                        │  │   LLMGateway.complete()        ││  ← NUEVO
                        │  │ } else {                       ││
                        │  │   getLLMConfig()  // ACTUAL    ││  ← VIEJO
                        │  │ }                              ││
                        │  └─────────────────────────────────┘│
                        └─────────────────────────────────────┘
```

### Fase 2: Flip gradual
- 10% → 50% → 100% de tráfico por el nuevo gateway

### Fase 3: Deprecation
- Marcar old routes como deprecated
- Remover después de validación completa

---

## 7. RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Breaking changes en API | Alta | Alto | Feature flags, backward compatibility |
| Latencia adicional por api-key | Media | Medio | Cache agresivo, async no-bloqueante |
| api-key service down | Baja | Alto | Fallback a keys directas (emergency) |
| Rate limiting de api-key | Media | Medio | Monitoreo proactivo |
| Keys no rotan | Baja | Alto | Alertas y dashboard |

---

## 8. IMPACTO Y DEPENDENCIAS

### 8.1 Archivos a Crear
| Archivo | Líneas | Prioridad |
|---------|--------|-----------|
| `api/server/services/ApiKeyManager/ApiKeyManager.js` | ~150 | 🔴 Crítica |
| `api/server/services/ApiKeyManager/index.js` | ~20 | 🔴 Crítica |
| `config/api-key-manager.yaml` | ~50 | 🟡 Media |

### 8.2 Archivos a Modificar
| Archivo | Cambio | Prioridad | Riesgo |
|---------|--------|-----------|--------|
| `packages/api/src/agents/run.ts` | Replace getLLMConfig | 🔴 Crítica | Alto |
| `api/server/services/LLMGateway/LLMGateway.js` | Integrate ApiKeyManager | 🔴 Crítica | Medio |
| `api/server/services/Claude/ClaudeService.js` | Deprecate | 🟡 Media | Bajo |
| `api/server/services/AgentArchitect/anthropicClient.js` | Deprecate | 🟡 Media | Bajo |
| `api/app/clients/tools/structured/DALLE3.js` | Use gateway | 🟡 Media | Medio |

### 8.3 Nuevas Dependencias
```json
{
  "dependencies": {
    "node-cache": "^5.1.2"
  }
}
```

---

## 9. TESTS REQUERIDOS

### 9.1 Unit Tests
- `ApiKeyManager.test.js` - Cache, getKey, recordUsage
- `LLMGateway.test.js` - Routing, fallback, integration
- `run.ts.test.js` - Con nuevo gateway

### 9.2 Integration Tests
- Full flow: request → LLMGateway → ApiKeyManager → Provider
- Fallback chain
- Error handling

### 9.3 E2E Tests
- User login → send message → receive response
- Verify key usage logged

---

## 10. MONITOREO Y ALERTAS

### Métricas a Monitorear
- `llm_gateway_requests_total`
- `llm_gateway_latency_seconds`
- `llm_gateway_errors_total`
- `api_key_cache_hit_rate`
- `api_key_quota_remaining`

### Alertas
- api-key service down > 1min
- Quota < 10% remaining
- Error rate > 5%
- Latency p95 > 10s

---

## 11. ALTERNATIVAS DE IMPLEMENTACIÓN

### Opción A: Microservicio Separado (Recomendado para escalar)
```
┌──────────────┐
│  api-key     │ ← Servicio Go/Node.js independiente
│  Service     │
└──────┬───────┘
       │ HTTP
       ▼
┌──────────────┐
│  LLMGateway  │ ← Consume del servicio
└──────────────┘
```

**Ventajas:** Escalable, independiente, aislable
**Desventajas:** Más compleja, latencia de red

### Opción B: Integrado en LibreChat (Más simple)
```
┌──────────────────────────────────┐
│       LibreChat Backend          │
│  ┌──────────────────────────┐   │
│  │  ApiKeyManager           │   │
│  │  (misma aplicación)      │   │
│  └──────────────────────────┘   │
│               │                 │
│               ▼                 │
│  ┌──────────────────────────┐   │
│  │  LLMGateway              │   │
│  └──────────────────────────┘   │
└──────────────────────────────────┘
```

**Ventajas:** Simple, menos latencia
**Desventajas:** Acoplado, menos escalable

### Opción C: One API como proxy (Recomendado si ya existe)
```
┌──────────────┐     ┌──────────────┐
│  LibreChat   │────>│   One API    │────> Providers
│  Backend     │     │   (proxy)    │
└──────────────┘     └──────────────┘
                          │
                          ▼
                    ┌──────────────┐
                    │  DB (keys)   │
                    └──────────────┘
```

**Ventajas:** Producción probada, features completas
**Desventajas:** Dependencia externa

---

## 12. RECOMENDACIÓN FINAL

### Arquitectura Recomendada: Opción B (Integrado) con Opción A como futuro

**Para comenzar:** Integración directa en LibreChat (Opción B)
- Más rápido de implementar
- Menos componentes a mantener
- Fácil de iterar

**Para escalar:** Separar como microservicio (Opción A)
- Cuando el tráfico lo requiera
- Cuando haya equipos dedicados
- Cuando se necesite alta disponibilidad

---

## 13. PRÓXIMOS PASOS

| # | Paso | Esfuerzo | Prioridad |
|---|------|----------|-----------|
| 1 | Crear ApiKeyManager service | Alto | 🔴 |
| 2 | Integrar en LLMGateway | Medio | 🔴 |
| 3 | Modificar run.ts | Alto | 🔴 |
| 4 | Migrar ClaudeService | Medio | 🟡 |
| 5 | Migrar AgentArchitect | Medio | 🟡 |
| 6 | Migrar DALL-E | Bajo | 🟡 |
| 7 | Migrar TTS/STT | Bajo | 🟢 |
| 8 | Tests completos | Alto | 🔴 |
| 9 | Documentación | Medio | 🟡 |
| 10 | Monitoreo y alertas | Medio | 🟡 |

---

*Documento generado: 2026-07-19*
*Auditor: OpenHands AI Agent*
