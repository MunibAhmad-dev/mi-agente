"""Deterministic benchmark datasets (spec §48).

Every dataset is generated with a fixed seed: no randomness, no fake success
labels, fully reproducible. Sufficiency is evaluated mechanically by the
fidelity evaluator (invariants preserved or recoverable), not by an LLM judge.
"""
from __future__ import annotations

import json
import random
from dataclasses import dataclass, field


@dataclass
class TaskSample:
    task_id: str
    dataset: str
    query: str
    items: list = field(default_factory=list)  # list of dicts: {content, role, source, content_type?}


def _seeded(seed: int) -> random.Random:
    return random.Random(seed)


def chat_tasks(n: int = 6) -> list[TaskSample]:
    """Long conversation with repeated questions and boilerplate."""
    rng = _seeded(42)
    tasks = []
    topics = ["deploy pipeline", "database migrations", "API rate limits", "logging setup", "billing webhooks"]
    for i in range(n):
        topic = topics[i % len(topics)]
        items = []
        system = (
            "You are the production assistant. Follow the runbook exactly. "
            "DO NOT delete production_database. DO NOT rotate credentials without approval. "
            "Escalate any destructive action to a human."
        )
        items.append({"content": system, "role": "system", "source": "system_prompt"})
        for turn in range(8):
            items.append({
                "content": f"Turn {turn}: user asks about {topic} again with slightly different words. "
                           f"Details: service {topic.split()[0]}-{rng.randint(1, 9)}, latency {rng.randint(20, 400)}ms.",
                "role": "user",
                "source": "chat",
            })
            items.append({
                "content": f"Turn {turn}: assistant explained {topic} constraints, gave steps 1-4, "
                           f"mentioned the {rng.randint(2, 12)}% error budget and linked runbook.",
                "role": "assistant",
                "source": "chat",
            })
        # heavy repetition: same boilerplate repeated
        for k in range(4):
            items.append({
                "content": f"Reminder: standard escalation policy applies to {topic}. "
                           f"Reminder: standard escalation policy applies to {topic}.",
                "role": "system",
                "source": "boilerplate",
            })
        tasks.append(TaskSample(f"chat-{i}", "chat", f"how do I configure {topic}?", items))
    return tasks


def rag_tasks(n: int = 6) -> list[TaskSample]:
    """Retrieved chunks with duplicates and conflicting passages."""
    rng = _seeded(7)
    tasks = []
    for i in range(n):
        base_docs = [
            f"Document {j}: The {['auth service', 'billing worker', 'search indexer'][j % 3]} uses "
            f"timeout {rng.choice([30, 60, 90])}s and retries {rng.randint(1, 5)} times. "
            + "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor." * 6
            for j in range(8)
        ]
        # near-duplicates and exact duplicates (typical RAG noise)
        items = [{"content": d, "role": "external", "source": f"retrieved_doc_{k}"} for k, d in enumerate(base_docs)]
        for k in range(6):
            items.append({"content": base_docs[k % len(base_docs)], "role": "external",
                          "source": f"retrieved_doc_dup_{k}"})
        # one conflicting passage the model must keep
        items.append({
            "content": "CONFLICTING SOURCE: the auth service timeout was reduced to 15s in v2.3 (2026-08-01).",
            "role": "external",
            "source": "changelog_v2.3",
        })
        tasks.append(TaskSample(f"rag-{i}", "rag", "what timeout does the auth service use and since when?", items))
    return tasks


def tool_agent_tasks(n: int = 6) -> list[TaskSample]:
    """Long tool-heavy trajectories with repeated outputs and errors."""
    rng = _seeded(11)
    tasks = []
    for i in range(n):
        lines = ["step 1: plan created for incident response"]
        for step in range(2, 40):
            if step % 7 == 0:
                lines.append(f"step {step}: ERROR tool shell exit=1 permission denied /var/log/app-{rng.randint(1,3)}.log")
            else:
                lines.append(f"step {step}: observation: 200 OK rows={rng.randint(1, 50)} latency={rng.randint(5, 90)}ms "
                             f"payload={{'page': {step}, 'items': {rng.randint(0, 20)}}}")
        # repeated identical observations (classic waste)
        for _ in range(12):
            lines.append("step poll: observation: 200 OK rows=0 latency=12ms payload={'page': 1, 'items': 0}")
        lines.append("step 41: decision: escalate to human operator; DO NOT restart the cluster automatically")
        items = [{
            "content": "\n".join(lines),
            "role": "tool",
            "source": "agent_trajectory",
            "content_type": "agent_trajectory",
        }]
        # a big JSON tool output
        big_json = json.dumps({
            "results": [
                {"id": f"row-{r}", "ts": f"2026-09-{(r % 28) + 1:02d}T10:{r % 60:02d}:00Z",
                 "status": rng.choice(["ok", "ok", "ok", "error"]), "latency_ms": rng.randint(5, 500),
                 "detail": "x" * rng.randint(40, 300)}
                for r in range(220)
            ],
            "total": 220,
            "query": "recent_events",
        })
        items.append({"content": big_json, "role": "tool", "source": "events_api", "content_type": "json"})
        tasks.append(TaskSample(f"agent-{i}", "tool_agents", "summarize the incident and the failing tool calls", items))
    return tasks


def research_tasks(n: int = 4) -> list[TaskSample]:
    rng = _seeded(23)
    tasks = []
    for i in range(n):
        items = []
        for d in range(10):
            items.append({
                "content": f"Paper {d}: we benchmark {rng.choice(['retrieval', 'compression', 'caching'])} methods "
                           f"across {rng.randint(3, 30)} datasets; baseline accuracy {rng.uniform(50, 90):.1f}%. "
                           + "Related work repeats the same survey text. " * 8,
                "role": "external",
                "source": f"arxiv_result_{d}",
            })
        for d in range(5):
            items.append({"content": items[d]["content"], "role": "external", "source": f"dup_result_{d}"})
        tasks.append(TaskSample(f"research-{i}", "research", "compare compression methods and report best accuracy", items))
    return tasks


def coding_tasks(n: int = 4) -> list[TaskSample]:
    code = '''import json
import logging

# SECURITY: never log credentials
logger = logging.getLogger(__name__)


class TokenBudget:
    """Tracks token budgets per request."""

    def __init__(self, limit: int = 4096) -> None:
        self.limit = limit
        self.used = 0

    def can_spend(self, tokens: int) -> bool:
        return self.used + tokens <= self.limit

    def spend(self, tokens: int) -> None:
        if not self.can_spend(tokens):
            raise ValueError("budget exceeded")
        self.used += tokens


def summarize(items: list[dict]) -> dict:
    """Summarize usage rows; never raise on empty input."""
    if not items:
        return {"total": 0, "max": 0}
    values = [int(i.get("tokens", 0)) for i in items]
    return {"total": sum(values), "max": max(values), "count": len(values)}


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)
'''
    tasks = []
    for i in range(n):
        items = [
            {"content": "Fix the budget check so spending raises before mutation.", "role": "user", "source": "task"},
            {"content": code, "role": "user", "source": "file:src/budget.py", "content_type": "code"},
            {"content": code, "role": "tool", "source": "file_read:src/budget.py", "content_type": "code"},  # duplicate read
            {"content": "Traceback: ValueError('budget exceeded') raised after mutation at line 22.",
             "role": "tool", "source": "test_output"},
        ]
        tasks.append(TaskSample(f"coding-{i}", "coding", "debug the token budget mutation bug", items))
    return tasks


def data_tasks(n: int = 4) -> list[TaskSample]:
    rng = _seeded(99)
    tasks = []
    for i in range(n):
        rows = [
            {"event_id": f"e{r}", "ts": f"2026-09-10T{r % 24:02d}:{r % 60:02d}:00Z",
             "user_id": f"u{r % 37}", "amount": round(rng.uniform(1, 999), 2),
             "currency": "USD", "status": rng.choice(["settled", "pending", "failed"]),
             "note": "standard settlement note " * rng.randint(1, 6)}
            for r in range(300)
        ]
        items = [{
            "content": json.dumps({"events": rows, "count": len(rows)}),
            "role": "tool",
            "source": "payments_db_export",
            "content_type": "json",
        }]
        tasks.append(TaskSample(f"data-{i}", "data_analysis", "which events failed settlement and for what amount?", items))
    return tasks


def standard_suite() -> list[TaskSample]:
    """The `standard` benchmark suite (deterministic, reproducible)."""
    return (
        chat_tasks(6) + rag_tasks(6) + tool_agent_tasks(6)
        + research_tasks(4) + coding_tasks(4) + data_tasks(4)
    )
