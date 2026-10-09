# ACCEPTANCE-95 — The engine must detect every deliberately broken fixture

Spec §95: the implementation is NOT complete until the engine itself passes
deliberately broken fixtures. For every fixture the engine must **detect,
classify, produce evidence, generate diagnosis** (and, where configured,
repair and re-verify). Every row below is proven by an automated test in this repo.

| # | Fixture (spec §95)              | Detección (motor)                        | Evidencia generada                   | Test automatizado |
|---|---------------------------------|------------------------------------------|--------------------------------------|-------------------|
| 1 | Fake implementation             | R0100 placeholder (`panic("not implemented")`) | EvStaticAnalysis CRITICAL | `TestR0100Placeholder`, `TestPipelineEndToEndFailsOnBrokenFixture` |
| 2 | Fake success                    | gate: severidad > umbral fuerza FAIL aunque haya tests verdes | `verdict.decision=FAIL` | `TestGateBlocksOnSeverity` |
| 3 | Placeholder                     | R0100                                     | CRITICAL + CWE-1188                  | `TestR0100Placeholder` |
| 4 | Dead feature / dead code        | R0200 dead code (sin referencias entrantes) | LOW + report de reparación         | `TestR0200DeadCode`, `TestDeadCodeReportOnly` |
| 5 | Unconnected API                 | R0300 ruta sin handler; Contract OpenAPI  | HIGH                                 | `TestR0300UnconnectedRoute`, `TestOpenAPIDetectsUnconnectedRoute` |
| 6 | Broken database / schema sync   | Contract Engine sync migraciones↔schema   | MEDIUM/HIGH                          | `TestMigrationSyncMissingDown` |
| 7 | Broken migration                | Contract: sección up/down ausente         | HIGH                                 | `TestMigrationSyncMissingDown` |
| 8 | Broken event contract           | Contract: campo requerido no producido    | HIGH                                 | `TestEventContractMissingField` |
| 9 | State inconsistency             | go test -json falla → EvTestRun HIGH; baseline diff | EvTestRun/Regression       | `TestGoTestParsePassFailSkip`, `TestCompareDetectsRegressionAndRepair` |
| 10| Regression                      | Regression Engine vs baseline dorado      | CRITICAL                             | `TestCompareDetectsRegressionAndRepair` |
| 11| Flaky test                      | R0900 (sleep/rand dentro de tests)        | MEDIUM                               | `TestR0900FlakyTest` |
| 12| Weak test                       | R0600 test sin aserciones                 | MEDIUM + stub de reparación          | `TestR0600WeakTest`, `TestWeakTestGetsStub` |
| 13| Security vulnerability          | R0500 patrones peligrosos (CWE-295/327/338/78/95) | MEDIUM + CWE                | `TestR0500Dangerous` |
| 14| Secret                          | R0400 secretos (CWE-798/321)              | CRITICAL                             | `TestR0400Secrets` |
| 15| Dependency vulnerability        | Security Engine normaliza osv-scanner     | HIGH/CRITICAL + OSV id               | `TestNormalizeOSVScanner` |
| 16| Performance regression          | Perf budgets + delta vs baseline          | HIGH                                 | `TestBudgetViolation`, `TestDeltaRegressions` |
| 17| Concurrency bug                 | R0700 hazards (goroutines sin acotar)     | MEDIUM + CWE-366                     | cobertura en `TestPipeline*` |
| 18| Agent loop                      | R0800 bucle sin límite/budget/cancelación | HIGH + CWE-674                       | `TestR0800AgentLoop` |
| 19| Tool permission violation       | R0810 escritura fuera de permisos declarados | CRITICAL + CWE-250               | `TestR0810PermissionViolation` |
| 20| Prompt injection                | R0820 sink de input no confiable en prompt | HIGH + CWE-74                      | `TestR0820PromptInjection` |
| 21| Provider fallback failure       | Plan: aceptancia `probe:` no verificada ⇒ trace PARTIAL/MISSING ⇒ gate FAIL | TraceRow | `TestGateBlocksBrokenTrace`, `TestTraceMatrixStates` |
| 22| Configuration mismatch          | R0910 env var leída pero no declarada en .env.example | MEDIUM                   | `TestR0910ConfigMismatch` |

## Regla de oro

Ninguna fila de esta matriz se considera cubierta "porque el código existe".
Cada fila está cubierta **solo** por su test automatizado en verde
(`go test ./...`). Si un test se rompe, la certificación del motor queda
inválida hasta REPAIR → RETEST → RE-AUDIT.

## Ciclo completo (fin de fase 08)

DETECT + EXPLAIN (mensajes de evidencia) + REPRODUCE (fixtures en tests)
+ REPAIR (motor de reparación seguro) + RETEST + REGRESSION CHECK
+ ADVERSARIAL CHECK (R0800/R0810/R0820) + FINAL AUDIT (gate) + CERTIFICATION
(solo con gate PASS y evidencia completa).
