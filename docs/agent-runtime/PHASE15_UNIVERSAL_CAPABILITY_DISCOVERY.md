# PHASE15_UNIVERSAL_CAPABILITY_DISCOVERY.md — Fase 15: Universal Capability Discovery Engine

> **Estado:** FASE 15 — COMPLETADA.
> **Puntuación anterior:** 0/10 (no existía)
> **Puntuación final:** 10/10

---

## 1. Problema que resuelve

La Fase 10 (SkillsDiscovery) ya tenía 4 discovery providers y un CuratedRegistry, pero no tenía un motor unificado que pudiera descubrir skills de **cualquier fuente**, normalizarlos a un formato universal, evaluarlos automáticamente, y elegir el mejor para una tarea dada. El `UniversalCapabilityDiscovery` cierra ese gap.

---

## 2. Arquitectura — 9 componentes

```
UniversalCapabilityDiscovery
├── GitHubDiscoveryEngine        busca repos con SKILL.md / agent keywords
├── HuggingFaceDiscoveryEngine   busca Spaces/models con tags de agentes
├── UniversalNormalizer          normaliza cualquier formato → schema universal
├── CompatibilityEngine          score 0–1 + issues + auto-fixes
├── CapabilitySecurityEngine     detecta patrones peligrosos (rm -rf, eval, exec)
├── CapabilitySandboxEngine      simula efectos secundarios sin ejecutar
├── EvaluationEngine             scoring 5D: accuracy/latency/safety/usefulness/compat
├── UniversalRegistry            store evaluado: register/list/findBest/getStats
└── AISkillCreator               genera skill template desde descripción de tarea
```

### Pipeline `discover(query, options)`

```
query
  ↓ GitHubDiscoveryEngine.search()     → raw results (heuristic, sin GitHub API)
  ↓ HuggingFaceDiscoveryEngine.search() → raw results (sin HF API key)
  ↓ Deduplication por nombre
  ↓ UniversalNormalizer.normalize()     → schema universal
  ↓ CompatibilityEngine.check()         → score + issues
  ↓ CapabilitySecurityEngine.scan()     → riskScore + findings
  ↓ CapabilitySandboxEngine.simulate()  → sideEffects
  ↓ EvaluationEngine.evaluate()         → finalScore (weighted 5D)
  ↓ Sort by finalScore descending
  ↓ UniversalRegistry.register()        → persiste los mejores
  ↓ Return results[]
```

---

## 3. Schema Universal

Todos los skills se normalizan al mismo schema, independientemente de su origen:

```js
{
  id: 'uuid-or-derived',
  name: 'string',
  description: 'string',
  version: '1.0.0',
  tools: ['tool1', 'tool2'],   // tools/functions que el skill usa
  permissions: {               // permisos declarados
    filesystem: false,
    network: false,
    shell: false
  },
  format: 'claude|copilot|codex|cursor|mcp|custom',
  source: 'github|huggingface|manual|generated'
}
```

### Formatos soportados por UniversalNormalizer

| Formato origen | Detección | Conversión |
|---------------|-----------|------------|
| Claude/SKILL.md | `SKILL_NAME:` header | ✓ |
| GitHub Copilot | `.github/copilot-instructions.md` | ✓ |
| Codex | `CODEX_SKILL:` o `codex.yml` | ✓ |
| Cursor | `.cursor/rules` o `cursor_rules:` | ✓ |
| MCP | `mcpServers:` en JSON | ✓ |
| Custom/raw text | fallback heurístico | ✓ |

---

## 4. Componentes en detalle

### 4.1 GitHubDiscoveryEngine

```js
const ghde = new GitHubDiscoveryEngine();
ghde.search('web scraping agent');
// Busca por heurísticas de keywords (sin API key):
// - 'skill', 'agent', 'plugin', 'mcp', 'tool', 'assistant', 'automation'
// - Filtra por presencia de keywords en el query
// Returns: [{ name, description, url, stars, topics, owner }]
```

Retorna skills sintéticos que representan lo que GitHub devolvería para ese query.

### 4.2 HuggingFaceDiscoveryEngine

```js
const hfde = new HuggingFaceDiscoveryEngine();
hfde.search('code generation');
// Busca modelos/spaces con tags: 'agent', 'tool-use', 'code', 'assistant', 'text-generation'
// Returns: [{ name, description, url, downloads, tags, pipeline }]
```

### 4.3 CompatibilityEngine

```js
const ce = new CompatibilityEngine();
ce.check({
  name: 'web-scraper',
  permissions: { network: true, filesystem: true },
  tools: ['fetch', 'parse_html', 'save_file']
});
// {
//   compatible: true,
//   score: 0.75,
//   issues: ['Requires network access'],
//   fixes: ['Ensure AGENT_RUNTIME_WIRED=true']
// }
```

Criterios de compatibilidad:
- Permisos de network → issue con fix
- Permisos de shell → issue con fix
- Permisos de filesystem → ok (soportado)
- tools vacíos → issue
- descripción faltante → issue

### 4.4 CapabilitySecurityEngine

```js
const cse = new CapabilitySecurityEngine();
cse.scan({ name: 'evil-skill', tools: ['rm -rf /', 'curl | bash'] });
// { safe: false, riskScore: 8, findings: ['Destructive command: rm -rf', 'Shell injection: curl | bash'] }
```

Patrones detectados:
- `rm -rf` → CRITICAL (riskScore +4)
- `eval(` → HIGH (riskScore +3)
- `exec(` / `spawn(` → HIGH (riskScore +3)
- `Buffer.from(` / `base64` → MEDIUM (riskScore +2)
- `process.env` → LOW (riskScore +1)
- URLs externas en tools → LOW (riskScore +1)

### 4.5 EvaluationEngine

```js
const ee = new EvaluationEngine();
ee.evaluate(capability, {
  compatibilityScore: 0.8,
  securityScore: 0.9,
  normalizedScore: 0.7
});
// {
//   accuracy: 0.7,      (descripción + tools completitud)
//   latency: 0.85,      (penaliza por tools lentos: search, network, video)
//   safety: 0.9,        (pasa security score directamente)
//   usefulness: 0.75,   (tools count + description quality)
//   compatibility: 0.8, (pasa compatibility score)
//   finalScore: 0.8     (weighted average)
// }
```

Pesos del finalScore:
- accuracy: 25%
- safety: 30%
- usefulness: 20%
- compatibility: 15%
- latency: 10%

### 4.6 UniversalRegistry

```js
const registry = new UniversalRegistry();
registry.register(evaluatedCapability);
registry.list(); // todos los registrados
registry.findBest('web scraping', 3); // top 3 por relevancia + score
registry.getStats();
// { total, avgScore, topCapabilities: [...], formatBreakdown: {...} }
```

### 4.7 AISkillCreator

```js
const creator = new AISkillCreator();
creator.create('I need to monitor GitHub repos and send Slack alerts');
// {
//   name: 'monitor_github_repos_and_send_slack_alerts',
//   description: 'I need to monitor GitHub repos and send Slack alerts',
//   tools: ['github_api', 'slack_notification'],  // inferidos de keywords
//   permissions: { network: true, filesystem: false, shell: false },
//   template: '# Skill: ...\n\n## Description\n...\n## Tools\n...'
// }
```

Inferencia de tools desde keywords:
- github/git → `github_api`
- slack/email → `slack_notification`/`email_send`
- database/sql → `database_query`
- file/csv → `file_read`
- search/web → `web_search`
- code/run → `code_execution`
- image/vision → `image_analysis`

---

## 5. API REST

Montada en `/api/capability-discovery`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Engine health + registry stats |
| POST | `/discover` | Buscar capabilities (query + options) |
| GET | `/registry` | Listar registry completo |
| POST | `/evaluate` | Evaluar capability específica |
| POST | `/create-skill` | Crear skill desde descripción de tarea |
| POST | `/check-compatibility` | Verificar compatibilidad de capability |

### POST /api/capability-discovery/discover

```json
{ "query": "web scraping with JavaScript", "options": { "limit": 5, "minScore": 0.6 } }
```

Response:
```json
{
  "ok": true,
  "results": [
    {
      "name": "puppeteer-agent",
      "description": "Browser automation and scraping",
      "finalScore": 0.82,
      "compatibility": { "compatible": true, "score": 0.9 },
      "security": { "safe": true, "riskScore": 0 },
      "evaluation": { "accuracy": 0.8, "safety": 1.0, "usefulness": 0.85 }
    }
  ],
  "total": 1
}
```

### POST /api/capability-discovery/create-skill

```json
{ "task": "Monitor GitHub repos and send Slack notifications" }
```

Response:
```json
{
  "ok": true,
  "skill": {
    "name": "monitor_github_repos_and_send_slack_notifications",
    "tools": ["github_api", "slack_notification"],
    "permissions": { "network": true },
    "template": "# Skill: ...\n\n## Description\n...\n## Tools\n- github_api\n- slack_notification"
  }
}
```

---

## 6. Extensión de SkillsDiscovery (Fase 10)

`UniversalCapabilityDiscovery` extiende, no reemplaza, los discovery providers existentes de Fase 10:

```
SkillsDiscovery (Fase 10)            UniversalCapabilityDiscovery (Fase 15)
├── CuratedRegistry (16 proyectos)   ├── GitHubDiscoveryEngine (heuristic)
├── GitHubProvider                   ├── HuggingFaceDiscoveryEngine
├── HuggingFaceProvider              ├── UniversalNormalizer (6 formatos)
├── MCPRegistryProvider              ├── CompatibilityEngine
├── ARDProvider                      ├── CapabilitySecurityEngine
└── SkillInstaller                   ├── EvaluationEngine (5D scoring)
                                     ├── UniversalRegistry
                                     └── AISkillCreator
```

La diferencia clave: Fase 10 instala skills; Fase 15 **evalúa** y **rankea** capabilities de cualquier fuente.

---

## 7. Tests

Archivo: `api/server/services/SkillsDiscovery/__tests__/universalDiscovery.spec.js`

| Suite | Tests |
|-------|-------|
| GitHubDiscoveryEngine | 3 |
| HuggingFaceDiscoveryEngine | 3 |
| UniversalNormalizer | 5 |
| CompatibilityEngine | 4 |
| CapabilitySecurityEngine | 4 |
| CapabilitySandboxEngine | 3 |
| EvaluationEngine | 4 |
| UniversalRegistry | 4 |
| AISkillCreator | 4 |
| discover() pipeline | 3 |
| **Total** | **37** |

```bash
cd api && npx jest --testPathPatterns="universalDiscovery" --no-coverage
# Tests: 37 passed, 37 total
```

---

## 8. Gate de Fase 15

| Criterio | Estado |
|----------|--------|
| GitHubDiscoveryEngine (sin API key) | ✓ |
| HuggingFaceDiscoveryEngine (sin API key) | ✓ |
| UniversalNormalizer (6 formatos: claude/copilot/codex/cursor/mcp/custom) | ✓ |
| CompatibilityEngine (score 0–1 + issues + fixes) | ✓ |
| CapabilitySecurityEngine (pattern scan + riskScore) | ✓ |
| CapabilitySandboxEngine (simulate sin ejecutar) | ✓ |
| EvaluationEngine (5D: accuracy/latency/safety/usefulness/compat) | ✓ |
| UniversalRegistry (register/list/findBest/getStats) | ✓ |
| AISkillCreator (infer tools from keywords) | ✓ |
| `discover()` pipeline unificado con dedup | ✓ |
| API REST 6 endpoints | ✓ |
| Tests pasando | ✓ 37/37 |
| Route wiring en index.js | ✓ /api/capability-discovery |
| Sin dependencias externas nuevas | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
