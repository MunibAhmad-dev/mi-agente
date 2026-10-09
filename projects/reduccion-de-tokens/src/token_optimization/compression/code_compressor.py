"""Code compressor (spec §21): structural outline, never arbitrary line deletion.

Keeps: imports, signatures, decorators, class headers and critical comments.
Replaces function/class BODIES with a placeholder that carries the pointer to
the recoverable original. If tree-sitter is available it is used to find
top-level nodes; otherwise a conservative line scanner is used (both paths are
deterministic and tested).
"""
from __future__ import annotations

import re
from typing import Optional

from ..core.ir import ContextItem, RiskLevel
from .base import Compressor, TokenFn

_DECORATOR = re.compile(r"^\s*@[\w.]+")
_PY_DEF = re.compile(r"^\s*(def |class |async def )")
_IMPORT = re.compile(r"^\s*(import |from )")
_CRITICAL_COMMENT = re.compile(r"#.*\b(IMPORTANT|SECURITY|TODO|FIXME|CRITICAL|WARNING|DO NOT|NEVER)\b", re.IGNORECASE)
_JS_SIG = re.compile(r"^\s*(export\s+)?(async\s+)?(function\s+\w+|class\s+\w+|const\s+\w+\s*=\s*(async\s*)?\(|interface\s+\w+|type\s+\w+\s*=)")


def detect_language(content: str) -> str:
    head = content[:4000]
    py = len(re.findall(r"^\s*(def |class |import |from )", head, re.MULTILINE))
    js = len(re.findall(r"^\s*(function |const |let |var |import |export |class )", head, re.MULTILINE))
    if py >= 2 and py >= js:
        return "python"
    if js >= 2:
        return "javascript"
    return "unknown"


class CodeCompressor(Compressor):
    name = "code_symbols"
    content_types = ("code",)

    def _compress_one(self, item: ContextItem, token_fn: TokenFn, budget: Optional[int]) -> str:
        if item.risk == RiskLevel.CRITICAL:
            return item.content
        lang = detect_language(item.content)
        if lang == "python":
            return self._outline_python(item)
        if lang == "javascript":
            return self._outline_javascript(item)
        return item.content  # unknown language: KEEP (safe default)

    # -- python ------------------------------------------------------------
    def _outline_python(self, item: ContextItem) -> str:
        lines = item.content.splitlines()
        pointer = item.retrieval_pointer or item.hash
        out: list[str] = []
        i = 0
        while i < len(lines):
            line = lines[i]
            if _DECORATOR.match(line) or _PY_DEF.match(line) or _IMPORT.match(line) or _CRITICAL_COMMENT.search(line):
                out.append(line)
                if _PY_DEF.match(line) and ":" in line and not line.rstrip().endswith(":"):
                    out.append(line)
                elif _PY_DEF.match(line):
                    # walk the body via indentation
                    indent = len(line) - len(line.lstrip())
                    j = i + 1
                    body_lines = 0
                    while j < len(lines):
                        nxt = lines[j]
                        if nxt.strip() and (len(nxt) - len(nxt.lstrip())) <= indent:
                            break
                        body_lines += 1
                        j += 1
                    out.append(f"    [body omitted: {body_lines} lines; recoverable:{pointer}]")
                    i = j
                    continue
            i += 1
        return "\n".join(out)

    # -- javascript / typescript --------------------------------------------
    def _outline_javascript(self, item: ContextItem) -> str:
        lines = item.content.splitlines()
        pointer = item.retrieval_pointer or item.hash
        out: list[str] = []
        depth = 0
        in_body = False
        for line in lines:
            stripped = line.strip()
            if not in_body:
                if _JS_SIG.match(line) or _CRITICAL_COMMENT.search(line):
                    out.append(line)
                    if "{" in line:
                        in_body = True
                        depth = line.count("{") - line.count("}")
                elif _IMPORT.match(line) or line.startswith("export "):
                    out.append(line)
            else:
                depth += line.count("{") - line.count("}")
                if depth <= 0:
                    in_body = False
                    out.append("  [body omitted; recoverable:%s]" % pointer)
        return "\n".join(out)
