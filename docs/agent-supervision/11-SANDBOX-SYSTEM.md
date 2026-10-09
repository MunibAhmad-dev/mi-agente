# Sandbox System - Workspace Aislado

**Fecha:** 2026-07-21
**Versión:** 1.0

---

## Visión General

El sistema de Sandbox proporciona un entorno aislado para que el agente ejecute tareas antes de afectar el entorno principal. Permite revisar resultados y mantener una separación clara entre pruebas y producción.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        SandboxManager                           │
│  (Gestor centralizado de sandboxes)                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ FileSystem    │ │ Container     │ │ VM            │
│ Sandbox       │ │ Sandbox       │ │ Sandbox       │
│ (Implementado)│ │ (Stub)       │ │ (Stub)       │
└───────────────┘ └───────────────┘ └───────────────┘
```

---

## Componentes Backend

### Tipos (`packages/api/src/agents/sandbox/types.ts`)

```typescript
export type SandboxType = 'filesystem' | 'container' | 'vm' | 'mock';
export type SandboxStatus = 'inactive' | 'initializing' | 'active' | 'executing' | 'error' | 'disposed';

export interface SandboxConfig {
  type: SandboxType;
  id: string;
  workspacePath?: string;
  timeout?: number;
  maxMemory?: string;
  userId?: string;
  conversationId?: string;
}

export interface SandboxCapabilities {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canExecuteCommands: boolean;
  canUseNetwork: boolean;
  canUseBrowser: boolean;
  maxFileSize?: number;
  maxExecutionTime?: number;
}
```

### Interfaz Base (`SandboxInterface.ts`)

```typescript
export abstract class SandboxInterface {
  abstract initialize(): Promise<void>;
  abstract isReady(): boolean;
  abstract getCapabilities(): SandboxCapabilities;
  
  // Archivos
  abstract readFile(path: string): Promise<string>;
  abstract writeFile(path: string, content: string): Promise<void>;
  abstract deleteFile(path: string): Promise<void>;
  
  // Comandos
  abstract executeCommand(command: SandboxCommand): Promise<SandboxCommandResult>;
  
  // Cambios
  abstract getChanges(): Promise<SandboxDiff[]>;
  abstract applyChanges(): Promise<void>;
  abstract discardChanges(): Promise<void>;
  
  // Snapshots
  abstract createSnapshot(): Promise<SandboxSnapshot>;
  abstract restoreSnapshot(snapshotId: string): Promise<void>;
  
  // Limpieza
  abstract dispose(): Promise<void>;
}

// Factory para crear implementaciones
SandboxFactory.register('filesystem', FileSystemSandbox);
SandboxFactory.register('container', ContainerSandbox);
SandboxFactory.register('vm', VMSandbox);
```

### Manager (`SandboxManager.ts`)

```typescript
const manager = new SandboxManager({
  defaultType: 'filesystem',
  maxSandboxes: 10,
  autoCleanup: true,
  cleanupTimeout: 3600000,
});

// Crear sandbox
const sandboxId = await manager.createSandbox({
  type: 'filesystem',
  userId: 'user-123',
  conversationId: 'conv-456',
});

// Operar
await manager.writeFile(sandboxId, '/app.js', 'console.log("test")');
const result = await manager.executeCommand(sandboxId, 'npm test');

// Revisar cambios
const changes = await manager.getChanges(sandboxId);

// Aplicar o descartar
await manager.applyChanges(sandboxId); // o discardChanges(sandboxId)

// Destruir
await manager.destroySandbox(sandboxId);
```

---

## Componentes Frontend

### Hook (`useSandbox.ts`)

```tsx
import { useSandbox } from '~/hooks/useSandbox';

function App() {
  const {
    state,           // { id, isActive, isLoading, error }
    createSandbox,
    destroySandbox,
    writeFile,
    executeCommand,
    getChanges,
    applyChanges,
    discardChanges,
  } = useSandbox();

  return (
    <div>
      {!state.isActive ? (
        <button onClick={() => createSandbox({ userId: '123' })}>
          Iniciar Sandbox
        </button>
      ) : (
        <>
          <SandboxFiles sandboxId={state.id} />
          <SandboxTerminal sandboxId={state.id} />
          <ChangeInspector />
          
          <div className="actions">
            <button onClick={previewChanges}>Vista Previa</button>
            <button onClick={applyChanges}>Aplicar Cambios</button>
            <button onClick={discardChanges}>Descartar</button>
            <button onClick={destroySandbox}>Cerrar Sandbox</button>
          </div>
        </>
      )}
    </div>
  );
}
```

---

## Flujo de Trabajo

```
1. Crear Sandbox
   └─> SandboxManager.createSandbox()
       └─> Crea directorio temporal aislado
       └─> Inicializa estado

2. Agente Opera
   ├─> Lee archivos: sandbox.readFile()
   ├─> Escribe archivos: sandbox.writeFile()
   ├─> Ejecuta comandos: sandbox.executeCommand()
   └─> Cada operación se registra en ChangeInspector

3. Revisión de Cambios
   ├─> sandbox.getChanges() → SandboxDiff[]
   ├─> sandbox.previewChanges() → Preview
   └─> User revisa en ChangeInspector

4. Aplicar o Descartar
   ├─> applyChanges() → Copia archivos al entorno principal
   └─> discardChanges() → Limpia sandbox sin aplicar

5. Cleanup
   └─> destroySandbox() → Elimina directorio temporal
```

---

## Tipos de Sandbox

### FileSystem (Implementado)

- Crea directorio temporal en `/tmp/sandbox_<id>`
- Aislamiento mediante sistema de archivos
- Sin acceso a red
- Rápido y simple

### Container (Stub - Para Docker/Kubernetes)

```typescript
export class ContainerSandbox extends SandboxInterface {
  private containerId: string;
  
  async initialize() {
    // docker create --isolated --network=none
  }
  
  async executeCommand(cmd) {
    // docker exec <container> <command>
  }
}
```

### VM (Stub - Para VMs completas)

```typescript
export class VMSandbox extends SandboxInterface {
  private vmId: string;
  
  async initialize() {
    // Crear VM con hypervisor
  }
}
```

---

## Eventos del EventBus

```typescript
// Creación
eventBus.publish('sandbox.created', { sandboxId, workspacePath });

// Archivos
eventBus.publish('sandbox.file.created', { sandboxId, path });
eventBus.publish('sandbox.file.modified', { sandboxId, path, type });
eventBus.publish('sandbox.file.deleted', { sandboxId, path });

// Comandos
eventBus.publish('sandbox.command.started', { sandboxId, command });
eventBus.publish('sandbox.command.completed', { sandboxId, exitCode, duration });
eventBus.publish('sandbox.command.error', { sandboxId, error });

// Cambios
eventBus.publish('sandbox.changes.applying', { sandboxId });
eventBus.publish('sandbox.changes.applied', { sandboxId });
eventBus.publish('sandbox.changes.discarded', { sandboxId });

// Destrucción
eventBus.publish('sandbox.destroyed', { sandboxId });
```

---

## Integración con ChangeInspector

```typescript
// Cuando se escribe archivo en sandbox
await sandbox.writeFile('/app.js', newContent);
addFileModified('/app.js', originalContent, newContent);

// Cuando se elimina archivo en sandbox
await sandbox.deleteFile('/old.js');
addFileDeleted('/old.js', originalContent);

// Al aplicar cambios
const changes = await sandbox.getChanges();
await sandbox.applyChanges();

// Los cambios quedan en ChangeInspector para revisión
```

---

## Uso con Componentes

```tsx
// SandboxProvider
<SandboxProvider>
  <ChatView>
    <Messages />
    <SandboxPanel /> {/* Panel lateral con archivos */}
    <AgentStatusBar />
  </ChatView>
</SandboxProvider>

// SandboxPanel
function SandboxPanel() {
  const { sandbox } = useSandbox();
  const files = sandbox?.listFiles('/');
  
  return (
    <div className="sandbox-panel">
      <h3>Archivos del Sandbox</h3>
      {files?.map(f => (
        <FileItem key={f} path={f} />
      ))}
    </div>
  );
}
```
