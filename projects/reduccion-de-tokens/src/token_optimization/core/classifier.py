"""Content and task classification (spec §8, §18)."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from .ir import ContentType, RiskLevel

_TASK_KEYWORDS = {
    "coding": ("code", "function", "bug", "stacktrace", "refactor", "compile", "test", "class ", "def ", "import "),
    "debugging": ("error", "exception", "traceback", "fail", "crash", "stacktrace"),
    "rag": ("according to", "document", "source", "passage", "contexto", "documento"),
    "research": ("compare", "papers", "study", "survey", "state of the art"),
    "data_analysis": ("dataset", "csv", "json", "query", "sql", "statistics"),
    "chat": ("hello", "thanks", "please", "what", "how", "hola", "gracias"),
}


@dataclass
class TaskPolicy:
    """Per-task compression policy (spec §18)."""

    task: str
    max_compression_ratio: float = 0.5
    allowed_methods: tuple = ("dedupe", "json_structural", "text_drop", "trajectory", "externalize")
    recovery_strategy: str = "targeted"
    token_budget: int | None = None
    risk_tolerance: RiskLevel = RiskLevel.HIGH


TASK_POLICIES: dict[str, TaskPolicy] = {
    "chat": TaskPolicy("chat", max_compression_ratio=0.6, risk_tolerance=RiskLevel.MEDIUM),
    "coding": TaskPolicy("coding", max_compression_ratio=0.35, allowed_methods=("dedupe", "code_symbols", "externalize")),
    "debugging": TaskPolicy("debugging", max_compression_ratio=0.35, allowed_methods=("dedupe", "logs", "externalize")),
    "rag": TaskPolicy("rag", max_compression_ratio=0.75, allowed_methods=("dedupe", "text_drop", "externalize")),
    "research": TaskPolicy("research", max_compression_ratio=0.75),
    "data_analysis": TaskPolicy("data_analysis", max_compression_ratio=0.7),
    "tool_execution": TaskPolicy("tool_execution", max_compression_ratio=0.8, risk_tolerance=RiskLevel.MEDIUM),
    "long_horizon": TaskPolicy("long_horizon", max_compression_ratio=0.85),
}


class ContextClassifier:
    """Classifies content type and task type. Deterministic, local, no model needed."""

    _JSON_RE = re.compile(r"^\s*[\[{].*[\]}]\s*$", re.DOTALL)
    _LOG_RE = re.compile(
        r"^\s*(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}|WARN|ERROR|INFO|DEBUG|TRACE|\[\w+\])", re.MULTILINE
    )
    _CODE_RE = re.compile(r"^\s*(def |class |function |import |from .* import|const |let |var |public |package )", re.MULTILINE)
    _SEARCH_RE = re.compile(r"(https?://\S+.*\n?){3,}")
    _TRAJECTORY_RE = re.compile(r"(step\s*\d+|tool[_ ]call|observation:|action:)", re.IGNORECASE)
    _MD_RE = re.compile(r"^#{1,6} \w", re.MULTILINE)

    def classify_content(self, content: str) -> ContentType:
        s = content.strip()
        if not s:
            return ContentType.UNKNOWN
        if self._JSON_RE.match(s):
            try:
                json.loads(s)
                return ContentType.JSON
            except (json.JSONDecodeError, ValueError):
                pass
        code_hits = len(self._CODE_RE.findall(s))
        if code_hits >= 3:
            return ContentType.CODE
        log_hits = len(self._LOG_RE.findall(s))
        if log_hits >= 3 and log_hits >= code_hits:
            return ContentType.LOGS
        if self._TRAJECTORY_RE.search(s) and s.count("\n") > 4:
            return ContentType.AGENT_TRAJECTORY
        if self._SEARCH_RE.search(s):
            return ContentType.SEARCH_RESULTS
        if self._MD_RE.search(s):
            return ContentType.MARKDOWN
        return ContentType.TEXT

    def classify_task(self, text: str) -> str:
        low = text.lower()
        best, best_hits = "chat", 0
        for task, kws in _TASK_KEYWORDS.items():
            hits = sum(1 for kw in kws if kw in low)
            if hits > best_hits:
                best, best_hits = task, hits
        return best

    def policy_for(self, task: str) -> TaskPolicy:
        return TASK_POLICIES.get(task, TASK_POLICIES["chat"])
