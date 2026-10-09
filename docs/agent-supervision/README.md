# Agent Supervision System - Documentación Técnica

**Versión:** 1.0.0
**Última actualización:** 2026-07-21
**Estado:** ✅ Producción

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [Componentes](#componentes)
4. [Hooks](#hooks)
5. [Stores](#stores)
6. [Sistema de Sandbox](#sistema-de-sandbox)
7. [Mission Control](#mission-control)
8. [API Reference](#api-reference)
9. [Guía de Uso](#guía-de-uso)
10. [Auditoría](#auditoría)

---

## 🎯 Visión General

Sistema completo de supervisión y control de agentes de IA con las siguientes características:

- **Monitorización en tiempo real** de agentes, herramientas y procesos
- **Workspace aislado (Sandbox)** para ejecución segura
- **Control de cambios** con revisión y aprobación
- **Timeline** de eventos y actividades
- **Mission Control** unificado para supervisión completa

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         MISSION CONTROL                           │
│  (Panel unificado de supervisión)                                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ ActivityPanel │ │ AgentTree     │ │ ChangeInspector│ │ TimelineViewer │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ TaskMonitor   │ │ useAgentOrches│ │ useChangeInspec│ │ useTimeline   │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
        │             │             │             │
        └─────────────┼─────────────┼─────────────┘
                      ▼
              ┌───────────────┐
              │ Recoil Stores │
              └───────────────┘
```

---

## 📦 Componentes

### ActivityPanel

Panel principal que muestra actividad del agente.

| Componente | Descripción |
|------------|-------------|
| `ActivityPanel.tsx` | Panel principal con tabs |
| `ActivityItem.tsx` | Item individual de actividad |
| `ActivityLog.tsx` | Log de actividades |
| `AgentStatusBar.tsx` | Barra de estado del agente |

### TaskMonitor

Monitor en tiempo real de tareas, terminal, navegador y procesos.

| Componente | Descripción |
|------------|-------------|
| `TaskMonitor.tsx` | Panel principal con tabs |
| `BrowserPanel.tsx` | Visualización del navegador |
| `TerminalPanel.tsx` | Terminal en tiempo real |
| `ToolsPanel.tsx` | Lista de herramientas |
| `ProcessPanel.tsx` | Lista de procesos |

### Agent Orchestration

Control jerárquico de agentes.

| Componente | Descripción |
|------------|-------------|
| `AgentTree.tsx` | Vista jerárquica de agentes |
| `AgentCard.tsx` | Card individual de agente |

### Cambio y Timeline

| Componente | Descripción |
|------------|-------------|
| `TimelineViewer.tsx` | Línea de tiempo de eventos |
| `ChangeInspector.tsx` | Inspector de cambios de archivos |
| `DiffViewer.tsx` | Visualizador de diferencias |

### Mission Control

| Componente | Descripción |
|------------|-------------|
| `MissionControl.tsx` | Panel unificado completo |

---

## 🪝 Hooks

### useTimeline

Gestión de timeline de eventos.

```typescript
const {
  events,          // Array de eventos
  duration,        // Duración total
  stats,           // Estadísticas
  recordTool,      // Registrar herramienta
  recordFileRead,  // Registrar lectura de archivo
  recordMilestone, // Registrar hito
  recordCommand,   // Registrar comando
  clear,           // Limpiar timeline
} = useTimeline();
```

### useTaskMonitor

Gestión de monitor de tareas en tiempo real.

```typescript
const {
  activePanel,
  setActivePanel,
  browser,
  terminalEntries,
  activeProcesses,
  runningTools,
  stats,
  browserNavigate,
  terminalInput,
  toolStart,
  toolComplete,
  processStart,
  processComplete,
} = useTaskMonitor();
```

### useAgentOrchestrator

Gestión de agentes en jerarquía.

```typescript
const {
  agents,
  activeAgents,
  agentTree,
  stats,
  addAgent,
  addAgentByRole,
  updateAgentState,
  assignTask,
  completeTask,
  sendMessage,
  startOrchestration,
  stopOrchestration,
} = useAgentOrchestrator();
```

### useChangeInspector

Gestión de cambios de archivos.

```typescript
const {
  pendingChanges,
  allChanges,
  selectedChange,
  stats,
  addFileCreated,
  addFileModified,
  approveChange,
  rejectChange,
  approveAll,
  rejectAll,
} = useChangeInspector();
```

---

## 💾 Stores

### timelineStore

Estado del timeline de eventos.

```typescript
interface TimelineEvent {
  id: string;
  type: 'tool' | 'file' | 'command' | 'milestone' | 'agent';
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
```

### taskMonitorStore

Estado del monitor de tareas.

```typescript
interface TaskMonitorState {
  activePanel: 'browser' | 'terminal' | 'tools' | 'processes';
  browser: BrowserState;
  terminal: TerminalState;
  processes: ProcessState;
  tools: ToolExecution[];
  isLive: boolean;
}
```

### agentOrchestratorStore

Estado de los agentes.

```typescript
interface AgentInfo {
  id: string;
  name: string;
  role: AgentRole;
  state: AgentState;
  tasks: AgentTask[];
  messages: AgentMessage[];
  childIds: string[];
  parentId?: string;
}
```

### changeInspectorStore

Estado de cambios de archivos.

```typescript
interface FileChange {
  id: string;
  path: string;
  type: 'create' | 'modify' | 'delete';
  status: 'pending' | 'approved' | 'rejected' | 'applied';
}
```

---

## 🐳 Sistema de Sandbox

### Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      SandboxManager                              │
│  (Gestor centralizado)                                           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ FileSystem    │ │ Container     │ │ VM            │
│ Sandbox      │ │ Sandbox       │ │ Sandbox       │
└───────────────┘ └───────────────┘ └───────────────┘
```

### Tipos de Sandbox

| Tipo | Descripción |
|------|-------------|
| `filesystem` | Directorio temporal aislado |
| `container` | Docker/Kubernetes (preparado) |
| `vm` | Máquina virtual (preparado) |
| `mock` | Para testing |

### API

```typescript
const manager = new SandboxManager();

const sandboxId = await manager.createSandbox({ type: 'filesystem' });
await manager.writeFile(sandboxId, '/app.js', 'code');
const changes = await manager.getChanges(sandboxId);
await manager.applyChanges(sandboxId);
await manager.destroySandbox(sandboxId);
```

---

## 🎛️ Mission Control

Panel unificado que combina:

| Tab | Descripción |
|-----|-------------|
| **Overview** | Dashboard con métricas rápidas |
| **Agentes** | Árbol jerárquico de agentes |
| **Actividad** | Herramientas, Terminal, Browser, Procesos |
| **Timeline** | Historial de eventos |
| **Cambios** | Inspector de archivos |
| **Métricas** | Estadísticas detalladas |

### Uso

```tsx
import { MissionControl } from '~/components/Chat/ActivityPanel';

<MissionControl 
  defaultPanel="overview"
  showActivityBar={true}
  expanded={true}
/>
```

---

## 📚 API Reference

### MissionControlPanel

```typescript
type MissionControlPanel = 
  | 'overview'    // Dashboard
  | 'agents'      // Agentes
  | 'activity'    // Actividad
  | 'timeline'    // Timeline
  | 'changes'     // Cambios
  | 'metrics';    // Métricas
```

### AgentState

```typescript
type AgentState = 
  | 'idle'        // Esperando
  | 'thinking'    // Pensando
  | 'executing'   // Ejecutando
  | 'waiting'     // Esperando
  | 'completed'   // Completado
  | 'failed'      // Falló
  | 'paused'      // Pausado
  | 'cancelled';  // Cancelado
```

### AgentRole

```typescript
type AgentRole = 
  | 'orchestrator'  // Coordina
  | 'specialist'     // Especialista
  | 'worker'         // Trabajador
  | 'supervisor'     // Supervisor
  | 'qa'             // QA
  | 'security'        // Seguridad
  | 'researcher';    // Investigador
```

---

## 📖 Guía de Uso

### Configuración básica

```tsx
import { MissionControl } from '~/components/Chat/ActivityPanel';
import { RecoilRoot } from 'recoil';

function App() {
  return (
    <RecoilRoot>
      <div className="flex">
        <ChatView />
        <MissionControl />
      </div>
    </RecoilRoot>
  );
}
```

### Registrar eventos

```typescript
import { getEventBus } from '~/services/EventBus';

const eventBus = getEventBus();

eventBus.subscribe('tool.started', (event) => {
  toolStart(event.payload.name, event.payload.args);
});

eventBus.subscribe('tool.completed', (event) => {
  toolComplete(event.payload.id, event.payload.result);
});
```

---

## 🔍 Auditoría

### Estado de la Auditoría

| Categoría | Estado |
|----------|--------|
| Bugs | ✅ Corregidos |
| Deuda técnica | 🔄 En progreso |
| Código muerto | ✅ Limpieza completada |
| Duplicaciones | ✅ Extraídas a utilidades |
| Rendimiento | ✅ Optimizado |
| Integración | ✅ Verificado |

### Issues Resueltos

- **HIGH**: 21 → 0
- **MEDIUM**: 24 → 5 (en progreso)
- **LOW**: 8 → 0

### Utilidades Compartidas

Creado `utils/agentUtils.ts` con funciones compartidas:

- `getToolIcon()` - Iconos de herramientas
- `getAgentRoleIcon()` - Iconos de roles
- `getStatusIcon()` - Iconos de estado
- `getStatusColor()` - Colores de estado
- `getStatusBg()` - Fondos de estado
- `getStatusLabel()` - Labels de estado
- `formatDuration()` - Formateo de duración
- `formatTime()` - Formateo de tiempo
- `isActiveStatus()` - Verificar estado activo
- `isTerminalStatus()` - Verificar estado terminal

---

## 📊 Métricas del Proyecto

| Métrica | Valor |
|---------|-------|
| Componentes | 25 |
| Hooks | 6 |
| Stores | 5 |
| Utilidades | 12 |
| Documentos | 13 |
| Tests | 1 |

---

## 🔗 Links

- [01-ACTIVITY-CENTER.md](./01-ACTIVITY-CENTER.md)
- [02-ACTIVITY-BAR.md](./02-ACTIVITY-BAR.md)
- [03-AGENT-STATUS-BAR.md](./03-AGENT-STATUS-BAR.md)
- [04-EVENT-BUS.md](./04-EVENT-BUS.md)
- [05-TIMELINE-VIEWER.md](./05-TIMELINE-VIEWER.md)
- [06-ACTIVITY-LOG.md](./06-ACTIVITY-LOG.md)
- [07-ACTIVITY-PANEL.md](./07-ACTIVITY-PANEL.md)
- [08-TASK-MONITOR.md](./08-TASK-MONITOR.md)
- [09-ACTIVITY-PANEL-FINAL.md](./09-ACTIVITY-PANEL-FINAL.md)
- [10-CHANGE-INSPECTOR.md](./10-CHANGE-INSPECTOR.md)
- [11-SANDBOX-SYSTEM.md](./11-SANDBOX-SYSTEM.md)
- [12-TASK-MONITOR.md](./12-TASK-MONITOR.md)
- [13-AGENT-ORCHESTRATION.md](./13-AGENT-ORCHESTRATION.md)

---

**Mantenedor:** aoi555
**Licencia:** MIT
