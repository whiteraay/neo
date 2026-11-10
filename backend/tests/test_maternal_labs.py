"""Maternal lab history: parser, units, rules and the API.  Run:  cd backend && python -m pytest tests -q

API tests use the real FastAPI app without its lifespan, on a throwaway SQLite file database.
OCR tests run only when the Tesseract binary is installed; otherwise the 'ocr_unavailable' path is tested.
"""
import asyncio
import io
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Base, get_db  # noqa: E402
from main import app  # noqa: E402
from models.user import UserRole  # noqa: E402
from services.lab_extraction import convert, evaluate_rules, extract_text, ocr_available, parse_text, sniff_type, unit_key  # noqa: E402
from services.security import get_current_user  # noqa: E402


def by_code(res):
    return {o.code: o for o in res.observations}


# ----------------------------------------------------------------------------------------------- parser
def test_parses_russian_cbc_blank():
    text = """Медицинский центр ИНВИТРО
Пациент: Иванова А. Дата рождения: 01.02.1995
Дата взятия биоматериала: 05.04.2026   Дата выдачи: 06.04.2026
ОБЩИЙ АНАЛИЗ КРОВИ
Гемоглобин (HGB)          118     г/л        117 - 160
Эритроциты (RBC)          3,9     10*12/л    3.8–5.1
Гематокрит (HCT)          0,35    л/л        0,35-0,45
Лейкоциты (WBC)           9,4     10^9/л     4,0 - 10,0
Тромбоциты (PLT)          198     10⁹/л      150 - 400
MCH (среднее содержание гемоглобина в эритроците) 29 пг 27-34
MCHC (средняя концентрация гемоглобина в эритроците) 330 г/л 300-380
Средний объем эритроцита (MCV)  90 фл  80 - 100
RDW-CV                    13,1    %          11,5-14,5
СОЭ                       18      мм/ч       2 - 20
"""
    r = parse_text(text, "pdf_text")
    o = by_code(r)
    assert r.laboratory == "Инвитро"
    assert r.specimen_date == date(2026, 4, 5) and r.report_date == date(2026, 4, 6)
    assert o["hb"].value == 118 and o["hb"].unit == "g/L" and (o["hb"].ref_low, o["hb"].ref_high) == (117, 160)
    assert o["rbc"].value == 3.9 and o["rbc"].unit == "10^12/L"
    assert o["hct"].value == 35 and o["hct"].converted and o["hct"].unit == "%"
    assert (o["hct"].ref_low, o["hct"].ref_high) == (35, 45)
    assert o["wbc"].value == 9.4 and o["plt"].value == 198
    assert o["mcv"].value == 90 and o["rdw"].value == 13.1
    assert "mch" not in o and len([x for x in r.observations if x.code == "hb"]) == 1  # MCH/MCHC rows are not haemoglobin


def test_unit_before_value_and_units_conversion():
    text = """Гемоглобин, г/дл: 12,4 (11,7-16,0)
Глюкоза, мг/дл 99
Креатинин 0,8 мг/дл
Ферритин 15 нг/мл 10 - 120
ТТГ 2,1 мкМЕ/мл 0,4-4,0
Т4 свободный 14,2 пмоль/л 9-19"""
    o = by_code(parse_text(text))
    assert o["hb"].value == 124 and o["hb"].converted and (o["hb"].ref_low, o["hb"].ref_high) == (117, 160)
    assert o["glucose"].value == pytest.approx(5.49, abs=0.01) and o["glucose"].unit == "mmol/L"
    assert o["creatinine"].value == pytest.approx(70.72, abs=0.01)
    assert o["ferritin"].value == 15 and o["ferritin"].unit == "µg/L"
    assert o["tsh"].value == 2.1 and o["ft4"].value == 14.2


def test_ocr_noise_latin_cyrillic_lookalikes():
    # OCR often mixes scripts: Latin "e", "o", "p", "c" inside Russian words, "HGВ" with a Cyrillic В
    text = "Гeмоглoбин (HGВ) 101 г/л 110-150\nТромбоциты↓ 95 *10^9/л 150-400\nЛeйкoциты 7.3 x10^9/L"
    o = by_code(parse_text(text, "ocr"))
    assert o["hb"].value == 101 and o["plt"].value == 95 and o["wbc"].value == 7.3
    assert o["hb"].confidence < 0.9  # OCR source -> lower base confidence


def test_unknown_unit_is_kept_not_guessed():
    o = by_code(parse_text("Гемоглобин 7,7 ммоль/л"))
    assert o["hb"].value == 7.7 and not o["hb"].converted and o["hb"].unit == "ммоль/л"
    assert o["hb"].confidence <= 0.6


def test_urine_section_qualitative_and_cells():
    text = """ОБЩИЙ АНАЛИЗ МОЧИ
Относительная плотность 1015   1010-1025
Белок отрицательно
Лейкоциты 2-3 в п/зр 0-5
Эритроциты не обнаружены
Нитриты отр.
Глюкоза отр"""
    o = by_code(parse_text(text))
    assert o["urine_sg"].value == 1.015 and o["urine_sg"].converted
    assert o["urine_protein"].value_text == "negative"
    assert o["urine_wbc"].value == 3 and o["urine_wbc"].original_value == "2-3" and o["urine_wbc"].unit == "/hpf"
    assert o["urine_rbc"].value_text == "negative" and o["urine_nitrite"].value_text == "negative"
    assert "wbc" not in o and "glucose" not in o


def test_urine_protein_number_and_plus():
    assert by_code(parse_text("Анализ мочи\nБелок 0,45 г/л"))["urine_protein"].value == 0.45
    assert by_code(parse_text("Анализ мочи\nБелок ++"))["urine_protein"].value_text == "positive"
    assert by_code(parse_text("Белок в моче следы"))["urine_protein"].value_text == "trace"


def test_ogtt_stages_and_blood_pressure():
    text = """Пероральный глюкозотолерантный тест (ПГТТ) 75 г
Глюкоза натощак 5,3 ммоль/л
Глюкоза через 1 час 9,8 ммоль/л
Глюкоза через 2 часа 8,6 ммоль/л
АД 135/85 мм рт. ст.
Вес 71,4 кг"""
    o = by_code(parse_text(text))
    assert o["ogtt_0"].value == 5.3 and o["ogtt_1h"].value == 9.8 and o["ogtt_2h"].value == 8.6
    assert "glucose" not in o
    assert o["bp_sys"].value == 135 and o["bp_dia"].value == 85 and o["weight"].value == 71.4


def test_ultrasound_measurements():
    text = """Протокол УЗИ (фетометрия)
Дата исследования: 20.05.2026
БПР 78 мм
ОГ 285 мм
ОЖ 270 мм
ДБК 58 мм
Предполагаемая масса плода 1650 г
ИАЖ 14 см"""
    r = parse_text(text)
    o = by_code(r)
    assert r.specimen_date == date(2026, 5, 20)
    assert o["bpd"].value == 78 and o["hc"].value == 285 and o["ac"].value == 270 and o["fl"].value == 58
    assert o["efw"].value == 1650 and o["afi"].value == 14


def test_dates_never_from_birth_date_or_upload():
    r = parse_text("Дата рождения: 01.01.1990\nГемоглобин 120 г/л")
    assert r.specimen_date is None  # no specimen date in the text -> she must enter it


def test_units_helpers():
    assert unit_key("г/л", "wbc") == "giga/l" and unit_key("г/л", "hb") == "g/l"
    assert unit_key("×10⁹/L") == "giga/l" and unit_key("мм рт. ст.") == "mmhg" and unit_key("zzz") is None
    assert convert("hb", 12.0, "g/dL") == (120.0, True, True)
    assert convert("glucose", 5.0, "ммоль/л") == (5.0, False, True)


def test_sniff_type():
    assert sniff_type(b"%PDF-1.4 ...", "application/octet-stream", "x.bin") == "application/pdf"
    assert sniff_type(b"\x89PNG\r\n\x1a\n...", None, "a.png") == "image/png"
    assert sniff_type("Гемоглобин 120".encode(), "text/plain", "a.txt") == "text/plain"
    assert sniff_type(b"PK\x03\x04", "application/zip", "a.docx") is None


def test_image_without_ocr_engine():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (40, 20), "white").save(buf, format="PNG")
    text, method, message = extract_text(buf.getvalue(), "image/png")
    if ocr_available():
        assert method in ("ocr", "none")
    else:
        assert (text, method, message) == ("", "none", "ocr_unavailable")


@pytest.mark.skipif(not ocr_available(), reason="Tesseract is not installed")
def test_ocr_reads_rendered_text():
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (900, 120), "white")
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 40)
    except OSError:
        pytest.skip("no TTF font")
    ImageDraw.Draw(img).text((10, 30), "Гемоглобин 124 г/л", fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    text, method, _ = extract_text(buf.getvalue(), "image/png")
    assert method == "ocr" and by_code(parse_text(text, "ocr"))["hb"].value == 124


# ----------------------------------------------------------------------------------------------- rules
def pt(d, v=None, txt=None, unit="", lo=None, hi=None):
    return {"date": d, "ga_days": None, "value": v, "value_text": txt, "unit": unit, "ref_low": lo, "ref_high": hi}


def test_rules():
    s = {"hb": [pt("2026-01-10", 124), pt("2026-03-20", 113), pt("2026-05-30", 101)],
         "bp_sys": [pt("2026-05-30", 142)], "bp_dia": [pt("2026-05-30", 91)],
         "ogtt_0": [pt("2026-04-01", 5.3)], "ogtt_2h": [pt("2026-04-01", 7.9)],
         "urine_protein": [pt("2026-05-30", txt="negative")], "alt": [pt("2026-05-30", 60, lo=0, hi=35)]}
    a = {x["code"]: x for x in evaluate_rules(s)}
    assert a["bp_high"]["level"] == "discuss" and a["bp_high"]["systolic"] == 142
    assert a["hb_low"]["value"] == 101 and "hb_drop" not in a  # 113 -> 101 is a 12 g/L fall
    assert a["glucose_fasting"]["value"] == 5.3 and "ogtt_2h" not in a
    assert "urine_protein" not in a and a["out_of_range"]["test"] == "alt" and a["out_of_range"]["level"] == "info"
    s["hb"].append(pt("2026-06-10", 80))
    s["bp_sys"].append(pt("2026-06-10", 165))
    s["bp_dia"].append(pt("2026-06-10", 100))
    alerts = evaluate_rules(s)
    assert alerts[0]["code"] == "bp_severe" and alerts[0]["level"] == "urgent"
    drop = next(x for x in alerts if x["code"] == "hb_drop")
    assert drop["previous"] == 101 and drop["delta"] == -21


# ----------------------------------------------------------------------------------------------- API
@pytest.fixture
def api(tmp_path):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    import models  # noqa: F401
    from models.audit_log import AuditLog
    from models.clinical import MaternalRecord
    from models.maternal_labs import LabDocument, LabObservation

    url = f"sqlite+aiosqlite:///{(tmp_path / 'labs.db').as_posix()}"
    from models.user import Hospital, User
    from models.family import CareLog, EpdsResult, MotherQuestion
    tables = [Hospital.__table__, User.__table__, AuditLog.__table__, MaternalRecord.__table__, LabDocument.__table__, LabObservation.__table__,
              CareLog.__table__, EpdsResult.__table__, MotherQuestion.__table__]

    mother = SimpleNamespace(id=uuid.uuid4(), role=UserRole.mother, hospital_id="astana-nrc", full_name="Test Mother")
    other = SimpleNamespace(id=uuid.uuid4(), role=UserRole.mother, hospital_id="astana-nrc", full_name="Other Mother")

    async def setup():
        eng = create_async_engine(url, poolclass=NullPool)
        async with eng.begin() as conn:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=tables))
        S = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
        async with S() as db:  # pregnancy record: 31 weeks today
            db.add(Hospital(id="astana-nrc", name="NRC", name_kz="NRC", city="Astana", his_vendor="Damumed", care_level="III"))
            db.add(Hospital(id="other-hosp", name="Other", name_kz="Other", city="Almaty", his_vendor="Damumed", care_level="II"))
            for u in (mother, other):
                db.add(User(id=u.id, email=f"{u.id}@t.kz", full_name=u.full_name, hashed_password="x", role=UserRole.mother, hospital_id="astana-nrc"))
            db.add(MaternalRecord(user_id=mother.id, hospital_id="astana-nrc", maternal_age=29, gestational_age_wk=31, bmi=24, bp_systolic=120, bp_diastolic=80,
                                  updated_at=datetime.now(timezone.utc)))
            await db.commit()
        await eng.dispose()

    asyncio.run(setup())
    engine = create_async_engine(url, poolclass=NullPool)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _db():
        async with Session() as s:
            yield s

    state = {"user": mother}
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: state["user"]
    client = TestClient(app)
    client.as_user = lambda u: state.update(user=u)  # type: ignore[attr-defined]
    client.mother, client.other = mother, other  # type: ignore[attr-defined]
    yield client
    app.dependency_overrides.clear()


def test_demo_history_dates_isolation_and_cleanup(api):
    end = date.today().isoformat()
    response = api.post('/api/maternal/labs/demo/history', json={'end_date': end})
    assert response.status_code == 200, response.text
    assert response.json()['created'] == 4
    assert api.post('/api/maternal/labs/demo/history', json={'end_date': end}).json()['created'] == 0
    series = api.get('/api/maternal/labs/timeline').json()['series']
    assert len(series['hb']) == 4
    assert series['hb'][-1]['date'] == end
    dates = [date.fromisoformat(p['date']) for p in series['hb']]
    assert all((b - a).days == 28 for a, b in zip(dates, dates[1:]))
    api.as_user(api.other)
    assert api.get('/api/maternal/labs/documents').json() == []
    assert api.delete('/api/maternal/labs/demo/history').json()['deleted'] == 0
    api.as_user(api.mother)
    real = api.post('/api/maternal/labs/observations', json={'code': 'weight', 'value': 65, 'unit': 'kg', 'specimen_date': end})
    assert real.status_code == 201
    assert api.delete('/api/maternal/labs/demo/history').json()['deleted'] == 4
    remaining = api.get('/api/maternal/labs/timeline').json()['series']
    assert list(remaining) == ['weight']


def test_hypertension_summary_and_model_are_private(api):
    day = date.today().isoformat()
    for code, value in [('bp_sys', 142), ('bp_dia', 92)]:
        assert api.post('/api/maternal/labs/observations', json={'code': code, 'value': value, 'unit': 'mmHg', 'specimen_date': day}).status_code == 201
    summary = api.get('/api/maternal/labs/hypertension').json()
    assert summary['counts'] == {'dates': 1, 'elevated_dates': 1, 'severe_dates': 0}
    assert summary['rows'][0]['model'] is None
    model = api.get('/api/maternal/labs/hypertension?arm=right').json()['rows'][0]['model']
    assert model['stage'] in (0, 1, 2, 3)
    assert model['numeric_supplied'] == 3
    api.as_user(api.other)
    assert api.get('/api/maternal/labs/hypertension?arm=right').json()['rows'] == []


def test_ai_uses_owned_uploaded_file_requires_consent_and_keeps_review(api, monkeypatch):
    from services import openai_labs
    calls = []
    original = b'Actual uploaded report: haemoglobin 124 g/L, reference 110-150'
    doc = api.post('/api/maternal/labs/documents', files={'file': ('actual_report.txt', original, 'text/plain')}).json()
    def fake(data, content_type, question, language):
        calls.append(data)
        return {'laboratory': 'My laboratory', 'specimen_date': date.today().isoformat(), 'report_date': None,
                'observations': [{'code': 'hb', 'original_name': 'HGB', 'value': 124, 'value_text': None, 'unit': 'g/L', 'reference_range': '110–150', 'source_line': 'HGB 124 g/L 110–150'}],
                'summary': 'Check values.', 'questions': [], 'warnings': []}
    monkeypatch.setattr(openai_labs, 'request_report', fake)
    url = f"/api/maternal/labs/documents/{doc['id']}/ai"
    assert api.post(url, json={}).status_code == 422
    api.as_user(api.other)
    assert api.post(url, json={'consent': True}).status_code == 404
    assert not calls
    api.as_user(api.mother)
    response = api.post(url, json={'consent': True})
    assert response.status_code == 200, response.text
    updated = response.json()
    assert calls == [original]
    assert updated['filename'] == 'actual_report.txt' and updated['demo'] is False
    assert updated['status'] == 'needs_review'
    assert updated['observations'][0]['ref_low'] == 110
    assert updated['extraction']['method'] == 'openai'
    assert updated['ai']['summary'] == 'Check values.'


def test_mother_cannot_edit_values_only_confirm_or_report(api):
    doc = api.post('/api/maternal/labs/demo').json()
    edit = {'laboratory': 'X', 'specimen_date': date.today().isoformat(), 'observations': [{'code': 'hb', 'value': 150, 'unit': 'g/L', 'edited': True}]}
    assert api.put(f"/api/maternal/labs/documents/{doc['id']}/verify", json=edit).status_code in (404, 405)
    reported = api.post(f"/api/maternal/labs/documents/{doc['id']}/report", json={'comment': 'Hb прочитан неверно'})
    assert reported.status_code == 200 and reported.json()['report']['comment'] == 'Hb прочитан неверно'
    assert api.post(f"/api/maternal/labs/documents/{doc['id']}/confirm").status_code == 409  # reported: stays off the charts
    assert api.get('/api/maternal/labs/timeline').json()['series'] == {}
    other = api.post('/api/maternal/labs/documents', files={'file': ('g.txt', 'Глюкоза 5,0 ммоль/л'.encode(), 'text/plain')}).json()
    assert api.post(f"/api/maternal/labs/documents/{other['id']}/confirm").json()['detail']['code'] == 'incomplete'  # no specimen date


def test_reference_bounds_supports_explicit_intervals_without_guessing():
    from services.lab_extraction import reference_bounds
    assert reference_bounds('3,5–5,0') == (3.5, 5.0)
    assert reference_bounds('< 5') == (None, 5)
    assert reference_bounds('от 4') == (4, None)
    assert reference_bounds('150-110') == (None, None)
    assert reference_bounds('не указано') == (None, None)


def test_ai_failure_and_verified_results_are_preserved(api, monkeypatch):
    from services import openai_labs
    doc = api.post('/api/maternal/labs/demo').json()
    ids = [o['id'] for o in doc['observations']]
    def failure(*args):
        raise openai_labs.AIError('No key')
    monkeypatch.setattr(openai_labs, 'request_report', failure)
    url = f"/api/maternal/labs/documents/{doc['id']}/ai"
    assert api.post(url, json={'consent': True}).status_code == 503
    kept = next(d for d in api.get('/api/maternal/labs/documents').json() if d['id'] == doc['id'])
    assert {o['id'] for o in kept['observations']} == set(ids)
    assert {o['code']: o['value'] for o in kept['observations']} == {o['code']: o['value'] for o in doc['observations']}
    assert api.post(f"/api/maternal/labs/documents/{doc['id']}/confirm").status_code == 200
    assert api.post(url, json={'consent': True, 'mode': 'extract'}).status_code == 409


def test_demo_verify_timeline_flow(api):
    r = api.post("/api/maternal/labs/demo")
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["status"] == "needs_review" and doc["extraction"]["method"] == "pdf_text" and doc["laboratory"] == "КДЛ NeoLab (демо)"
    vals = {o["code"]: o for o in doc["observations"]}
    assert set(vals) == {"hb", "rbc", "wbc", "plt", "hct", "mcv"} and 60 < vals["hb"]["value"] < 200
    hb = vals["hb"]["value"]
    assert doc["specimen_date"] == (date.today() - timedelta(days=2)).isoformat()
    assert doc["gestational_age_days"] == 31 * 7 - 2

    f = api.get(f"/api/maternal/labs/documents/{doc['id']}/file")
    assert f.status_code == 200 and f.content.startswith(b"%PDF") and f.headers["content-type"] == "application/pdf"

    v = api.post(f"/api/maternal/labs/documents/{doc['id']}/confirm")
    assert v.status_code == 200, v.text
    vo = {o["code"]: o for o in v.json()["observations"]}
    assert v.json()["status"] == "verified" and vo["hb"]["value"] == hb and all(o["status"] == "verified" for o in vo.values())
    assert vo["hb"]["ref_low"] == 110 and vo["hb"]["ref_high"] == 150  # the range printed on the report is kept
    other = api.post("/api/maternal/labs/demo", json={"kind": "cbc"}).json()
    assert {o["code"]: o["value"] for o in other["observations"]} != {c: o["value"] for c, o in vals.items()}  # every example has new values
    assert api.post(f"/api/maternal/labs/documents/{doc['id']}/confirm").status_code == 409

    t = api.get("/api/maternal/labs/timeline").json()
    assert t["gestational_age_today_days"] == 217 and t["last_verified_at"]
    assert t["series"]["hb"][0]["value"] == hb and t["series"]["hb"][0]["ga_days"] == 215
    assert len(api.get("/api/maternal/labs/documents").json()) == 2  # the second demo example above


def test_text_upload_duplicate_and_type(api):
    body = "Дата забора: 01.10.2026\nГлюкоза 5,6 ммоль/л 3,9-5,5".encode()
    r = api.post("/api/maternal/labs/documents", files={"file": ("glucose.txt", body, "text/plain")})
    assert r.status_code == 201, r.text
    assert r.json()["observations"][0]["code"] == "glucose" and r.json()["extraction"]["method"] == "text"
    d = api.post("/api/maternal/labs/documents", files={"file": ("again.txt", body, "text/plain")})
    assert d.status_code == 409 and d.json()["detail"]["code"] == "duplicate" and d.json()["detail"]["document_id"] == r.json()["id"]
    assert api.post("/api/maternal/labs/documents", files={"file": ("a.docx", b"PK\x03\x04zzz", "application/zip")}).status_code == 415


def test_image_then_client_ocr_text(api):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (60, 30), "white").save(buf, format="JPEG")
    r = api.post("/api/maternal/labs/documents", files={"file": ("photo.jpg", buf.getvalue(), "image/jpeg")})
    assert r.status_code == 201
    doc = r.json()
    text = {"text": "Гемоглобин 112 г/л 110-150\nДата забора 02.11.2026", "method": "client_ocr"}
    assert doc["observations"] == []  # blank photo: nothing read (no OCR engine, or OCR found no text)
    t = api.post(f"/api/maternal/labs/documents/{doc['id']}/text", json=text)
    assert t.status_code == 200, t.text
    assert t.json()["extraction"]["method"] == "client_ocr" and t.json()["observations"][0]["value"] == 112
    again = api.post(f"/api/maternal/labs/documents/{doc['id']}/text", json={"text": "Гемоглобин 150 г/л", "method": "client_ocr"})
    assert again.status_code == 409  # browser OCR fills an unread file once; it cannot overwrite values


def test_other_mother_cannot_see_document(api):
    doc = api.post("/api/maternal/labs/demo").json()
    api.as_user(api.other)
    assert api.get(f"/api/maternal/labs/documents/{doc['id']}/file").status_code == 404
    assert api.post(f"/api/maternal/labs/documents/{doc['id']}/confirm").status_code == 404
    assert api.post(f"/api/maternal/labs/documents/{doc['id']}/report", json={}).status_code == 404
    assert api.delete(f"/api/maternal/labs/documents/{doc['id']}").status_code in (404, 405)  # mothers never delete: the route does not exist
    assert api.get("/api/maternal/labs/documents").json() == []
    api.as_user(SimpleNamespace(id=uuid.uuid4(), role=UserRole.neonatologist, hospital_id="astana-nrc"))
    assert api.get("/api/maternal/labs/documents").status_code == 403


def test_manual_bp_urgent_and_validation(api):
    today = date.today().isoformat()
    for code, v in (("bp_sys", 165), ("bp_dia", 112)):
        r = api.post("/api/maternal/labs/observations", json={"code": code, "value": v, "unit": "mmHg", "specimen_date": today})
        assert r.status_code == 201 and r.json()["status"] == "manual"
    t = api.get("/api/maternal/labs/timeline").json()
    assert t["alerts"][0]["code"] == "bp_severe" and t["alerts"][0]["level"] == "urgent" and t["alerts"][0]["diastolic"] == 112
    bad = api.post("/api/maternal/labs/observations", json={"code": "hb", "value": 1240, "unit": "g/L", "specimen_date": today})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "range"
    assert api.post("/api/maternal/labs/observations", json={"code": "hb", "value": 120, "unit": "parsec", "specimen_date": today}).json()["detail"]["code"] == "unit"
    future = (date.today() + timedelta(days=10)).isoformat()
    assert api.post("/api/maternal/labs/observations", json={"code": "hb", "value": 120, "unit": "g/L", "specimen_date": future}).status_code == 422
    oid = t["series"]["bp_sys"][0]["observation_id"]
    assert api.delete(f"/api/maternal/labs/observations/{oid}").status_code == 204


def test_catalog_and_delete(api):
    tests = api.get("/api/maternal/labs/catalog").json()["tests"]
    codes = {t["code"] for t in tests}
    assert {"hb", "glucose", "ogtt_2h", "bp_sys", "urine_protein", "efw"} <= codes
    assert all(t["names"]["kz"] and t["names"]["ru"] and t["names"]["en"] for t in tests)
    doc = api.post("/api/maternal/labs/demo").json()
    assert api.delete(f"/api/maternal/labs/documents/{doc['id']}").status_code in (404, 405)  # deletion goes through the doctor
    assert len(api.get("/api/maternal/labs/documents").json()) == 1


def test_only_doctor_deletes_or_corrects_with_reason(api):
    doc = api.post("/api/maternal/labs/demo").json()
    api.post(f"/api/maternal/labs/documents/{doc['id']}/report", json={"comment": "Hb 142"})
    assert api.get("/api/maternal/labs/staff/mothers").status_code == 403  # a mother cannot use staff routes
    doctor = SimpleNamespace(id=uuid.uuid4(), role=UserRole.neonatologist, hospital_id="astana-nrc", full_name="Dr Test")
    api.as_user(doctor)
    mothers = {m["full_name"]: m for m in api.get("/api/maternal/labs/staff/mothers").json()}
    assert mothers["Test Mother"]["documents"] == 1 and mothers["Test Mother"]["reported"] == 1
    docs = api.get(f"/api/maternal/labs/staff/mothers/{api.mother.id}/documents").json()
    assert docs[0]["report"]["comment"] == "Hb 142"
    assert api.get(f"/api/maternal/labs/staff/documents/{doc['id']}/file").content.startswith(b"%PDF")
    body = {"reason": "сверено с бланком", "specimen_date": doc["specimen_date"], "observations": [{"code": "hb", "value": 142, "unit": "g/L", "reference_range": "110-150"}]}
    assert api.put(f"/api/maternal/labs/staff/documents/{doc['id']}", json={**body, "reason": ""}).status_code == 422  # a reason is required
    fixed = api.put(f"/api/maternal/labs/staff/documents/{doc['id']}", json=body).json()
    assert fixed["status"] == "verified" and fixed["observations"][0]["status"] == "corrected" and fixed["report"] is None
    assert fixed["corrections"][0]["by"] == "Dr Test" and any(o["code"] == "hb" and o["value"] == next(x["value"] for x in doc["observations"] if x["code"] == "hb") for o in fixed["corrections"][0]["before"])
    away = SimpleNamespace(id=uuid.uuid4(), role=UserRole.neonatologist, hospital_id="other-hosp", full_name="Dr Away")
    api.as_user(away)
    assert api.request("DELETE", f"/api/maternal/labs/staff/documents/{doc['id']}", json={"reason": "дубликат"}).status_code == 404  # another hospital
    api.as_user(doctor)
    assert api.request("DELETE", f"/api/maternal/labs/staff/documents/{doc['id']}", json={"reason": "x"}).status_code == 422
    assert api.request("DELETE", f"/api/maternal/labs/staff/documents/{doc['id']}", json={"reason": "дубликат бланка"}).status_code == 200
    api.as_user(api.mother)
    assert api.get("/api/maternal/labs/documents").json() == []


def test_seed_lab_history_idempotent(tmp_path):
    """Demo mother gets a confirmed history once, including on databases seeded before this feature."""
    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    import models  # noqa: F401
    from models.maternal_labs import LabObservation
    from services.seed import seed, seed_lab_history

    async def run():
        eng = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'seed.db').as_posix()}")
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        S = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
        async with S() as db:
            await seed(db)
            n1 = (await db.execute(select(func.count(LabObservation.id)))).scalar()
            await seed(db)  # second start: hospitals exist -> only the idempotent history step runs
            await seed_lab_history(db)
            n2 = (await db.execute(select(func.count(LabObservation.id)))).scalar()
            rows = (await db.execute(select(LabObservation).where(LabObservation.code == "hb").order_by(LabObservation.specimen_date))).scalars().all()
        await eng.dispose()
        return n1, n2, [(r.value, r.gestational_age_days) for r in rows]

    n1, n2, hb = asyncio.run(run())
    assert n1 == n2 > 10
    assert hb == [(124, 70), (113, 140), (101, 210)]
