# 📊 Flujo Completo de Eventos - LibreChat

Este documento describe los flujos de eventos completos en el sistema.

---

## Flujo 1: Ejecución de Chat

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE EVENTOS: CHAT                                    │
└──────────────────────────────────────────────────────────────────────────────┘

Usuario → LibreChat (Frontend)
    │
    │ HTTP POST /api/chat
    │
    ▼
┌─────────────────────────────────────┐
│       ExecutionEngine               │
│  1. Recibe request                 │
│  2. Genera correlationId           │
│  3. Crea workflowId                │
└─────────────────┬───────────────────┘
                  │
                  │ 🔔 publish(EXECUTION_REQUESTED)
                  │
                  ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
│  ┌────────────────────────────────┐│
│  │ TOPICS:                         ││
│  │ - execution.*                   ││
│  │ - task.*                        ││
│  │ - workflow.*                    ││
│  │ - llm.*                         ││
│  │ - metrics.*                     ││
│  └────────────────────────────────┘│
└─────────────────┬───────────────────┘
                  │
       ┌──────────┼──────────┐
       │          │          │
       ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Task     │ │ Metrics  │ │ Audit    │
│ Planner  │ │ Service  │ │ Service  │
│          │ │          │ │          │
│ 🔔 subscribe            │ │ 🔔 subscribe
│ 🔔 subscribe           │ │          │
│ - execution.*          │ │ - *.*     │
│                       │ │          │
└──────────┘ └──────────┘ └──────────┘

Flujo del TaskPlanner:
┌─────────────────────────────────────┐
│         TaskPlanner                 │
│  1. Analiza intención              │
│  2. Descompone en tareas           │
│  3. Identifica dependencias        │
└─────────────────┬───────────────────┘
                  │
                  │ 🔔 publish(TASK_CREATED) x N
                  │
                  ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│       WorkflowEngine                 │
│  1. Recibe tareas planificadas     │
│  2. Crea workflow                 │
│  3. Inicia ejecución               │
└─────────────────┬───────────────────┘
                  │
                  │ 🔔 publish(WORKFLOW_STARTED)
                  │
                  ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      CapabilityRouter               │
│  1. Recibe eventos de tareas      │
│  2. Resuelve capacidades          │
│  3. Selecciona runtime            │
│  4. Selecciona provider            │
└─────────────────┬───────────────────┘
                  │
         ┌───────┴───────┐
         │               │
         ▼               ▼
┌──────────────┐ ┌──────────────┐
│   LLM        │ │   LLM        │
│   Runtime    │ │   Runtime    │
│   (Task 1)  │ │   (Task 2)   │
│              │ │              │
│ 🔔 publish  │ │ 🔔 publish   │
│ 🔔 publish  │ │ 🔔 publish   │
└──────────────┘ └──────────────┘
         │               │
         ▼               ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
│  🔔 LLM_REQUEST_STARTED (x2)       │
│  🔔 LLM_REQUEST_FINISHED (x2)      │
│  🔔 TASK_COMPLETED (x2)            │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      WorkflowEngine                 │
│  1. Recibe completions             │
│  2. Agrega resultados             │
│  3. Detecta workflow completo     │
└─────────────────┬───────────────────┘
                  │
                  │ 🔔 publish(WORKFLOW_COMPLETED)
                  │
                  ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      ExecutionEngine                 │
│  1. Recibe workflow completo      │
│  2. Compila respuesta              │
│  3. Retorna al cliente              │
└─────────────────────────────────────┘
```

---

## Flujo 2: Generación de Imagen

```
┌──────────────────────────────────────────────────────────────────────────────┐
│              FLUJO DE EVENTOS: GENERACIÓN DE IMAGEN                        │
└──────────────────────────────────────────────────────────────────────────────┘

Usuario → Chat Input → Generar Imagen
    │
    │ 🔔 publish(IMAGE_GENERATION_STARTED)
    │
    ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                  │
         ┌───────┴───────┐
         │               │
         ▼               ▼
┌──────────────┐ ┌──────────────┐
│   Media      │ │   Metrics    │
│   Runtime   │ │   Service    │
│              │ │              │
│ 1. Inicia   │ │ 🔔 subscribe │
│    job      │ │              │
│ 2. Conecta  │ │              │
│    ComfyUI  │ │              │
└──────┬───────┘ └──────────────┘
       │
       │ WebSocket: progress
       │
       ▼
┌─────────────────────────────────────┐
│       ComfyUI Server               │
│  1. Recibe workflow               │
│  2. Ejecuta generación            │
│  3. Reporta progreso              │
└──────────────┬──────────────────────┘
               │
               │ 🔔 publish(MEDIA_PROGRESS) x N
               │
               ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│      MediaRuntimeService             │
│  1. Recibe progreso                │
│  2. Re-emite evento               │
└─────────────────┬───────────────────┘
                   │
                   │ 🔔 publish(MEDIA_PROGRESS)
                   │
                   ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│      Frontend (Dashboard)           │
│  1. Recibe actualizaciones         │
│  2. Actualiza UI de progreso      │
└─────────────────────────────────────┘
                   │
                   │ Job completado
                   ▼
┌─────────────────────────────────────┐
│       ComfyUI Server               │
└──────────────┬──────────────────────┘
               │
               │ 🔔 publish(IMAGE_GENERATED)
               │
               ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│      MediaRuntimeService             │
│  1. Recibe resultado               │
│  2. Procesa imágenes              │
│  3. Publica evento final          │
└─────────────────┬───────────────────┘
                   │
                   │ 🔔 publish(IMAGE_GENERATED)
                   │
                   ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│      Frontend (Chat)               │
│  1. Recibe imágenes               │
│  2. Muestra en chat               │
└─────────────────────────────────────┘
```

---

## Flujo 3: Manejo de Errores y Retry

```
┌──────────────────────────────────────────────────────────────────────────────┐
│              FLUJO DE EVENTOS: ERROR Y REINTENTO                           │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│      LLM Runtime                    │
│  1. Ejecuta request                │
│  2. Error: timeout                 │
└─────────────────┬───────────────────┘
                  │
                  │ 🔔 publish(LLM_TIMEOUT)
                  │
                  ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
│  ┌────────────────────────────────┐│
│  │ Dead Letter Queue (DLQ)        ││
│  │ - Max retries exceeded         ││
│  │ - Non-retryable errors        ││
│  └────────────────────────────────┘│
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      Retry Handler                  │
│  1. Detecta retryable error       │
│  2. Incrementa retry count        │
│  3. Programa reintento            │
└─────────────────┬───────────────────┘
                  │
                  │ ⏰ Timer: exponential backoff
                  │
                  ▼
┌─────────────────────────────────────┐
│      LLM Runtime                    │
│  1. Reintenta request              │
│  2. Mismo provider                 │
│  ──── ó ────                       │
│  3. Nuevo provider (fallback)     │
└─────────────────┬───────────────────┘
                  │
                  │ 🔔 publish(LLM_RETRY)
                  │     ó
                  │ 🔔 publish(LLM_FALLBACK)
                  │
                  ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                  │
         ┌───────┴───────┐
         │               │
         ▼               ▼
┌──────────────┐ ┌──────────────┐
│   Metrics    │ │   Audit      │
│   Service   │ │   Service    │
│             │ │              │
│ Graba       │ │ Registra     │
│ retry count │ │ fallback      │
└──────────────┘ └──────────────┘

Si reintento exitoso:
┌─────────────────────────────────────┐
│            Event Bus                 │
│  🔔 LLM_REQUEST_FINISHED           │
│  🔔 TASK_COMPLETED                 │
└─────────────────────────────────────┘

Si reintentos agotados:
┌─────────────────────────────────────┐
│            Event Bus                 │
│  🔔 LLM_TIMEOUT                     │
│  🔔 TASK_FAILED                    │
│  🔔 WORKFLOW_FAILED               │
└─────────────────────────────────────┘
```

---

## Flujo 4: Provider Health Monitoring

```
┌──────────────────────────────────────────────────────────────────────────────┐
│           FLUJO DE EVENTOS: MONITOREO DE SALUD                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│      ProviderRegistry               │
│                                     │
│  ⏰ Health Check Timer (1 min)      │
│                                     │
│  Para cada provider:                │
│  ┌─────────────────────────────────┐│
│  │ 1. Ping provider API            ││
│  │ 2. Medir latency                ││
│  │ 3. Detectar errores              ││
│  └─────────────────────────────────┘│
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  ┌─────────────────────────────────┐│
│  │ ¿Provider Healthy?              ││
│  │ - Latency < threshold           ││
│  │ - Error rate < threshold        ││
│  └───────────┬─────────────────────┘│
│              │                     │
│         Sí    │    No              │
│              │    │               │
│              ▼    ▼               │
│    ┌──────────────┐   ┌──────────────┐│
│    │ publish      │   │ publish      ││
│    │ PROVIDER_    │   │ PROVIDER_    ││
│    │ HEALTHY     │   │ UNHEALTHY    ││
│    └──────┬───────┘   └──────┬───────┘│
│           │                   │        │
└───────────┼───────────────────┼────────┘
            │                   │
            ▼                   ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                  │
         ┌───────┴───────┐
         │               │
         ▼               ▼
┌──────────────┐ ┌──────────────┐
│   Metrics   │ │  Capability  │
│   Service   │ │  Router      │
│             │ │              │
│ Graba       │ │ Actualiza    │
│ metric      │ │ weights      │
│             │ │              │
└──────────────┘ └──────┬───────┘
                        │
                        ▼
              ┌──────────────┐
              │   Nuevos     │
              │   requests   │
              │   usan       │
              │   otro       │
              │   provider   │
              └──────────────┘

Si provider se recupera:
┌─────────────────────────────────────┐
│            Event Bus                 │
│  🔔 PROVIDER_RECOVERED              │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      CapabilityRouter               │
│  1. Recibe recuperación            │
│  2. Actualiza weights             │
│  3. Provider disponible           │
└─────────────────────────────────────┘
```

---

## Flujo 5: API-Key Management

```
┌──────────────────────────────────────────────────────────────────────────────┐
│           FLUJO DE EVENTOS: API-KEY MANAGEMENT                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│      IntelligentRouter              │
│                                     │
│  1. Recibe request LLM             │
│  2. Solicita API key              │
└─────────────────┬───────────────────┘
                  │
                  │ 🔔 request(KEY_NEEDED)
                  │
                  ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      APIKeyManager                  │
│                                     │
│  1. Selecciona key                 │
│  2. Verifica quota                │
│  3. Verifica rate limit            │
└─────────────────┬───────────────────┘
                  │
                  │ 🔔 publish(KEY_SELECTED)
                  │
                  ▼
┌─────────────────────────────────────┐
│            Event Bus                 │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      IntelligentRouter              │
│  1. Recibe key                    │
│  2. Ejecuta request               │
└─────────────────┬───────────────────┘
                  │
                  │ Response
                  │
                  ▼
┌─────────────────────────────────────┐
│      APIKeyManager                  │
│                                     │
│  1. Registrar uso                 │
│  2. Actualizar quota              │
│  3. ¿Quota exceeded?               │
└─────────────────┬───────────────────┘
                  │
         ┌───────┴───────┐
         │               │
         ▼               ▼
    ┌─────────────┐  ┌─────────────┐
    │ No excedida │  │ Excedida    │
    │             │  │             │
    │             │  │ 🔔 publish  │
    │             │  │ QUOTA_      │
    │             │  │ EXCEEDED    │
    └─────────────┘  └──────┬──────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │  Auto-Rotation   │
                    │                  │
                    │ 1. Solicitar    │
                    │    nueva key    │
                    │ 2. Registrar    │
                    │ 3. Eliminar     │
                    │    antigua      │
                    │                  │
                    │ 🔔 publish      │
                    │ KEY_ROTATED     │
                    └─────────────────┘
```

---

## Diagrama de Dependencias de Eventos

```
                    system.started
                           │
                           ▼
                    system.ready
                           │
                           ▼
              ┌──────────────────────────┐
              │                          │
              ▼                          ▼
    ┌─────────────────┐      ┌─────────────────┐
    │ capability.*    │      │ provider.*      │
    │ (resolved,     │      │ (registered,    │
    │  selected)      │      │  healthy)       │
    └────────┬────────┘      └────────┬────────┘
             │                        │
             ▼                        │
    ┌─────────────────┐              │
    │ runtime.*       │              │
    │ (selected)      │              │
    └────────┬────────┘              │
             │                        │
             ▼                        ▼
    ┌─────────────────────────────────────┐
    │                                      │
    ▼                                      ▼
execution.requested              execution.started
         │                                  │
         ▼                                  ▼
   task.created                    workflow.created
         │                                  │
         ▼                                  ▼
   task.assigned                   workflow.started
         │                                  │
         ├────────────────────┐             │
         │                    │             │
         ▼                    ▼             ▼
   task.started          llm.request_started  task.started
         │                    │             │
         │                    ▼             │
         │            llm.request_finished  │
         │                    │             │
         ▼                    ▼             ▼
   task.completed           cost.updated   task.completed
         │                                  │
         └────────────────────┐             │
                               │             │
                               ▼             ▼
                      workflow.step_finished
                               │
                               ▼
                      workflow.completed
                               │
                               ▼
                      execution.completed
                               │
                               ▼
                      system.health_changed
```

---

*Documento actualizado: 2026-07-20*
