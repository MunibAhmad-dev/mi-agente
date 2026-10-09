# Sistema de Sandbox - Limitaciones y Consideraciones

**Fecha:** 2026-07-21
**Versión:** actualisacion-12

---

## 📋 Resumen

El sistema de Sandbox de Mi-LibreChat proporciona un entorno aislado para que los agentes ejecuten operaciones de manera segura. Sin embargo, es importante entender las **limitaciones actuales** de la implementación.

---

## 🔒 Nivel de Aislamiento

### ❌ Lo que NO es (Limitaciones Actuales)

El Sandbox **NO** proporciona:

| Característica | Estado | Descripción |
|---------------|--------|-------------|
| **Contenedores Docker** | 🔴 | No usa contenedores aislados |
| **Virtualización** | 🔴 | No hay VMs o entornos virtuales |
| **Syscalls bloqueadas** | 🔴 | El código puede ejecutar syscalls del sistema |
| **Network isolation** | 🔴 | Puede hacer requests de red |
| **Filesystem isolation** | 🟡 | Aislamiento a nivel de directorio |
| **Resource limits** | 🔴 | Sin límites de CPU/memoria |

### ✅ Lo que SÍ es

| Característica | Estado | Descripción |
|---------------|--------|-------------|
| **Directorio temporal** | ✅ | Usa `/tmp/sandbox_*` |
| **Path traversal prevention** | ✅ | Previene acceso fuera del sandbox |
| **Tracking de cambios** | ✅ | Registro de archivos modificados |
| **Diff viewer** | ✅ | Visualización de cambios |
| **Aprobación de cambios** | ✅ | Usuario puede aprobar/rechazar |

---

## 🏗️ Arquitectura Actual

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOST (Mi-LibreChat)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Node.js Process                         │  │
│  │                                                            │  │
│  │  ┌────────────────┐    ┌────────────────────────────┐   │  │
│  │  │ SandboxManager │───▶│   FileSystemSandbox        │   │  │
│  │  └────────────────┘    │   ┌────────────────────┐   │   │  │
│  │                         │   │ workspaceDir:      │   │   │  │
│  │                         │   │ /tmp/sandbox_*    │   │   │  │
│  │                         │   └────────────────────┘   │   │  │
│  │                         └────────────────────────────┘   │  │
│  │                                                              │  │
│  │  ⚠️ MISMO PROCESS - MISMO UID - MISMO FILESYSTEM          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Riesgos de Seguridad

### 1. Acceso al Sistema de Archivos

```typescript
// El agente puede leer cualquier archivo legible por el proceso
// dentro del directorio sandbox, incluyendo:
```

**Archivos potencialmente accesibles:**
- `/home/*/.ssh/*` (si son legibles)
- `/etc/passwd` (legible por todos)
- Archivos del proyecto
- Variables de entorno exportadas

### 2. Ejecución de Comandos

```typescript
// Comandos ejecutados con permisos del proceso Node.js:
// -读写 archivos
// - Crear procesos
// - Hacer requests de red
// - Acceso a APIs si las credenciales están disponibles
```

### 3. Escalación de Privilegios

```
Riesgo: BAJO (si Node.js corre con usuario normal)
Riesgo: ALTO (si Node.js corre como root)
```

---

## 🛡️ Recomendaciones de Seguridad

### Para Desarrollo

```typescript
// 1. Configurar variables de entorno seguras
process.env = {
  NODE_ENV: 'production',
  // NO incluir credenciales sensibles
};

// 2. Ejecutar con usuario no-root
// user: node
// group: node

// 3. Configurar límites de recursos (en Docker)
resources:
  limits:
    cpus: '1'
    memory: 512M
```

### Para Producción (Recomendaciones)

| Solución | Descripción | Complejidad |
|---------|-------------|-------------|
| **Docker Container** | Ejecutar cada agente en su propio contenedor | Alta |
| **gVisor** | Runtime de contenedor ligero | Media |
| **WebAssembly** | Aislar código no confiable en WASM | Baja |
| **Seccomp** | Filtrar syscalls del sistema | Media |

### Configuración Recomendada para Docker

```dockerfile
# Ejecutar agente en contenedor aislado
FROM node:20-alpine

# Usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S node -u 1001

# Directorio de trabajo
WORKDIR /sandbox

# Copiar solo archivos necesarios
COPY --chown=node:node ./sandbox-files/ ./

# Ejecutar como usuario no-root
USER node

# Límites de recursos (en docker-compose)
```

```yaml
# docker-compose.yml
services:
  agent-sandbox:
    build: ./agent-sandbox
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          memory: 256M
    read_only: true
    tmpfs:
      - /tmp:size=100M,mode=1777
```

---

## 🔧 Configuración de Producción

### Variables de Entorno

```env
# Sandbox Configuration
SANDBOX_ISOLATION_LEVEL=docker        # none, filesystem, docker
SANDBOX_MAX_EXECUTION_TIME=300000    # 5 minutos
SANDBOX_MAX_MEMORY_MB=512
SANDBOX_MAX_CPU_CORES=1
SANDBOX_ALLOW_NETWORK=true
SANDBOX_ALLOWED_DOMAINS=*.api.example.com

# Seguridad
SANDBOX_STRICT_MODE=true
SANDBOX_BLOCK_DANGEROUS_PATHS=true
SANDBOX_MAX_FILE_SIZE_MB=10
```

### API de Configuración

```typescript
interface SandboxConfig {
  isolationLevel: 'none' | 'filesystem' | 'docker';
  maxExecutionTime: number;      // ms
  maxMemoryMB: number;
  maxCpuCores: number;
  allowNetwork: boolean;
  allowedDomains?: string[];
  allowedPaths?: string[];       // Rutas permitidas fuera del sandbox
  blockedCommands?: string[];   // Comandos bloqueados
}

// Uso
const sandbox = await sandboxManager.createSandbox({
  isolationLevel: 'docker',
  maxExecutionTime: 300000,
  maxMemoryMB: 512,
  allowNetwork: false,
});
```

---

## 📊 Comparativa de Aislamiento

| Característica | Actual | Docker | gVisor | WASM |
|---------------|--------|--------|--------|------|
| **Aislamiento FS** | Directorio | ✅ Completo | ✅ Completo | ✅ Completo |
| **Aislamiento Red** | ❌ | ✅ Completo | ✅ Completo | ✅ Completo |
| **Límites CPU** | ❌ | ✅ | ⚠️ Parcial | ✅ |
| **Límites Memoria** | ❌ | ✅ | ✅ | ✅ |
| **Syscalls** | ❌ Filtrados | ✅ | ✅ | ❌ Filtrados |
| **Inicio** | < 1ms | ~500ms | ~50ms | ~10ms |
| **Memoria overhead** | 0 | ~100MB | ~5MB | ~1MB |

---

## 🧪 Testing del Sandbox

### Test de Aislamiento

```typescript
describe('Sandbox Isolation', () => {
  test('should prevent path traversal', async () => {
    const sandbox = await sandboxManager.createSandbox();
    
    // Intentar acceder fuera del sandbox
    await expect(
      sandbox.execute('read_file', { path: '../../../etc/passwd' })
    ).rejects.toThrow('Invalid path');
  });

  test('should track file modifications', async () => {
    const sandbox = await sandboxManager.createSandbox();
    
    await sandbox.execute('write_file', { 
      path: 'test.txt', 
      content: 'hello' 
    });
    
    const changes = sandbox.getChanges();
    expect(changes.modifiedFiles).toContain('test.txt');
  });

  test('should allow approval workflow', async () => {
    const sandbox = await sandboxManager.createSandbox();
    
    await sandbox.execute('write_file', { 
      path: 'new-file.js', 
      content: '// new code' 
    });
    
    // Solicitar aprobación
    await sandbox.requestApproval('new-file.js');
    
    // Aprobar
    await sandbox.approve('new-file.js');
    
    const changes = sandbox.getChanges();
    expect(changes.getStatus('new-file.js')).toBe('approved');
  });
});
```

---

## 📝 Checklist para Producción

- [ ] Ejecutar Node.js como usuario no-root
- [ ] Configurar límites de recursos en Docker
- [ ] Deshabilitar acceso a `.ssh` y credenciales
- [ ] Implementar logging de todas las operaciones
- [ ] Configurar alertas para comandos peligrosos
- [ ] Implementar timeouts estrictos
- [ ] Probar con herramientas de pentesting
- [ ] Documentar procedimientos de respuesta a incidentes
- [ ] Configurar backups regulares
- [ ] Implementar rate limiting por agente

---

## 🔗 Referencias

- [Docker Security](https://docs.docker.com/engine/security/)
- [gVisor Documentation](https://gvisor.dev/docs/)
- [WebAssembly Security](https://webassembly.org/security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

## 📜 Historial de Cambios

| Fecha | Versión | Cambios |
|-------|---------|---------|
| 2026-07-21 | 1.0 | Creación del documento |

---

**Nota:** Este documento será actualizado conforme evolucione la implementación del Sandbox.
