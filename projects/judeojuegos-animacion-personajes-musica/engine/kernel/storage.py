"""Content-addressed asset store (Master Prompt §62: files live on disk, DB holds metadata).

Blobs are stored at <root>/blobs/<sha256>. Writes are atomic (temp file + rename),
and identical content is stored once (deduplication by hash).
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path


class AssetNotFound(KeyError):
    pass


class AssetStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.blobs = self.root / "blobs"
        self.blobs.mkdir(parents=True, exist_ok=True)

    def put_bytes(self, data: bytes) -> str:
        sha = hashlib.sha256(data).hexdigest()
        dest = self.blobs / sha
        if dest.exists():
            return sha
        tmp = dest.with_suffix(".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, dest)
        return sha

    def put_text(self, text: str) -> str:
        return self.put_bytes(text.encode("utf-8"))

    def read_bytes(self, sha: str) -> bytes:
        path = self.blobs / sha
        if not path.exists():
            raise AssetNotFound(sha)
        return path.read_bytes()

    def read_text(self, sha: str) -> str:
        return self.read_bytes(sha).decode("utf-8")

    def path(self, sha: str) -> Path:
        return self.blobs / sha

    def exists(self, sha: str) -> bool:
        return (self.blobs / sha).exists()