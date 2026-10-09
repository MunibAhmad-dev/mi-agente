"""End-to-end pipeline tests (spec §47): orchestrator, dedup, packer, levels."""
import json

from token_optimization import Engine
from token_optimization.core.dedup import DeduplicationEngine
from token_optimization.core.ir import ContextItem, ContentType, Role
from token_optimization.packing.levels import LevelManager
from token_optimization.packing.packer import ContextPacker
from token_optimization.tokenization.providers import TokenCounter, ModelProfileRegistry

TOK = TokenCounter("o200k_base").count


class TestDedup:
    def test_exact_duplicates_removed(self):
        items = [ContextItem(content="same content here"), ContextItem(content="same content here")]
        res = DeduplicationEngine().deduplicate(items)
        assert len(res.kept) == 1
        assert len(res.removed) == 1

    def test_near_duplicates_removed(self):
        a = "the quick brown fox jumps over the lazy dog and runs away fast"
        b = "the quick brown fox jumps over the lazy dog and runs away fast today"
        items = [ContextItem(content=a), ContextItem(content=b)]
        res = DeduplicationEngine().deduplicate(items)
        assert len(res.kept) == 1

    def test_different_content_kept(self):
        items = [ContextItem(content="alpha beta gamma delta"), ContextItem(content="one two three four")]
        res = DeduplicationEngine().deduplicate(items)
        assert len(res.kept) == 2


class TestEnginePipeline:
    def test_chat_task_compresses_and_keeps_critical(self):
        e = Engine(model="gpt-4o")
        items = [
            {"content": "System rules. DO NOT delete production_database. " + "policy " * 60,
             "role": "system", "source": "sys"},
            {"content": "Reminder: escalation policy applies. " * 3, "role": "user", "source": "chat"},
            {"content": "Reminder: escalation policy applies. " * 3, "role": "user", "source": "chat"},
            {"content": "plain answer with some detail. " * 40, "role": "assistant", "source": "chat"},
        ]
        r = e.ingest_and_optimize(items, task_id="t1", task_type="chat", query="escalation")
        assert r.tokenizer_exact is True
        assert r.original_tokens > 0
        assert r.optimized_tokens < r.original_tokens  # repeated lines must collapse
        # system instruction survives verbatim
        sys_items = [i for i in r.items if i.role == Role.SYSTEM]
        assert sys_items and sys_items[0].content.startswith("System rules. DO NOT delete production_database.")

    def test_json_tool_output_valid_and_recoverable(self):
        e = Engine(model="gpt-4o")
        big = json.dumps({"results": [{"id": i, "v": i * 2, "note": "y" * 80} for i in range(300)],
                          "total": 300})
        r = e.ingest_and_optimize(
            [{"content": big, "role": "tool", "source": "api", "content_type": "json"}],
            task_id="t2", task_type="data_analysis")
        assert r.optimized_tokens < r.original_tokens
        item = r.items[0]
        # compressed output remains valid JSON
        data = json.loads(item.content)
        assert "results" in data or "__truncated_array__" in item.content
        # original recoverable from shadow store
        stored = e.store.get(item.id)
        assert stored is not None and stored.content == big

    def test_recovery_of_json_field(self):
        e = Engine(model="gpt-4o")
        big = json.dumps({"results": [{"id": 7, "secret_value": 42}], "total": 1})
        r = e.ingest_and_optimize(
            [{"content": big, "role": "tool", "source": "api", "content_type": "json"}],
            task_id="t3", task_type="data_analysis")
        res = e.retrieve(f"shadow://{r.items[0].id}", scope="json_field", selector="results[0].secret_value")
        assert res is not None
        assert res.content == "42"

    def test_tokenizer_fallback_flagged(self):
        reg = ModelProfileRegistry()
        p = reg.get("llama-3.1-8b-local")
        assert p.tokenizer_is_exact is False


class TestPacker:
    def test_budget_respected_and_system_kept(self):
        items = [ContextItem(content="sys rules " * 50, role=Role.SYSTEM),
                 ContextItem(content="filler one " * 50, role=Role.USER),
                 ContextItem(content="filler two " * 50, role=Role.USER)]
        packed = ContextPacker(TOK).pack(items, budget=200)
        assert packed.tokens <= 200
        assert any(i.role == Role.SYSTEM for i in packed.items)
        assert packed.dropped_ids  # fillers that did not fit

    def test_levels_assignment(self):
        items = [ContextItem(content="sys " * 20, role=Role.SYSTEM),
                 ContextItem(content=json.dumps({"k": "v"}), content_type=ContentType.JSON),
                 ContextItem(content="lorem ipsum " * 100)]
        levels, assignments = LevelManager(TOK).assign(items, budget_tokens=10_000)
        assert assignments[0].level == 0
        assert len(assignments) == 3
