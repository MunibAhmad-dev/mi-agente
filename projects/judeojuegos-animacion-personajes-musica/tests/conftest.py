from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from engine.kernel import Kernel
from engine.kernel.api import create_app


def make_project(kernel: Kernel, name: str = "P") -> str:
    """Create a user+project directly and return the project id."""
    from engine.kernel.models import Project, User

    with kernel.Session() as s:
        user = User(username="u" + uuid.uuid4().hex[:8], password_hash="x")
        s.add(user)
        s.flush()
        project = Project(name=name, owner_id=user.id)
        s.add(project)
        s.commit()
        return project.id


@pytest.fixture
def kernel(tmp_path):
    """Fresh kernel with its own SQLite DB and asset store per test."""
    return Kernel(
        db_url=f"sqlite:///{tmp_path / 'test.db'}",
        storage_root=tmp_path / "assets",
        max_attempts=2,
    )


@pytest.fixture
def client(kernel):
    """TestClient with a live scheduler thread (lifespan)."""
    app = create_app(kernel, poll_interval=0.02, secret="test-secret")
    with TestClient(app) as c:
        yield c


def register_login(client: TestClient, username: str | None = None, password: str = "password123") -> dict:
    """Register a user and return authenticated headers. First user becomes ADMIN."""
    username = username or "user" + uuid.uuid4().hex[:8]
    resp = client.post("/api/auth/register", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    login = client.post("/api/auth/login", json={"username": username, "password": password})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['token']}"}


def run_until(kernel: Kernel, job_id: str, timeout: float = 60.0) -> dict:
    """Drive a job to a terminal state and return its snapshot."""
    status = kernel.process_job(job_id, timeout=timeout)
    assert status in ("COMPLETED", "FAILED", "CANCELLED"), f"job stuck in {status}"
    return kernel.get_job(job_id)