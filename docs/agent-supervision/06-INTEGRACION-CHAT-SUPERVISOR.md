# INTEGRACIÓN CHAT + SUPERVISOR

**Fecha:** 2026-07-21
**Versión:** 1.0
**Estado:** NUEVO - Completar Fase 2

---

## TABLA DE CONTENIDOS

1. [Visión General](#1-visión-general)
2. [Arquitectura de Integración](#2-arquitectura-de-integración)
3. [Wireframe ChatView + SupervisorPanel](#3-wireframe-chatview--supervisorpanel)
4. [SupervisorStore (Recoil)](#4-supervisorstore-recoil)
5. [Mapeo SSE → Supervisor Events](#5-mapeo-sse--supervisor-events)
6. [Componentes de Integración](#6-componentes-de-integración)
7. [Flujo de Datos Completo](#7-flujo-de-datos-completo)

---

## 1. VISIÓN GENERAL

### 1.1 Objetivo

Integrar el sistema de supervisión de agentes directamente en la interfaz del chat, permitiendo a los usuarios:
- Ver actividad del agente en tiempo real mientras conversan
- Controlar agentes desde el mismo panel de chat
- Revisar y aprobar cambios sin cambiar de pantalla
- Usar multi-agente sin salir del chat

### 1.2 Componentes a Integrar

| Componente | Ubicación Actual | Ubicación Nueva |
|------------|-----------------|-----------------|
| ActivityFeed | Panel lateral | Dentro de ChatView |
| Timeline | Panel lateral | Dentro de ChatView (collapsible) |
| SandboxControls | Nueva | Dentro de ChatView (collapsible) |
| MultiAgentOrchestrator | Nueva | Dentro de ChatView (collapsible) |
| DiffViewer | Nueva | Modal/Drawer |

---

## 2. ARQUITECTURA DE INTEGRACIÓN

### 2.1 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND INTEGRADO                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         ChatView.tsx                                   │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                    ChatHeader                               │   │   │
│  │  │  [Modelo] [Herramientas] [Supervisor: ON ▼]               │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │  ┌───────────────────────────┬─────────────────────────────┐   │   │
│  │  │                           │                             │   │   │
│  │  │     MessageList           │    SupervisorPanel (Sidebar) │   │   │
│  │  │                           │    ┌───────────────────┐   │   │   │
│  │  │  ┌─────────────────┐     │    │ [Activity ▼]      │   │   │   │
│  │  │  │  User Message   │     │    │ [Timeline ▼]      │   │   │   │
│  │  │  └─────────────────┘     │    │ [Sandbox ▼]       │   │   │   │
│  │  │  ┌─────────────────┐     │    │ [MultiAgent ▼]    │   │   │   │
│  │  │  │  Agent Response │     │    │                   │   │   │   │
│  │  │  │  + Tool Calls   │     │    │ ▸ Tool: bash     │   │   │   │
│  │  │  └─────────────────┘     │    │   npm test       │   │   │   │
│  │  │                           │    │ ▸ Tool: write    │   │   │   │
│  │  │                           │    │   src/App.tsx    │   │   │   │
│  │  │                           │    │                   │   │   │   │
│  │  │                           │    └───────────────────┘   │   │   │
│  │  │                           │                             │   │   │
│  │  └───────────────────────────┴─────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │                    ChatInput                             │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                           │
│                                    ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SupervisorStore (Recoil)                          │   │
│  │  atoms:                                                          │   │
│  │    • supervisorEnabledAtom    • activeSessionAtom                   │   │
│  │    • eventsAtom              • activeTabAtom                       │   │
│  │    • sandboxStateAtom        • agentStatesAtom                     │   │
│  │                                                                     │   │
│  │  selectors:                                                       │   │
│  │    • visibleEventsSelector    • filteredEventsSelector              │   │
│  │    • pendingChangesSelector  • agentStatsSelector                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                           │
│                                    ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Socket.IO Connection                             │   │
│  │  ws://api/socket.io?sessionId=xxx&convoId=yyy                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Comunicación Entre Componentes

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          FLUJO DE COMUNICACIÓN                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                │
│  │ ChatView    │◄────►│ Supervisor  │◄────►│ Supervisor  │                │
│  │             │      │Panel        │      │Store        │                │
│  │             │      │             │      │(Recoil)     │                │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘                │
│         │                     │                     │                       │
│         │ useChatHelpers()     │ useSupervisor()     │                       │
│         │                     │                     │ useSocket()           │
│         ▼                     ▼                     ▼                       │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                │
│  │ Recoil Chat │      │ Supervisor  │      │ Socket.IO   │                │
│  │ Store       │      │ Hooks      │      │ Client      │                │
│  └─────────────┘      └─────────────┘      └──────┬──────┘                │
│                                                     │                       │
│                                                     ▼                       │
│                                              ┌─────────────┐                │
│                                              │ Backend     │                │
│                                              │ EventBus    │                │
│                                              └─────────────┘                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. WIREFRAME CHATVIEW + SUPERVISORPANEL

### 3.1 Layout Principal

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  🤖 Mi LibreChat                              [Settings ⚙️] [User 👤]        │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 📋 Nueva York Trip  │ 💬 Chat  │ 📊 Métricas  │ 🛒 Plugins  │ [+]      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────┬───────────┐ │
│  │                                                             │ SUPERVISOR│ │
│  │  ┌─────────────────────────────────────────────────────┐   │ ──────────│ │
│  │  │                                                      │   │            │ │
│  │  │  ┌──────────────────────────────────────────────┐  │   │ [Activity] │ │
│  │  │  │                                              │  │   │ [Timeline] │ │
│  │  │  │  👤 Tú                                       │  │   │ [Sandbox]  │ │
│  │  │  │  Crea un componente React para un botón    │  │   │ [MultiAgt] │ │
│  │  │  │                                              │  │   │            │ │
│  │  │  └──────────────────────────────────────────────┘  │   │ ┌────────┐ │ │
│  │  │                                                      │   │ │◐ Run  │ │ │
│  │  │  ┌──────────────────────────────────────────────┐  │   │ └────────┘ │ │
│  │  │  │  🤖 Agente                                    │  │   │            │ │
│  │  │  │                                              │  │   │ ┌────────┐ │ │
│  │  │  │  Voy a crear el componente Button.tsx       │  │   │ │◑ Pause│ │ │
│  │  │  │                                              │  │   │ └────────┘ │ │
│  │  │  │  ```                                          │  │   │            │ │
│  │  │  │  // src/components/Button.tsx               │  │   │ ┌────────┐ │ │
│  │  │  │  interface ButtonProps {                     │  │   │ │■ Stop  │ │ │
│  │  │  │    children: ReactNode;                     │  │   │ └────────┘ │ │
│  │  │  │    onClick?: () => void;                   │  │   │            │ │
│  │  │  │  }                                         │  │   └────────────┘ │
│  │  │  │  ```                                        │  │                   │
│  │  │  │                                              │  │                   │
│  │  │  └──────────────────────────────────────────────┘  │   │                   │
│  │  │                                                      │   │                   │
│  │  │  ┌──────────────────────────────────────────────┐  │   │                   │
│  │  │  │  🔧 Tool Execution                          │  │   │                   │
│  │  │  │                                              │  │   │                   │
│  │  │  │  ▸ Escribiendo archivo: src/components/... │  │   │                   │
│  │  │  │  ▸ Ejecutando: npm run lint               │  │   │                   │
│  │  │  │  ✓ Listo                                      │  │   │                   │
│  │  │  └──────────────────────────────────────────────┘  │   │                   │
│  │  │                                                      │   │                   │
│  │  └─────────────────────────────────────────────────────┘   │                   │
│  │                                                             │                   │
│  │  ┌─────────────────────────────────────────────────────┐   │                   │
│  │  │ 💬 Escribe tu mensaje...                    [Send ➤] │   │                   │
│  │  └─────────────────────────────────────────────────────┘   │                   │
│  └─────────────────────────────────────────────────────────────┴───────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Expandir Panel de Actividad

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────┬───────────┐ │
│  │                                                             │ SUPERVISOR│ │
│  │  ┌─────────────────────────────────────────────────────┐   │ ──────────│ │
│  │  │                                                      │   │ [✓]Activity]│
│  │  │                                                      │   │ [ ]Timeline]│
│  │  │                                                      │   │ [ ]Sandbox] │
│  │  │                                                      │   │ [ ]MultiAgt]│
│  │  └─────────────────────────────────────────────────────┘   │            │ │
│  │                                                             │            │ │
│  │                                                             │ ┌────────┐ │ │
│  │                                                             │ │ ACTIVITY│ │ │
│  │                                                             │ │ ───────│ │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ ● Thinking│
│  │                                                             │ │   "Voy a crear..." │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ ◐ Read  │ │ │
│  │                                                             │ │   src/components │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ ✓ Write │ │ │
│  │                                                             │ │   Button.tsx │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ ◐ Bash  │ │ │
│  │                                                             │ │   npm run lint │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ ○ Browser│ │
│  │                                                             │ │   Esperando... │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ └────────┘ │ │
│  └─────────────────────────────────────────────────────────────┴─────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Expandir Panel de Sandbox

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────┬───────────┐ │
│  │                                                             │ SUPERVISOR│ │
│  │                                                             │ ──────────│ │
│  │                                                             │ [ ]Activity│ │
│  │                                                             │ [ ]Timeline│ │
│  │                                                             │ [✓]Sandbox │ │
│  │                                                             │ [ ]MultiAgt│ │
│  │                                                             │            │ │
│  │                                                             │ ┌────────┐ │ │
│  │                                                             │ │SANDBOX │ │ │
│  │                                                             │ │────────│ │ │
│  │                                                             │ │ ⚙ Running│ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ 📁 Files│ │ │
│  │                                                             │ │ ├ App.tsx│ │
│  │                                                             │ │ ├ Button.tsx│ │
│  │                                                             │ │ │  [M] Modified│ │
│  │                                                             │ │ └ index.ts│ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ ⌨ Terminal│ │
│  │                                                             │ │ $ npm test│ │
│  │                                                             │ │ ✓ 15 passed│ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ [Apply All]│ │
│  │                                                             │ │ [Discard] │ │
│  │                                                             │ └────────┘ │ │
│  └─────────────────────────────────────────────────────────────┴─────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Modo Multi-Agente

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────┬───────────┐ │
│  │                                                             │ SUPERVISOR│ │
│  │                                                             │ ──────────│ │
│  │                                                             │ [ ]Activity│ │
│  │                                                             │ [ ]Timeline│ │
│  │                                                             │ [ ]Sandbox │ │
│  │                                                             │ [✓]MultiAgt│ │
│  │                                                             │            │ │
│  │                                                             │ ┌────────┐ │ │
│  │                                                             │ │AGENTS  │ │ │
│  │                                                             │ │────────│ │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ 💻 Prog│ │ │
│  │                                                             │ │   ◐ 3/3│ │ │
│  │                                                             │ │   Task:│ │ │
│  │                                                             │ │   write│ │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ 🔒 Sec │ │ │
│  │                                                             │ │   ✓ 2/2│ │ │
│  │                                                             │ │   Task:│ │ │
│  │                                                             │ │   audit│ │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ │ 🔬 Res │ │ │
│  │                                                             │ │   ◐ 1/2│ │ │
│  │                                                             │ │   Task:│ │ │
│  │                                                             │ │   docs │ │ │
│  │                                                             │ │        │ │ │
│  │                                                             │ └────────┘ │ │
│  └─────────────────────────────────────────────────────────────┴─────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. SUPERVISORSTORE (RECOIL)

### 4.1 Átomos

```typescript
// client/src/store/supervisorAtoms.ts

import { atom, atomFamily } from 'recoil';
import { recoilPersist } from 'recoil-persist';

// ============================================================================
// ÁTOMOS PRINCIPALES
// ============================================================================

/**
 * Habilita/deshabilita el panel de supervisor
 */
export const supervisorEnabledAtom = atom<boolean>({
  key: 'supervisor/enabled',
  default: false,
  effects: [recoilPersist()],
});

/**
 * Pestaña activa en el panel de supervisor
 */
export type SupervisorTab = 'activity' | 'timeline' | 'sandbox' | 'multiagent';

export const activeTabAtom = atom<SupervisorTab>({
  key: 'supervisor/activeTab',
  default: 'activity',
});

/**
 * Sesión activa del supervisor
 */
export const activeSessionAtom = atom<SupervisorSession | null>({
  key: 'supervisor/activeSession',
  default: null,
});

/**
 * Lista de eventos del supervisor
 */
export const eventsAtom = atom<SupervisorEvent[]>({
  key: 'supervisor/events',
  default: [],
});

/**
 * Estado del sandbox
 */
export const sandboxStateAtom = atom<SandboxState | null>({
  key: 'supervisor/sandboxState',
  default: null,
});

/**
 * Cambios pendientes de promoción
 */
export const pendingChangesAtom = atom<PendingChange[]>({
  key: 'supervisor/pendingChanges',
  default: [],
});

/**
 * Estado de los agentes en sesión
 */
export const agentStatesAtom = atom<Map<string, AgentState>>({
  key: 'supervisor/agentStates',
  default: new Map(),
});

/**
 * Conexión WebSocket activa
 */
export const wsConnectionAtom = atom<{
  connected: boolean;
  sessionId: string | null;
  convoId: string | null;
}>({
  key: 'supervisor/wsConnection',
  default: { connected: false, sessionId: null, convoId: null },
});

// ============================================================================
// ÁTOMOS FAMILIA (por sesión)
// ============================================================================

/**
 * Eventos de una sesión específica
 */
export const sessionEventsFamily = atomFamily<SupervisorEvent[], string>({
  key: 'supervisor/sessionEvents',
  default: [],
});

/**
 * Estado del sandbox de una sesión específica
 */
export const sessionSandboxFamily = atomFamily<SandboxState | null, string>({
  key: 'supervisor/sessionSandbox',
  default: null,
});

// ============================================================================
// SELECTORES
// ============================================================================

import { selector, selectorFamily } from 'recoil';

/**
 * Eventos visibles (limitados a los últimos N)
 */
export const visibleEventsSelector = selector<SupervisorEvent[]>({
  key: 'supervisor/visibleEvents',
  get: ({ get }) => {
    const events = get(eventsAtom);
    return events.slice(-50); // Últimos 50 eventos
  },
});

/**
 * Eventos filtrados por tipo
 */
export const filteredEventsSelector = selectorFamily<SupervisorEvent[], SupervisorEventType[]>({
  key: 'supervisor/filteredEvents',
  get: (filterTypes) => ({ get }) => {
    const events = get(eventsAtom);
    if (filterTypes.length === 0) return events;
    return events.filter(event => filterTypes.includes(event.type));
  },
});

/**
 * Estadísticas de agentes
 */
export const agentStatsSelector = selector<AgentStats>({
  key: 'supervisor/agentStats',
  get: ({ get }) => {
    const agentStates = get(agentStatesAtom);
    const stats: AgentStats = {
      total: agentStates.size,
      active: 0,
      idle: 0,
      paused: 0,
      error: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
    };

    agentStates.forEach(state => {
      switch (state.status) {
        case 'thinking':
        case 'acting':
          stats.active++;
          break;
        case 'idle':
        case 'waiting':
          stats.idle++;
          break;
        case 'paused':
          stats.paused++;
          break;
        case 'error':
        case 'stopped':
          stats.error++;
          break;
      }
      stats.tasksCompleted += state.stats.tasksCompleted;
      stats.tasksFailed += state.stats.tasksFailed;
    });

    return stats;
  },
});

/**
 * Eventos del último agente seleccionado
 */
export const lastActiveAgentEventsSelector = selector<SupervisorEvent[]>({
  key: 'supervisor/lastActiveAgentEvents',
  get: ({ get }) => {
    const events = get(eventsAtom);
    // Encontrar el último agente activo
    const agentIds = new Set(events.map(e => e.agentId).filter(Boolean));
    const lastAgentId = Array.from(agentIds).pop();
    return events.filter(e => e.agentId === lastAgentId);
  },
});
```

### 4.2 Tipos

```typescript
// client/src/store/supervisorTypes.ts

export interface SupervisorSession {
  id: string;
  userId: string;
  conversationId: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'active' | 'paused' | 'stopped';
}

export interface SupervisorEvent {
  id: string;
  sessionId: string;
  agentId?: string;
  type: SupervisorEventType;
  timestamp: Date;
  data: {
    tool?: string;
    action?: string;
    target?: string;
    content?: string;
    status?: 'pending' | 'running' | 'done' | 'error';
    duration?: number;
    exitCode?: number;
    error?: string;
  };
  metadata: {
    userId: string;
    conversationId?: string;
    model?: string;
    tools?: string[];
    parentEventId?: string;
  };
}

export type SupervisorEventType =
  | 'agent:start'
  | 'agent:thinking'
  | 'agent:tool_start'
  | 'agent:tool_end'
  | 'agent:tool_error'
  | 'agent:file_read'
  | 'agent:file_write'
  | 'agent:file_delete'
  | 'agent:command_execute'
  | 'agent:browser_navigate'
  | 'agent:browser_action'
  | 'agent:subagent_start'
  | 'agent:subagent_end'
  | 'agent:pause'
  | 'agent:resume'
  | 'agent:complete'
  | 'agent:error';

export interface SandboxState {
  id: string;
  sessionId: string;
  status: 'creating' | 'ready' | 'running' | 'paused' | 'stopped' | 'error';
  containerId?: string;
  workspacePath: string;
  modifiedFiles: FileChange[];
  terminalHistory: TerminalEntry[];
}

export interface FileChange {
  path: string;
  operation: 'modified' | 'added' | 'deleted';
  staged: boolean;
  oldContent?: string;
  newContent?: string;
}

export interface TerminalEntry {
  id: string;
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
}

export interface AgentState {
  id: string;
  type: AgentType;
  name: string;
  status: AgentStatus;
  currentTask?: string;
  stats: {
    tasksCompleted: number;
    tasksFailed: number;
    messagesSent: number;
    messagesReceived: number;
  };
}

export type AgentType = 'coordinator' | 'programmer' | 'security' | 'researcher' | 'qa' | 'documentation';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'waiting' | 'paused' | 'stopped' | 'error';

export interface AgentStats {
  total: number;
  active: number;
  idle: number;
  paused: number;
  error: number;
  tasksCompleted: number;
  tasksFailed: number;
}

export interface PendingChange {
  id: string;
  file: string;
  operation: 'modified' | 'added' | 'deleted';
  staged: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  createdAt: Date;
}
```

### 4.3 Hook de Supervisión

```typescript
// client/src/hooks/useSupervisor.ts

import { useCallback, useEffect } from 'react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { io, Socket } from 'socket.io-client';
import {
  supervisorEnabledAtom,
  activeTabAtom,
  activeSessionAtom,
  eventsAtom,
  sandboxStateAtom,
  pendingChangesAtom,
  agentStatesAtom,
  wsConnectionAtom,
  visibleEventsSelector,
  SupervisorTab,
} from '../store/supervisorAtoms';
import type {
  SupervisorEvent,
  SandboxState,
  AgentState,
  PendingChange,
} from '../store/supervisorTypes';

export function useSupervisor(conversationId: string) {
  const [enabled, setEnabled] = useRecoilState(supervisorEnabledAtom);
  const [activeTab, setActiveTab] = useRecoilState(activeTabAtom);
  const [session, setSession] = useRecoilState(activeSessionAtom);
  const [events, setEvents] = useRecoilState(eventsAtom);
  const [sandboxState, setSandboxState] = useRecoilState(sandboxStateAtom);
  const [pendingChanges, setPendingChanges] = useRecoilState(pendingChangesAtom);
  const [agentStates, setAgentStates] = useRecoilState(agentStatesAtom);
  const [wsConnection, setWsConnection] = useRecoilState(wsConnectionAtom);
  const visibleEvents = useRecoilValue(visibleEventsSelector);

  // Socket instance
  const [socket, setSocket] = useState<Socket | null>(null);

  // ==========================================================================
  // CONEXIÓN WEBSOCKET
  // ==========================================================================

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const newSocket = io('/supervisor', {
      query: { convoId: conversationId },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('[Supervisor] Connected:', newSocket.id);
      setWsConnection({ connected: true, sessionId: newSocket.id!, convoId: conversationId });
    });

    newSocket.on('disconnect', () => {
      console.log('[Supervisor] Disconnected');
      setWsConnection({ connected: false, sessionId: null, convoId: null });
    });

    // ==========================================================================
    // MANEJADORES DE EVENTOS
    // ==========================================================================

    newSocket.on('agent:event', (event: SupervisorEvent) => {
      setEvents(prev => [...prev, event]);

      // Actualizar estado del agente si aplica
      if (event.agentId) {
        setAgentStates(prev => {
          const newMap = new Map(prev);
          const currentState = newMap.get(event.agentId!) || createDefaultAgentState(event.agentId!);
          newMap.set(event.agentId!, updateAgentState(currentState, event));
          return newMap;
        });
      }
    });

    newSocket.on('sandbox:state', (state: SandboxState) => {
      setSandboxState(state);
    });

    newSocket.on('sandbox:change', (change: FileChange) => {
      setSandboxState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          modifiedFiles: [...prev.modifiedFiles, change],
        };
      });
    });

    newSocket.on('sandbox:terminal', (entry: TerminalEntry) => {
      setSandboxState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          terminalHistory: [...prev.terminalHistory, entry],
        };
      });
    });

    newSocket.on('agent:state', (state: AgentState) => {
      setAgentStates(prev => {
        const newMap = new Map(prev);
        newMap.set(state.id, state);
        return newMap;
      });
    });

    newSocket.on('session:start', (sess: SupervisorSession) => {
      setSession(sess);
    });

    newSocket.on('session:end', () => {
      setSession(prev => prev ? { ...prev, endedAt: new Date(), status: 'stopped' } : null);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [enabled, conversationId]);

  // ==========================================================================
  // ACCIONES
  // ==========================================================================

  const enableSupervisor = useCallback(() => setEnabled(true), [setEnabled]);
  const disableSupervisor = useCallback(() => setEnabled(false), [setEnabled]);
  const toggleSupervisor = useCallback(() => setEnabled(prev => !prev), [setEnabled]);

  const selectTab = useCallback((tab: SupervisorTab) => setActiveTab(tab), [setActiveTab]);

  const clearEvents = useCallback(() => setEvents([]), [setEvents]);

  const pauseAgent = useCallback((agentId: string) => {
    socket?.emit('agent:pause', { agentId });
  }, [socket]);

  const resumeAgent = useCallback((agentId: string) => {
    socket?.emit('agent:resume', { agentId });
  }, [socket]);

  const stopAgent = useCallback((agentId: string) => {
    socket?.emit('agent:stop', { agentId });
  }, [socket]);

  const promoteChange = useCallback((changeId: string) => {
    socket?.emit('promotion:approve', { changeId });
  }, [socket]);

  const discardChange = useCallback((changeId: string) => {
    socket?.emit('promotion:reject', { changeId });
  }, [socket]);

  const promoteAllChanges = useCallback(() => {
    socket?.emit('promotion:applyAll', {});
  }, [socket]);

  const discardAllChanges = useCallback(() => {
    socket?.emit('promotion:discardAll', {});
  }, [socket]);

  return {
    // Estado
    enabled,
    activeTab,
    session,
    events: visibleEvents,
    allEvents: events,
    sandboxState,
    pendingChanges,
    agentStates,
    wsConnection,

    // Acciones
    enableSupervisor,
    disableSupervisor,
    toggleSupervisor,
    selectTab,
    clearEvents,
    pauseAgent,
    resumeAgent,
    stopAgent,
    promoteChange,
    discardChange,
    promoteAllChanges,
    discardAllChanges,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function createDefaultAgentState(agentId: string): AgentState {
  return {
    id: agentId,
    type: 'programmer',
    name: `Agent ${agentId.slice(0, 6)}`,
    status: 'idle',
    stats: {
      tasksCompleted: 0,
      tasksFailed: 0,
      messagesSent: 0,
      messagesReceived: 0,
    },
  };
}

function updateAgentState(state: AgentState, event: SupervisorEvent): AgentState {
  switch (event.type) {
    case 'agent:start':
      return { ...state, status: 'thinking' };
    case 'agent:thinking':
      return { ...state, status: 'thinking' };
    case 'agent:tool_start':
      return { ...state, status: 'acting' };
    case 'agent:tool_end':
      return {
        ...state,
        status: 'idle',
        stats: {
          ...state.stats,
          tasksCompleted: state.stats.tasksCompleted + 1,
        },
      };
    case 'agent:pause':
      return { ...state, status: 'paused' };
    case 'agent:resume':
      return { ...state, status: 'idle' };
    case 'agent:stop':
      return { ...state, status: 'stopped' };
    case 'agent:error':
      return {
        ...state,
        status: 'error',
        stats: {
          ...state.stats,
          tasksFailed: state.stats.tasksFailed + 1,
        },
      };
    default:
      return state;
  }
}
```

---

## 5. MAPEO SSE → SUPERVISOR EVENTS

### 5.1 Eventos SSE del Chat

```typescript
// client/src/hooks/SSE/types.ts

// Tipos de eventos SSE que vienen del backend
export const CHAT_SSE_EVENTS = {
  // Mensajes
  TEXT: 'text',
  TEXT_PROGRESS: 'text_progress',
  MESSAGE: 'message',
  MESSAGE_END: 'message_end',
  ERROR: 'error',

  // Tokens/Usage
  USAGE: 'usage',
  TOKEN_COUNT: 'token_count',

  // Herramientas
  TOOL_CALL: 'tool_call',
  TOOL_CALL_END: 'tool_call_end',
  TOOL_CALL_ERROR: 'tool_call_error',

  // Agentes
  AGENT: 'agent',
  AGENT_ACTION: 'agent_action',
  SUB_AGENT: 'sub_agent',

  // Streaming
  STREAM_START: 'stream_start',
  STREAM_END: 'stream_end',

  // Passthrough
  PING: 'ping',
  DONE:EventType> = {
  [CHAT_SSE_EVENTS.AGENT]: 'agent:start',
  [CHAT_SSE_EVENTS.AGENT_ACTION]: 'agent:thinking',
  [CHAT_SSE_EVENTS.TOOL_CALL]: 'agent:tool_start',
  [CHAT_SSE_EVENTS.TOOL_CALL_END]: 'agent:tool_end',
  [CHAT_SSE_EVENTS.TOOL_CALL_ERROR]: 'agent:tool_error',
  [CHAT_SSE_EVENTS.SUB_AGENT]: 'agent:subagent_start',
  [CHAT_SSE_EVENTS.MESSAGE_END]: 'agent:complete',
  [CHAT_SSE_EVENTS.ERROR]: 'agent:error',
};
```

### 5.2 Handler de Eventos SSE para Supervisor

```typescript
// client/src/hooks/SSE/useSupervisorEventMapper.ts

import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { eventsAtom, agentStatesAtom } from '../../store/supervisorAtoms';
import { SSE_TO_SUPERVISOR_MAP } from './types';
import type { SupervisorEvent, SupervisorEventType } from '../../store/supervisorTypes';

/**
 * Hook que mapea eventos SSE del chat a eventos del supervisor
 */
export function useSupervisorEventMapper(sessionId: string, conversationId: string) {
  const setEvents = useSetRecoilState(eventsAtom);
  const setAgentStates = useSetRecoilState(agentStatesAtom);

  /**
   * Procesar evento SSE y convertirlo a evento del supervisor
   */
  const mapSSEToSupervisorEvent = useCallback((
    sseType: string,
    data: SSEEventData
  ): SupervisorEvent | null => {
    const supervisorType = SSE_TO_SUPERVISOR_MAP[sseType];
    if (!supervisorType) return null;

    // Extraer datos específicos según el tipo de evento
    const eventData = extractEventData(sseType, data);
    const agentId = extractAgentId(data);

    const supervisorEvent: SupervisorEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      agentId,
      type: supervisorType,
      timestamp: new Date(),
      data: eventData,
      metadata: {
        userId: data.userId || 'unknown',
        conversationId,
        model: data.model,
        tools: data.tools,
      },
    };

    // Agregar a eventos
    setEvents(prev => [...prev, supervisorEvent]);

    // Actualizar estado del agente
    if (agentId) {
      updateAgentStateFromEvent(agentId, supervisorType, eventData);
    }

    return supervisorEvent;
  }, [sessionId, conversationId, setEvents, setAgentStates]);

  return { mapSSEToSupervisorEvent };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extraer datos específicos según el tipo de evento SSE
 */
function extractEventData(sseType: string, data: SSEEventData): SupervisorEvent['data'] {
  switch (sseType) {
    case 'tool_call':
      return {
        tool: data.tool?.name || data.toolName,
        action: data.tool?.input?.action || data.command || data.path,
        target: data.tool?.input?.file_path || data.path,
        status: 'running',
      };

    case 'tool_call_end':
      return {
        tool: data.tool?.name || data.toolName,
        action: data.result?.action || data.command || data.path,
        target: data.tool?.input?.file_path || data.path,
        content: data.result?.content || data.output,
        status: 'done',
        duration: data.duration,
        exitCode: data.result?.exitCode,
      };

    case 'tool_call_error':
      return {
        tool: data.tool?.name || data.toolName,
        action: data.error?.message || data.errorMessage,
        target: data.tool?.input?.file_path || data.path,
        status: 'error',
        error: data.error?.message || data.errorMessage,
      };

    case 'agent':
    case 'agent_action':
      return {
        tool: data.action,
        content: data.content || data.thought,
        status: 'running',
      };

    case 'sub_agent':
      return {
        tool: 'subagent',
        action: data.task,
        content: data.description,
        status: 'running',
      };

    case 'message_end':
      return {
        tool: 'complete',
        content: 'Task completed',
        status: 'done',
        duration: data.duration,
      };

    case 'error':
      return {
        tool: 'error',
        action: data.error?.type || 'error',
        content: data.error?.message,
        status: 'error',
        error: data.error?.message,
      };

    default:
      return {
        tool: sseType,
        content: JSON.stringify(data).slice(0, 500),
        status: 'running',
      };
  }
}

/**
 * Extraer ID del agente de los datos del evento
 */
function extractAgentId(data: SSEEventData): string | undefined {
  return data.agentId || data.assistantId || data.threadId;
}

/**
 * Actualizar estado del agente basándose en el evento
 */
function updateAgentStateFromEvent(
  agentId: string,
  eventType: SupervisorEventType,
  data: SupervisorEvent['data']
): void {
  // Esta función actualiza el estado del agente en el store
  // La implementación completa está en useSupervisor.ts
}

/**
 * Tipos para datos de eventos SSE
 */
interface SSEEventData {
  tool?: {
    name?: string;
    input?: Record<string, unknown>;
  };
  toolName?: string;
  command?: string;
  path?: string;
  result?: {
    action?: string;
    content?: string;
    exitCode?: number;
  };
  output?: string;
  error?: {
    type?: string;
    message?: string;
  };
  errorMessage?: string;
  userId?: string;
  model?: string;
  tools?: string[];
  agentId?: string;
  assistantId?: string;
  threadId?: string;
  action?: string;
  content?: string;
  thought?: string;
  task?: string;
  description?: string;
  duration?: number;
}
```

### 5.3 Integración con useEventHandlers

```typescript
// client/src/hooks/SSE/useEventHandlers.ts (modificación)

import { useSupervisorEventMapper } from './useSupervisorEventMapper';

export function useEventHandlers(options: EventHandlerOptions) {
  const { sessionId, conversationId, onToolCall, onMessage } = options;
  
  // Integrar mapper de supervisor
  const { mapSSEToSupervisorEvent } = useSupervisorEventMapper(sessionId, conversationId);

  // ==========================================================================
  // HANDLERS EXISTENTES
  // ==========================================================================

  const handleText = useCallback((data: TextData) => {
    // Handler existente...
  }, []);

  const handleToolCall = useCallback((data: ToolCallData) => {
    // Handler existente...
    
    // NUEVO: Mapear a evento del supervisor
    const supervisorEvent = mapSSEToSupervisorEvent('tool_call', data);
    if (supervisorEvent) {
      // Notificar al componente de actividad
      options.onActivityUpdate?.(supervisorEvent);
    }
  }, [mapSSEToSupervisorEvent]);

  const handleToolCallEnd = useCallback((data: ToolCallEndData) => {
    // Handler existente...
    
    // NUEVO: Mapear a evento del supervisor
    const supervisorEvent = mapSSEToSupervisorEvent('tool_call_end', data);
    if (supervisorEvent) {
      options.onActivityUpdate?.(supervisorEvent);
    }
  }, [mapSSEToSupervisorEvent]);

  const handleMessageEnd = useCallback((data: MessageEndData) => {
    // Handler existente...
    
    // NUEVO: Mapear a evento del supervisor
    mapSSEToSupervisorEvent('message_end', data);
  }, [mapSSEToSupervisorEvent]);

  const handleError = useCallback((data: ErrorData) => {
    // Handler existente...
    
    // NUEVO: Mapear a evento de error del supervisor
    mapSSEToSupervisorEvent('error', data);
  }, [mapSSEToSupervisorEvent]);

  // ==========================================================================
  // REGISTRO DE HANDLERS
  // ==========================================================================

  useEffect(() => {
    const sseClient = getSSEClient();

    sseClient.on('text', handleText);
    sseClient.on('tool_call', handleToolCall);
    sseClient.on('tool_call_end', handleToolCallEnd);
    sseClient.on('message_end', handleMessageEnd);
    sseClient.on('error', handleError);

    return () => {
      sseClient.off('text', handleText);
      sseClient.off('tool_call', handleToolCall);
      sseClient.off('tool_call_end', handleToolCallEnd);
      sseClient.off('message_end', handleMessageEnd);
      sseClient.off('error', handleError);
    };
  }, [handleText, handleToolCall, handleToolCallEnd, handleMessageEnd, handleError]);
}
```

---

## 6. COMPONENTES DE INTEGRACIÓN

### 6.1 ChatView con SupervisorPanel

```tsx
// client/src/components/Chat/ChatView.tsx

import React, { useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useChatHelpers } from '~/hooks/Chat';
import { useSupervisor } from '~/hooks/useSupervisor';
import { supervisorEnabledAtom } from '~/store/supervisorAtoms';

import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { SupervisorPanel } from '../Supervisor/SupervisorPanel';
import { ToolExecutionBanner } from './ToolExecutionBanner';

export function ChatView() {
  const conversationId = useChatHelpers().conversationId;
  const supervisorEnabled = useRecoilValue(supervisorEnabledAtom);
  
  // Hook de supervisor
  const {
    enabled,
    activeTab,
    toggleSupervisor,
    selectTab,
    events,
    sandboxState,
    agentStates,
  } = useSupervisor(conversationId);

  const [sidebarWidth, setSidebarWidth] = useState(350);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-gray-800">
      {/* Header */}
      <ChatHeader
        showSupervisorToggle
        supervisorEnabled={enabled}
        onToggleSupervisor={toggleSupervisor}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <MessageList />
          <ToolExecutionBanner />
          <ChatInput />
        </div>

        {/* Supervisor Panel */}
        {enabled && (
          <div
            className="border-l border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200"
            style={{ width: sidebarWidth }}
          >
            <SupervisorPanel
              activeTab={activeTab}
              onTabChange={selectTab}
              events={events}
              sandboxState={sandboxState}
              agentStates={agentStates}
              onClose={() => toggleSupervisor()}
              onResize={(width) => setSidebarWidth(width)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

### 6.2 ChatHeader con Toggle de Supervisor

```tsx
// client/src/components/Chat/ChatHeader.tsx

import React from 'react';

interface ChatHeaderProps {
  showSupervisorToggle?: boolean;
  supervisorEnabled?: boolean;
  onToggleSupervisor?: () => void;
}

export function ChatHeader({
  showSupervisorToggle = true,
  supervisorEnabled = false,
  onToggleSupervisor,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:bg-gray-800 dark:border-gray-700">
      {/* Left side */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          Chat
        </h1>
        
        {/* Model selector */}
        <ModelSelector />
        
        {/* Tools indicator */}
        <ToolsIndicator />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Supervisor Toggle */}
        {showSupervisorToggle && (
          <button
            onClick={onToggleSupervisor}
            className={`
              flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium
              transition-colors
              ${supervisorEnabled
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }
            `}
            title={supervisorEnabled ? 'Desactivar supervisión' : 'Activar supervisión'}
          >
            <SupervisorIcon />
            <span>Supervisor</span>
            <span className={supervisorEnabled ? 'text-green-500' : 'text-gray-400'}>
              {supervisorEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        )}

        {/* Settings */}
        <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
```

### 6.3 SupervisorPanel

```tsx
// client/src/components/Supervisor/SupervisorPanel.tsx

import React from 'react';
import { useSupervisor } from '~/hooks/useSupervisor';
import { ActivityFeed } from './ActivityFeed';
import { Timeline } from './Timeline';
import { SandboxPanel } from './SandboxPanel';
import { MultiAgentPanel } from './MultiAgentPanel';
import { SupervisorTab } from '~/store/supervisorAtoms';

interface SupervisorPanelProps {
  activeTab: SupervisorTab;
  onTabChange: (tab: SupervisorTab) => void;
  events: SupervisorEvent[];
  sandboxState: SandboxState | null;
  agentStates: Map<string, AgentState>;
  onClose: () => void;
  onResize: (width: number) => void;
}

export function SupervisorPanel({
  activeTab,
  onTabChange,
  events,
  sandboxState,
  agentStates,
  onClose,
}: SupervisorPanelProps) {
  const tabs: { id: SupervisorTab; label: string; icon: React.ReactNode }[] = [
    { id: 'activity', label: 'Activity', icon: <ActivityIcon /> },
    { id: 'timeline', label: 'Timeline', icon: <TimelineIcon /> },
    { id: 'sandbox', label: 'Sandbox', icon: <SandboxIcon /> },
    { id: 'multiagent', label: 'Agents', icon: <AgentsIcon /> },
  ];

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Supervisor
        </h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-2 text-xs font-medium
              transition-colors
              ${activeTab === tab.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }
            `}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'activity' && (
          <ActivityFeed events={events} />
        )}
        {activeTab === 'timeline' && (
          <Timeline events={events} />
        )}
        {activeTab === 'sandbox' && (
          <SandboxPanel state={sandboxState} />
        )}
        {activeTab === 'multiagent' && (
          <MultiAgentPanel agents={agentStates} />
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-gray-200 p-3 dark:border-gray-700">
        <SupervisorControls />
      </div>
    </div>
  );
}
```

---

## 7. FLUJO DE DATOS COMPLETO

### 7.1 Diagrama de Flujo

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO COMPLETO DE DATOS                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USUARIO ENVÍA MENSAJE                                                   │
│     ┌─────────────┐                                                          │
│     │ ChatInput   │ ── POST /api/agents/chat ──► Backend                     │
│     └─────────────┘                                                          │
│                                    │                                         │
│                                    ▼                                         │
│  2. BACKEND PROCESA                                                            │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │  AgentController.process()                                           │ │
│     │                                                                     │ │
│     │  1. HandlerRegistry.emit('agent', { action: 'start' })             │ │
│     │  2. Agent ejecuta tools                                             │ │
│     │  3. HandlerRegistry.emit('tool_call', { tool: 'bash' })           │ │
│     │  4. Tool ejecuta                                                    │ │
│     │  5. HandlerRegistry.emit('tool_call_end', { result })             │ │
│     │  6. Agent responde                                                  │ │
│     │                                                                     │ │
│     │  /// EventBus                                                       │ │
│     │  EventBus.publish('agent.started', { agentId, sessionId })         │ │
│     │  EventBus.publish('tool.executed', { tool, result })               │ │
│     │                                                                     │ │
│     │  /// EventCollector                                                │ │
│     │  EventCollector.collect({ type: 'agent:tool_end', data })          │ │
│     │                                                                     │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  3. SSE AL FRONTEND                                                           │
│     Backend ──► res.write('event: tool_call\ndata: {...}\n\n')              │
│                                    │                                         │
│                                    ▼                                         │
│  4. FRONTEND RECIBE SSE                                                       │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │  useEventHandlers.ts                                                 │ │
│     │                                                                     │ │
│     │  socket.on('tool_call', (data) => {                               │ │
│     │    // 1. Actualizar UI del chat                                   │ │
│     │    showToolCallBanner(data);                                       │ │
│     │                                                                     │ │
│     │    // 2. Mapear a evento del supervisor                           │ │
│     │    const event = mapSSEToSupervisorEvent('tool_call', data);      │ │
│     │                                                                     │ │
│     │    // 3. Actualizar store de supervisor                           │ │
│     │    setEvents(prev => [...prev, event]);                            │ │
│     │    updateAgentState(event.agentId, event.type);                   │ │
│     │  });                                                               │ │
│     │                                                                     │ │
│     │  socket.on('message_end', (data) => {                             │ │
│     │    mapSSEToSupervisorEvent('message_end', data);                  │ │
│     │  });                                                               │ │
│     │                                                                     │ │
│     │  socket.on('error', (data) => {                                   │ │
│     │    mapSSEToSupervisorEvent('error', data);                        │ │
│     │  });                                                               │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  5. SUPERVISOR STORE (RECOIL)                                                │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │  eventsAtom: [event1, event2, event3, ...]                         │ │
│     │  agentStatesAtom: Map { agentId1: state1, agentId2: state2 }       │ │
│     │  sandboxStateAtom: { modifiedFiles: [], terminal: [] }             │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  6. UI SE ACTUALIZA                                                          │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │  SupervisorPanel                                                   │ │
│     │                                                                     │ │
│     │  ActivityFeed ──► Lista de eventos con iconos                     │ │
│     │  Timeline ──────► Línea de tiempo cronológica                     │ │
│     │  SandboxPanel ──► Archivos modificados, terminal                  │ │
│     │  MultiAgent ────► Estado de cada agente                           │ │
│     │                                                                     │ │
│     │  ChatView ───────► Tool execution banner en chat                   │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Secuencia de Eventos

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SECUENCIA DE EVENTOS                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Time    Actor              Event                     Supervisor Panel       │
│  ────    ─────              ─────                     ───────────────       │
│                                                                              │
│  10:00   User               Send message                                     │
│  10:00   Backend            agent:start              [●] Starting...       │
│  10:00   Backend            agent:thinking            [◐] Thinking...       │
│  10:01   Backend            agent:tool_start          [◐] bash_tool         │
│          │                  (npm install)              │                    │
│  10:01   Backend            agent:tool_end            [✓] bash_tool         │
│          │                  (exit: 0)                  │                    │
│  10:02   Backend            agent:tool_start          [◐] write_file        │
│          │                  (src/App.tsx)              │                    │
│  10:02   Backend            agent:tool_end            [✓] write_file       │
│          │                                              │                    │
│  10:03   Backend            agent:tool_start          [◐] read_file        │
│          │                  (src/index.tsx)             │                    │
│  10:03   Backend            agent:tool_end            [✓] read_file        │
│          │                                              │                    │
│  10:04   Backend            agent:complete            [✓] Done             │
│                                                                              │
│  10:04   Frontend           Message rendered         Panel shows summary    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

**Documento preparado para implementación.**
