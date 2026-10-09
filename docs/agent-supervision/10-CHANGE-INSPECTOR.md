# Change Inspector - Sistema de Revisión de Cambios

**Fecha:** 2026-07-21
**Versión:** 1.0

---

## Componentes

| Archivo | Descripción |
|---------|-------------|
| `changeInspectorStore.ts` | Estado de Recoil para cambios |
| `useChangeInspector.ts` | Hook para gestionar cambios |
| `DiffViewer.tsx` | Visualizador de diferencias |
| `ChangeInspector.tsx` | Panel principal de revisión |

---

## Uso Básico

```tsx
import { ChangeInspector } from '~/components/Chat/ActivityPanel';
import { useChangeInspector } from '~/hooks/useChangeInspector';

// Componente principal
<ChangeInspector />

// Hook
const {
  addFileCreated,
  addFileModified,
  addFileDeleted,
  approveChange,
  rejectChange,
  stats,
} = useChangeInspector();
```

---

## Hook useChangeInspector

### Estado

```typescript
const {
  pendingChanges,    // Cambios pendientes
  allChanges,       // Todos los cambios
  selectedChange,   // Cambio seleccionado
  stats,            // Estadísticas
} = useChangeInspector();
```

### Acciones

```typescript
// Agregar cambios
addFileCreated(path, content, options?)
addFileModified(path, oldContent, newContent, options?)
addFileDeleted(path, oldContent?, options?)

// Seleccionar
selectChange(changeId)

// Revisar
approveChange(changeId, note?)
rejectChange(changeId, reason?)

// Acciones masivas
approveAll(note?)
rejectAll(reason?)

// Estado
markAsApplied(changeId)
undoReview(changeId)
removeChange(changeId)
clearAll()
clearApplied()
```

---

## Tipos de Cambios

| Tipo | Descripción | Color |
|------|-------------|-------|
| `create` | Archivo nuevo | Verde |
| `modify` | Archivo modificado | Azul |
| `delete` | Archivo eliminado | Rojo |
| `rename` | Archivo renombrado | Amarillo |

---

## Estados de Revisión

| Estado | Descripción | Color |
|--------|-------------|-------|
| `pending` | Esperando revisión | Amarillo |
| `approved` | Aprobado por usuario | Verde |
| `rejected` | Rechazado por usuario | Rojo |
| `applied` | Aplicado al filesystem | Azul |

---

## Ejemplo: Integración

```tsx
import { ChangeInspector } from '~/components/Chat/ActivityPanel';
import { useChangeInspector } from '~/hooks/useChangeInspector';
import { getEventBus } from '~/services/EventBus';

export function ChatView() {
  const { addFileCreated, addFileModified, stats } = useChangeInspector();

  // Escuchar eventos del EventBus
  useEffect(() => {
    const eventBus = getEventBus();

    eventBus.subscribe('sandbox.file.written', (event) => {
      addFileCreated(event.payload.filePath, event.payload.content || '', {
        toolName: event.payload.toolName,
      });
    });

    eventBus.subscribe('sandbox.file.modified', (event) => {
      addFileModified(
        event.payload.filePath,
        event.payload.originalContent || '',
        event.payload.newContent || '',
      );
    });

  }, []);

  return (
    <div className="flex h-full">
      {/* Chat */}
      <div className="flex-1">
        <Messages />
      </div>

      {/* Inspector de cambios */}
      <div className="w-[500px] border-l">
        <ChangeInspector />
      </div>
    </div>
  );
}
```

---

## Vista Previa

```
┌─────────────────────────────────────────────────────────────┐
│ Cambios                                         [Filtro ▼] │
├─────────────────────────────────────────────────────────────┤
│ 🔧 Pendientes: 3  ✓ Aprobados: 5  ✗ Rechazados: 1         │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│ 🟢 + index.ts        ✓  │  index.ts                         │
│ 🔵 ~ utils.ts        ✓  │  ┌─────────────────────────────┐  │
│ 🔵 ~ app.js          ✓  │  │ - old line 1                │  │
│ 🔵 ~ config.json     ✓  │  │ + new line 1                 │  │
│ 🟢 + newfile.ts       ✓  │  │   unchanged line            │  │
│                          │  │ + added line                │  │
│                          │  └─────────────────────────────┘  │
│                          │                                  │
│                          │  [+12 -3]                        │
│                          │                                  │
├──────────────────────────┴──────────────────────────────────┤
│  [✓ Aprobar]  [✗ Rechazar]                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## DiffViewer

### Props

```typescript
interface DiffViewerProps {
  change: FileChange;           // Cambio a mostrar
  mode?: 'split' | 'unified'; // Modo de visualización
  showLineNumbers?: boolean;   // Mostrar números de línea
  maxHeight?: string;         // Altura máxima
}
```

### Características

- Resalta líneas añadidas (verde)
- Resalta líneas eliminadas (rojo)
- Muestra números de línea
- Copiar contenido al portapapeles
- Algoritmo LCS para diff preciso
