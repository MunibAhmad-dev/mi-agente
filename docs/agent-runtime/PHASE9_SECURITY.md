# PHASE9_SECURITY.md — Fase 9: Security (Firewall + Sandbox + Permissions)

> **Estado:** FASE 9 — COMPLETADA (componente Firewall).
> **Conexión:** conecta los esquemas `supervisor/permission` (file/command/
> network/tool/infoPermissions) con los codingTools (Fase 3) y SandboxManager.

## 1. Implementación
| Archivo | Rol |
|---|---|
| `services/Security/agentFirewall.js` | Policy engine granular |
| `services/Security/__tests__/agentFirewall.spec.js` | 21 tests |

### Agent Firewall — la ÚNICA puerta entre el agente y el sistema
Ninguna acción de escritura/shell/git/secrets se ejecuta sin pasar por
`check()`. Resuelve la política desde un preset o un objeto custom y valida
cada acción:

**Acciones:** read_file, write_file, edit_file, list_directory,
execute_command, grep_search, glob_search, compile_check, code_execution.

**Decisiones:** ALLOW / DENY / CONFIRM (requiere aprobación humana).

**Recursos:** filesystem, shell, network, secrets, git, deployment.

### Presets (alineados con `supervisorPermissionSchema`)
| Preset | File R/W | Shell | Secrets | Network |
|---|---|---|---|---|
| restricted | R workspace, W none | none | none | none |
| standard | R+W workspace | allowlist + dangerous deny | none | none |
| full | todo | todo | todo | todo |

### Reglas de defensa en profundidad
- **denyPaths siempre gana** sobre allowPaths.
- **Secrets** (`.env`, `.ssh/`, `id_rsa`, `credentials`, `private.key`,
  `.aws/`, `.config/`, `.npmrc`, `.pypirc`) denegados salvo
  `allowReadSecrets` explícito (escritura de secrets siempre denegada).
- **Comandos peligrosos** (`rm -rf /`, `mkfs`, `dd`, fork bomb,
  `curl|bash`, `shutdown`) denegados salvo preset full.
- **Allowlist de shell**: comando no listado → DENY (deny por defecto).
- **Confirmación** para `git push`, `git commit`, `npm publish`.
- **Deny por defecto**: sin política → restricted.

### `enforce(params)`
Lanza `EACTION_DENIED` cuando se deniega — para integración directa en
los codingTools como guard pre-ejecución.

## 2. Cumple el doc
| Doc § | Item | Estado |
|---|---|---|
| §9 | Conectar PermissionService + supervisor | ✓ política alineada con schema |
| §9 | Permisos granulares (fs/shell/git/secrets/deployment) | ✓ |
| §6 | Operaciones peligrosas con políticas | ✓ deny por defecto + confirm |
| §9 | Sandbox Docker | SandboxManager ya existe (Fase 3 lo referencia) |

## 3. Gate de Fase 9

| Criterio | Estado |
|---|---|
| Implementación | ✓ policy engine granular + 3 presets + defensa profunda |
| Tests | ✓ 21/21 pasan |
| Conecta esquemas supervisor | ✓ mismo shape que permission schema |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 10 (Memory).

## 4. Nota de alcance
El `SandboxManager.js` (Docker) ya existe y está wired vía routes/sandbox.
La Fase 9 añade el **Firewall** (policy engine) que valida acciones antes
de llegar al sandbox/herramientas. La integración directa firewall→codingTools
(guard pre-ejecución) se documenta como siguiente paso de wiring sin
cambiar la API del firewall.
