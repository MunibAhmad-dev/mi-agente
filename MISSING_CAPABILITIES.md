# MISSING_CAPABILITIES.md — Capacidades faltantes (priorizadas)

> PHASE 0 (Discovery). Ordenadas por valor/impacto y por dependencia entre fases.
> Regla aplicada: NO duplicar lo que ya existe (se reutilizará
> WorkflowEngine, EventBus, providers de modelos locales, etc.).

## Prioridad 1 — Contexto e inteligencia (mayor impacto en calidad)

1. **Context Intelligence Engine**: pipeline tarea → análisis → recuperación
   (vector + BM25 + graph) → ranking → dedup → compresión → presupuesto de
   tokens → LLM. Reutiliza `EventBus` y la capa de tools; NO enviar el repo
   completo al LLM.
2. **Project Brain v1**: índice de símbolos/archivos/dependencias del proyecto
   (extracción ligera propia + BM25; evaluar Tree-sitter/SCIP solo si aporta).
3. **Agent memory por capas**: working/short/long con importancia + dedup +
   compresión + recuperación por relevancia (reutilizar el CRUD de Memorias).

## Prioridad 2 — Ejecución y control

4. **Tool Router centralizado**: registry de tools con permisos por rol,
   validación de entrada, timeout, retry, logging y métricas por tool
   (integra el catálogo actual de mi-opencode + tools MCP + tools de agente).
5. **Workflow Engine → producto**: exponer en UI (crear/editar workflow con
   pasos y dependencias), persistencia MongoDB, checkpoints/resume entre
   reinicios, sub-workflows. Reutilizar `WorkflowEngine` existente.
6. **Model routing**: ruteo por complejidad/tipo de tarea/coste con fallback y
   override manual del usuario (el selector actual se mantiene).

## Prioridad 3 — Calidad y seguridad

7. **Auditor**: análisis estático (AST-grep), detección de secretos (Gitleaks
   o equivalente ligero), análisis de dependencias (OSV API), análisis de
   licencias (script sobre package-lock + licencias conocidas) → informe por
   proyecto/ejecución.
8. **Policy Engine ligero**: reglas "puede/no puede" por herramienta/archivo/
   red para agentes, separadas del core (sin OPA si un JSON de reglas basta).
9. **Token economy**: medir input/output/cached/retrieved/compressed por tarea
   y por agente; presupuesto configurable.

## Prioridad 4 — Infraestructura

10. **ComputeProvider**: abstracción Local/Docker (ejecución de tareas pesadas
    aisladas) — solo los adapters realmente necesarios; K8s solo si se pide.
11. **Observabilidad de ejecuciones**: reconstruir una ejecución completa
    (qué tool, cuánto tardó, tokens, qué workflow, qué paso falló).

## Lo que NO se hará sin justificación

- Temporal/Argo/Kestra/Flyte (WorkflowEngine propio ya cubre DAG+retries;
  se integraría un adapter solo si se necesitan checkpoints distribuidos).
- OPA completo (un policy engine JSON es suficiente al inicio).
- GraphRAG/LadybugDB/Graphify (evaluar tras Project Brain v1 con datos reales).
- Mem0/Letta (si el pipeline de memorias propio no cubre, se evaluarían como
  adapters bajo una misma interfaz `MemoryProvider`).

## Decisiones de arquitectura tomadas (PHASE 0)

| Componente | Decisión | Razón |
|---|---|---|
| Workflow | Reutilizar `WorkflowEngine` existente | Ya tiene pasos, dependsOn, retries, cancelación |
| Tools | Registry propio sobre el catálogo actual | Evita depender de una sola fuente; se conecta a mi-opencode + MCP |
| Memoria | Interfaz `MemoryProvider` + implementación propia | Permite cambiar a Mem0/Letta sin reescribir el core |
| Contexto | Motor propio (BM25 + embeddings opcionales) | Sin dependencias pesadas; reemplazable |
| Compute | `ComputeProvider` con adapters Local/Docker | No acoplar el core a un runtime |
