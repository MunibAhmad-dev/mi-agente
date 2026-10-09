# 🔧 MCP Server - Model Context Protocol

<p align="center">
  <img src="https://img.shields.io/badge/MCP-Server-blue.svg" alt="MCP">
  <img src="https://img.shields.io/badge/Python-3.10+-green.svg" alt="Python">
  <img src="https://img.shields.io/badge/License-MIT-orange.svg" alt="License">
</p>

Servidor MCP (Model Context Protocol) que expone herramientas de IA-OS para clientes compatibles con MCP como Claude Desktop.

---

## 📋 Tabla de Contenidos

1. [Descripción](#descripción)
2. [Herramientas](#herramientas)
3. [Instalación](#instalación)
4. [Configuración](#configuración)
5. [Uso](#uso)
6. [Claude Desktop](#claude-desktop)

---

## 📖 Descripción

Este servidor MCP proporciona acceso a herramientas de desarrollo:

- 📁 **File Tools** - Leer, escribir, listar archivos
- 🐙 **Git Tools** - Status, log, diff, branch
- 🔍 **Search Tools** - Grep, búsqueda de archivos
- 💻 **Code Tools** - Linting, formatting, comandos

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     CLAUDE DESKTOP                            │
│                         │                                     │
│                         │ MCP Protocol                        │
│                         ▼                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  MCP CLIENT                            │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               MCP SERVER (Este)                          │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              TOOL HANDLERS                       │  │  │
│  │  │  • FileTools (read, write, list)                  │  │  │
│  │  │  • GitTools (status, log, diff)                   │  │  │
│  │  │  • SearchTools (grep, find)                       │  │  │
│  │  │  • CodeTools (lint, format)                       │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    FILESYSTEM                            │  │
│  │                    GIT REPO                               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Herramientas

### File Tools

| Herramienta | Descripción | Parámetros |
|------------|-------------|-------------|
| `list_directory` | Lista contenido de directorio | `path` |
| `read_file` | Lee archivo de texto | `path`, `max_lines` |
| `write_file` | Escribe archivo | `path`, `content` |
| `find_files` | Busca archivos por nombre | `pattern`, `path` |

### Git Tools

| Herramienta | Descripción | Parámetros |
|------------|-------------|-------------|
| `git_status` | Estado del repositorio | `path` |
| `git_log` | Historial de commits | `path`, `max_count` |
| `git_diff` | Diferencias | `path`, `file` |
| `git_branch` | Lista ramas | `path` |

### Search Tools

| Herramienta | Descripción | Parámetros |
|------------|-------------|-------------|
| `grep` | Busca texto en archivos | `pattern`, `path`, `extensions` |

### Code Tools

| Herramienta | Descripción | Parámetros |
|------------|-------------|-------------|
| `lint_file` | Ejecuta linter | `path`, `linter` |
| `format_file` | Formatea archivo | `path`, `formatter` |
| `run_command` | Ejecuta comando shell | `command`, `path` |

---

## 📥 Instalación

### Requisitos

- Python 3.10+
- Git
- Opcional: linters (ruff, pylint, eslint, prettier)

### 1. Clonar e instalar

```bash
cd packages/mcp-server
pip install -e .
```

### 2. Instalar linters opcionales

```bash
# Python
pip install ruff pylint flake8 autopep8 black

# JavaScript/TypeScript
npm install -g eslint prettier
```

---

## ⚙️ Configuración

### Variables de Entorno

```bash
# Paths permitidos (separados por :)
export MCP_ALLOWED_PATHS="/workspace:/home/user/projects"

# Timeout de comandos (segundos)
export MCP_COMMAND_TIMEOUT=30

# Máximo de líneas por archivo
export MCP_MAX_OUTPUT_LINES=1000
```

### Paths Permitidos

Por seguridad, el servidor solo permite acceder a ciertos paths:

```python
ALLOWED_PATHS = [
    "/workspace",
    os.path.expanduser("~/projects"),
    os.path.expanduser("~/workspace"),
]
```

Para agregar más paths, modifica `config.ALLOWED_PATHS` en `mcp_server.py`.

---

## 🚀 Uso

### Ejecución Directa

```bash
# Ejecutar servidor
python -m mcp_server.src.mcp_server

# O con Python directo
cd packages/mcp-server
python src/mcp_server.py
```

### Verificar Instalación

```bash
# Ver herramientas disponibles
python src/mcp_server.py

# Output esperado:
# Servidor: librechat-mcp-server v1.0.0
#
# Herramientas disponibles:
#   - list_directory
#   - read_file
#   - write_file
#   - find_files
#   - git_status
#   - git_log
#   - git_diff
#   - git_branch
#   - grep
#   - lint_file
#   - format_file
#   - run_command
```

---

## 🤖 Claude Desktop

### macOS

Edita `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "librechat": {
      "command": "python",
      "args": [
        "/path/to/mi-libre-chat/packages/mcp-server/src/mcp_server.py"
      ],
      "env": {
        "MCP_ALLOWED_PATHS": "/workspace:/home/user/projects"
      }
    }
  }
}
```

### Windows

Edita `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "librechat": {
      "command": "python",
      "args": [
        "C:\\path\\to\\mi-libre-chat\\packages\\mcp-server\\src\\mcp_server.py"
      ]
    }
  }
}
```

### Linux

Edita `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "librechat": {
      "command": "python3",
      "args": [
        "/home/user/mi-libre-chat/packages/mcp-server/src/mcp_server.py"
      ]
    }
  }
}
```

---

## 🔒 Seguridad

### Medidas Implementadas

1. **Path Allowlisting** - Solo permite acceso a paths configurados
2. **Command Whitelist** - Solo permite comandos específicos (ls, cat, grep, etc.)
3. **Timeout** - Comandos con timeout para evitar bloqueos
4. **Output Limiting** - Limita líneas de salida

### Recomendaciones

- ⚠️ No ejecutar como root
- ⚠️ Revisar paths permitidos regularmente
- ⚠️ Monitorear logs de comandos
- ⚠️ Usar usuarios limitados para el servidor

---

## 📝 Ejemplos

### Listar archivos

```python
# Llamada MCP
{
    "name": "list_directory",
    "arguments": {"path": "/workspace/project"}
}
```

### Leer archivo

```python
{
    "name": "read_file",
    "arguments": {
        "path": "/workspace/project/README.md",
        "max_lines": 100
    }
}
```

### Git status

```python
{
    "name": "git_status",
    "arguments": {"path": "/workspace/project"}
}
```

### Buscar en archivos

```python
{
    "name": "grep",
    "arguments": {
        "pattern": "TODO",
        "path": "/workspace/project",
        "extensions": "py,ts,tsx"
    }
}
```

---

## 📄 Licencia

**MIT License**

---

<div align="center">
  <strong>Puente 2: Herramientas MCP para LibreChat</strong>
  <br>
  <em>Con ❤️ para la comunidad</em>
</div>
