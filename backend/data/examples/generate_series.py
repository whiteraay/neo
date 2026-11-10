"""Generate the example series that surround the two de-identified real documents and write manifest.json.

Generated reports (synthetic: true in the manifest) repeat the layout and test set of the real ones so the charts show
a trend: blood biochemistry through the pregnancy of the demo mother (LMP ≈ 06.04.2026) and pelvic ultrasound in the
two years before it. Values follow the usual direction of change in pregnancy (urea and creatinine fall, apolipoproteins
rise, ferritin is used up) — they are illustrative, not anyone's results. No laboratory brand is printed on them.

    docker exec <backend> python data/examples/generate_series.py     (needs reportlab + the DejaVu font)
"""
import json
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

BIO_TESTS = [  # name as printed, unit, reference
    ("Мочевина", "ммоль/л", "2,80 - 7,20"), ("Креатинин", "мкмоль/л", "45,00 - 84,00"), ("Мочевая кислота", "мкмоль/л", "154,7 - 357,0"),
    ("Глюкоза", "ммоль/л", "4,10 - 5,90"), ("Аланинаминотрансфераза (АЛТ)", "Ед/л", "< 35,00"), ("Аспартатаминотрансфераза (АСТ)", "Ед/л", "< 35"),
    ("Гликозилированный гемоглобин", "%", "4,80 - 5,90"), ("Аполипопротеин А1", "г/л", "1,08 - 2,25"), ("Аполипопротеин В", "г/л", "0,60 - 1,17"),
    ("Фолиевая кислота", "нг/мл", "3,10 - 20,50"), ("Ферритин", "нг/мл", "10,00 - 120,00"),
]
BIO = {  # date: values in BIO_TESTS order
    "2026-05-27": [4.60, 68.0, 245.0, 4.52, 12.4, 19.8, 5.31, 1.58, 0.62, 9.80, 34.5],
    "2026-06-24": [4.20, 61.0, 218.0, 4.39, 10.1, 18.6, 5.28, 1.71, 0.66, 12.4, 28.7],
    "2026-08-26": [3.60, 55.0, 205.0, 4.31, 9.30, 17.9, 5.24, 1.88, 0.74, 11.6, 16.8],
    "2026-09-30": [3.40, 53.0, 232.0, 4.44, 11.2, 19.2, 5.29, 2.02, 0.86, 10.9, 13.1],
    "2026-10-28": [3.50, 57.0, 268.0, 4.61, 12.8, 20.4, 5.36, 2.11, 0.97, 9.70, 11.4],
}
PELVIC = {  # date: (uterus L, AP, W, endometrium mm, cervix L, W, R ovary L, W, follicles, size mm, L ovary L, W, follicles, size mm, LMP, conclusion)
    "2024-09-18": (46, 34, 37, 4.8, 24, 21, 33, 27, 10, 6, 35, 24, 11, 7, "2024-09-12", "Мультифолликулярная структура яичников."),
    "2024-12-11": (47, 35, 38, 9.6, 25, 22, 34, 28, 9, 7, 36, 25, 10, 8, "2024-11-29", "Мультифолликулярная структура яичников."),
    "2025-06-17": (47, 35, 38, 6.2, 25, 22, 33, 27, 8, 8, 35, 25, 9, 7, "2025-06-09", "Мультифолликулярная структура яичников."),
    "2025-10-22": (48, 36, 39, 7.4, 25, 22, 32, 26, 7, 9, 34, 24, 8, 8, "2025-10-13", "Эхографических признаков патологии органов малого таза не выявлено."),
    "2026-02-11": (48, 36, 39, 5.1, 26, 22, 31, 25, 6, 10, 33, 23, 7, 9, "2026-02-04", "Эхографических признаков патологии органов малого таза не выявлено."),
}

CBC_TESTS = [("Гемоглобин (HGB)", "г/л", "110 - 150", 0), ("Эритроциты (RBC)", "10^12/л", "3,5 - 5,0", 2), ("Лейкоциты (WBC)", "10^9/л", "4,0 - 11,0", 1),
             ("Тромбоциты (PLT)", "10^9/л", "150 - 400", 0), ("Гематокрит (HCT)", "%", "33 - 45", 1), ("Средний объем эритроцита (MCV)", "фл", "80 - 100", 0)]
CBC = {  # haemodilution through pregnancy: Hb/HCT fall, WBC rises, platelets drift down
    "2026-05-13": [128, 4.35, 7.2, 265, 38.4, 88], "2026-06-10": [124, 4.21, 7.9, 258, 37.2, 88], "2026-07-08": [118, 4.02, 8.6, 249, 35.6, 89],
    "2026-08-05": [113, 3.86, 9.1, 238, 34.1, 90], "2026-09-02": [109, 3.78, 9.6, 231, 33.2, 91], "2026-09-30": [112, 3.84, 9.9, 226, 33.8, 91],
}
THYROID_TESTS = [("ТТГ", "мМЕ/л", "0,4 - 4,0", 2), ("Т4 свободный", "пмоль/л", "10,0 - 22,0", 1)]
THYROID = {"2026-05-20": [1.20, 15.8], "2026-07-15": [1.90, 14.1], "2026-09-23": [2.30, 13.2]}  # TSH rises after the first trimester
URINE = {  # date: (protein, specific gravity, white cells, red cells)
    "2026-05-20": ("не обнаружен", "1018", "2-3", "0-1"), "2026-07-15": ("не обнаружен", "1021", "1-2", "0-1"), "2026-09-23": ("следы", "1016", "3-4", "0-2"),
}
FINDINGS = ["Матка не увеличена, положение anteflexio", "Контуры матки ровные, чёткие; миометрий однородный",
            "Эндометрий: эхогенность в норме; полость матки сомкнута", "Цервикальный канал не расширен; кист шейки нет",
            "Яичники расположены обычно", "Маточные трубы не расширены; варикоза параметрия нет",
            "Лимфоузлы не визуализируются; свободной жидкости в малом тазу нет"]


def ru(d: str) -> str:
    y, m, dd = d.split("-")
    return f"{dd}.{m}.{y}"


def num(v: float, nd: int = 2) -> str:
    return f"{v:.{nd}f}".replace(".", ",")


def cm(mm: float) -> str:
    return num(mm / 10, 2).rstrip("0").rstrip(",") if mm % 10 else num(mm / 10, 1)


def pdf(lines: list[tuple[str, str]], title: str) -> bytes:
    """lines: (style, text) with style in h1/h2/row/text/small. Rows are tab-separated columns."""
    import io

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    from services.patient_card import register_pdf_fonts
    font, bold = register_pdf_fonts()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(title); c.setAuthor(""); c.setCreator(""); c.setProducer("")
    w, h = A4
    y = h - 56
    cols = [48, 250, 330, 410]
    for style, text in lines:
        if style == "h1":
            c.setFont(bold, 13); c.drawString(48, y, text); y -= 22
        elif style == "h2":
            c.setFont(bold, 11); c.drawString(48, y, text); y -= 18
        elif style in ("row", "head"):
            c.setFont(bold if style == "head" else font, 9.5)
            for x, part in zip(cols, text.split("\t")):
                c.drawString(x, y, part)
            y -= 16
            if style == "head":
                c.line(48, y + 11, w - 48, y + 11)
        elif style == "small":
            c.setFont(font, 8); c.setFillGray(0.35); c.drawString(48, y, text); c.setFillGray(0); y -= 13
        else:
            c.setFont(font, 10); c.drawString(48, y, text); y -= 15
    c.showPage(); c.save()
    return buf.getvalue()


def lab_pdf(kind: str, day: str, rows: list[tuple]) -> bytes:
    """rows: (name, value with unit, reference). Layout of the lab blank (services/demo_reports.render_lab_pdf)."""
    import random

    from services import demo_reports as dr
    title, material, _ = dr.lab_rows(kind, random.Random(0))
    return dr.render_lab_pdf(kind, date.fromisoformat(day), random.Random(day + kind), rows=(title, material, [(a, b, "", c, "") for a, b, c in rows]))


def pelvic_pdf(day: str, v: tuple) -> bytes:
    """Layout of the pelvic ultrasound protocol (services/demo_reports.render_pelvic_pdf)."""
    from services import demo_reports as dr
    ul, uap, uw, endo, cl, cw, rl, rw, rn, rmm, ll, lw, ln, lmm, lmp, concl = v
    d = date.fromisoformat(day)
    return dr.render_pelvic_pdf(d, {"ul": ul / 10, "uap": uap / 10, "uw": uw / 10, "endo": endo, "cl": cl / 10, "cw": cw / 10, "rl": rl / 10, "rw": rw / 10,
                                    "rn": str(rn), "rmm": rmm / 10, "ll": ll / 10, "lw": lw / 10, "ln": str(ln), "lmm": lmm / 10,
                                    "lmp_days": (d - date.fromisoformat(lmp)).days, "conclusion": concl, "recommendation": "наблюдение гинеколога"})


def main():
    out = HERE / "series"
    out.mkdir(exist_ok=True)
    items = [
        dict(key="biochem_photo", group="biochem", file="biochem_kdl_2026-07-25.jpg", content_type="image/jpeg", text="biochem_kdl_2026-07-25.txt",
             filename="Биохимия_крови_25.07.2026.jpg", laboratory="KDL Олимп", date="2026-07-25", synthetic=False, summary=None),
        dict(key="pelvic_us", group="pelvis", file="pelvic_us_2025-03-25.pdf", content_type="application/pdf", text="pelvic_us_2025-03-25.txt",
             filename="УЗИ_малого_таза_25.03.2025.pdf", laboratory="УЗИ малого таза", date="2025-03-25", synthetic=False,
             summary={"study": "УЗИ органов малого таза, трансабдоминально (SonoAce R7, 3,5 МГц)", "last_menstruation": "2025-03-19",
                      "findings": FINDINGS, "conclusion": "Мультифолликулярная структура яичников.", "recommendation": "Консультация гинеколога"}),
    ]
    for day, vals in BIO.items():
        text = ["Клинико-диагностическая лаборатория", "Биохимический анализ крови. Биоматериал: сыворотка",
                f"Дата забора биоматериала: {ru(day)}", f"Отчет о результатах сформирован: {ru(day)}"]
        rows = []
        for (name, unit, ref), v in zip(BIO_TESTS, vals):
            nd = 1 if name == "Мочевая кислота" else 2
            text.append(f"{name} {num(v, nd)} {unit} {ref}")
            rows.append(("row", f"{name}\t{num(v, nd)} {unit}\t\t{ref}"))
        stem = f"biochem_{day}"
        (out / f"{stem}.txt").write_text("\n".join(text) + "\n", encoding="utf-8")
        (out / f"{stem}.pdf").write_bytes(lab_pdf("biochem", day, [(n, f"{num(v, 1 if n == 'Мочевая кислота' else 2)} {u}", ref) for (n, u, ref), v in zip(BIO_TESTS, vals)]))
        items.append(dict(key=stem, group="biochem", file=f"series/{stem}.pdf", content_type="application/pdf", text=f"series/{stem}.txt",
                          filename=f"Биохимия_крови_{ru(day)}.pdf", laboratory="Клинико-диагностическая лаборатория", date=day, synthetic=True, summary=None))
    for day, v in PELVIC.items():
        ul, uap, uw, endo, cl, cw, rl, rw, rn, rmm, ll, lw, ln, lmm, lmp, concl = v
        meas = [("Длина матки (продольный размер)", f"{cm(ul)} см"), ("Передне-задний размер матки", f"{cm(uap)} см"), ("Ширина матки (поперечный размер)", f"{cm(uw)} см"),
                ("Толщина эндометрия (М-эхо)", f"{cm(endo)} см"), ("Длина шейки матки", f"{cm(cl)} см"), ("Ширина шейки матки", f"{cm(cw)} см"),
                ("Длина правого яичника", f"{cm(rl)} см"), ("Ширина правого яичника", f"{cm(rw)} см"), ("Фолликулы правого яичника (в одном срезе)", f"до {rn}"),
                ("Размер фолликулов правого яичника", f"{cm(rmm)} см"), ("Длина левого яичника", f"{cm(ll)} см"), ("Ширина левого яичника", f"{cm(lw)} см"),
                ("Фолликулы левого яичника (в одном срезе)", f"до {ln}"), ("Размер фолликулов левого яичника", f"{cm(lmm)} см")]
        text = ["УЗИ органов малого таза (трансабдоминально)", f"Дата УЗИ: {ru(day)}", f"Последняя менструация: {ru(lmp)}",
                *[f"{a}: {b}" for a, b in meas], f"Заключение: {concl}", "Рекомендации: наблюдение гинеколога"]
        stem = f"pelvic_us_{day}"
        (out / f"{stem}.txt").write_text("\n".join(text) + "\n", encoding="utf-8")
        (out / f"{stem}.pdf").write_bytes(pelvic_pdf(day, v))
        items.append(dict(key=stem, group="pelvis", file=f"series/{stem}.pdf", content_type="application/pdf", text=f"series/{stem}.txt",
                          filename=f"УЗИ_малого_таза_{ru(day)}.pdf", laboratory="УЗИ малого таза", date=day, synthetic=True,
                          summary={"study": "УЗИ органов малого таза, трансабдоминально", "last_menstruation": lmp, "findings": FINDINGS,
                                   "conclusion": concl, "recommendation": "Наблюдение гинеколога"}))

    def table_report(stem, title, day, rows, group, label, with_ref=lambda name: True):
        text = ["Клинико-диагностическая лаборатория", title, f"Дата забора биоматериала: {ru(day)}", f"Отчет о результатах сформирован: {ru(day)}",
                *[f"{a} {b}" + (f" {c}" if with_ref(a) else "") for a, b, c in rows]]
        (out / f"{stem}.txt").write_text("\n".join(text) + "\n", encoding="utf-8")
        (out / f"{stem}.pdf").write_bytes(lab_pdf(group, day, rows))
        items.append(dict(key=stem, group=group, file=f"series/{stem}.pdf", content_type="application/pdf", text=f"series/{stem}.txt",
                          filename=f"{label}_{ru(day)}.pdf", laboratory="Клинико-диагностическая лаборатория", date=day, synthetic=True, summary=None))

    for kind, tests, data, title, label in (("cbc", CBC_TESTS, CBC, "Общий анализ крови", "Общий_анализ_крови"),
                                            ("thyroid", THYROID_TESTS, THYROID, "Гормоны щитовидной железы", "Гормоны_щитовидной_железы")):
        for day, vals in data.items():
            rows = [(name, f"{num(v, nd) if nd else int(v)} {unit}", ref) for (name, unit, ref, nd), v in zip(tests, vals)]
            table_report(f"{kind}_{day}", title, day, rows, kind, label)
    for day, (prot, sg, wbc, rbc) in URINE.items():
        rows = [("Белок", prot, "не обнаружен"), ("Относительная плотность", sg, "1010 - 1025"), ("Лейкоциты", f"{wbc} в п/зр", "0 - 5"), ("Эритроциты", f"{rbc} в п/зр", "0 - 2")]
        table_report(f"urine_{day}", "Общий анализ мочи", day, rows, "urine", "Общий_анализ_мочи", with_ref=lambda name: name != "Белок")
    items.sort(key=lambda x: (x["group"], x["date"]))
    (HERE / "manifest.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(items), "examples")


if __name__ == "__main__":
    main()
