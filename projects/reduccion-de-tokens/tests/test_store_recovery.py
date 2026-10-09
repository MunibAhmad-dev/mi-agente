"""Shadow store + targeted recovery tests (spec §14, §15, §46)."""
import json
import time

import pytest

from token_optimization.core.ir import ContextItem, ContentType, Role
from token_optimization.recovery.recoverer import TargetedRecoverer
from token_optimization.storage.store import ShadowContextStore


@pytest.fixture()
def store():
    s = ShadowContextStore(":memory:")
    yield s
    s.close()


class TestShadowStore:
    def test_put_and_get_roundtrip(self, store):
        item = ContextItem(content="hello world", content_type=ContentType.TEXT, role=Role.USER)
        pointer = store.put(item, tenant_id="acme", sensitivity="internal")
        assert pointer == f"shadow://{item.id}"
        got = store.get(item.id)
        assert got is not None
        assert got.content == "hello world"
        assert got.tenant_id == "acme"
        assert got.provenance["role"] == "user"

    def test_fts_search(self, store):
        item = ContextItem(content="the production_database credentials rotate at midnight")
        store.put(item)
        hits = store.search("production_database")
        assert hits and hits[0].id == item.id

    def test_ttl_purge(self, store):
        item = ContextItem(content="ephemeral data")
        store.put(item, ttl_seconds=-1)  # already expired
        assert store.purge_expired() == 1
        assert store.get(item.id) is None
        assert store.search("ephemeral") == []

    def test_delete_task_vacuum(self, store):
        i1 = ContextItem(content="task a data", task_id="a")
        i2 = ContextItem(content="task b data", task_id="b")
        store.put(i1)
        store.put(i2)
        assert store.delete_task("a") == 1
        assert store.get(i1.id) is None
        assert store.get(i2.id) is not None


class TestTargetedRecovery:
    def test_recover_full(self, store):
        item = ContextItem(content="line1\nline2\nline3")
        store.put(item)
        rec = TargetedRecoverer(store)
        res = rec.recover(f"shadow://{item.id}")
        assert res.scope == "full"
        assert res.content == "line1\nline2\nline3"

    def test_recover_lines(self, store):
        item = ContextItem(content="l1\nl2\nl3\nl4")
        store.put(item)
        rec = TargetedRecoverer(store)
        res = rec.recover(f"shadow://{item.id}", scope="lines", start_line=2, end_line=3)
        assert res.content == "l2\nl3"

    def test_recover_json_field(self, store):
        data = {"results": [{"url": "https://x.example/a", "id": 1},
                            {"url": "https://x.example/b", "id": 2}]}
        item = ContextItem(content=json.dumps(data), content_type=ContentType.JSON)
        store.put(item)
        rec = TargetedRecoverer(store)
        res = rec.recover(f"shadow://{item.id}", scope="json_field", selector="results[1].url")
        assert res.content == "https://x.example/b"

    def test_unknown_pointer(self, store):
        rec = TargetedRecoverer(store)
        assert rec.recover("shadow://nope") is None
