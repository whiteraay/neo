"""Cardiology conclusion (.docx, «Медицинское заключение») -> CardioAI feature row, visit dynamics and labels.

CardioAI (services/cardioai.py) was trained on rows that an LLM extracted from exactly this kind of document
(cardioai_reference/tools/prompts_extract.py). Here the same fields are read with fixed regular expressions, on the
server, so the document never leaves it. Rules mirror the original prompt:
  * the FIRST mention of a value is used for the model row ("Всегда используй первое упоминание значения");
  * a field that is not written in the text stays missing (the model then uses its training mean / "unknown");
  * free-text fields the LLM used to summarise (complaints, echo text, ...) are not reproduced and stay "unknown".
Later dated visits and repeat labs are returned separately for charts. Nothing here is a diagnosis.
"""
from __future__ import annotations

import io
import re
import zipfile
from datetime import date
from xml.etree import ElementTree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
MAX_XML = 5 * 1024 * 1024
NUM = r"(\d+(?:[.,]\d+)?)"

NUMERIC_LABELS = {
    "age": "Возраст, лет", "height_cm": "Рост, см", "weight_kg": "Вес, кг", "bmi": "ИМТ, кг/м²", "respiratory_rate": "ЧДД, /мин",
    "heart_rate": "ЧСС, уд/мин", "pulse": "Пульс, уд/мин",
    "bp_arm_dex_upper": "АД правая рука, сист.", "bp_arm_dex_lower": "АД правая рука, диаст.",
    "bp_arm_sin_upper": "АД левая рука, сист.", "bp_arm_sin_lower": "АД левая рука, диаст.",
    "bp_leg_dex_upper": "АД правая нога, сист.", "bp_leg_dex_lower": "АД правая нога, диаст.",
    "bp_leg_sin_upper": "АД левая нога, сист.", "bp_leg_sin_lower": "АД левая нога, диаст.",
    "lpi_dex": "ЛПИ справа", "lpi_sin": "ЛПИ слева", "lvef": "ФВ ЛЖ, %", "total_protein": "Общий белок, г/л",
    "ldl": "ЛПНП, ммоль/л", "hdl": "ЛПВП, ммоль/л", "alt": "АЛТ, Ед/л", "ast": "АСТ, Ед/л", "de_ritis_index": "Индекс де Ритиса",
    "total_cholesterol": "Общий ХС, ммоль/л", "triglycerides": "ТГ, ммоль/л", "glucose": "Глюкоза, ммоль/л", "urea": "Мочевина, ммоль/л",
    "creatinine": "Креатинин, мкмоль/л", "inr": "МНО", "pti": "ПТИ, %", "gfr_ckd_epi": "рСКФ CKD-EPI, мл/мин/1,73 м²",
    "creatinine_clearance_cg": "Клиренс креатинина (Кокрофт–Голт), мл/мин",
}
# numeric fields that the original LLM row also kept as text columns (they are in categorical_cols.json too)
NUMERIC_AS_TEXT = ["bmi", "lpi_dex", "lpi_sin", "total_protein", "ldl", "hdl", "alt", "ast", "de_ritis_index", "total_cholesterol", "triglycerides",
                   "glucose", "urea", "creatinine", "inr", "creatinine_clearance_cg"]


class ConclusionError(ValueError):
    pass


# ----------------------------------------------------------------------------------------------- docx -> text
def docx_text(data: bytes) -> str:
    """Paragraph text of word/document.xml (tables included). Rejects non-docx and oversized XML."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        info = z.getinfo("word/document.xml")
    except (zipfile.BadZipFile, KeyError):
        raise ConclusionError("not_docx") from None
    if info.file_size > MAX_XML:
        raise ConclusionError("too_large")
    xml = z.read(info)
    if b"<!DOCTYPE" in xml[:2048] or b"<!ENTITY" in xml:
        raise ConclusionError("not_docx")
    root = ElementTree.fromstring(xml)
    lines = []
    for p in root.iter(f"{W}p"):
        parts = []
        for node in p.iter():
            if node.tag == f"{W}t" and node.text:
                parts.append(node.text)
            elif node.tag == f"{W}tab":
                parts.append("\t")
            elif node.tag in (f"{W}br", f"{W}cr"):
                parts.append("\n")
        lines.append("".join(parts))
    return "\n".join(lines)


# ----------------------------------------------------------------------------------------------- helpers
def _f(s: str) -> float:
    return float(s.replace(",", "."))


def _date(s: str) -> date | None:
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})", s)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return date(y + 2000 if y < 100 else y, mo, d)
    except ValueError:
        return None


def _snip(text: str, m: re.Match, pad: int = 25) -> str:
    a, b = max(0, m.start() - pad), min(len(text), m.end() + pad)
    return re.sub(r"\s+", " ", text[a:b]).strip()


def _first(text: str, pattern: str, flags=re.I):
    return re.search(pattern, text, flags)


def _bp_pairs(chunk: str) -> list[tuple[str, int, int, re.Match]]:
    """«АДdex 100|65», «АД sin 90/60» -> [(side, sys, dia, match)] in text order."""
    out = []
    for m in re.finditer(r"АД\s*(dex|sin)\.?\s*(\d{2,3})\s*[|/\\]\s*(\d{2,3})", chunk, re.I):
        out.append((m.group(1).lower(), int(m.group(2)), int(m.group(3)), m))
    return out


def _vitals(chunk: str) -> tuple[dict, dict]:
    """Weight, HR, pulse and limb pressures from one exam paragraph -> (values, source snippets)."""
    v: dict = {}
    s_: dict = {}
    for key, pat in (("weight_kg", rf"Вес\s*{NUM}\s*кг"), ("heart_rate", r"ЧСС\s*(\d{2,3})"), ("pulse", r"Пульс\s*(\d{2,3})")):
        m = _first(chunk, pat)
        if m:
            v[key] = _f(m.group(1))
            s_[key] = _snip(chunk, m)
    legs_at = re.search(r"на\s+ногах", chunk, re.I)
    for side, sys_, dia, m in _bp_pairs(chunk):
        limb = "leg" if legs_at and m.start() > legs_at.start() else "arm"
        for part, val in (("upper", sys_), ("lower", dia)):
            key = f"bp_{limb}_{side}_{part}"
            if key not in v:
                v[key] = val
                s_[key] = ("на ногах: " if limb == "leg" else "") + _snip(chunk, m, 0)
    return v, s_


def _gender(nationality: str | None) -> str:
    if not nationality:
        return "unknown"
    w = nationality.lower()
    if re.search(r"(ка|ая|яя)$", w):
        return "female"
    if re.search(r"(ий|ый|ой|ин|ец|ах|ек|ик|ан|ен)$", w):
        return "male"
    return "unknown"


# ----------------------------------------------------------------------------------------------- parse
def parse_conclusion(text: str) -> dict:
    t = text.replace(" ", " ")
    paras = [p.strip() for p in t.split("\n") if p.strip()]
    if not re.search(r"заключени|қорытынды", t, re.I) or not _bp_pairs(t):
        raise ConclusionError("not_conclusion")
    num: dict[str, float] = {}
    raw: dict[str, str] = {}      # value as printed (for the text columns of the original row)
    src: dict[str, str] = {}

    def put(key, m, group=1, conv=_f):
        if key in num or not m:
            return
        num[key] = conv(m.group(group))
        raw[key] = m.group(group)
        src[key] = _snip(t, m)

    put("age", _first(t, r"\((\d{1,3})\s*(?:лет|года|год)\)") or _first(t, r"возраст\w*[:\s]*(\d{1,3})"), conv=int)
    put("height_cm", _first(t, rf"Рост\s*{NUM}\s*см"))
    put("weight_kg", _first(t, rf"Вес\s*{NUM}\s*кг"))
    put("bmi", _first(t, rf"ИМТ\s*{NUM}"))
    put("respiratory_rate", _first(t, r"ЧДД\s*(\d{1,2})"))
    put("heart_rate", _first(t, r"ЧСС\s*(\d{2,3})"))
    put("pulse", _first(t, r"Пульс\s*(\d{2,3})"))
    put("lpi_dex", _first(t, rf"ЛПИ\s*dex\s*[=:]?\s*{NUM}"))
    put("lpi_sin", _first(t, rf"ЛПИ\s*sin\s*[=:]?\s*{NUM}"))
    put("lvef", _first(t, rf"ФВ\s*ЛЖ\s*{NUM}\s*%"))
    put("total_protein", _first(t, rf"общий белок\s*[–-]?\s*{NUM}"))
    put("ldl", _first(t, rf"ЛПНП\s*[–-]?\s*{NUM}"))
    put("hdl", _first(t, rf"ЛПВП\s*[–-]?\s*{NUM}"))
    put("alt", _first(t, rf"АЛТ\s*[–-]?\s*{NUM}"))
    put("ast", _first(t, rf"АСТ\s*[–-]?\s*{NUM}"))
    put("de_ritis_index", _first(t, rf"де\s*Ритиса\s*[–-]?\s*{NUM}"))
    put("total_cholesterol", _first(t, rf"общий\s*(?:ХС|холестерин)\s*[–-]?\s*{NUM}"))
    put("triglycerides", _first(t, rf"(?<![А-Яа-я])ТГ\s*[–-]?\s*{NUM}"))
    put("glucose", _first(t, rf"глюкоза\s*[–-]?\s*{NUM}"))
    put("urea", _first(t, rf"мочевина\s*[–-]?\s*{NUM}"))
    put("creatinine", _first(t, rf"креатинин\s*[–-]?\s*{NUM}"))
    put("inr", _first(t, rf"МНО\s*[–-]?\s*{NUM}"))
    put("pti", _first(t, rf"ПТИ\s*[–-]?\s*{NUM}"))
    put("gfr_ckd_epi", _first(t, rf"СКФ\s*по\s*CKD-EPI\s*[≊≈=~]?\s*{NUM}"))
    put("creatinine_clearance_cg", _first(t, rf"Кокрофта[-–\s]*Голта\s*[≊≈=~]?\s*{NUM}"))

    # visits: the exam paragraph is the first visit; later paragraphs that start with a date and carry vitals are repeat visits
    dates_line = _first(t, r"Қабылдау күні[^\n]*") or _first(t, r"Дата при[её]ма[^\n]*")
    visit_dates = [d for d in (_date(x) for x in re.findall(r"\d{1,2}\.\d{1,2}\.\d{2,4}", dates_line.group(0) if dates_line else "")) if d]
    exam = next((p for p in paras if re.search(r"Объектив", p, re.I) and _bp_pairs(p)), None) or next(p for p in paras if _bp_pairs(p))
    first, first_src = _vitals(exam)
    for key, val in first.items():
        if key.startswith("bp_") and key not in num:
            num[key] = val
            raw[key] = str(int(val))
            src[key] = first_src[key]
    visits = [{"date": visit_dates[0].isoformat() if visit_dates else None, **first}]
    for p in paras:
        m = re.match(r"(\d{1,2}\.\d{1,2}\.\d{2,4})\s*[–—-]", p)
        if m and p is not exam and (_bp_pairs(p) or re.search(r"ЧСС|Вес", p)):
            d = _date(m.group(1))
            v, _ = _vitals(p)
            if d and v:
                visits.append({"date": d.isoformat(), **v})
    visits = [v for v in visits if v["date"]]
    visits.sort(key=lambda v: v["date"])

    # dated blood chemistry and kidney function
    labs: dict[str, dict] = {}
    for m in re.finditer(r"Б\s*[\\/]\s*х\s*крови\s*\((\d{1,2}\.\d{1,2}\.\d{2,4})\)([^\n]*)", t, re.I):
        d = _date(m.group(1))
        body = re.split(r"Б\s*[\\/]\s*х\s*крови\s*\(", m.group(2), maxsplit=1, flags=re.I)[0]
        row = {}
        for key, pat in (("creatinine", rf"креатинин\s*[–-]?\s*{NUM}"), ("urea", rf"мочевина\s*[–-]?\s*{NUM}"), ("glucose", rf"глюкоза\s*[–-]?\s*{NUM}"),
                         ("total_cholesterol", rf"общий\s*ХС\s*{NUM}"), ("ldl", rf"ЛПНП\s*{NUM}"), ("hdl", rf"ЛПВП\s*{NUM}"), ("triglycerides", rf"ТГ\s*{NUM}")):
            mm = re.search(pat, body, re.I)
            if mm:
                row[key] = _f(mm.group(1))
        if d and row:
            labs.setdefault(d.isoformat(), {}).update(row)
    gfr = list(re.finditer(rf"СКФ\s*по\s*CKD-EPI\s*[≊≈=~]?\s*{NUM}[^(\n]*\((\d{{1,2}}\.\d{{1,2}}\.\d{{2,4}})", t, re.I))
    for i, m in enumerate(gfr):
        d = _date(m.group(2))
        end = gfr[i + 1].start() if i + 1 < len(gfr) else len(t)
        cg = re.search(rf"Кокрофта[-–\s]*Голта\s*[≊≈=~]?\s*{NUM}", t[m.end():end], re.I)
        if d:
            row = labs.setdefault(d.isoformat(), {})
            row["gfr_ckd_epi"] = _f(m.group(1))
            if cg:
                row["creatinine_clearance_cg"] = _f(cg.group(1))
    lab_rows = [{"date": k, **v} for k, v in sorted(labs.items())]

    # categorical columns, in the vocabulary of the original extraction prompt
    cat: dict[str, str] = {}
    csrc: dict[str, str] = {}

    def cput(key, value, m):
        if key not in cat and value and m:
            cat[key] = value
            csrc[key] = _snip(t, m)

    m = _first(t, r"Национальность\)?\s*:?\s*([А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі-]{3,})")
    nationality = m.group(1).lower() if m else None
    cput("nationality", nationality, m)
    cput("gender", _gender(nationality) if nationality and _gender(nationality) != "unknown" else None, m)
    m = _first(t, r"«?Д»?\s*учет\w*\s+состоит\s+(у\s+[\w-]+)")
    cput("on_d_register", "да", m)
    cput("d_register_place", m.group(1) if m else None, m)
    m = _first(t, r"в\s+(планов|экстренн)\w*\s+порядке")
    cput("visit_type", ("планово" if m.group(1).lower().startswith("план") else "экстренно") if m else None, m)
    m = _first(t, r"\btbs\b[^.]{0,60}?отрица")
    cput("tbs", "отрицает", m)
    m = _first(t, r"Боткина\s+отрица")
    cput("botkin_disease", "отрицает", m)
    for key, word in (("hemotransfusions", r"Гемотрансфузи\w*"), ("blood_donation", r"Донорство крови")):
        m = _first(t, rf"{word}\s*[–—:-]?\s*(не было|нет|отрица\w*|было|есть)")
        cput(key, ("отрицает" if re.match(r"не было|нет|отрица", m.group(1), re.I) else "есть") if m else None, m)
    m = _first(t, r"Вредные привычки\s*[–—:-]?\s*(нет|отрица\w*|курени\w*|алкогол\w*)")
    cput("bad_habits", ("нет" if m and re.match(r"нет|отрица", m.group(1), re.I) else m.group(1).lower()) if m else None, m)
    m = _first(t, r"Наследственность([^.]*(?:\.[^.]*){0,1})")
    if m:
        found = [x for x in ("ИБС", "АГ", "СД", "ОНМК", "ИМ", "ХСН") if re.search(rf"(?<![А-Я]){x}(?![А-Я])", m.group(1))]
        cput("heredity", ", ".join(found) if found else ("нет" if re.search(r"не отягощ|нет", m.group(1), re.I) else None), m)
    m = _first(t, r"лучевых артериях\s*[–—:-]?\s*(ослаблен\w*|симметрич\w*)")
    cput("radial_pulse", ("ослаблена" if m.group(1).lower().startswith("ослаб") else "симметрична") if m else None, m)
    m = _first(t, r"dorsalis\s*pedis\s*[–—:-]?\s*(симметрич\w*|ослаблен\w*)")
    cput("a_dorsalis_pedis", ("симметрична" if m.group(1).lower().startswith("симм") else "ослаблена") if m else None, m)
    m = _first(t, r"Периферическ\w*\s+отек\w*\s+(нет|есть)|отеки\s+(нет|есть)")
    cput("peripheral_edema", (m.group(1) or m.group(2)).lower() if m else None, m)
    m = _first(t, r"дыхание\s+везикулярное(,?\s*с\s*жестк\w*)?")
    cput("breath", ("да" if m.group(1) else "нет") if m else None, m)
    m = _first(t, r"хрипы\s+(не\s+выслушива\w*|нет|выслушива\w*|есть)")
    cput("rales", ("нет" if re.match(r"не|нет", m.group(1), re.I) else "есть") if m else None, m)
    m = _first(t, r"пальпации\s+(болезненност\w*|безболезнен\w*)")
    cput("palpation_tenderness", ("болезненность" if m.group(1).lower().startswith("болезн") else "нет") if m else None, m)
    m = _first(t, r"Тоны сердца\s+(ослабленн\w*|приглушенн\w*|достаточн\w*|ясн\w*)")
    cput("heart_sounds", ("ослабленная звучность" if re.match(r"ослаб|приглуш", m.group(1), re.I) else "достаточная звучность") if m else None, m)
    m = _first(t, r"(?<!нет\s)систолический шум")
    cput("systolic_murmur", "есть" if m and not re.search(r"шум\w*\s+не\s", t[m.start():m.end() + 10], re.I) else None, m)
    m = _first(t, r"Стул\s+(регулярн\w*|запор\w*)")
    cput("stool", ("регулярный" if m.group(1).lower().startswith("регул") else "запоры") if m else None, m)
    m = _first(t, r"Мочеиспускание\s+(свободн\w*|затруднен\w*|учащен\w*)")
    cput("urination", ("нормальное" if m.group(1).lower().startswith("свобод") else "не нормальное") if m else None, m)
    m = _first(t, r"Т3\s*своб\w*[^–—-]*[–—-]\s*(норма)")
    cput("t3_free", "норма" if m else None, m)
    m = _first(t, r"анти\s*ТПО[^–—-]*[–—-]\s*(норма)")
    cput("anti_tpo", "норма" if m else None, m)
    for key in NUMERIC_AS_TEXT:
        if key in raw:
            cat.setdefault(key, raw[key])
            csrc.setdefault(key, src[key])

    def section(pattern):
        m = re.search(pattern + r"\s*:?\s*([^\n]+)", t, re.I)
        return re.sub(r"\s+", " ", m.group(1)).strip() if m else None

    prelim = section(r"\(Предварительный диагноз\)")
    final = section(r"\(Заключительный диагноз\)")
    stage = re.search(r"гипертенз\w*\s*(\d)", (prelim or "").lower())
    label = int(stage.group(1)) if stage and stage.group(1) in "123" else 0
    return {
        "numeric": num, "numeric_sources": src, "categorical": cat, "categorical_sources": csrc,
        "visits": visits, "labs": lab_rows, "age": num.get("age"), "gender": cat.get("gender", "unknown"),
        "diagnosis": {"preliminary": prelim, "final": final, "document_label": label},
    }


def visit_rows(parsed: dict) -> list[tuple[str, dict]]:
    """Model rows per visit: the document row with that visit's vitals and that day's labs on top."""
    labs = {r["date"]: r for r in parsed["labs"]}
    out = []
    for v in parsed["visits"]:
        row = dict(parsed["numeric"])
        row.update({k: val for k, val in v.items() if k != "date"})
        for k, val in labs.get(v["date"], {}).items():
            if k != "date":
                row[k] = val
        out.append((v["date"], row))
    return out
