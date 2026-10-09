# 08 — FLUJO DE AUTENTICACIÓN Y PERMISOS

## RESUMEN

El proyecto usa **LibreChat** como sistema de autenticación principal. No tiene un sistema de auth custom — delega todo a LibreChat que a su vez usa MongoDB.

---

## FLUJO DE AUTENTICACIÓN

```
┌─────────────────────────────────────────────────────────────┐
│                        USUARIO                              │
│                   (Browser / CLI)                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  LOGIN PAGE   │  LibreChat UI en puerto 3080
              │  /api/auth/*  │
              └───────┬───────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │  LOCAL   │ │  GOOGLE  │ │  GITHUB  │  OAuth providers
    │  EMAIL   │ │  OAUTH   │ │  OAUTH   │  (configurables)
    └────┬─────┘ └────┬─────┘ └────┬─────┘
         │            │            │
         ▼            ▼            ▼
    ┌──────────────────────────────────┐
    │     verifyPassword / OAuth       │
    │     → generate JWT token         │
    └──────────────┬───────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │     JWT Token (Bearer)           │
    │     → Set-Cookie / localStorage  │
    └──────────────┬───────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │     requireJwtAuth middleware     │  Todas las rutas protegidas
    │     → Verifica token             │  pasan por aquí
    │     → Decodifica usuario         │
    │     → Adjunta req.user           │
    └──────────────┬───────────────────┘
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐
    │ USER    │ │ ADMIN   │ │ API     │  Roles y permisos
    │ ROUTES  │ │ ROUTES  │ │ ROUTES  │
    └─────────┘ └─────────┘ └─────────┘
```

---

## ARCHIVOS DE AUTENTICACIÓN

| Archivo | Función |
|---------|---------|
| `api/server/routes/auth.js` | Rutas: login, logout, refresh, register, 2FA |
| `api/server/middleware/requireJwtAuth.js` | Middleware JWT — verifica token en cada request |
| `api/server/middleware/optionalJwtAuth.js` | JWT opcional (rutas públicas) |
| `api/server/middleware/checkBan.js` | Verifica si el usuario está baneado |
| `api/server/middleware/uaParser.js` | Parsea User-Agent |
| `api/server/middleware/validateRegistration.js` | Valida registro |
| `api/server/middleware/validateEmailLogin.js` | Valida login por email |
| `api/server/middleware/setTwoFactorTempUser.js` | 2FA temporal |

---

## MIDDLEWARE DE AUTORIZACIÓN

### Para rutas admin:
```javascript
router.use(requireJwtAuth);      // 1. Verificar JWT
router.use(requireAdminAccess);  // 2. Verificar rol admin
```

### Para rutas de usuario:
```javascript
router.use(requireJwtAuth);      // 1. Verificar JWT
router.use(checkBan);            // 2. Verificar no baneado
router.use(uaParser);            // 3. Parsear user-agent
```

### Para rutas públicas:
```javascript
router.use(optionalJwtAuth);     // JWT opcional
```

---

## ROLES Y PERMISOS

### Roles predefinidos:
| Rol | Acceso |
|-----|--------|
| `USER` | Rutas de usuario (conversaciones, archivos, settings) |
| `ADMIN` | Rutas admin (usuarios, config, audit, roles) |
| `SUPER_ADMIN` | Todo + gestión de roles |

### Permisos granulares (RBAC/ABAC):
| Permiso | Descripción |
|---------|-------------|
| `readUsers` | Leer lista de usuarios |
| `manageUsers` | Crear/editar/eliminar usuarios |
| `readRoles` | Ver roles |
| `manageRoles` | Crear/editar/eliminar roles |
| `readGroups` | Ver grupos |
| `manageGroups` | Crear/editar/eliminar grupos |
| `readAuditLog` | Ver audit log |
| `requireSyncRunCapability` | Ejecutar sync |

### Archivos de permisos:
```
api/server/middleware/roles/
├── requireRole.js          # Verificar rol
├── requirePermission.js    # Verificar permiso
└── ...

api/server/policies/
├── roles.js                # Definición de roles
└── ...

api/server/routes/admin/
├── roles.js                # CRUD de roles
├── grants.js               # Asignación de permisos
├── groups.js               # Gestión de grupos
└── users.js                # Gestión de usuarios
```

---

## 2FA (Two-Factor Authentication)

| Endpoint | Función |
|----------|---------|
| `POST /api/auth/2fa/enable` | Habilitar 2FA |
| `POST /api/auth/2fa/verify` | Verificar código |
| `POST /api/auth/2fa/confirm` | Confirmar activación |
| `POST /api/auth/2fa/disable` | Desactivar 2FA |
| `POST /api/auth/2fa/backup/regenerate` | Regenerar códigos backup |

---

## OAUTH PROVIDERS

| Provider | Archivo de config |
|----------|-------------------|
| Google | `routes/admin/auth.js` → `/oauth/google` |
| GitHub | `routes/admin/auth.js` → `/oauth/github` |
| Discord | `routes/admin/auth.js` → `/oauth/discord` |
| Facebook | `routes/admin/auth.js` → `/oauth/facebook` |
| Apple | `routes/admin/auth.js` → `/oauth/apple` |
| OpenID | `routes/admin/auth.js` → `/oauth/openid` |
| SAML | `routes/admin/auth.js` → `/oauth/saml` |

---

## FLUJO COMPLETO: Request Autenticado

```
1. Usuario envía request con Authorization: Bearer <JWT>
       │
2. requireJwtAuth middleware:
   │  a. Extrae token del header
   │  b. Verifica firma con CREDS_KEY
   │  c. Decodifica payload (userId, email, role)
   │  d. Adjunta req.user = { id, email, role }
   │  e. Si token inválido → 401 Unauthorized
       │
3. checkBan middleware:
   │  a. Consulta MongoDB: ¿está baneado?
   │  b. Si baneado → 403 Forbidden
       │
4. Route handler:
   │  a. Usa req.user para identificar al usuario
   │  b. Consulta permisos si es necesario
   │  c. Ejecuta lógica de negocio
       │
5. Response → JSON con datos
```

---

## NOTAS PARA EL FREELANCER

1. **No crear sistema de auth custom** — LibreChat ya lo maneja
2. **Las API keys de OAuth van en `.env`** — ver `.env.example`
3. **Para testing, usar el usuario admin** que se crea en el setup
4. **El JWT usa CREDS_KEY + CREDS_IV** para firmar — no cambiar sin regenerar tokens
5. **Los audit logs están en MongoDB** — colección `audit_logs`
