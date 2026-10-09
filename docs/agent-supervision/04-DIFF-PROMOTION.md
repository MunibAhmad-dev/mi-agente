# SISTEMA DE DIFF VIEWER Y PROMOTION WORKFLOW

**Fecha:** 2026-07-21
**Versión:** 1.0
**Estado:** ✅ Implementado

---

## 1. DIFF VIEWER

### 1.1 Descripción

Componente para visualizar diferencias entre archivos de forma visual, con soporte para vistas lado a lado e inline.

### 1.2 Componentes

| Componente | Descripción |
|------------|-------------|
| `DiffViewer.tsx` | Componente principal |
| `DiffViewer.css` | Estilos |

### 1.3 API del Componente

```tsx
interface DiffViewerProps {
  oldContent: string;        // Contenido original
  newContent: string;        // Contenido modificado
  oldFileName?: string;      // Nombre archivo original
  newFileName?: string;      // Nombre archivo modificado
  mode?: 'side-by-side' | 'inline';
  showLineNumbers?: boolean;
  onClose?: () => void;
}
```

### 1.4 Uso

```tsx
import { DiffViewer } from '~/components/Supervisor';

<DiffViewer
  oldContent={originalCode}
  newContent={modifiedCode}
  oldFileName="index.ts"
  newFileName="index.ts (modified)"
  mode="side-by-side"
/>
```

---

## 2. PROMOTION WORKFLOW

### 2.1 Descripción

Workflow completo para revisar, aprobar y rechazar cambios del sandbox antes de aplicarlos al workspace real.

### 2.2 Características

- ✅ Lista de archivos modificados con estadísticas
- ✅ Vista de diff individual por archivo
- ✅ Selección múltiple de archivos
- ✅ Staging de archivos para revisión
- ✅ Confirmación antes de promoción
- ✅ Descartar cambios individuales o en masa
- ✅ Modal de confirmación con warnings

### 2.3 API del Componente

```tsx
interface PromotionWorkflowProps {
  sandboxId: string;
  onClose?: () => void;
  onPromote?: () => void;
  onDiscard?: () => void;
}
```

### 2.4 Uso

```tsx
import { PromotionWorkflow } from '~/components/Supervisor';

<PromotionWorkflow
  sandboxId="sbx_xxx"
  onPromote={() => console.log('Changes promoted')}
  onDiscard={() => console.log('Changes discarded')}
/>
```

---

## 3. ENDPOINTS API

### 3.1 Diff Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/sandbox/:id/diff/*path` | GET | Obtener diff de un archivo |
| `GET /api/sandbox/:id/diff-all` | GET | Obtener diff de todos los archivos |

### 3.2 Ejemplo de Respuesta

```json
{
  "success": true,
  "filePath": "src/index.ts",
  "stats": {
    "additions": 15,
    "deletions": 3,
    "unchanged": 42
  },
  "changes": [
    { "type": "unchanged", "value": "// ...", "oldLineNumber": 1, "newLineNumber": 1 },
    { "type": "added", "value": "const x = 1;", "newLineNumber": 2 },
    { "type": "removed", "value": "// old comment", "oldLineNumber": 3 }
  ]
}
```

---

## 4. MULTI-AGENT CONTROLLER

### 4.1 Descripción

Sistema para controlar múltiples agentes IA simultáneamente, permitiendo:
- Crear sesiones de trabajo multi-agente
- Agregar diferentes tipos de agentes
- Distribuir y gestionar tareas
- Controlar estado de agentes (start/pause/stop)
- Comunicación entre agentes

### 4.2 Tipos de Agente

| Tipo | Icono | Descripción |
|------|-------|-------------|
| `coordinator` | 🎯 | Coordina y distribuye tareas |
| `researcher` | 🔍 | Investiga y analiza información |
| `coder` | 💻 | Escribe y modifica código |
| `reviewer` | 👀 | Revisa y valida cambios |
| `tester` | 🧪 | Ejecuta pruebas |

### 4.3 Estados de Agente

| Estado | Descripción |
|--------|-------------|
| `idle` | Sin actividad |
| `thinking` | Procesando información |
| `acting` | Ejecutando acciones |
| `waiting` | Esperando recursos |
| `paused` | Pausado por usuario |
| `stopped` | Detenido |
| `error` | Error |

### 4.4 API Endpoints

#### Sesiones
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `POST /api/multiagent/sessions` | Crear sesión |
| `GET /api/multiagent/sessions` | Listar sesiones |
| `GET /api/multiagent/sessions/:id` | Detalles de sesión |
| `POST /api/multiagent/sessions/:id/pause` | Pausar sesión |
| `POST /api/multiagent/sessions/:id/resume` | Reanudar sesión |
| `DELETE /api/multiagent/sessions/:id` | Destruir sesión |

#### Agentes
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `POST /api/multiagent/sessions/:id/agents` | Agregar agente |
| `GET /api/multiagent/sessions/:id/agents` | Listar agentes |
| `POST /api/multiagent/agents/:id/start` | Iniciar agente |
| `POST /api/multiagent/agents/:id/pause` | Pausar agente |
| `POST /api/multiagent/agents/:id/resume` | Reanudar agente |
| `POST /api/multiagent/agents/:id/stop` | Detener agente |

#### Tareas
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `POST /api/multiagent/sessions/:id/tasks` | Crear tarea |
| `GET /api/multiagent/sessions/:id/tasks` | Listar tareas |
| `POST /api/multiagent/tasks/:id/complete` | Completar tarea |
| `POST /api/multiagent/tasks/:id/fail` | Fallar tarea |

---

## 5. ARCHIVOS CREADOS

### Diff Viewer
- `client/src/components/Supervisor/DiffViewer/DiffViewer.tsx`
- `client/src/components/Supervisor/DiffViewer/DiffViewer.css`
- `client/src/components/Supervisor/DiffViewer/index.ts`
- `api/server/services/SandboxManager/DiffService.js`

### Promotion Workflow
- `client/src/components/Supervisor/PromotionWorkflow/PromotionWorkflow.tsx`
- `client/src/components/Supervisor/PromotionWorkflow/PromotionWorkflow.css`
- `client/src/components/Supervisor/PromotionWorkflow/index.ts`

### Multi-Agent
- `api/server/services/MultiAgentController/MultiAgentController.js`
- `api/server/services/MultiAgentController/index.js`
- `api/server/routes/multiagent.js`
- `client/src/hooks/supervisor/useMultiAgent.ts`
- `client/src/components/Supervisor/MultiAgentPanel/MultiAgentPanel.tsx`
- `client/src/components/Supervisor/MultiAgentPanel/MultiAgentPanel.css`
- `client/src/components/Supervisor/MultiAgentPanel/index.ts`

### Modificados
- `api/server/routes/sandbox.js` - Agregados endpoints de diff
- `api/server/routes/index.js` - Agregados exports de sandbox y multiagent
- `api/server/index.js` - Registradas nuevas rutas
- `client/src/hooks/supervisor/useSandbox.ts` - Agregados hooks de diff
- `client/src/components/Supervisor/index.ts` - Nuevos exports

---

**Documento preparado por OpenHands AI Agent**
