# PLAN DE IMPLEMENTACIÓN — 6 ITEMS RESTANTES PARA 100%

## Estado Actual
- **Tools del agente:** 54
- **Módulos cognitivos:** 43
- **Tests:** 165+
- **Cobertura:** ~95%

---

## FASE 1: Integrar MCP SDK al MCPServer
**Estado:** MCP SDK instalado, MCPServer.js tiene fallback manual
**Qué falta:** Conectar oficialmente con @modelcontextprotocol/sdk
**Días:** 0.5

### Acciones:
1. Actualizar MCPServer.js para usar SDK oficial
2. Crear MCPClient.js para conectar a servidores MCP externos
3. Registrar tools del agente como tools MCP
4. Verificar comunicación bidireccional

---

## FASE 2: WebSocket para AskUser
**Estado:** AskUserModule.js usa EventEmitter interno
**Qué falta:** Integración WebSocket real-time con el frontend
**Días:** 1

### Acciones:
1. Actualizar AskUserModule.js con WebSocket nativo
2. Crear endpoints de conexión WebSocket
3. Integrar con el servidor Express existente
4. Verificar comunicación bidireccional

---

## FASE 3: tree-sitter Parsing
**Estado:** RepositoryMap.js tiene fallback regex
**Qué falta:** tree-sitter instalado y funcionando
**Días:** 0.5

### Acciones:
1. Intentar instalar tree-sitter (npm install tree-sitter)
2. Si falla, mejorar el fallback regex existente
3. Agregar parsers para más lenguajes
4. Verificar parsing de archivos reales

---

## FASE 4: Auto-checkpoint en Error
**Estado:** CheckpointManager.js tiene save/load básico
**Qué falta:** Hook automático en error para crear checkpoint
**Días:** 0.5

### Acciones:
1. Integrar CheckpointManager con AgentLoop
2. Crear hook que guarde checkpoint automáticamente en error
3. Agregar restauración automática post-error
4. Verificar con escenario de error simulado

---

## FASE 5: Tool Compression Automática
**Estado:** ToolResultCompressor.js existe pero no está integrado
**Qué falta:** Cableado automático en el AgentLoop
**Días:** 0.5

### Acciones:
1. Integrar ToolResultCompressor en AgentLoop
2. Aplicar compresión automática a cada tool result
3. Medir ahorro de tokens
4. Verificar que no se pierde información crítica

---

## FASE 6: Skills Pre-cargados
**Estado:** SkillsSystem.js funciona pero está vacío
**Qué falta:** Skills base pre-cargados para tareas comunes
**Días:** 1

### Acciones:
1. Crear skills para: coding, debugging, refactoring, testing, documentation
2. Crear skills para: web search, file operations, git operations
3. Crear skills para: context engineering, memory management
4. Verificar que se detectan correctamente

---

## RESUMEN

| Fase | Item | Días | RAM | Estado |
|------|------|------|-----|--------|
| 1 | MCP SDK integration | 0.5 | ~5MB | ⏳ |
| 2 | WebSocket AskUser | 1 | ~2MB | ⏳ |
| 3 | tree-sitter parsing | 0.5 | ~15MB | ⏳ |
| 4 | Auto-checkpoint error | 0.5 | ~2MB | ⏳ |
| 5 | Tool compression auto | 0.5 | ~2MB | ⏳ |
| 6 | Skills pre-cargados | 1 | ~3MB | ⏳ |
| **TOTAL** | | **4 días** | **~29MB** | |

**Costo:** $0
**Licencias:** 100% MIT/Apache
**Después de esto:** 100% completitud
