"""Adversarial tests (spec §27, §47): negations, numbers, IDs, JSON, inversions."""
import json

import pytest

from token_optimization.compression.json_compressor import JsonCompressor
from token_optimization.compression.text_compressor import TextDropCompressor
from token_optimization.core.ir import ContextItem, ContentType, Role
from token_optimization.core.risk import RiskEngine
from token_optimization.fidelity.evaluator import FidelityEvaluator, _forbidden_inversion
from token_optimization.tokenization.providers import TokenCounter

TOK = TokenCounter("o200k_base").count


def _item(content, role=Role.TOOL, ctype=ContentType.TEXT):
    return ContextItem(content=content, role=role, content_type=ctype, source="test")


class TestNegationSurvival:
    CRITICAL = "Operator notes:\nDO NOT delete production_database\nRun nightly vacuum first."

    def test_risk_engine_flags_negation(self):
        assert RiskEngine().assess(self.CRITICAL, Role.USER) == "critical"

    def test_text_compressor_never_touches_critical(self):
        item = _item(self.CRITICAL, role=Role.USER)
        out = TextDropCompressor().compress([item], token_fn=TOK)
        assert out.items[0].content == self.CRITICAL

    def test_negation_never_inverted(self):
        assert not _forbidden_inversion(self.CRITICAL, self.CRITICAL.replace("nightly", "weekly"))
        assert _forbidden_inversion(self.CRITICAL, "please delete production_database now")

    def test_dropped_negation_is_detected(self):
        fid = FidelityEvaluator()
        orig = "DO NOT rotate the keys. Continue the deployment."
        comp = "rotate the keys. Continue the deployment."
        report = fid.check(orig, comp)
        assert not report.ok
        assert any("negation" in f for f in report.failures)


class TestNumbersAndIdentifiers:
    def test_numbers_preserved_by_text_compressor(self):
        # unique numbers per line: line dedup must not remove any of them
        text = "".join(
            f"row {i}: latency {100 + i}ms, errors {i}.{i}%\n" for i in range(20)
        )
        item = _item(text)
        out = TextDropCompressor().compress([item], token_fn=TOK)
        fid = FidelityEvaluator()
        report = fid.check(item, out.items[0].content)
        assert report.ok, report.failures

    def test_duplicate_line_removal_is_recoverable_not_silent(self):
        text = "latency 120ms\nlatency 120ms\n"
        item = _item(text)
        out = TextDropCompressor().compress([item], token_fn=TOK)
        comp = out.items[0].content
        assert "recoverable" in comp  # marker points to the shadow store

    def test_paths_and_hashes_detected(self):
        fid = FidelityEvaluator()
        report = fid.check("see /var/log/app.log and 0xDEADBEEF1234", "see nothing")
        assert not report.ok

    def test_decimal_preserved(self):
        fid = FidelityEvaluator()
        assert fid.check("price is 1234.56 USD", "price is 1234.56 USD").ok
        assert not fid.check("price is 1234.56 USD", "price is 1234.5 USD").ok


class TestJsonFidelity:
    def test_dropped_keys_fail(self):
        fid = FidelityEvaluator()
        orig = json.dumps({"user_id": "u77", "amount": 42.5, "status": "failed"})
        comp = json.dumps({"user_id": "u77", "amount": 42.5})
        report = fid.check(orig, comp)
        assert not report.ok
        assert any(f.startswith("json_keys_lost") for f in report.failures)

    def test_json_compressor_keeps_keys(self):
        big = json.dumps({"results": [{"id": i, "status": "ok", "note": "x" * 50} for i in range(50)],
                          "total": 50})
        item = _item(big, ctype=ContentType.JSON)
        out = JsonCompressor().compress([item], token_fn=TOK)
        comp = out.items[0].content
        # still valid JSON
        data = json.loads(comp)
        # keys survive (they appear in the retained head)
        fid = FidelityEvaluator()
        report = fid.check(big, comp)
        # numbers may be missing (they live in the recoverable original) but keys must not
        assert not any(f.startswith("json_keys_lost") for f in report.failures), report.failures
        assert "__truncated_array__" in comp or len(data["results"]) <= 50


class TestRiskEngine:
    @pytest.mark.parametrize("content,role,expected", [
        ("DO NOT touch it", Role.USER, "critical"),
        ("ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Role.USER, "critical"),
        ("run rm -rf /tmp/x", Role.USER, "high"),
        ("see /var/log/app.log", Role.TOOL, "high"),
        ("hello world", Role.USER, "low"),
        ("system instructions", Role.SYSTEM, "critical"),
    ])
    def test_levels(self, content, role, expected):
        assert RiskEngine().assess(content, role) == expected
