# Timeline - Historial Completo de Actividades

**Fecha:** 2026-07-21
**Versión:** 1.0

---

## Componentes

| Archivo | Descripción |
|---------|-------------|
| `timelineStore.ts` | Estado de Recoil para la timeline |
| `useTimeline.ts` | Hook para gestionar la timeline |
| `TimelineViewer.tsx` | Componente React para mostrar la timeline |

---

## Uso Básico

```tsx
import { TimelineViewer } from '~/components/Chat/ActivityPanel';
import { useTimeline } from '~/hooks/useTimeline';

// Componente de visualización
<TimelineViewer />

// Con opciones
<TimelineViewer 
  maxItems={100}
  showStats={true}
  showFilters={true}
/>
```

---

## Hook useTimeline

### Estado

```typescript
const { 
  events,      // TimelineEvent[]
  stats,        // Estadísticas
  duration,    // Duración total en ms
  isActive,    // boolean
} = useTimeline();
```

### Acciones

```typescript
// Iniciar sesión
startSession(sessionId?: string)

// Finalizar sesión
endSession()

// Agregar evento personalizado
addEvent(type, title, options)

// Limpiar timeline
clearTimeline()

// Actualizar evento
updateEvent(eventId, updates)
```

### Helpers

```typescript
// Sesión
recordSessionStart()
recordSessionEnd()

// Herramientas
recordToolStart(toolName, description?)
recordToolEnd(toolName, { duration?, success?, error? })
recordToolError(toolName, error)

// Archivos
recordFileRead(filePath, duration?)
recordFileWrite(filePath, duration?)
recordFileDelete(filePath)

// Comandos
recordCommandStart(command, description?)
recordCommandEnd(command, { duration?, exitCode?, success? })
recordCommandError(command, error)

// Agente
recordAgentThinking(description?)
recordAgentResponse(description?)

// Errores y hitos
recordError(error, context?)
recordMilestone(title, description?)
```

---

## Tipos de Eventos

| Tipo | Label | Color | Icono |
|------|-------|-------|-------|
| `session_start` | Inicio | Azul | Play |
| `session_end` | Fin | Azul | RotateCcw |
| `tool_start` | Tool | Azul | Terminal |
| `tool_end` | Tool | Verde | Terminal |
| `tool_error` | Error | Rojo | AlertCircle |
| `file_read` | Lectura | Azul | FileText |
| `file_write` | Escritura | Azul | FilePlus |
| `file_delete` | Eliminar | Azul | FileMinus |
| `command_start` | Comando | Azul | Terminal |
| `command_end` | Comando | Verde | Terminal |
| `command_error` | Error | Rojo | XCircle |
| `agent_thinking` | Pensando | Ámbar | Bot |
| `agent_response` | Respuesta | Ámbar | Bot |
| `error` | Error | Rojo | AlertCircle |
| `milestone` | Hito | Púrpura | CheckCircle |

---

## Ejemplo: Integración con ChatView

```tsx
import { TimelineViewer } from '~/components/Chat/ActivityPanel';
import { useTimeline } from '~/hooks/useTimeline';

export function ChatView() {
  const { 
    startSession, 
    recordToolStart, 
    recordToolEnd,
    recordFileRead,
    recordCommandEnd,
  } = useTimeline();

  // Iniciar timeline cuando empieza el chat
  useEffect(() => {
    startSession();
  }, []);

  // Función para registrar actividad
  const onToolCall = (toolName: string) => {
    recordToolStart(toolName);
  };

  return (
    <div className="flex h-full">
      {/* Chat */}
      <div className="flex-1">
        <Messages />
      </div>

      {/* Timeline */}
      <div className="w-80 border-l">
        <TimelineViewer showStats={true} />
      </div>
    </div>
  );
}
```

---

## Ejemplo: Conectar con EventBus

```tsx
import { useTimeline } from '~/hooks/useTimeline';
import { getEventBus } from '~/services/EventBus';

export function useTimelineFromEvents() {
  const {
    recordToolStart,
    recordToolEnd,
    recordToolError,
    recordFileRead,
    recordFileWrite,
    recordCommandEnd,
    recordCommandError,
    recordSessionStart,
    recordSessionEnd,
  } = useTimeline();

  useEffect(() => {
    const eventBus = getEventBus();

    // Inicio de sesión
    eventBus.subscribe('supervisor.session.created', () => {
      recordSessionStart();
    });

    // Herramientas
    eventBus.subscribe('chat.tool.started', (event) => {
      recordToolStart(event.payload.toolName);
    });

    eventBus.subscribe('chat.tool.ended', (event) => {
      recordToolEnd(event.payload.toolName, {
        duration: event.payload.duration,
        success: !event.payload.error,
      });
    });

    eventBus.subscribe('chat.tool.error', (event) => {
      recordToolError(event.payload.toolName, event.payload.error);
    });

    // Archivos
    eventBus.subscribe('sandbox.file.read', (event) => {
      recordFileRead(event.payload.filePath, event.payload.duration);
    });

    eventBus.subscribe('sandbox.file.written', (event) => {
      recordFileWrite(event.payload.filePath, event.payload.duration);
    });

    // Comandos
    eventBus.subscribe('sandbox.command.executed', (event) => {
      recordCommandEnd(event.payload.command, {
        exitCode: event.payload.exitCode,
        duration: event.payload.duration,
      });
    });

    eventBus.subscribe('sandbox.command.error', (event) => {
      recordCommandError(event.payload.command, event.payload.stderr);
    });

    // Fin de sesión
    eventBus.subscribe('supervisor.session.ended', () => {
      recordSessionEnd();
    });

  }, []);

  return useTimeline();
}
```

---

## Estadísticas Disponibles

```typescript
interface TimelineStats {
  totalEvents: number;
  toolsExecuted: number;
  toolsSucceeded: number;
  toolsFailed: number;
  commandsExecuted: number;
  commandsSucceeded: number;
  commandsFailed: number;
  filesRead: number;
  filesWritten: number;
  filesDeleted: number;
  errors: number;
  duration: number; // ms
}
```

---

## Vista Previa

```
┌─────────────────────────────────────┐
│ Timeline                      12  │
├─────────────────────────────────────┤
│ 🔧 Herramientas: 5  📄 Archivos: 3 │
│ ❌ Errores: 1  ⏱️ Duración: 2m 15s │
├─────────────────────────────────────┤
│                                     │
│ ●━━━ Inicio                         │
│   10:30:45  Inicio                 │
│   10:30:46  💻 Pensando...    ✓    │
│                                     │
│ ◐━━━ Ejecutando: npm test    ✓     │
│   10:31:02  Tool            ✓      │
│   10:31:02  Leyó: app.js    ✓      │
│                                     │
│ ◐━━━ Escribió: utils.ts      ✓      │
│   10:32:15  Tool            ✓      │
│                                     │
│ ●━━━ npm test completado      ✓     │
│   10:32:30  Comando          ✓      │
│                                     │
└─────────────────────────────────────┘
```
