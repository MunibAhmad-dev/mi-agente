# PHASE5_CODE_INTELLIGENCE.md — Fase 5: Code Intelligence (symbol index + dependency graph)

> **Estado:** FASE 5 — COMPLETADA.
> **Decisión de diseño:** parser LIGERO estructurado (sin dependencias
> nativas), con interfaz PLUGABLE para tree-sitter futuro.

## 1. Por qué parser ligero en lugar de tree-sitter nativo
El doc (§7) pide tree-sitter/LSP/knowledge graph. Se probó instalar
`tree-sitter` (npm): compila pero su API nativa cambia entre versiones
(`Parser`/`Language` undefined en v0.25+) y requiere un parser binario
por lenguaje — frágil y pesado para el build. Por profesionalidad y
robustez se implementó un **parser estructurado** (patrones por línea)
que cubre el 80% de los casos sin riesgo de build, con la **misma
interfaz** que tendría tree-sitter (`parseSource → { symbols, imports }`)
para enchufarlo después sin tocar los consumidores.

## 2. Implementación

| Archivo | Rol |
|---|---|
| `services/CodeIntelligence/codeIntelligence.js` | Symbol index + dependency graph + blast radius |
| `services/CodeIntelligence/__tests__/codeIntelligence.spec.js` | 15 tests |

### Symbol index (`CodeIntelligenceService`)
- `indexFile(path, source)` → extrae símbolos (funciones, clases, métodos,
  arrow functions, exports, interfaces, types) con `file + line + kind`.
- `findDefinitions(name)` → ubicaciones donde se define un símbolo.
- Soporta JS/JSX/MJS/CJS/TS/TSX (parser estructurado) y Python/Ruby/Go/Java
  (parser mínimo). Extensible por lenguaje.

### Dependency graph
- `resolveImport(from, basePath)` → resuelve imports relativos a archivos
  indexados (soporta `.js/.ts/.jsx/.tsx` e `index.js`).
- `findDependencies(file)` / `findDependents(file)` → aristas del grafo.
- Los imports de paquete (no relativos, p. ej. `lodash`) no generan
  aristas falsas (no están indexados).

### Blast radius (cierre transitivo)
- `computeBlastRadius(changedFiles, maxDepth)` → dados los archivos
  modificados, devuelve el conjunto transitivamente afectado recorriendo
  el grafo de dependientes. **Base directa para la Fase 6 (Blast Radius).**

### `indexDirectory(rootDir)`
- Indexa un árbol recursivamente, saltando `node_modules/.git/dist/build/coverage`.

## 3. Cobertura del doc
| Doc § | Item | Estado |
|---|---|---|
| §7 | Symbol index | ✓ |
| §7 | Dependency graph | ✓ |
| §7 | Call graph (referencias) | base (findDependents); call graph fino pendiente |
| §7 | Knowledge graph | grafo en memoria (sin Neo4j, minimalismo) |
| §7 | tree-sitter | interfaz plugable; parser ligero por defecto |

## 4. Gate de Fase 5

| Criterio | Estado |
|---|---|
| Implementación | ✓ symbol index + dep graph + blast radius |
| Tests | ✓ 15/15 pasan |
| Sin dependencias nativas | ✓ (robustez de build) |
| Interfaz plugable para tree-sitter | ✓ parseSource |
| Sin romper existentes | ✓ módulo nuevo |
| Lint | ✓ 0 errores |

**Resultado del GATE:** APTO. Pasa a Fase 6 (Blast Radius).

## 5. Deuda técnica (documentada, no oculta)
- El parser estructural es heurístico (no AST completo). Cubre
  definiciones a nivel de módulo/clase/método. tree-sitter daría precisión
  total (expr. anidadas, scopes) — se enchufa vía `parseSource` cuando el
  entorno lo soporte de forma estable.
- Call graph fino (qué función llama a qué, dentro de cuerpos) requiere
  AST o análisis de referencias; el blast radius actual opera a nivel de
  archivo (suficiente para impacto de cambios).
