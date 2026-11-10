"""De-identified example documents and CardioAI on a cardiology conclusion.  Run:  cd backend && python -m pytest tests -q"""
import io
import sys
import zipfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.cardio_conclusion import ConclusionError, docx_text, parse_conclusion, visit_rows  # noqa: E402
from services.lab_extraction import parse_text  # noqa: E402
from tests.test_maternal_labs import api  # noqa: E402,F401  (fixture)

EXAMPLES = Path(__file__).resolve().parent.parent / "data" / "examples"


def obs(text):
    return {o.code: o for o in parse_text(text, "text").observations}


# ----------------------------------------------------------------------------------------------- parser
def test_biochem_example_transcription():
    res = parse_text((EXAMPLES / "biochem_kdl_2026-07-25.txt").read_text(encoding="utf-8"), "text")
    o = {x.code: x for x in res.observations}
    assert res.specimen_date == date(2026, 7, 25) and res.laboratory == "Олимп"
    assert {c: o[c].value for c in o} == {"urea": 4.9, "creatinine": 76.0, "uric_acid": 277.9, "glucose": 4.48, "alt": 8.7, "ast": 22.54,
                                          "hba1c": 5.43, "apoa1": 1.63, "apob": 0.51, "folate": 8.5, "ferritin": 21.9}
    assert (o["apob"].ref_low, o["apob"].ref_high) == (0.6, 1.17)  # «понижено» between unit and range is skipped
    assert o["alt"].ref_high == 35.0 and o["alt"].ref_low is None
    assert "hb" not in o  # «Гликозилированный гемоглобин» is HbA1c, not haemoglobin


def test_new_codes_do_not_steal_existing_rows():
    o = obs("ОАК\nГемоглобин (HGB) 118 г/л 117 - 160\nMCH среднее содержание гемоглобина 29 пг\nКлиренс креатинина 75 мл/мин\nХолестерин ЛПВП 1,4 ммоль/л\nОбщий холестерин 5,1 ммоль/л")
    assert o["hb"].value == 118 and "creatinine" not in o
    assert o["hdl"].value == 1.4 and o["cholesterol"].value == 5.1


def test_pelvic_example_transcription():
    res = parse_text((EXAMPLES / "pelvic_us_2025-03-25.txt").read_text(encoding="utf-8"), "text")
    o = {x.code: x for x in res.observations}
    assert res.specimen_date == date(2025, 3, 25)  # not the last-menstruation date
    assert o["uterus_length"].value == 47 and o["uterus_length"].converted and o["uterus_length"].unit == "mm"
    assert o["endometrium"].value == 5.5 and o["cervix_width"].value == 22
    assert (o["ovary_r_length"].value, o["ovary_l_width"].value, o["follicle_l_mm"].value) == (34, 25, 8)
    assert o["follicles_l"].value == 10 and o["follicles_l"].original_value == "9-10" and o["follicles_r"].value == 9
    assert len(o) == 14


# ----------------------------------------------------------------------------------------------- conclusion
def test_conclusion_example_features():
    p = parse_conclusion(docx_text((EXAMPLES / "cardioai_conclusion_example.docx").read_bytes()))
    n = p["numeric"]
    assert n["age"] == 37 and n["height_cm"] == 162 and n["bmi"] == 21.7 and n["lvef"] == 71
    assert (n["bp_arm_dex_upper"], n["bp_arm_dex_lower"], n["bp_arm_sin_upper"], n["bp_arm_sin_lower"]) == (100, 65, 90, 60)
    assert (n["bp_leg_dex_upper"], n["bp_leg_sin_upper"]) == (95, 85)
    assert (n["lpi_dex"], n["lpi_sin"]) == (0.95, 0.94)
    assert n["creatinine"] == 82.2  # first mention, not «Клиренс креатинина» and not the later 95,3
    assert (n["gfr_ckd_epi"], n["creatinine_clearance_cg"]) == (79.08, 75.26)
    c = p["categorical"]
    assert c["gender"] == "female" and c["radial_pulse"] == "ослаблена" and c["heredity"] == "ИБС, АГ" and c["heart_sounds"] == "ослабленная звучность"
    assert [v["date"] for v in p["visits"]] == ["2021-06-13", "2021-07-05", "2021-09-04"]
    assert p["visits"][1]["heart_rate"] == 80 and p["visits"][1]["bp_arm_sin_upper"] == 95
    labs = {r["date"]: r for r in p["labs"]}
    assert labs["2021-08-23"]["creatinine"] == 95.3 and labs["2021-09-04"]["gfr_ckd_epi"] == 65.67
    assert p["diagnosis"]["document_label"] == 0
    assert [d for d, _ in visit_rows(p)][0] == "2021-06-13"


def test_example_docx_is_deidentified():
    text = docx_text((EXAMPLES / "cardioai_conclusion_example.docx").read_bytes())
    for bad in ("1984", "Абдрахман", "ЖылуСбыт"):
        assert bad not in text
    names = zipfile.ZipFile(EXAMPLES / "cardioai_conclusion_example.docx").namelist()
    assert not any(x.startswith("word/media") or x.startswith("docProps") for x in names)


def test_conclusion_rejects_other_files():
    for data in (b"not a zip", _docx("Просто текст без давления")):
        try:
            parse_conclusion(docx_text(data))
            raise AssertionError("expected ConclusionError")
        except ConclusionError:
            pass


def _docx(text):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                   + "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in text.split("\n")) + "</w:body></w:document>")
    return buf.getvalue()


# ----------------------------------------------------------------------------------------------- API
def test_examples_api_idempotent_private_and_charted(api):  # noqa: F811
    listed = api.get("/api/maternal/labs/examples").json()
    assert {"biochem_photo", "pelvic_us"} <= {x["key"] for x in listed} and all(x["document_id"] is None for x in listed)
    r = api.post("/api/maternal/labs/examples/pelvic_us")
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["status"] == "verified" and doc["example"] and doc["summary"]["conclusion"].startswith("Мультифолликулярная")
    assert api.get(f"/api/maternal/labs/documents/{doc['id']}/file").content.startswith(b"%PDF")
    again = api.post("/api/maternal/labs/examples/pelvic_us")
    assert again.status_code == 200 and again.json()["id"] == doc["id"]
    assert api.post("/api/maternal/labs/examples/biochem_photo").status_code == 201
    series = api.get("/api/maternal/labs/timeline").json()["series"]
    assert series["uterus_length"][0]["value"] == 47 and series["hba1c"][0]["value"] == 5.43
    alerts = api.get("/api/maternal/labs/timeline").json()["alerts"]
    assert any(a["test"] == "apob" and a["code"] == "out_of_range" for a in alerts)
    assert api.post("/api/maternal/labs/examples/nope").status_code == 404
    api.as_user(api.other)
    assert api.get("/api/maternal/labs/documents").json() == []
    assert api.get(f"/api/maternal/labs/documents/{doc['id']}/file").status_code == 404


def test_hypertension_uses_same_day_biochemistry(api):  # noqa: F811
    api.post("/api/maternal/labs/examples/biochem_photo")
    for code, value in [("bp_sys", 118), ("bp_dia", 76)]:
        api.post("/api/maternal/labs/observations", json={"code": code, "value": value, "unit": "mmHg", "specimen_date": "2026-07-25"})
    row = api.get("/api/maternal/labs/hypertension?arm=left").json()["rows"][0]
    assert {"creatinine", "urea", "glucose", "alt", "ast", "de_ritis_index"} <= set(row["features_used"])
    assert row["model"]["numeric_supplied"] == 9


def test_cardioai_example_and_upload(api):  # noqa: F811
    ex = api.get("/api/maternal/labs/cardioai/example")
    assert ex.status_code == 200, ex.text
    body = ex.json()
    assert body["prediction"]["stage"] in (0, 1, 2, 3) and abs(sum(c["share"] for c in body["prediction"]["class_shares"]) - 1) < 1e-6
    assert body["features"]["numeric_supplied"] == 33 and body["features"]["numeric_total"] == 40
    assert len(body["per_visit"]) == 3 and body["stored"] is False
    data = api.get("/api/maternal/labs/cardioai/example.docx").content
    up = api.post("/api/maternal/labs/cardioai/conclusion", files={"file": ("c.docx", data, "application/octet-stream")})
    assert up.status_code == 200 and up.json()["prediction"] == body["prediction"]
    assert api.post("/api/maternal/labs/cardioai/conclusion", files={"file": ("c.docx", b"hello", "text/plain")}).status_code == 415
    bad = api.post("/api/maternal/labs/cardioai/conclusion", files={"file": ("c.docx", _docx("Нет данных"), "application/octet-stream")})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "not_conclusion"
    assert api.get("/api/maternal/labs/documents").json() == []  # nothing stored


def test_add_all_examples_series(api):  # noqa: F811
    total = len(api.get("/api/maternal/labs/examples").json())
    assert total == 24
    assert api.post("/api/maternal/labs/examples").json() == {"created": 24, "total": 24}
    assert api.post("/api/maternal/labs/examples").json()["created"] == 0
    series = api.get("/api/maternal/labs/timeline").json()["series"]
    assert len(series["hba1c"]) == 6 and len(series["uterus_length"]) == 6 and len(series["follicles_l"]) == 6
    assert len(series["hb"]) == 6 and len(series["tsh"]) == 3 and len(series["urine_sg"]) == 3
    ferritin = [p["value"] for p in series["ferritin"]]
    assert ferritin == sorted(ferritin, reverse=True)  # iron stores are used up through pregnancy
    docs = api.get("/api/maternal/labs/documents").json()
    assert all(d["status"] == "verified" and d["example"] for d in docs)
    assert all(o["confidence"] == 1.0 for d in docs for o in d["observations"])


def test_hc18_model_on_held_out_samples(api):  # noqa: F811
    from services.hc_engine import hadlock_ga_weeks, info
    assert hadlock_ga_weeks(175) == 20.0 and hadlock_ga_weeks(20) is None
    if not info()["ready"]:
        return
    samples = api.get("/api/maternal/labs/hc/samples").json()
    assert samples
    errors = []
    for s in samples:
        r = api.post("/api/maternal/labs/hc/measure", data={"sample": s["filename"]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["overlay_png"] and body["hc_mm"] > 0
        errors.append(abs(body["hc_mm"] - s["reference_hc_mm"]))
    assert sum(errors) / len(errors) < 6  # mm, held-out images
    blank = api.post("/api/maternal/labs/hc/measure", files={"file": ("x.png", b"not an image", "image/png")})
    assert blank.status_code == 422


def test_phenotype_matches_sklearn_and_names_fit_centres():
    import json as _json
    from services.cardioai import ROOT, load_phenotype, phenotype
    m, cols = load_phenotype()
    ref = _json.loads((ROOT / "phenotype_reference.json").read_text())
    assert [phenotype(dict(zip(cols, r)))["cluster"] for r in ref["rows"]] == ref["labels"]
    z = {c: m["center_z"][:, i] for i, c in enumerate(cols)}
    assert z["bp_arm_dex_upper"][0] > 0.5 and z["bp_arm_dex_upper"][1] < -0.5  # 0: pressure above, 1: below average
    assert z["creatinine"][2] > 0.5 and z["gfr_ckd_epi"][2] < -0.5               # 2: renal profile
    p = parse_conclusion(docx_text((EXAMPLES / "cardioai_conclusion_example.docx").read_bytes()))
    r = phenotype(p["numeric"])
    assert r["cluster"] == 1 and abs(sum(c["closeness"] for c in r["clusters"]) - 1) < 0.01
    assert not any(k["name"].startswith("Unnamed") for c in r["clusters"] for k in c["key_features"])


def test_generated_demo_documents_read_back_exactly():
    """Every realistic demo layout, with random data, is read back by the same pipeline as an upload."""
    import random

    from services import demo_reports as dr
    from services.lab_extraction import extract_text
    day = date(2026, 11, 7)
    for seed in range(4):
        for kind in ("cbc", "biochem", "ogtt", "thyroid", "urine"):
            _, _, rows = dr.lab_rows(kind, random.Random(seed))
            text, method, _ = extract_text(dr.render_lab_pdf(kind, day, random.Random(seed)), "application/pdf")
            res = parse_text(text, method)
            assert res.specimen_date == day and len(res.observations) == len(rows), (kind, seed)
        v = dr.pelvic_values(random.Random(seed))
        res = parse_text(*extract_text(dr.render_pelvic_pdf(day, v), "application/pdf")[:2])
        got = {o.code: o.value for o in res.observations}
        assert len(got) == 14 and got["uterus_length"] == round(v["ul"] * 10, 3) and got["follicle_r_mm"] == round(v["rmm"] * 10, 3)
        f = dr.fetal_values(random.Random(seed))
        res = parse_text(*extract_text(dr.render_fetal_pdf(day, f), "application/pdf")[:2])
        assert {o.code: o.value for o in res.observations} == {"bpd": f["bpd"], "hc": f["hc"], "ac": f["ac"], "fl": f["fl"], "efw": f["efw"], "afi": f["afi"]}


def test_generated_conclusions_follow_the_1docx_template():
    import random

    from services import demo_reports as dr
    for profile, stage in (("normal", 0), ("ag1", 1), ("ag2", 2), ("ag3", 3)):
        p = parse_conclusion(docx_text(dr.text_to_docx(dr.conclusion_text(profile, random.Random(stage)))))
        assert p["diagnosis"]["document_label"] == stage and len(p["numeric"]) >= 30 and len(p["visits"]) == 3
        lo, hi = dr.PROFILES[profile]["sys"]
        assert lo <= p["numeric"]["bp_arm_dex_upper"] <= hi
