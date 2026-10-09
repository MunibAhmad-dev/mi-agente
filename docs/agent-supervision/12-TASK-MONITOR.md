# Task Monitor - Navegador, Terminal, Herramientas y Procesos

**Fecha:** 2026-07-21
**Versión:** 1.0

---

## Visión General

TaskMonitor es un panel en tiempo real que muestra:
- **Navegador**: Estado del navegador y URLs visitadas
- **Terminal**: Salida de comandos en tiempo real
- **Herramientas**: Ejecución de herramientas del agente
- **Procesos**: Procesos en ejecución

---

## Componentes

| Componente | Descripción |
|------------|-------------|
| `TaskMonitor.tsx` | Panel principal con tabs |
| `BrowserPanel.tsx` | Visualización del navegador |
| `TerminalPanel.tsx` | Terminal en tiempo real |
| `ToolsPanel.tsx` | Lista de herramientas ejecutadas |
| `ProcessPanel.tsx` | Lista de procesos |

---

## Uso Básico

```tsx
import { TaskMonitor } from '~/components/Chat/ActivityPanel';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';

// Componente principal
<TaskMonitor />

// Con configuración
<TaskMonitor 
  defaultPanel="terminal"
  showTabs={true}
  showHeader={true}
/>

// Hook para управление
const {
  activePanel,
  setActivePanel,
  browser,
  terminalEntries,
  runningTools,
  activeProcesses,
  // ...
} = useTaskMonitor();
```

---

## Hook useTaskMonitor

### Panel Activo

```typescript
// Cambiar panel activo
setActivePanel('terminal');
setActivePanel('browser');
setActivePanel('tools');
setActivePanel('processes');

// Toggle live mode
toggleLive();
```

### Navegador

```typescript
// Navegar a URL
browserNavigate('https://example.com');

// Actualizar estado
browserLoaded('Page Title');
browserError('Error message');
browserScreenshot('base64...');

// Abrir/cerrar
browserOpen();
browserClose();
```

### Terminal

```typescript
// Agregar entradas
terminalInput('npm install');
terminalOutput('Installing dependencies...');
terminalError('Command failed');
terminalSystem('Process completed');

// Configurar
terminalSetCwd('/workspace/project');
terminalSetExecuting(true);
terminalClear();
```

### Procesos

```typescript
// Iniciar proceso
const processId = processStart('npm test', 'npm test');

// Completar proceso
processComplete(processId, { exitCode: 0 });

// Fallar proceso
processComplete(processId, { exitCode: 1, status: 'failed' });

// Matar proceso
processKill(processId);

// Actualizar estado
processUpdate(processId, { cpu: 45.2, memory: 128 });

// Limpiar completados
processClearCompleted();
```

### Herramientas

```typescript
// Iniciar herramienta
const toolId = toolStart('read_file', { path: '/app.js' });

// Completar
toolComplete(toolId, { content: 'file content...' });

// Fallar
toolFail(toolId, 'File not found');
```

---

## Vista Previa

```
┌─────────────────────────────────────────────────────────────────┐
│ Monitor                            ● Live    [W:2] [P:1] [↻]   │
├─────────────────────────────────────────────────────────────────┤
│ Herramientas | Terminal | Navegador | Procesos                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ●━━━ read_file                      ✓ 1.2s                     │
│   Args: { path: '/app.js' }                                    │
│                                                                 │
│ ●━━━ bash_tool                       ⟳ 3.5s                     │
│   $ npm test                                                 │
│                                                                 │
│ ●━━━ write_file                      ✓ 0.8s                     │
│   Result: { bytesWritten: 1024 }                               │
│                                                                 │
│ ●━━━ browser_use                     ✗ 2.1s                     │
│   Error: Navigation timeout                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integración con EventBus

```typescript
import { getEventBus } from '~/services/EventBus';

const eventBus = getEventBus();

// Herramientas
eventBus.subscribe('tool.started', (event) => {
  toolStart(event.payload.name, event.payload.args);
});

eventBus.subscribe('tool.completed', (event) => {
  toolComplete(event.payload.id, event.payload.result);
});

// Terminal
eventBus.subscribe('terminal.output', (event) => {
  terminalOutput(event.payload.content);
});

// Navegador
eventBus.subscribe('browser.navigated', (event) => {
  browserNavigate(event.payload.url);
});
```

---

## Personalización

### Solo Terminal

```tsx
<TaskMonitor defaultPanel="terminal" showTabs={false} />
```

### Solo con Tabs Personalizados

```tsx
<div className="flex gap-4">
  <BrowserPanel className="w-1/2 h-64" />
  <TerminalPanel className="w-1/2 h-64" />
</div>
```

### Panel Expandible

```tsx
<Drawer>
  <TaskMonitor />
</Drawer>
```

---

## Estados Visuales

### Live Indicator
- Verde con pulso: Activo
- Gris: Pausado

### Herramientas
- Amarillo (pulse): En ejecución
- Verde: Completado
- Rojo: Fallido

### Procesos
- Verde (pulse): Ejecutando
- Azul: Completado
- Rojo: Fallido
- Amarillo: Detenido
