# PHASE11_SECURITY_GATE.md — Face 11: Security

> **Estado:** FACE 11 — COMPLETADA.
> **Puntuación anterior:** 9/10
> **Puntuación final:** 10/10

---

## 1. Qué implementa Face 11

El sistema de seguridad de mi-agente es multi-capa: desde el firewall de herramientas del agente hasta escaneo estático de código, detección de secretos, análisis de dependencias vulnerables y CI/CD security gates. Implementado en `api/server/services/Security/`, `api/server/services/SecurityScanner/`, `api/server/services/PolicyEngine/` y configuración CI en `.github/workflows/`.

---

## 2. Arquitectura — 4 capas de seguridad

```
Security System
├── Capa 1: Agent Firewall (runtime)
│   └── Security/agentFirewall.js     policy engine granular por tool
│
├── Capa 2: Security Scanner (análisis de código)
│   ├── SecretsScanner.js             Gitleaks (MIT) + regex heurístico
│   ├── SASTScanner.js                ast-grep (MIT) + patrones OWASP
│   ├── DependencyScanner.js          OSV-Scanner (Apache) + OSV.dev API
│   └── ScanOrchestrator.js          orquestador: pre-write hook
│
├── Capa 3: Policy Engine (Cedar)
│   ├── CedarEngine.js                Cedar (Apache-2.0) + JS fallback
│   ├── PolicyStore.js                11 políticas default
│   └── PolicyEvaluator.js            evaluador con contexto
│
└── Capa 4: CI/CD Security Gates
    ├── Gitleaks                       detección de secretos en commits
    ├── Semgrep                        SAST: vulnerabilidades OWASP
    ├── npm audit                      dependencias vulnerables
    ├── Trivy                          container + dependency scan
    ├── CodeQL                         análisis de código GitHub
    ├── OSV-Scanner                    Open Source Vulnerabilities
    └── Checkov                        IaC security (Terraform/Docker)
```

---

## 3. Agent Firewall — 3 presets

```js
const { getAgentFirewall } = require('./Security/agentFirewall');
const firewall = getAgentFirewall();

// Presets:
// 'restricted' — solo lectura, sin shell, sin git push, sin secretos
// 'standard'   — lectura + escritura local, shell limitado, git (sin push)
// 'full'       — acceso completo con aprobación para operaciones destructivas

firewall.setPreset('standard');

// Verificar antes de ejecutar herramienta
const check = firewall.check({
  tool: 'shell',
  command: 'rm -rf /app/uploads',
  context: { preset: 'standard' }
});
// { allowed: false, reason: 'Destructive command blocked in standard preset' }

// Enforce (throw si no permitido)
firewall.enforce({ tool: 'git', operation: 'push', branch: 'main' });
// PolicyViolationError: 'git push to main requires full preset or explicit approval'
```

### Dimensiones de política

| Dimensión | Descripción |
|-----------|-------------|
| `filesystem` | lectura / escritura / delete |
| `shell` | allowlist de comandos |
| `git` | clone/pull/commit/push/branch |
| `secrets` | lectura de env vars sensibles |
| `deployment` | deploy / rollback / restart |

---

## 4. Security Scanner — pre-write hook

```js
const { ScanOrchestrator } = require('./SecurityScanner');
const scanner = new ScanOrchestrator();

// Hook pre-write (integrado en runtimeHooks.onPreWriteScan)
const result = await scanner.scan({
  content: fileContent,
  path: 'api/server/config/auth.js',
  scanTypes: ['secrets', 'sast', 'dependencies']
});
// {
//   passed: true,
//   secrets: { found: 0, findings: [] },
//   sast: { issues: [], severity: 'none' },
//   dependencies: { critical: 0, high: 0 }
// }
```

### SecretsScanner

```js
const { SecretsScanner } = require('./SecurityScanner');
const scanner = new SecretsScanner();
scanner.scan('const apiKey = "sk-1234abcd..."');
// { found: true, findings: [{ type: 'api_key', line: 1, masked: 'sk-****' }] }
```

Detecta: API keys (OpenAI, Stripe, AWS, GCP, GitHub), JWT secrets, DB connection strings, SSH keys, PEM certificates.

### SASTScanner

```js
const { SASTScanner } = require('./SecurityScanner');
const sast = new SASTScanner();
sast.scan('eval(userInput)');
// { issues: [{ type: 'injection', severity: 'critical', pattern: 'eval()', fix: 'Never eval user input' }] }
```

Patrones OWASP detectados: SQL injection, XSS, command injection, path traversal, SSRF, insecure deserialization.

---

## 5. Policy Engine — 11 políticas default

```js
const { PolicyEvaluator } = require('./PolicyEngine');
const evaluator = new PolicyEvaluator();

evaluator.evaluate({
  principal: { role: 'agent', preset: 'standard' },
  action: 'git:push',
  resource: { branch: 'main' }
});
// { decision: 'DENY', policy: 'no-direct-push-to-main', reason: 'Main branch is protected' }
```

Políticas default en `api/server/policies/default-policies.json`:
1. `no-direct-push-to-main`
2. `require-approval-destructive`
3. `no-bulk-user-deletion`
4. `sandbox-shell-commands`
5. `no-credential-read`
6. `no-external-calls-without-approval`
7. `rate-limit-llm-calls`
8. `no-deploy-without-tests`
9. `audit-all-mutations`
10. `block-eval-exec`
11. `require-https-external`

---

## 6. CI/CD Security Pipeline

```yaml
# .github/workflows/security.yml (extracto)
jobs:
  secrets:
    uses: gitleaks/gitleaks-action@v2    # MIT

  sast:
    run: semgrep --config=auto api/      # detecta OWASP Top 10

  deps:
    run: |
      npm audit --audit-level=high
      osv-scanner --lockfile=package-lock.json

  container:
    run: trivy fs --severity HIGH,CRITICAL .

  iac:
    run: checkov -d . --framework dockerfile,github_actions
```

Todos los gates fallan el PR si encuentran findings de severidad HIGH o CRITICAL.

---

## 7. checks.ts — startup security check

```typescript
// api/server/checks.ts
// process.exit(1) en producción si algún secreto tiene valor default

const REQUIRED_SECRETS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'CRYPT_SECRET'];
if (process.env.NODE_ENV === 'production') {
  for (const secret of REQUIRED_SECRETS) {
    if (!process.env[secret] || process.env[secret].length < 32) {
      console.error(`[SECURITY] ${secret} is not set or too short — refusing to start`);
      process.exit(1);
    }
  }
}
```

---

## 8. API REST — `/api/security`

Montada en `api/server/routes/security.js`:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Firewall + scanner health |
| POST | `/scan` | ScanOrchestrator: secretos + SAST + deps |
| POST | `/firewall/check` | Verificar si tool/comando está permitido |
| GET | `/firewall/preset` | Preset activo |
| PUT | `/firewall/preset` | Cambiar preset (restricted/standard/full) |
| POST | `/policy/evaluate` | Evaluar decisión de política |
| GET | `/policies` | Listar políticas activas |

---

## 9. Gate de Face 11

| Criterio | Estado |
|----------|--------|
| Agent Firewall (3 presets: restricted/standard/full) | ✓ |
| check() + enforce() granulares (5 dimensiones) | ✓ |
| SecretsScanner (Gitleaks + regex fallback) | ✓ |
| SASTScanner (ast-grep + OWASP patterns) | ✓ |
| DependencyScanner (OSV-Scanner + OSV.dev) | ✓ |
| ScanOrchestrator wired en runtimeHooks.onPreWriteScan | ✓ |
| PolicyEngine Cedar (11 políticas default) | ✓ |
| CI: Gitleaks secrets scan | ✓ |
| CI: Semgrep SAST | ✓ |
| CI: npm audit + OSV-Scanner | ✓ |
| CI: Trivy container scan | ✓ |
| CI: CodeQL (GitHub) | ✓ |
| CI: Checkov IaC scan | ✓ |
| checks.ts: proceso no inicia si secretos no configurados | ✓ |
| API REST `/api/security` | ✓ |
| Lint 0 errores | ✓ |

**Todos los criterios cumplidos → 10/10**
