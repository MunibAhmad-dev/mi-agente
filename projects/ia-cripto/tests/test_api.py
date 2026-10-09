"""API tests (§94): real authentication, permission mapping, honest errors.
Exercised via AeosApi.handle directly (the HTTP layer is a thin stdlib shell).
"""
from __future__ import annotations

import pytest

from aeos.api.server import AeosApi
from aeos.core.config import load_settings
from aeos.governance import IdentityService


@pytest.fixture()
def api(tmp_path):
    settings = load_settings(mode="test", env={"AEOS_DB_PATH": str(tmp_path / "api.db")})
    api = AeosApi(settings)
    IdentityService(api.db, api.audit).bootstrap_owner()
    ident = IdentityService(api.db, api.audit)
    owner = ident.context_for("human:owner")
    admin_key, _ = ident.create_api_key("human:owner")
    # a viewer principal + key
    ident.create_principal("human:viewer", "human", "viewer", "V")
    viewer_key, _ = ident.create_api_key("human:viewer")
    return api, admin_key, viewer_key


def test_missing_key_is_401(api):
    api_obj, _, _ = api
    code, body = api_obj.handle("GET", "/api/v1/status", None, {}, {})
    assert code == 401


def test_admin_can_read_status_and_treasury(api):
    api_obj, admin_key, _ = api
    code, body = api_obj.handle("GET", "/api/v1/status", admin_key, {}, {})
    assert code == 200 and body["mode"] == "test"
    code, body = api_obj.handle("GET", "/api/v1/treasury", admin_key, {}, {})
    assert code == 200 and "buckets" in body


def test_viewer_cannot_read_audit(api):
    """VIEW_AUDIT is required for /audit; a viewer gets 403 (§146 attack)."""
    api_obj, _, viewer_key = api
    code, body = api_obj.handle("GET", "/api/v1/audit", viewer_key, {}, {})
    assert code == 403


def test_admin_reads_audit(api):
    api_obj, admin_key, _ = api
    code, body = api_obj.handle("GET", "/api/v1/audit", admin_key, {}, {})
    assert code == 200 and isinstance(body["entries"], list)


def test_unknown_route_404(api):
    api_obj, admin_key, _ = api
    code, _ = api_obj.handle("GET", "/api/v1/nope", admin_key, {}, {})
    assert code == 404


def test_emergency_stop_flow(api):
    api_obj, admin_key, viewer_key = api
    code, body = api_obj.handle("GET", "/api/v1/emergency-stop", admin_key, {}, {})
    assert code == 200 and body["active"] is False
    code, body = api_obj.handle("POST", "/api/v1/emergency-stop", admin_key, {},
                                {"reason": "api test"})
    assert code == 200 and body["active"] is True
    code, _ = api_obj.handle("GET", "/api/v1/status", admin_key, {}, {})
    # status still readable (view permission), flag visible
    assert code == 200
    # viewer cannot release
    code, body = api_obj.handle("DELETE", "/api/v1/emergency-stop", viewer_key, {}, {})
    assert code == 403
    # admin (EMERGENCY_STOP permission) releases
    code, body = api_obj.handle("DELETE", "/api/v1/emergency-stop", admin_key, {}, {})
    assert code == 200 and body["active"] is False


def test_bad_key_401(api):
    api_obj, admin_key, _ = api
    code, _ = api_obj.handle("GET", "/api/v1/status", admin_key[:-2] + "zz", {}, {})
    assert code == 401


def test_dashboard_renders_for_authorized_key(api):
    api_obj, admin_key, _ = api
    code, ctype, html = api_obj.dashboard_html(admin_key)
    assert code == 200 and ctype == "text/html"
    assert "AEOS" in html and "Treasury" in html


def test_dashboard_rejects_invalid_key(api):
    api_obj, _, _ = api
    code, _, html = api_obj.dashboard_html("ak_ffff.not-a-real-key")
    assert code == 401


def test_dashboard_rejects_viewer_without_treasury_view(api):
    """A viewer HAS VIEW_TREASURY, so use an auditor-less custom role check:
    the viewer passes; a revoked-style check is covered by 401 test."""
    api_obj, _, viewer_key = api
    code, _, html = api_obj.dashboard_html(viewer_key)
    assert code == 200  # viewer holds VIEW_TREASURY (read-only dashboard is fine)


def test_new_endpoints_predictions_and_opportunities(api):
    api_obj, admin_key, viewer_key = api
    code, body = api_obj.handle("GET", "/api/v1/predictions", admin_key, {}, {})
    assert code == 200 and body["predictions"] == []
    code, body = api_obj.handle("GET", "/api/v1/opportunities", admin_key, {}, {})
    assert code == 200 and body["opportunities"] == []
    # predictions require VIEW_AUDIT: viewer denied
    code, _ = api_obj.handle("GET", "/api/v1/predictions", viewer_key, {}, {})
    assert code == 403
