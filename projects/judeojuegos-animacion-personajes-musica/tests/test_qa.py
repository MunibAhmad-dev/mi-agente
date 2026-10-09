"""QA framework tests (Master Prompt §45–49)."""

from __future__ import annotations

import io
import struct
import wave

import pytest

from engine.qa import QAUnavailable, run_checks


# ------------------------------------------------------------------- text

def test_text_pass_and_fail():
    good = run_checks("text", b"hello world", {"min_length": 5})
    assert good["passed"] and good["score"] == 1.0
    bad = run_checks("text", b"", {"min_length": 5})
    assert not bad["passed"]
    assert any(c["name"] == "non_empty" and not c["passed"] for c in bad["checks"])


def test_text_json_mode():
    ok = run_checks("text", b'{"a": 1}', {"json": True})
    assert ok["passed"]
    bad = run_checks("text", b"{not json", {"json": True})
    assert any(c["name"] == "valid_json" and not c["passed"] for c in bad["checks"])


# ------------------------------------------------------------------ image

def _png(width=128, height=128, color=(90, 90, 90)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def test_image_pass():
    result = run_checks("image", _png(), {"min_size": 64})
    assert result["passed"], result["checks"]


def test_image_too_small_fails():
    result = run_checks("image", _png(32, 32), {"min_size": 64})
    assert not result["passed"]
    assert any(c["name"] == "min_resolution" and not c["passed"] for c in result["checks"])


def test_image_invalid_bytes():
    result = run_checks("image", b"not an image at all")
    assert not result["passed"]
    assert any(c["name"] == "valid_image" and not c["passed"] for c in result["checks"])


# ------------------------------------------------------------------ audio

def _wav(samples: list[int], rate=8000, channels=1) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return buf.getvalue()


def test_audio_clean_pass():
    import math

    samples = [int(8000 * math.sin(2 * math.pi * 440 * i / 8000)) for i in range(8000)]  # 1s @440Hz
    result = run_checks("audio", _wav(samples))
    assert result["passed"], result["checks"]


def test_audio_clipping_detected():
    samples = [32767] * 8000  # 1s of full-scale clipping
    result = run_checks("audio", _wav(samples))
    assert not result["passed"]
    assert any(c["name"] == "clipping" and not c["passed"] for c in result["checks"])


def test_audio_too_short():
    result = run_checks("audio", _wav([100, -100]), {})
    assert not result["passed"]
    assert any(c["name"] == "duration" and not c["passed"] for c in result["checks"])


# ------------------------------------------------------------------- model3d

GOOD_OBJ = b"""# cube
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 0 1
f 1/1/1 2/2/1 3/3/1 4/4/1
"""

DEGENERATE_OBJ = b"""v 0 0 0
v 1 0 0
f 1 2 2
"""


def test_obj_good():
    result = run_checks("model3d", GOOD_OBJ)
    assert result["passed"], result["checks"]


def test_obj_degenerate_face_fails():
    result = run_checks("model3d", DEGENERATE_OBJ)
    assert not result["passed"]
    names = {c["name"] for c in result["checks"] if not c["passed"]}
    assert "no_degenerate_faces" in names


def test_glb_parsing():
    gltf = b'{"meshes":[{"primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"TEXCOORD_0":2}}]}]}'
    pad = b"\x20" * ((4 - len(gltf) % 4) % 4)
    json_data = gltf + pad
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_data))
    chunk = struct.pack("<I4s", len(json_data), b"JSON") + json_data
    result = run_checks("model3d", header + chunk)
    assert result["passed"], result["checks"]
    names = {c["name"] for c in result["checks"]}
    assert {"valid_glb_header", "json_chunk", "mesh_positions"} <= names


# ------------------------------------------------------------------- video / unknown

def test_video_is_honest_about_missing_tool():
    import shutil

    if shutil.which("ffprobe"):
        pytest.skip("ffprobe installed; honesty path not exercised here")
    with pytest.raises(QAUnavailable):
        run_checks("video", b"junk")


def test_unknown_kind():
    with pytest.raises(ValueError):
        run_checks("smell", b"x")
