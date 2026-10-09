import pytest

from engine.kernel.taskgraph import EdgeSpec, GraphError, TaskGraph, TaskSpec, manifest_hash


def spec(task_id, kind="core.write_text"):
    return TaskSpec(id=task_id, kind=kind, params={"name": f"{task_id}.txt"})


def test_topo_order_respects_edges():
    graph = TaskGraph(
        [spec("a"), spec("b"), spec("c")],
        [EdgeSpec(task="c", depends_on="a"), EdgeSpec(task="c", depends_on="b")],
    )
    order = graph.topo_order()
    assert order.index("a") < order.index("c")
    assert order.index("b") < order.index("c")


def test_cycle_detected():
    with pytest.raises(GraphError):
        TaskGraph(
            [spec("a"), spec("b")],
            [EdgeSpec(task="a", depends_on="b"), EdgeSpec(task="b", depends_on="a")],
        )


def test_unknown_task_and_self_loop():
    with pytest.raises(GraphError):
        TaskGraph([spec("a")], [EdgeSpec(task="a", depends_on="ghost")])
    with pytest.raises(GraphError):
        TaskGraph([spec("a")], [EdgeSpec(task="a", depends_on="a")])


def test_manifest_hash_deterministic_and_sensitive():
    base = manifest_hash("core.write_text", {"name": "a", "content": "x"}, ["h1", "h2"])
    assert base == manifest_hash("core.write_text", {"name": "a", "content": "x"}, ["h1", "h2"])
    assert base != manifest_hash("core.write_text", {"name": "a", "content": "y"}, ["h1", "h2"])
    assert base != manifest_hash("core.write_text", {"name": "a", "content": "x"}, ["h1"])
    # Input hashes are sorted inside the hash, so order is irrelevant but the set matters.
    assert base == manifest_hash("core.write_text", {"name": "a", "content": "x"}, ["h2", "h1"])
    assert base != manifest_hash("core.write_text", {"name": "a", "content": "x"}, ["h1", "h3"])