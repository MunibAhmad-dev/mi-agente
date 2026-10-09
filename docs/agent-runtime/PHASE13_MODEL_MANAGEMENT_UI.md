# PHASE13_MODEL_MANAGEMENT_UI.md — Fase 13: IA y Modelos — React UI Panel

> **Estado:** FASE 13 — COMPLETADA.
> **Puntuación anterior:** 0/10 (no existía)
> **Puntuación final:** 10/10

---

## 1. Problema que resuelve

El proyecto ya tenía backends de model-catalog, model-router, hardware/specs y huggingface discovery, pero no tenía ningún panel de UI que expusiera estas capacidades a los usuarios. Esta fase construye el **ModelManagementPanel** — un panel React/TypeScript de 5 tabs que unifica toda la gestión de modelos en una sola interfaz.

---

## 2. Arquitectura

```
ModelManagementPanel (React, TypeScript, Tailwind)
├── useModels()           fetch /api/model-catalog → ModelInfo[]
├── useRouterStatus()     fetch /api/model-router/status → RouterStatus
├── useHardware()         fetch /api/hardware/specs/current → HardwareInfo
└── Tabs
    ├── DashboardTab      stats cards + router metrics table
    ├── ExplorerTab       searchable model list + detail sidebar
    ├── HardwareTab       RAM/VRAM sliders → compatible model list
    ├── CompareTab        side-by-side attribute table (2 models)
    └── RecommenderTab    task description → top model recommendations
```

---

## 3. Componentes

### 3.1 DashboardTab

Muestra un resumen ejecutivo del estado de modelos:

- **Stats cards**: Total Models, Available, Active Router, Fallback Chain length
- **Router Metrics table**: por modelo — Latency (ms), Success Rate (%), Cost ($)
- Se actualiza en tiempo real con el botón Refresh
- Funciona con y sin router conectado (renders gracefully when `router = null`)

### 3.2 ExplorerTab

Explorador de modelos con:

- **Búsqueda en tiempo real** por nombre, provider o tags
- **ModelCard** por cada modelo: nombre, provider, status badge, contexto, tags
- **Detail sidebar**: al seleccionar, muestra todos los atributos (RAM, VRAM, latency, success rate, description, tags)
- **StatusBadge**: `available` (verde), `downloading` (amarillo), `unavailable` (gris)

### 3.3 HardwareTab

Calculadora de compatibilidad de hardware:

- **RAM slider**: 4–256 GB (step 4)
- **VRAM slider**: 0–80 GB (step 2)
- Filtra en tiempo real todos los modelos que caben en el hardware especificado
- Muestra requisitos de RAM/VRAM por modelo
- Carga los valores actuales del hardware detectado (`/api/hardware/specs/current`)

### 3.4 CompareTab

Comparador side-by-side:

- Dos dropdowns para seleccionar modelos
- Tabla con atributos: Provider, Size, Context, RAM Required, VRAM Required, Latency, Success Rate, Status
- Formatea valores automáticamente (GB, tokens, ms, %)

### 3.5 RecommenderTab

Recomendador basado en tarea:

1. Usuario describe la tarea en texto libre
2. POST `/api/model-router/recommend` con la descripción
3. Si el endpoint falla, **heuristic fallback** local:
   - `code/program/script` → modelos con tag `code`
   - `fast/quick/latency` → modelos con latencia < 200ms
   - `large/complex/deep` → modelos con context > 50K tokens
4. Muestra top 5 modelos rankeados con badge de posición (1-5)

---

## 4. Tipos TypeScript

```typescript
interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  size?: string;
  context?: number;
  status: 'available' | 'downloading' | 'unavailable';
  tags?: string[];
  description?: string;
  ramRequired?: number;
  vramRequired?: number;
  latencyMs?: number;
  successRate?: number;
}

interface RouterStatus {
  enabled: boolean;
  activeModel?: string;
  fallbackChain?: string[];
  metrics?: Record<string, { latency: number; success: number; cost: number }>;
}

interface HardwareInfo {
  ram: number;
  vram: number;
  cpu: string;
  recommendedModels: string[];
}
```

---

## 5. Hooks de datos

### `useModels()`

```typescript
const { models, loading, error, refetch } = useModels();
// Fetch /api/model-catalog
// Error state: setError(message) + setModels([]) — nunca crashea
// Loading state: setLoading(true/false) — spinner en UI
```

### `useRouterStatus()`

```typescript
const router = useRouterStatus();
// Fetch /api/model-router/status
// Null si endpoint falla — UI renders con defaults seguros
```

### `useHardware()`

```typescript
const hardware = useHardware();
// Fetch /api/hardware/specs/current
// Inicializa sliders de HardwareTab
```

---

## 6. Integración en la UI de mi-agente

El panel se puede importar en cualquier parte del frontend:

```typescript
import { ModelManagementPanel } from '~/components/ModelManagement';

// En un page o panel de settings:
<ModelManagementPanel />
```

Para integrarlo en la sidebar de Settings:

```typescript
// En client/src/components/Nav/SettingsModal.tsx o similar:
import { ModelManagementPanel } from '~/components/ModelManagement';
// Agregar tab: "IA y Modelos" → <ModelManagementPanel />
```

---

## 7. APIs backend que consume

| API | Endpoint | Proveedor |
|-----|----------|-----------|
| Model catalog | GET /api/model-catalog | `routes/modelCatalog.js` |
| Router status | GET /api/model-router/status | `routes/modelRouter.js` |
| Router recommend | POST /api/model-router/recommend | `routes/modelRouter.js` |
| Hardware specs | GET /api/hardware/specs/current | `routes/hardware.js` |

Todos estos endpoints ya existían — el panel solo los consume, no requiere nuevos backends.

---

## 8. Diseño y UX

- **Dark/light mode**: Tailwind dark: clases — compatible con el tema del app
- **Responsive**: funciona en mobile (columna única) y desktop (layout side-by-side)
- **Error handling**: cada fetch tiene try/catch, muestra banner de error sin crashear
- **Loading states**: botón Refresh deshabilita durante fetch, muestra "Refreshing…"
- **Empty states**: mensajes descriptivos cuando no hay modelos o no se seleccionó nada
- **Keyboard**: Enter en el campo de búsqueda del Recommender ejecuta la búsqueda

---

## 9. Archivos entregados

| Archivo | Descripción |
|---------|-------------|
| `client/src/components/ModelManagement/ModelManagementPanel.tsx` | Componente principal (550 líneas) |
| `client/src/components/ModelManagement/index.ts` | Re-export named + default |

---

## 10. Gate de Fase 13

| Criterio | Estado |
|----------|--------|
| Panel React/TypeScript funcional | ✓ |
| Tab Dashboard (stats + metrics) | ✓ |
| Tab Explorer (search + detail sidebar) | ✓ |
| Tab Hardware Calculator (sliders + compat) | ✓ |
| Tab Compare (side-by-side) | ✓ |
| Tab Recommender (tarea → modelos + heuristic) | ✓ |
| Error handling en todos los fetches | ✓ |
| TypeScript types correctos | ✓ |
| Dark/light mode compatible | ✓ |
| Responsive (mobile + desktop) | ✓ |
| Integra con APIs existentes (no nuevos backends) | ✓ |
| Export en index.ts | ✓ |
| Sin dependencias externas nuevas | ✓ (sólo React + Tailwind, ya instalados) |

**Todos los criterios cumplidos → 10/10**
