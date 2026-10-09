import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_cli(tmp_path, *args: str, timeout: float = 120.0) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["UCE_DB_URL"] = f"sqlite:///{tmp_path / 'cli.db'}"
    env["UCE_STORAGE_ROOT"] = str(tmp_path / "assets")
    env["UCE_SECRET_PATH"] = str(tmp_path / ".secret")
    env["UCE_LOG_LEVEL"] = "ERROR"
    return subprocess.run(
        [sys.executable, "-m", "engine", *args],
        capture_output=True,
        text=True,
        env=env,
        cwd=ROOT,
        timeout=timeout,
    )


def test_doctor_is_honest_before_and_after_init(tmp_path):
    before = run_cli(tmp_path, "doctor")
    assert before.returncode == 1  # database not initialized yet
    assert "database not initialized" in before.stdout

    run_cli(tmp_path, "init")
    after = run_cli(tmp_path, "doctor")
    assert after.returncode == 0, after.stderr
    assert "CPU-only" in after.stdout
    assert "UCE kernel" in after.stdout
    assert "All checks passed" in after.stdout


def test_init_then_submit_demo_and_inspect(tmp_path):
    init = run_cli(tmp_path, "init")
    assert init.returncode == 0, init.stderr

    submit = run_cli(tmp_path, "submit", "--demo", "--await")
    assert submit.returncode == 0, submit.stderr
    match = re.search(r"job submitted: (\w+)", submit.stdout)
    assert match, submit.stdout
    job_id = match.group(1)

    show = run_cli(tmp_path, "jobs", "show", job_id)
    assert show.returncode == 0, show.stderr
    assert '"status": "COMPLETED"' in show.stdout

    artifacts = run_cli(tmp_path, "artifacts", "list", "--job", job_id)
    assert artifacts.returncode == 0, artifacts.stderr
    assert artifacts.stdout.count('"sha256"') == 3


def test_users_and_projects_via_cli(tmp_path):
    run_cli(tmp_path, "init")
    created = run_cli(tmp_path, "users", "create", "alice", "--password", "password123")
    assert created.returncode == 0, created.stderr
    assert '"role": "ADMIN"' in created.stdout  # first user

    project = run_cli(tmp_path, "projects", "create", "MyGame", "--description", "demo")
    assert project.returncode == 0, project.stderr
    pid = project.stdout.split('"id": "')[1].split('"')[0]

    listed = run_cli(tmp_path, "projects", "list")
    assert listed.returncode == 0
    assert '"name": "MyGame"' in listed.stdout

    asset = run_cli(tmp_path, "assets", "upload", "--project", pid, "--name", "readme.txt", "--kind", "text", "--file", str(ROOT / "README.md"))
    assert asset.returncode == 0, asset.stderr
    asset_id = asset.stdout.split('"id": "')[1].split('"')[0]
    versions = run_cli(tmp_path, "assets", "versions", "--asset", asset_id)
    assert versions.returncode == 0, versions.stderr
    assert '"version": 1' in versions.stdout


def test_cli_errors_are_clean(tmp_path):
    missing = run_cli(tmp_path, "jobs", "show", "does-not-exist")
    assert missing.returncode == 1
    assert "job not found" in missing.stderr


def test_new_domain_commands(tmp_path):
    run_cli(tmp_path, "init")

    adapters = run_cli(tmp_path, "adapters")
    assert adapters.returncode == 0, adapters.stderr
    assert '"gpu"' in adapters.stdout

    licenses = run_cli(tmp_path, "licenses", "list")
    assert licenses.returncode == 0, licenses.stderr
    assert "flux.1-dev" in licenses.stdout

    check = run_cli(tmp_path, "licenses", "check", "flux.1-dev")
    assert check.returncode == 0 and "BLOCKED" in check.stdout

    route = run_cli(tmp_path, "models", "route", "--modality", "video")
    assert route.returncode == 0, route.stderr
    assert '"selected": null' in route.stdout  # honest refusal, GPU off

    audit = run_cli(tmp_path, "audit", timeout=300.0)
    assert audit.returncode == 0, audit.stdout + audit.stderr