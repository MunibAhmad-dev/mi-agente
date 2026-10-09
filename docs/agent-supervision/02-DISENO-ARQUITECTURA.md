# DISEÑO DE ARQUITECTURA - SISTEMA DE SUPERVISIÓN DE AGENTES

**Fecha:** 2026-07-20  
**Versión:** 1.0  
**Estado:** 📝 Diseño Completado

---

## TABLA DE CONTENIDOS

1. [Visión General](#visión-general)
2. [Arquitectura Propuesta](#arquitectura-propuesta)
3. [Mejora 1: Centro de Actividades](#mejora-1-centro-de-actividades)
4. [Mejora 2: Línea de Tiempo](#mejora-2-línea-de-tiempo)
5. [Mejora 3: Sandbox/Workspace Virtual](#mejora-3-sandboxworkspace-virtual)
6. [Mejora 4: Sistema de Promoción](#mejora-4-sistema-de-promoción)
7. [Mejora 5: Control Visual del Navegador](#mejora-5-control-visual-del-navegador)
8. [Mejora 6: Control Multi-Agente](#mejora-6-control-multi-agente)
9. [Mejora 7: Sistema de Permisos](#mejora-7-sistema-de-permisos)
10. [Mejora 8: Replay de Sesiones](#mejora-8-replay-de-sesiones)
11. [Mejora 9: Comparación de Cambios](#mejora-9-comparación-de-cambios)
12. [Modelo de Datos](#modelo-de-datos)
13. [API Endpoints](#api-endpoints)
14. [Flujo de Eventos](#flujo-de-eventos)
15. [Consideraciones de Seguridad](#consideraciones-de-seguridad)

---

## 1. VISIÓN GENERAL

### 1.1 Objetivo

Crear un sistema de supervisión que permita a los usuarios:
- **Visualizar** la actividad de los agentes en tiempo real
- **Controlar** qué acciones pueden realizar los agentes
- **Revisar** cambios antes de aplicarlos
- **Auditar** todas las operaciones realizadas
- **Colaborar** con múltiples agentes especializados

### 1.2 Principios de Diseño

1. **Modularidad** - Cada componente es independiente y reutilizable
2. **Extensibilidad** - Fácil agregar nuevos tipos de eventos, herramientas, agentes
3. **Seguridad** - Sandbox por defecto, promoción explícita de cambios
4. **Observabilidad** - Todo evento es rastreable y reproducible
5. **Rendimiento** - Eventos procesados de forma asíncrona

### 1.3 Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| **Frontend** | React + TypeScript |
| **Estado** | Recoil (existente) + WebSockets |
| **Backend** | Express + Socket.IO |
| **Almacenamiento** | MongoDB (eventos) + Redis (cache) |
| **Sandbox** | Docker containers |
| **Diffing** | diff2html |

---

## 2. ARQUITECTURA PROPUESTA

### 2.1 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ ActivityFeed  │  │ TimelineView │  │ SandboxPanel│  │ AgentControl │   │
│  │              │  │              │  │              │  │              │   │
│  │ • Estado     │  │ • Timeline   │  │ • Preview   │  │ • Multi-agent│   │
│  │ • Herramienta│  │ • Eventos    │  │ • Terminal  │  │ • Permisos   │   │
│  │ • Acción     │  │ • Intervalos │  │ • Archivos  │  │ • Control    │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                  │                  │                  │            │
│         └──────────────────┴────────┬─────────┴──────────────────┘            │
│                                     │                                       │
│                          ┌──────────▼──────────┐                           │
│                          │   SupervisorStore   │                           │
│                          │   (WebSocket)       │                           │
│                          └──────────┬──────────┘                           │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ Socket.IO
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Express)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │  EventCollector    │  │  SandboxManager    │  │  PromotionService  │   │
│  │                    │  │                    │  │                    │   │
│  │  • Recibe eventos  │  │  • Crea containers │  │  • Pending changes │   │
│  │  • Persiste en DB  │  │  • Copia archivos │  │  • Diff generation │   │
│  │  • Emite a WS      │  │  • Aplica/descarta│  │  • User approval   │   │
│  └─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘   │
│            │                       │                       │              │
│            ▼                       ▼                       ▼              │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │     MongoDB       │  │      Docker        │  │      MongoDB       │   │
│  │  (event_store)    │  │   (Sandboxes)     │  │  (change_queue)   │   │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     @librechat/agents (Existente)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Graph execution                                                           │
│  • Tool execution                                                           │
│  • Sub-agents                                                               │
│  • Checkpointing (LazyMongoSaver)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Flujo de Datos

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FLUJO DE DATOS                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. AGENTE EJECUTA                                                          │
│     Run.processStream() ──► HandlerRegistry.emit('tool_execute', data)      │
│                                                                              │
│  2. EVENT COLLECTOR                                                         │
│     HandlerRegistry ──► EventCollector.collect(event) ──► MongoDB           │
│                                           │                                  │
│                                           ▼                                  │
│  3. WEBSOCKET EMISOR                                                        │
│     EventCollector ──► Socket.IO emit('agent:event', event) ──► Frontend    │
│                                                                              │
│  4. FRONTEND                                                                │
│     Socket.IO ──► SupervisorStore (Recoil) ──► ActivityFeed, Timeline       │
│                                                                              │
│  5. SANDBOX                                                                │
│     Tool Execution ──► SandboxManager.prepare() ──► Docker container        │
│                                         │                                   │
│                                         ▼                                   │
│                               SandboxManager.apply() ──► Pending Changes    │
│                                                                              │
│  6. PROMOCIÓN                                                               │
│     User approves ──► PromotionService.apply() ──► Production workspace    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. MEJORA 1: CENTRO DE ACTIVIDADES

### 3.1 Descripción

Interfaz donde el usuario puede ver en tiempo real qué está haciendo el agente.

### 3.2 Componentes

```tsx
// client/src/components/Supervisor/ActivityFeed/
├── ActivityFeed.tsx           // Componente principal
├── ActivityItem.tsx           // Item individual de actividad
├── ActivityIcon.tsx           // Icono por tipo de herramienta
├── ActivityTimestamp.tsx      // Timestamp formateado
└── ActivityStatus.tsx         // Estado (pending, running, done, error)
```

### 3.3 Modelo de Datos

```typescript
// Tipos de eventos de actividad
type ActivityEventType = 
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

interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  agentId: string;
  sessionId: string;
  timestamp: Date;
  data: {
    tool?: string;
    action?: string;
    target?: string;
    content?: string;
    status?: 'pending' | 'running' | 'done' | 'error';
    duration?: number;
    error?: string;
  };
  metadata: {
    userId: string;
    conversationId?: string;
    parentEventId?: string;
  };
}
```

### 3.4 Diseño de UI

```
┌─────────────────────────────────────────────────────────────┐
│  🔴 Actividad del Agente                              ⚙️   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐  │
│  │ ●●●●●●●○○○  Thinking...                              │  │
│  │                                                       │  │
│  │ ✓ [file] Leído: src/utils/helper.ts                │  │
│  │ ◐ [terminal] Ejecutando: npm test                   │  │
│  │ ● [edit] Modificando: src/components/Button.tsx     │  │
│  │ ✓ [browser] Navegado a: github.com                   │  │
│  │ ○ [terminal] Esperando confirmación...              │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                              │
│  ▸ Detalles expandibles para cada evento                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.5 Iconos por Herramienta

| Herramienta | Icono | Color |
|-------------|-------|-------|
| `bash_tool` | ⌨️ Terminal | #10B981 |
| `read_file` | 📄 Archivo | #3B82F6 |
| `create_file` | ➕ Archivo | #22C55E |
| `edit_file` | ✏️ Editar | #F59E0B |
| `delete_file` | 🗑️ Eliminar | #EF4444 |
| `browser_use` | 🌐 Navegador | #8B5CF6 |
| `mcp_*` | 🔌 MCP | #EC4899 |

---

## 4. MEJORA 2: LÍNEA DE TIEMPO

### 4.1 Descripción

Historial visual cronológico de todas las acciones del agente.

### 4.2 Componentes

```tsx
// client/src/components/Supervisor/Timeline/
├── Timeline.tsx              // Componente principal
├── TimelineEntry.tsx       // Entrada individual
├── TimelineMarker.tsx       // Marcador de tiempo
├── TimelineGroup.tsx        // Grupo de eventos por hora
└── TimelineConnector.tsx    // Línea conectora
```

### 4.3 Diseño de UI

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Línea de Tiempo                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ 10:30 ──────────────────────────────────────────────┐  │
│  │                                                          │  │
│  │  10:30:15  ● Solicitud recibida                        │  │
│  │            │                                           │  │
│  │  10:30:22  ├─► Analizando proyecto...                  │  │
│  │            │                                           │  │
│  │  10:31:05  ├─► Leyendo archivos...                     │  │
│  │            │  └─ src/components/Chat/ChatView.tsx     │  │
│  │            │  └─ api/server/controllers/...            │  │
│  │            │                                           │  │
│  │  10:33:40  ├─► Modificando código...                   │  │
│  │            │  ├─ ✏️ ChatView.tsx (125 líneas)          │  │
│  │            │  └─ ✏️ useSSE.ts (42 líneas)             │  │
│  │            │                                           │  │
│  │  10:35:12  ├─► Ejecutando pruebas...                   │  │
│  │            │  └─ ⌨️ npm test -- --coverage            │  │
│  │            │                                           │  │
│  │  10:40:05  ●✓ Completado exitosamente                   │  │
│  │            │                                           │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  [◀ Anterior]                              [Siguiente ▶]    │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Funcionalidades

1. **Agrupación por hora** - Eventos agrupados visualmente
2. **Zoom** - Ver más o menos detalle
3. **Filtros** - Por tipo de evento, herramienta, estado
4. **Búsqueda** - Buscar en contenido de eventos
5. **Exportar** - Descargar como JSON/Markdown

---

## 5. MEJORA 3: SANDBOX/WORKSPACE VIRTUAL

### 5.1 Descripción

Entorno aislado donde los agentes pueden trabajar sin afectar el sistema principal.

### 5.2 Arquitectura de Sandbox

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURA DE SANDBOX                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐         ┌──────────────────┐                       │
│   │ Production        │         │ Sandbox          │                       │
│   │ Workspace         │         │ Workspace        │                       │
│   │                   │         │                  │                       │
│   │ /workspace/main   │◄───────►│ /workspace/sbx/ │                       │
│   │ (Real files)      │  sync   │ (Copy)           │                       │
│   │                   │         │                  │                       │
│   └──────────────────┘         └──────────────────┘                       │
│            ▲                            │                                   │
│            │                            │                                   │
│            │                            │                                   │
│   ┌────────┴────────────────────────────┴────────┐                        │
│   │              SandboxManager                    │                        │
│   │                                               │                        │
│   │  • createSandbox(sessionId, userId)          │                        │
│   │  • syncWorkspace(sandboxId)                   │                        │
│   │  • getPendingChanges(sandboxId)              │                        │
│   │  • applyChanges(sandboxId, changes)          │                        │
│   │  • discardChanges(sandboxId)                 │                        │
│   │  • destroySandbox(sandboxId)                 │                        │
│   └───────────────────────────────────────────────┘                        │
│                              │                                               │
│                              ▼                                               │
│   ┌──────────────────────────────────────────────────┐                     │
│   │              Docker Container                      │                     │
│   │                                                  │                     │
│   │   • Isolated filesystem                         │                     │
│   │   • Limited resources (CPU, memory)            │                     │
│   │   • Network isolation                          │                     │
│   │   • Read-only system directories               │                     │
│   │                                                  │                     │
│   └──────────────────────────────────────────────────┘                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 API del SandboxManager

```typescript
// api/server/services/Supervisor/SandboxManager.js

class SandboxManager {
  // Crear nuevo sandbox
  async createSandbox(params: {
    sessionId: string;
    userId: string;
    workspacePath: string;
    resources?: { cpu?: string; memory?: string };
  }): Promise<Sandbox> {
    // 1. Copiar workspace al sandbox
    // 2. Crear Docker container
    // 3. Configurar límites
    // 4. Iniciar agente
  }

  // Obtener estado del sandbox
  async getSandboxStatus(sandboxId: string): Promise<SandboxStatus>;

  // Ejecutar comando en sandbox
  async executeInSandbox(sandboxId: string, command: string): Promise<ExecutionResult>;

  // Leer archivo del sandbox
  async readFile(sandboxId: string, path: string): Promise<string>;

  // Listar archivos modificados
  async getModifiedFiles(sandboxId: string): Promise<FileChange[]>;

  // Sincronizar cambios al workspace real
  async promoteChanges(sandboxId: string, filePaths: string[]): Promise<PromotionResult>;

  // Descartar todos los cambios
  async discardChanges(sandboxId: string): Promise<void>;

  // Destruir sandbox
  async destroySandbox(sandboxId: string): Promise<void>;
}
```

### 5.4 Componentes Frontend

```tsx
// client/src/components/Supervisor/Sandbox/
├── SandboxPanel.tsx           // Panel principal del sandbox
├── SandboxTerminal.tsx        // Terminal integrada
├── SandboxFileTree.tsx       // Árbol de archivos
├── SandboxPreview.tsx        // Preview de archivos
├── SandboxChanges.tsx        // Lista de cambios pendientes
└── SandboxControls.tsx       // Controles (play, pause, apply, discard)
```

### 5.5 Diseño de UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏖️ Sandbox: session-abc123                              [Apply] [Discard] │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐ │
│  │ 📁 Explorador de Archivos   │  │ 📝 Editor/Preview                   │ │
│  │                             │  │                                     │ │
│  │ ▼ src/                      │  │ // Preview de archivo                │ │
│  │   ▼ components/             │  │ const x = 1;                        │ │
│  │     ▼ Chat/                 │  │                                     │ │
│  │       ChatView.tsx    [M]  │  │                                     │ │
│  │       MessagesView.tsx     │  │                                     │ │
│  │   ▼ api/                    │  │                                     │ │
│  │     ▼ server/               │  │                                     │ │
│  │       controller.js   [M]  │  │                                     │ │
│  │                             │  │                                     │ │
│  │   [M] = Modificado          │  │                                     │ │
│  │   [A] = Agregado            │  │                                     │ │
│  │   [E] = Eliminado           │  │                                     │ │
│  └─────────────────────────────┘  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⌨️ Terminal                                          [Clear]        │   │
│  │ > npm test -- --coverage                                               │   │
│  │ > Test Suites: 3 passed, 3 total                                      │   │
│  │ > Tests: 53 passed                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. MEJORA 4: SISTEMA DE PROMOCIÓN

### 6.1 Flujo de Promoción

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO DE PROMOCIÓN                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   SANDBOX                        REVISIÓN                    PRODUCCIÓN     │
│   ┌─────────┐                  ┌─────────┐                  ┌─────────┐    │
│   │ Archivos│                  │ Cambios │                  │ Archivos│    │
│   │ Modificados                  │ Pendientes                │ Actualizados  │
│   └────┬────┘                  └────┬────┘                  └────┬────┘    │
│        │                            │                            │          │
│        ▼                            │                            │          │
│   ┌─────────┐                      │                            │          │
│   │ Cambios │──────────────────────►│                            │          │
│   │ Pendientes                    │                            │          │
│   └─────────┘                      │                            │          │
│                                    ▼                            │          │
│                               ┌─────────┐                      │          │
│                               │ Diff    │                      │          │
│                               │ Viewer  │                      │          │
│                               └────┬────┘                      │          │
│                                    │                            │          │
│                          ┌─────────┴─────────┐                │          │
│                          │                     │                │          │
│                          ▼                     ▼                │          │
│                    ┌───────────┐         ┌───────────┐          │          │
│                    │  ✓ Aprobar │         │  ✗ Rechazar │          │          │
│                    └─────┬─────┘         └─────┬─────┘          │          │
│                          │                     │                │          │
│                          ▼                     ▼                │          │
│                    ┌───────────┐         ┌───────────┐          │          │
│                    │ Aplicar  │         │ Descartar │          │          │
│                    │ Cambios  │         │ Cambios   │          │          │
│                    └─────┬─────┘         └───────────┘          │          │
│                          │                                        │          │
│                          ▼                                        ▼          │
│   ┌─────────┐      ┌─────────┐                              ┌─────────┐    │
│   │ Archivos│      │ git     │                              │ Archivos│    │
│   │ Sync    │─────►│ commit  │                              │ Actualizados  │
│   └─────────┘      └─────────┘                              └─────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Modelo de Datos

```typescript
// Modelo de cambio pendiente
interface PendingChange {
  id: string;
  sessionId: string;
  sandboxId: string;
  userId: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  
  file: {
    path: string;
    operation: 'create' | 'modify' | 'delete';
    oldContent?: string;  // Para diff
    newContent?: string;
  };
  
  metadata: {
    tool: string;
    reason?: string;
    riskLevel: 'low' | 'medium' | 'high';
    dependencies?: string[];
  };
  
  review?: {
    reviewedBy: string;
    reviewedAt: Date;
    approved: boolean;
    comment?: string;
  };
}

// Función para calcular riesgo
function calculateRiskLevel(change: PendingChange): RiskLevel {
  if (change.file.operation === 'delete') return 'high';
  if (change.file.path.includes('node_modules')) return 'medium';
  if (change.file.path.includes('.env')) return 'high';
  if (change.file.path.endsWith('.lock')) return 'medium';
  return 'low';
}
```

### 6.3 API de Promoción

```typescript
// api/server/routes/supervisor/promotion.js

router.get('/promotion/:sessionId',          // Listar cambios pendientes
router.get('/promotion/:changeId/diff',     // Obtener diff
router.post('/promotion/:changeId/approve', // Aprobar cambio
router.post('/promotion/:changeId/reject',  // Rechazar cambio
router.post('/promotion/:sessionId/apply',  // Aplicar todos los cambios
router.post('/promotion/:sessionId/discard',// Descartar todos
```

### 6.4 Componente de Diff

```tsx
// client/src/components/Supervisor/Promotion/
├── PromotionPanel.tsx       // Panel principal
├── ChangeList.tsx           // Lista de cambios
├── DiffViewer.tsx          // Visor de diff
├── ChangeReview.tsx         // Formulario de revisión
└── ConflictResolver.tsx     // Resolución de conflictos
```

### 6.5 Diseño de UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 Revisión de Cambios                                     [Apply All]    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  3 cambios pendientes                              [Filter ▼]       │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ [M] src/components/Chat/ChatView.tsx           🟡 Medium   │    │   │
│  │  │     + 42 líneas, - 12 líneas                           │    │   │
│  │  │                                                             │    │   │
│  │  │  @@ -125,12 +125,42 @@                                   │    │   │
│  │  │  -const oldCode = 1;                                       │    │   │
│  │  │  +const newCode = 2;                                       │    │   │
│  │  │  +const addedFeature = true;                               │    │   │
│  │  │                                                             │    │   │
│  │  │  [✓ Approve]  [✗ Reject]  [👁 View Full]                   │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ [A] src/utils/newHelper.ts                       🟢 Low      │    │   │
│  │  │     + 156 líneas (nuevo archivo)                           │    │   │
│  │  │                                                             │    │   │
│  │  │  [✓ Approve]  [✗ Reject]  [👁 View Full]                   │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ [!] .env.example                                🔴 High     │    │   │
│  │  │     ⚠️ Archivo con información sensible                     │    │   │
│  │  │                                                             │    │   │
│  │  │  [✓ Approve]  [✗ Reject]  [👁 View Full]                   │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  [Apply Selected]  [Discard All]                        Showing 1-3 of 3   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. MEJORA 5: CONTROL VISUAL DEL NAVEGADOR

### 7.1 Descripción

Cuando el agente usa el navegador (Browser Use), mostrar una vista previa visual.

### 7.2 Integración con Browser Use

```typescript
// API de Browser Use existente
POST /api/browser-use/task      // Ejecutar tarea
POST /api/browser-use/navigate  // Navegar a URL
POST /api/browser-use/click     // Click en elemento
POST /api/browser-use/type      // Escribir
GET  /api/browser-use/screenshot // Captura
```

### 7.3 Extensión para Supervisión

```typescript
// Nuevo endpoint para streaming de screenshots
GET /api/browser-use/:taskId/stream

// Eventos SSE para navegador
interface BrowserEvent {
  type: 'navigate' | 'click' | 'type' | 'screenshot' | 'error';
  url?: string;
  action?: string;
  selector?: string;
  screenshotUrl?: string;
  timestamp: Date;
}
```

### 7.4 Componentes

```tsx
// client/src/components/Supervisor/Browser/
├── BrowserPreview.tsx         // Preview del navegador
├── BrowserActions.tsx         // Acciones del navegador
├── BrowserControls.tsx        // Controles (pause, resume, takeover)
└── BrowserTimeline.tsx         // Timeline de acciones
```

### 7.5 Diseño de UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🌐 Navegador del Agente                              [⏸ Pause] [🎮 Take] │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  ┌───────────────────────────┐ │
│  │                                        │  │ 📋 Acciones del Agente  │ │
│  │     [Screenshot del navegador]         │  │                          │ │
│  │                                        │  │ 1. 🌐 navigate           │ │
│  │     +-------------------------+        │  │    → github.com        │ │
│  │     | 🔍 Buscar... |  🔍     |        │  │                          │ │
│  │     +-------------------------+        │  │ 2. 🔤 type              │ │
│  │                                        │  │    → #search: "React"   │ │
│  │     Resultados de búsqueda...          │  │                          │ │
│  │     ──────────────────────────         │  │ 3. 🖱️ click             │ │
│  │     Result 1                          │  │    → .result-item:first  │ │
│  │     Result 2 [hover]                  │  │                          │ │
│  │     Result 3                          │  │ 4. 📸 screenshot        │ │
│  │                                        │  │    → Captured          │ │
│  │                                        │  │                          │ │
│  └────────────────────────────────────────┘  └───────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  URL: https://github.com/search?q=React                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. MEJORA 6: CONTROL MULTI-AGENTE

### 8.1 Arquitectura de Multi-Agente

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ORQUESTADOR DE AGENTES                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌─────────────────┐                                 │
│                        │   Orchestrator   │                                 │
│                        │                 │                                 │
│                        │ • Coordina      │                                 │
│                        │ • Asigna tareas │                                 │
│                        │ • Reúne resultados                                 │
│                        └────────┬────────┘                                 │
│                                 │                                            │
│         ┌───────────┬───────────┼───────────┬───────────┐                   │
│         │           │           │           │           │                   │
│         ▼           ▼           ▼           ▼           ▼                   │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│   │ Program- │ │ Seguri-  │ │ Invest-  │ │  Testing │ │   Doc    │        │
│   │   mer    │ │   dad    │ │  gador   │ │   QA     │ │          │        │
│   │          │ │          │ │          │ │          │ │          │        │
│   │ • Código │ │ • Scan   │ │ • Búsqueda│ │ • Tests │ │ • README │        │
│   │ • Debug  │ │ • Review │ │ • Síntesis│ │ • CI    │ │ • API    │        │
│   │ • Refactor│ │ • PII   │ │ • Resumen│ │ • E2E   │ │ • Guide  │        │
│   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘   │
│         │             │             │             │             │           │
│         ▼             ▼             ▼             ▼             ▼           │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│   │ Tool:    │ │ Tool:    │ │ Tool:    │ │ Tool:    │ │ Tool:    │        │
│   │ file,term│ │ scan,auth│ │ search   │ │ test     │ │ write    │        │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Tipos de Agentes Predefinidos

```typescript
const AGENT_TYPES = {
  PROGRAMMER: {
    name: 'Programador',
    icon: '💻',
    capabilities: ['code', 'debug', 'refactor', 'create_file', 'edit_file'],
    tools: ['bash_tool', 'read_file', 'create_file', 'edit_file'],
    color: '#3B82F6',
  },
  SECURITY: {
    name: 'Seguridad',
    icon: '🔒',
    capabilities: ['security_scan', 'pii_detection', 'vulnerability_scan'],
    tools: ['bash_tool', 'read_file'],
    color: '#EF4444',
  },
  RESEARCHER: {
    name: 'Investigador',
    icon: '🔬',
    capabilities: ['search', 'summarize', 'analyze'],
    tools: ['bash_tool', 'read_file', 'browser_use'],
    color: '#8B5CF6',
  },
  QA: {
    name: 'Testing',
    icon: '🧪',
    capabilities: ['test', 'ci', 'e2e'],
    tools: ['bash_tool', 'read_file', 'create_file'],
    color: '#22C55E',
  },
  DOCUMENTATION: {
    name: 'Documentación',
    icon: '📝',
    capabilities: ['write_docs', 'readme', 'api_docs'],
    tools: ['bash_tool', 'read_file', 'create_file', 'edit_file'],
    color: '#F59E0B',
  },
};
```

### 8.3 Componentes

```tsx
// client/src/components/Supervisor/MultiAgent/
├── MultiAgentOrchestrator.tsx  // Panel principal
├── AgentCard.tsx              // Tarjeta de agente
├── AgentStatus.tsx           // Estado del agente
├── AgentActivity.tsx         // Actividad del agente
├── AgentControls.tsx         // Controles
├── TaskAssignment.tsx        // Asignación de tareas
└── ResultAggregation.tsx     // Agregación de resultados
```

### 8.4 Diseño de UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🤖 Equipo de Agentes                              [Add Agent] [Settings] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ORQUESTADOR PRINCIPAL                              │   │
│  │  Tarea: "Implementar autenticación JWT"                             │   │
│  │  Progreso: ████████░░ 80%                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ 💻          │ │ 🔒          │ │ 🔬          │ │ 🧪          │          │
│  │ Programador │ │ Seguridad   │ │ Investigador│ │ Testing     │          │
│  │             │ │             │ │             │ │             │          │
│  │ Status: ✓   │ │ Status: ◐   │ │ Status: ✓   │ │ Status: ○   │          │
│  │ Task: 3/3   │ │ Task: 1/2   │ │ Task: 2/2   │ │ Task: 0/1   │          │
│  │             │ │             │ │             │ │             │          │
│  │ • auth.ts   │ │ • Scan...   │ │ • Research  │ │ • Pending   │          │
│  │ • middleware│ │ • Review    │ │ • Summarize │ │             │          │
│  │ • routes    │ │             │ │             │ │             │          │
│  │             │ │             │ │             │ │             │          │
│  │ [Activity ▶]│ │ [Activity ▶]│ │ [Activity ▶]│ │ [Activity ▶]│          │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 📊 Resumen del Equipo                                                │   │
│  │ • Agentes activos: 3/4                                              │   │
│  │ • Tareas completadas: 6                                             │   │
│  │ • Tareas en progreso: 2                                              │   │
│  │ • Tareas pendientes: 1                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. MEJORA 7: SISTEMA DE PERMISOS

### 9.1 Modelo de Permisos

```typescript
// Niveles de permisos
type PermissionLevel = 'none' | 'read' | 'write' | 'admin';

interface Permission {
  id: string;
  userId: string;
  agentId?: string;
  
  // Permisos de archivos
  filePermissions: {
    readPaths: string[];      // Paths permitidos para lectura
    writePaths: string[];     // Paths permitidos para escritura
    denyPaths: string[];      // Paths denegados
  };
  
  // Permisos de comandos
  commandPermissions: {
    allowedCommands: string[]; // Patrones permitidos (regex)
    deniedCommands: string[];  // Patrones denegados
    requireApproval: string[]; // Comandos que requieren aprobación
    maxTimeout: number;        // Timeout máximo en ms
  };
  
  // Permisos de red
  networkPermissions: {
    allowedDomains: string[];  // Dominios permitidos
    deniedDomains: string[];   // Dominios denegados
    allowBrowser: boolean;     // Permitir uso del navegador
  };
  
  // Permisos de herramientas
  toolPermissions: {
    allowedTools: string[];    // Herramientas permitidas
    deniedTools: string[];     // Herramientas denegadas
  };
  
  // Permisos de información
  infoPermissions: {
    allowReadSecrets: boolean; // Leer .env, secrets
    allowReadCredentials: boolean;
  };
  
  // Límites
  limits: {
    maxConcurrentAgents: number;
    maxSandboxTime: number;    // ms
    maxFileSize: number;       // bytes
    maxMemoryUsage: number;    // bytes
  };
}
```

### 9.2 Presets de Permisos

```typescript
const PERMISSION_PRESETS = {
  RESTRICTED: {
    name: 'Restringido',
    description: 'Solo lectura, sin ejecución',
    filePermissions: {
      readPaths: ['**'],
      writePaths: [],
      denyPaths: ['**'],
    },
    commandPermissions: {
      allowedCommands: [],
      deniedCommands: ['**'],
      requireApproval: [],
    },
    toolPermissions: {
      allowedTools: ['read_file'],
      deniedTools: ['bash_tool', 'create_file', 'edit_file'],
    },
  },
  
  STANDARD: {
    name: 'Estándar',
    description: 'Lectura y escritura limitada',
    filePermissions: {
      readPaths: ['src/**', 'api/**', 'docs/**'],
      writePaths: ['src/**', 'api/**', 'docs/**'],
      denyPaths: ['**/node_modules/**', '**/.git/**', '**/.env*'],
    },
    commandPermissions: {
      allowedCommands: ['npm test', 'npm run', 'git status', 'cat', 'ls'],
      deniedCommands: ['rm -rf', 'dd', 'chmod 777', 'curl.*secret'],
      requireApproval: ['npm install', 'git push', 'docker'],
    },
    toolPermissions: {
      allowedTools: ['read_file', 'create_file', 'edit_file', 'bash_tool'],
      deniedTools: [],
    },
  },
  
  FULL: {
    name: 'Completo',
    description: 'Acceso total al workspace',
    filePermissions: {
      readPaths: ['**'],
      writePaths: ['**'],
      denyPaths: ['/etc/**', '/root/**', '/sys/**'],
    },
    commandPermissions: {
      allowedCommands: ['**'],
      deniedCommands: ['rm -rf /', 'dd if=/dev/zero'],
      requireApproval: [],
    },
    toolPermissions: {
      allowedTools: ['*'],
      deniedTools: [],
    },
  },
};
```

### 9.3 API de Permisos

```typescript
// api/server/routes/supervisor/permissions.js

router.get('/permissions',                    // Listar permisos del usuario
router.get('/permissions/:agentId',          // Permisos de un agente
router.put('/permissions/:agentId',          // Actualizar permisos
router.post('/permissions/:agentId/preset',  // Aplicar preset
router.post('/permissions/:agentId/check',   // Verificar permiso específico
```

### 9.4 Componentes de UI

```tsx
// client/src/components/Supervisor/Permissions/
├── PermissionManager.tsx   // Manager principal
├── PermissionPreset.tsx    // Selector de presets
├── FilePermissions.tsx      // Permisos de archivos
├── CommandPermissions.tsx   // Permisos de comandos
├── ToolPermissions.tsx      // Permisos de herramientas
└── PermissionMatrix.tsx     // Matriz de permisos
```

### 9.5 Diseño de UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔐 Permisos del Agente                              [Save] [Reset]        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Preset: [Standard ▼]  ┌────────────────────────────────────────────────┐ │
│                        │ Cambios aplicados                                  │ │
│                        └────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 📁 Archivos                                                           │   │
│  │                                                                      │   │
│  │  ✓ Leer:    [src/**, api/**, docs/**]                               │   │
│  │  ✓ Escribir: [src/**, api/**, docs/**]                              │   │
│  │  ✗ Denegar:  [node_modules/**, .git/**, .env*]                     │   │
│  │                                                                      │   │
│  │  [+ Agregar path]                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⌨️ Comandos                                                           │   │
│  │                                                                      │   │
│  │  ✓ Permitidos:  [npm test, npm run, git status, cat, ls]            │   │
│  │  ✗ Denegados:   [rm -rf, dd, chmod 777]                              │   │
│  │  ⚠️ Aprobación: [npm install, git push, docker run]                  │   │
│  │                                                                      │   │
│  │  [+ Agregar patrón]                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🔧 Herramientas                                                       │   │
│  │                                                                      │   │
│  │  ✓ read_file    ✓ create_file    ✓ edit_file    ✓ bash_tool        │   │
│  │  ✓ browser_use  ✓ mcp_*                                          │   │
│  │                                                                      │   │
│  │  ✗ delete_file   (bloqueado)                                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. MEJORA 8: REPLAY DE SESIONES

### 10.1 Almacenamiento de Sesiones

```typescript
interface AgentSession {
  id: string;
  sessionId: string;
  userId: string;
  agentId: string;
  conversationId: string;
  
  startedAt: Date;
  endedAt?: Date;
  
  // Todos los eventos de la sesión
  events: SessionEvent[];
  
  // Estado final
  finalState: {
    files: FileState[];
    workspace: string;
    result: string;
  };
  
  // Metadatos
  metadata: {
    model: string;
    provider: string;
    tools: string[];
    tasks: string[];
    outcome: 'success' | 'error' | 'cancelled';
  };
}

interface SessionEvent {
  id: string;
  timestamp: Date;
  type: string;
  data: Record<string, unknown>;
  replayTime?: number; // Tiempo para replay
}
```

### 10.2 API de Replay

```typescript
// api/server/routes/supervisor/sessions.js

router.get('/sessions',                     // Listar sesiones
router.get('/sessions/:sessionId',         // Detalles de sesión
router.get('/sessions/:sessionId/events',  // Eventos de sesión
router.post('/sessions/:sessionId/replay', // Iniciar replay
router.get('/sessions/:sessionId/download',// Descargar como JSON
```

### 10.3 Componentes

```tsx
// client/src/components/Supervisor/Replay/
├── SessionList.tsx           // Lista de sesiones
├── SessionDetail.tsx         // Detalle de sesión
├── ReplayPlayer.tsx          // Reproductor de replay
├── ReplayTimeline.tsx        // Timeline del replay
├── ReplayControls.tsx        // Controles (play, pause, speed)
└── ReplayState.tsx           // Estado en replay
```

### 10.4 Diseño de UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📼 Replay de Sesión                                    [⬇ Download]       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Sesión: session-abc123                                                      │
│  Agente: Programador                                                          │
│  Duración: 10:35 (desde 10:30 a 10:40)                                       │
│  Resultado: ✓ Completado                                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ▶️  ⏸️  ⏹️  |  🔊  |  Speed: [1x ▼]  |  [Step ◀] [▶ Step]        │   │
│  │                                                                     │   │
│  │  0:00 ════════════════●═══════════════════════════════════════ 10:35 │   │
│  │        ▲                                                          ▲ │   │
│  │      Inicio                                                      Fin  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─ Evento Actual ─────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  [2/45] 04:23 - Ejecutando: npm test -- --coverage                 │   │
│  │           Estado: ✓ Tests passed                                    │   │
│  │                                                                     │   │
│  │  Preview del estado en este momento:                               │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │ src/components/Chat/                                        │  │   │
│  │  │   ChatView.tsx         [Modificado]                        │  │   │
│  │  │   MessagesView.tsx     [Sin cambios]                        │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  [◀ Evento Anterior]                      [Siguiente Evento ▶]              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. MEJORA 9: COMPARACIÓN DE CAMBIOS

### 11.1 Tipos de Diff

```typescript
type DiffType = 'unified' | 'split' | 'inline' | 'visual';

interface DiffResult {
  file: string;
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
  stats: {
    additions: number;
    deletions: number;
    changes: number;
  };
}
```

### 11.2 Componentes

```tsx
// client/src/components/Supervisor/Diff/
├── DiffViewer.tsx          // Visor principal
├── DiffHeader.tsx         // Header con stats
├── DiffHunk.tsx           // Hunk individual
├── DiffLine.tsx           // Línea individual
├── SplitDiff.tsx          // Vista dividida
├── VisualDiff.tsx         // Vista visual
└── DiffNavigation.tsx     // Navegación entre cambios
```

### 11.3 Diseño de UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📊 Comparar: src/components/Chat/ChatView.tsx                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [+156 -12]  cambios    Ver: [Unified ▼] [Side-by-side] [Inline]          │
│                                                                              │
│  ┌─ Anterior ────────────────────┐  ┌─ Actual ────────────────────────┐   │
│  │  1 │ import { useState }     │  │  1 │ import { useState }       │   │
│  │  2 │ import React from...    │  │  2 │ import React from...      │   │
│  │  3 │                         │  │  3 │                         │   │
│  │  4 │ const ChatView = () => │  │  4 │ const ChatView = () =>   │   │
│  │  5 │   const [messages,     │  │  5 │   const [messages,     │   │
│  │  6 │ -    setMessages]      │  │  6 │ +    setMessages,      │   │
│  │  7 │ -    useState([]);     │  │  7 │ +    setLoading]       │   │
│  │  8 │                         │  │  8 │ +    useState(false); │   │
│  │  9 │   return (             │  │  9 │                         │   │
│  │ 10 │     <div>              │  │ 10 │   return (             │   │
│  │ 11 │       {messages.map(   │  │ 11 │     <div>              │   │
│  │ 12 │ -      msg => (        │  │ 12 │ +      messages.map(  │   │
│  │ 13 │ -        <Message      │  │ 13 │ +        msg => (      │   │
│  │ 14 │ -          key={...}   │  │ 14 │ +          <Message   │   │
│  │ 15 │ -        />            │  │ 15 │ +            key={...} │   │
│  │    │ -      ))              │  │    │ +          />       │   │
│  │    │ -  )                   │  │    │ +        ))         │   │
│  │ 16 │   </div>              │  │ 16 │ +  )                   │   │
│  │ 17 │ );                     │  │ 17 │   </div>            │   │
│  │ 18 │ }                      │  │ 18 │   );                 │   │
│  └──────────────────────────────┘  │ 19 │ }                    │   │
│                                     └──────────────────────────────┘   │
│                                                                              │
│  [◀ Anterior Archivo]                               [Siguiente Archivo ▶]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. MODELO DE DATOS

### 12.1 Colecciones MongoDB

```javascript
// supervisor_events - Eventos de actividad
{
  _id: ObjectId,
  sessionId: String,
  agentId: String,
  userId: String,
  type: String,           // ActivityEventType
  data: Object,           // Datos específicos del evento
  metadata: Object,       // userId, conversationId, etc.
  timestamp: Date,
  createdAt: Date
}

// supervisor_sessions - Sesiones de agente
{
  _id: ObjectId,
  sessionId: String,
  userId: String,
  agentId: String,
  conversationId: String,
  events: [Object],       // Array de eventos
  finalState: Object,
  startedAt: Date,
  endedAt: Date,
  metadata: Object
}

// supervisor_sandboxes - Sandboxes activos
{
  _id: ObjectId,
  sandboxId: String,
  sessionId: String,
  userId: String,
  workspacePath: String,
  containerId: String,    // Docker container ID
  status: String,         // 'active', 'paused', 'stopped'
  resources: Object,
  createdAt: Date,
  expiresAt: Date
}

// supervisor_pending_changes - Cambios pendientes de promoción
{
  _id: ObjectId,
  sessionId: String,
  sandboxId: String,
  userId: String,
  file: {
    path: String,
    operation: String,
    oldContent: String,
    newContent: String
  },
  metadata: Object,
  status: String,         // 'pending', 'approved', 'rejected', 'applied'
  review: Object,
  createdAt: Date
}

// supervisor_permissions - Permisos de agente
{
  _id: ObjectId,
  userId: String,
  agentId: String,
  permissions: {
    filePermissions: Object,
    commandPermissions: Object,
    networkPermissions: Object,
    toolPermissions: Object,
    infoPermissions: Object,
    limits: Object
  },
  preset: String,
  createdAt: Date,
  updatedAt: Date
}
```

### 12.2 Índices

```javascript
// supervisor_events
db.supervisor_events.createIndex({ sessionId: 1, timestamp: 1 });
db.supervisor_events.createIndex({ agentId: 1, timestamp: -1 });
db.supervisor_events.createIndex({ userId: 1, timestamp: -1 });

// supervisor_sessions
db.supervisor_sessions.createIndex({ sessionId: 1 }, { unique: true });
db.supervisor_sessions.createIndex({ userId: 1, startedAt: -1 });

// supervisor_sandboxes
db.supervisor_sandboxes.createIndex({ sandboxId: 1 }, { unique: true });
db.supervisor_sandboxes.createIndex({ userId: 1, status: 1 });

// supervisor_pending_changes
db.supervisor_pending_changes.createIndex({ sessionId: 1, status: 1 });
db.supervisor_pending_changes.createIndex({ sandboxId: 1, status: 1 });

// supervisor_permissions
db.supervisor_permissions.createIndex({ userId: 1, agentId: 1 }, { unique: true });
```

---

## 13. API ENDPOINTS

### 13.1 Rutas del Supervisor

```javascript
// api/server/routes/supervisor/
const supervisorRoutes = {
  // Eventos
  'GET  /supervisor/events/:sessionId',      // Eventos de sesión
  'GET  /supervisor/events/stream',           // SSE stream de eventos
  
  // Sesiones
  'GET  /supervisor/sessions',                // Listar sesiones
  'GET  /supervisor/sessions/:sessionId',     // Detalle de sesión
  'POST /supervisor/sessions/:sessionId/replay', // Iniciar replay
  
  // Sandbox
  'POST /supervisor/sandbox/create',           // Crear sandbox
  'GET  /supervisor/sandbox/:sandboxId',      // Estado del sandbox
  'POST /supervisor/sandbox/:sandboxId/exec', // Ejecutar comando
  'DELETE /supervisor/sandbox/:sandboxId',    // Destruir sandbox
  
  // Promoción
  'GET  /supervisor/promotion/:sessionId',    // Cambios pendientes
  'GET  /supervisor/promotion/:changeId/diff', // Diff de cambio
  'POST /supervisor/promotion/:changeId/approve', // Aprobar
  'POST /supervisor/promotion/:changeId/reject',  // Rechazar
  'POST /supervisor/promotion/:sessionId/apply', // Aplicar todos
  'POST /supervisor/promotion/:sessionId/discard', // Descartar todos
  
  // Permisos
  'GET  /supervisor/permissions',             // Permisos del usuario
  'PUT  /supervisor/permissions/:agentId',    // Actualizar permisos
  'POST /supervisor/permissions/:agentId/preset', // Aplicar preset
  
  // WebSocket
  '/supervisor/ws'                            // Socket.IO namespace
};
```

---

## 14. FLUJO DE EVENTOS

### 14.1 Event Collection Pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE DE COLECCIÓN DE EVENTOS                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  @librechat/agents                                                           │
│  ┌──────────────────────────────────────────────────────┐                    │
│  │  HandlerRegistry.emit('tool_execute', {             │                    │
│  │    tool: 'bash_tool',                                │                    │
│  │    command: 'npm test',                              │                    │
│  │    status: 'running'                                │                    │
│  │  })                                                  │                    │
│  └──────────────────────┬───────────────────────────────┘                    │
│                         │                                                   │
│                         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐                    │
│  │  packages/api/src/agents/handlers.ts                 │                    │
│  │                                                       │                    │
│  │  toolEndCallback = async (data, metadata) => {        │                    │
│  │    // 1. Emitir a SSE (existente)                   │                    │
│  │    sendEvent(res, { type: 'tool_call', ... });       │                    │
│  │                                                       │                    │
│  │    // 2. NUEVO: Enviar a EventCollector             │                    │
│  │    await EventCollector.collect({                    │                    │
│  │      type: 'agent:tool_execute',                     │                    │
│  │      data,                                           │                    │
│  │      metadata                                       │                    │
│  │    });                                               │                    │
│  │  }                                                   │                    │
│  └──────────────────────┬───────────────────────────────┘                    │
│                         │                                                   │
│                         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐                    │
│  │  api/server/services/Supervisor/EventCollector.js    │                    │
│  │                                                       │                    │
│  │  class EventCollector {                               │                    │
│  │    async collect(event) {                             │                    │
│  │      // 1. Persistir en MongoDB                      │                    │
│  │      await EventModel.create({                       │                    │
│  │        ...event,                                      │                    │
│  │        timestamp: new Date()                          │                    │
│  │      });                                              │                    │
│  │                                                       │                    │
│  │      // 2. Emitir por Socket.IO                      │                    │
│  │      io.to(`session:${event.sessionId}`)              │                    │
│  │        .emit('agent:event', event);                  │                    │
│  │    }                                                  │                    │
│  │  }                                                    │                    │
│  └──────────────────────────────────────────────────────┘                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Tipos de Eventos

| Tipo | Descripción | Datos |
|------|-------------|-------|
| `agent:start` | Inicio de agente | agentId, model, tools |
| `agent:thinking` | Pensamiento del modelo | thought, reasoning |
| `agent:tool_start` | Inicio de herramienta | tool, args |
| `agent:tool_end` | Fin de herramienta | tool, result, duration |
| `agent:tool_error` | Error en herramienta | tool, error |
| `agent:file_read` | Lectura de archivo | path, lines |
| `agent:file_write` | Escritura de archivo | path, lines |
| `agent:file_delete` | Eliminación de archivo | path |
| `agent:command` | Ejecución de comando | command, output, exitCode |
| `agent:browser` | Acción de navegador | action, url, selector |
| `agent:subagent` | Sub-agente | subagentId, task |
| `agent:pause` | Pausa | reason |
| `agent:resume` | Reanudación | |
| `agent:complete` | Completado | result, duration |
| `agent:error` | Error general | error |

---

## 15. CONSIDERACIONES DE SEGURIDAD

### 15.1 Aislamiento

1. **Sandbox Docker** - Cada sesión usa container separado
2. **Filesystem isolation** - Solo acceso a workspace
3. **Network isolation** - Solo dominios permitidos
4. **Resource limits** - CPU, memory, disk quotas

### 15.2 Permisos

1. **Principle of least privilege** - Mínimo acceso necesario
2. **Approval workflows** - Cambios sensibles requieren aprobación
3. **Audit logging** - Todos los eventos son registrados
4. **Rate limiting** - Prevención de abuse

### 15.3 Validación

1. **Input sanitization** - Sanitizar todos los inputs
2. **Command validation** - Validar comandos contra patrones peligrosos
3. **Path validation** - Prevenir path traversal
4. **Content validation** - Validar contenido de archivos

---

## 16. PLAN DE IMPLEMENTACIÓN

### Fase 1: Fundamentos
1. EventCollector service
2. MongoDB schemas
3. Socket.IO integration
4. Basic ActivityFeed component

### Fase 2: Supervisión Básica
1. Timeline component
2. Session replay
3. Permission system

### Fase 3: Sandbox
1. SandboxManager
2. Docker integration
3. Promotion workflow
4. Diff viewer

### Fase 4: Multi-Agent
1. Agent orchestration
2. Multi-agent UI
3. Browser preview

---

## 17. INTEGRACIÓN CON CHAT (COMPLETADO)

> **Nota:** Esta sección fue expandida y completada en el documento separado:
> 📄 `06-INTEGRACION-CHAT-SUPERVISOR.md`

### 17.1 Contenido del Documento

El documento `06-INTEGRACION-CHAT-SUPERVISOR.md` incluye:

| Sección | Contenido |
|---------|-----------|
| **Wireframes ChatView + SupervisorPanel** | Mockups de integración visual |
| **SupervisorStore (Recoil)** | Átomos, selectores y tipos completos |
| **Mapeo SSE → Supervisor Events** | Conversión de eventos SSE del chat a eventos del supervisor |
| **Componentes de Integración** | ChatView, ChatHeader, SupervisorPanel con código |
| **Flujo de Datos Completo** | Diagrama de secuencia desde el usuario hasta la UI |

### 17.2 Resumen de Componentes

```
client/src/
├── components/
│   ├── Chat/
│   │   ├── ChatView.tsx              ← Con SupervisorPanel integrado
│   │   └── ChatHeader.tsx            ← Con toggle de supervisor
│   └── Supervisor/
│       ├── SupervisorPanel.tsx        ← Panel principal
│       ├── ActivityFeed/             ← Feed de actividad
│       ├── Timeline/                 ← Línea de tiempo
│       ├── Sandbox/                  ← Panel de sandbox
│       └── MultiAgent/               ← Control multi-agente
├── hooks/
│   ├── useSupervisor.ts              ← Hook principal
│   └── SSE/
│       └── useSupervisorEventMapper.ts  ← Mapeador SSE → Supervisor
└── store/
    ├── supervisorAtoms.ts            ← Átomos de Recoil
    └── supervisorTypes.ts            ← Tipos TypeScript
```

### 17.3 Flujo de Datos

```
User → ChatInput → Backend (Agent)
                      ↓
              EventBus + EventCollector
                      ↓
              SSE Events (socket.io)
                      ↓
              useEventHandlers.ts
                      ↓
              useSupervisorEventMapper.ts
                      ↓
              SupervisorStore (Recoil)
                      ↓
              SupervisorPanel (React)
```

---

**Documento preparado para implementación.**
