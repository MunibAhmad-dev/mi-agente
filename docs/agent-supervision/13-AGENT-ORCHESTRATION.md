# Agent Orchestration & Mission Control

**Fecha:** 2026-07-21
**Versión:** 1.0

---

## Visión General

Sistema unificado que combina:
- **Control de Agentes**: Jerarquía y estados de agentes
- **Mission Control**: Panel centralizado con todas las funciones

---

## Componentes

### Backend

| Archivo | Descripción |
|---------|-------------|
| `agentOrchestratorStore.ts` | Estado de Recoil para agentes |
| `useAgentOrchestrator.ts` | Hook para gestionar agentes |

### Frontend

| Archivo | Descripción |
|---------|-------------|
| `AgentCard.tsx` | Card individual de agente |
| `AgentTree.tsx` | Vista de jerarquía |
| `MissionControl.tsx` | Panel unificado |

---

## Mission Control

### Paneles

| Panel | Descripción |
|-------|-------------|
| **Agentes** | Jerarquía y control de agentes |
| **Actividad** | TaskMonitor (herramientas, terminal, etc.) |
| **Timeline** | Historial completo de eventos |
| **Cambios** | ChangeInspector (archivos) |
| **Métricas** | Estadísticas y resumen |

### Uso

```tsx
import { MissionControl } from '~/components/Chat/ActivityPanel';

// Panel principal
<MissionControl />

// Configuración
<MissionControl 
  defaultPanel="agents"
  showActivityBar={true}
  expanded={true}
/>
```

---

## Control de Agentes

### Roles Disponibles

| Rol | Color | Descripción |
|-----|-------|-------------|
| `orchestrator` | Púrpura | Coordina y supervisa |
| `researcher` | Cyan | Investiga información |
| `worker` | Verde | Ejecuta tareas |
| `qa` | Violeta | Control de calidad |
| `security` | Rojo | Análisis de seguridad |

### Estados

| Estado | Color | Descripción |
|--------|-------|-------------|
| `idle` | Gris | Esperando |
| `thinking` | Amarillo | Pensando/procesando |
| `executing` | Azul | Ejecutando tarea |
| `waiting` | Púrpura | Esperando respuesta |
| `completed` | Verde | Tarea completada |
| `failed` | Rojo | Error |
| `paused` | Naranja | Pausado |
| `cancelled` | Gris | Cancelado |

### Hook useAgentOrchestrator

```typescript
const {
  agents,           // Array de agentes
  activeAgents,     // Agentes activos
  agentTree,        // Árbol jerárquico
  stats,            // Estadísticas
  messages,         // Mensajes entre agentes
  
  addAgent,          // Agregar agente
  addAgentByRole,    // Agregar por rol
  removeAgent,       // Eliminar
  updateAgentState,  // Cambiar estado
  
  assignTask,        // Asignar tarea
  updateTaskProgress, // Progreso
  completeTask,      // Completar
  
  sendMessage,       // Mensaje a otro agente
  
  pauseAgent,        // Pausar
  resumeAgent,       // Reanudar
  cancelAgent,       // Cancelar
  
  startOrchestration, // Iniciar orquestación
  stopOrchestration,  // Detener
  clearAll,           // Limpiar
} = useAgentOrchestrator();
```

### Ejemplo

```tsx
// Crear jerarquía
const orchestratorId = addAgentByRole('orchestrator', 'Mi Orquestador');

const researcherId = addAgent({
  name: 'Investigador',
  role: 'researcher',
  state: 'idle',
  parentId: orchestratorId,
});

const workerId = addAgent({
  name: 'Trabajador',
  role: 'worker',
  state: 'idle',
  parentId: orchestratorId,
  dependsOn: [researcherId],
});

// Asignar tarea
assignTask(workerId, {
  title: 'Implementar feature',
  description: 'Implementar la nueva funcionalidad',
});

// Actualizar estado
updateAgentState(workerId, 'executing', 'Escribiendo código...');

// Completar tarea
completeTask(workerId, taskId, { success: true });
```

---

## Jerarquía Visual

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mission Control                          │
├─────────────────────────────────────────────────────────────────┤
│ [Agentes] [Actividad] [Timeline] [Cambios] [Métricas]          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    👑 Orquestador                                        [●]   │
│       │                                                        │
│       ├── 🔍 Investigador                               [●]   │
│       │       └── (investigando...)                           │
│       │                                                        │
│       └── 🔨 Trabajador                                 [●]   │
│               ├── 📋 QA                                 [●]   │
│               └── 🛡️ Seguridad                         [●]   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    👑 Pensando    │  Análisis de requisitos...  │  [2.3s]     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Panel de Métricas

```
┌─────────────────────────────────────────────────────────────────┐
│                   Resumen de Sesión                             │
│                                                                 │
│   Duración: 15m 30s              Agentes Activos: 3           │
├─────────────────────────────────────────────────────────────────┤
│  Agentes                                                       │
│  ├─ Total: 5                                                  │
│  ├─ Activos: 3                                                │
│  ├─ Completados: 1                                             │
│  └─ Fallidos: 1                                                │
├─────────────────────────────────────────────────────────────────┤
│  Herramientas                                                   │
│  ├─ Total: 23                                                  │
│  ├─ En ejecución: 2                                            │
│  └─ Terminal: 156 líneas                                       │
├─────────────────────────────────────────────────────────────────┤
│  Cambios                                                        │
│  ├─ Pendientes: 5                                              │
│  ├─ Aprobados: 12                                              │
│  └─ Rechazados: 2                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integración

### Con EventBus

```typescript
// Suscribirse a eventos de agentes
eventBus.subscribe('agent.created', (event) => {
  console.log('Agente creado:', event.payload.name);
});

eventBus.subscribe('agent.state_changed', (event) => {
  console.log('Estado cambió:', event.payload.state);
});

eventBus.subscribe('agent.task_assigned', (event) => {
  console.log('Tarea asignada:', event.payload.title);
});

// Orquestación
eventBus.subscribe('orchestration.started', () => {
  console.log('Orquestación iniciada');
});
```

---

## Estados Visuales

### Activity Bar

```
[🟢] Ejecutando  │  Escribiendo código...  │ [code]  │ ████░░ 60% │ [2.3s]
```

Leyenda:
- Verde: Activo
- Amarillo: Pensando
- Azul: Ejecutando
- Púrpura: Esperando
