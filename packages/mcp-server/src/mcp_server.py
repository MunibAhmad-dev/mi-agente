"""
MCP Server for LibreChat
========================

Model Context Protocol (MCP) Server que expone herramientas de IA-OS
para ser usadas por clientes compatibles con MCP (Claude Desktop, etc.)

Herramientas disponibles:
- File tools (read, write, list)
- Git tools (status, log, diff)
- Search tools (web search, grep)
- Code tools (lint, format, execute)

Autor: Mi LibreChat
Versión: 1.0.0
Licencia: MIT
"""

import os
import json
import subprocess
from pathlib import Path
from typing import Any, Optional, List
from dataclasses import dataclass, asdict
from datetime import datetime

# MCP Server SDK
try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import (
        Tool,
        TextContent,
        Resource,
        ResourceTemplate,
    )
    from mcp.server import InitializationOptions
    MCP_SDK = True
except ImportError:
    MCP_SDK = False

# =============================================================================
# CONFIGURACIÓN
# =============================================================================

SERVER_NAME = "librechat-mcp-server"
SERVER_VERSION = "1.0.0"

# Configuración de herramientas
class Config:
    """Configuración del servidor MCP."""
    
    # Paths permitidos (para seguridad)
    ALLOWED_PATHS = [
        os.path.expanduser("~/projects"),
        os.path.expanduser("~/workspace"),
        "/workspace",
        os.getcwd(),
    ]
    
    # Path raíz del proyecto
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    
    # Timeout para comandos (segundos)
    COMMAND_TIMEOUT = 30
    
    # Límite de líneas para resultados
    MAX_OUTPUT_LINES = 1000


config = Config()

# =============================================================================
# HERRAMIENTAS
# =============================================================================

@dataclass
class ToolResult:
    """Resultado de una herramienta."""
    success: bool
    content: str
    error: Optional[str] = None
    metadata: Optional[dict] = None


class FileTools:
    """Herramientas de sistema de archivos."""
    
    @staticmethod
    def list_directory(path: str = ".") -> ToolResult:
        """Lista el contenido de un directorio."""
        try:
            target_path = Path(path).resolve()
            
            # Verificar permisos
            if not any(str(target_path).startswith(p) for p in config.ALLOWED_PATHS):
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Path no permitido: {path}"
                )
            
            if not target_path.exists():
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Path no existe: {path}"
                )
            
            if not target_path.is_dir():
                return ToolResult(
                    success=False,
                    content="",
                    error=f"No es un directorio: {path}"
                )
            
            items = []
            for item in sorted(target_path.iterdir()):
                item_type = "dir" if item.is_dir() else "file"
                size = item.stat().st_size if item.is_file() else 0
                modified = datetime.fromtimestamp(item.stat().st_mtime).isoformat()
                items.append({
                    "name": item.name,
                    "type": item_type,
                    "size": size,
                    "modified": modified
                })
            
            return ToolResult(
                success=True,
                content=json.dumps(items, indent=2)
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def read_file(path: str, max_lines: int = 500) -> ToolResult:
        """Lee el contenido de un archivo."""
        try:
            target_path = Path(path).resolve()
            
            # Verificar permisos
            if not any(str(target_path).startswith(p) for p in config.ALLOWED_PATHS):
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Path no permitido: {path}"
                )
            
            if not target_path.exists():
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Archivo no existe: {path}"
                )
            
            if not target_path.is_file():
                return ToolResult(
                    success=False,
                    content="",
                    error=f"No es un archivo: {path}"
                )
            
            with open(target_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            if len(lines) > max_lines:
                lines = lines[:max_lines]
                truncated = True
            else:
                truncated = False
            
            content = "".join(lines)
            
            return ToolResult(
                success=True,
                content=content,
                metadata={
                    "path": str(target_path),
                    "lines": len(lines),
                    "truncated": truncated
                }
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def write_file(path: str, content: str) -> ToolResult:
        """Escribe contenido a un archivo."""
        try:
            target_path = Path(path).resolve()
            
            # Verificar que está dentro de allowed paths
            if not any(str(target_path).startswith(p) for p in config.ALLOWED_PATHS):
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Path no permitido: {path}"
                )
            
            # Crear directorio padre si no existe
            target_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(target_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return ToolResult(
                success=True,
                content=f"Archivo escrito: {target_path}",
                metadata={"path": str(target_path), "bytes": len(content)}
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def search_files(pattern: str, path: str = ".", file_pattern: str = "*") -> ToolResult:
        """Busca archivos por nombre."""
        try:
            target_path = Path(path).resolve()
            
            if not any(str(target_path).startswith(p) for p in config.ALLOWED_PATHS):
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Path no permitido: {path}"
                )
            
            results = list(target_path.rglob(file_pattern))
            filtered = [r for r in results if pattern.lower() in r.name.lower()]
            
            files = [
                {"path": str(r.relative_to(target_path)), "type": "dir" if r.is_dir() else "file"}
                for r in filtered[:100]  # Limitar a 100 resultados
            ]
            
            return ToolResult(
                success=True,
                content=json.dumps(files, indent=2),
                metadata={"total": len(files), "pattern": pattern}
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))


class GitTools:
    """Herramientas de Git."""
    
    @staticmethod
    def git_status(path: str = ".") -> ToolResult:
        """Obtiene el estado de Git."""
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=path,
                capture_output=True,
                text=True,
                timeout=config.COMMAND_TIMEOUT
            )
            
            return ToolResult(
                success=result.returncode == 0,
                content=result.stdout or "No hay cambios",
                error=result.stderr if result.returncode != 0 else None
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def git_log(path: str = ".", max_count: int = 10) -> ToolResult:
        """Obtiene el historial de commits."""
        try:
            result = subprocess.run(
                ["git", "log", f"--max-count={max_count}", "--oneline", "--format=%h %s|%an|%ad"],
                cwd=path,
                capture_output=True,
                text=True,
                timeout=config.COMMAND_TIMEOUT
            )
            
            if result.returncode != 0:
                return ToolResult(success=False, content="", error=result.stderr)
            
            commits = []
            for line in result.stdout.strip().split("\n"):
                if "|" in line:
                    parts = line.split("|")
                    commits.append({
                        "hash": parts[0].strip(),
                        "message": parts[1].strip() if len(parts) > 1 else "",
                        "author": parts[2].strip() if len(parts) > 2 else "",
                        "date": parts[3].strip() if len(parts) > 3 else ""
                    })
            
            return ToolResult(
                success=True,
                content=json.dumps(commits, indent=2)
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def git_diff(path: str = ".", file: str = None) -> ToolResult:
        """Obtiene las diferencias de Git."""
        try:
            cmd = ["git", "diff"]
            if file:
                cmd.append("--")
                cmd.append(file)
            
            result = subprocess.run(
                cmd,
                cwd=path,
                capture_output=True,
                text=True,
                timeout=config.COMMAND_TIMEOUT
            )
            
            return ToolResult(
                success=result.returncode == 0,
                content=result.stdout or "No hay cambios",
                error=result.stderr if result.returncode != 0 else None
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def git_branch(path: str = ".") -> ToolResult:
        """Lista las ramas de Git."""
        try:
            result = subprocess.run(
                ["git", "branch", "-a"],
                cwd=path,
                capture_output=True,
                text=True,
                timeout=config.COMMAND_TIMEOUT
            )
            
            return ToolResult(
                success=result.returncode == 0,
                content=result.stdout,
                error=result.stderr if result.returncode != 0 else None
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))


class SearchTools:
    """Herramientas de búsqueda."""
    
    @staticmethod
    def grep(pattern: str, path: str = ".", extensions: str = None) -> ToolResult:
        """Busca texto en archivos."""
        try:
            target_path = Path(path).resolve()
            
            if not any(str(target_path).startswith(p) for p in config.ALLOWED_PATHS):
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Path no permitido: {path}"
                )
            
            cmd = ["grep", "-rn", "--include=*.py", "--include=*.ts", "--include=*.tsx"]
            
            if extensions:
                for ext in extensions.split(","):
                    ext = ext.strip()
                    if ext:
                        cmd.extend(["--include", f"*.{ext}"])
            else:
                # Solo buscar en archivos de código
                pass
            
            cmd.append(pattern)
            cmd.append(str(target_path))
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=config.COMMAND_TIMEOUT
            )
            
            # Parsear resultados
            matches = []
            for line in result.stdout.strip().split("\n")[:100]:  # Limitar a 100 líneas
                if ":" in line:
                    parts = line.split(":", 2)
                    if len(parts) >= 2:
                        matches.append({
                            "file": parts[0],
                            "line": parts[1],
                            "content": parts[2] if len(parts) > 2 else ""
                        })
            
            return ToolResult(
                success=True,
                content=json.dumps(matches, indent=2),
                metadata={"total": len(matches), "pattern": pattern}
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def find_files(pattern: str, path: str = ".") -> ToolResult:
        """Encuentra archivos por nombre."""
        return FileTools.search_files(pattern, path)


class CodeTools:
    """Herramientas de código."""
    
    @staticmethod
    def lint_file(path: str, linter: str = "ruff") -> ToolResult:
        """Ejecuta un linter en un archivo."""
        try:
            # Verificar que el archivo existe
            if not Path(path).exists():
                return ToolResult(success=False, content="", error="Archivo no existe")
            
            # Intentar diferentes linters
            linters = {
                "ruff": ["ruff", "check", path],
                "eslint": ["npx", "eslint", path],
                "prettier": ["npx", "prettier", "--check", path],
                "pylint": ["pylint", path],
                "flake8": ["flake8", path],
            }
            
            if linter not in linters:
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Linter no soportado: {linter}. Disponibles: {', '.join(linters.keys())}"
                )
            
            cmd = linters[linter]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=config.COMMAND_TIMEOUT
            )
            
            return ToolResult(
                success=result.returncode == 0,
                content=result.stdout or "Sin errores",
                error=result.stderr if result.returncode != 0 else None
            )
        except FileNotFoundError:
            return ToolResult(
                success=False,
                content="",
                error=f"Linter no instalado: {linter}"
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def format_file(path: str, formatter: str = "ruff") -> ToolResult:
        """Formatea un archivo."""
        try:
            if not Path(path).exists():
                return ToolResult(success=False, content="", error="Archivo no existe")
            
            formatters = {
                "ruff": ["ruff", "format", path],
                "black": ["black", path],
                "prettier": ["npx", "prettier", "--write", path],
                "autopep8": ["autopep8", "-i", path],
            }
            
            if formatter not in formatters:
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Formatter no soportado: {formatter}"
                )
            
            cmd = formatters[formatter]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=config.COMMAND_TIMEOUT
            )
            
            return ToolResult(
                success=result.returncode == 0,
                content=f"Archivo formateado: {path}",
                error=result.stderr if result.returncode != 0 else None
            )
        except FileNotFoundError:
            return ToolResult(
                success=False,
                content="",
                error=f"Formatter no instalado: {formatter}"
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))
    
    @staticmethod
    def run_command(command: str, path: str = ".") -> ToolResult:
        """Ejecuta un comando de shell."""
        try:
            target_path = Path(path).resolve()
            
            if not any(str(target_path).startswith(p) for p in config.ALLOWED_PATHS):
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Path no permitido: {path}"
                )
            
            # Peligroso: solo permitir ciertos comandos
            allowed_commands = ["ls", "cat", "head", "tail", "grep", "find", "wc", "sort", "uniq"]
            cmd_name = command.split()[0] if command.split() else ""
            
            if cmd_name not in allowed_commands:
                return ToolResult(
                    success=False,
                    content="",
                    error=f"Comando no permitido: {cmd_name}"
                )
            
            result = subprocess.run(
                command,
                shell=True,
                cwd=path,
                capture_output=True,
                text=True,
                timeout=config.COMMAND_TIMEOUT
            )
            
            return ToolResult(
                success=result.returncode == 0,
                content=result.stdout[:5000],  # Limitar salida
                error=result.stderr if result.returncode != 0 else None,
                metadata={"returncode": result.returncode}
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=str(e))


# =============================================================================
# REGISTRO DE HERRAMIENTAS
# =============================================================================

def get_tools() -> List[Tool]:
    """Retorna la lista de herramientas disponibles."""
    
    return [
        # File Tools
        Tool(
            name="list_directory",
            description="Lista el contenido de un directorio",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del directorio",
                        "default": "."
                    }
                }
            }
        ),
        Tool(
            name="read_file",
            description="Lee el contenido de un archivo",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del archivo"
                    },
                    "max_lines": {
                        "type": "number",
                        "description": "Máximo de líneas a leer",
                        "default": 500
                    }
                },
                "required": ["path"]
            }
        ),
        Tool(
            name="write_file",
            description="Escribe contenido a un archivo",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del archivo"
                    },
                    "content": {
                        "type": "string",
                        "description": "Contenido a escribir"
                    }
                },
                "required": ["path", "content"]
            }
        ),
        Tool(
            name="find_files",
            description="Busca archivos por nombre",
            inputSchema={
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Patrón de búsqueda"
                    },
                    "path": {
                        "type": "string",
                        "description": "Ruta base",
                        "default": "."
                    }
                },
                "required": ["pattern"]
            }
        ),
        
        # Git Tools
        Tool(
            name="git_status",
            description="Obtiene el estado de Git",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del repositorio",
                        "default": "."
                    }
                }
            }
        ),
        Tool(
            name="git_log",
            description="Obtiene el historial de commits",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del repositorio",
                        "default": "."
                    },
                    "max_count": {
                        "type": "number",
                        "description": "Máximo de commits",
                        "default": 10
                    }
                }
            }
        ),
        Tool(
            name="git_diff",
            description="Obtiene las diferencias de Git",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del repositorio",
                        "default": "."
                    },
                    "file": {
                        "type": "string",
                        "description": "Archivo específico (opcional)"
                    }
                }
            }
        ),
        Tool(
            name="git_branch",
            description="Lista las ramas de Git",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del repositorio",
                        "default": "."
                    }
                }
            }
        ),
        
        # Search Tools
        Tool(
            name="grep",
            description="Busca texto en archivos",
            inputSchema={
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Patrón a buscar"
                    },
                    "path": {
                        "type": "string",
                        "description": "Ruta base",
                        "default": "."
                    },
                    "extensions": {
                        "type": "string",
                        "description": "Extensiones (ej: py,js,ts)"
                    }
                },
                "required": ["pattern"]
            }
        ),
        
        # Code Tools
        Tool(
            name="lint_file",
            description="Ejecuta un linter en un archivo",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del archivo"
                    },
                    "linter": {
                        "type": "string",
                        "description": "Linter a usar",
                        "enum": ["ruff", "eslint", "prettier", "pylint", "flake8"],
                        "default": "ruff"
                    }
                },
                "required": ["path"]
            }
        ),
        Tool(
            name="format_file",
            description="Formatea un archivo",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Ruta del archivo"
                    },
                    "formatter": {
                        "type": "string",
                        "description": "Formatter a usar",
                        "enum": ["ruff", "black", "prettier", "autopep8"],
                        "default": "ruff"
                    }
                },
                "required": ["path"]
            }
        ),
        Tool(
            name="run_command",
            description="Ejecuta un comando de shell (limitado)",
            inputSchema={
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Comando a ejecutar"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directorio de trabajo",
                        "default": "."
                    }
                },
                "required": ["command"]
            }
        ),
    ]


# =============================================================================
# HANDLERS DE HERRAMIENTAS
# =============================================================================

async def handle_tool(tool_name: str, arguments: dict) -> TextContent:
    """Maneja una llamada a herramienta."""
    
    result: ToolResult
    
    # File Tools
    if tool_name == "list_directory":
        result = FileTools.list_directory(arguments.get("path", "."))
    elif tool_name == "read_file":
        result = FileTools.read_file(
            arguments["path"],
            arguments.get("max_lines", 500)
        )
    elif tool_name == "write_file":
        result = FileTools.write_file(
            arguments["path"],
            arguments["content"]
        )
    elif tool_name == "find_files":
        result = FileTools.search_files(
            arguments["pattern"],
            arguments.get("path", ".")
        )
    
    # Git Tools
    elif tool_name == "git_status":
        result = GitTools.git_status(arguments.get("path", "."))
    elif tool_name == "git_log":
        result = GitTools.git_log(
            arguments.get("path", "."),
            arguments.get("max_count", 10)
        )
    elif tool_name == "git_diff":
        result = GitTools.git_diff(
            arguments.get("path", "."),
            arguments.get("file")
        )
    elif tool_name == "git_branch":
        result = GitTools.git_branch(arguments.get("path", "."))
    
    # Search Tools
    elif tool_name == "grep":
        result = SearchTools.grep(
            arguments["pattern"],
            arguments.get("path", "."),
            arguments.get("extensions")
        )
    
    # Code Tools
    elif tool_name == "lint_file":
        result = CodeTools.lint_file(
            arguments["path"],
            arguments.get("linter", "ruff")
        )
    elif tool_name == "format_file":
        result = CodeTools.format_file(
            arguments["path"],
            arguments.get("formatter", "ruff")
        )
    elif tool_name == "run_command":
        result = CodeTools.run_command(
            arguments["command"],
            arguments.get("path", ".")
        )
    
    else:
        result = ToolResult(
            success=False,
            content="",
            error=f"Herramienta desconocida: {tool_name}"
        )
    
    if result.success:
        return TextContent(type="text", text=result.content)
    else:
        raise Exception(result.error or "Error desconocido")


# =============================================================================
# SERVER PRINCIPAL
# =============================================================================

if MCP_SDK:
    # Versión con MCP SDK
    app = Server(SERVER_NAME)
    
    @app.list_tools()
    async def list_tools() -> List[Tool]:
        """Lista todas las herramientas disponibles."""
        return get_tools()
    
    @app.call_tool()
    async def call_tool(name: str, arguments: dict) -> List[TextContent]:
        """Ejecuta una herramienta."""
        try:
            result = await handle_tool(name, arguments)
            return [result]
        except Exception as e:
            return [TextContent(type="text", text=f"Error: {str(e)}")]
    
    async def main():
        """Punto de entrada principal."""
        async with stdio_server() as (read_stream, write_stream):
            await app.run(
                read_stream,
                write_stream,
                InitializationOptions(
                    server_name=SERVER_NAME,
                    server_version=SERVER_VERSION,
                    capabilities={}
                )
            )
    
    if __name__ == "__main__":
        import asyncio
        asyncio.run(main())
else:
    # Versión simple sin MCP SDK (para desarrollo)
    print("MCP SDK no instalado. Usando modo de desarrollo.")
    print(f"Servidor: {SERVER_NAME} v{SERVER_VERSION}")
    print("\nHerramientas disponibles:")
    for tool in get_tools():
        print(f"  - {tool.name}: {tool.description}")
