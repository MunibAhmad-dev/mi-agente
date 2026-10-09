"""Asset graph tests (Master Prompt §50, §51)."""

from __future__ import annotations

import pytest

from tests.conftest import make_project


@pytest.fixture
def chain(kernel):
    """base <- derived <- final (derived_from edges)."""
    pid = make_project(kernel)
    a = kernel.create_asset(pid, "base.png", "image", b"base")
    b = kernel.create_asset(pid, "derived.png", "image", b"derived")
    c = kernel.create_asset(pid, "final.png", "image", b"final")
    kernel.graph.link(a["id"], b["id"], "derived_from")
    kernel.graph.link(b["id"], c["id"], "derived_from")
    return a, b, c


def test_link_and_list(kernel, chain):
    a, b, _ = chain
    out = kernel.graph.links(a["id"], direction="out")
    assert out and out[0]["relation"] == "derived_from"
    inc = kernel.graph.links(b["id"], direction="in")
    assert inc and inc[0]["from_id"] == a["id"]


def test_impact_is_transitive_and_ordered(kernel, chain):
    a, b, c = chain
    impact = kernel.graph.impact(a["id"])
    assert [d["asset_id"] for d in impact] == [b["id"], c["id"]]
    assert impact[0]["depth"] == 1 and impact[1]["depth"] == 2
    plan = kernel.graph.regeneration_plan(a["id"])
    assert [d["asset_id"] for d in plan] == [b["id"], c["id"]]  # near first


def test_no_change_no_impact(kernel, chain):
    _, _, c = chain
    assert kernel.graph.impact(c["id"]) == []


def test_validation(kernel, chain):
    a, b, _ = chain
    with pytest.raises(ValueError):
        kernel.graph.link(a["id"], b["id"], "not-a-relation")
    with pytest.raises(ValueError):
        kernel.graph.link(a["id"], a["id"], "derived_from")
    with pytest.raises(ValueError):
        kernel.graph.link(a["id"], b["id"], "derived_from")  # duplicate
    assert kernel.graph.unlink(a["id"], b["id"], "derived_from") is True
    assert kernel.graph.unlink(a["id"], b["id"], "derived_from") is False
