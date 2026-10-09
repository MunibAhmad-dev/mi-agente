# Activity Bar - Panel Inferior

**Fecha:** 2026-07-21
**Versión:** 1.0

---

## Componente: `AgentStatusBar`

### Ubicación
```
client/src/components/Chat/ActivityPanel/
├── AgentStatusBar.tsx    ← Componente principal
├── AgentStatusBar.css    ← Estilos
└── index.ts             ← Exports actualizados
```

---

## Uso Básico

```tsx
import { AgentStatusBar, AgentActivity } from '~/components/Chat/ActivityPanel';

// Estado por defecto
<AgentStatusBar />

// Con actividad
<AgentStatusBar 
  activity={{
    status: 'thinking',
    action: 'Analizando código...',
    tool: 'reasoning',
    timestamp: new Date(),
  }}
/>

// Versión compacta
<AgentStatusBar 
  activity={activity}
  compact={true}
/>
```

---

## Props

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `activity` | `AgentActivity \| null` | `null` | Actividad actual del agente |
| `compact` | `boolean` | `false` | Modo compacto (una línea) |

---

## Tipo: `AgentActivity`

```typescript
export interface AgentActivity {
  status: AgentStatus;      // Estado del agente
  action: string;           // Acción actual
  tool?: string;            // Herramienta en uso
  progress?: number;        // Progreso (0-1)
  duration?: number;        // Duración en ms
  timestamp: Date;          // Tiempo de inicio
}
```

---

## Tipo: `AgentStatus`

```typescript
export type AgentStatus = 
  | 'idle'        // Esperando
  | 'thinking'    // Pensando/procesando
  | 'executing'   // Ejecutando herramienta
  | 'completed'   // Completado
  | 'error';     // Error
```

---

## Estados Visuales

| Estado | Color | Icono | Label |
|--------|-------|-------|-------|
| `idle` | Gris | Clock | Esperando |
| `thinking` | Ámbar | Loader2 (spin) | Pensando |
| `executing` | Azul | Loader2 (spin) | Ejecutando |
| `completed` | Verde | CheckCircle | Completado |
| `error` | Rojo | XCircle | Error |

---

## Ejemplo: Integración con ChatView

```tsx
// client/src/components/Chat/ChatView.tsx
import { AgentStatusBar } from '~/components/Chat/ActivityPanel';
import { useRecoilState } from 'recoil';

export function ChatView() {
  const [currentActivity, setCurrentActivity] = useState(null);

  return (
    <div className="flex flex-col h-full">
      {/* Chat principal */}
      <div className="flex-1 overflow-auto">
        <Messages />
      </div>

      {/* Panel de actividad (inferior) */}
      <AgentStatusBar activity={currentActivity} />

      {/* Input */}
      <ChatInput />
    </div>
  );
}
```

---

## Ejemplo: Escuchando Eventos del EventBus

```tsx
// hooks/useAgentActivity.ts
import { useState, useEffect } from 'react';
import { getEventBus } from '~/services/EventBus';
import type { AgentActivity } from '~/components/Chat/ActivityPanel';

export function useAgentActivity(): AgentActivity | null {
  const [activity, setActivity] = useState<AgentActivity | null>(null);

  useEffect(() => {
    const eventBus = getEventBus();

    // Escuchar eventos de herramientas
    const unsubToolStart = eventBus.subscribe('chat.tool.started', (event) => {
      setActivity({
        status: 'executing',
        action: `Ejecutando ${event.payload.toolName}`,
        tool: event.payload.toolName,
        timestamp: new Date(event.timestamp),
      });
    });

    const unsubToolEnd = eventBus.subscribe('chat.tool.ended', (event) => {
      setActivity({
        status: 'completed',
        action: `${event.payload.toolName} completado`,
        tool: event.payload.toolName,
        duration: event.payload.duration,
        timestamp: new Date(event.timestamp),
      });
    });

    // Escuchar pensamiento del agente
    const unsubThinking = eventBus.subscribe('chat.agent.thinking', (event) => {
      setActivity({
        status: 'thinking',
        action: 'Pensando...',
        tool: undefined,
        timestamp: new Date(event.timestamp),
      });
    });

    // Limpiar al desmontar
    return () => {
      unsubToolStart();
      unsubToolEnd();
      unsubThinking();
    };
  }, []);

  return activity;
}
```

---

## Estilos CSS

```css
/* AgentStatusBar.css */

/* Animación de spin */
.animate-spin {
  animation: spin 1s linear infinite;
}

/* Barra de progreso */
.progress-bar {
  width: 5rem;
  height: 0.25rem;
  background: #e5e7eb;
  border-radius: 9999px;
}

.progress-fill {
  height: 100%;
  background: #6366f1; /* accent-color */
  transition: width 0.3s ease-in-out;
}

/* Estados */
.status-idle { color: #6b7280; }
.status-thinking { color: #f59e0b; }
.status-executing { color: #6366f1; }
.status-completed { color: #22c55e; }
.status-error { color: #ef4444; }
```

---

## Iconos de Herramientas

| Herramienta | Icono |
|-------------|-------|
| bash, terminal, command | Terminal |
| read, file | FileText |
| search | Search |
| code, edit, write | Code |
| folder, list | FolderOpen |
| browser, navigate | Globe |
| otras | Bot |

---

## Compact vs Normal

### Normal
```
┌─────────────────────────────────────────────────────────────────┐
│ [🕐] Pensando    │  Analizando código...  │ [code]  │ ████░░ 60% │ [2.3s] │
└─────────────────────────────────────────────────────────────────┘
```

### Compact
```
[🕐] Pensando  Analizando...  2.3s
```
