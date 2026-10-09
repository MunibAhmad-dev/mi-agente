# Análisis de Paquetes Existentes - Mi LibreChat

## Resumen Ejecutivo

| Paquete | Nombre | Versión | Tipo | Responsabilidad Principal |
|---------|--------|---------|------|---------------------------|
| packages/api/ | @librechat/api | 1.7.34 | Backend/NPM | Lógica de negocio, MCP, OAuth, agentes |
| packages/client/ | @librechat/client | 0.4.63 | React Components | UI components, hooks, theming |
| packages/data-provider/ | librechat-data-provider | 0.8.509 | Data Layer | API calls, react-query, config |
| packages/data-schemas/ | @librechat/data-schemas | 0.0.56 | Domain Models | Mongoose schemas, validators, types |
| packages/api-key-client/ | (sin package.json) | - | Client SDK | Cliente para API-Key Manager |

---

## 1. Paquete: packages/api (@librechat/api)

### Estructura de Archivos
- 39+ directorios con lógica de negocio
- Módulos: mcp, oauth, agents, storage, cache, stream, auth, etc.

### Responsabilidades
- Core Backend: Lógica de negocio principal del servidor
- MCP (Model Context Protocol): Gestión de conexiones MCP, OAuth, herramientas
- Agents: Sistema de agentes con LangGraph
- OAuth: Flujos OAuth 2.0 con On-Behalf-Of
- Storage: Integración con S3, manejo de archivos
- Cache: Sistema de cache con Redis/Memory
- Streaming: Server-Sent Events para responses
- Auth: JWT, sesiones, autenticación

### Exports Públicos
- mcp/*, oauth/*, crypto/*, agents/*, storage/*, stream/*, cache/*
- auth, auth/*, endpoints/*, files/*, tools/*, skills/*, etc.

### Dependencias Internas
- @librechat/data-schemas → Schemas, modelos, tipos de dominio
- librechat-data-provider → Tipos, constantes, utilidades
- @librechat/agents → Core de agentes LangGraph

### Reutilización en Nueva Arquitectura
ALTA - Componentes clave reutilizables:
- mcp/ - Protocolo MCP completo (usable como biblioteca)
- crypto/ - JWT y criptografía
- oauth/ - Flujos OAuth
- storage/ - Wrapper S3
- stream/ - Utilidades SSE
- cache/ - Patrones de cache

---

## 2. Paquete: packages/client (@librechat/client)

### Estructura de Archivos
- 10+ directorios: components, hooks, theme, locales, svgs, utils
- 31 idiomas en locales/

### Responsabilidades
- UI Components: Componentes React reutilizables
- Theme System: Dark/Light themes, CSS variables
- Hooks: useAvatar, useLocalize, useToast, useCombobox
- State Management: Jotai atoms, React Query
- Internationalization: i18next con 31 idiomas
- Icons: SVG icons para providers

### Exports Públicos
- Components, hooks, common, store, svgs, utils, Providers, theme

### Dependencias Internas
- librechat-data-provider → Tipos y config para UI

### Reutilización en Nueva Arquitectura
MEDIA - Consideraciones:
- Los hooks (useLocalize, useToast) son útiles
- Theme system es bien diseñado
- Components acoplados a la app principal
- Grande dependencia de Radix UI

---

## 3. Paquete: packages/data-provider (librechat-data-provider)

### Estructura de Archivos
- request.ts - Cliente HTTP axios
- data-service.ts - Servicio principal de datos
- schemas.ts - Zod schemas
- config.ts - Configuración (90KB)
- file-config.ts - Config de archivos (48KB)
- artifacts.ts - Artefactos (98KB)
- react-query/ - Hooks React Query
- queries/ - Queries (litellm, discovery, comfyui, marketplace)
- types/ - 14 archivos de tipos

### Responsabilidades
- API Client: Axios wrapper para todas las llamadas HTTP
- React Query Integration: Hooks para data fetching
- Config Management: Configuración global de la app
- Schema Validation: Zod schemas para validación
- File Handling: Upload/download, CloudFront
- Auth Headers: Gestión de tokens en requests

### Exports Públicos
- azure, bedrock, balance, config, file-config, messages, artifacts
- parsers, generate, models, mcp, permissions, roles, types, etc.

### Dependencias Internas
- @librechat/data-schemas → Tipos de dominio (peerDependency)

### Reutilización en Nueva Arquitectura
ALTA - Componentes muy reutilizables:
- request.ts - Cliente HTTP robusto
- data-service.ts - Servicio de datos
- schemas.ts - Zod schemas completos
- config.ts - Sistema de configuración
- Tipos MCP, agents, assistants

---

## 4. Paquete: packages/data-schemas (@librechat/data-schemas)

### Estructura de Archivos
- models/ - 40+ modelos Mongoose (user, conversation, message, file, etc.)
- types/ - 40+ tipos TypeScript estrictos
- methods/ - Métodos de validación de dominio
- config/ - Winston logger, tenant context, parsers
- migrations/ - Migraciones de MongoDB
- schema/ - Schemas adicionales

### Responsabilidades
- Domain Models: Modelos Mongoose para MongoDB
- Type Definitions: Tipos TypeScript estrictos
- Validation Methods: Métodos de validación de dominio
- Schema Migrations: Migraciones de índices
- Logging: Winston logger configurado
- Tenant Context: Sistema multi-tenant
- Crypto: Encriptación de tokens

### Exports Públicos
- createModels, createMethods, createTxMethods
- RoleConflictError, tokenValues, validateSkill*
- logger (Winston), tenantStorage, getTenantId

### Dependencias Externas (peerDependencies)
- mongoose, lodash, jsonwebtoken, meilisearch, nanoid, winston, klona

### Reutilización en Nueva Arquitectura
MUY ALTA - Fundamento de la nueva arquitectura:
- Modelos Mongoose completos
- 40+ tipos TypeScript estrictos
- Sistema de validaciones
- Logger reutilizable
- Sistema multi-tenant

---

## 5. Paquete: packages/api-key-client (SDK)

### Estructura de Archivos
- src/index.ts - Clase APIKeyClient + interfaces

### Responsabilidades
- Chat Completions: Routing inteligente a providers
- Provider Management: CRUD de providers
- API Key Management: Gestión de claves
- Usage Tracking: Métricas de uso
- Automatic Failover: Selección de claves backup

### Exports Públicos
- APIKeyClient class con métodos: chat, getModels, listProviders, createProvider, listKeys, createKey, deleteKey, getSystemStats, healthCheck
- Factory function: getAPIKeyClient

### Dependencias
- Sin dependencias - Vanilla TypeScript/Fetch

### Reutilización en Nueva Arquitectura
ALTA - Listo para nueva arquitectura:
- SDK standalone con fetch
- Patrón factory para singleton
- Timeout handling robusto
- Tipos bien definidos

---

## Matriz de Dependencias

@librechat/agents (external)
    │
    ▼
@librechat/data-schemas ◄──────────────┐
├── Models, Types, Methods, Migrations │
└──────────┬───────────────────────────┘
           │
           ▼
librechat-data-provider     @librechat/api
├── API Client              ├── MCP
├── React Query             ├── OAuth
├── Schemas                 ├── Agents
├── Config                  ├── Storage
└──────────┬───────────────┼── Cache
           │               ├── Stream
           ▼               └── Auth
@librechat/client ─────────┘
├── Components
├── Hooks
├── Theme
└── i18n

---

## Recomendaciones para Nueva Arquitectura

### Componentes a Reutilizar (OBLIGATORIO/ALTA)

| Paquete | Módulo | Reutilización | Razón |
|---------|--------|---------------|-------|
| data-schemas | Models, Types | OBLIGATORIA | Base de datos y tipos |
| data-schemas | Methods | OBLIGATORIA | Validaciones de dominio |
| data-schemas | Logger | ALTA | Winston configurado |
| data-provider | request.ts | ALTA | Cliente HTTP robusto |
| data-provider | schemas.ts | ALTA | Zod schemas |
| data-provider | config.ts | ALTA | Sistema de config |
| api | mcp/ | ALTA | Protocolo MCP completo |
| api | oauth/ | MEDIA | Depende de Express |
| api | storage/ | MEDIA | Wrapper S3 |
| api | stream/ | MEDIA | Utilidades SSE |
| api-key-client | TODO | ALTA | SDK standalone |

### Componentes a Evaluar

| Paquete | Módulo | Evaluación | Razón |
|---------|--------|------------|-------|
| client | components/ | PARCIAL | Acoplado a la app |
| client | hooks/ | SÍ | Útiles, genéricos |
| client | theme/ | SÍ | Sistema de temas |
| api | agents/ | DEPENDE | Si usa LangGraph |
| api | endpoints/ | NO | Específico de la app |

### Componentes a Reemplazar

| Paquete | Módulo | Razón |
|---------|--------|-------|
| api | app/ | Lógica de servidor Express |
| api | middleware/ | Express middleware |
| api | cluster/ | Cluster management |
| client | locales/ | i18n de la app |
| client | svgs/ | Icons específicos |

---

## Conclusiones

1. **@librechat/data-schemas** es el núcleo más importante - contiene todos los modelos Mongoose y tipos que deben reutilizarse.

2. **librechat-data-provider** proporciona una capa de datos bien diseñada que puede servir como base para la nueva API.

3. **@librechat/api-key-client** es un ejemplo perfecto de un SDK reusable que debería mantenerse.

4. **@librechat/api** tiene muchos componentes reutilizables (MCP, OAuth, crypto) pero está muy acoplado a Express.

5. **@librechat/client** es más difícil de reutilizar por su acoplamiento con la aplicación principal.

---

*Documento generado: 2026-07-22*
*Versión del repositorio: mi-libre-chat*
