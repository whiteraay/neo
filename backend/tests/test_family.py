"""Postnatal support: EPDS, care diary hints, today's tips, questions to doctors.  Run:  cd backend && python -m pytest tests -q"""
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.user import UserRole  # noqa: E402
from routers.family import care_hints, epds_band, epds_score, today_tips  # noqa: E402
from tests.test_maternal_labs import api  # noqa: E402,F401

NOW = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)


def log(kind, hours_ago=1, value=None, detail=None):
    return SimpleNamespace(kind=kind, at=NOW - timedelta(hours=hours_ago), value=value, detail=detail)


def test_epds_scoring_reverses_items_and_flags_self_harm():
    best = [0, 0, 3, 0, 3, 3, 3, 3, 3, 3]  # the "best" option of every item as displayed
    assert epds_score(best)[1] == 0
    worst = [3, 3, 0, 3, 0, 0, 0, 0, 0, 0]
    items, score, self_harm = epds_score(worst)
    assert score == 30 and self_harm == 3
    assert epds_band(13, 0) == "high" and epds_band(11, 0) == "possible" and epds_band(5, 0) == "low" and epds_band(2, 1) == "urgent"


def test_care_hints_follow_danger_signs():
    baby = {"day_of_life": 5, "ga_birth_wk": 39}
    codes = {h["code"]: h["level"] for h in care_hints([log("temp", value=38.1), log("stool", detail="pale"), log("breathing", value=64)], baby, NOW)}
    assert codes == {"temp_danger": "urgent", "stool_danger": "urgent", "breathing_danger": "urgent"}
    feeds = [log("feed", h) for h in range(1, 6)] + [log("wet", h) for h in range(1, 3)]
    got = {h["code"]: h for h in care_hints(feeds, baby, NOW)}
    assert got["feeds_low"]["level"] == "discuss" and got["wet_low"]["need"] == 5
    assert care_hints([log("jaundice", detail="face")], {"day_of_life": 1}, NOW)[0]["level"] == "urgent"  # first 24 h
    assert care_hints([log("jaundice", detail="face")], {"day_of_life": 4}, NOW)[0]["code"] == "jaundice_watch"
    assert care_hints([log("jaundice", detail="chest")], {"day_of_life": 18, "ga_birth_wk": 34}, NOW)[0]["code"] == "jaundice_watch"  # preterm: 21 days
    assert care_hints([log("jaundice", detail="chest")], {"day_of_life": 18, "ga_birth_wk": 39}, NOW)[0]["code"] == "jaundice_long"


def test_today_tips_depend_on_baby_state():
    ventilated = today_tips({"linked": True, "respiratory_support": "SIMV", "feeding": "parenteral", "corrected_wk": 30}, [])
    assert ventilated[:3] == ["touch_hold", "voice", "express"] and "kangaroo" not in ventilated
    tube = today_tips({"linked": True, "respiratory_support": "nCPAP", "feeding": "tube", "corrected_wk": 34}, [])
    assert {"kangaroo", "express", "oral_care", "latch"} <= set(tube)
    assert today_tips({"linked": False}, [{"level": "urgent"}])[0] == "urgent_first"


def test_api_epds_private_unless_shared_and_questions_flow(api):  # noqa: F811
    assert api.post("/api/maternal/epds", json={"answers": [0] * 9}).status_code == 422
    private = api.post("/api/maternal/epds", json={"answers": [3, 3, 0, 3, 0, 0, 0, 0, 0, 0], "share": False}).json()
    shared = api.post("/api/maternal/epds", json={"answers": [2, 2, 1, 2, 1, 1, 1, 1, 1, 3], "share": True}).json()
    assert private["band"] == "urgent" and shared["band"] == "high" and shared["score"] == 18
    q = api.post("/api/maternal/questions", json={"to": "neonatologist", "topic": "feeding", "text": "Сколько сцеживать молока в день?"}).json()
    assert api.post(f"/api/maternal/staff/questions/{q['id']}/answer", json={"answer": "x" * 10}).status_code == 403
    doctor = SimpleNamespace(id=uuid.uuid4(), role=UserRole.neonatologist, hospital_id="astana-nrc", full_name="Dr Test")
    api.as_user(doctor)
    seen = api.get("/api/maternal/staff/epds").json()
    assert [r["id"] for r in seen] == [shared["id"]]  # the private result never reaches the doctor
    assert api.get("/api/maternal/staff/questions").json()[0]["mother"] == "Test Mother"
    assert api.post(f"/api/maternal/staff/questions/{q['id']}/answer", json={"answer": "8 раз в сутки, включая ночь"}).status_code == 200
    away = SimpleNamespace(id=uuid.uuid4(), role=UserRole.neonatologist, hospital_id="other-hosp", full_name="Dr Away")
    api.as_user(away)
    assert api.get("/api/maternal/staff/questions").json() == [] and api.get("/api/maternal/staff/epds").json() == []
    api.as_user(api.mother)
    assert api.get("/api/maternal/questions").json()[0]["answered_by"] == "Dr Test"


def test_api_care_diary(api):  # noqa: F811
    now = datetime.now(timezone.utc).isoformat()
    assert api.post("/api/maternal/care", json={"kind": "temp", "at": now, "value": 45}).status_code == 422
    assert api.post("/api/maternal/care", json={"kind": "stool", "at": now, "detail": "purple"}).status_code == 422
    t = api.post("/api/maternal/care", json={"kind": "temp", "at": now, "value": 37.9}).json()
    api.post("/api/maternal/care", json={"kind": "feed", "at": now, "value": 15, "detail": "breast"})
    body = api.get("/api/maternal/care").json()
    assert body["medical_record"] is False and body["hints"][0]["code"] == "temp_danger" and body["days"][0]["feed"] == 1
    assert "urgent_first" in api.get("/api/maternal/today").json()["tips"]
    assert api.delete(f"/api/maternal/care/{t['id']}").status_code == 204
