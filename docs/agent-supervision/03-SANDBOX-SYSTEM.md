# SISTEMA DE SANDBOX - DOCUMENTACIÓN TÉCNICA

**Fecha:** 2026-07-21
**Versión:** 1.0
**Estado:** ✅ Implementado

---

## TABLA DE CONTENIDOS

1. [Descripción General](#descripción-general)
2. [Arquitectura](#arquitectura)
3. [API Endpoints](#api-endpoints)
4. [Componentes Frontend](#componentes-frontend)
5. [Flujo de Datos](#flujo-de-datos)
6. [Seguridad](#seguridad)
7. [Uso](#uso)

---

## 1. DESCRIPCIÓN GENERAL

El sistema de Sandbox proporciona un entorno aislado para que los agentes IA operen sin riesgo de modificar el workspace real hasta que el usuario approve los cambios.

### Características principales

- ✅ **Workspace virtual aislado** - Copia del workspace para trabajo seguro
- ✅ **Ejecución de comandos** - Terminal para ejecutar comandos en el sandbox
- ✅ **Detección de cambios** - Rastrea automáticamente archivos modificados
- ✅ **Sistema de promoción** - Permite aprobar/rechazar cambios antes de aplicarlos
- ✅ **Soporte Docker** - Opcionalmente usa containers Docker para mayor aislamiento
- ✅ **Fallback local** - Funciona sin Docker si no está disponible

---

## 2. ARQUITECTURA

### 2.1 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      SandboxPanel                                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │  │
│  │  │ Terminal    │  │ FileTree    │  │ Changes     │  │ Preview   │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│                    useSandbox Hooks (React Query)                          │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Express)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    SandboxManager Service                            │  │
│  │  • createSandbox()    • executeInSandbox()    • stageChange()       │  │
│  │  • getStatus()        • readFile()            • promoteChanges()    │  │
│  │  • destroySandbox()   • writeFile()           • discardChanges()    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│  ┌───────────────────┐      │       ┌───────────────────────────────────┐  │
│  │  Dockerode        │◄─────┘       │  /tmp/librechat-sandboxes/         │  │
│  │  (Opcional)       │              │  ├── sbx_session123_abc/          │  │
│  │                   │              │  │   ├── workspace/                 │  │
│  └───────────────────┘              │  │   │   ├── src/                    │  │
│                                      │  │   │   └── api/                    │  │
│                                      │  │   └── .changes/                  │  │
│                                      │  └── ...                           │  │
│                                      └───────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Componentes del Servicio

| Componente | Descripción |
|------------|-------------|
| `SandboxManager` | Clase principal que gestiona todos los sandboxes |
| `DockerSandbox` | Implementación con Docker containers |
| Almacenamiento | Directorio `/tmp/librechat-sandboxes` |

---

## 3. API ENDPOINTS

### 3.1 Endpoints Disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/sandbox/health` | GET | Estado del servicio |
| `/api/sandbox/create` | POST | Crear nuevo sandbox |
| `/api/sandbox/list` | GET | Listar sandboxes del usuario |
| `/api/sandbox/:id` | GET | Obtener detalles de sandbox |
| `/api/sandbox/:id/execute` | POST | Ejecutar comando |
| `/api/sandbox/:id/files` | GET | Listar archivos modificados |
| `/api/sandbox/:id/files/*path` | GET | Leer archivo |
| `/api/sandbox/:id/files/*path` | PUT | Escribir archivo |
| `/api/sandbox/:id/stage` | POST | Preparar archivos para promoción |
| `/api/sandbox/:id/promote` | POST | Promover cambios |
| `/api/sandbox/:id/discard` | POST | Descartar cambios |
| `/api/sandbox/:id/terminal` | GET | Historial de terminal |
| `/api/sandbox/:id` | DELETE | Destruir sandbox |

### 3.2 Ejemplos de Uso

#### Crear Sandbox
```bash
curl -X POST http://localhost:3080/api/sandbox/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "sessionId": "session-123",
    "workspacePath": "/app/workspace",
    "resources": { "cpu": "1", "memory": "512m" }
  }'
```

#### Ejecutar Comando
```bash
curl -X POST http://localhost:3080/api/sandbox/sbx_xxx/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "command": "npm test",
    "options": { "timeout": 60000 }
  }'
```

#### Promover Cambios
```bash
curl -X POST http://localhost:3080/api/sandbox/sbx_xxx/promote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "filePaths": ["src/index.js", "src/utils.js"]
  }'
```

---

## 4. COMPONENTES FRONTEND

### 4.1 Estructura de Componentes

```
client/src/components/Supervisor/Sandbox/
├── index.ts              # Exports
├── SandboxPanel.tsx      # Panel principal
├── SandboxPanel.css
├── SandboxTerminal.tsx   # Terminal integrada
├── SandboxTerminal.css
├── SandboxFileTree.tsx   # Árbol de archivos
├── SandboxFileTree.css
├── SandboxPreview.tsx     # Preview de archivos
├── SandboxPreview.css
├── SandboxChanges.tsx     # Lista de cambios
└── SandboxChanges.css
```

### 4.2 Hooks Disponibles

```typescript
// useSandbox.ts
useSandboxHealth()           // Estado del servicio
useListSandboxes()           // Listar sandboxes
useGetSandbox(id)            // Detalles de sandbox
useGetModifiedFiles(id)      // Archivos modificados
useGetTerminalHistory(id)    // Historial de terminal
useCreateSandbox()           // Crear sandbox
useExecuteInSandbox()        // Ejecutar comando
useReadFile(id, path)        // Leer archivo
useWriteFile()               // Escribir archivo
useStageFiles()              // Preparar para promoción
usePromoteChanges()          // Promover cambios
useDiscardChanges()          // Descartar cambios
useDestroySandbox()          // Destruir sandbox
```

---

## 5. FLUJO DE DATOS

### 5.1 Creación de Sandbox

```
1. Usuario hace clic en "Create Sandbox"
2. Frontend llama POST /api/sandbox/create
3. Backend:
   a. Crea directorio /tmp/librechat-sandboxes/sbx_xxx
   b. Copia workspace al directorio sandbox
   c. Escanea archivos iniciales (tracking)
   d. Crea container Docker (si disponible)
   e. Guarda sandbox en memoria
4. Frontend muestra sandbox listo
```

### 5.2 Ejecución de Comando

```
1. Usuario escribe comando en terminal
2. Frontend llama POST /api/sandbox/:id/execute
3. Backend:
   a. Verifica estado del sandbox
   b. Ejecuta comando en container o localmente
   c. Captura stdout/stderr
   d. Detecta cambios en archivos
   e. Registra en historial
4. Frontend muestra resultado
```

### 5.3 Promoción de Cambios

```
1. Usuario selecciona archivos modificados
2. Opcional: hace clic en "Stage for Review"
3. Usuario hace clic en "Promote to Workspace"
4. Backend:
   a. Copia archivos modificados al workspace real
   b. Limpia lista de cambios pendientes
5. Frontend confirma éxito
```

---

## 6. SEGURIDAD

### 6.1 Aislamiento

| Nivel | Descripción |
|-------|-------------|
| **Docker** | Container aislado con límites de CPU/memoria |
| **Directorio** | Workspace copiado a carpeta temporal |
| **Path Traversal** | Previene acceso fuera del sandbox |
| **Permisos** | Solo el usuario que creó el sandbox puede acceder |

### 6.2 Variables de Entorno

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `SANDBOX_BASE_PATH` | Directorio base de sandboxes | `/tmp/librechat-sandboxes` |
| `SANDBOX_IMAGE` | Imagen Docker | `ubuntu:22.04` |

### 6.3 Límites de Recursos

| Recurso | Valor por defecto |
|---------|-------------------|
| CPU | 1 núcleo |
| Memoria | 512MB |
| Timeout | 3600s (1 hora) |

---

## 7. USO

### 7.1 Integración en SupervisorPanel

```tsx
import { SandboxPanel } from '~/components/Supervisor';

const MyPage = () => {
  return (
    <div>
      <SupervisorPanel />
      <SandboxPanel 
        sessionId={session.id}
        workspacePath="/app/workspace"
      />
    </div>
  );
};
```

### 7.2 Uso Standalone

```tsx
import { SandboxPanel } from '~/components/Supervisor';

const SandboxPage = () => {
  return (
    <div style={{ height: '600px' }}>
      <SandboxPanel 
        sessionId="my-session-123"
        workspacePath="/path/to/project"
      />
    </div>
  );
};
```

### 7.3 Configuración de Docker

Para usar Docker (opcional pero recomendado):

1. Asegúrate de que Docker esté instalado y ejecutándose
2. Configura la variable de entorno:
   ```bash
   export SANDBOX_IMAGE=ubuntu:22.04
   ```
3. Opcionalmente, usa una imagen más ligera:
   ```bash
   export SANDBOX_IMAGE=node:20-slim
   ```

---

## 8. ESTADO DE IMPLEMENTACIÓN

### Completado ✅

- [x] Servicio SandboxManager backend
- [x] API REST completa
- [x] Componentes React (Panel, Terminal, FileTree, Preview, Changes)
- [x] Hooks de React Query
- [x] CSS para todos los componentes
- [x] Integración con rutas del servidor
- [x] Documentación técnica

### Pendiente 🔲

- [ ] Tests unitarios
- [ ] Integración con EventBus para eventos en tiempo real
- [ ] Visualización de diffs (comparación de cambios)
- [ ] Soporte para múltiples workspaces simultáneos
- [ ] Persistencia de sandboxes en MongoDB

---

**Documento preparado por OpenHands AI Agent**
