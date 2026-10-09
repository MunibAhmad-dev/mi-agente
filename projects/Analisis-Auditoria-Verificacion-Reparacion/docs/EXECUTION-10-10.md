# EXECUTION-10-10 — How to carry this project to 10/10

## Principles
1. **EVIDENCE > CLAIM.** Builder/LLM claims are never evidence. Only artifacts with provenance: tool, version, exit code, SHA-256, timestamp.
2. Local-first, offline-capable, low memory, bounded concurrency, incremental, cacheable, adapter-based. No Kubernetes / Kafka / mandatory cloud.
3. Licensing: MIT / Apache-2.0 / BSD / ISC by default. Every tool registered with name, repository, version, license, SPDX, transitive-license-risk, runtime-cost, security-risk, capabilities.
4. Never delete working functionality to simplify integration. Inspect Mi Agente before changing it (spec §94).
5. The engine must pass its own acceptance test (§95 fixtures) before certifying anything else.

## Engineering standards
- Go ≥ 1.24, stdlib-first. Single third-party dep: pure-Go SQLite driver (MIT) for the evidence store.
- `go vet` clean, `go test ./...` green, deterministic and reproducible runs.
- Concurrency always bounded (worker pools / semaphores). No unbounded goroutine launches.
- Evidence schema versioned (`evidence.v1`). All artifacts SHA-256 hashed, evidence append-only JSONL.

## Definition of Done per deliverable
- DoD-E1: code compiles (`go build ./...`)
- DoD-E2: unit tests pass (`go test ./...`)
- DoD-E3: `go vet` clean
- DoD-E4: a fixture proves the rule/detector fires (spec §95)
- DoD-E5: rule documented with severity, confidence and CWE mapping

## Review checklist before any change lands
- [ ] No placeholders (`panic("not implemented")`, `panic("TODO")`) — rule R0100 blocks the gate.
- [ ] New code is tested with a fixture that proves detection works.
- [ ] New external tools registered in the tool registry with license/SPDX.
- [ ] No GPL/LGPL/AGPL/MPL/SSPL/BSL/Elastic/Commons Clause dependencies introduced.
- [ ] Maturity gates by category (spec §9): RUNTIME_VERIFIED for API/route/DB/event; ADVERSARIALLY_VERIFIED for security properties; PRODUCTION_VERIFIED for production-critical.
- [ ] Overall verdict PASS only when: zero failure-severity findings + no mandatory verification missing + gate thresholds met.

## 10/10 milestones
- [x] Fase 00: docs, licensing policy, tool registry
- [x] Fase 01: core Go (evidence, maturity L0–L8, adapters, evidence store)
- [x] Fase 02: truth model + requirements + traceability matrix
- [x] Fase 03: parsing + placeholders + dead code detection
- [x] Fase 04: static + dynamic verification (go test -json adapter)
- [x] Fase 05: contracts + runtime probes
- [x] Fase 06: adversarial + security + resilience
- [x] Fase 07: performance + regression + repair + quality gate
- [x] Fase 08: §95 fixture acceptance suite — ALL green
- [x] Fase 09: dogfooding self-certification — gate PASS (see docs/certification/)
  - Run decision: PASS · 82 evidence items · max severity MEDIUM · exit 0
  - All acceptance fixtures of docs/ACCEPTANCE-95.md proven by automated tests

## Traceability states (exact set)
`VERIFIED`, `PARTIAL`, `MISSING`, `BROKEN`, `UNCONNECTED`, `UNKNOWN`

## Maturity levels (exact set)
`L0 NOT_FOUND` · `L1 DECLARED` · `L2 SCAFFOLDED` · `L3 PARTIAL` · `L4 IMPLEMENTED` · `L5 INTEGRATED` · `L6 RUNTIME_VERIFIED` · `L7 ADVERSARIALLY_VERIFIED` · `L8 PRODUCTION_VERIFIED`

## Final certification workflow (the loop)
ANALYZE → PLAN → IMPLEMENT → VERIFY → AUDIT → TRY-TO-BREAK → DIAGNOSE → REPAIR → REGRESSION → RE-VERIFY → RE-AUDIT → CERTIFY

## Anti-patterns that block 10/10
- "It compiles therefore done" — blocked by contract/wiring checks.
- "Tests pass" without fixture-proven rules — blocked by §95 acceptance.
- LLM says "done" — never evidence.
- Unbounded concurrency or unregistered tools.
- Evidence without SHA-256 + tool metadata.
- Certificate issued without a full pipeline run + verdict PASS.
- The system must verify REALITY, not the builder's claim about reality.
