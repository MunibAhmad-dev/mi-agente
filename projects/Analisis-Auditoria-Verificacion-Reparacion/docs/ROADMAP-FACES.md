# ROADMAP-FACES (Fases) — Autonomous Software Verification, Audit, Adversarial Testing & Self-Repair Engine

Invariant: **EVIDENCE > CLAIM** · NO EVIDENCE = NO VERIFIED IMPLEMENTATION

Branch: `Analisis-Auditoria-Verificacion-Reparacion` (orphan; contains ONLY engine code and docs, nothing pulled from main or other branches).

---

## Fase 00 — Fundamentos, licencias y decisiones
- Architecture decisions, licensing policy (MIT / Apache-2.0 / BSD-2 / BSD-3 / ISC by default; GPL/LGPL/AGPL/MPL/SSPL/BSL/Elastic/Commons Clause prohibited without explicit review).
- Tool registry: every tool with `name, repository, version, license, SPDX, transitive-license-risk, runtime-cost, security-risk, capabilities`.
- Local-first policy: SQLite evidence store, filesystem artifacts, CLI, optional containers. No Kubernetes / Kafka / cloud as requirements.
- **Exit:** docs complete, registry implemented, license policy enforced in gate.

## Fase 01 — Núcleo Go
- Core types: evidence, severity, confidence, maturity L0–L8, ToolAdapter interface, resource profile.
- Evidence store: SQLite (pure-Go driver, MIT) + append-only `evidence.jsonl`; SHA-256 hashing; reproducibility metadata (tool, version, exit code, timestamp).
- **Exit:** `go vet` clean, unit tests green.

## Fase 02 — Truth Model + Requirements + Traceability
- ProjectTruthModel: requirements, features, components, modules, functions, classes, routes, APIs, events, queues, services, databases, schemas, migrations, providers, env vars, dependencies, tests, E2E flows, security/performance properties, agent capabilities & tool permissions.
- Requirement Engine: USER_DEFINED, SYSTEM_DERIVED, TECHNICAL, SECURITY, PERFORMANCE, RELIABILITY, COMPATIBILITY, OPERATIONAL; each requirement with verifiable acceptance criteria.
- Traceability matrix Requirement→Design→Component→Code→API→Data→Test→Runtime→Evidence plus reverse traceability (untraceable code, feature drift, dead code). States: VERIFIED / PARTIAL / MISSING / BROKEN / UNCONNECTED / UNKNOWN.
- **Exit:** matrix generated from a fixture project and asserted in tests.

## Fase 03 — Parsing, análisis estructural, placeholders, dead code
- tree-sitter based multi-language parsing (Go/Python/JS/TS), MIT-licensed tooling.
- ast-grep style structural rules; rule R0100 placeholder detection; dead code candidates (no inbound references).
- **Exit:** placeholder + dead-code detection proven on fixtures.

## Fase 04 — Verificación estática y dinámica
- Adapter pattern for external tools (core never couples to a tool). MVP adapters: `go test -json`, `go vet`. Recipe stubs (detect-gated) for ruff, ty, pytest, coverage.py, gosec, cargo-deny, infer, openapi-diff, pact, asyncapi, goose, dbmate, fast-check, playwright, reg-suit, lighthouse, restler-fuzzer, stryker-js, porcupine, z3, cbmc, lean4, osv-scanner, grype, syft, detect-secrets, KICS, ZAP, podman, wasmtime, hyperfine, litmus, promptfoo, inspect_ai.
- **Exit:** fixture with failing test classified BROKEN with evidence.

## Fase 05 — Contracts + runtime probes
- Contract Engine: OpenAPI operationId cross-checks; route wiring (router ↔ handlers ↔ contract); event/queue contract field checks; DB schema/migration sync checks.
- Runtime probes (offline, stdlib-only): TCP probe, HTTP probe. Bounded concurrency (≤8).
- **Exit:** unconnected API fixture detected; broken event contract fixture detected.

## Fase 06 — Adversarial, security, resilience
- Adversarial scenarios S1–S7: truthfulness, placeholder, untraceable code, resilience, self-repair, evaluation, drift; findings mapped to CWE/OSV.
- Security engine: secrets detection, dangerous patterns, dependency audit adapters (osv-scanner/grype/syft), IaC (KICS), DAST (ZAP) as adapters.
- Resilience: latency injection config, cancelation, backpressure, backup/restore verification, resource limits, retry policies.
- **Exit:** secret fixture, vulnerability fixture and injection fixture all detected.

## Fase 07 — Performance, regression, repair, certification
- Performance: budgets file + measured values + delta vs baseline (`goldens/baseline.json`).
- Regression engine: baseline of statuses per requirement/feature/component; new failures = regressions.
- Repair engine: annotation/report repairs in MVP (placeholder→scaffold annotation, missing test stub); code rewrites behind explicit flag.
- Quality Gate: PASS / FAIL / INCONCLUSIVE with machine-readable verdict.
- **Exit:** perf-regression fixture and regression fixture detected; verdict.json emitted.

## Fase 08 — Autoverificación del motor (§95)
- The engine must detect/classify/evidence/diagnose every deliberately broken fixture: fake implementation, fake success, placeholder, dead feature, unconnected API, broken DB, broken migration, broken event contract, state inconsistency, regression, flaky test, weak tests, security vulnerability, secret, dependency vulnerability, performance regression, concurrency bug, agent loop, tool permission violation, prompt injection, provider fallback failure, configuration mismatch.
- **Exit:** all fixture acceptance tests green — the engine passes its own acceptance test.

## Fase 09 — Integración con Mi Agente + certificación
- Integrate into Mi Agente's existing orchestration (reuse, never duplicate; spec §94 inspect-first rule). Baseline verification before any change to Mi Agente code.
- Full pipeline run: STATIC → RUNTIME → SEMANTIC → CONTRACTS → TESTS → ADVERSARIAL → SECURITY → RESILIENCE → REGRESSION → RE-VERIFICATION → FINAL AUDIT → GATE → CERTIFICATE (or back to REPAIR).
- **Exit:** engine certifies itself on its own repo (dogfooding) + all §95 fixtures.

---

## Governance
- Every run produces: `evidence.jsonl` + `reports/verdict.json` + `reports/traceability.md` + `reports/certificate.md`.
- Every phase exit criterion is itself verified with the engine (EVIDENCE > CLAIM).
- Builder claims are never evidence. Only artifacts produced by adapters/tools/probes with hashes.
