"""Memory + search tests (Master Prompt §53, §54)."""

from __future__ import annotations

import pytest

from tests.conftest import make_project


def test_add_and_list(kernel):
    pid = make_project(kernel)
    m = kernel.memory.add(pid, "world", "Vorthex the dragon guards the obsidian gate.", key="vorthex")
    assert m["category"] == "world"
    assert len(kernel.memory.list(pid)) == 1
    assert len(kernel.memory.list(pid, category="world")) == 1
    assert kernel.memory.list(pid, category="voice") == []


def test_categories_validated(kernel):
    pid = make_project(kernel)
    with pytest.raises(ValueError):
        kernel.memory.add(pid, "nonsense", "text")
    with pytest.raises(ValueError):
        kernel.memory.add(pid, "world", "   ")


def test_keyword_search_ranks(kernel):
    pid = make_project(kernel)
    kernel.memory.add(pid, "character", "Kira is a swift ranger with a silver bow.")
    kernel.memory.add(pid, "world", "The dragon Vorthex sleeps beneath the mountain.")
    kernel.memory.add(pid, "music", "Kira's theme is a fast flute melody.")
    hits = kernel.memory.search(pid, "dragon")
    assert hits, "keyword search returned nothing"
    assert "Vorthex" in hits[0]["text"]
    assert hits[0]["matched_by"] == ["keyword"]


def test_semantic_search(kernel):
    pid = make_project(kernel)
    kernel.memory.add(pid, "world", "The obsidian gate lies under the sleeping dragon.")
    kernel.memory.add(pid, "technical", "Use 512px textures for props.")
    hits = kernel.memory.search(pid, "obsidian gate", mode="semantic")
    assert hits and "obsidian" in hits[0]["text"]
    assert hits[0]["matched_by"] == ["semantic"]


def test_both_mode_and_limit(kernel):
    pid = make_project(kernel)
    for i in range(20):
        kernel.memory.add(pid, "project", f"note {i} about dragons and gates")
    hits = kernel.memory.search(pid, "dragon gate", mode="both", limit=5)
    assert len(hits) <= 5
    assert all(set(h["matched_by"]) <= {"keyword", "semantic"} for h in hits)


def test_search_empty_project(kernel):
    pid = make_project(kernel)
    assert kernel.memory.search(pid, "anything") == []
