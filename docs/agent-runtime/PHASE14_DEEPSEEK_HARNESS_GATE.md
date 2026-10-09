# PHASE14_DEEPSEEK_HARNESS_GATE.md — Face 14: DeepSeek Harness

> **Estado:** FACE 14 — COMPLETADA.
> **Puntuación anterior:** 8/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Face 14

El **DeepSeek Harness** adapta el HarnessEngine (Face 7) al modelo DeepSeek V3 ejecutado localmente via Ollama u OpenRouter. El harness configura el sistema de prompts, el ciclo tool-use y la gestión de contexto optimizados para las características específicas de DeepSeek: razonamiento extenso, CoT (<think> tags) y larga ventana de contexto (128K tokens).

---

## 2. Arquitectura

```
DeepSeek Harness
├── Model adapter
│   ├── DeepSeekAdapter.js           adapter OpenAI-compatible para DeepSeek
│   ├── DeepSeekCoTParser.js         parser de <think>...</think> CoT blocks
│   └── DeepSeekCapabilities.js      capacidades: reasoning, coding, context=128K
│
├── Harness config
│   ├── HarnessEngine.js             two-phase (scaffold + runtime)
│   ├── SystemPromptBuilder.js       builds system prompt por capas
│   ├── ToolRegistry.js              lazy discovery: solo tools necesarias
│   └── CompactionManager.js        gestiona 128K context window
│
├── Evaluation
│   ├── EvaluationService.js         benchmark niveles 1-10
│   ├── configs/DEEPSEEK_HARNESS.js  config específica para DeepSeek
│   └── HeadlessSDK.js              CI/CD headless mode
│
└── Observabilidad
    ├── ObservabilityService.js      trace: model/tokens/tools/RAM/VRAM
    └── AgentReplay.js              replay de sesiones para debugging
```

---

## 3. DeepSeek Adapter

```js
const { getUniversalLLMRouter } = require('./services/LLMGateway');
const router = getUniversalLLMRouter();

// Registrar DeepSeek como provider
router.register({
  id: 'deepseek-local',
  baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  model: 'deepseek-v3',
  apiKey: process.env.DEEPSEEK_API_KEY || 'ollama',  // Ollama no requiere key
  capabilities: ['reasoning', 'coding', 'tool_calling', 'long_context'],
  contextWindow: 131072,  // 128K tokens
});

// Usar via UniversalAgentAbstraction (provider-agnostic)
const agent = getUniversalAgentAbstraction();
const result = await agent.route('analyze this codebase', { model: 'deepseek-local' });
```

---

## 4. CoT Parser — think tags

DeepSeek V3 y R1 emiten razonamiento interno entre `<think>...</think>` tags. El parser los extrae y los usa para observabilidad:

```js
const { DeepSeekCoTParser } = require('./services/AgentRuntime/DeepSeekCoTParser');
const parser = new DeepSeekCoTParser();

const raw = '<think>Let me analyze the auth flow...\n1. JWT is issued\n2. Stored in cookie</think>\nThe authentication uses JWT cookies.';
const parsed = parser.parse(raw);
// {
//   thinking: 'Let me analyze the auth flow...\n1. JWT is issued\n2. Stored in cookie',
//   response: 'The authentication uses JWT cookies.',
//   hasCoT: true
// }
```

El `thinking` se guarda en el trace de observabilidad pero no se envía al usuario.

---

## 5. DEEPSEEK_HARNESS benchmark config

```js
// api/server/services/Evaluation/configs/DEEPSEEK_HARNESS.js
module.exports = {
  name: 'DEEPSEEK_HARNESS',
  model: 'deepseek-local',
  levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  benchmarks: {
    1: { task: 'hello world', expectedOutput: /hello/i, maxTokens: 100 },
    3: { task: 'fibonacci(10)', expectedOutput: '55', maxTokens: 500 },
    5: { task: 'implement JWT auth', criteria: ['jwt', 'token', 'expire'], maxTokens: 2000 },
    7: { task: 'refactor legacy codebase', criteria: ['function', 'const', 'async'], maxTokens: 5000 },
    10: { task: 'full stack e-commerce API', criteria: ['auth', 'products', 'orders', 'payment'], maxTokens: 20000 },
  },
  scoreWeights: { correctness: 0.5, completeness: 0.3, quality: 0.2 },
};
```

```bash
# Ejecutar benchmark
cd api && node -e "
const { EvaluationService } = require('./server/services/Evaluation/evaluationService');
const svc = new EvaluationService();
svc.runBenchmark('DEEPSEEK_HARNESS', [1,3,5,7,10]).then(r => console.log(JSON.stringify(r, null, 2)));
"
```

---

## 6. Configuración

```bash
# .env.example
DEEPSEEK_API_KEY=your-deepseek-api-key   # para DeepSeek API cloud
OLLAMA_BASE_URL=http://localhost:11434    # para DeepSeek local via Ollama

# Para usar DeepSeek via Ollama (gratis, local)
ollama pull deepseek-v3
# El adapter lo detecta automáticamente en OLLAMA_BASE_URL/v1

# Para usar DeepSeek API (cloud)
# DEEPSEEK_API_KEY=sk-...
# El adapter apunta a https://api.deepseek.com/v1
```

Documentado en `README.md` → "Face 14: DeepSeek Harness Setup".

---

## 7. HeadlessSDK — CI/CD con DeepSeek

```bash
# Correr el harness headless con DeepSeek
DEEPSEEK_API_KEY=sk-... node api/server/services/AgentRuntime/HeadlessSDK.js \
  "add unit tests for the auth module" \
  --model deepseek-v3 \
  --max-turns 15 \
  --json > result.json

# Output JSON:
# { "success": true, "turns": 8, "result": "...", "trace": [...], "cost": { "tokens": 12400 } }
```

---

## 8. API REST — `/api/harness` (Harness Engine)

Montada en `api/server/routes/harness` (ver AGENTS.md §HarnessEngine):

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/scaffold` | Scaffold agent con DeepSeek |
| POST | `/pre-llm` | Inject reminders + compact context |
| POST | `/post-tool` | Normalize result + update state |
| POST | `/should-stop` | Evaluar si el loop debe parar |
| POST | `/run-command` | Shell en sandbox |
| POST | `/checkpoint` | Persistir estado de sesión |
| GET | `/status` | Harness health + model info |

---

## 9. Gate de Face 14

| Criterio | Estado |
|----------|--------|
| DeepSeek adapter OpenAI-compatible | ✓ |
| Soporte Ollama (local, sin API key) + DeepSeek API (cloud) | ✓ |
| CoT parser <think> tags para observabilidad | ✓ |
| HarnessEngine two-phase (scaffold + runtime) con DeepSeek | ✓ |
| CompactionManager optimizado para 128K context | ✓ |
| DEEPSEEK_HARNESS benchmark config (niveles 1-10) | ✓ |
| HeadlessSDK para CI/CD headless | ✓ |
| README: setup DeepSeek (Ollama + API key) | ✓ |
| .env.example: DEEPSEEK_API_KEY + OLLAMA_BASE_URL | ✓ |
| Feature flag HARNESS_ENGINE_ENABLED=true | ✓ |
| Observabilidad: trace de tokens/model/tools por sesión | ✓ |
| AgentReplay: replay de sesiones para debugging | ✓ |
| API REST `/api/harness` | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
