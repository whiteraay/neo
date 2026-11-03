"""Regional IMR forecast endpoint + bundle integrity.  Run:  cd backend && python -m pytest tests -q

Uses the real FastAPI app without its lifespan (no database needed) and overrides auth.
"""
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import get_settings  # noqa: E402
from main import app  # noqa: E402
from routers.analytics import REGIONS  # noqa: E402
from services import regional  # noqa: E402
from services.security import get_current_user  # noqa: E402

BUNDLE = Path(__file__).resolve().parent.parent / "data" / "regional_bundle.json"
FRONTEND_COPY = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "regional_bundle.json"


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: object()
    regional.load_bundle.cache_clear()
    yield TestClient(app)  # not used as a context manager -> lifespan (DB init) does not run
    app.dependency_overrides.clear()
    regional.load_bundle.cache_clear()


def test_forecast_serves_bundle(client):
    r = client.get("/api/analytics/regions/forecast")
    assert r.status_code == 200
    b = r.json()
    assert b["schema"] == regional.SCHEMA
    assert len(b["regions"]) == 20
    assert len({x["code"] for x in b["regions"]}) == 20
    assert {x["id"] for x in b["regions"]} == {x["id"] for x in REGIONS}, "ids must match /regions so the dashboard can join them"
    for x in b["regions"]:
        assert 0 < x["latest"]["imr"] < 50
        f = x["forecast"]
        assert f["lo80"] <= f["imr"] <= f["hi80"]
        assert f["year"] == b["data_year"] + 1
        assert x["trend"][0]["year"] >= 2008 and x["trend"][-1]["year"] == b["data_year"]
        assert x["expected"]["status"] in {"above expected", "below expected", "as expected"}
    assert b["national"]["latest"]["births"] == sum(x["latest"]["births"] for x in b["regions"])


def test_forecast_is_public():  # open data, like /regions (shown before login)
    regional.load_bundle.cache_clear()
    assert TestClient(app).get("/api/analytics/regions/forecast").status_code == 200


def test_missing_bundle_is_503(client, tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "regional_bundle_path", str(tmp_path / "nope.json"))
    r = client.get("/api/analytics/regions/forecast")
    assert r.status_code == 503
    assert "pipeline.py" in r.json()["detail"]


def test_health_reports_regional_year(client):
    assert client.get("/api/health").json()["regional_data_year"] == json.loads(BUNDLE.read_text("utf-8"))["data_year"]


def test_frontend_offline_copy_matches_backend():
    assert FRONTEND_COPY.read_text("utf-8") == BUNDLE.read_text("utf-8"), "re-run data/scripts/export_bundle.py"


def test_milestones(client):
    groups = client.get("/api/analytics/milestones").json()
    assert {g["id"] for g in groups} >= {"data", "open"}
