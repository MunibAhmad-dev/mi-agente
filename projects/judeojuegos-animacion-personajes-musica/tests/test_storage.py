import pytest

from engine.kernel.storage import AssetNotFound, AssetStore


def test_put_and_read(tmp_path):
    store = AssetStore(tmp_path)
    sha = store.put_text("hello")
    assert store.read_text(sha) == "hello"
    assert store.path(sha).exists()


def test_deduplication_and_no_temp_files(tmp_path):
    store = AssetStore(tmp_path)
    s1 = store.put_bytes(b"same-content")
    s2 = store.put_bytes(b"same-content")
    assert s1 == s2
    blobs = list((tmp_path / "blobs").iterdir())
    assert len(blobs) == 1
    assert not any(p.suffix == ".tmp" for p in blobs)


def test_missing_blob_raises(tmp_path):
    store = AssetStore(tmp_path)
    with pytest.raises(AssetNotFound):
        store.read_bytes("0" * 64)