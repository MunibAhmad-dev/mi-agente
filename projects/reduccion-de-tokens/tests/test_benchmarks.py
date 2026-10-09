"""Benchmark lab tests: reproducibility + real measured savings (spec §35, §51, §71)."""
import json

from token_optimization.benchmarks.datasets import (
    chat_tasks, rag_tasks, tool_agent_tasks, data_tasks, coding_tasks, research_tasks,
)
from token_optimization.benchmarks.runner import BenchmarkLab


class TestDatasets:
    def test_deterministic(self):
        a = [t.query for t in chat_tasks(3)]
        b = [t.query for t in chat_tasks(3)]
        assert a == b
        a2 = [json.dumps(i["content"])[:50] for t in rag_tasks(2) for i in t.items]
        b2 = [json.dumps(i["content"])[:50] for t in rag_tasks(2) for i in t.items]
        assert a2 == b2

    def test_all_datasets_produce_tasks(self):
        for fn in (chat_tasks, rag_tasks, tool_agent_tasks, data_tasks, coding_tasks, research_tasks):
            tasks = fn(2)
            assert tasks, fn.__name__
            for t in tasks:
                assert t.items, t.task_id


class TestLab:
    def test_full_arm_saves_tokens_without_losing_sufficiency(self):
        lab = BenchmarkLab(model="gpt-4o")
        samples = chat_tasks(2) + rag_tasks(2) + tool_agent_tasks(2) + data_tasks(2)
        baseline = lab.run_arm("baseline", samples)
        full = lab.run_arm("full", samples)
        base_tok = sum(r.baseline_tokens for r in baseline)
        full_tok = sum(r.optimized_tokens for r in full)
        assert full_tok < base_tok * 0.9, (base_tok, full_tok)  # at least 10% measured reduction
        assert all(r.sufficient for r in full)

    def test_report_renders_with_measured_numbers(self):
        from token_optimization.benchmarks.report import render_report

        lab = BenchmarkLab(model="gpt-4o")
        reports = lab.run_all(arms=["baseline", "full"])
        text = render_report(reports, "gpt-4o", tokenizer_exact=True)
        assert "BENCHMARK REPORT" in text
        assert "mechanical sufficiency proxy" in text
        assert "|" in text  # tables present
