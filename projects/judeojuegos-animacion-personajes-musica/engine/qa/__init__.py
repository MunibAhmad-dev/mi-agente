"""QA framework (Master Prompt §45–49) — CPU-real checkers.

Every check runs for real on artifact bytes. What cannot be checked without
models (e.g. anatomy, identity) is NOT faked: those are GPU-phase additions to
the same framework. If a checker's external tool is missing (ffprobe), the run
raises QAUnavailable rather than pretending to pass.

Score: errors weigh 1.0, warnings 0.5. `passed` == no failed error-severity check.
"""

from __future__ import annotations

import json
import struct
import subprocess
import tempfile
import wave
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from engine.kernel.models import QAReport
from engine.logging_conf import get_logger

logger = get_logger("qa")

KINDS = ("text", "image", "audio", "model3d", "video")


class QAUnavailable(Exception):
    """A checker needs an external tool/model that is not present."""


@dataclass
class CheckResult:
    name: str
    passed: bool
    severity: str  # error | warning
    details: str = ""


def _finish(checks: list[CheckResult]) -> dict[str, Any]:
    total = 0.0
    got = 0.0
    for c in checks:
        weight = 1.0 if c.severity == "error" else 0.5
        total += weight
        if c.passed:
            got += weight
    return {
        "passed": all(c.passed for c in checks if c.severity == "error"),
        "score": round(got / total, 4) if total else 0.0,
        "checks": [asdict(c) for c in checks],
    }


# ----------------------------------------------------------------- text


def check_text(data: bytes, params: dict[str, Any]) -> dict[str, Any]:
    checks: list[CheckResult] = []
    try:
        text = data.decode("utf-8")
        checks.append(CheckResult("valid_utf8", True, "error"))
    except UnicodeDecodeError as exc:
        checks.append(CheckResult("valid_utf8", False, "error", str(exc)))
        return _finish(checks)
    text = text.strip()
    checks.append(CheckResult("non_empty", bool(text), "error"))
    min_length = int(params.get("min_length", 1))
    checks.append(
        CheckResult("min_length", len(text) >= min_length, "error", f"len={len(text)} required>={min_length}")
    )
    max_length = params.get("max_length")
    if max_length is not None:
        checks.append(
            CheckResult("max_length", len(text) <= int(max_length), "warning", f"len={len(text)} max={max_length}")
        )
    if params.get("json"):
        try:
            json.loads(text)
            checks.append(CheckResult("valid_json", True, "error"))
        except json.JSONDecodeError as exc:
            checks.append(CheckResult("valid_json", False, "error", str(exc)))
    return _finish(checks)


# ----------------------------------------------------------------- image


def check_image(data: bytes, params: dict[str, Any]) -> dict[str, Any]:
    try:
        from PIL import Image, ImageFilter, ImageStat
    except ImportError as exc:  # pragma: no cover
        raise QAUnavailable("Pillow is required for image QA") from exc
    import io

    checks: list[CheckResult] = []
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        checks.append(CheckResult("valid_image", True, "error", img.format or ""))
    except Exception as exc:  # noqa: BLE001
        checks.append(CheckResult("valid_image", False, "error", f"cannot decode image: {exc}"))
        return _finish(checks)

    min_size = int(params.get("min_size", 64))
    ok_size = img.width >= min_size and img.height >= min_size
    checks.append(
        CheckResult("min_resolution", ok_size, "error", f"{img.width}x{img.height}, required >= {min_size}px")
    )

    gray = img.convert("L")
    stat = ImageStat.Stat(gray)
    mean, stddev = stat.mean[0], stat.stddev[0]
    checks.append(
        CheckResult("exposure", 10.0 <= mean <= 245.0, "warning", f"mean brightness {mean:.1f} outside [10,245]")
    )
    checks.append(CheckResult("contrast", stddev >= 5.0, "warning", f"stddev {stddev:.1f} < 5"))

    edges = gray.filter(ImageFilter.FIND_EDGES)
    edge_stat = ImageStat.Stat(edges)
    sharp = edge_stat.stddev[0]
    threshold = float(params.get("min_sharpness", 3.0))
    checks.append(CheckResult("sharpness", sharp >= threshold, "warning", f"edge energy {sharp:.2f} < {threshold}"))
    return _finish(checks)


# ----------------------------------------------------------------- audio


def check_audio(data: bytes, params: dict[str, Any]) -> dict[str, Any]:
    checks: list[CheckResult] = []
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        with wave.open(tmp_path, "rb") as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            channels = wav.getnchannels()
            width = wav.getsampwidth()
            checks.append(CheckResult("valid_wav", True, "error", f"{channels}ch {rate}Hz {width * 8}-bit"))
            duration = frames / rate if rate else 0.0
            min_s = float(params.get("min_seconds", 0.05))
            max_s = float(params.get("max_seconds", 600.0))
            checks.append(
                CheckResult("duration", min_s <= duration <= max_s, "error", f"{duration:.2f}s not in [{min_s},{max_s}]")
            )
            if width == 2 and frames:
                import array

                raw = wav.readframes(frames)
                samples = array.array("h")
                samples.frombytes(raw)
                if samples:
                    peak = max(abs(s) for s in samples)
                    clipped = sum(1 for s in samples if abs(s) >= 32767) / len(samples)
                    checks.append(
                        CheckResult("clipping", clipped <= 0.005, "error", f"{clipped * 100:.3f}% clipped samples")
                    )
                    rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
                    checks.append(CheckResult("not_silence", rms >= 1.0, "warning", f"rms {rms:.1f}, peak {peak}"))
            else:
                checks.append(CheckResult("clipping", True, "error", f"unsupported sample width {width} bytes"))
    except wave.Error as exc:
        checks.append(CheckResult("valid_wav", False, "error", f"invalid WAV: {exc}"))
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
    return _finish(checks)


# ----------------------------------------------------------------- model3d


def check_model3d(data: bytes, params: dict[str, Any]) -> dict[str, Any]:
    if data[:4] == b"glTF":
        return _check_glb(data)
    return _check_obj(data)


def _check_obj(data: bytes) -> dict[str, Any]:
    checks: list[CheckResult] = []
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        checks.append(CheckResult("valid_obj", False, "error", "not decodable text"))
        return _finish(checks)
    vertices = normals = uvs = faces = 0
    degenerate = 0
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            vertices += 1
        elif parts[0] == "vn":
            normals += 1
        elif parts[0] == "vt":
            uvs += 1
        elif parts[0] == "f":
            faces += 1
            idxs = [p.split("/")[0] for p in parts[1:]]
            flat = [abs(int(i)) for i in idxs if i]
            if len(flat) < 3 or len(set(flat)) != len(flat):
                degenerate += 1
    checks.append(CheckResult("has_vertices", vertices > 0, "error", f"{vertices} vertices"))
    checks.append(CheckResult("has_faces", faces > 0, "error", f"{faces} faces"))
    checks.append(CheckResult("no_degenerate_faces", degenerate == 0, "error", f"{degenerate} degenerate faces"))
    checks.append(CheckResult("has_normals", normals > 0, "warning", f"{normals} normals"))
    checks.append(CheckResult("has_uvs", uvs > 0, "warning", f"{uvs} uv coords"))
    return _finish(checks)


def _check_glb(data: bytes) -> dict[str, Any]:
    checks: list[CheckResult] = []
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    ok_header = magic == b"glTF" and version >= 2 and length <= len(data)
    checks.append(CheckResult("valid_glb_header", ok_header, "error", f"magic={magic!r} version={version}"))
    if not ok_header:
        return _finish(checks)
    chunk_len, chunk_type = struct.unpack_from("<I4s", data, 12)
    try:
        gltf = json.loads(data[20 : 20 + chunk_len].decode("utf-8"))
        checks.append(CheckResult("json_chunk", chunk_type == b"JSON", "error"))
    except Exception as exc:  # noqa: BLE001
        checks.append(CheckResult("json_chunk", False, "error", str(exc)))
        return _finish(checks)
    meshes = gltf.get("meshes", [])
    attributes = [p.get("attributes", {}) for m in meshes for p in m.get("primitives", [])]
    checks.append(
        CheckResult("mesh_positions", bool(attributes) and all("POSITION" in a for a in attributes), "error",
                    f"{len(meshes)} meshes, {len(attributes)} primitives")
    )
    checks.append(CheckResult("mesh_normals", bool(attributes) and all("NORMAL" in a for a in attributes), "warning"))
    checks.append(CheckResult("mesh_uvs", bool(attributes) and all("TEXCOORD_0" in a for a in attributes), "warning"))
    return _finish(checks)


# ----------------------------------------------------------------- video


def check_video(data: bytes, params: dict[str, Any]) -> dict[str, Any]:
    import shutil as _shutil

    ffprobe = _shutil.which("ffprobe")
    if ffprobe is None:
        raise QAUnavailable("ffprobe not installed — video QA cannot run (it will not fake results)")
    checks: list[CheckResult] = []
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        proc = subprocess.run(
            [ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", tmp_path],
            capture_output=True, text=True, timeout=60,
        )
        if proc.returncode != 0:
            checks.append(CheckResult("probe_ok", False, "error", proc.stderr.strip()[:300]))
            return _finish(checks)
        checks.append(CheckResult("probe_ok", True, "error"))
        info = json.loads(proc.stdout or "{}")
        duration = float((info.get("format") or {}).get("duration") or 0.0)
        checks.append(CheckResult("has_duration", duration > 0.0, "error", f"{duration:.2f}s"))
        videos = [s for s in info.get("streams", []) if s.get("codec_type") == "video"]
        resolution = (int(videos[0].get("width") or 0), int(videos[0].get("height") or 0)) if videos else (0, 0)
        checks.append(CheckResult("has_video_stream", bool(videos), "error"))
        checks.append(
            CheckResult("resolution", resolution[0] > 0 and resolution[1] > 0, "warning", f"{resolution[0]}x{resolution[1]}")
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    return _finish(checks)


_CHECKERS = {
    "text": check_text,
    "image": check_image,
    "audio": check_audio,
    "model3d": check_model3d,
    "video": check_video,
}


def run_checks(kind: str, data: bytes, params: dict[str, Any] | None = None) -> dict[str, Any]:
    checker = _CHECKERS.get(kind)
    if checker is None:
        raise ValueError(f"unknown QA kind: {kind} (known: {sorted(_CHECKERS)})")
    return checker(data, params or {})


class QAEngine:
    """Persists reports; the kernel repair loop and the API both go through it."""

    def __init__(self, session_factory) -> None:
        self.Session = session_factory

    def record(
        self,
        kind: str,
        data: bytes,
        *,
        subject_kind: str,
        subject_id: str,
        params: dict[str, Any] | None = None,
        job_id: str | None = None,
        task_id: str | None = None,
        session: Session | None = None,
    ) -> dict[str, Any]:
        """Run checks and persist a report. `session` lets the kernel record on
        its own transaction (required on SQLite — one writer at a time)."""
        result = run_checks(kind, data, params)
        owns = session is None
        s = session if session is not None else self.Session()
        try:
            row = QAReport(
                job_id=job_id, task_id=task_id, subject_kind=subject_kind, subject_id=subject_id,
                kind=kind, passed=result["passed"], score=result["score"], checks=result["checks"],
            )
            s.add(row)
            s.flush()  # populate server-side defaults (created_at) before reading them
            if owns:
                s.commit()
            return {
                "id": row.id, "job_id": job_id, "task_id": task_id,
                "subject_kind": subject_kind, "subject_id": subject_id, "kind": kind,
                "passed": row.passed, "score": row.score, "checks": row.checks,
                "created_at": row.created_at.isoformat(),
            }
        finally:
            if owns:
                s.close()

    def list_reports(self, job_id: str | None = None, subject_id: str | None = None, limit: int = 100) -> list[dict]:
        from sqlalchemy import select

        with self.Session() as s:
            q = select(QAReport).order_by(QAReport.created_at.desc()).limit(limit)
            if job_id:
                q = q.where(QAReport.job_id == job_id)
            if subject_id:
                q = q.where(QAReport.subject_id == subject_id)
            rows = s.scalars(q).all()
        return [
            {
                "id": r.id, "job_id": r.job_id, "task_id": r.task_id,
                "subject_kind": r.subject_kind, "subject_id": r.subject_id, "kind": r.kind,
                "passed": r.passed, "score": r.score, "checks": r.checks,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
