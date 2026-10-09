# TECHNOLOGY_STACK_PLAN.md — Pila tecnológica del Agent Runtime

> Fase 0. Derivado de los 3 documentos del usuario. Principio rector:
> **minimalismo** — SQLite + filesystem + procesos bajo demanda.
> Se prohíbe infraestructura pesada (Redis extra, Neo4j, K8s, Kafka,
> Elasticsearch, múltiples vector DBs) salvo justificación demostrada.

## Pila elegida (alineada a los docs del usuario)

| Capa | Tecnología | Decisión | Reutilización |
|---|---|---|---|
| LLM principal | DeepSeek V4-Flash local | ⭐⭐⭐⭐⭐ | vía `@librechat/agents` (OpenAI-compatible) |
| Agent Runtime | LibreChat core (existente) | ⭐⭐⭐⭐⭐ | consolidar 3 capas |
| Arquitectura de referencia | OpenCode | ⭐⭐⭐⭐⭐ | estudio (no dependencia) |
| Agent ideas | Goose | ⭐⭐⭐⭐ | estudio |
| Coding patterns | Aider | ⭐⭐⭐⭐ | estudio |
| Autonomous SWE | SWE-agent | ⭐⭐⭐⭐ | estudio |
| Advanced agent ref | OpenHands SDK | ⭐⭐⭐⭐ | estudio |
| AST | Tree-sitter | ⭐⭐⭐⭐⭐ | **instalar** (MISSING) |
| Structural search | ast-grep | ⭐⭐⭐⭐⭐ | **instalar** (MISSING) |
| LSP | typescript-language-server | ⭐⭐⭐⭐⭐ | **instalar** (MISSING) |
| Code Graph | implementación propia (+ ref Sense) | ⭐⭐⭐⭐⭐ | construir |
| Text search | ripgrep | ⭐⭐⭐⭐⭐ | **ya en `@librechat/agents`** (activar) |
| Database | SQLite | ⭐⭐⭐⭐⭐ | **instalar** (MISSING) |
| Full-text search | SQLite FTS5 | ⭐⭐⭐⭐⭐ | **instalar** (MISSING) |
| MCP | MCP Python SDK (existente) + MCP Gateway propio | ⭐⭐⭐⭐⭐ | activar `MCPRuntime/` |
| Sandbox | `SandboxManager.js` + Docker (existente) | ⭐⭐⭐⭐⭐ | reutilizar |
| Agent Firewall | propio sobre `PermissionService` (existente) | ⭐⭐⭐⭐⭐ | adaptar |
| Memory | SQLite + filesystem + `MemoryEntry` (existente) | ⭐⭐⭐⭐⭐ | ampliar capas |
| Observability | OpenTelemetry + SQLite | ⭐⭐⭐⭐⭐ | ampliar |
| Replay | propio | ⭐⭐⭐⭐⭐ | construir |
| Risk Engine | propio | ⭐⭐⭐⭐⭐ | construir |
| Blast Radius | propio + Git + graph | ⭐⭐⭐⭐⭐ | construir |
| Model Router | propio (capability registry) | ⭐⭐⭐⭐⭐ | construir |
| Verification | native tools + test runners | ⭐⭐⭐⭐⭐ | construir |
| Repair Engine | propio | ⭐⭐⭐⭐⭐ | construir |
| Git intelligence | libgit2 (`simple-git`) | ⭐⭐⭐⭐⭐ | **instalar** (MISSING) |

## Lo que NO se introduce (minimalismo)
❌ Elasticsearch · ❌ Redis extra · ❌ Kubernetes · ❌ Kafka · ❌ Neo4j ·
❌ vector DB pesada · ❌ múltiples runtimes de agentes · ❌ múltiples
LLM simultáneos permanentes · ❌ servicios cloud obligatorios.

## Principio de búsqueda híbrida (doc §13/§10)
No resolver todo con embeddings. Para código, las relaciones
estructurales suelen ser más útiles que la búsqueda semántica pura.

```
QUERY → Keyword(FTS5) + Structural(AST/LSP) + Symbol(graph)
      + Dependency(graph) + Semantic(sole donde aporte) → Ranking → Contexto
```

## Regla de instalación de dependencias
Antes de instalar (regla §2 del prompt), responder:
1. ¿Existe ya? 2. ¿Parcialmente? 3. ¿Con otro nombre? 4. ¿Como stub?

Solo instalar tras demostrar que no hay reutilizable. En Fase 0 no se
instala nada. Las instalaciones (Tree-sitter, ast-grep, LSP, SQLite,
simple-git) se evalúan en sus fases respectivas con license audit
previo (prioridad MIT/Apache-2.0/BSD).

## Almacenamiento del índice del proyecto (doc §6)
```
.ai/
├── project.json
├── architecture.json
├── dependencies.json
├── symbols.json
├── tests.json
├── conventions.json
├── git-state.json
├── knowledge-graph.db      ← SQLite + FTS5
├── tasks/
├── sessions/
├── artifacts/
└── memory/
```
Índice incremental: si cambia un archivo, no se reindexa todo el proyecto.
