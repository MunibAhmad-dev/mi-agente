# Verification Engine — Autonomous Software Verification, Audit, Adversarial Testing & Self-Repair Engine

Motor universal de verificación para supervisar a una IA que desarrolla software.

**Invariante fundamental:**

> EVIDENCE > CLAIM — NO EVIDENCE = NO VERIFIED IMPLEMENTATION

El motor jamás acepta como evidencia la afirmación de un builder/LLM. Solo acepta
artículos con procedencia: herramienta, versión, código de salida, hash SHA-256 y timestamp.

## Arquitectura (local-first, offline-capable, low-memory)

```
USER → CLI (cmd/verify) → PIPELINE
  ├─ PARSER (AST multi-lenguaje, tree-sitter-ready)
  ├─ RULES estáticas R0100–R0820 (placeholders, dead code, secretos, inyección…)
  ├─ ADAPTERS (go vet, go test -json; patrón ToolAdapter, nunca acoplado)
  ├─ CONTRACT ENGINE (OpenAPI, eventos, migraciones)
  ├─ RUNTIME PROBES (TCP/HTTP, concurrencia acotada ≤8)
  ├─ PERF (presupuestos + delta vs baseline)
  ├─ REGRESSION (baseline dorado)
  ├─ REPAIR (reparaciones seguras, nunca auto-implementa features)
  ├─ GATE (PASS / FAIL / INCONCLUSIVE)
  └─ REPORTS (verdict.json, traceability.md, certificate.md, evidence.jsonl)
```

## Uso

```bash
go build -o verify.exe ./cmd/verify
./verify.exe -root . -gate-max-severity MEDIUM
```

Códigos de salida: `0` PASS · `1` FAIL · `2` INCONCLUSIVE · `3` error de ejecución.

## Reglas estáticas

| Regla  | Detecta                                        | Severidad |
|--------|------------------------------------------------|-----------|
| R0100  | Placeholders / implementaciones falsas         | CRITICAL  |
| R0200  | Código muerto                                  | LOW       |
| R0300  | Rutas sin handler conectado                    | HIGH      |
| R0400  | Secretos en código                             | CRITICAL  |
| R0500  | Patrones peligrosos (eval, md5, TLS inseguro…) | MEDIUM    |
| R0600  | Tests débiles sin aserciones                   | MEDIUM    |
| R0700  | Riesgos de concurrencia                        | MEDIUM    |
| R0800  | Bucles de agente sin acotar                    | HIGH      |
| R0810  | Violación de permisos de herramientas IA       | CRITICAL  |
| R0820  | Sinks de prompt injection                      | HIGH      |

## Madurez (nunca `implemented=true`)

`L0 NOT_FOUND` · `L1 DECLARED` · `L2 SCAFFOLDED` · `L3 PARTIAL` · `L4 IMPLEMENTED`
`L5 INTEGRATED` · `L6 RUNTIME_VERIFIED` · `L7 ADVERSARIALLY_VERIFIED` · `L8 PRODUCTION_VERIFIED`

## Trazabilidad

Estados exactos: `VERIFIED | PARTIAL | MISSING | BROKEN | UNCONNECTED | UNKNOWN`.
Matriz Requirement→Component→Code→API→Data→Test→Runtime→Evidence + trazabilidad inversa
(código no trazable, feature drift, funcionalidad muerta).

## Licencias

Solo MIT / Apache-2.0 / BSD-2 / BSD-3 / ISC. GPL/LGPL/AGPL/MPL/SSPL/BSL/Elastic/Commons Clause
prohibidos sin revisión explícita. Registro completo en `internal/tools/registry.go`.

## Fases

Ver `docs/ROADMAP-FACES.md` (fases 00–09) y `docs/EXECUTION-10-10.md` (guía 10/10).
