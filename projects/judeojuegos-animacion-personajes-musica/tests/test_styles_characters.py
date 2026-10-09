"""Styles + characters tests (Master Prompt §14, §16, §17)."""

from __future__ import annotations

import pytest

from tests.conftest import make_project


def test_style_create_and_validate(kernel):
    pid = make_project(kernel)
    style = kernel.styles.create(pid, "noir", palette=["#101010", "#F0F0F0"], lighting="low-key")
    assert style["palette"] == ["#101010", "#F0F0F0"]
    with pytest.raises(ValueError):
        kernel.styles.create(pid, "bad", palette=["red"])
    with pytest.raises(ValueError):
        kernel.styles.create(pid, "")
    assert kernel.styles.list(pid)[0]["name"] == "noir"


def test_style_reference_validation(kernel):
    pid = make_project(kernel)
    other = make_project(kernel, name="other")
    ref = kernel.create_asset(pid, "ref.png", "image", b"ref")
    style = kernel.styles.create(pid, "with-ref", ref_asset_ids=[ref["id"]])
    assert style["ref_asset_ids"] == [ref["id"]]
    with pytest.raises(KeyError):
        kernel.styles.create(pid, "missing-ref", ref_asset_ids=["nope"])
    with pytest.raises(ValueError):
        kernel.styles.create(other, "cross-project", ref_asset_ids=[ref["id"]])


def test_style_update(kernel):
    pid = make_project(kernel)
    style = kernel.styles.create(pid, "v1", palette=["#000000"])
    updated = kernel.styles.update(style["id"], lighting="rim light", palette=["#FFFFFF"])
    assert updated["lighting"] == "rim light" and updated["palette"] == ["#FFFFFF"]
    with pytest.raises(ValueError):
        kernel.styles.update(style["id"], palette=["zzz"])


def test_character_slots_and_consistency(kernel):
    pid = make_project(kernel)
    char = kernel.characters.create(pid, "Vorthex", identity={"species": "dragon"}, lore="Ancient guardian.")
    assert char["identity"]["species"] == "dragon"
    consistency = kernel.characters.consistency(char["id"])
    assert consistency["complete"] is False
    assert "face" in consistency["missing"] and "voice" in consistency["missing"]

    face = kernel.create_asset(pid, "face.png", "image", b"face")
    updated = kernel.characters.set_slot(char["id"], "face", face["id"])
    assert updated["slots"]["face"] == face["id"]
    after = kernel.characters.consistency(char["id"])
    assert "face" in after["present"] and "face" not in after["missing"]

    kernel.characters.set_slot(char["id"], "face", None)  # clear
    assert kernel.characters.consistency(char["id"])["present"] == []


def test_character_slot_validation(kernel):
    pid = make_project(kernel)
    char = kernel.characters.create(pid, "X")
    other = make_project(kernel, name="other")
    foreign_asset = kernel.create_asset(other, "f.png", "image", b"f")
    with pytest.raises(ValueError):
        kernel.characters.set_slot(char["id"], "wings", foreign_asset["id"])  # unknown slot
    with pytest.raises(ValueError):
        kernel.characters.set_slot(char["id"], "face", foreign_asset["id"])  # cross-project
    with pytest.raises(KeyError):
        kernel.characters.set_slot(char["id"], "face", "missing-asset")
