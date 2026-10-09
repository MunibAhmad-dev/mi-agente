"""Phase 6 tests: product pipeline (§74), marketing governance (§39),
analytics (§41-42), support signals (§167c).
"""
from __future__ import annotations

import pytest

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.growth import Analytics, MarketingEngine, Support
from aeos.products import PipelineError, ProductFactory


@pytest.fixture()
def biz():
    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    factory = ProductFactory(db, events, audit)
    marketing = MarketingEngine(db, events, audit)
    analytics = Analytics(db)
    support = Support(db, events)
    return {"db": db, "events": events, "audit": audit, "factory": factory,
            "marketing": marketing, "analytics": analytics, "support": support}


class FakeHost:
    """Test-only hosting adapter (§143 permits test fakes). Configurable health."""

    def __init__(self, healthy=True):
        self.healthy = healthy
        self.rolled_back = False

    def deploy(self, product, artifact_dir):
        return f"https://{product['name']}.example.com"

    def health(self, url):
        return self.healthy

    def rollback(self, product):
        self.rolled_back = True
        return f"https://{product['name']}.v0.example.com"


def test_product_pipeline_stops_at_sandbox_without_hosting(biz, tmp_path):
    """No hosting provider => honest SANDBOX_OK stop, never a fake deploy URL."""
    f = biz["factory"]
    pid = f.create("demo", kind="landing", config={"licenses": ["MIT"]})
    (tmp_path / "entrypoint.py").write_text("x = 1\n")
    res = f.run_pipeline(pid, str(tmp_path))
    assert res["status"] == "SANDBOX_OK"
    assert "no hosting provider" in res["note"]


def test_product_pipeline_rejects_bad_license(biz, tmp_path):
    f = biz["factory"]
    pid = f.create("demo2", config={"licenses": ["AGPL-3.0"]})
    (tmp_path / "entrypoint.py").write_text("x = 1\n")
    with pytest.raises(PipelineError, match="LICENSE_AUDIT"):
        f.run_pipeline(pid, str(tmp_path))


def test_product_pipeline_deploys_and_rolls_back(biz, tmp_path):
    f, events = biz["factory"], biz["events"]
    pid = f.create("demo3", config={"licenses": []})
    (tmp_path / "entrypoint.py").write_text("x = 1\n")

    host = FakeHost(healthy=True)
    f.hosting = host
    res = f.run_pipeline(pid, str(tmp_path))
    assert res["url"].startswith("https://")
    stages = {s["stage"]: s["ok"] for s in res["stages"]}
    assert stages["HEALTH"] is True
    assert f.get(pid)["status"] == "DEPLOYED"

    # unhealthy deploy => automatic rollback (§35)
    pid2 = f.create("demo4", config={"licenses": []})
    host2 = FakeHost(healthy=False)
    f.hosting = host2
    res2 = f.run_pipeline(pid2, str(tmp_path))
    assert host2.rolled_back is True
    assert f.get(pid2)["status"] == "FAILED"


def test_campaign_antispam_gate(biz):
    m = biz["marketing"]
    f = biz["factory"]
    pid = f.create("camp-prod")
    ok_id = m.create_campaign(pid, "reddit", "Show HN: we built X, feedback welcome")
    assert m.policy_pass(ok_id) is True
    row = biz["db"].one("SELECT status FROM campaigns WHERE id=?", (ok_id,))
    assert row["status"] == "RUNNING"


def test_bandit_explores_without_data(biz):
    m = biz["marketing"]
    assert m.best_channel()["channel"] is None  # honest: no real data yet


def test_analytics_funnel_and_cac(biz):
    a, f = biz["analytics"], biz["factory"]
    pid = f.create("funnel-prod")
    u1, u2, u3 = (a.anonymize(x) for x in ("u1", "u2", "u3"))
    a.track(pid, "visit", u1)
    a.track(pid, "visit", u2)
    a.track(pid, "visit", u3)
    a.track(pid, "signup", u1)
    a.track(pid, "signup", u2)
    a.track(pid, "purchase", u1)
    fun = a.funnel(pid)
    assert fun["visits"] == 3 and fun["signups"] == 2 and fun["purchases"] == 1
    assert fun["visit_to_signup"] == 0.6667 and fun["signup_to_purchase"] == 0.5
    assert a.cac(pid, spend_minor=10_000) == 10_000.0  # 100.00 / 1 purchase
    with pytest.raises(ValueError):
        a.track(pid, "purchase", "not-a-hash")  # PII minimization enforced (§32)


def test_funnel_daily_rollup_is_idempotent(biz):
    a, f = biz["analytics"], biz["factory"]
    pid = f.create("rollup-prod")
    u = a.anonymize("u9")
    a.track(pid, "visit", u)
    a.track(pid, "visit", u)
    a.track(pid, "signup", u)
    r1 = a.rollup_daily(pid)
    r2 = a.rollup_daily(pid)  # same day re-rollup must not double-count
    assert r1 == r2 == {"product_id": pid, "day": r1["day"],
                        "visits": 2, "signups": 1, "purchases": 0}
    assert len(a.funnel_history(pid)) == 1


def test_support_tickets_feed_pain_signals(biz):
    s, f = biz["support"], biz["factory"]
    pid = f.create("support-prod")
    s.open_ticket(pid, "Export broken", "cannot export CSV", category="bug")
    s.open_ticket(pid, "Too expensive", "price is high", category="complaint")
    signals = s.pain_signals(pid)
    assert signals == {"bug": 1, "complaint": 1}
