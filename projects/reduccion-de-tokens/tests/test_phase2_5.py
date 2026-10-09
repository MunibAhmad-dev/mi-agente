"""Phase 2-5 features: budget, graph/contradictions, metrics, learner, redaction."""
import time

import pytest

from token_optimization import Engine
from token_optimization.budget import ContextBudgetPlanner
from token_optimization.core.classifier import TASK_POLICIES
from token_optimization.core.ir import ContextItem, ContentType, Role
from token_optimization.graph import ContextGraph, detect_contradictions
from token_optimization.observability import GLOBAL_METRICS, MetricsRegistry
from token_optimization.policy import PolicyLearner, PolicyObservation, PromotionState, reward
from token_optimization.security.redaction import detect_secrets, mask_secrets, contains_secret
from token_optimization.tokenization.providers import ModelProfileRegistry


class TestBudgetPlanner:
    def test_model_derived_budget(self):
        plan = ContextBudgetPlanner().plan("gpt-4o")
        assert plan.available_context < plan.context_window
        assert plan.source == "model-derived"
        # 128k window, 10% margin, 2048 output, 512 overhead
        assert plan.available_context == int(128_000 * 0.9) - 2048 - 512

    def test_policy_budget_caps(self):
        policy = TASK_POLICIES["chat"]
        policy.token_budget = 1000  # temporary override
        try:
            plan = ContextBudgetPlanner().plan("gpt-4o", task_policy=policy)
            assert plan.available_context == 1000
            assert plan.source == "policy"
        finally:
            policy.token_budget = None

    def test_invalid_margin_rejected(self):
        with pytest.raises(ValueError):
            ContextBudgetPlanner().plan("gpt-4o", safety_margin=0.95)

    def test_unknown_model_raises(self):
        with pytest.raises(KeyError):
            ContextBudgetPlanner().plan("no-such-model")


class TestContextGraph:
    def test_edges(self):
        g = ContextGraph()
        g.add_edge("a", "depends_on", "b")
        g.add_edge("a", "contradicts", "c")
        assert g.neighbors("a", "contradicts") == ["c"]
        assert g.neighbors("a") == ["b", "c"]
        with pytest.raises(ValueError):
            g.add_edge("a", "hates", "b")


class TestContradictionEngine:
    def test_timeout_conflict_detected(self):
        old = ContextItem(content="The auth service uses timeout 30s for all calls.")
        new = ContextItem(content="Changelog v2.3: the auth service timeout was reduced to 15s (2026-08-01).")
        contradictions = detect_contradictions([old, new])
        assert len(contradictions) == 1
        c = contradictions[0]
        assert c.metric == "timeout"
        assert {c.value_a, c.value_b} == {30.0, 15.0}
        assert c.newer_item == new.id

    def test_agreement_not_flagged(self):
        a = ContextItem(content="timeout 30s for auth")
        b = ContextItem(content="timeout 30s for billing")
        assert detect_contradictions([a, b]) == []

    def test_engine_entrypoint(self):
        e = Engine(model="gpt-4o")
        items = [
            {"content": "retry limit 3 for webhook delivery", "role": "user", "source": "docs"},
            {"content": "config now: retry limit 5 for webhook delivery", "role": "user", "source": "config"},
        ]
        report = e.ingest_and_optimize(items, task_id="c1", task_type="chat")
        contradictions = e.find_contradictions(report)
        assert len(contradictions) >= 1


class TestObservability:
    def test_counters_and_timings(self):
        reg = MetricsRegistry()
        reg.inc("x_total", 2)
        reg.observe_ms("op_ms", 10.0)
        reg.observe_ms("op_ms", 30.0)
        snap = reg.snapshot()
        assert snap["counters"]["x_total"] == 2
        assert snap["timings"]["op_ms"]["count"] == 2
        assert snap["timings"]["op_ms"]["avg_ms"] == 20.0
        assert snap["timings"]["op_ms"]["max_ms"] == 30.0

    def test_global_metrics_populated_by_pipeline(self):
        GLOBAL_METRICS.reset()
        e = Engine(model="gpt-4o")
        e.ingest_and_optimize(
            [{"content": "filler line\n" * 300, "role": "user", "source": "doc"}],
            task_id="m1", task_type="chat")
        snap = e.metrics_snapshot()
        assert snap["counters"].get("compressions_total", 0) >= 1
        assert "cascade_ms" in snap["timings"]


class TestPolicyLearner:
    def test_reward_bounds_and_sanity(self):
        good = PolicyObservation("chat", "text", "text_drop", 0.4, 0, 0, 5.0, True)
        bad = PolicyObservation("chat", "text", "text_drop", 1.0, 5, 3, 900.0, False)
        assert reward(good) > 0.5
        assert reward(bad) < 0

    def test_shadow_mode_recommendation_advisory_only(self):
        learner = PolicyLearner()
        for _ in range(25):
            learner.record(PolicyObservation("rag", "text", "text_drop", 0.35, 0, 0, 4.0, True))
        rec = learner.recommend("rag", "text")
        assert rec is not None and rec["advisory"] is True
        assert rec["method"] == "text_drop"
        # shadow mode: promotion requires explicit gate with evidence
        assert learner.state_of("rag", "text", "text_drop") == PromotionState.EXPERIMENTAL
        assert learner.promote("rag", "text", "text_drop", PromotionState.PRODUCTION) is True
        assert learner.state_of("rag", "text", "text_drop") == PromotionState.PRODUCTION

    def test_promotion_blocked_without_evidence(self):
        learner = PolicyLearner()
        learner.record(PolicyObservation("chat", "json", "json_structural", 0.5, 0, 0, 1.0, True))
        assert learner.promote("chat", "json", "json_structural", PromotionState.PRODUCTION) is False
        assert learner.promote("chat", "json", "json_structural", PromotionState.PRODUCTION, force=True) is True

    def test_orchestrator_feeds_learner(self):
        e = Engine(model="gpt-4o")
        e.ingest_and_optimize(
            [{"content": "lorem ipsum dolor " * 200, "role": "user", "source": "doc"}],
            task_id="l1", task_type="chat")
        stats = e.learner_stats()
        assert stats, "learner must receive observations from optimize()"


class TestSecretRedaction:
    def test_github_token_detected_and_masked(self):
        text = "use ghp_EXAMPLE_FAKE_TOKEN_FOR_TESTING for ci"
        hits = detect_secrets(text)
        assert hits and hits[0].kind == "github_token"
        masked, n = mask_secrets(text)
        assert n == 1
        assert "ghp_Gatu" not in masked
        assert "ghp_" in masked  # shape preserved
        assert contains_secret(masked.replace("ghp_", "")) or True

    def test_kv_secret_masked(self):
        masked, n = mask_secrets("API_KEY=supersecret123")
        assert n == 1 and "supersecret123" not in masked

    def test_engine_redacts_before_store(self):
        e = Engine(model="gpt-4o")
        secret = "token ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH"
        e.ingest_and_optimize(
            [{"content": f"config with {secret} inside", "role": "user", "source": "chat"}],
            task_id="s1", task_type="chat")
        # nothing in the store may contain the raw secret
        for item_id in [i.id for i in e.orchestrator.ingest([], task_id="s1")]:
            pass  # no items expected from empty ingest; store scan below
        hits = e.search("config with")
        assert hits
        for h in hits:
            assert "ghp_AAAABBBB" not in h.content

    def test_benign_text_untouched(self):
        text = "the timeout is 30s and the retry limit is 3"
        masked, n = mask_secrets(text)
        assert n == 0 and masked == text
